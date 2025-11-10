# 📱 WhatsApp Bridge - Video Automation (Baileys v6.7.21)

**Baileys** tabanlı otomatik video gönderim ve broadcast servisi. WhatsApp Business API'ye alternatif, QR ile bağlantı.

## 🚀 Özellikler

- ✅ **Baileys 6.7.21** - Güncel WhatsApp protokolü
- ✅ **Forward Sistemi** - Hızlı toplu gönderim (10-20x daha hızlı)
- ✅ **Ban Koruması** - Circuit breaker, jitter, shuffle
- ✅ Kişi ve grup yönetimi (web arayüzü)
- ✅ Toplu video gönderimi (chunk sistemi)
- ✅ Video cache sistemi
- ✅ N8N entegrasyonu
- ✅ Gerçek zamanlı monitoring
- ✅ Çoklu dil desteği (TR, EN, RU, AR)

## 📦 Kurulum

### Localhost

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. Environment variables ayarla
cp .env.example .env
# .env dosyasını düzenle:
# FILE_LOGS=true
# USE_NGROK=false (veya true, dışarıdan erişim için)

# 3. Başlat
npm start

# 4. Tarayıcıda aç
# http://localhost:3001
```

### Render.com

#### 1️⃣ **Persistent Disk Oluştur (Önemli!)**

Render Dashboard → Disks → Create Disk:
- Name: `whatsapp-session`
- Size: `1 GB` ($1/ay)
- Mount Path: `/data/whatsapp-session`

#### 2️⃣ **Web Service Oluştur**

Render Dashboard → New → Web Service:

**Build & Deploy:**
- Build Command: `npm install`
- Start Command: `npm start`

**Environment Variables:**
```
PORT=3001
FILE_LOGS=false
USE_NGROK=false
```

**Health Check:**
- Health Check Path: `/health`

#### 3️⃣ **Persistent Disk Bağla**

Service Settings → Add Disk:
- Select: `whatsapp-session` (oluşturduğun disk)
- Mount Path: `/data/whatsapp-session`

#### 4️⃣ **Deploy & QR Okut**

1. Deploy et
2. `https://yourapp.onrender.com` adresine git
3. QR kodu okut
4. Persistent disk sayesinde **restart'ta session korunur**! ✅

## 🔌 API Endpoints

### Ana Sayfa
```
GET / - QR kodu sayfası
GET /contacts - Kişi yönetimi
GET /groups - Grup yönetimi
GET /monitor - Sistem monitörü
```

### Status
```
GET /status - WhatsApp durumu
GET /health - Health check (Render.com için)
```

### Video Gönderimi (N8N)
```
POST /send-video-to-contacts-grouped
Body: {
  "videoUrl": "https://...",
  "caption": "Mesaj",
  "batchSize": 5,
  "batchId": "batch-123",
  "isLastVideoInBatch": false,
  "autoFanout": true
}
```

### Kişi/Grup Yönetimi
```
GET /api/contacts - Kişi listesi
POST /api/contacts/save - Kişi kaydet
POST /api/contacts/clear - Tümünü sil
GET /api/whatsapp-contacts - WhatsApp'tan import
POST /api/import-whatsapp-contacts - Import et

GET /api/groups - Grup listesi
POST /api/groups/save - Grup kaydet
POST /api/groups/clear - Tümünü sil
GET /api/whatsapp-groups - WhatsApp'tan import
POST /api/import-whatsapp-groups - Import et
```

## 🏗️ Proje Yapısı

```
whatsapp_web_js/
├── server.js              # Ana server
├── package.json           # Bağımlılıklar
├── .env.example           # Örnek env dosyası
├── contacts.html          # Kişi yönetimi UI
├── groups.html            # Grup yönetimi UI
├── monitor.html           # Monitoring UI
├── assets/
│   ├── css/              # Stil dosyaları
│   └── js/               # Frontend JS
├── contacts.json          # Kişi veritabanı
├── groups.json            # Grup veritabanı
├── countries.json         # Ülke kodları
└── wweb-session/          # WhatsApp session (Render'da /data/whatsapp-session)
```

## ⚙️ Environment Variables

| Değişken | Varsayılan | Açıklama |
|----------|-----------|----------|
| `PORT` | `3001` | Server port |
| `FILE_LOGS` | `true` | Dosya logging (Render'da false) |
| `USE_NGROK` | `false` | Ngrok tunnel (Localhost'ta true) |
| `NGROK_AUTH_TOKEN` | - | Ngrok token (opsiyonel) |
| `BASE_PATH` | - | Reverse proxy için |

## 🐛 Troubleshooting

### QR Kod Çıkmıyor
- Chromium/Chrome yüklü mü kontrol et
- Persistent disk mount edilmiş mi?

### Session Kayboluyor (Render.com)
- ✅ Persistent Disk oluşturdun mu?
- ✅ Mount path doğru mu? (`/data/whatsapp-session`)
- ✅ Disk service'e bağlı mı?

### Video Gönderilmiyor
- WhatsApp bağlı mı? `/status` endpoint'i kontrol et
- Queue dolmuş olabilir, monitörü kontrol et

### Ngrok Hatası (Localhost)
- `USE_NGROK=true` set edilmiş mi?
- `NGROK_AUTH_TOKEN` doğru mu?

## 📝 Notlar

- **Render.com**: Persistent Disk **mutlaka** gerekli, yoksa her restart'ta QR okutursun
- **Video Cache**: `/tmp` klasörü ephemeral, restart sonrası silinir (normal)
- **Ngrok**: Sadece localhost geliştirme için, production'da kullanma
- **Session**: LocalAuth ile çalışıyor, persistent disk ile korunuyor

## 🔒 Güvenlik

- `.gitignore` ile `wweb-session/` klasörü git'e atılmaz
- Environment variables ile credential yönetimi
- QR kod sadece authorized kullanıcıya gösterilmeli

## 📄 Lisans

MIT

## 👤 Geliştirici

Svelto Stella WhatsApp Automation

---

**NOT:** Bu proje production-ready hale getirilmiştir. Session persistence, logging ve deployment konuları çözülmüştür.
