/**
 * wa-bridge-local / server.js  (Baileys Multi-Device)
 * ---------------------------------------------------------
 * - Baileys ile oturum aç (useMultiFileAuthState; ./auth_info_baileys içine kaydeder)
 * - /send-video : N8N'den tek alıcıya video gönder (STREAM -> /tmp -> buffer)
 * - /send-video-batch : Dizi halinde alıcıları kuyruğa ekle (tek işçi, 2sn aralık)
 * - /send-video-to-contacts-grouped : Forward message sistemi (ilk hedefe upload, diğerlerine forward)
 * - /           : QR görüntüleme sayfası (otomatik yenileme)
 *
 * Notlar:
 * - Baileys forward API kullanır: İlk hedefe normal send, diğerlerine { forward: msg }
 * - Video için buffer kullanılır (base64 YOK)
 * - QR görseli data URL'dir; yalnızca ekranda gösterim
 */
//import dotenv from 'dotenv';
//dotenv.config();
import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream";
import { promisify } from "util";
import QRCode from "qrcode";
import multer from "multer";
import winston from "winston";
import { Boom } from '@hapi/boom';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay,
  Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';
// Persistent disk configuration
import { PATHS, initializePaths, getDiskInfo, checkPathExists } from './config/paths.js';
// ngrok'u dinamik import edeceğiz; paketlenmiş ortamlarda eksikse crash olmasın

const app = express();
const streamPipeline = promisify(pipeline);

// ==== Initialize Persistent Disk Paths ====
initializePaths();
const diskInfo = getDiskInfo();
console.log('[DISK] Persistent storage configuration:', diskInfo);

// ==== ACCESS TOKEN CONFIGURATION ====
// Environment variable'dan token al, yoksa varsayılan kullan
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'default-secure-token-change-me';

console.log('[AUTH] Access token configured:', ACCESS_TOKEN !== 'default-secure-token-change-me' ? '✅ Custom token' : '⚠️  Using default token');

// Session store (basit in-memory)
const activeSessions = new Map();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 saat

// Session temizleme (her 1 saatte bir)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of activeSessions.entries()) {
    if (now > data.expiresAt) {
      activeSessions.delete(sessionId);
      console.log('[AUTH] Expired session removed:', sessionId);
    }
  }
}, 60 * 60 * 1000);

// Token doğrulama middleware
function requireAuth(req, res, next) {
  // API endpoint'leri ve video gönderim endpoint'leri için token kontrolü yapma
  if (req.path.startsWith('/api/') || 
      req.path === '/status' || 
      req.path === '/qr' ||
      req.path === '/send-video' ||
      req.path === '/send-video-batch' ||
      req.path === '/send-video-to-contacts-grouped' ||
      req.path === '/send-video-file') {
    return next();
  }

  // CSS/JS/Assets için token kontrolü yapma
  if (req.path.startsWith('/assets/') || req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/)) {
    return next();
  }

  // Cookie'den session ID al
  const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {}) || {};
  
  const sessionId = cookies.whatsapp_session;

  // Mevcut session var mı kontrol et
  if (sessionId && activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    if (Date.now() < session.expiresAt) {
      // Session geçerli, süreyi uzat
      session.expiresAt = Date.now() + SESSION_DURATION;
      return next();
    } else {
      // Session süresi dolmuş
      activeSessions.delete(sessionId);
    }
  }

  // Query parameter'den token kontrol et (ilk giriş için)
  const queryToken = req.query.token;

  if (queryToken === ACCESS_TOKEN) {
    // Token geçerli, yeni session oluştur
    const newSessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    activeSessions.set(newSessionId, {
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION,
      ip: req.ip
    });

    // Session cookie set et
    res.setHeader('Set-Cookie', `whatsapp_session=${newSessionId}; Path=/; HttpOnly; Max-Age=${SESSION_DURATION / 1000}; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    
    console.log('[AUTH] New session created:', newSessionId);
    return next();
  }

  // Token geçersiz veya yok
  res.status(403).send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Erişim Engellendi</title>
      <style>
        :root{--primary-dark:#001D6C;--primary-medium:#003399;--bg-gradient-start:#EBF5FF;--bg-gradient-end:#E8E9FF;--text-primary:#0F172A;--text-secondary:#475569;--text-white:#FFFFFF;--accent-red:#EF4444;--accent-yellow:#FCD34D;--border-light:#E2E8F0;--radius-lg:16px;--radius-xl:24px;--shadow-neon:0 0 24px -16px rgba(0,29,108,0.25);--shadow-neon-highlight:0 0 40px -12px rgba(0,29,108,0.5)}
        body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,var(--bg-gradient-start) 0%,#FFFFFF 50%,var(--bg-gradient-end) 100%);color:var(--text-primary);display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
        .card{background:linear-gradient(135deg,rgba(0,29,108,0.4) 0%,rgba(0,51,153,0.2) 50%,rgba(0,29,108,0.4) 100%);padding:1px;border-radius:var(--radius-xl);box-shadow:var(--shadow-neon-highlight);max-width:500px;width:100%}
        .card-inner{background:rgba(255,255,255,0.95);backdrop-filter:blur(12px);padding:48px 40px;border-radius:calc(var(--radius-xl) - 1px);text-align:center}
        h1{font-size:64px;margin:0 0 16px;filter:drop-shadow(0 4px 8px rgba(239,68,68,0.3))}
        h2{color:var(--accent-red);font-size:28px;font-weight:700;margin:0 0 16px;letter-spacing:-0.025em}
        p{color:var(--text-secondary);line-height:1.625;margin:0 0 24px;font-size:16px}
        .code{background:linear-gradient(135deg,rgba(0,29,108,0.1) 0%,rgba(0,51,153,0.05) 100%);padding:16px 24px;border-radius:12px;font-family:'Courier New',monospace;color:var(--primary-dark);margin:24px 0;font-weight:600;font-size:15px;border:1px solid var(--border-light)}
        .small-text{font-size:14px;color:var(--text-secondary);font-weight:500}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="card-inner">
          <h1>🔒</h1>
          <h2>Erişim Engellendi</h2>
          <p>Bu sayfaya erişim için geçerli bir yetkilendirme gereklidir.</p>
          <div class="code">403 Forbidden</div>
          <p class="small-text">Yetkili erişim için web sitenizden bağlantıyı kullanın.</p>
        </div>
      </div>
    </body>
    </html>
  `);
}

// ==== Winston Logger Configuration ====
// NOT: Web ortamında (Cloud/Docker) dosya yazma sınırlaması olabilir
// Bu yüzden FILE_LOGS environment variable ile kontrol ediyoruz
const USE_FILE_LOGS = process.env.FILE_LOGS === 'true';

const getLogDirectory = () => {
  return path.join(process.cwd(), 'logs', 'whatsapp-web');
};

// Sadece file logging aktifse klasör oluştur
let logDir;
if (USE_FILE_LOGS) {
  logDir = getLogDirectory();
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (error) {
    console.warn('[LOG] Log klasörü oluşturulamadı, sadece console log kullanılacak:', error.message);
  }
}

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  })
];

// File logging aktifse ve klasör oluşturulabilmişse file transport'ları ekle
if (USE_FILE_LOGS && logDir) {
  try {
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'whatsapp-web.log'),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'endpoints.log'),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5
      })
    );
    console.log(`[LOG] File logging aktif: ${logDir}`);
  } catch (error) {
    console.warn('[LOG] File transport eklenemedi, sadece console log kullanılacak:', error.message);
  }
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: transports
});

// Global error handlers for deep diagnostics
process.on('unhandledRejection', (reason, promise) => {
  try {
    logger.error('[UNHANDLED REJECTION]', { reason: (reason && reason.message) || String(reason) });
    console.error('[UNHANDLED REJECTION]', reason);
  } catch {}
});
process.on('uncaughtException', (err) => {
  try {
    logger.error('[UNCAUGHT EXCEPTION]', { error: err.message, stack: err.stack });
    console.error('[UNCAUGHT EXCEPTION]', err);
  } catch {}
});

// YENI: Endpoint logging helper
function logEndpoint(endpoint, method, data, result) {
  const logData = {
    timestamp: new Date().toISOString(),
    endpoint,
    method,
    request: data,
    result: result || 'processing',
    ready: ready
  };
  logger.info(`[ENDPOINT] ${method} ${endpoint}`, logData);
}

// Get package versions for logging
let baileysVersion = 'unknown';
try {
  const baileysPkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'node_modules', '@whiskeysockets', 'baileys', 'package.json'), 'utf8'));
  baileysVersion = baileysPkg.version;
} catch (e) {
  // Ignore if package not found
}

logger.info('═════════════════════════════════════════════════════');
logger.info('WhatsApp Baileys Server Starting');
logger.info(`Log Directory: ${logDir || 'Console only (file logging disabled)'}`);
logger.info(`Baileys Version: ${baileysVersion}`);
logger.info('═════════════════════════════════════════════════════');

// ==== Global İstatistikler ====
global.monitorStats = {
  totalProcessed: 0,
  todayCount: 0,
  errorCount: 0,
  successRate: 100,
  avgTime: 0,
  cacheHits: 0,
  cacheMisses: 0,
  queueLength: 0,
  startTime: Date.now()
};

// Günlük istatistikleri sıfırla (her gün)
const today = new Date().toDateString();
if (global.lastResetDate !== today) {
  global.monitorStats.todayCount = 0;
  global.lastResetDate = today;
}

// ==== Aktivite Log Sistemi ====
global.activityLogs = [];
const MAX_LOGS = 100;

function addActivityLog(type, message) {
  const log = {
    time: new Date().toLocaleTimeString('tr-TR'),
    type: type,
    message: message,
    timestamp: Date.now()
  };

  global.activityLogs.unshift(log);

  if (global.activityLogs.length > MAX_LOGS) {
    global.activityLogs = global.activityLogs.slice(0, MAX_LOGS);
  }

  logger.info(`[${log.type.toUpperCase()}] ${log.message}`);
}

// ==== Basit yapılandırmalar ====
const PORT = Number(process.env.PORT) || 3001;
// Base path for reverse proxy support (e.g., "/whatsapp-web" or "" for direct access)
const BASE_PATH = process.env.BASE_PATH || '';

// ✅ FIX: Video cache için PERSISTENT DISK kullan (sistem temp yerine)
const TMP_DIR = PATHS.TMP_VIDEOS_DIR;

// Gallery upload tmp folder - PERSISTENT DISK
const GALLERY_TMP = PATHS.TMP_VIDEOS_DIR;
if (!fs.existsSync(GALLERY_TMP)) {
  fs.mkdirSync(GALLERY_TMP, { recursive: true });
}
// Baileys auth directory - PERSISTENT DISK
const AUTH_DIR = PATHS.AUTH_DIR;
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// Forward parametreleri (Baileys için) - Environment variable destekli
const FORWARD_DELAY = parseInt(process.env.FORWARD_DELAY || '1200', 10);           // 1.2s default (900-1500ms önerilen)
const FORWARD_BURST_SIZE = parseInt(process.env.FORWARD_BURST_SIZE || '30', 10);   // Deprecated (chunk kullanılıyor)
const FORWARD_BURST_COOLDOWN = parseInt(process.env.FORWARD_BURST_COOLDOWN || '105000', 10); // 105s default (90-120s önerilen)

// Chunk parametreleri (Anti-ban için optimize edilmiş)
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '12', 10);                   // 12 hedef/chunk (10-15 önerilen)

// Upload rotation parametresi (Yeni: Her N kişide bir video yeniden upload et)
const UPLOAD_PER_SIZE = parseInt(process.env.UPLOAD_PER_SIZE || '60', 10);        // 60 kişide bir yeni upload (anti-bot pattern)

// Seed rotation parametresi (optional complexity - advanced anti-ban) - DEPRECATED, UPLOAD_PER_SIZE kullan
const SEED_INTERVAL = parseInt(process.env.SEED_INTERVAL || '0', 10);              // 0=disabled, 220=her 220 hedefte yeni seed upload

// Job logs ring buffer (RAM leak önleme)
const MAX_JOB_LOGS = parseInt(process.env.MAX_JOB_LOGS || '1000', 10);             // Max 1000 log/job

// Job tracking store (202 async response için)
const jobStore = new Map(); // { requestId: { status, progress, result, startTime, logs } }
// ngrok public URL (başlatılınca atanacak)
let TUNNEL_URL = null;

async function startTunnel() {
  try {
    // Dinamik import: @ngrok/ngrok modülü - yeni API
    const ngrok = await import('@ngrok/ngrok');
    const token = process.env.NGROK_AUTH_TOKEN || process.env.NGROK_TOKEN;

    // Yeni API: forward ile tunnel oluştur
    const listener = await ngrok.forward({
      addr: PORT,
      authtoken: token
    });

    TUNNEL_URL = listener.url();
    logger.info(`[TUNNEL] ngrok started: ${TUNNEL_URL}`);
    logger.info(`[TUNNEL] Public URL: ${TUNNEL_URL}`);
    logger.info(`[TUNNEL] Local URL:  http://localhost:${PORT}`);
  } catch (e) {
    console.warn("[TUNNEL] ngrok not available or failed:", e?.message || e);
  }
}

// Body parser middleware - multipart/form-data HARİÇ tüm tipler için
app.use((req, res, next) => {
  const contentType = req.get('content-type') || '';
  // Eğer multipart/form-data ise, body parser'ları atla
  if (contentType.startsWith('multipart/form-data')) {
    console.log('[MIDDLEWARE] Multipart request detected, skipping body parsers');
    return next();
  }
  next();
});

// Cookie parser artık gerekli değil - sadece query token kullanıyoruz
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(express.raw({ limit: "100mb", type: 'application/octet-stream' }));
app.use(express.static("."));

// ==== Multer yapılandırması (dosya upload) ====
const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 5
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece video dosyaları desteklenir!'), false);
    }
  }
});

// Multer instance that stores uploaded gallery videos into repository tmp_videos
const galleryStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, GALLERY_TMP);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.mp4';
    const name = `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`;
    cb(null, name);
  }
});

const galleryUpload = multer({
  storage: galleryStorage,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 5
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece video dosyaları desteklenir!'), false);
    }
  }
});

// ==== Kişi yönetimi için helper fonksiyonlar ====
// PERSISTENT DISK - JSON dosyaları disk'e yazılacak
const CONTACTS_FILE = PATHS.CONTACTS_FILE;
const COUNTRIES_FILE = PATHS.COUNTRIES_FILE;
const GROUPS_FILE = PATHS.GROUPS_FILE;

function loadCountries() {
  try {
    if (fs.existsSync(COUNTRIES_FILE)) {
      const data = fs.readFileSync(COUNTRIES_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Countries dosyası yüklenemedi:", error.message);
  }
  return { countries: {}, groups: {} };
}

function detectCountryFromPhone(phoneNumber) {
  const countriesData = loadCountries();
  const countries = countriesData.countries;

  // Telefon numarasını temizle - sadece rakamlar
  const cleanPhone = phoneNumber.toString().replace(/[^\d]/g, '');

  // Telefon numarasından ülke kodunu tespit et
  for (const [countryCode, countryInfo] of Object.entries(countries)) {
    if (countryInfo.prefixes && countryInfo.prefixes.length > 0) {
      for (const prefix of countryInfo.prefixes) {
        if (cleanPhone.startsWith(prefix)) {
          return {
            country: countryCode,
            language: countryInfo.language,
            countryName: countryInfo.name,
            flag: countryInfo.flag
          };
        }
      }
    }
  }

  // Bilinmeyen ülke için UNKNOWN döndür
  return {
    country: 'UNKNOWN',
    language: 'en',
    countryName: 'Bilinmeyen Ülke',
    flag: '🌐'
  };
}

function loadContacts() {
  try {
    if (fs.existsSync(CONTACTS_FILE)) {
      const data = fs.readFileSync(CONTACTS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Contacts dosyası yüklenemedi:", error.message);
  }

  // Varsayılan yapı
  return {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    settings: { defaultLanguage: "tr", enabledLanguages: ["tr", "en", "ru", "ar"] },
    countries: {},
    contacts: [],
    messageTemplates: {}
  };
}

function saveContacts(contactsData) {
  try {
    contactsData.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contactsData, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Contacts dosyası kaydedilemedi:", error.message);
    return false;
  }
}

// ==== Grup yönetimi için helper fonksiyonlar ====
function loadGroups() {
  try {
    if (fs.existsSync(GROUPS_FILE)) {
      const data = fs.readFileSync(GROUPS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Groups dosyası yüklenemedi:", error.message);
  }

  // Varsayılan yapı
  return {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    groups: []
  };
}

function saveGroups(groupsData) {
  try {
    groupsData.lastUpdated = new Date().toISOString();
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(groupsData, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Groups dosyası kaydedilemedi:", error.message);
    return false;
  }
}

// ==== Global durum ====
let lastQrString = null;
let lastPairingCode = null;
let lastPairingCodeAt = 0;
let lastPairPhone = null;
let ready = false;
const QUEUE = [];
let busy = false;

// ==== Video gruplama sistemi - BATCH MANTIK ====
const batchState = new Map(); // batchId -> { currentContactIndex, batchSize, isComplete, videoCount }
const batchVideos = new Map(); // batchId -> { videos: [{url, caption}], size, fanoutDone }
const batchFiles = new Map(); // batchId -> { files: [{path, caption}], size, fanoutDone }
function getContactsForBatch(batchId, batchSize, totalContacts) {
  // Güvenlik: 0 kişi varsa fallback
  if (!totalContacts || totalContacts < 1) {
    return {
      contactIndex: 0,
      batchId,
      isNewBatch: true,
      videoInCurrentBatch: 1
    };
  }

  if (!batchState.has(batchId)) {
    batchState.set(batchId, {
      currentContactIndex: 0,   // Bu batch o an hangi kişide
      batchSize: Number(batchSize) || 1,
      isComplete: false,
      videoCount: 0             // Bu kişiye gönderilen video sayacı
    });
  }

  const state = batchState.get(batchId);

  // Güvenlik: currentContactIndex sınır içinde kalsın
  if (state.currentContactIndex >= totalContacts) {
    state.currentContactIndex = 0;
  }

  // Bu batch boyunca daima aynı kişi
  const contactIndex = state.currentContactIndex;

  // Bu kişiye gönderilen video sayısını artır (1..batchSize)
  state.videoCount++;
  const videoInCurrentBatch = state.videoCount;

  return {
    contactIndex,
    batchId,
    isNewBatch: videoInCurrentBatch === 1,
    videoInCurrentBatch
  };
}

function markBatchComplete(batchId, totalContacts) {
  if (!batchState.has(batchId)) return;
  if (!totalContacts || totalContacts < 1) return;

  const state = batchState.get(batchId);

  // Bu kişi için batch bitti → sıradaki kişiye geç
  state.currentContactIndex = (state.currentContactIndex + 1) % totalContacts;

  // Yeni kişi için sayaç sıfırlanır
  state.videoCount = 0;

  // Tüm kişiler tamamlandıysa işaretle (başladığımız kişiye geri döndük)
  if (state.currentContactIndex === 0) {
    state.isComplete = true;
  }

  batchState.set(batchId, state);
  console.log(`[BATCH] Kişi ${state.currentContactIndex + 1} için batch hazırlanıyor (${batchId})`);
}

// ==== Video Cache Sistemi (AKILLI SİSTEM) ====
const videoCache = new Map(); // URL/FileName -> { filePath, downloadTime, useCount, size }

// Upload edilen dosyaları cache'e ekle
function addFileToCache(fileName, filePath, fileSize) {
  const cacheKey = `file:${fileName}`; // Dosyalar için özel key

  if (videoCache.has(cacheKey)) {
    const cached = videoCache.get(cacheKey);
    cached.useCount++;
    cached.lastUsed = Date.now();
    global.monitorStats.cacheHits++;
    console.log(`[FILE CACHE HIT] ${fileName} (${cached.useCount}. kullanım)`);
    return cached.filePath;
  }

  // Yeni dosyayı cache'e ekle
  videoCache.set(cacheKey, {
    filePath: filePath,
    downloadTime: 0, // Upload için download time yok
    downloadedAt: Date.now(),
    lastUsed: Date.now(),
    useCount: 1,
    size: fileSize,
    isUpload: true
  });

  global.monitorStats.cacheMisses++;
  console.log(`[FILE CACHE ADD] ${fileName} → cache'e eklendi`);
  addActivityLog('info', `Upload: ${fileName} cache'e eklendi`);

  return filePath;
}

async function getOrCacheVideo(videoUrl) {
  // Cache'de varsa direkt dön
  if (videoCache.has(videoUrl)) {
    const cached = videoCache.get(videoUrl);
    cached.useCount++;
    cached.lastUsed = Date.now();

    // İstatistikleri güncelle
    global.monitorStats.cacheHits++;

    const message = `Cache hit: ${path.basename(cached.filePath)} (${cached.useCount}. kullanım)`;
    console.log(`[CACHE HIT] ${message}`);
    addActivityLog('info', message);

    return cached.filePath;
  }

  // Yeni video download et
  const tmpFile = path.join(TMP_DIR, `cached_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);

  // İstatistikleri güncelle
  global.monitorStats.cacheMisses++;

  addActivityLog('info', `Video indiriliyor: ${path.basename(videoUrl)}`);
  console.log(`[CACHE MISS] Video download ediliyor: ${videoUrl}`);

  const startTime = Date.now();
  const resp = await fetch(videoUrl);
  if (!resp.ok || !resp.body) throw new Error(`Video indirilemedi: HTTP ${resp.status}`);

  await streamPipeline(resp.body, fs.createWriteStream(tmpFile));
  const downloadTime = Date.now() - startTime;
  const fileStats = fs.statSync(tmpFile);

  // Cache'e ekle
  videoCache.set(videoUrl, {
    filePath: tmpFile,
    downloadTime,
    downloadedAt: Date.now(),
    lastUsed: Date.now(),
    useCount: 1,
    size: fileStats.size,
    url: videoUrl
  });

  const sizeMB = Math.round(fileStats.size / 1024 / 1024 * 100) / 100;
  const message = `Yeni video cache'lendi: ${path.basename(tmpFile)} (${sizeMB}MB)`;
  console.log(`[CACHE STORE] ${message}`);
  addActivityLog('info', message);

  return tmpFile;
}

// KUYRUK BİTİNCE CACHE TEMİZLE - SADECE GERÇEKTEN BİTİNCE
function clearAllCache() {
  const cacheCount = videoCache.size;
  console.log(`[CACHE CLEAR] ${cacheCount} cache dosyası temizleniyor...`);

  if (cacheCount > 0) {
    addActivityLog('info', `${cacheCount} cache dosyası temizleniyor`);
  }

  for (const [url, cache] of videoCache.entries()) {
    try {
      fs.unlinkSync(cache.filePath);
      console.log(`[CACHE CLEAR] Cache dosyası silindi: ${path.basename(cache.filePath)} (${cache.useCount} kullanım)`);
    } catch (err) {
      console.log(`[CACHE CLEAR] Dosya silinemedi: ${err.message}`);
    }
  }

  videoCache.clear();

  // Tamamlanan batch state'lerini temizle
  const completedBatches = [];
  for (const [batchId, state] of batchState.entries()) {
    if (state.isComplete) {
      completedBatches.push(batchId);
    }
  }

  for (const batchId of completedBatches) {
    batchState.delete(batchId);
  }

  console.log(`[CACHE CLEAR] Tüm cache temizlendi.`);
  if (completedBatches.length > 0) {
    console.log(`[STATE CLEAR] ${completedBatches.length} tamamlanan batch state'i temizlendi.`);
    addActivityLog('info', `Tamamlanan batch state'leri temizlendi (${completedBatches.length} batch)`);
  }

  // Galeriden yüklenen dosyaları da temizle
  for (const [bId, reg] of batchFiles.entries()) {
    try {
      const files = (reg?.files || []).filter(Boolean);
      for (const f of files) {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
          console.log(`[CACHE CLEAR] Gallery file silindi: ${path.basename(f)}`);
        }
      }
    } catch (e) {
      console.log(`[CACHE CLEAR] Gallery file silinemedi: ${e.message}`);
    }
  }
  batchFiles.clear();

}

// ==== Baileys WhatsApp Connection ====
let sock = null;
let contactStore = {}; // Baileys contact store
// Connection stability flags & counters
let connecting = false;            // aktif bağlantı kuruluyor mu
let reconnectTimer = null;         // planlanan reconnect timeout referansı
let conflictCount = 0;             // ardışık conflict sayacı
let streamErrorCount = 0;          // ardışık 515 stream error sayacı
let lastConnectAttempt = 0;        // son connect çağrısı zaman damgası (ms)
let hasEverOpened = false;         // en az bir kez connection 'open' oldu mu
let unauthorizedCount = 0;         // ardışık 401 sayacı

function cleanupSocket(reason = 'reconnect') {
  if (sock) {
    try {
      sock.ev.removeAllListeners();
    } catch {}
    try {
      // Baileys soketi alttaki ws kapanışı ile sonlandırılır; hata yutulur
      sock.ws?.close();
    } catch {}
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (reason === 'logout') {
    conflictCount = 0;
    streamErrorCount = 0;
  }
}

function scheduleReconnect(baseDelay = 5000, reason = 'generic') {
  if (ready) return; // zaten açık
  if (connecting) {
    logger.warn(`[RECONNECT] Bağlanma devam ederken yeniden deneme atlandı (${reason})`);
    return;
  }
  globalThis.__reconnectAttempts = (globalThis.__reconnectAttempts || 0) + 1;
  const attempt = globalThis.__reconnectAttempts;
  const jitter = Math.floor(Math.random() * 1500); // 0-1500ms jitter
  const waitMs = Math.min(baseDelay * attempt, 30000) + jitter; // exponential cap 30s + jitter
  logger.info(`[RECONNECT] Planlandı (attempt=${attempt}, in=${waitMs}ms, reason=${reason}, jitter=${jitter})`);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToWhatsApp().catch(err => {
      logger.error('[RECONNECT] Yeniden bağlanma hatası', { error: err.message });
      scheduleReconnect(5000, 'error-after-connect');
    });
  }, waitMs);
}

async function connectToWhatsApp() {
  const now = Date.now();
  if (connecting) {
    logger.warn('[CONNECT] Zaten bağlanma sürecinde, çağrı atlandı');
    return;
  }
  // Çok hızlı art arda denemeleri yumuşat (min 2sn)
  if (now - lastConnectAttempt < 2000) {
    logger.warn('[CONNECT] Çok sık connect denemesi; 2sn debounce uygulandı');
    return;
  }
  lastConnectAttempt = now;
  connecting = true;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  logger.info(`[BAILEYS] Version: ${version.join('.')}, Latest: ${isLatest}`);
  // Önce önceki soketi temizle (listeners & ws)
  cleanupSocket('reconnect');
  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    // browser parametresi kaldırıldı - Baileys otomatik seçer
    connectTimeoutMs: 120000,
    defaultQueryTimeoutMs: 120000,
    keepAliveIntervalMs: 30000,
    markOnlineOnConnect: true,
    syncFullHistory: true,
    shouldSyncHistoryMessage: (msg) => true
  });

  // messaging-history.set event - QR sonrası chats ve contacts gelir
  sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }) => {
    console.log(`[BAILEYS] messaging-history.set: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${messages?.length || 0} messages`);
    logger.info('[BAILEYS] messaging-history.set', { 
      chatsCount: chats?.length || 0, 
      contactsCount: contacts?.length || 0,
      messagesCount: messages?.length || 0,
      isLatest 
    });
    
    // Contacts'ı store'a ekle
    if (contacts && contacts.length > 0) {
      for (const contact of contacts) {
        contactStore[contact.id] = contact;
      }
      console.log(`[BAILEYS] ${contacts.length} contact stored!`);
    }
  });

  // DEBUG: Tüm Baileys event'lerini logla
  const allEvents = ['messaging-history.set', 'chats.set', 'contacts.set', 'contacts.upsert', 'contacts.update'];
  allEvents.forEach(eventName => {
    sock.ev.on(eventName, (data) => {
      const dataLength = Array.isArray(data) ? data.length : Object.keys(data || {}).length;
      console.log(`[BAILEYS EVENT] ${eventName} → ${dataLength} items`);
      logger.info(`[BAILEYS EVENT] ${eventName}`, { count: dataLength });
    });
  });

  // Contacts set event - Baileys contact store
  sock.ev.on('contacts.set', (contacts) => {
    logger.info(`[BAILEYS] contacts.set received: ${Object.keys(contacts).length}`);
    for (const contact of Object.values(contacts)) {
      contactStore[contact.id] = contact;
    }
  });

  // Contacts upsert event - QR tarandıktan sonra TÜM kontaklar gelir
  sock.ev.on('contacts.upsert', (contacts) => {
    logger.info(`[BAILEYS] contacts.upsert received: ${contacts.length} contacts`);
    console.log(`[BAILEYS] Tüm kişiler güncellendi! Toplam: ${contacts.length}`);
    
    for (const contact of contacts) {
      contactStore[contact.id] = contact;
    }
  });

  sock.ev.on('contacts.update', (updates) => {
    console.log(`[BAILEYS] contacts.update: ${updates.length} contacts updating`);
    for (const contact of updates) {
      if (contactStore[contact.id]) {
        contactStore[contact.id] = { ...contactStore[contact.id], ...contact };
      } else {
        contactStore[contact.id] = contact;
      }
    }
    console.log(`[BAILEYS] ContactStore now has ${Object.keys(contactStore).length} contacts`);
  });

  // Connection update event
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Derin tanılama: ham update'i ve hata detaylarını göster
    const raw = { ...update };
    const errObj = lastDisconnect?.error;
    const boomData = errObj && errObj.output ? { code: errObj.output.statusCode, payload: errObj.output.payload } : null;
    console.log('[CONNECTION UPDATE RAW]', { connection, hasQr: !!qr, keys: Object.keys(raw), boomData });

    if (qr) {
      lastQrString = qr;
      ready = false;
      logger.info(`[QR] Yeni QR kodu üretildi → http://localhost:${PORT}`);
      addActivityLog('info', 'Yeni QR kodu oluşturuldu');
    }

    if (connection === 'close') {
      ready = false;
      connecting = false;
      const isBoom = lastDisconnect?.error instanceof Boom;
      const statusCode = isBoom ? lastDisconnect.error.output.statusCode : undefined;
      const message = isBoom ? lastDisconnect.error.message : (lastDisconnect?.error?.message || '');
      const isConflict = typeof message === 'string' && message.toLowerCase().includes('conflict');
      const isUnauthorized401 = statusCode === DisconnectReason.loggedOut; // 401 Unauthorized (Baileys sabitinde loggedOut)
      // İlk bağlantılarda gelen 401 'Connection Failure' durumunu transient say ve birkaç kez dene
      if (isUnauthorized401) {
        unauthorizedCount += 1;
      } else {
        unauthorizedCount = 0;
      }
      // loggedOut olarak değerlendirme koşulu:
      // - 401 ve daha önce en az bir kez başarılı open olmuşsa VE/VEYAHUT ardışık 401 sayısı > 2
      const treatAsLoggedOut = isUnauthorized401 && (hasEverOpened || unauthorizedCount > 2) && !isConflict;
      const isLoggedOut = treatAsLoggedOut;
      const isStreamError = statusCode === 515 || /stream/i.test(message);
      if (isConflict) conflictCount++; else conflictCount = 0; // reset if different
      if (isStreamError) streamErrorCount++; else streamErrorCount = 0;
      const shouldReconnect = !isLoggedOut;

      logger.info(`[DISCONNECT] statusCode=${statusCode} conflict=${isConflict} streamErr=${isStreamError} loggedOut=${isLoggedOut} reconnect=${shouldReconnect}`);
      console.log('[DISCONNECT DIAG]', { statusCode, message, isConflict, isLoggedOut, attempt: globalThis.__reconnectAttempts || 0, conflictCount, streamErrorCount, unauthorizedCount, hasEverOpened });
      if (lastDisconnect?.error?.stack) {
        console.log('[DISCONNECT STACK]', lastDisconnect.error.stack.split('\n').slice(0,6).join('\n'));
      }
      addActivityLog('warn', `WhatsApp bağlantısı kesildi (${statusCode || 'no-code'})`);

      if (conflictCount > 3) {
        logger.warn('[DIAG] 3+ ardışık conflict: Telefon uygulamasında bağlı cihazları kontrol edin, eski oturumları silin.');
      }
      if (streamErrorCount > 3) {
        logger.warn('[DIAG] 3+ ardışık stream error (515): Ağ/VPN/proxy kontrol edin veya 60sn bekleyin.');
      }

      if (shouldReconnect) {
        const base = isConflict ? 6000 : isStreamError ? 5000 : isUnauthorized401 ? 3000 : 5000;
        scheduleReconnect(base, isConflict ? 'conflict' : isStreamError ? 'stream-error' : isUnauthorized401 ? 'unauthorized' : 'generic');
      } else {
        logger.warn('[DISCONNECT] LoggedOut algılandı, session temizleniyor ve yeni QR oluşturulacak.');
        addActivityLog('warn', 'Session geçersiz, yeniden başlatılıyor');
        
        // Session dosyalarını temizle ve yeniden başlat
        try {
          const authFiles = fs.readdirSync(AUTH_DIR);
          for (const file of authFiles) {
            const filePath = path.join(AUTH_DIR, file);
            if (fs.statSync(filePath).isFile()) {
              fs.unlinkSync(filePath);
            }
          }
          logger.info('[SESSION-CLEANUP] Session dosyaları temizlendi, yeniden bağlanılıyor...');
          
          // 3 saniye bekle ve yeniden bağlan
          setTimeout(() => {
            connectToWhatsApp().catch(err => {
              logger.error('[BAILEYS] Yeniden bağlantı hatası:', err);
            });
          }, 3000);
        } catch (cleanupError) {
          logger.error('[SESSION-CLEANUP] Temizleme hatası:', cleanupError);
          cleanupSocket('logout');
        }
      }
    } else if (connection === 'open') {
      ready = true;
      lastQrString = null;
      console.log('[BAILEYS] ✅✅✅ CONNECTION OPEN - WhatsApp CONNECTED ✅✅✅');
      logger.info('[BAILEYS] ✅ Bağlantı başarılı! WhatsApp hazır.');
      addActivityLog('success', 'WhatsApp bağlantısı başarılı');

      // Ek işlem yapmadan mevcut kişi sayısını raporla (manuel tetik kaldırıldı)
      const contactCountNow = Object.keys(contactStore).length;
      console.log(`[BAILEYS] Connected. Şu an store'da ${contactCountNow} kişi var.`);
      // Başarılı bağlantı sonrası reconnect sayacını sıfırla
      globalThis.__reconnectAttempts = 0;
      connecting = false;
      conflictCount = 0;
      streamErrorCount = 0;
      unauthorizedCount = 0;
      hasEverOpened = true;
    }
  });

  // Credentials save
  sock.ev.on('creds.update', saveCreds);
  connecting = false; // Soket kuruldu, eventler hazır
}

// Start Baileys connection
connectToWhatsApp().catch(err => {
  logger.error('[BAILEYS] Bağlantı hatası:', err);
  addActivityLog('error', `Bağlantı hatası: ${err.message}`);
});


// ==== Kuyruk işçisi (tek eşzamanlı - URL ve dosya desteği + CACHE + BATCH) ====
async function worker() {
  // Log worker state
  if (busy) {
    logger.debug('[WORKER] Worker busy, skipping');
    return;
  }
  if (QUEUE.length === 0) {
    logger.debug('[WORKER] Queue empty, skipping');
    return;
  }
  if (!ready) {
    logger.warn('[WORKER] WhatsApp not ready, cannot process queue');
    logEndpoint('worker', 'INTERNAL', { queueLength: QUEUE.length }, { error: 'WhatsApp not ready' });
    return;
  }

  busy = true;
  const job = QUEUE.shift();
  const {
    to,
    caption,
    videoUrl,
    videoFilePath,
    isFileUpload,
    useCache = true,
    isBatchOperation = false,
    contactName,
    videoInSet,
    totalInSet,
    type = 'contact' // 'contact' veya 'group'
  } = job;

  // Log job start
  const jobStartTime = Date.now();
  logger.info('[WORKER] Processing job', {
    to,
    videoUrl: videoUrl || 'N/A',
    videoFilePath: videoFilePath || 'N/A',
    isFileUpload,
    useCache,
    isBatchOperation,
    contactName: contactName || 'N/A',
    videoInSet: videoInSet || 'N/A',
    totalInSet: totalInSet || 'N/A',
    queueLength: QUEUE.length,
    ready
  });
  logEndpoint('worker', 'INTERNAL', { to, videoUrl, isFileUpload, isBatchOperation }, 'started');

  // Kuyruk durumu logu
  if (QUEUE.length > 0) {
    addActivityLog('warning', `Kuyrukta ${QUEUE.length} işlem bekliyor`);
  }

  let tmpFile = null;
  let isFromCache = false;

  try {
    // BATCH İŞLEM LOGU
    if (isBatchOperation && contactName) {
      console.log(`[BATCH WORKER] ${contactName}: Video ${videoInSet}/${totalInSet} gönderiliyor...`);
    }

    if (isFileUpload && videoFilePath) {
      // Gallery'den gelen dosya upload'u - dosya zaten TMP_DIR içinde
      tmpFile = videoFilePath;
      console.log(`[WORKER] Gallery dosyası işleniyor: ${path.basename(tmpFile)} → ${to}`);
    } else if (videoUrl) {
      if (useCache) {
        // CACHE SİSTEMİ: Aynı videoyu tekrar download etme
        tmpFile = await getOrCacheVideo(videoUrl);
        isFromCache = true;
        const logMsg = isBatchOperation ?
          `[BATCH WORKER] Cache video: ${path.basename(tmpFile)} → ${contactName}` :
          `[WORKER] Cache video kullanılıyor: ${path.basename(tmpFile)} → ${to}`;
        console.log(logMsg);
      } else {
        // ESKİ SİSTEM: Her seferinde download et
        tmpFile = path.join(TMP_DIR, `wa_${Date.now()}.mp4`);
        console.log(`[WORKER] URL stream ediliyor: ${videoUrl} → ${to}`);

        const resp = await fetch(videoUrl);
        if (!resp.ok || !resp.body) throw new Error(`Video indirilemedi: HTTP ${resp.status}`);
        await streamPipeline(resp.body, fs.createWriteStream(tmpFile));
      }
    } else {
      throw new Error("Video URL veya dosya yolu gerekli");
    }

    // Baileys için video buffer oluştur
    const videoBuffer = fs.readFileSync(tmpFile);

    // Video gönderme - grup vs kişi ayrımı
    if (type === 'group') {
      // GRUP GÖNDERİMİ - Baileys ile doğrudan grup ID kullan
      logger.info('[WORKER-GROUP] Sending video to group (Baileys)', { groupId: to, hasCaption: !!caption });

      try {
        // Baileys'te grup ID zaten doğru formatta (1234567890-123456789@g.us)
        await sock.sendMessage(to, {
          video: videoBuffer,
          caption: caption || ""
        });

        logger.info('[WORKER-GROUP] Video sent to group successfully', { groupId: to });

      } catch (groupError) {
        logger.error('[WORKER-GROUP] Group send failed', {
          error: groupError.message,
          groupId: to,
          contactName: contactName || 'N/A'
        });
        throw groupError;
      }

    } else {
      // KİŞİ GÖNDERİMİ - Baileys JID formatı
      const jid = `${to}@s.whatsapp.net`;
      logger.info('[WORKER-CONTACT] Sending video to contact (Baileys)', { jid, hasCaption: !!caption });
      
      await sock.sendMessage(jid, {
        video: videoBuffer,
        caption: caption || ""
      });
      
      logger.info('[WORKER-CONTACT] Video sent successfully', { jid });
    }

    // Başarılı gönderim logu
    const processingTime = Date.now() - jobStartTime;
    if (isBatchOperation && contactName) {
      const successMessage = `${contactName}: Video ${videoInSet}/${totalInSet} başarıyla gönderildi`;
      console.log(`[BATCH OK] ${successMessage}`);
      addActivityLog('success', successMessage);
      logger.info('[WORKER] Batch video sent', { contactName, videoInSet, totalInSet, processingTime });
    } else {
      const successMessage = `Video başarıyla gönderildi: ${to}`;
      console.log(`[OK] ${successMessage} - ${isFileUpload ? 'Gallery dosyası' : isFromCache ? 'Cache video' : 'URL stream'}`);
      addActivityLog('success', successMessage);
      logger.info('[WORKER] Video sent', { to, isFileUpload, isFromCache, processingTime });
    }

    // Log success to endpoints.log
    logEndpoint('worker', 'INTERNAL', { to, videoUrl, isFileUpload, isBatchOperation }, {
      success: true,
      processingTime,
      queueLength: QUEUE.length,
      method: isFileUpload ? 'gallery' : isFromCache ? 'cache' : 'stream'
    });

    // İstatistikleri güncelle
    global.monitorStats.totalProcessed++;
    global.monitorStats.todayCount++;

    await new Promise((r) => setTimeout(r, 2000)); // anti-spam tamponu (2sn)

  } catch (err) {
    // Hata logu
    const processingTime = Date.now() - jobStartTime;
    logger.error('[WORKER] Failed to send video', {
      error: err.message,
      stack: err.stack,
      to,
      videoUrl,
      videoFilePath,
      isFileUpload,
      isBatchOperation,
      contactName,
      processingTime
    });

    if (isBatchOperation && contactName) {
      const errorMessage = `${contactName}: Video ${videoInSet}/${totalInSet} gönderilemedi - ${err.message}`;
      console.error(`[BATCH HATA] ${errorMessage}`);
      addActivityLog('error', errorMessage);
    } else {
      const errorMessage = `Video gönderilemedi: ${to} - ${err.message}`;
      console.error(`[HATA] ${errorMessage}`);
      addActivityLog('error', errorMessage);
    }

    // Log error to endpoints.log
    logEndpoint('worker', 'INTERNAL', { to, videoUrl, isFileUpload, isBatchOperation }, {
      success: false,
      error: err.message,
      stack: err.stack,
      processingTime
    });

    // Hata istatistiklerini güncelle
    global.monitorStats.errorCount++;
  } finally {
    // Geçici dosyayı temizle (SADECE cache olmayan dosyalar)
    if (tmpFile && !isFromCache && !isFileUpload) {
      try {
        fs.existsSync(tmpFile) && fs.unlinkSync(tmpFile);
        console.log(`[CLEANUP] Geçici dosya silindi: ${path.basename(tmpFile)}`);
      } catch (cleanupErr) {
        console.log(`[CLEANUP] Dosya silinemedi: ${cleanupErr.message}`);
      }
    }

    busy = false;

    // KUYRUK BİTTİYSE CACHE'İ TEMİZLE - SADECE BATCH TAMAMEN BİTTİYSE
    if (QUEUE.length === 0) {
      console.log(`[QUEUE] Kuyruk boş, batch durumu kontrol ediliyor...`);

      // Aktif batch'ler var mı kontrol et
      let hasActiveBatches = false;
      for (const [batchId, state] of batchState.entries()) {
        if (!state.isComplete) {
          console.log(`[QUEUE] Batch ${batchId} henüz devam ediyor, cache korunuyor...`);
          hasActiveBatches = true;
          break;
        }
      }

      // Sadece tüm batch'ler tamamlandıysa cache'i temizle
      if (!hasActiveBatches && batchState.size > 0) {
        console.log(`[QUEUE] Tüm batch'ler tamamlandı, cache temizleniyor...`);
        clearAllCache();
      } else if (batchState.size === 0) {
        console.log(`[QUEUE] Hiç batch yok, cache temizleniyor...`);
        clearAllCache();
      }
    }

    setImmediate(worker);
  }
}

function enqueue(job) {
  QUEUE.push(job);
  setImmediate(worker);
}

// ==== Basit QR HTML (otomatik yenileme) ====
const HTML_PAGE = `<!doctype html>
<html lang="tr">
<head>
<base href="${BASE_PATH ? BASE_PATH + '/' : '/'}">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Byte Export Whatsapp Bridge</title>
<style>
  :root {
    --primary-dark: #001D6C;
    --primary-medium: #003399;
    --primary-light: #0047AB;
    --bg-main: rgb(248, 249, 250);
    --bg-white: #FFFFFF;
    --text-primary: #0F172A;
    --text-secondary: #475569;
    --text-tertiary: #64748B;
    --success: #10B981;
    --warning: #F59E0B;
    --error: #EF4444;
    --border-light: #ced3da;
    --border-medium: #8994a2;
    --border-primary: rgba(0, 29, 108, 0.2);
    --border-primary-strong: rgba(0, 29, 108, 0.4);
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    --shadow-neon: 0 0 24px -16px rgba(0, 29, 108, 0.25);
    --shadow-neon-highlight: 0 0 40px -12px rgba(0, 29, 108, 0.5);
    --space-2: 0.5rem;
    --space-4: 1rem;
    --space-6: 1.5rem;
    --space-8: 2rem;
  }
  
  * { box-sizing: border-box; }
  
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Ubuntu, sans-serif;
    margin: 0;
    background: linear-gradient(135deg, #EBF5FF 0%, #FFFFFF 50%, #E8E9FF 100%);
    color: var(--text-primary);
    display: flex;
    min-height: 100vh;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }
  
  /* Top Bar - Desktop */
  .top-bar {
  width: 120px;
    position: fixed;
    top: 1px;
    left: 16px;
    right: 16px;
    z-index: 1001;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .logo-container {
    text-decoration: none;
    display: block;
  }
  
  .logo-img {
    width: 96px;
    height: auto;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
    transition: transform 0.2s ease;
  }
  
  .logo-img:hover {
    transform: scale(1.05);
  }
  
  .hamburger-menu {
    width: 40px;
    height: 40px;
    background: white;
    border: 2px solid var(--primary-dark);
    border-radius: 8px;
    cursor: pointer;
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 6px;
    padding: 8px;
    transition: all 0.3s ease;
  }
  
  .hamburger-menu span {
    width: 24px;
    height: 2px;
    background: var(--primary-dark);
    border-radius: 2px;
    transition: all 0.3s ease;
  }
  
  .hamburger-menu.active {
    background: var(--primary-dark);
    border-color: var(--primary-dark);
  }
  
  .hamburger-menu.active span {
    background: white;
  }
  
  .hamburger-menu.active span:nth-child(1) {
    transform: rotate(45deg) translate(7px, 7px);
  }
  
  .hamburger-menu.active span:nth-child(2) {
    opacity: 0;
  }
  
  .hamburger-menu.active span:nth-child(3) {
    transform: rotate(-45deg) translate(7px, -7px);
  }
  
  .disk-status-link {
    display: none;
  }
  
  /* Navigation - Desktop */
  .nav {
    height:110px;
    position: fixed;
    top: 1px;
    left: 0;
    right: 0;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(12px);
    padding: var(--space-4) var(--space-6);
    display: flex;
    justify-content: center;
    align-items: center;
    border-bottom: 1px solid var(--border-light);
    box-shadow: var(--shadow-sm);
    z-index: 1000;
  }
  
  .nav-menu { display: flex; gap: var(--space-4); }
  
  .nav-link {
    color: var(--text-secondary);
    text-decoration: none;
    padding: var(--space-2) var(--space-4);
    border-radius: 12px;
    transition: all 0.2s ease;
    font-size: 14px;
    font-weight: 500;
    border: 1px solid transparent;
  }
  
  .nav-link:hover {
    background: var(--bg-main);
    transform: scale(1.05);
  }
  
  .nav-link.active {
    background: var(--primary-dark);
    color: white;
    box-shadow: 0 8px 16px -4px rgba(0, 29, 108, 0.3);
  }
  
  .card {
    background: transparent;
    border: 2px solid transparent;
    border-image: linear-gradient(135deg, rgba(0,29,108,0.4) 0%, rgba(0,51,153,0.2) 50%, rgba(0,29,108,0.4) 100%) 1;
    border-radius: 24px;
    width: min(520px, 92vw);
    margin-top: 100px;
    padding: var(--space-8);
  }
  
  .card > * {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
  }
  
  h2 {
    font-size: 24px;
    margin: 0 0 var(--space-2);
    color: var(--primary-dark);
    font-weight: 700;
    letter-spacing: -0.025em;
  }
  
  p {
    margin: var(--space-2) 0 0;
    color: var(--text-secondary);
    line-height: 1.625;
  }
  
  .qr {
    margin-top: var(--space-6);
    background: white;
    padding: var(--space-4);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border: 1px solid var(--border-light);
    box-shadow: var(--shadow-md);
  }
  
  #qr {
    width: 100%;
    height: auto;
    border-radius: 8px;
    max-width: 300px;
  }
  
  .status {
    margin-top: var(--space-4);
    font-size: 15px;
    padding: var(--space-4);
    border-radius: 8px;
    text-align: center;
    font-weight: 600;
    border: 1px solid;
  }
  
  .status.ok {
    background: rgba(16, 185, 129, 0.1);
    color: var(--success);
    border-color: var(--success);
  }
  
  .status.warn {
    background: rgba(245, 158, 11, 0.1);
    color: var(--warning);
    border-color: var(--warning);
  }
  
  .features {
    margin-top: var(--space-6);
    padding: var(--space-6);
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(8px);
    border-radius: 12px;
    border: 1px solid var(--border-light);
  }
  
  .features h3 {
    color: var(--primary-dark);
    margin: 0 0 var(--space-4);
    font-size: 16px;
    font-weight: 600;
  }
  
  .features ul {
    margin: 0;
    padding-left: 20px;
    color: var(--text-secondary);
  }
  
  .features li {
    margin: var(--space-2) 0;
    line-height: 1.625;
  }
  
  .footer {
    margin-top: var(--space-6);
    text-align: center;
    font-size: 13px;
    color: var(--text-tertiary);
  }

  /* Modal Styles - ByteExport Design */
  .modal {
    display: none;
    position: fixed;
    z-index: 2000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }
  
  .modal-content {
    background: transparent;
    border: 2px solid transparent;
    border-image: linear-gradient(135deg, rgba(0,29,108,0.4) 0%, rgba(0,51,153,0.2) 50%, rgba(0,29,108,0.4) 100%) 1;
    padding: 0;
    margin: 10% auto;
    width: min(500px, 90vw);
    border-radius: 24px;
  }
  
  .modal-content > div {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 22px;
  }
  
  .modal-header {
    padding: var(--space-6);
    border-bottom: 1px solid var(--border-light);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .modal-header h3 {
    margin: 0;
    color: var(--primary-dark);
    font-weight: 700;
    font-size: 20px;
  }
  
  .close {
    color: var(--text-secondary);
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
    line-height: 1;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
  }
  
  .close:hover {
    color: var(--primary-dark);
    background: var(--bg-main);
  }
  
  .modal-body {
    padding: var(--space-6);
  }
  
  .status-info {
    margin-bottom: var(--space-6);
  }
  
  .status-row {
    display: flex;
    justify-content: space-between;
    margin: var(--space-4) 0;
    padding: var(--space-4);
    background: var(--bg-main);
    border-radius: 8px;
    border: 1px solid var(--border-light);
  }
  
  .status-label {
    font-weight: 600;
    color: var(--text-secondary);
  }
  
  .status-value {
    color: var(--primary-dark);
    font-weight: 600;
  }
  
  .modal-actions {
    display: flex;
    gap: var(--space-4);
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .btn {
    padding: var(--space-4) var(--space-6);
    border: 1px solid;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s ease;
    font-size: 14px;
  }
  
  .btn-danger {
    background: white;
    color: var(--error);
    border-color: var(--error);
  }
  
  .btn-danger:hover {
    background: var(--error);
    color: white;
    transform: scale(1.05);
    box-shadow: 0 8px 16px -4px rgba(239, 68, 68, 0.3);
  }
  
  .btn-secondary {
    background: white;
    color: var(--primary-dark);
    border-color: var(--border-medium);
  }
  
  .btn-secondary:hover {
    background: var(--primary-dark);
    color: white;
    transform: scale(1.05);
    box-shadow: 0 8px 16px -4px rgba(0, 29, 108, 0.3);
  }
  
  @media (max-width: 768px) {
    /* Top Bar - Mobile */
    .top-bar {
      position: fixed;
      top: 12px;
      left: 12px;
      right: 12px;
      z-index: 1001;
      background: white;
      padding: 6px 10px;
      border-radius: 12px;
      box-shadow: var(--shadow-md);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo-img {
      width: 72px;
    }
    
    .hamburger-menu {
      display: flex;
    }
    
    .nav {
    height: unset !important;
      top: 105px;
      left: 0;
      right: 0;
      padding: 0;
      background: rgba(255, 255, 255, 0.98);
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
      box-shadow: none;
    }
    
    .nav.active {
      max-height: 300px;
      box-shadow: var(--shadow-lg);
    }
    
    .nav-menu {
      flex-direction: column;
      width: 100%;
      padding: 12px 0;
    }
    
    .nav-link {
      width: 100%;
      text-align: center;
      padding: 12px 16px;
      border-radius: 0;
      border-bottom: 1px solid var(--border-light);
      font-size: 14px;
    }
    
    .nav-link:last-child {
      border-bottom: none;
    }
    
    body {
      padding-top: 80px;
    }
  }
</style>
</head>
<body>
  <div class="top-bar">
    <a href="./" class="logo-container">
      <img src="./assets/img/byte_export.png" alt="ByteExport Logo" class="logo-img">
    </a>
    <button class="hamburger-menu" id="hamburgerMenu" aria-label="Menu">
      <span></span>
      <span></span>
      <span></span>
    </button>
  </div>
  <nav class="nav" id="mainNav">
    <div class="nav-menu">
      <a href="./" class="nav-link active">🏠 Ana Sayfa</a>
      <a href="contacts" class="nav-link">👥 Kişiler</a>
      <a href="monitor" class="nav-link">📊 Monitör</a>
      <a href="disk-status" class="nav-link disk-status-link">💾 Disk Durumu</a>
      <a href="#" class="nav-link" onclick="openStatusModal()">⚡ Durum</a>
    </div>
  </nav>

  <div class="card">
    <h2>WhatsApp QR Bağlantısı</h2>
    <p>Telefonunuzda WhatsApp ➜ Bağlı cihazlar ➜ Cihaz bağla; bu ekrandaki QR'ı okutun.</p>
    <div class="qr"><img id="qr" alt="QR Kodu" /></div>
    <div class="status warn" id="status">🔄 Bağlantı kontrol ediliyor...</div>

    <div class="features">
      <h3>🚀 Özellikler</h3>
      <ul>
        <li>📹 Video gönderimi (n8n entegrasyonu)</li>
        <li>👥 Kişi yönetimi (ülke bazlı)</li>
        <li>🌍 Çoklu dil desteği</li>
        <li>⚡ Otomatik kuyruk sistemi</li>
        <li>📊 Canlı durumu takibi</li>
      </ul>
    </div>

    <div class="footer">
      wa-bridge-local v1.0 — Byte Export WhatsApp Automation
    </div>
  </div>

  <!-- Status Modal -->
  <div id="statusModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>⚡ WhatsApp Durum</h3>
        <span class="close" onclick="closeStatusModal()">&times;</span>
      </div>
      <div class="modal-body">
        <div class="status-info">
          <div class="status-row">
            <span class="status-label">Bağlantı Durumu:</span>
            <span id="modalStatus" class="status-value">Kontrol ediliyor...</span>
          </div>
          <div class="status-row">
            <span class="status-label">Son Kontrol:</span>
            <span id="lastCheck" class="status-value">-</span>
          </div>
          <div class="status-row">
            <span class="status-label">Session:</span>
            <span id="sessionInfo" class="status-value">-</span>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-danger" onclick="clearSession()">
            🗑️ Session Temizle & QR Reset
          </button>
          <button class="btn btn-secondary" onclick="logoutWhatsApp()">
            🚪 Sadece Çıkış Yap
          </button>
          <button class="btn btn-secondary" onclick="refreshStatus()">
            🔄 Durumu Yenile
          </button>
        </div>
      </div>
    </div>
  </div>
<script>
// Global BASE_PATH for API calls
window.BASE_PATH = "${BASE_PATH || ''}";

// Hamburger Menu Toggle
const hamburgerMenu = document.getElementById('hamburgerMenu');
const mainNav = document.getElementById('mainNav');

if (hamburgerMenu && mainNav) {
  hamburgerMenu.addEventListener('click', function() {
    this.classList.toggle('active');
    mainNav.classList.toggle('active');
  });

  // Close menu when clicking outside
  document.addEventListener('click', function(event) {
    const isClickInsideNav = mainNav.contains(event.target);
    const isClickOnHamburger = hamburgerMenu.contains(event.target);
    
    if (!isClickInsideNav && !isClickOnHamburger && mainNav.classList.contains('active')) {
      hamburgerMenu.classList.remove('active');
      mainNav.classList.remove('active');
    }
  });

  // Close menu when clicking on a link
  const navLinks = mainNav.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', function() {
      hamburgerMenu.classList.remove('active');
      mainNav.classList.remove('active');
    });
  });
}

async function refresh(){
  try{
    const s = await fetch("status").then(r=>r.json());
    const statusEl = document.getElementById("status");
    const qrContainer = document.querySelector(".qr");

    if(s.ready){
      statusEl.textContent = "✅ WhatsApp bağlı ve hazır!";
      statusEl.className = "status ok";
      qrContainer.style.display = "none"; // QR alanını tamamen gizle
      return; // WhatsApp bağlıyken QR isteği yapma
    }else{
      statusEl.textContent = "⚠️ WhatsApp bağlı değil (QR bekleniyor)";
      statusEl.className = "status warn";
      qrContainer.style.display = "block"; // QR alanını göster
      qrContainer.innerHTML = '<img id="qr" alt="QR Kodu" />';

      // Sadece WhatsApp bağlı değilken QR isteği yap
      try {
        const q = await fetch("qr").then(r=>r.json());
        const newQrEl = document.getElementById("qr");
        if(newQrEl) newQrEl.src = q.dataUrl || "";
      } catch(qrError) {
        console.log("QR alınamadı:", qrError);
        // QR alınamazsa sessizce devam et
      }
    }
  }catch(e){
    document.getElementById("status").textContent = "❌ Bağlantı hatası";
    document.getElementById("status").className = "status warn";
    console.error("Status kontrol hatası:", e);
  }
}
refresh();
setInterval(refresh, 5000);

// Modal Functions
function openStatusModal() {
  document.getElementById('statusModal').style.display = 'block';
  refreshStatus();
}

function closeStatusModal() {
  document.getElementById('statusModal').style.display = 'none';
}

function refreshStatus() {
  const now = new Date().toLocaleString('tr-TR');
  document.getElementById('lastCheck').textContent = now;

  fetch('status')
    .then(r => r.json())
    .then(s => {
      document.getElementById('modalStatus').textContent = s.ready ? '✅ Bağlı ve Hazır' : '⚠️ Bağlı Değil';
      document.getElementById('sessionInfo').textContent = s.ready ? 'Aktif' : 'Bekleniyor';
    })
    .catch(e => {
      document.getElementById('modalStatus').textContent = '❌ Hata';
      document.getElementById('sessionInfo').textContent = 'Bilinmiyor';
    });
}

async function logoutWhatsApp() {
  if (!confirm('⚠️ SADECE ÇIKIŞ\\n\\nWhatsApp oturumu kapatılacak ama session dosyaları korunacak.\\nBu sayede server restart sonrası tekrar otomatik bağlanabilirsiniz.\\n\\nDevam etmek istediğinizden emin misiniz?')) {
    return;
  }

  try {
    const response = await fetch('logout', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      alert('✅ Çıkış işlemi başarılı!\\nSession korundu. Server restart ile tekrar bağlanabilirsiniz.');
      closeStatusModal();
      setTimeout(() => window.location.reload(), 1000);
    } else {
      alert('❌ Çıkış işlemi başarısız: ' + result.error);
    }
  } catch (error) {
    alert('❌ Bağlantı hatası: ' + error.message);
  }
}

async function clearSession() {
  if (!confirm('⚠️ TÜM SESSION TEMİZLENECEK!\\n\\nBu işlem tüm WhatsApp session dosyalarını silecek.\\nYeniden QR kod okutmanız gerekecek.\\n\\nSadece sorun yaşıyorsanız kullanın!\\n\\nDevam etmek istediğinizden emin misiniz?')) {
    return;
  }

  try {
    const response = await fetch('clear-session', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      alert('✅ Session temizlendi!\\nSayfa yenilenecek ve yeni QR kod görünecek.');
      closeStatusModal();
      setTimeout(() => window.location.reload(), 1000);
    } else {
      alert('❌ Session temizleme başarısız: ' + result.error);
    }
  } catch (error) {
    alert('❌ Bağlantı hatası: ' + error.message);
  }
}

// Modal dışına tıklayınca kapat
window.onclick = function(event) {
  const modal = document.getElementById('statusModal');
  if (event.target === modal) {
    closeStatusModal();
  }
}
</script>
</body>
</html>`;

// ==== Global Request Logger Middleware ====
app.use((req, res, next) => {
  const start = Date.now();
  logger.info(`[REQUEST] ${req.method} ${req.url}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`[RESPONSE] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });

  next();
});

// ==== Rotalar ====
app.get("/", requireAuth, (req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(HTML_PAGE);
});

// ==== Kişi yönetimi API'leri ====
// Kişi listesini getir
app.get("/api/contacts", (req, res) => {
  const contactsData = loadContacts();
  res.json(contactsData);
});

// Kişi listesini kaydet
app.post("/api/contacts/save", (req, res) => {
  const startTime = Date.now();
  const { contacts } = req.body || {};
  logEndpoint('/api/contacts/save', 'POST', req.body, 'started');

  if (!Array.isArray(contacts)) {
    const error = { error: "Contacts array gerekli." };
    logger.warn('[CONTACTS-SAVE] Validation failed', { contacts: typeof contacts, error: error.error });
    logEndpoint('/api/contacts/save', 'POST', req.body, { ...error, success: false });
    return res.status(400).json(error);
  }

  const contactsData = loadContacts();
  contactsData.contacts = contacts;

  if (saveContacts(contactsData)) {
    const processingTime = Date.now() - startTime;
    const response = { success: true, count: contacts.length, processingTime };
    logger.info('[CONTACTS-SAVE] Success', { count: contacts.length, processingTime });
    logEndpoint('/api/contacts/save', 'POST', req.body, response);
    res.json(response);
  } else {
    const processingTime = Date.now() - startTime;
    const error = { error: "Kaydetme hatası.", success: false, processingTime };
    logger.error('[CONTACTS-SAVE] Failed to save', { count: contacts.length, processingTime });
    logEndpoint('/api/contacts/save', 'POST', req.body, error);
    res.status(500).json(error);
  }
});

// Kişi listesini temizle
app.post("/api/contacts/clear", (req, res) => {
  const startTime = Date.now();
  logEndpoint('/api/contacts/clear', 'POST', req.body, 'started');

  try {
    const contactsData = loadContacts();
    const previousCount = contactsData.contacts.length;
    contactsData.contacts = [];
    contactsData.lastUpdated = new Date().toISOString();

    if (saveContacts(contactsData)) {
      const processingTime = Date.now() - startTime;
      const response = { success: true, message: "Tüm kişiler başarıyla silindi.", previousCount, processingTime };
      logger.info('[CONTACTS-CLEAR] Success', { previousCount, processingTime });
      logEndpoint('/api/contacts/clear', 'POST', req.body, response);
      res.json(response);
    } else {
      const processingTime = Date.now() - startTime;
      const error = { error: "Temizleme sırasında hata oluştu.", success: false, processingTime };
      logger.error('[CONTACTS-CLEAR] Failed to save', { previousCount, processingTime });
      logEndpoint('/api/contacts/clear', 'POST', req.body, error);
      res.status(500).json(error);
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('[CONTACTS-CLEAR] Exception', { error: error.message, stack: error.stack, processingTime });
    logEndpoint('/api/contacts/clear', 'POST', req.body, { error: error.message, success: false, processingTime });
    res.status(500).json({ error: "Temizleme sırasında hata oluştu." });
  }
});

// Ülke bazlı aktif kişileri getir
app.get("/api/contacts/active", (req, res) => {
  const { country, language } = req.query;
  const contactsData = loadContacts();

  let activeContacts = contactsData.contacts.filter(c => c.active);

  if (country) {
    activeContacts = activeContacts.filter(c => c.country === country.toUpperCase());
  }

  if (language) {
    activeContacts = activeContacts.filter(c => c.language === language.toLowerCase());
  }

  res.json({
    contacts: activeContacts,
    count: activeContacts.length,
    countries: contactsData.countries
  });
});

// ========================================
// GROUPS API ENDPOINTS
// ========================================

// Grup listesini getir
app.get("/api/groups", (req, res) => {
  const groupsData = loadGroups();
  res.json(groupsData);
});

// Grup listesini kaydet
app.post("/api/groups/save", (req, res) => {
  const startTime = Date.now();
  const { groups } = req.body || {};
  logEndpoint('/api/groups/save', 'POST', req.body, 'started');

  if (!Array.isArray(groups)) {
    const error = { error: "Groups array gerekli." };
    logger.warn('[GROUPS-SAVE] Validation failed', { groups: typeof groups, error: error.error });
    logEndpoint('/api/groups/save', 'POST', req.body, { ...error, success: false });
    return res.status(400).json(error);
  }

  const groupsData = loadGroups();
  groupsData.groups = groups;

  if (saveGroups(groupsData)) {
    const processingTime = Date.now() - startTime;
    const response = { success: true, count: groups.length, processingTime };
    logger.info('[GROUPS-SAVE] Success', { count: groups.length, processingTime });
    logEndpoint('/api/groups/save', 'POST', req.body, response);
    res.json(response);
  } else {
    const processingTime = Date.now() - startTime;
    const error = { error: "Kaydetme hatası.", success: false, processingTime };
    logger.error('[GROUPS-SAVE] Failed to save', { count: groups.length, processingTime });
    logEndpoint('/api/groups/save', 'POST', req.body, error);
    res.status(500).json(error);
  }
});

// Grup listesini temizle
app.post("/api/groups/clear", (req, res) => {
  const startTime = Date.now();
  logEndpoint('/api/groups/clear', 'POST', req.body, 'started');

  try {
    const groupsData = loadGroups();
    const previousCount = groupsData.groups.length;
    groupsData.groups = [];
    groupsData.lastUpdated = new Date().toISOString();

    if (saveGroups(groupsData)) {
      const processingTime = Date.now() - startTime;
      const response = { success: true, message: "Tüm gruplar başarıyla silindi.", previousCount, processingTime };
      logger.info('[GROUPS-CLEAR] Success', { previousCount, processingTime });
      logEndpoint('/api/groups/clear', 'POST', req.body, response);
      res.json(response);
    } else {
      const processingTime = Date.now() - startTime;
      const error = { error: "Temizleme sırasında hata oluştu.", success: false, processingTime };
      logger.error('[GROUPS-CLEAR] Failed to save', { previousCount, processingTime });
      logEndpoint('/api/groups/clear', 'POST', req.body, error);
      res.status(500).json(error);
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('[GROUPS-CLEAR] Exception', { error: error.message, stack: error.stack, processingTime });
    logEndpoint('/api/groups/clear', 'POST', req.body, { error: error.message, success: false, processingTime });
    res.status(500).json({ error: "Temizleme sırasında hata oluştu." });
  }
});

// Aktif grupları getir
app.get("/api/groups/active", (req, res) => {
  const groupsData = loadGroups();
  const activeGroups = groupsData.groups.filter(g => g.isActive);

  res.json({
    groups: activeGroups,
    count: activeGroups.length
  });
});

// Dil bazlı mesaj template'leri getir
app.get("/api/templates/:language", (req, res) => {
  const { language } = req.params;
  const contactsData = loadContacts();

  const template = contactsData.messageTemplates[language];
  if (!template) {
    return res.status(404).json({ error: "Template bulunamadı." });
  }

  res.json(template);
});

// Kişi yönetim sayfası
app.get("/contacts", requireAuth, (req, res) => {
  // CSP header ekle - blob: URL'leri ve media'ya izin ver
  res.setHeader(
    'Content-Security-Policy',
    "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'"
  );

  const contactsPath = path.join(process.cwd(), "contacts.html");
  if (fs.existsSync(contactsPath)) {
    let html = fs.readFileSync(contactsPath, 'utf-8');

    // Inject base tag after <head>
    const baseTag = `<base href="${BASE_PATH ? BASE_PATH + '/' : '/'}">`;
    html = html.replace('<head>', `<head>\n    ${baseTag}`);

    // Inject BASE_PATH and fetch wrapper before first <script>
    const basePathScript = `<script>
      window.BASE_PATH = "${BASE_PATH || ''}";
      // Wrapper for fetch to handle BASE_PATH automatically
      window._fetch = window.fetch;
      window.fetch = function(url, ...args) {
        if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
          // Skip BASE_PATH only for /assets/ (CSS, JS) - .json files need BASE_PATH
          if (!url.startsWith('/assets/')) {
            url = window.BASE_PATH + url;
          }
        }
        return window._fetch(url, ...args);
      };
    </script>`;
    html = html.replace('<script', `${basePathScript}\n    <script`);

    // Fix absolute paths to relative
    html = html.replace(/href="\/"/g, 'href="./"');
    html = html.replace(/href="\/monitor"/g, 'href="monitor"');
    html = html.replace(/href="\/contacts"/g, 'href="contacts"');
    html = html.replace(/href="\/groups"/g, 'href="groups"');
    html = html.replace(/href="\/assets\//g, 'href="assets/');
    html = html.replace(/src="\/assets\//g, 'src="assets/');

    res.send(html);
  } else {
    res.status(404).send("Kişi yönetim sayfası bulunamadı.");
  }
});

// Grup yönetimi sayfası
app.get("/groups", requireAuth, (req, res) => {
  const groupsPath = path.join(process.cwd(), "groups.html");
  if (fs.existsSync(groupsPath)) {
    let html = fs.readFileSync(groupsPath, 'utf-8');

    // Inject base tag after <head>
    const baseTag = `<base href="${BASE_PATH ? BASE_PATH + '/' : '/'}">`;
    html = html.replace('<head>', `<head>\n    ${baseTag}`);

    // Inject BASE_PATH and fetch wrapper before first <script>
    const basePathScript = `<script>
      window.BASE_PATH = "${BASE_PATH || ''}";
      // Wrapper for fetch to handle BASE_PATH automatically
      window._fetch = window.fetch;
      window.fetch = function(url, ...args) {
        if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
          // Skip BASE_PATH only for /assets/ (CSS, JS) - .json files need BASE_PATH
          if (!url.startsWith('/assets/')) {
            url = window.BASE_PATH + url;
          }
        }
        return window._fetch(url, ...args);
      };
    </script>`;
    html = html.replace('<script', `${basePathScript}\n    <script`);

    // Fix absolute paths to relative
    html = html.replace(/href="\/"/g, 'href="./"');
    html = html.replace(/href="\/monitor"/g, 'href="monitor"');
    html = html.replace(/href="\/contacts"/g, 'href="contacts"');
    html = html.replace(/href="\/groups"/g, 'href="groups"');
    html = html.replace(/href="\/assets\//g, 'href="assets/');
    html = html.replace(/src="\/assets\//g, 'src="assets/');

    res.send(html);
  } else {
    res.status(404).send("Grup yönetim sayfası bulunamadı.");
  }
});

// Sistem monitör sayfası
app.get("/monitor", requireAuth, (req, res) => {
  const monitorPath = path.join(process.cwd(), "monitor.html");
  if (fs.existsSync(monitorPath)) {
    let html = fs.readFileSync(monitorPath, 'utf-8');

    // Inject base tag after <head>
    const baseTag = `<base href="${BASE_PATH ? BASE_PATH + '/' : '/'}">`;
    html = html.replace('<head>', `<head>\n    ${baseTag}`);

    // Inject BASE_PATH and fetch wrapper before first <script>
    const basePathScript = `<script>
      window.BASE_PATH = "${BASE_PATH || ''}";
      // Wrapper for fetch to handle BASE_PATH automatically
      window._fetch = window.fetch;
      window.fetch = function(url, ...args) {
        if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
          // Skip BASE_PATH only for /assets/ (CSS, JS) - .json files need BASE_PATH
          if (!url.startsWith('/assets/')) {
            url = window.BASE_PATH + url;
          }
        }
        return window._fetch(url, ...args);
      };
    </script>`;
    html = html.replace('<script', `${basePathScript}\n    <script`);

    // Fix absolute paths to relative
    html = html.replace(/href="\/"/g, 'href="./"');
    html = html.replace(/href="\/monitor"/g, 'href="monitor"');
    html = html.replace(/href="\/contacts"/g, 'href="contacts"');
    html = html.replace(/href="\/groups"/g, 'href="groups"');
    html = html.replace(/href="\/assets\//g, 'href="assets/');
    html = html.replace(/src="\/assets\//g, 'src="assets/');

    res.send(html);
  } else {
    res.status(404).send("Monitör sayfası bulunamadı.");
  }
});

// Disk durumu sayfası
app.get("/disk-status", requireAuth, (req, res) => {
  const diskStatusPath = path.join(process.cwd(), "disk-status.html");
  if (fs.existsSync(diskStatusPath)) {
    res.sendFile(diskStatusPath);
  } else {
    res.status(404).send("Disk durumu sayfası bulunamadı.");
  }
});

// Monitor API - İstatistikler ve aktivite logları
app.get("/api/monitor/stats", (req, res) => {
  try {
    // ✅ Active jobs'ları topla
    const activeJobs = [];
    for (const [requestId, job] of jobStore.entries()) {
      if (job.status === 'processing') {
        activeJobs.push({
          requestId,
          status: job.status,
          progress: job.progress,
          startTime: job.startTime,
          cancelled: job.cancelled
        });
      }
    }
    
    res.json({
      ...global.monitorStats,
      activityLogs: global.activityLogs || [],
      activeJobs
    });
  } catch (error) {
    console.error("[API] Monitor stats hatası:", error);
    res.status(500).json({ error: "İstatistikler yüklenemedi" });
  }
});

// Monitor API - Cache bilgileri
app.get("/api/monitor/cache", (req, res) => {
  try {
    const cacheData = [];
    for (const [url, cache] of videoCache.entries()) {
      cacheData.push({
        url: url,
        fileName: path.basename(cache.filePath),
        size: cache.size,
        useCount: cache.useCount,
        downloadTime: cache.downloadTime
      });
    }
    res.json({ cacheData });
  } catch (error) {
    console.error("[API] Cache bilgileri hatası:", error);
    res.status(500).json({ error: "Cache bilgileri yüklenemedi" });
  }
});

// Monitor API - Sistem metrikleri
app.get("/api/monitor/system", (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    res.json({
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: Math.round(process.uptime()),
      pid: process.pid
    });
  } catch (error) {
    console.error("[API] Sistem metrikleri hatası:", error);
    res.status(500).json({ error: "Sistem metrikleri yüklenemedi" });
  }
});

// Diagnostics: connection/reconnect counters & status
app.get('/api/diagnostics', (req, res) => {
  try {
    res.json({
      ready,
      connecting,
      attempts: globalThis.__reconnectAttempts || 0,
      conflictCount,
      streamErrorCount,
      unauthorizedCount,
      hasEverOpened,
      lastConnectAttempt
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'diagnostics failed' });
  }
});

// WhatsApp'tan gerçek kişileri çek - TUTARLI ve EKSIKSIZ
app.get("/api/whatsapp-contacts", async (req, res) => {
  if (!ready) {
    return res.status(503).json({ error: "WhatsApp hazır değil." });
  }

  try {
    console.log("[API] WhatsApp kişileri çekiliyor... (Baileys ContactStore)");

    // Baileys contactStore'dan tüm kontakları al
    const allContacts = Object.values(contactStore);
    
    console.log(`[API] ContactStore'da ${allContacts.length} toplam contact`);
    
    // Baileys v6.7.x bug workaround: Eğer boşsa kullanıcıya bilgi ver
    if (allContacts.length === 0) {
      console.log('[API WARNING] ContactStore boş! Baileys contacts sync henüz tamamlanmamış olabilir.');
      console.log('[API TIP] Bağlantı sonrası 30-60 saniye bekleyip tekrar deneyin.');
      return res.json({
        success: true,
        count: 0,
        contacts: [],
        stats: {
          source: 'baileys',
          total: 0,
          filtered: 0,
          unique: 0,
          duplicatesRemoved: 0
        },
        warning: 'Kişi senkronizasyonu henüz tamamlanmadı. Lütfen 30 saniye bekleyip tekrar deneyin.'
      });
    }

    // Detaylı filtreleme - SADECE grupları çıkar, TÜM kişileri al
    const filteredContacts = allContacts.filter(contact => {
      const isNotGroup = !contact.id.includes('@g.us'); // Grup değil
      const isNotBroadcast = !contact.id.includes('@broadcast'); // Broadcast değil
      const isValidWhatsAppUser = contact.id.includes('@s.whatsapp.net'); // Gerçek WhatsApp kullanıcısı
      
      // İsim kontrolü - en az bir isim varsa yeterli
      const hasName = contact.name || contact.pushname || contact.verifiedName || contact.notify;
      
      // Telefon numarasını çıkar ve kontrol et
      const phoneNumber = contact.id.split('@')[0].replace(/[^\d]/g, '');
      const hasValidPhone = phoneNumber.length >= 10; // En az 10 haneli telefon

      return isNotGroup && isNotBroadcast && isValidWhatsAppUser && hasValidPhone;
    });

    console.log(`[API] ${filteredContacts.length} filtrelenmiş contact`);

    // Sadece geçerli WhatsApp kullanıcılarını map et
    const whatsappContacts = filteredContacts.map((contact, index) => {
      // Telefon numarasını temizle (JID'den al: 905551234567@s.whatsapp.net -> 905551234567)
      const phoneNumber = contact.id.split('@')[0].replace(/[^\d]/g, '');

      // İsim önceliği: name > pushname > verifiedName > notify > phone
      const contactName = contact.name || contact.pushname || contact.verifiedName || contact.notify || phoneNumber;

      // Yeni ülke tespit sistemi kullan
      const countryInfo = detectCountryFromPhone(phoneNumber);

      const contactData = {
        id: index + 1000, // WhatsApp kişileri için yüksek ID
        name: contactName.trim(),
        phone: phoneNumber,
        country: countryInfo.country,
        language: countryInfo.language,
        active: true,
        tags: ["whatsapp"],
        addedDate: new Date().toISOString(),
        lastMessageDate: null,
        notes: `WhatsApp'tan aktarıldı (Baileys)`
      };

      return contactData;
    });

    // Tekrar eden telefon numaralarını kaldır
    const uniqueContacts = [];
    const seenPhones = new Set();

    for (const contact of whatsappContacts) {
      if (!seenPhones.has(contact.phone)) {
        seenPhones.add(contact.phone);
        uniqueContacts.push(contact);
      }
    }

    console.log(`[API] FINAL: ${uniqueContacts.length} benzersiz WhatsApp kişisi bulundu.`);

    res.json({
      success: true,
      count: uniqueContacts.length,
      contacts: uniqueContacts,
      stats: {
        source: 'baileys',
        total: allContacts.length,
        filtered: filteredContacts.length,
        unique: uniqueContacts.length,
        duplicatesRemoved: whatsappContacts.length - uniqueContacts.length
      }
    });

  } catch (error) {
    console.error("[API] WhatsApp kişileri çekilemedi:", error.message);
    res.status(500).json({
      error: "WhatsApp kişileri çekilemedi.",
      details: error.message
    });
  }
});

// WhatsApp kişilerini contacts.json'a ekle/birleştir
app.post("/api/import-whatsapp-contacts", async (req, res) => {
  if (!ready) {
    return res.status(503).json({ error: "WhatsApp hazır değil." });
  }

  try {
    console.log("[IMPORT] WhatsApp kişileri import ediliyor...");

    // WhatsApp kişilerini çek
    const whatsappResponse = await fetch(`http://localhost:${PORT}/api/whatsapp-contacts`);
    const whatsappData = await whatsappResponse.json();

    if (!whatsappData.success) {
      throw new Error("WhatsApp kişileri çekilemedi.");
    }

    console.log(`[IMPORT] WhatsApp'tan ${whatsappData.count} kişi alındı`);
    console.log(`[IMPORT] Stats:`, whatsappData.stats);

    // Mevcut contacts.json'ı yükle
    const contactsData = loadContacts();
    console.log(`[IMPORT] Mevcut contacts.json'da ${contactsData.contacts.length} kişi var`);

    // Mevcut kişiler ile WhatsApp kişilerini birleştir (telefon bazında kontrol)
    const existingPhones = new Set(contactsData.contacts.map(c => c.phone));
    console.log(`[IMPORT] Mevcut telefon numaraları: ${existingPhones.size}`);

    const newContacts = whatsappData.contacts.filter(c => {
      const isNew = !existingPhones.has(c.phone);
      return isNew;
    });

    console.log(`[IMPORT] ${newContacts.length} yeni kişi ekleniyor`);

    // Yeni kişileri ekle
    contactsData.contacts = [...contactsData.contacts, ...newContacts];

    // Son import tarihini kaydet
    contactsData.lastWhatsAppImport = new Date().toISOString();
    contactsData.importStats = {
      lastImportDate: new Date().toISOString(),
      whatsappTotal: whatsappData.stats.total,
      whatsappFiltered: whatsappData.stats.filtered,
      whatsappUnique: whatsappData.stats.unique,
      previousContactCount: contactsData.contacts.length - newContacts.length,
      newContactsAdded: newContacts.length,
      totalAfterImport: contactsData.contacts.length
    };

    // Kaydet
    if (saveContacts(contactsData)) {
      console.log(`[IMPORT] Başarılı: ${newContacts.length} yeni kişi eklendi, toplam: ${contactsData.contacts.length}`);

      res.json({
        success: true,
        imported: newContacts.length,
        total: contactsData.contacts.length,
        stats: contactsData.importStats,
        message: `${newContacts.length} yeni WhatsApp kişisi eklendi. Toplam: ${contactsData.contacts.length}`
      });
    } else {
      throw new Error("Kaydetme hatası.");
    }

  } catch (error) {
    console.error("[IMPORT] WhatsApp kişileri import edilemedi:", error.message);
    res.status(500).json({
      error: "WhatsApp kişileri import edilemedi.",
      details: error.message
    });
  }
});

// ========================================
// WHATSAPP GROUPS ENDPOINTS
// ========================================

// WhatsApp'tan grup listesini çek
app.get("/api/whatsapp-groups", async (req, res) => {
  if (!ready) {
    return res.status(503).json({ error: "WhatsApp hazır değil." });
  }

  try {
    console.log("[API] WhatsApp grupları çekiliyor... (Baileys)");

    // Baileys'te grupları çekmek için groupFetchAllParticipating kullan
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups);
    
    console.log(`[API] ${groupList.length} toplam grup bulundu`);

    // Grup detaylarını map et
    const groupDetails = groupList.map((group, index) => {
      try {
        const participantCount = group.participants ? group.participants.length : 0;

        return {
          id: group.id, // Örnek: "1234567890-123456789@g.us"
          name: group.subject || "İsimsiz Grup",
          participantCount: participantCount,
          isActive: true, // Varsayılan olarak aktif
          isGroup: true,
          createdAt: group.creation || Date.now(),
          addedDate: new Date().toISOString()
        };
      } catch (error) {
        console.error(`[API] Grup ${group.subject} için hata:`, error.message);
        return null;
      }
    });

    // Null olan (hata alan) grupları filtrele
    const validGroups = groupDetails.filter(g => g !== null);

    console.log(`[API] ${validGroups.length} grup başarıyla işlendi`);

    res.json({
      success: true,
      groups: validGroups,
      count: validGroups.length,
      stats: {
        source: 'baileys',
        total: groupList.length,
        validGroups: validGroups.length
      }
    });

  } catch (error) {
    console.error("[API] WhatsApp grupları çekilemedi:", error.message);
    res.status(500).json({
      error: "WhatsApp grupları çekilemedi.",
      details: error.message
    });
  }
});

// WhatsApp gruplarını import et ve groups.json'a kaydet
app.post("/api/import-whatsapp-groups", async (req, res) => {
  if (!ready) {
    return res.status(503).json({ error: "WhatsApp hazır değil." });
  }

  try {
    console.log("[IMPORT-GROUPS] WhatsApp grupları import ediliyor...");

    // WhatsApp gruplarını çek
    const whatsappResponse = await fetch(`http://localhost:${PORT}/api/whatsapp-groups`);
    const whatsappData = await whatsappResponse.json();

    if (!whatsappData.success) {
      throw new Error("WhatsApp grupları çekilemedi.");
    }

    console.log(`[IMPORT-GROUPS] WhatsApp'tan ${whatsappData.count} grup alındı`);

    // Mevcut groups.json'ı yükle
    const groupsData = loadGroups();
    console.log(`[IMPORT-GROUPS] Mevcut groups.json'da ${groupsData.groups.length} grup var`);

    // Mevcut gruplar ile WhatsApp gruplarını birleştir (id bazında kontrol)
    const existingGroupIds = new Set(groupsData.groups.map(g => g.id));
    console.log(`[IMPORT-GROUPS] Mevcut grup ID'leri: ${existingGroupIds.size}`);

    const newGroups = whatsappData.groups.filter(g => {
      const isNew = !existingGroupIds.has(g.id);
      return isNew;
    });

    console.log(`[IMPORT-GROUPS] ${newGroups.length} yeni grup ekleniyor`);

    // Yeni grupları ekle
    groupsData.groups = [...groupsData.groups, ...newGroups];

    // Son import tarihini kaydet
    groupsData.lastWhatsAppImport = new Date().toISOString();
    groupsData.importStats = {
      lastImportDate: new Date().toISOString(),
      whatsappTotal: whatsappData.stats.total,
      whatsappGroups: whatsappData.stats.groups,
      whatsappValidGroups: whatsappData.stats.validGroups,
      previousGroupCount: groupsData.groups.length - newGroups.length,
      newGroupsAdded: newGroups.length,
      totalAfterImport: groupsData.groups.length
    };

    // Kaydet
    if (saveGroups(groupsData)) {
      console.log(`[IMPORT-GROUPS] Başarılı: ${newGroups.length} yeni grup eklendi, toplam: ${groupsData.groups.length}`);

      res.json({
        success: true,
        imported: newGroups.length,
        total: groupsData.groups.length,
        stats: groupsData.importStats,
        message: `${newGroups.length} yeni WhatsApp grubu eklendi. Toplam: ${groupsData.groups.length}`
      });
    } else {
      throw new Error("Kaydetme hatası.");
    }

  } catch (error) {
    console.error("[IMPORT-GROUPS] WhatsApp grupları import edilemedi:", error.message);
    res.status(500).json({
      error: "WhatsApp grupları import edilemedi.",
      details: error.message
    });
  }
});

// WhatsApp'a kişi ekle
app.post("/api/add-to-whatsapp", async (req, res) => {
  if (!ready) {
    return res.status(503).json({ error: "WhatsApp hazır değil." });
  }

  try {
    const { name, phone, message } = req.body;

    if (!name || !phone || !message) {
      return res.status(400).json({ error: "Ad, telefon numarası ve mesaj gerekli." });
    }

    console.log(`[WHATSAPP ADD] Kişi ekleniyor: ${name} - ${phone}`);

    // Telefon numarasını düzelt (başında + yoksa ekle)
    let formattedPhone = phone.replace(/\D/g, ''); // Sadece rakamlar
    if (!formattedPhone.startsWith('90')) {
      formattedPhone = '90' + formattedPhone;
    }

    // Baileys JID formatı: phone@s.whatsapp.net
    const jid = `${formattedPhone}@s.whatsapp.net`;

    // Özel karşılama mesajını gönder
    await sock.sendMessage(jid, { text: message });

    console.log(`[WHATSAPP ADD] Başarılı: ${name} (+${formattedPhone}) WhatsApp'a eklendi`);

    res.json({
      success: true,
      message: `${name} WhatsApp kişilerinize eklendi`,
      phone: '+' + formattedPhone,
      sentMessage: message
    });

  } catch (error) {
    console.error("[WHATSAPP ADD] Kişi eklenirken hata:", error.message);
    res.status(500).json({
      error: "Kişi WhatsApp'a eklenemedi.",
      details: error.message
    });
  }
});

app.get("/qr", async (req, res) => {
  try {
    if (ready) {
      return res.json({ dataUrl: "", mode: 'connected' });
    }

    // Pairing code tercih: FORCE_PAIRING_CODE=true ise daima pairing dene; aksi halde pairing'i QR'dan önce dene
  const preferPairing = String(process.env.FORCE_PAIRING_CODE || 'false').toLowerCase() === 'true';

    const now = Date.now();
    const REGEN_MS = 120000; // 2dk aynı kodu sun
    const canPair = !!(sock && typeof sock.requestPairingCode === 'function');

    if (preferPairing && canPair) {
      // Telefon numarasını belirle (query > env > önceki)
      const qPhone = (req.query && req.query.phone) ? String(req.query.phone) : null;
      if (qPhone) {
        lastPairPhone = qPhone.replace(/\D/g, '');
      }
      const envPhone = process.env.PAIR_PHONE ? String(process.env.PAIR_PHONE) : null;
      const phoneBaseRaw = lastPairPhone || envPhone || '';
      const phoneBase = phoneBaseRaw.replace(/\D/g, '');

      // Uygun telefon yoksa pairing denemesini atla (QR'a düş)
      if (!phoneBase) {
        logger.warn('[PAIR] Telefon numarası sağlanmadı (query ?phone= veya PAIR_PHONE env)');
      } else if (!lastPairingCode || (now - lastPairingCodeAt) > REGEN_MS) {
        try {
          lastPairingCode = await sock.requestPairingCode(phoneBase);
          lastPairingCodeAt = now;
          logger.info(`[PAIR] Yeni pairing code üretildi (${phoneBase}): ${lastPairingCode}`);
        } catch (e) {
          logger.warn('[PAIR] Pairing code üretilemedi:', e.message);
        }
      }
      if (lastPairingCode) {
        return res.json({ code: lastPairingCode, mode: 'pairing', ageMs: now - lastPairingCodeAt });
      }
    }

    // Pairing mümkün değilse veya başarısızsa QR'a düş
    if (lastQrString) {
      const dataUrl = await QRCode.toDataURL(lastQrString, { margin: 1, scale: 6 });
      return res.json({ dataUrl, mode: 'qr' });
    }

    // Pairing mümkünse ama prefer=false ise (opsiyonel) bir şans ver
    if (!preferPairing && canPair) {
      if (!lastPairingCode || (now - lastPairingCodeAt) > REGEN_MS) {
        try {
          const phoneBase = process.env.PAIR_PHONE || '905551234567';
          lastPairingCode = await sock.requestPairingCode(phoneBase);
          lastPairingCodeAt = now;
        } catch (e) {}
      }
      if (lastPairingCode) {
        return res.json({ code: lastPairingCode, mode: 'pairing', ageMs: now - lastPairingCodeAt });
      }
    }

    return res.json({ dataUrl: "", mode: 'waiting' });
  } catch (e) {
    logger.error('[QR] Error generating', { error: e.message });
    return res.json({ dataUrl: "", mode: 'error', error: e.message });
  }
});

app.get("/status", (req, res) => res.json({ ready, port: PORT, tunnelUrl: TUNNEL_URL }));

// Health check endpoint (Render.com için)
app.get("/health", (req, res) => {
  res.json({
    status: 'ok',
    whatsapp: ready ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    queue: QUEUE.length,
    timestamp: new Date().toISOString()
  });
});

// Tunnel URL'yi döner
app.get("/api/tunnel/url", (req, res) => {
  if (TUNNEL_URL) return res.json({ url: TUNNEL_URL });
  return res.status(404).json({ error: "Tunnel not active" });
});

// Default browser'da arayüzü aç (tunnel varsa onu, yoksa localhost)
app.get("/open", (req, res) => {
  const target = TUNNEL_URL || `http://localhost:${PORT}`;
  openInDefaultBrowser(target);
  res.json({ opened: true, url: target });
});

// Job cancel endpoint
app.post("/api/job/:requestId/cancel", (req, res) => {
  const { requestId } = req.params;
  const job = jobStore.get(requestId);
  
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found',
      requestId
    });
  }
  
  if (job.status === 'completed' || job.status === 'failed') {
    return res.status(400).json({
      success: false,
      error: 'Job already finished',
      status: job.status,
      requestId
    });
  }
  
  // Cancel flag set et
  job.cancelled = true;
  job.status = 'cancelled';
  job.logs.push({
    level: 'warn',
    message: '⚠️ İşlem kullanıcı tarafından durduruldu',
    timestamp: new Date().toISOString()
  });
  
  logger.warn(`[JOB-CANCEL] ${requestId} durduruldu`);
  
  res.json({
    success: true,
    message: 'Job cancelled',
    requestId,
    status: 'cancelled'
  });
});

// Job status endpoint (async 202 response tracking için)
app.get("/api/job/:requestId", (req, res) => {
  const { requestId } = req.params;
  const job = jobStore.get(requestId);
  
  if (!job) {
    return res.status(404).json({ 
      error: 'Job not found',
      requestId,
      note: 'Job may have expired or never existed'
    });
  }

  // Job yaşını kontrol et (1 saat sonra sil)
  const jobAge = Date.now() - job.startTime;
  if (jobAge > 3600000) { // 1 saat
    jobStore.delete(requestId);
    return res.status(410).json({ 
      error: 'Job expired',
      requestId,
      age: Math.round(jobAge / 1000) + 's'
    });
  }

  res.json(job);
});

// ============ BATCH STORE (N8n batch toplama) ============
const batchStore = new Map(); // { batchId: { videos: [], captions: [], count: 0, total: 0, country: '', language: '', timer: null } }

app.post("/send-video-to-contacts-grouped", async (req, res) => {
  const startTime = Date.now();
  logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, 'started');

  // ============ CONNECTION CHECK (WhatsApp bağlı mı?) ============
  if (!ready || !sock) {
    logger.error('[GROUPED-FORWARD] ❌ WhatsApp bağlı değil, istek reddedildi');
    return res.status(503).json({
      success: false,
      error: 'WhatsApp not connected',
      message: 'QR kodu taranmamış veya bağlantı kesilmiş. Lütfen önce WhatsApp\'a bağlanın.',
      ready: false
    });
  }

  // ============ BATCH AGGREGATION (N8n'den gelen parçaları topla) ============
  const { batchId, videoIndex, totalInBatch, isLastVideoInBatch, autoFanout } = req.body;
  
  if (batchId && totalInBatch > 1 && autoFanout) {
    // Batch modu: Videoları topla, son video gelince işle
    logger.info(`[BATCH] Video ${videoIndex}/${totalInBatch} alındı (batchId: ${batchId})`);
    
    if (!batchStore.has(batchId)) {
      batchStore.set(batchId, {
        videos: [],
        captions: [],
        count: 0,
        total: totalInBatch,
        country: req.body.country || '',
        language: req.body.language || '',
        timer: null
      });
    }
    
    const batch = batchStore.get(batchId);
    
    // Video ve caption'ı ekle
    const videoUrl = Array.isArray(req.body.videoUrls) ? req.body.videoUrls[0] : req.body.videoUrl;
    const caption = req.body.caption || '';
    
    batch.videos.push(videoUrl);
    batch.captions.push(caption);
    batch.count++;
    
    // Safety timeout: 30 saniye içinde tüm videolar gelmezse yine de işle
    if (batch.timer) clearTimeout(batch.timer);
    batch.timer = setTimeout(() => {
      logger.warn(`[BATCH] ⏱️ Timeout: ${batchId}, ${batch.count}/${batch.total} video ile işlem başlatılıyor (eksik videolar var!)`);
      batchStore.delete(batchId);
      // NOT: Timeout durumunda işlem YAPILMAYACAK (incomplete batch)
      // Sadece store'dan sil, N8n retry yapmalı
    }, 30000);
    
    // Son video değilse sadece kabul et ve dön
    if (!isLastVideoInBatch && batch.count < batch.total) {
      return res.status(200).json({
        success: true,
        message: 'Video added to batch',
        batchId,
        collected: batch.count,
        total: batch.total,
        pending: batch.total - batch.count
      });
    }
    
    // Son video geldi veya tamamlandı - batch'i işle
    clearTimeout(batch.timer);
    logger.info(`[BATCH] ✅ Tamamlandı: ${batchId}, ${batch.count} video toplandı, işlem başlatılıyor`);
    
    // Batch'i req.body'ye dönüştür (aşağıdaki normal akış kullanacak)
    req.body.videoUrls = batch.videos;
    req.body.captions = batch.captions;
    req.body.country = batch.country;
    req.body.language = batch.language;
    batchStore.delete(batchId);
    
    // Artık normal akış devam edecek (videoUrls array olarak hazır)
  }

  // ============ ASYNC RESPONSE (Timeout önleme) ============
  // İsteği hemen kabul et, işlemi arka planda yap
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  logger.info(`[GROUPED-FORWARD] Request ID: ${requestId}, async processing başlatıldı`);
  
  // Job store'a kaydet (tracking için)
  jobStore.set(requestId, {
    status: 'processing',
    progress: 0,
    startTime: Date.now(),
    logs: [],
    result: null,
    cancelled: false  // ✅ Cancel flag
  });
  
  // N8n'e hemen 202 Accepted dön (timeout önleme)
  res.status(202).json({
    success: true,
    message: 'Request accepted, processing in background',
    requestId,
    ready: true,
    statusUrl: `/api/job/${requestId}`,
    note: 'Video gönderimi arka planda devam ediyor. /api/job/:requestId endpoint\'inden durumu sorgulayabilirsiniz.'
  });

  // Job helper: Log ekle (ring buffer - RAM leak önleme)
  const addJobLog = (level, message) => {
    const job = jobStore.get(requestId);
    if (job) {
      job.logs.push({ 
        level, 
        message, 
        timestamp: new Date().toISOString() 
      });
      // Ring buffer: Max 1000 log tutulsun
      if (job.logs.length > MAX_JOB_LOGS) {
        job.logs.shift(); // En eskiyi sil
      }
      jobStore.set(requestId, job);
    }
  };

  // Job helper: Progress güncelle
  const updateJobProgress = (progress) => {
    const job = jobStore.get(requestId);
    if (job) {
      job.progress = progress;
      jobStore.set(requestId, job);
    }
  };

  // Job helper: Sonuç kaydet
  const finishJob = (status, result) => {
    const job = jobStore.get(requestId);
    if (job) {
      job.status = status; // 'completed', 'failed', 'stopped'
      job.result = result;
      job.endTime = Date.now();
      job.duration = job.endTime - job.startTime;
      jobStore.set(requestId, job);
    }
  };

  // ============ HELPER FUNCTIONS (Anti-Ban & Natural Behavior) ============
  
  // Socket alive check: Bağlantı kopuksa işlem yapma
  const isSockAlive = () => {
    if (!sock || !ready) {
      logger.error('[SOCK-CHECK] Socket not alive (disconnected)');
      return false;
    }
    return true;
  };
  
  // Jitter: Rastgele varyasyon ekler (±30% default)
  const jitter = (ms, pct = 0.3) => {
    const delta = ms * pct;
    return ms + Math.floor((Math.random() * 2 - 1) * delta);
  };
  // Shuffle: Diziyi rastgele karıştırır (doğal sıralama için)
  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  // Circuit Breaker: Ban algılama ve otomatik durdurma
  const breaker = { open: false, until: 0, reason: '' };
  
  const tripBreaker = (ms, reason) => {
    breaker.open = true;
    breaker.until = Date.now() + ms;
    breaker.reason = reason;
    logger.error(`[CIRCUIT-BREAKER] AÇILDI: ${reason}, ${ms}ms boyunca duracak`);
    addActivityLog('error', `🚨 Güvenlik durdurma: ${reason}`);
  };

  const breakerOk = () => {
    if (!breaker.open) return true;
    if (Date.now() >= breaker.until) {
      breaker.open = false;
      breaker.reason = '';
      logger.info('[CIRCUIT-BREAKER] Kapandı, devam ediliyor');
      return true;
    }
    return false;
  };

  // Safe Send: Hata yönetimi + retry + ban detection
  const safeSend = async (jid, content, attempt = 1) => {
    if (!breakerOk()) {
      throw new Error(`Circuit breaker açık: ${breaker.reason}`);
    }

    try {
      return await sock.sendMessage(jid, content);
    } catch (e) {
      const msg = e?.output?.payload?.message || e.message || 'unknown';
      const status = e?.output?.statusCode || e.status || 0;

      // HARD BAN: 401/403 veya "blocked/not-authorized"
      const hardBan = /blocked|not-?authorized|forbidden/i.test(msg) || [401, 403].includes(status);
      
      // RATE LIMIT: 420/429 veya "rate/too many/limit"
      const rateLimit = /rate|too\s?many|limit/i.test(msg) || [420, 429].includes(status);

      if (hardBan) {
        tripBreaker(60 * 60 * 1000, 'BAN-SUSPECTED'); // 60 dakika dur
        throw new Error(`🚨 BAN RİSKİ: ${msg}`);
      }

      if (rateLimit) {
        const backoffMs = Math.min(120_000, 10_000 * Math.pow(2, attempt - 1)); // Exponential backoff
        logger.warn(`[RATE-LIMIT] ${msg}, ${backoffMs}ms bekleniyor (attempt ${attempt})`);
        await delay(jitter(backoffMs, 0.25));
        
        if (attempt < 5) {
          return safeSend(jid, content, attempt + 1);
        }
      }

      // Genel hatalar: 3 deneme yap
      if (attempt < 3) {
        logger.warn(`[RETRY] ${msg}, tekrar deneniyor (${attempt}/3)`);
        await delay(jitter(5000, 0.3));
        return safeSend(jid, content, attempt + 1);
      }

      throw e; // Son deneme de başarısız
    }
  };

  // Chunk: Diziyi küçük parçalara böl
  const chunk = (arr, size) => {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  };

  // Caption Varyasyon: Grup tipine göre farklı emoji ekle
  const addCaptionVariation = (caption, targetType) => {
    if (!caption || caption.trim() === '') return '';
    
    // WhatsApp caption limit: 1024 karakter (güvenli limit: 980)
    const CAPTION_MAX = 980;
    let finalCaption = caption.length > CAPTION_MAX 
      ? caption.substring(0, CAPTION_MAX) + '...' 
      : caption;
    
    // Grup için emoji seti (profesyonel)
    const groupEmojis = ['', ' ✨', ' 📢', ' 💼', ' 🔔'];
    
    // Kişi için emoji seti (samimi)
    const contactEmojis = ['', ' 👋', ' 😊', ' 🌟', ' 💫', ' ✨'];
    
    const emojiSet = targetType === 'group' ? groupEmojis : contactEmojis;
    const randomEmoji = emojiSet[Math.floor(Math.random() * emojiSet.length)];
    
    return finalCaption + randomEmoji;
  };

  // ========================================================================

  // Global config'den al (endpoint içinde kullanım için)
  const BASE_FORWARD_DELAY = FORWARD_DELAY || 600; // 600ms default
  const BASE_BURST_COOLDOWN = FORWARD_BURST_COOLDOWN || 60000; // 60s default

  const {
    videoUrls: rawVideoUrls,
    videoUrl: singleVideoUrl,  // ✅ TEKİL FORMAT DESTEĞİ (videoUrl)
    captions: rawCaptions,
    caption: singleCaption,
    country,
    language,
  } = req.body || {};

  // ============ VIDEO URL NORMALIZE (videoUrl veya videoUrls) ============
  let videoUrls = [];
  if (Array.isArray(rawVideoUrls) && rawVideoUrls.length > 0) {
    videoUrls = rawVideoUrls;  // ✅ videoUrls: ["url1", "url2"]
  } else if (typeof singleVideoUrl === 'string' && singleVideoUrl.length > 0) {
    videoUrls = [singleVideoUrl];  // ✅ videoUrl: "url" → ["url"]
  }

  // ============ CAPTION NORMALIZE (caption veya captions) ============
  let captions = [];
  if (Array.isArray(rawCaptions)) {
    captions = rawCaptions;  // ✅ captions: ["cap1", "cap2"]
  } else if (typeof singleCaption === 'string' && singleCaption.length > 0) {
    // Tek caption verildiyse tüm videoUrls için aynı caption kullan
    captions = videoUrls.map(() => singleCaption);  // ✅ caption: "cap" → ["cap", "cap"]
  } else {
    captions = [];
  }

  logger.info('[GROUPED-FORWARD] Request received', {
    videoCount: videoUrls?.length,
    country,
    language,
    ready,
    format: rawVideoUrls ? 'videoUrls (array)' : singleVideoUrl ? 'videoUrl (string)' : 'unknown'
  });

  if (!videoUrls || videoUrls.length === 0) {
    logger.error('[GROUPED-FORWARD] Missing video URL(s)');
    logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, { error: 'videoUrls veya videoUrl gerekli' });
    return res.status(400).json({ error: "videoUrls (array) veya videoUrl (string) gerekli." });
  }

  if (!ready || !sock) {
    logger.error('[GROUPED-FORWARD] WhatsApp not ready');
    logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, { error: 'WhatsApp hazır değil' });
    return res.status(503).json({ error: "WhatsApp hazır değil. QR'ı tarayın." });
  }

  try {
    // 1) AKTİF HEDEF LİSTESİ (Unified targets: grup + kişi)
    const groupsData = loadGroups();
    let activeGroups = (groupsData.groups || []).filter(g => g.isActive);

    const contactsData = loadContacts();
    let filteredContacts = (contactsData.contacts || []).filter(c => c.active);

    // Ülke / dil filtresi SADECE kişilere uygula
    if (country) {
      filteredContacts = filteredContacts.filter(c => c.country === country.toUpperCase());
    }
    if (language) {
      filteredContacts = filteredContacts.filter(c => c.language === language.toLowerCase());
    }

    // unifiedTargets: Baileys JID formatında
    const unifiedTargets = [
      ...activeGroups.map(g => ({
        type: 'group',
        jid: g.id, // Baileys JID formatı (örn. groupid@g.us)
        name: g.name || "Group"
      })),
      ...filteredContacts.map(c => ({
        type: 'contact',
        jid: `${c.phone}@s.whatsapp.net`, // Baileys JID formatı
        name: c.name || "Contact"
      }))
    ];

    if (unifiedTargets.length === 0) {
      const errorMsg = "Aktif hedef bulunamadı (ne aktif grup ne uygun kişi var).";
      finishJob('failed', { error: errorMsg });
      addJobLog('error', errorMsg);
      return; // 202 zaten gönderildi, res kullanma
    }

    // DOĞAL DAVRANŞ: Hedefleri rastgele karıştır (botnet pattern'den kaçın)
    shuffleInPlace(unifiedTargets);
    logger.info(`[GROUPED-FORWARD] ${unifiedTargets.length} hedef karıştırıldı (doğal sıralama)`);

    logger.info(`[GROUPED-FORWARD] ${unifiedTargets.length} hedef bulundu, ${videoUrls.length} video gönderilecek`);
    addActivityLog('info', `${unifiedTargets.length} hedefe ${videoUrls.length} video gönderiliyor`);
    addJobLog('info', `${unifiedTargets.length} hedef bulundu, ${videoUrls.length} video gönderilecek`);

    // 2) İLK HEDEFE NORMAL SEND - RASTGELE KİŞİ SEÇ (Anti-ban)
    let sentMessages = [];
    let firstTarget;
    let remainingTargets; // ← Shuffle'ı korumak için burada tanımla
    
    // İlk hedef: Kişilerden rastgele seç (grup değil)
    const contactTargets = unifiedTargets.filter(t => t.type === 'contact');
    const groupTargets = unifiedTargets.filter(t => t.type === 'group');
    
    if (contactTargets.length > 0) {
      // Rastgele bir kişi seç
      const randomIndex = Math.floor(Math.random() * contactTargets.length);
      firstTarget = contactTargets[randomIndex];
      
      // Kalan hedefler: diğer kişiler + gruplar (rastgele karışık)
      const remainingContacts = contactTargets.filter((_, idx) => idx !== randomIndex);
      remainingTargets = [...remainingContacts, ...groupTargets];
      shuffleInPlace(remainingTargets); // ← Bu shuffle KORUNACAK (bug fix)
      
      logger.info(`[GROUPED-FORWARD] İlk hedef (rastgele kişi): ${firstTarget.name}`);
      addJobLog('info', `İlk hedef seçildi: ${firstTarget.name} (contact)`);
    } else {
      // Kişi yoksa grup seç (fallback)
      firstTarget = unifiedTargets[0];
      remainingTargets = unifiedTargets.slice(1);
      shuffleInPlace(remainingTargets);
      logger.warn(`[GROUPED-FORWARD] Kişi bulunamadı, ilk hedef grup: ${firstTarget.name}`);
      addJobLog('warn', `İlk hedef grup: ${firstTarget.name} (contact yok)`);
    }

    logger.info(`[GROUPED-FORWARD] İlk hedef: ${firstTarget.name} (${firstTarget.type})`);
    addActivityLog('info', `İlk hedefe gönderiliyor: ${firstTarget.name}`);

    // Socket bağlantısını kontrol et (disconnect durumunda devam etme)
    if (!isSockAlive()) {
      const errorMsg = "WhatsApp bağlantısı koptu, işlem yapılamıyor";
      finishJob('failed', { error: errorMsg });
      addJobLog('error', errorMsg);
      return; // 202 zaten gönderildi
    }

    // ✅ FIX: TÜM VİDEOLARI ÖNCE İNDİR (cache'le)
    logger.info(`[DOWNLOAD] ${videoUrls.length} video indiriliyor...`);
    addJobLog('info', `${videoUrls.length} video indiriliyor...`);
    const cachedPaths = [];
    for (let i = 0; i < videoUrls.length; i++) {
      logger.info(`[DOWNLOAD] Video ${i + 1}/${videoUrls.length} indiriliyor...`);
      const downloadStart = Date.now();
      const cachedPath = await getOrCacheVideo(videoUrls[i]);
      const downloadTime = Date.now() - downloadStart;
      cachedPaths.push(cachedPath);
      logger.info(`[DOWNLOAD] ✅ Video ${i + 1} indirildi (${downloadTime}ms)`);
    }
    addJobLog('success', `${videoUrls.length} video indirildi, gönderim başlatılıyor`);
    logger.info(`[DOWNLOAD] ✅ Tüm videolar indirildi, gönderime başlanıyor`);

    // ✅ İNDİRİLEN VIDEOLARI GÖNDER
    for (let i = 0; i < videoUrls.length; i++) {
      const cachedPath = cachedPaths[i];
      const baseCap = (captions && captions[i]) ? captions[i] : '';
      
      // Caption varyasyon ekle (ilk hedef için)
      const cap = addCaptionVariation(baseCap, firstTarget.type);

      logger.info(`[SEND] Video ${i + 1}/${videoUrls.length} gönderiliyor...`);
      logger.info(`[SEND] Video ${i + 1}/${videoUrls.length} gönderiliyor...`);
      
      // ✅ FIX: Buffer kullan (stream ve path yerine - en güvenilir yöntem)
      const videoBuffer = fs.readFileSync(cachedPath);
      
      const sendStart = Date.now();
      
      // safeSend kullan (ban detection + retry)
      const sentMsg = await safeSend(firstTarget.jid, {
        video: videoBuffer, // ✅ Buffer kullan
        caption: cap,
        mimetype: 'video/mp4'
      });
      
      const sendTime = Date.now() - sendStart;

      // ✅ VALIDATION: Baileys response kontrolü
      if (!sentMsg || !sentMsg.key) {
        const errorMsg = `Send başarısız: Baileys invalid response (video ${i + 1})`;
        logger.error(`[SEND-ERROR] ${errorMsg}`, { sentMsg });
        addActivityLog('error', errorMsg);
        throw new Error(errorMsg);
      }

      sentMessages.push(sentMsg);
      
      logger.info(`[SEND] Video ${i + 1}/${videoUrls.length} gönderildi`, {
        target: firstTarget.name,
        sendTime,
        messageKey: sentMsg.key.id,
        hasKey: !!sentMsg.key,
        hasRemoteJid: !!sentMsg.key?.remoteJid
      });

      // İstatistik
      global.monitorStats.totalProcessed++;
      global.monitorStats.todayCount++;

      // Anti-spam delay (jitter ile 2s ±30%)
      await delay(jitter(2000, 0.3));
    }

    addActivityLog('success', `İlk send tamamlandı: ${firstTarget.name} (${videoUrls.length} video)`);
    addJobLog('success', `İlk send tamamlandı: ${firstTarget.name}`);
    logger.info(`[GROUPED-FORWARD] İlk hedefe send tamamlandı: ${videoUrls.length} video`);
    updateJobProgress(10); // %10 tamamlandı

    // 3) DİĞER HEDEFLERE FORWARD (Chunk + SafeSend sistemi)
    // remainingTargets zaten yukarıda tanımlandı ve shuffle edildi (bug fix)
    const targetChunks = chunk(remainingTargets, CHUNK_SIZE); // Environment variable'dan oku
    
    let forwardedCount = 0;
    let totalFailed = 0;
    
    logger.info(`[GROUPED-FORWARD] ${remainingTargets.length} hedefe forward başlıyor (${targetChunks.length} chunk, chunk size: ${CHUNK_SIZE})`);
    addJobLog('info', `${remainingTargets.length} hedefe forward başlatıldı (${targetChunks.length} chunk)`);

    for (let chunkIdx = 0; chunkIdx < targetChunks.length; chunkIdx++) {
      // ✅ CANCEL CHECK: Her chunk başında kontrol et
      const job = jobStore.get(requestId);
      if (job && job.cancelled) {
        logger.warn(`[CHUNK ${chunkIdx + 1}] ⚠️ İşlem iptal edildi, durduruluyor...`);
        addJobLog('warn', `İşlem ${forwardedCount} kişiye gönderildikten sonra durduruldu`);
        finishJob('cancelled', {
          message: 'İşlem kullanıcı tarafından durduruldu',
          sentCount: forwardedCount + 1,
          totalTargets: remainingTargets.length + 1,
          cancelledAt: chunkIdx + 1,
          totalChunks: targetChunks.length
        });
        return; // İşlemi tamamen bitir
      }
      
      const currentChunk = targetChunks[chunkIdx];
      logger.info(`[CHUNK ${chunkIdx + 1}/${targetChunks.length}] ${currentChunk.length} hedef işleniyor...`);

      for (const target of currentChunk) {
        // ✅ UPLOAD ROTATION: Her UPLOAD_PER_SIZE kişide bir yeni upload yap
        const shouldUpload = UPLOAD_PER_SIZE > 0 && (forwardedCount + 1) % UPLOAD_PER_SIZE === 0;
        
        if (shouldUpload) {
          logger.info(`[UPLOAD-ROTATION] ${forwardedCount + 1}. hedef: Yeni upload yapılıyor → ${target.name}`);
          addJobLog('info', `Upload rotation: ${forwardedCount + 1}. hedefte yeni upload (${target.name})`);
          addActivityLog('info', `📤 ${forwardedCount + 1}. hedef: Yeni upload → ${target.name}`);
          
          // ✅ FIX: Önce tüm videoları indir (upload rotation için)
          const uploadCachedPaths = [];
          for (let i = 0; i < videoUrls.length; i++) {
            logger.info(`[UPLOAD-ROTATION] Video ${i + 1}/${videoUrls.length} indiriliyor...`);
            const downloadStart = Date.now();
            const cachedPath = await getOrCacheVideo(videoUrls[i]);
            const downloadTime = Date.now() - downloadStart;
            uploadCachedPaths.push(cachedPath);
            logger.info(`[UPLOAD-ROTATION] ✅ Video ${i + 1} indirildi (${downloadTime}ms)`);
          }
          
          // Yeni upload (indirilen videoları bu hedefe send et)
          for (let i = 0; i < videoUrls.length; i++) {
            const cachedPath = uploadCachedPaths[i];
            const baseCap = (captions && captions[i]) ? captions[i] : '';
            const cap = addCaptionVariation(baseCap, target.type);
            
            const videoBuffer = fs.readFileSync(cachedPath);
            
            const uploadStart = Date.now();
            const uploadMsg = await safeSend(target.jid, {
              video: videoBuffer,
              caption: cap,
              mimetype: 'video/mp4'
            });
            const uploadTime = Date.now() - uploadStart;
            
            // ✅ VALIDATION: Upload response kontrolü
            if (!uploadMsg || !uploadMsg.key) {
              logger.error(`[UPLOAD-ERROR] Upload başarısız (video ${i + 1}), eski mesajlar korunuyor`);
              addActivityLog('warning', `Upload başarısız: ${target.name}, forward devam ediyor`);
              break; // Upload iptal, eski sentMessages ile devam et
            }
            
            sentMessages[i] = uploadMsg; // Yeni upload mesajları kaydet
            logger.info(`[UPLOAD-ROTATION] Video ${i + 1} upload edildi (${uploadTime}ms) → ${target.name}`);
            await delay(jitter(2000, 0.3));
          }
          
          forwardedCount++; // Upload hedefi sayılır
          addJobLog('success', `Upload rotation tamamlandı: ${target.name}`);
          logger.info(`[UPLOAD-ROTATION] ✅ Yeni upload tamamlandı: ${target.name}`);
          
          // İstatistik
          global.monitorStats.totalProcessed += videoUrls.length;
          global.monitorStats.todayCount += videoUrls.length;
          
          // Upload sonrası delay
          await delay(jitter(BASE_FORWARD_DELAY, 0.3));
          continue; // Bu hedefi atla (zaten upload yaptık), sonraki hedefe geç
        }
        // Circuit breaker kontrolü
        if (!breakerOk()) {
          logger.error('[GROUPED-FORWARD] Circuit breaker aktif, kampanya durduruluyor');
          addActivityLog('error', `🚨 Güvenlik durdurma: ${breaker.reason}`);
          addJobLog('error', `Circuit breaker aktif: ${breaker.reason}`);
          
          const stopResult = {
            success: false,
            error: `Circuit breaker aktif: ${breaker.reason}`,
            sentToFirst: firstTarget.name,
            totalVideos: videoUrls.length,
            totalTargets: unifiedTargets.length,
            forwardedTo: forwardedCount,
            failed: totalFailed,
            stopped: true
          };
          
          finishJob('stopped', stopResult);
          return; // 202 zaten gönderildi, res kullanma
        }

        logger.info(`[FORWARD] ${forwardedCount + 1}/${remainingTargets.length}: ${target.name}`);

        try {
          for (let v = 0; v < sentMessages.length; v++) {
            const msg = sentMessages[v];
            
            // ✅ VALIDATION: Forward öncesi mesaj kontrolü
            if (!msg || !msg.key) {
              logger.error(`[FORWARD-SKIP] Mesaj ${v + 1} geçersiz (key eksik), atlanıyor`, { 
                msgExists: !!msg,
                hasKey: !!msg?.key,
                target: target.name
              });
              addActivityLog('warning', `Mesaj ${v + 1} geçersiz, atlanıyor (${target.name})`);
              continue; // Bu mesajı atla, diğerlerine devam et
            }
            
            const fwdStart = Date.now();
            
            // safeSend ile forward (ban detection + retry)
            await safeSend(target.jid, { forward: msg });
            
            const fwdDuration = Date.now() - fwdStart;
            logger.debug(`[FORWARD] Video ${v + 1} forwarded in ${fwdDuration}ms to ${target.name}`);
            
            // Her video arası jitter delay (450-750ms arası rastgele)
            await delay(jitter(BASE_FORWARD_DELAY, 0.25));
          }

          forwardedCount++;
          addActivityLog('success', `Forward tamam: ${target.name} (${sentMessages.length} mesaj)`);

          // İstatistik
          global.monitorStats.totalProcessed += sentMessages.length;
          global.monitorStats.todayCount += sentMessages.length;

          // Hedef arası ekstra delay (jitter ile 420-780ms)
          await delay(jitter(BASE_FORWARD_DELAY, 0.3));

        } catch (forwardError) {
          totalFailed++;
          
          // Network hatası transient mu kontrol et (retry mantıklı olur)
          const isTransient = forwardError.message && (
            forwardError.message.includes('ECONNRESET') ||
            forwardError.message.includes('ETIMEDOUT') ||
            forwardError.message.includes('socket hang up')
          );
          
          logger.error('[GROUPED-FORWARD] Forward failed', {
            error: forwardError.message,
            target: target.name,
            targetJid: target.jid,
            isTransient
          });
          addActivityLog('error', `Forward hatası: ${target.name} - ${forwardError.message}`);
          addJobLog('warning', `Hedef başarısız: ${target.name} (${isTransient ? 'network error' : 'unknown error'})`);
          
          // Ban riski varsa hemen dur (chunk break'le birlikte)
          if (breaker.open) {
            logger.error('[GROUPED-FORWARD] Ban riski tespit edildi, tüm kampanya durduruluyor');
            addJobLog('error', `Ban riski: ${breaker.reason}`);
            
            clearAllCache();
            
            const stopResult = {
              success: false,
              error: `Ban riski: ${breaker.reason}`,
              sentToFirst: firstTarget.name,
              totalVideos: videoUrls.length,
              totalTargets: unifiedTargets.length,
              forwardedTo: forwardedCount,
              failed: totalFailed,
              stopped: true
            };
            
            finishJob('stopped', stopResult);
            return; // 202 zaten gönderildi, res kullanma
          }
        }
      }

      // Chunk tamamlandı - progress güncelle
      const progressPercent = Math.round(((chunkIdx + 1) / targetChunks.length) * 90) + 10; // 10-100%
      updateJobProgress(progressPercent);
      
      // Chunk cooldown
      if (chunkIdx < targetChunks.length - 1) { // Son chunk değilse
        const cooldownTime = jitter(BASE_BURST_COOLDOWN, 0.2); // 105s ±20% = 84-126s
        logger.info(`[CHUNK ${chunkIdx + 1}] Tamamlandı, ${Math.round(cooldownTime / 1000)}s cooldown...`);
        addActivityLog('info', `✅ ${currentChunk.length} hedef tamamlandı, ${Math.round(cooldownTime / 1000)}s bekleniyor...`);
        addJobLog('info', `Chunk ${chunkIdx + 1}/${targetChunks.length} tamamlandı, cooldown: ${Math.round(cooldownTime / 1000)}s`);
        await delay(cooldownTime);
      }
    }

    // 4) Cache temizle
    clearAllCache();
    logger.info(`[GROUPED-FORWARD] Tüm işlemler tamamlandı: ${videoUrls.length} video → ${unifiedTargets.length} hedef (1 send + ${forwardedCount} forward, ${totalFailed} başarısız)`);
    addActivityLog('success', `✅ Tamamlandı: ${forwardedCount}/${unifiedTargets.length - 1} forward başarılı`);

    const processingTime = Date.now() - startTime;
    const processingMinutes = Math.round(processingTime / 1000 / 60);
    
    const finalStatus = {
      requestId,
      success: true,
      mode: 'baileys-forward-v4-upload-rotation',
      features: ['shuffle', 'jitter', 'circuit-breaker', 'chunk-system', 'safe-send', 'caption-variation', 'random-first-contact', 'upload-rotation'],
      config: {
        chunkSize: CHUNK_SIZE,
        forwardDelay: FORWARD_DELAY,
        burstCooldown: FORWARD_BURST_COOLDOWN,
        uploadPerSize: UPLOAD_PER_SIZE
      },
      sentToFirst: firstTarget.name,
      firstTargetType: firstTarget.type,
      totalVideos: videoUrls.length,
      totalTargets: unifiedTargets.length,
      forwardedTo: forwardedCount,
      failed: totalFailed,
      uploadCount: Math.ceil(unifiedTargets.length / UPLOAD_PER_SIZE), // Toplam upload sayısı
      successRate: `${Math.round((forwardedCount / (unifiedTargets.length - 1)) * 100)}%`,
      processingTime: `${processingMinutes} dakika`,
      circuitBreakerStatus: breaker.open ? `⚠️ AÇIK (${breaker.reason})` : '✅ Kapalı'
    };

    logger.info('[GROUPED-FORWARD] Success', finalStatus);
    logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, finalStatus);
    addJobLog('success', `Tamamlandı: ${forwardedCount}/${unifiedTargets.length - 1} forward başarılı`);
    finishJob('completed', finalStatus);
    updateJobProgress(100);

  } catch (error) {
    // Cache temizle (hata durumunda)
    try {
      clearAllCache();
    } catch {}
    
    logger.error("[GROUPED-FORWARD] Error", {
      requestId,
      error: error.message,
      stack: error.stack,
      videoUrls: videoUrls?.length
    });
    
    logEndpoint('/send-video-to-contacts-grouped', 'POST', req.body, { requestId, error: error.message });
    addActivityLog('error', `❌ İşlem hatası: ${error.message}`);
    addJobLog('error', `Fatal error: ${error.message}`);
    
    finishJob('failed', { 
      error: error.message,
      stack: error.stack 
    });
  }
});


app.get("/healthz", (req, res) => res.json({ ok: true, ready }));

// Logout API - SADECE LOGOUT, SESSION SİLME!
app.post("/logout", async (req, res) => {
  const startTime = Date.now();
  logEndpoint('/logout', 'POST', req.body, 'started');

  try {
    console.log("[LOGOUT] WhatsApp oturumu kapatılıyor... (Session korunacak)");
    logger.info('[LOGOUT] Starting logout', { ready, hasSock: !!sock });

    // Auth session'ı da temizle
    const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {}) || {};
    
    const sessionId = cookies.whatsapp_session;
    if (sessionId && activeSessions.has(sessionId)) {
      activeSessions.delete(sessionId);
      console.log('[AUTH] Session removed on logout:', sessionId);
    }

    if (sock) {
      await sock.logout();
      console.log("[LOGOUT] WhatsApp socket logout yapıldı.");
      logger.info('[LOGOUT] Socket logged out');
    }

    // Session dosyalarını SİLME! Sadece durumu güncelle
    ready = false;
    lastQrString = null;

    const processingTime = Date.now() - startTime;
    const response = {
      success: true,
      message: "WhatsApp oturumu kapatıldı. Session dosyaları korundu.",
      processingTime
    };

    logger.info('[LOGOUT] Success', { processingTime });
    logEndpoint('/logout', 'POST', req.body, response);
    res.json(response);

    console.log("[LOGOUT] Session dosyaları korundu. Yeni QR için yeniden bağlanılıyor...");

    // Yeni QR için bağlantıyı yeniden başlat
    setTimeout(() => {
      console.log("[LOGOUT] Yeni QR için bağlantı yeniden başlatılıyor...");
      logger.info('[LOGOUT] Reconnecting for new QR');
      connectToWhatsApp().catch(err => {
        logger.error('[LOGOUT] Reconnection failed', { error: err.message });
      });
    }, 1000);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('[LOGOUT] Error', { error: error.message, stack: error.stack, processingTime });
    logEndpoint('/logout', 'POST', req.body, { error: error.message, details: error.message, success: false, processingTime });

    console.error("[LOGOUT] Hata:", error);
    res.status(500).json({
      error: "Logout sırasında hata oluştu.",
      details: error.message
    });
  }
});

// YENİ API: Session'ı temizle (sadece gerçekten gerektiğinde)
app.post("/clear-session", async (req, res) => {
  const startTime = Date.now();
  logEndpoint('/clear-session', 'POST', req.body, 'started');

  try {
    console.log("[CLEAR-SESSION] Session cache temizleniyor...");
    logger.info('[CLEAR-SESSION] Starting session clear', { ready, hasSock: !!sock });

    // Önce WhatsApp'tan çıkış yap
    if (sock && ready) {
      await sock.logout();
      console.log("[CLEAR-SESSION] WhatsApp socket logout yapıldı.");
      logger.info('[CLEAR-SESSION] Socket logged out');
    }

    // Session cache'ini temizle (Baileys AUTH_DIR - PERSISTENT DISK)
    const sessionPath = AUTH_DIR; // Already using PATHS.AUTH_DIR
    let sessionDeleted = false;
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      // Klasörü yeniden oluştur
      fs.mkdirSync(sessionPath, { recursive: true });
      console.log("[CLEAR-SESSION] Session cache temizlendi:", sessionPath);
      logger.info('[CLEAR-SESSION] Session cache deleted', { sessionPath });
      sessionDeleted = true;
    }

    // Durumu güncelle
    ready = false;
    lastQrString = null;

    const processingTime = Date.now() - startTime;
    const response = {
      success: true,
      message: "Session cache tamamen temizlendi. Yeni QR kod gerekli.",
      sessionDeleted,
      processingTime
    };

    logger.info('[CLEAR-SESSION] Success', { sessionDeleted, processingTime });
    logEndpoint('/clear-session', 'POST', req.body, response);
    res.json(response);

    // Yeni QR için bağlantıyı yeniden başlat
    setTimeout(() => {
      console.log("[CLEAR-SESSION] Yeni QR için bağlantı yeniden başlatılıyor...");
      logger.info('[CLEAR-SESSION] Reconnecting for new QR');
      connectToWhatsApp().catch(err => {
        logger.error('[CLEAR-SESSION] Reconnection failed', { error: err.message });
      });
    }, 1000);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('[CLEAR-SESSION] Error', { error: error.message, stack: error.stack, processingTime });
    logEndpoint('/clear-session', 'POST', req.body, { error: error.message, details: error.message, success: false, processingTime });

    console.error("[CLEAR-SESSION] Hata:", error);
    res.status(500).json({
      error: "Session temizleme sırasında hata oluştu.",
      details: error.message
    });
  }
});

// ==== Disk Monitoring API ====
app.get("/api/disk-info", (req, res) => {
  try {
    const diskConfig = getDiskInfo();
    
    // Check if paths exist and get detailed info
    const pathStatus = {
      authDir: checkPathExists(PATHS.AUTH_DIR),
      contactsFile: checkPathExists(PATHS.CONTACTS_FILE),
      groupsFile: checkPathExists(PATHS.GROUPS_FILE),
      countriesFile: checkPathExists(PATHS.COUNTRIES_FILE),
      tmpVideosDir: checkPathExists(PATHS.TMP_VIDEOS_DIR)
    };

    // Get detailed file information
    const fileDetails = {};
    
    // Auth directory files
    if (pathStatus.authDir) {
      const authFiles = fs.readdirSync(PATHS.AUTH_DIR);
      fileDetails.authDir = {
        path: PATHS.AUTH_DIR,
        count: authFiles.length,
        files: authFiles.slice(0, 5), // Show first 5 files
        hasCredsFile: authFiles.includes('creds.json'),
        lastModified: authFiles.length > 0 ? 
          fs.statSync(path.join(PATHS.AUTH_DIR, authFiles[0])).mtime : null
      };
    }

    // Contacts file
    if (pathStatus.contactsFile) {
      const contactsStats = fs.statSync(PATHS.CONTACTS_FILE);
      const contactsData = JSON.parse(fs.readFileSync(PATHS.CONTACTS_FILE, 'utf8'));
      fileDetails.contactsFile = {
        path: PATHS.CONTACTS_FILE,
        size: `${(contactsStats.size / 1024).toFixed(2)} KB`,
        contactCount: contactsData.contacts?.length || 0,
        lastModified: contactsStats.mtime,
        lastUpdated: contactsData.lastUpdated
      };
    }

    // Groups file
    if (pathStatus.groupsFile) {
      const groupsStats = fs.statSync(PATHS.GROUPS_FILE);
      const groupsData = JSON.parse(fs.readFileSync(PATHS.GROUPS_FILE, 'utf8'));
      fileDetails.groupsFile = {
        path: PATHS.GROUPS_FILE,
        size: `${(groupsStats.size / 1024).toFixed(2)} KB`,
        groupCount: groupsData.groups?.length || 0,
        lastModified: groupsStats.mtime,
        lastUpdated: groupsData.lastUpdated
      };
    }

    // Tmp videos directory
    if (pathStatus.tmpVideosDir) {
      const tmpFiles = fs.readdirSync(PATHS.TMP_VIDEOS_DIR);
      const totalSize = tmpFiles.reduce((sum, file) => {
        const filePath = path.join(PATHS.TMP_VIDEOS_DIR, file);
        return sum + fs.statSync(filePath).size;
      }, 0);
      fileDetails.tmpVideosDir = {
        path: PATHS.TMP_VIDEOS_DIR,
        count: tmpFiles.length,
        totalSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
        files: tmpFiles
      };
    }

    // Environment info
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      USE_DISK: process.env.USE_DISK,
      DISK_MOUNT_PATH: process.env.DISK_MOUNT_PATH,
      isPersistentDisk: diskConfig.usingPersistentDisk
    };

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      config: diskConfig,
      environment: envInfo,
      pathStatus,
      fileDetails,
      summary: {
        authFilesCount: fileDetails.authDir?.count || 0,
        contactsCount: fileDetails.contactsFile?.contactCount || 0,
        groupsCount: fileDetails.groupsFile?.groupCount || 0,
        tmpVideosCount: fileDetails.tmpVideosDir?.count || 0,
        allPathsOk: Object.values(pathStatus).every(status => status === true)
      }
    });
  } catch (error) {
    console.error('[DISK-INFO] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Global error handler - JSON response döndür (HTML yerine)
app.use((err, req, res, next) => {
  logger.error('[EXPRESS ERROR]', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  console.error('[EXPRESS ERROR]', err.message);
  console.error('[EXPRESS ERROR] Stack:', err.stack);

  // JSON response döndür
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    status: err.status || 500
  });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info('═════════════════════════════════════════════════════');
  logger.info(`✅ WhatsApp Web.js Server Started`);
  logger.info(`   Local URL: http://localhost:${PORT}`);
  logger.info(`   Base Path: ${BASE_PATH || '(direct access)'}`);
  logger.info(`   Log Files: ${logDir || 'Console only'}`);
  logger.info('═════════════════════════════════════════════════════');

  // ngrok'u sadece USE_NGROK=true ise başlat (localhost geliştirme için)
  // Render.com/production ortamlarında USE_NGROK kullanma!
  if (process.env.USE_NGROK === 'true') {
    logger.info('[TUNNEL] USE_NGROK=true, ngrok başlatılıyor...');
    startTunnel();
  } else {
    logger.info('[TUNNEL] ngrok devre dışı (USE_NGROK ayarlanmamış)');
  }
});
