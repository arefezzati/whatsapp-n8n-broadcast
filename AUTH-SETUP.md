# 🔐 Token Authentication Kurulumu

## Neden Gerekli?

WhatsApp paneline herkes erişmesin, sadece sitenizden gelen linklerle açılsın.

## Render.com Kurulumu

### 1. Environment Variable Ekle

Render.com Dashboard → Your Service → Environment

```
ACCESS_TOKEN=your-super-secret-token-here-123456
```

**Önemli:** Güçlü bir token seçin (örnek: `wh4ts4pp-p4n3l-s3cur3-t0k3n-2024`)

### 2. Redeploy

Environment variable ekledikten sonra "Manual Deploy" → "Deploy latest commit"

## PHP Sitenizde Kullanım

### Basit Kullanım

```php
<?php
// config.php veya ayarlar dosyanızda
define('WHATSAPP_PANEL_URL', 'https://whatsapp-n8n-broadcast.onrender.com');
define('WHATSAPP_ACCESS_TOKEN', 'your-super-secret-token-here-123456');

// Link oluşturma
$service_url = WHATSAPP_PANEL_URL . '?token=' . WHATSAPP_ACCESS_TOKEN;
Session::set('service_url', $service_url);
?>
```

### HTML'de Kullanım

```php
<li>
   <a href="<?php echo Session::get('service_url'); ?>">
      <i class="fa fa-th"></i>
      <span class="title">WhatsApp Paneli</span>
   </a>
</li>
```

## Nasıl Çalışır?

### ✅ İZİN VERİLEN:
- `https://whatsapp-n8n-broadcast.onrender.com?token=your-secret-token` → **AÇILIR**
- Sitenizden gelen linkler (token'lı) → **AÇILIR**

### ❌ ENGELLENEN:
- `https://whatsapp-n8n-broadcast.onrender.com` (token yok) → **403 Forbidden**
- Birisi linki kopyalar, token'ı siler → **403 Forbidden**
- Direkt tarayıcıya yazılan linkler → **403 Forbidden**

## Güvenlik Notları

1. **Token'ı gizli tutun:** Environment variable kullanın, kodda yazmayın
2. **Güçlü token seçin:** Minimum 20 karakter, karışık karakterler
3. **Token'ı değiştirin:** Şüphe durumunda yeni token oluşturun
4. **HTTPS kullanın:** Render.com otomatik HTTPS sağlar

## Test Etme

### Başarılı Erişim (Token ile)
```bash
curl "https://whatsapp-n8n-broadcast.onrender.com?token=your-secret-token"
```
→ Ana sayfa HTML'i döner

### Başarısız Erişim (Token olmadan)
```bash
curl "https://whatsapp-n8n-broadcast.onrender.com"
```
→ 403 Forbidden hatası döner

## Sorun Giderme

### "403 Forbidden" Hatası
- Token doğru mu? Render.com'daki `ACCESS_TOKEN` ile eşleşiyor mu?
- Token URL'de var mı? `?token=xxx` formatında mı?

### Token Çalışmıyor
- Render.com'da environment variable eklenmiş mi?
- Redeploy yapıldı mı?
- Token'da boşluk/özel karakter var mı?

## API Endpoint'leri

API endpoint'leri token kontrolünden **muaf**:
- `/api/*` → Token gerekmez (N8N entegrasyonu için)
- `/status` → Token gerekmez
- `/qr` → Token gerekmez

HTML sayfaları token ister:
- `/` → Token gerekir
- `/contacts` → Token gerekir
- `/groups` → Token gerekir
- `/monitor` → Token gerekir
- `/disk-status` → Token gerekir
