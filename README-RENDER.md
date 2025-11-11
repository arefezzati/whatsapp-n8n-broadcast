# 📱 WhatsApp Bridge - Render.com Deployment Guide

## 🔥 Persistent Disk Yapılandırması

Bu uygulama **Render.com Persistent Disk** ile çalışmak üzere yapılandırılmıştır.

### Disk Mount Edildiğinde (`/var/data`):
- ✅ `auth_info_baileys/` - WhatsApp session (QR okutma gerekmez)
- ✅ `contacts.json` - Kişi listesi
- ✅ `groups.json` - Grup listesi
- ✅ `tmp_videos/` - Galeri upload'ları (gönderim sonrası silinir)
- ✅ `logs/` - Log dosyaları (FILE_LOGS=true ise)

### Disk Mount Edilmezse:
- ❌ Veriler proje dizinine yazılır
- ❌ Her restart'ta silinir
- ❌ QR okutmanız gerekir

---

## 🚀 Render.com Deployment (Adım Adım)

### 1️⃣ Persistent Disk Oluştur

Render Dashboard → **Disks** → **Create Disk**:

```
Name: whatsapp-data
Size: 1 GB ($1/ay)
Region: Web Service ile aynı region
```

### 2️⃣ Web Service Oluştur

Render Dashboard → **New** → **Web Service**:

#### Build & Deploy:
```bash
Build Command: npm install
Start Command: npm start
```

#### Environment Variables:
```env
# ZORUNLU - Persistent disk kullan
NODE_ENV=production
USE_DISK=true

# Disk mount path (değiştirme!)
DISK_MOUNT_PATH=/var/data

# Diğer ayarlar
PORT=10000
FILE_LOGS=true
USE_NGROK=false
```

#### Health Check:
```
Path: /health
Grace Period: 60 seconds
```

### 3️⃣ Persistent Disk'i Bağla

Service Settings → **Disks** → **Add Disk**:

```
Select Disk: whatsapp-data (oluşturduğun disk)
Mount Path: /var/data
```

⚠️ **ÖNEMLİ:** Mount path `/var/data` olmalı (Environment'taki DISK_MOUNT_PATH ile aynı!)

### 4️⃣ Deploy & Doğrulama

1. **Deploy et** ve logları izle:
   ```
   [DISK] Persistent storage ACTIVE
   [DISK] Base path: /var/data
   [DISK] Auth directory: /var/data/auth_info_baileys
   [DISK] Contacts file: /var/data/contacts.json
   ```

2. **Disk durumunu kontrol et:**
   ```bash
   curl https://yourapp.onrender.com/api/disk-info
   ```
   
   Beklenen response:
   ```json
   {
     "success": true,
     "config": {
       "usePersistentDisk": true,
       "mountPath": "/var/data",
       "basePath": "/var/data"
     },
     "pathStatus": {
       "authDir": true,
       "tmpVideosDir": true
     }
   }
   ```

3. **QR Okut (ilk kez):**
   - `https://yourapp.onrender.com` aç
   - QR'ı okut
   - Session `/var/data/auth_info_baileys/` altına kaydedilir

4. **Restart Sonrası:**
   - QR okutmaya gerek YOK! ✅
   - Session korunur
   - Otomatik bağlanır

---

## 🎯 Nasıl Çalışır?

### Development (localhost):
```
USE_DISK=false veya boş
→ Veriler proje dizinine yazılır (./contacts.json, ./auth_info_baileys/)
```

### Production (Render.com):
```
NODE_ENV=production
USE_DISK=true
DISK_MOUNT_PATH=/var/data
→ Veriler /var/data altına yazılır
→ Restart sonrası korunur ✅
```

### Dosya Yolları (config/paths.js):
```javascript
// Production (Disk mount edildiğinde):
PATHS.AUTH_DIR = '/var/data/auth_info_baileys'
PATHS.CONTACTS_FILE = '/var/data/contacts.json'
PATHS.GROUPS_FILE = '/var/data/groups.json'
PATHS.TMP_VIDEOS_DIR = '/var/data/tmp_videos'

// Development (Disk mount edilmediğinde):
PATHS.AUTH_DIR = './auth_info_baileys'
PATHS.CONTACTS_FILE = './contacts.json'
PATHS.GROUPS_FILE = './groups.json'
PATHS.TMP_VIDEOS_DIR = './tmp_videos'
```

---

## 🐛 Troubleshooting

### ❌ Her Restart'ta QR Okutuyorum!

**Sebep:** Persistent disk mount edilmemiş veya yanlış yapılandırılmış.

**Çözüm:**
1. Render Dashboard → Service → Disks kontrol et
2. Mount path `/var/data` olmalı
3. Environment variables kontrol et:
   ```
   NODE_ENV=production
   USE_DISK=true
   DISK_MOUNT_PATH=/var/data
   ```
4. `/api/disk-info` endpoint'ini kontrol et:
   ```json
   {
     "usePersistentDisk": true,  ← Bu true olmalı!
     "authFiles": 35             ← Session varsa 0'dan büyük olmalı
   }
   ```

### ❌ Disk Info: `usePersistentDisk: false`

**Sebep:** Environment variables eksik.

**Çözüm:**
```env
NODE_ENV=production  ← Eksikse disk aktif olmaz!
USE_DISK=true
```

### ❌ Mount Path Yanlış

**Sebep:** Render disk mount path ile environment variable uyuşmuyor.

**Çözüm:**
1. Render → Service → Disks → Mount path'i kontrol et
2. Environment variables → DISK_MOUNT_PATH ile aynı olmalı
3. Varsayılan: `/var/data`

### ❌ Kişiler/Gruplar Kayboluyor

**Sebep:** JSON dosyaları disk'e yazılmıyor.

**Çözüm:**
1. `/api/disk-info` ile path'leri kontrol et
2. `contactsFile: true` ve `groupsFile: true` olmalı
3. Disk dolmuş olabilir (1GB yeterli ama kontrol et)

---

## 📊 Monitoring

### Disk Durumu API:
```bash
GET /api/disk-info
```

Response:
```json
{
  "success": true,
  "config": {
    "usePersistentDisk": true,
    "mountPath": "/var/data",
    "basePath": "/var/data",
    "paths": {
      "AUTH_DIR": "/var/data/auth_info_baileys",
      "CONTACTS_FILE": "/var/data/contacts.json",
      "GROUPS_FILE": "/var/data/groups.json",
      "TMP_VIDEOS_DIR": "/var/data/tmp_videos"
    }
  },
  "pathStatus": {
    "authDir": true,
    "contactsFile": true,
    "groupsFile": false,
    "countriesFile": false,
    "tmpVideosDir": true
  },
  "fileCount": {
    "authFiles": 35,
    "tmpVideos": 0
  }
}
```

### Health Check:
```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-11T12:00:00.000Z",
  "uptime": 3600
}
```

---

## 🔄 Session Yönetimi

### Status Modal Butonları:

1. **🗑️ Session Temizle & QR Reset**
   - Endpoint: `POST /clear-session`
   - Tüm session dosyalarını siler (`/var/data/auth_info_baileys/`)
   - Yeni QR okutman gerekir

2. **🚪 Sadece Çıkış Yap**
   - Endpoint: `POST /logout`
   - Session dosyaları korunur
   - Restart sonrası otomatik bağlanır

3. **🔄 Durumu Yenile**
   - Endpoint: `GET /status`
   - Anlık WhatsApp bağlantı durumu

---

## 📝 Önemli Notlar

### ✅ Yapılması Gerekenler:
- Persistent Disk oluştur (1GB yeterli)
- Disk'i service'e mount et (`/var/data`)
- Environment variables'ı doğru ayarla
- İlk deployment'ta QR okut

### ❌ Yapılmaması Gerekenler:
- Disk mount path'ini değiştirme (`/var/data` kullan)
- Production'da `USE_NGROK=true` yapma
- Disk mount etmeden deploy etme

### 🔄 Temizleme Mantığı:
- **tmp_videos/** → Video gönderimi sonrası otomatik silinir
- **Cache** → Kuyruk boşalınca temizlenir
- **Session** → Sadece "Session Temizle" butonu ile silinir
- **JSON files** → Manuel temizleme gerekir

---

## 🎯 Başarı Kontrol Listesi

- [ ] Persistent Disk oluşturuldu (1GB, `/var/data`)
- [ ] Disk service'e mount edildi
- [ ] Environment variables doğru (`NODE_ENV=production`, `USE_DISK=true`)
- [ ] `/api/disk-info` endpoint'i `usePersistentDisk: true` döndürüyor
- [ ] QR okutuldu
- [ ] `/status` endpoint'i `ready: true` döndürüyor
- [ ] Restart sonrası session korundu ✅
- [ ] Kişiler/gruplar korundu ✅

---

**✅ HAZIR:** Persistent disk yapılandırması tamamlandı!
