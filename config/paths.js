/**
 * Persistent Disk Configuration for Render.com
 * Mount Path: /var/data
 * 
 * Bu modül tüm persistent data path'lerini merkezi olarak yönetir.
 * Render.com'da disk mount edildiğinde tüm önemli veriler /var/data içine yazılır.
 */

import path from 'path';
import fs from 'fs';

// Render.com disk mount path (varsayılan: /var/data)
const DISK_MOUNT_PATH = process.env.DISK_MOUNT_PATH || '/var/data';

// Production ortamında disk kullan, development'ta proje dizini kullan
const USE_PERSISTENT_DISK = process.env.NODE_ENV === 'production' || process.env.USE_DISK === 'true';

// Base path: Disk kullanılıyorsa mount path, değilse current working directory
const BASE_PATH = USE_PERSISTENT_DISK ? DISK_MOUNT_PATH : process.cwd();

// Path yapılandırması
export const PATHS = {
  // Baileys session dosyaları (WhatsApp authentication)
  AUTH_DIR: path.join(BASE_PATH, 'auth_info_baileys'),
  
  // JSON data files (contacts, groups, countries)
  CONTACTS_FILE: path.join(BASE_PATH, 'contacts.json'),
  GROUPS_FILE: path.join(BASE_PATH, 'groups.json'),
  COUNTRIES_FILE: path.join(BASE_PATH, 'countries.json'),
  
  // Temporary videos (galeri upload'ları)
  TMP_VIDEOS_DIR: path.join(BASE_PATH, 'tmp_videos'),
  
  // Logs directory (opsiyonel)
  LOGS_DIR: path.join(BASE_PATH, 'logs', 'whatsapp-web'),
  
  // Base path
  BASE: BASE_PATH
};

/**
 * Gerekli klasörleri oluştur
 */
export function initializePaths() {
  const directories = [
    PATHS.AUTH_DIR,
    PATHS.TMP_VIDEOS_DIR,
    PATHS.LOGS_DIR
  ];

  directories.forEach(dir => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[DISK] Klasör oluşturuldu: ${dir}`);
      }
    } catch (error) {
      console.error(`[DISK] Klasör oluşturulamadı: ${dir}`, error.message);
    }
  });

  console.log(`[DISK] Persistent storage ${USE_PERSISTENT_DISK ? 'ACTIVE' : 'DISABLED'}`);
  console.log(`[DISK] Base path: ${BASE_PATH}`);
  console.log(`[DISK] Auth directory: ${PATHS.AUTH_DIR}`);
  console.log(`[DISK] Contacts file: ${PATHS.CONTACTS_FILE}`);
  console.log(`[DISK] Groups file: ${PATHS.GROUPS_FILE}`);
  console.log(`[DISK] Tmp videos: ${PATHS.TMP_VIDEOS_DIR}`);
}

/**
 * Disk bilgilerini döndür (monitoring için)
 */
export function getDiskInfo() {
  return {
    usePersistentDisk: USE_PERSISTENT_DISK,
    mountPath: DISK_MOUNT_PATH,
    basePath: BASE_PATH,
    paths: PATHS
  };
}

/**
 * Dosya/klasör varlık kontrolü
 */
export function checkPathExists(pathToCheck) {
  try {
    return fs.existsSync(pathToCheck);
  } catch {
    return false;
  }
}

export default PATHS;
