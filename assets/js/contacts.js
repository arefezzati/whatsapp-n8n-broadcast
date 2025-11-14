/**
 * WhatsApp Kişi Yönetimi - Ana JavaScript Dosyası
 * Contact Manager Class
 */

class ContactManager {
  constructor() {
    this.contacts = [];
    this.selectedContacts = new Set();
    this.countries = {};
    this.countryGroups = {};
    this.init();
  }

  async init() {
    this.showLoading(true);
    await this.loadCountries();
    this.populateCountryDropdown();
    await this.loadContacts();
    this.bindEvents();
    this.renderContacts();
    this.updateStats();
    this.showLoading(false);

    console.log('WhatsApp Kişi Yönetimi başlatıldı');
  }

  // Loading göster/gizle
  showLoading(show) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.style.display = show ? 'flex' : 'none';
    }
  }

  // Lazy loading setup - KALDIRILDI
  // setupLazyLoading() { ... }
  
  // Daha fazla kişi yükle - KALDIRILDI
  // loadMoreContacts() { ... }

  // Ülke verilerini yükle
  async loadCountries() {
    try {
      const response = await fetch('/countries.json');
      const data = await response.json();

      this.countries = data.countries || {};
      this.countryGroups = data.groups || {};

      console.log('Ülke verileri yüklendi:', Object.keys(this.countries).length, 'ülke');
    } catch (error) {
      console.error('Ülke verisi yüklenirken hata:', error);
      this.useFallbackCountries();
    }
  }

  // Fallback ülke verileri
  useFallbackCountries() {
    this.countries = {
      'TR': { name: 'Türkiye', flag: '🇹🇷', code: '+90', prefixes: ['90'], language: 'tr' },
      'DE': { name: 'Almanya', flag: '🇩🇪', code: '+49', prefixes: ['49'], language: 'en' },
      'RU': { name: 'Rusya', flag: '🇷🇺', code: '+7', prefixes: ['7'], language: 'ru' }
    };
    this.countryGroups = {
      'main': { name: 'Ana Ülkeler', countries: ['TR', 'DE', 'RU'] }
    };
  }

  // Ülke dropdown'unu doldur
  populateCountryDropdown() {
    const select = document.getElementById('contactCountry');
    select.innerHTML = '';

    // Grup bazında dropdown oluştur
    Object.entries(this.countryGroups).forEach(([groupKey, group]) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.name;

      group.countries.forEach(countryCode => {
        const country = this.countries[countryCode];
        if (country) {
          const option = document.createElement('option');
          option.value = countryCode;
          option.textContent = `${country.flag} ${country.name} (${country.code})`;
          optgroup.appendChild(option);
        }
      });

      select.appendChild(optgroup);
    });

    console.log('Dropdown dolduruldu, grup sayısı:', Object.keys(this.countryGroups).length);
  }

  // Event listener'ları bağla
  bindEvents() {
    document.getElementById('addContactBtn').addEventListener('click', () => this.toggleAddForm());
    document.getElementById('importWhatsAppBtn').addEventListener('click', () => this.importWhatsAppContacts());
    document.getElementById('cancelAddBtn').addEventListener('click', () => this.toggleAddForm(false));
    document.getElementById('saveContactBtn').addEventListener('click', () => this.saveNewContact());
    document.getElementById('selectAllBtn').addEventListener('click', () => this.selectAll());
    document.getElementById('deselectAllBtn').addEventListener('click', () => this.deselectAll());
    document.getElementById('saveListBtn').addEventListener('click', () => this.saveContactsList());
    document.getElementById('clearListBtn').addEventListener('click', () => this.clearContactsList());
    document.getElementById('searchInput').addEventListener('input', (e) => this.filterContacts(e.target.value));

    // Radio button filtre event listener'ları
    document.querySelectorAll('input[name="contactFilter"]').forEach(radio => {
      radio.addEventListener('change', (e) => this.applyFilter(e.target.value));
    });

    // Video gönderim event listener'ları
    document.getElementById('sendVideoBtn').addEventListener('click', () => this.toggleVideoForm());
    document.getElementById('cancelVideoBtn').addEventListener('click', () => this.toggleVideoForm(false));
    document.getElementById('sendVideoNowBtn').addEventListener('click', () => this.sendVideoToSelected());

    // Video upload event listener'ları
    this.initVideoUpload();
  }

  // Kişileri sunucudan yükle
  async loadContacts() {
    try {
      const response = await fetch('/api/contacts');
      if (response.ok) {
        const data = await response.json();
        this.contacts = data.contacts || [];
        this.selectedContacts = new Set(data.contacts.filter(c => c.active).map(c => c.id));
      }
    } catch (error) {
      console.log('İlk yükleme, örnek veri oluşturuluyor...');
      this.createSampleData();
    }
  }

  // Örnek veri oluştur
  createSampleData() {
    this.contacts = [
      { id: 1, name: 'Ahmet Yılmaz', phone: '905551234567', country: 'TR', language: 'tr', active: true },
      { id: 2, name: 'Vladimir Putin', phone: '79161234567', country: 'RU', language: 'ru', active: true },
      { id: 3, name: 'John Smith', phone: '15551234567', country: 'US', language: 'en', active: false },
      { id: 4, name: 'Mohammed Ali', phone: '966501234567', country: 'SA', language: 'ar', active: true },
      { id: 5, name: 'Hans Mueller', phone: '491701234567', country: 'DE', language: 'en', active: true }
    ];
    this.selectedContacts = new Set(this.contacts.filter(c => c.active).map(c => c.id));
  }

  // Kişi ekleme formunu aç/kapat
  toggleAddForm(show = null) {
    const form = document.getElementById('addContactForm');
    if (show === null) {
      show = !form.classList.contains('show');
    }

    if (show) {
      form.classList.add('show');
      document.getElementById('contactName').focus();
    } else {
      form.classList.remove('show');
      this.clearForm();
    }
  }

  // Formu temizle
  clearForm() {
    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '';
    document.getElementById('contactCountry').value = 'TR';
    document.getElementById('contactLanguage').value = 'tr';
    document.getElementById('contactMessage').value = '';
  }

  // Yeni kişi kaydet
  async saveNewContact() {
    const name = document.getElementById('contactName').value.trim();
    const phone = document.getElementById('contactPhone').value.trim();
    const country = document.getElementById('contactCountry').value;
    const language = document.getElementById('contactLanguage').value;
    const message = document.getElementById('contactMessage').value.trim();

    if (!name || !phone || !message) {
      this.showToast('Ad, telefon numarası ve karşılama mesajı gerekli!', 'error');
      return;
    }

    const newContact = {
      id: Math.max(...this.contacts.map(c => c.id), 0) + 1,
      name,
      phone,
      country,
      language,
      active: true
    };

    this.contacts.push(newContact);
    this.selectedContacts.add(newContact.id);
    this.renderContacts();
    this.updateStats();
    this.toggleAddForm(false);
    this.showToast('Kişi eklendi, kaydediliyor...', 'info');

    // Kişiyi server'a kaydet
    await this.saveContactsList();

    // WhatsApp'a da ekle
    try {
      this.showToast('WhatsApp\'a ekleniyor...', 'info');
      const response = await fetch('/api/add-to-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, message })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        this.showToast(`${name} WhatsApp'a başarıyla eklendi!`, 'success');
      } else {
        this.showToast(`Kişi kaydedildi ama WhatsApp'a eklenemedi: ${result.error}`, 'warning');
      }
    } catch (error) {
      console.error('WhatsApp ekleme hatası:', error);
      this.showToast('Kişi kaydedildi ama WhatsApp\'a eklenemedi', 'warning');
    }
  }

  // Tümünü seç
  selectAll() {
    this.contacts.forEach(contact => {
      this.selectedContacts.add(contact.id);
    });
    this.renderContacts();
    this.updateStats();
  }

  // Seçimi kaldır
  deselectAll() {
    this.selectedContacts.clear();
    this.renderContacts();
    this.updateStats();
  }

  // Kişi listesini kaydet
  async saveContactsList() {
    const activeContacts = this.contacts.map(contact => ({
      ...contact,
      active: this.selectedContacts.has(contact.id)
    }));

    try {
      const response = await fetch('/api/contacts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: activeContacts })
      });

      if (response.ok) {
        this.showToast('Kişi listesi başarıyla kaydedildi!');
      } else {
        throw new Error('Kaydetme hatası');
      }
    } catch (error) {
      this.showToast('Kaydetme sırasında hata oluştu!', 'error');
    }
  }

  // Kişi listesini temizle
  async clearContactsList() {
    // Onay sorusu göster
    if (!confirm('⚠️ TÜM KİŞİLER SİLİNECEK!\n\nBu işlem geri alınamaz. Devam etmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      const response = await fetch('/api/contacts/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        this.contacts = [];
        this.selectedContacts.clear();
        this.renderContacts();
        this.updateStats(); // İstatistikleri güncelle
        this.showToast('Tüm kişiler başarıyla silindi!', 'success');
      } else {
        throw new Error('Temizleme hatası');
      }
    } catch (error) {
      this.showToast('Temizleme sırasında hata oluştu!', 'error');
    }
  }

  // WhatsApp kişilerini import et
  async importWhatsAppContacts() {
    try {
      this.showToast('WhatsApp kişileri çekiliyor...', 'info');

      const response = await fetch('/api/import-whatsapp-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();

      if (response.ok && result.success) {
        this.showToast(`${result.imported} yeni WhatsApp kişisi eklendi!`);
        // Kişileri yeniden yükle
        await this.loadContacts();
        this.renderContacts();
        this.updateStats();
      } else {
        throw new Error(result.error || 'WhatsApp kişileri çekilemedi');
      }
    } catch (error) {
      console.error('WhatsApp import hatası:', error);
      this.showToast('WhatsApp kişileri çekilemedi: ' + error.message, 'error');
    }
  }

  // Kişileri filtrele
  filterContacts(searchTerm) {
    // Radio button filtresini al
    const selectedFilter = document.querySelector('input[name="contactFilter"]:checked')?.value || 'all';
    
    const filtered = searchTerm.toLowerCase();
    const isEmpty = filtered.trim() === '';
    
    document.querySelectorAll('.country-section').forEach(section => {
      let hasVisibleContacts = false;
      section.querySelectorAll('.contact-item').forEach(item => {
        const contactId = parseInt(item.dataset.id);
        const isSelected = this.selectedContacts.has(contactId);
        
        const name = item.querySelector('.contact-name').textContent.toLowerCase();
        const phone = item.querySelector('.contact-phone').textContent.toLowerCase();
        const country = section.querySelector('.country-name').textContent.toLowerCase();

        // Arama filtresi
        const searchFilter = isEmpty || name.includes(filtered) || phone.includes(filtered) || country.includes(filtered);
        
        // Radio button filtresi
        let radioFilter = true;
        if (selectedFilter === 'selected') {
          radioFilter = isSelected;
        } else if (selectedFilter === 'unselected') {
          radioFilter = !isSelected;
        }
        
        // Her iki filtre de geçerli olmalı
        const isVisible = searchFilter && radioFilter;
        item.style.display = isVisible ? 'flex' : 'none';
        if (isVisible) hasVisibleContacts = true;
      });
      
      // Section'ı göster/gizle
      section.style.display = hasVisibleContacts ? 'block' : 'none';
      
      // Eğer arama yapılıyorsa VE sonuç varsa → otomatik AÇ
      if (!isEmpty && hasVisibleContacts) {
        section.classList.add('expanded');
      }
      // Eğer arama temizlendiyse VE "Tümü" seçiliyse → KAPAT
      else if (isEmpty && selectedFilter === 'all') {
        section.classList.remove('expanded');
      }
      // Filtre aktifse section'ları açık tut
      else if (selectedFilter !== 'all' && hasVisibleContacts) {
        section.classList.add('expanded');
      }
    });
  }

  // Radio button filtreleme
  applyFilter(filterType) {
    // Mevcut arama terimini kullanarak filtrelemeyi yeniden uygula
    const searchTerm = document.getElementById('searchInput').value;
    this.filterContacts(searchTerm);
  }

  // Kişileri render et (Lazy Loading)
  // Kişileri render et (LAZY LOADING KALDIRILDI - TÜM KİŞİLER BİRDEN)
  renderContacts() {
    const contactsList = document.getElementById('contactsList');
    
    if (this.contacts.length === 0) {
      contactsList.innerHTML = `
        <div class="empty-state">
          <h3>📱 Henüz kişi eklenmemiş</h3>
          <p>Yeni kişi eklemek için yukarıdaki "Yeni Kişi" butonunu kullanın.</p>
        </div>
      `;
      return;
    }

    // Ülkelere göre grupla
    const groupedContacts = this.groupByCountry();
    
    // HTML'i oluştur
    let html = '';
    
    Object.entries(groupedContacts).forEach(([countryCode, contacts]) => {
      const country = this.countries[countryCode] || {
        name: countryCode === 'UNKNOWN' ? 'Bilinmeyen Ülke' : countryCode,
        flag: countryCode === 'UNKNOWN' ? '🌐' : '🌐',
        code: countryCode === 'UNKNOWN' ? '+?' : '+' + countryCode
      };
      
      const selectedInCountry = contacts.filter(c => this.selectedContacts.has(c.id)).length;
      
      // Country section (BAŞLANGIÇTA KAPALI - expanded class YOK)
      html += `
        <div class="country-section" data-country="${countryCode}">
          <div class="country-header">
            <div class="country-info">
              <input type="checkbox" class="country-checkbox"
                     onchange="contactManager.toggleCountry('${countryCode}')"
                     onclick="event.stopPropagation()">
              <span class="country-flag">${country.flag}</span>
              <span class="country-name">${country.name}</span>
              <span class="country-code">${country.code}</span>
            </div>
            <div class="country-stats" onclick="contactManager.toggleCountrySection('${countryCode}')">
              <span class="country-count">${selectedInCountry}/${contacts.length} seçili</span>
              <span class="toggle-arrow">▼</span>
            </div>
          </div>
          <div class="country-contacts-list">
      `;
      
      // Contact'ları ekle
      contacts.forEach(contact => {
        html += this.renderContact(contact);
      });
      
      html += `
          </div>
        </div>
      `;
    });
    
    contactsList.innerHTML = html;
  }

  // Tek kişi render et
  renderContact(contact) {
    const isSelected = this.selectedContacts.has(contact.id);
    const initials = contact.name.split(' ').map(n => n[0]).join('').toUpperCase();

    return `<div class="contact-item ${isSelected ? 'selected' : ''}" data-id="${contact.id}">
    <input type="checkbox" class="contact-checkbox" ${isSelected ? 'checked' : ''}
           onchange="contactManager.toggleContact(${contact.id})">
    <div class="contact-avatar">${initials}</div>
    <div class="contact-info">
        <div class="contact-name">${contact.name}</div>
        <div class="contact-phone">${contact.phone}</div>
    </div>
    <div class="contact-language language-${contact.language}">${contact.language.toUpperCase()}</div>
</div>`;
  }

  // Kişileri ülkeye göre grupla
  groupByCountry() {
    return this.contacts.reduce((groups, contact) => {
      if (!groups[contact.country]) {
        groups[contact.country] = [];
      }
      groups[contact.country].push(contact);
      return groups;
    }, {});
  }

  // Kişi seçimini değiştir
  toggleContact(contactId) {
    // Seçimi değiştir
    if (this.selectedContacts.has(contactId)) {
      this.selectedContacts.delete(contactId);
    } else {
      this.selectedContacts.add(contactId);
    }

    // Sadece istatistikleri güncelle, render etme!
    this.updateStats();

    // Sadece bu kişinin checkbox ve CSS class'ını güncelle
    const contactItem = document.querySelector(`.contact-item[data-id="${contactId}"]`);
    if (contactItem) {
      const checkbox = contactItem.querySelector('.contact-checkbox');
      const isSelected = this.selectedContacts.has(contactId);

      if (checkbox) checkbox.checked = isSelected;
      if (isSelected) {
        contactItem.classList.add('selected');
      } else {
        contactItem.classList.remove('selected');
      }
    }

    // Ülke checkbox durumunu güncelle (bu kişinin ülkesi için)
    const contact = this.contacts.find(c => c.id === contactId);
    if (contact) {
      this.updateCountryCheckbox(contact.country);
    }

    // Eğer filtre aktifse, filtrelemeyi yeniden uygula
    const selectedFilter = document.querySelector('input[name="contactFilter"]:checked')?.value;
    if (selectedFilter && selectedFilter !== 'all') {
      const searchTerm = document.getElementById('searchInput').value;
      this.filterContacts(searchTerm);
    }
  }

  // Ülke checkbox durumunu güncelle
  updateCountryCheckbox(countryCode) {
    const groupedContacts = this.groupByCountry();
    const countryContacts = groupedContacts[countryCode] || [];
    const selectedInCountry = countryContacts.filter(c => this.selectedContacts.has(c.id)).length;
    const allSelected = selectedInCountry === countryContacts.length;
    const someSelected = selectedInCountry > 0 && selectedInCountry < countryContacts.length;

    const countrySection = document.querySelector(`[data-country="${countryCode}"]`);
    if (countrySection) {
      const checkbox = countrySection.querySelector('.country-checkbox');
      if (checkbox) {
        checkbox.checked = allSelected;
        checkbox.indeterminate = someSelected;
      }

      // Stats'ı güncelle
      const statsSpan = countrySection.querySelector('.country-stats span');
      if (statsSpan) {
        statsSpan.textContent = `${selectedInCountry}/${countryContacts.length} seçili`;
      }
    }
  }

  // Ülke seçimini değiştir (tüm kişileri seç/seçimi kaldır)
  toggleCountry(countryCode) {
    const groupedContacts = this.groupByCountry();
    const countryContacts = groupedContacts[countryCode] || [];

    const selectedInCountry = countryContacts.filter(c => this.selectedContacts.has(c.id)).length;
    const allSelected = selectedInCountry === countryContacts.length;

    if (allSelected) {
      // Tüm kişilerin seçimini kaldır
      countryContacts.forEach(contact => {
        this.selectedContacts.delete(contact.id);
        // DOM'da da güncelle
        const contactItem = document.querySelector(`.contact-item[data-id="${contact.id}"]`);
        if (contactItem) {
          const checkbox = contactItem.querySelector('.contact-checkbox');
          if (checkbox) checkbox.checked = false;
          contactItem.classList.remove('selected');
        }
      });
    } else {
      // Tüm kişileri seç
      countryContacts.forEach(contact => {
        this.selectedContacts.add(contact.id);
        // DOM'da da güncelle
        const contactItem = document.querySelector(`.contact-item[data-id="${contact.id}"]`);
        if (contactItem) {
          const checkbox = contactItem.querySelector('.contact-checkbox');
          if (checkbox) checkbox.checked = true;
          contactItem.classList.add('selected');
        }
      });
    }

    // İstatistikleri ve ülke checkbox'ını güncelle
    this.updateStats();
    this.updateCountryCheckbox(countryCode);
  }

  // Ülke bölümünü aç/kapat
  toggleCountrySection(countryCode) {
    const section = document.querySelector(`[data-country="${countryCode}"]`);
    if (section) {
      section.classList.toggle('expanded');
    }
  }

  // İstatistikleri güncelle
  updateStats() {
    document.getElementById('totalCount').textContent = this.contacts.length;
    document.getElementById('selectedCount').textContent = this.selectedContacts.size;
  }

  // Video gönderim formunu aç/kapat
  toggleVideoForm(show = null) {
    const form = document.getElementById('sendVideoForm');
    if (show === null) {
      show = !form.classList.contains('show');
    }

    if (show) {
      if (this.selectedContacts.size === 0) {
        this.showToast('Önce video göndermek istediğiniz kişileri seçin!', 'error');
        return;
      }
      form.classList.add('show');
    } else {
      form.classList.remove('show');
      this.clearVideoForm();
    }
  }

  // Video upload sistemini başlat
  initVideoUpload() {
    const uploadZone = document.getElementById('uploadZone');
    const videoFiles = document.getElementById('videoFiles');
    const browseLink = uploadZone.querySelector('.browse-link');

    this.uploadedVideos = [];
    this.maxVideos = 5;
    this.maxTotalSize = 50 * 1024 * 1024; // 50MB

    // Dosya seçme eventleri
    browseLink.addEventListener('click', () => videoFiles.click());
    videoFiles.addEventListener('change', (e) => this.handleVideoFiles(e.target.files));

    // Drag & Drop eventleri
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      this.handleVideoFiles(e.dataTransfer.files);
    });
  }

  // Video dosyalarını işle
  handleVideoFiles(files) {
    console.log('[VIDEO UPLOAD] handleVideoFiles çağrıldı, dosya sayısı:', files.length);

    const videoFiles = Array.from(files).filter(file => file.type.startsWith('video/'));
    console.log('[VIDEO UPLOAD] Video dosyaları filtrelendi:', videoFiles.length);

    if (videoFiles.length === 0) {
      console.error('[VIDEO UPLOAD] Hiç video dosyası bulunamadı!');
      this.showToast('Lütfen video dosyası seçin!', 'error');
      return;
    }

    // YENİ: Eski videoları temizle ve blob URL'leri revoke et
    console.log('[VIDEO UPLOAD] Eski videolar temizleniyor...', this.uploadedVideos.length);
    this.uploadedVideos.forEach(video => {
      if (video.url && video.url.startsWith('blob:')) {
        URL.revokeObjectURL(video.url);
      }
    });
    this.uploadedVideos = []; // Diziyi sıfırla
    console.log('[VIDEO UPLOAD] Eski videolar temizlendi');

    for (const file of videoFiles) {
      console.log('[VIDEO UPLOAD] İşleniyor:', file.name, file.size, 'bytes');

      if (this.uploadedVideos.length >= this.maxVideos) {
        console.warn('[VIDEO UPLOAD] Maksimum video sayısına ulaşıldı');
        this.showToast(`En fazla ${this.maxVideos} video yükleyebilirsiniz!`, 'error');
        break;
      }

      const totalSize = this.uploadedVideos.reduce((sum, v) => sum + v.size, 0) + file.size;
      if (totalSize > this.maxTotalSize) {
        console.warn('[VIDEO UPLOAD] Maksimum boyut aşıldı');
        this.showToast('Toplam dosya boyutu 50MB\'ı geçemez!', 'error');
        break;
      }

      // Video nesnesini oluştur
      const videoObj = {
        id: Date.now() + Math.random(),
        file: file,
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
        caption: '' // Her video için ayrı caption
      };

      this.uploadedVideos.push(videoObj);
      console.log('[VIDEO UPLOAD] Video eklendi:', videoObj.name, 'Toplam video:', this.uploadedVideos.length);
    }

    this.renderVideoPreview();
    this.updateVideoStats();
  }

  // Video önizlemelerini göster
  renderVideoPreview() {
    const previewsContainer = document.getElementById('videoPreviews');
    const videoGrid = document.getElementById('videoGrid');

    if (this.uploadedVideos.length === 0) {
      previewsContainer.style.display = 'none';
      return;
    }

    previewsContainer.style.display = 'block';

    let html = '';
    this.uploadedVideos.forEach((video, index) => {
      const sizeText = this.formatFileSize(video.size);
      html += `
                <div class="video-preview-item" data-video-id="${video.id}">
                    <div class="video-thumbnail">
                        <video src="${video.url}" preload="metadata"></video>
                        <div class="video-overlay">
                            <div class="play-icon">▶️</div>
                        </div>
                    </div>
                    <div class="video-info">
                        <div class="video-name" title="${video.name}">${video.name}</div>
                        <div class="video-size">${sizeText}</div>
                        <div class="video-caption-input">
                            <label for="caption-${video.id}">Video ${index + 1} Açıklama:</label>
                            <textarea id="caption-${video.id}"
                                      class="form-control video-caption"
                                      rows="2"
                                      placeholder="Bu video için açıklama..."
                                      onchange="contactManager.updateVideoCaption('${video.id}', this.value)">${video.caption || ''}</textarea>
                        </div>
                    </div>
                    <button class="remove-video" onclick="contactManager.removeVideo('${video.id}')">❌</button>
                </div>
            `;
    });

    videoGrid.innerHTML = html;
  }

  // Video caption'ını güncelle
  updateVideoCaption(videoId, caption) {
    const video = this.uploadedVideos.find(v => v.id == videoId);
    if (video) {
      video.caption = caption;
    }
  }

  // Video kaldır
  removeVideo(videoId) {
    this.uploadedVideos = this.uploadedVideos.filter(video => {
      if (video.id == videoId) {
        URL.revokeObjectURL(video.url);
        return false;
      }
      return true;
    });

    this.renderVideoPreview();
    this.updateVideoStats();
  }

  // Video istatistiklerini güncelle
  updateVideoStats() {
    const videoCount = document.getElementById('videoCount');
    const totalSize = document.getElementById('totalSize');

    const currentSize = this.uploadedVideos.reduce((sum, v) => sum + v.size, 0);

    videoCount.textContent = `${this.uploadedVideos.length}/${this.maxVideos} video`;
    totalSize.textContent = `${this.formatFileSize(currentSize)}/50 MB`;
  }

  // Dosya boyutunu formatla
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Video formunu temizle
  clearVideoForm() {
    document.getElementById('videoCaption').value = '';
    document.getElementById('sendProgress').style.display = 'none';

    // Yüklenen videoları temizle
    if (this.uploadedVideos) {
      this.uploadedVideos.forEach(video => {
        URL.revokeObjectURL(video.url);
      });
      this.uploadedVideos = [];
    }

    // Video input'unu temizle
    const videoFiles = document.getElementById('videoFiles');
    if (videoFiles) videoFiles.value = '';

    this.renderVideoPreview();
    this.updateVideoStats();
  }

  // Seçili kişilere video gönder (AKILLI GRUPLAMA SİSTEMİ)
  async sendVideoToSelected() {
    console.log('[VIDEO SEND] sendVideoToSelected çağrıldı');
    console.log('[VIDEO SEND] Yüklü video sayısı:', this.uploadedVideos?.length || 0);
    console.log('[VIDEO SEND] Seçili kişi sayısı:', this.selectedContacts.size);

    // ESKI tek caption inputu artık kullanmıyoruz - her videonun kendi caption'ı var

    // Video kontrolü
    if (!this.uploadedVideos || this.uploadedVideos.length === 0) {
      console.error('[VIDEO SEND] Video yüklenmemiş!');
      this.showToast('Önce video yükleyin!', 'error');
      return;
    }

    const selectedContactsList = this.contacts.filter(c => this.selectedContacts.has(c.id));
    console.log('[VIDEO SEND] Seçili kişi listesi:', selectedContactsList.length);

    if (selectedContactsList.length === 0) {
      console.error('[VIDEO SEND] Kişi seçilmemiş!');
      this.showToast('Hiç kişi seçilmemiş!', 'error');
      return;
    }

    try {
      console.log('[VIDEO SEND] Gönderim başlıyor...');

      // Progress göster
      const progressDiv = document.getElementById('sendProgress');
      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');

      progressDiv.style.display = 'block';
      progressText.textContent = 'Videolar akıllı gruplama ile gönderiliyor...';
      progressFill.style.width = '0%';

      let queuedCount = 0;
      const totalVideos = this.uploadedVideos.length;
      const batchSize = totalVideos; // HER KİŞİYE TÜM VİDEOLAR
      const batchId = 'gallery_' + Date.now(); // Benzersiz batch ID

      console.log(`[GALLERY] ${totalVideos} video batch sistemi ile gönderilecek`);
      console.log(`[GALLERY] Batch ID: ${batchId}, Batch Size: ${batchSize}`);

      // TÜM VİDEOLARI SIRASI İLE GÖNDER (Server batch mantığı ile kişilere dağıtacak)
      for (let i = 0; i < totalVideos; i++) {
        const video = this.uploadedVideos[i];
        const isLastVideo = (i === totalVideos - 1);

        try {
          console.log(`[VIDEO ${i + 1}] Name: ${video.name}`);
          console.log(`[VIDEO ${i + 1}] Type: ${video.file.type}`);
          console.log(`[VIDEO ${i + 1}] Size: ${video.file.size} bytes`);
          console.log(`[VIDEO ${i + 1}] File object:`, video.file);
          console.log(`[VIDEO ${i + 1}] File instanceof File:`, video.file instanceof File);
          console.log(`[VIDEO ${i + 1}] File instanceof Blob:`, video.file instanceof Blob);

          // Her video kendi caption'ı ile gönderilir
          const formData = new FormData();
          formData.append('video', video.file);
          formData.append('caption', video.caption || ''); // HER VİDEO KENDİ CAPTION'INI KULLANIR
          formData.append('batchSize', batchSize);
          formData.append('batchId', batchId);
          formData.append('isLastVideoInBatch', isLastVideo);
          formData.append('autoFanout', 'true');

          console.log(`[VIDEO ${i + 1}] FormData hazırlandı, POST yapılıyor...`);
          console.log(`[VIDEO ${i + 1}] FormData entries:`, Array.from(formData.entries()).map(([k, v]) =>
            k === 'video' ? `${k}: [File ${v.name}, ${v.size} bytes]` : `${k}: ${v}`
          ));

          const response = await fetch('/api/send-video-file', {
            method: 'POST',
            body: formData
            // NOT: Content-Type header'ı eklemeyin! Browser otomatik ekler ve boundary'yi set eder
          });

          console.log(`[VIDEO ${i + 1}] Response status: ${response.status}`);

          const result = await response.json();
          console.log(`[VIDEO ${i + 1}] Response body:`, result);

          if (response.ok && result.queued) {
            queuedCount++;
            console.log(`[GALLERY] ${i + 1}/${totalVideos}: ${video.name} → ${result.targetContact.name}`);

            // Progress güncelle
            const progress = ((i + 1) / totalVideos) * 100;
            progressFill.style.width = progress + '%';
            progressText.textContent = `${i + 1}/${totalVideos} video kuyruğa eklendi`;
          } else {
            console.error(`[GALLERY] Video ${i + 1} kuyruk hatası:`, result.error || 'Bilinmeyen hata');
          }
        } catch (error) {
          console.error(`[GALLERY] Video ${i + 1} kuyruk hatası:`, error);
        }

        // Küçük bir bekleme (UI responsive olsun diye)
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Başarı mesajı
      if (queuedCount === totalVideos) {
        progressText.textContent = `✅ ${totalVideos} video tüm seçili kişilere gönderilecek!`;

        const message = `${totalVideos} video ${selectedContactsList.length} kişiye gönderilecek!`;
        this.showToast(message, 'success');

        // 4 saniye sonra formu kapat
        setTimeout(() => {
          this.toggleVideoForm(false);
        }, 4000);
      } else {
        progressText.textContent = `⚠️ ${queuedCount}/${totalVideos} gönderim kuyruğa eklendi`;
        this.showToast(`${queuedCount}/${totalVideos} gönderim kuyruğa eklendi`, 'info');
      }

    } catch (error) {
      console.error('Video kuyruk hatası:', error);
      this.showToast('Video kuyruğa eklenirken hata oluştu!', 'error');
    }
  }

  // Toast bildirimi göster
  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    toastMessage.textContent = message;

    if (type === 'error') {
      toast.style.background = '#dc3545';
    } else if (type === 'info') {
      toast.style.background = '#17a2b8';
    } else {
      toast.style.background = '#25D366';
    }

    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }
}

// Global değişken
let contactManager;

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', () => {
  contactManager = new ContactManager();
});
