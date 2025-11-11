# 🚀 WhatsApp Panel - Kullanım Kılavuzu

## Ne Yaptık?

Panel artık **token korumalı**. Sadece tokenli linkler çalışır, direkt URL erişimi engellenir.

---

## 📋 Senaryolar

### 1️⃣ Render.com (Şu Anki Durum)

#### Adım 1: Render.com'da Token Ayarla

Dashboard → Your Service → Environment → Add Environment Variable

```
ACCESS_TOKEN = wh4ts4pp-s3cur3-t0k3n-2024-xyz789
```

**Not:** Kendi güçlü tokeninizi oluşturun!

#### Adım 2: Redeploy

Manual Deploy → Deploy latest commit

#### Adım 3: PHP Sitende Link Oluştur

```php
<?php
// config.php
define('WHATSAPP_PANEL_URL', 'https://whatsapp-n8n-broadcast.onrender.com');
define('WHATSAPP_TOKEN', 'wh4ts4pp-s3cur3-t0k3n-2024-xyz789');

// Link oluştur
$whatsapp_panel_link = WHATSAPP_PANEL_URL . '?token=' . WHATSAPP_TOKEN;
?>

<!-- HTML'de kullan -->
<a href="<?php echo $whatsapp_panel_link; ?>">
    <i class="fa fa-whatsapp"></i>
    WhatsApp Paneli
</a>
```

---

### 2️⃣ VPS (Gelecekte Geçiş Yapacaksan)

#### Adım 1: VPS'e Yükle

```bash
# Projeyi klonla
cd /opt
git clone https://github.com/arefezzati/whatsapp-n8n-broadcast.git
cd whatsapp-n8n-broadcast/whatsapp_web_js

# Node.js kurulu değilse (Ubuntu):
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Paketleri kur
npm install
```

#### Adım 2: .env Dosyası Oluştur

```bash
# .env dosyası oluştur
cp .env.example .env
nano .env
```

**.env içeriği:**
```env
PORT=3001
NODE_ENV=production
USE_DISK=true
DISK_MOUNT_PATH=/opt/whatsapp-data
FILE_LOGS=true
USE_NGROK=false
ACCESS_TOKEN=wh4ts4pp-s3cur3-t0k3n-2024-xyz789
```

#### Adım 3: Disk Klasörü Oluştur

```bash
sudo mkdir -p /opt/whatsapp-data
sudo chown -R $USER:$USER /opt/whatsapp-data
```

#### Adım 4: PM2 ile Başlat

```bash
# PM2 kur (global)
sudo npm install -g pm2

# Uygulamayı başlat
pm2 start npm --name "whatsapp-bridge" -- start

# Otomatik başlatma
pm2 save
pm2 startup
```

#### Adım 5: Nginx Reverse Proxy (Opsiyonel)

```bash
sudo nano /etc/nginx/sites-available/whatsapp
```

```nginx
server {
    listen 80;
    server_name whatsapp.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Aktif et
sudo ln -s /etc/nginx/sites-available/whatsapp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Adım 6: SSL (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d whatsapp.yourdomain.com
```

#### Adım 7: PHP Sitende Link Güncelle

```php
<?php
// config.php
define('WHATSAPP_PANEL_URL', 'https://whatsapp.yourdomain.com');
define('WHATSAPP_TOKEN', 'wh4ts4pp-s3cur3-t0k3n-2024-xyz789');

// Link oluştur
$whatsapp_panel_link = WHATSAPP_PANEL_URL . '?token=' . WHATSAPP_TOKEN;
?>
```

---

## 🔐 Güvenlik Kontrolleri

### ✅ ÇALIŞIR (Token ile)
```
https://whatsapp-n8n-broadcast.onrender.com?token=wh4ts4pp-s3cur3-t0k3n-2024-xyz789
```
→ Panel açılır

### ❌ ÇALIŞMAZ (Token olmadan)
```
https://whatsapp-n8n-broadcast.onrender.com
```
→ **403 Forbidden** hatası

### ❌ ÇALIŞMAZ (Yanlış token)
```
https://whatsapp-n8n-broadcast.onrender.com?token=wrong-token
```
→ **403 Forbidden** hatası

---

## 📱 Senin Linkler Nasıl Olacak?

### Render.com Kullanıyorsan:
```
https://whatsapp-n8n-broadcast.onrender.com?token=SENIN-TOKENIN
```

### VPS Kullanacaksan:
```
https://whatsapp.yourdomain.com?token=SENIN-TOKENIN
```

### PHP Session ile (Önerilir):
```php
<?php
// Login sonrası session'a kaydet
Session::set('whatsapp_panel_url', WHATSAPP_PANEL_URL . '?token=' . WHATSAPP_TOKEN);

// Menüde kullan
?>
<a href="<?php echo Session::get('whatsapp_panel_url'); ?>">
    WhatsApp Paneli
</a>
```

---

## 🛠️ PM2 Komutları (VPS için)

```bash
# Durumu kontrol et
pm2 status

# Logları görüntüle
pm2 logs whatsapp-bridge

# Yeniden başlat
pm2 restart whatsapp-bridge

# Durdur
pm2 stop whatsapp-bridge

# Sil
pm2 delete whatsapp-bridge

# Monitoring
pm2 monit
```

---

## 🔄 Güncelleme (VPS)

```bash
# Projeyi güncelle
cd /opt/whatsapp-n8n-broadcast/whatsapp_web_js
git pull origin main

# Paketleri güncelle
npm install

# Uygulamayı yeniden başlat
pm2 restart whatsapp-bridge
```

---

## ⚠️ Token Güvenliği

1. **Asla GitHub'a commit etme**
   - `.env` dosyası `.gitignore` içinde
   - Sadece `.env.example` commit edilir

2. **Güçlü token kullan**
   - Minimum 20 karakter
   - Büyük-küçük harf + rakam + özel karakter
   - Örnek: `Wh4tS@pp!P4n3l#2024$Xyz789`

3. **Token'ı gizli tut**
   - Environment variable kullan
   - PHP'de database'den çek
   - Asla frontend kodunda gösterme

4. **Düzenli değiştir**
   - Şüphe durumunda yeni token oluştur
   - Render.com/VPS'de environment variable güncelle
   - PHP config'i güncelle

---

## 📊 Monitoring

### Render.com:
- Dashboard → Logs (otomatik)
- `/disk-status` sayfası

### VPS:
- `pm2 logs whatsapp-bridge`
- `pm2 monit`
- `/disk-status` sayfası
- Log dosyası: `/opt/whatsapp-data/logs/`

---

## 🆘 Sorun Giderme

### 403 Forbidden Hatası
**Sebep:** Token yok veya yanlış
**Çözüm:** 
1. Render.com/VPS'de `ACCESS_TOKEN` kontrol et
2. PHP linkinde token var mı kontrol et
3. Token doğru mu kontrol et

### WhatsApp Bağlanmıyor
**Sebep:** Session expire olmuş
**Çözüm:** Ana sayfada QR okut

### Disk Dolu
**Sebep:** tmp_videos temizlenmemiş
**Çözüm:** `/disk-status` sayfasından kontrol et

---

## 📞 İletişim

Sorularınız için:
- GitHub Issues: https://github.com/arefezzati/whatsapp-n8n-broadcast/issues
