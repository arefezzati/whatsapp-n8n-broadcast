/**
 * Baileys Test Server
 * ---------------------------------------------------------
 * Sadece /send-video-to-contacts-grouped endpoint'ini test eder
 * Forward message çalışıyor mu kontrol eder
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

const app = express();
app.use(express.json());

// ==== Config ====
const PORT = 3002;
const AUTH_DIR = './auth_info_baileys';
const TMP_DIR = './tmp_videos';

// Forward parametreleri
const FORWARD_DELAY = 600;            // 0.6s
const FORWARD_BURST_SIZE = 50;        // 50 kişi
const FORWARD_BURST_COOLDOWN = 60000; // 60s

// ==== Global state ====
let sock = null;
let qrCodeString = null;
let isReady = false;
const videoCache = new Map(); // url -> cachedPath

// ==== Directories ====
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ==== Helper: Load JSON files ====
function loadGroups() {
  try {
    const data = fs.readFileSync('./groups.json', 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[ERROR] groups.json okunamadı:', err.message);
    return { groups: [] };
  }
}

function loadContacts() {
  try {
    const data = fs.readFileSync('./contacts.json', 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[ERROR] contacts.json okunamadı:', err.message);
    return { contacts: [] };
  }
}

// ==== Helper: Video Cache ====
async function getOrCacheVideo(url) {
  if (videoCache.has(url)) {
    console.log(`[CACHE] Video zaten cache'de: ${url}`);
    return videoCache.get(url);
  }

  console.log(`[CACHE] Video indiriliyor: ${url}`);
  const filename = `cached_${Date.now()}.mp4`;
  const filepath = path.join(TMP_DIR, filename);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Video indirilemedi: HTTP ${response.status}`);

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));

  videoCache.set(url, filepath);
  console.log(`[CACHE] Video cache'lendi: ${filename}`);
  return filepath;
}

function clearAllCache() {
  console.log(`[CACHE] Temizleniyor (${videoCache.size} video)...`);
  for (const [url, filepath] of videoCache.entries()) {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (err) {
      console.error(`[CACHE] Dosya silinemedi: ${filepath}`, err.message);
    }
  }
  videoCache.clear();
  console.log('[CACHE] Cache temizlendi');
}

// ==== Baileys Connection ====
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`[BAILEYS] Version: ${version.join('.')}, Latest: ${isLatest}`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // QR'ı kendimiz göstereceğiz
    logger: pino({ level: 'silent' }), // Log'ları sustur
    browser: ['Baileys Test', 'Chrome', '1.0.0']
  });

  // QR event
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeString = qr;
      console.log('[QR] Yeni QR kodu üretildi → http://localhost:3002/qr');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true;

      console.log('[DISCONNECT] Bağlantı kesildi, yeniden bağlanıyor:', shouldReconnect);
      
      if (shouldReconnect) {
        await connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('[BAILEYS] ✅ Bağlantı başarılı! WhatsApp hazır.');
      isReady = true;
      qrCodeString = null;
    }
  });

  // Credentials save
  sock.ev.on('creds.update', saveCreds);
}

// ==== Start Connection ====
connectToWhatsApp().catch(err => {
  console.error('[BAILEYS] Bağlantı hatası:', err);
});

// ==== Express Routes ====

// QR gösterme
app.get('/qr', async (req, res) => {
  if (!qrCodeString) {
    return res.status(404).send('QR kodu henüz üretilmedi veya oturum zaten açık.');
  }

  try {
    const qrImage = await QRCode.toDataURL(qrCodeString);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Baileys QR Code</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; }
          h1 { color: #25D366; }
          img { border: 2px solid #25D366; border-radius: 10px; }
          .info { margin-top: 20px; color: #666; }
        </style>
      </head>
      <body>
        <h1>📱 WhatsApp QR Kodu (Baileys Test)</h1>
        <img src="${qrImage}" alt="QR Code" />
        <div class="info">
          <p>WhatsApp uygulamasından QR kodunu tarayın</p>
          <p>Port: ${PORT}</p>
        </div>
        <script>
          setTimeout(() => location.reload(), 3000);
        </script>
      </body>
      </html>
    `;
    res.send(html);
  } catch (err) {
    res.status(500).send('QR kodu oluşturulamadı: ' + err.message);
  }
});

// Status
app.get('/status', (req, res) => {
  res.json({
    ready: isReady,
    hasQR: !!qrCodeString,
    cacheSize: videoCache.size
  });
});

// ==== ENDPOINT: /send-video-to-contacts-grouped ====
app.post('/send-video-to-contacts-grouped', async (req, res) => {
  const startTime = Date.now();
  const { videoUrls, captions, country, language } = req.body || {};

  console.log('[GROUPED-FORWARD] Request received', {
    videoCount: videoUrls?.length,
    country,
    language,
    ready: isReady
  });

  if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
    return res.status(400).json({ error: 'videoUrls array gerekli' });
  }

  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp hazır değil, QR tarayın' });
  }

  try {
    // 1) Unified targets (grup + kişi)
    const groupsData = loadGroups();
    let activeGroups = (groupsData.groups || []).filter(g => g.isActive);

    const contactsData = loadContacts();
    let filteredContacts = (contactsData.contacts || []).filter(c => c.active);

    if (country) {
      filteredContacts = filteredContacts.filter(c => c.country === country.toUpperCase());
    }
    if (language) {
      filteredContacts = filteredContacts.filter(c => c.language === language.toLowerCase());
    }

    const unifiedTargets = [
      ...activeGroups.map(g => ({
        type: 'group',
        jid: g.id, // Baileys JID formatı
        name: g.name || 'Group'
      })),
      ...filteredContacts.map(c => ({
        type: 'contact',
        jid: `${c.phone}@s.whatsapp.net`, // Baileys JID formatı
        name: c.name || 'Contact'
      }))
    ];

    if (unifiedTargets.length === 0) {
      return res.json({
        queued: 0,
        totalTargets: 0,
        message: 'Aktif hedef bulunamadı'
      });
    }

    console.log(`[GROUPED-FORWARD] ${unifiedTargets.length} hedef bulundu`);

    // 2) İLK HEDEFE SEND (normal video gönderimi - upload edilecek)
    let sentMessages = [];
    const firstTarget = unifiedTargets[0];

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📤 İLK KİŞİYE NORMAL SEND (Upload edilecek)`);
    console.log(`   Hedef: ${firstTarget.name} (${firstTarget.jid})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    for (let i = 0; i < videoUrls.length; i++) {
      const vUrl = videoUrls[i];
      const cap = (captions && captions[i]) ? captions[i] : '';

      console.log(`[SEND] Video ${i + 1}/${videoUrls.length} cache'leniyor...`);
      const cacheStart = Date.now();
      const cachedPath = await getOrCacheVideo(vUrl);
      const cacheTime = Date.now() - cacheStart;
      const videoBuffer = fs.readFileSync(cachedPath);

      const sendStart = Date.now();
      const sentMsg = await sock.sendMessage(firstTarget.jid, {
        video: videoBuffer,
        caption: cap,
        mimetype: 'video/mp4'
      });
      const sendTime = Date.now() - sendStart;

      sentMessages.push(sentMsg);
      
      console.log(`[SEND] ✅ Video ${i + 1}/${videoUrls.length} GÖNDERİLDİ`);
      console.log(`      → ${firstTarget.name}`);
      console.log(`      📊 Cache: ${cacheTime}ms`);
      console.log(`      📤 Upload: ${sendTime}ms (VIDEO UPLOAD EDİLDİ)`);
      console.log(`      🔑 Message Key: ${sentMsg.key.id}`);
      console.log(`      📹 Video Message: ${!!sentMsg.message?.videoMessage ? 'VAR' : 'YOK'}\n`);

      await delay(2000);
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ İLK KİŞİYE SEND TAMAMLANDI`);
    console.log(`   Gönderilen video sayısı: ${videoUrls.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ İLK KİŞİYE SEND TAMAMLANDI`);
    console.log(`   Gönderilen video sayısı: ${videoUrls.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 3) DİĞER HEDEFLERE FORWARD (upload YOK, sadece referans)
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`⏩ DİĞER KİŞİLERE FORWARD (Upload YOK)`);
    console.log(`   Toplam: ${unifiedTargets.length - 1} kişi`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    let forwardedCount = 0;
    for (let i = 1; i < unifiedTargets.length; i++) {
      const target = unifiedTargets[i];

      console.log(`[FORWARD] ${i}/${unifiedTargets.length - 1}: ${target.name}`);

      try {
        for (const msg of sentMessages) {
          const fwdStart = Date.now();
          
          // ✅ Baileys forward API (test: upload var mı yok mu?)
          await sock.sendMessage(target.jid, { forward: msg });
          
          const fwdDuration = Date.now() - fwdStart;
          console.log(`         ⚡ Forward: ${fwdDuration}ms ${fwdDuration < 2000 ? '(HIZLI - upload YOK)' : '(YAVAŞ - upload VAR!)'}`);
        }

        forwardedCount++;
        console.log(`         ✅ Forward başarılı: ${sentMessages.length} mesaj\n`);

        await delay(FORWARD_DELAY);

        if (forwardedCount % FORWARD_BURST_SIZE === 0) {
          console.log(`[FORWARD] ⏸️  ${forwardedCount} kişi tamamlandı, ${FORWARD_BURST_COOLDOWN / 1000}s cooldown...\n`);
          await delay(FORWARD_BURST_COOLDOWN);
        }

      } catch (forwardError) {
        console.error(`[FORWARD] ❌ Hata: ${target.name} - ${forwardError.message}\n`);
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ FORWARD TAMAMLANDI`);
    console.log(`   ${forwardedCount}/${unifiedTargets.length - 1} kişi başarılı`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 4) Cache temizle
    clearAllCache();
    
    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`🎉 İŞLEM TAMAMLANDI`);
    console.log(`   📤 İlk kişiye SEND: 1 kişi (${videoUrls.length} video upload)`);
    console.log(`   ⏩ Diğerlerine FORWARD: ${forwardedCount} kişi (upload YOK)`);
    console.log(`   📊 Toplam hedef: ${unifiedTargets.length}`);
    console.log(`   ⏱️  Süre: ${Math.ceil((Date.now() - startTime) / 1000)}s`);
    console.log(`═══════════════════════════════════════════════════\n`);

    const processingTime = Date.now() - startTime;
    return res.json({
      success: true,
      mode: 'baileys-forward',
      sentToFirst: firstTarget.name,
      totalVideos: videoUrls.length,
      totalTargets: unifiedTargets.length,
      forwardedTo: forwardedCount,
      processingTime,
      estimatedTime: `~${Math.ceil((forwardedCount * FORWARD_DELAY) / 1000 / 60)} dakika`
    });

  } catch (error) {
    console.error('[GROUPED-FORWARD] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==== Start Server ====
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('✅ Baileys Test Server Started');
  console.log(`   QR URL: http://localhost:${PORT}/qr`);
  console.log(`   Status: http://localhost:${PORT}/status`);
  console.log(`   Endpoint: POST http://localhost:${PORT}/send-video-to-contacts-grouped`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');
});
