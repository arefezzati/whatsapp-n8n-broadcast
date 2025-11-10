/**
 * WhatsApp Grup Yönetimi
 * Grupları yönet, WhatsApp'tan import et, aktif/pasif yap
 */

console.log('WhatsApp Grup Yönetimi başlatıldı');

class GroupManager {
    constructor() {
        this.groups = [];
        this.filteredGroups = [];
        this.init();
    }

    async init() {
        console.log('GroupManager başlatılıyor...');
        await this.loadGroups();
        this.setupEventListeners();
        this.renderGroupsTable();
        this.updateStats();
    }

    setupEventListeners() {
        // Import Groups butonu
        document.getElementById('importGroupsBtn').addEventListener('click', () => {
            this.importWhatsAppGroups();
        });

        // Save List butonu
        document.getElementById('saveListBtn').addEventListener('click', () => {
            this.saveGroups();
        });

        // Select All butonu
        document.getElementById('selectAllBtn').addEventListener('click', () => {
            this.selectAll();
        });

        // Deselect All butonu
        document.getElementById('deselectAllBtn').addEventListener('click', () => {
            this.deselectAll();
        });

        // Clear List butonu
        document.getElementById('clearListBtn').addEventListener('click', () => {
            this.clearGroups();
        });

        // Search input
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchGroups(e.target.value);
        });
    }

    async loadGroups() {
        try {
            const response = await fetch('/api/groups');
            const data = await response.json();

            this.groups = data.groups || [];
            this.filteredGroups = [...this.groups];

            console.log(`${this.groups.length} grup yüklendi`);
            this.updateStats();
        } catch (error) {
            console.error('Gruplar yüklenemedi:', error);
            this.showToast('❌ Gruplar yüklenemedi!', 'error');
        }
    }

    async importWhatsAppGroups() {
        const loadingSpinner = document.getElementById('loadingSpinner');
        loadingSpinner.style.display = 'flex';

        try {
            console.log('[IMPORT-GROUPS] WhatsApp grupları import ediliyor...');

            const response = await fetch('/api/import-whatsapp-groups', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                console.log(`[IMPORT-GROUPS] ${data.imported} yeni grup eklendi`);
                this.showToast(`✅ ${data.imported} yeni grup eklendi! Toplam: ${data.total}`, 'success');
                await this.loadGroups();
                this.renderGroupsTable();
            } else {
                throw new Error(data.error || 'Import başarısız');
            }

        } catch (error) {
            console.error('[IMPORT-GROUPS] Hata:', error);
            this.showToast(`❌ Gruplar import edilemedi: ${error.message}`, 'error');
        } finally {
            loadingSpinner.style.display = 'none';
        }
    }

    async saveGroups() {
        try {
            console.log(`[SAVE-GROUPS] ${this.groups.length} grup kaydediliyor...`);

            const response = await fetch('/api/groups/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    groups: this.groups
                })
            });

            const data = await response.json();

            if (data.success) {
                console.log(`[SAVE-GROUPS] ${data.count} grup başarıyla kaydedildi`);
                this.showToast(`✅ ${data.count} grup başarıyla kaydedildi!`, 'success');
            } else {
                throw new Error(data.error || 'Kaydetme başarısız');
            }

        } catch (error) {
            console.error('[SAVE-GROUPS] Hata:', error);
            this.showToast(`❌ Gruplar kaydedilemedi: ${error.message}`, 'error');
        }
    }

    async clearGroups() {
        if (!confirm('⚠️ Tüm grupları silmek istediğinize emin misiniz?')) {
            return;
        }

        try {
            const response = await fetch('/api/groups/clear', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                console.log(`[CLEAR-GROUPS] ${data.previousCount} grup temizlendi`);
                this.groups = [];
                this.filteredGroups = [];
                this.renderGroupsTable();
                this.updateStats();
                this.showToast('✅ Tüm gruplar başarıyla silindi!', 'success');
            } else {
                throw new Error(data.error || 'Temizleme başarısız');
            }

        } catch (error) {
            console.error('[CLEAR-GROUPS] Hata:', error);
            this.showToast(`❌ Gruplar temizlenemedi: ${error.message}`, 'error');
        }
    }

    toggleGroupActive(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (group) {
            group.isActive = !group.isActive;
            console.log(`[TOGGLE] ${group.name}: ${group.isActive ? 'Aktif' : 'Pasif'}`);
            this.updateStats();
        }
    }

    selectAll() {
        this.filteredGroups.forEach(group => {
            group.isActive = true;
        });
        this.renderGroupsTable();
        this.updateStats();
        this.showToast('✅ Tüm gruplar seçildi', 'success');
    }

    deselectAll() {
        this.filteredGroups.forEach(group => {
            group.isActive = false;
        });
        this.renderGroupsTable();
        this.updateStats();
        this.showToast('❌ Tüm seçimler kaldırıldı', 'info');
    }

    searchGroups(query) {
        const lowerQuery = query.toLowerCase().trim();

        if (!lowerQuery) {
            this.filteredGroups = [...this.groups];
        } else {
            this.filteredGroups = this.groups.filter(group => {
                return group.name.toLowerCase().includes(lowerQuery);
            });
        }

        console.log(`Arama: "${query}" - ${this.filteredGroups.length} sonuç`);
        this.renderGroupsTable();
    }

    renderGroupsTable() {
        const tbody = document.getElementById('groupsTableBody');
        tbody.innerHTML = '';

        if (this.filteredGroups.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 40px;">
                        <p style="font-size: 18px; color: #666;">
                            📭 Henüz grup bulunmuyor
                        </p>
                        <p style="color: #999; margin-top: 10px;">
                            "WhatsApp Gruplarını İçe Aktar" butonunu kullanarak gruplarınızı ekleyin
                        </p>
                    </td>
                </tr>
            `;
            return;
        }

        this.filteredGroups.forEach(group => {
            const row = document.createElement('tr');
            row.className = group.isActive ? 'group-row active' : 'group-row';

            const addedDate = group.addedDate ? new Date(group.addedDate).toLocaleDateString('tr-TR') : '-';

            row.innerHTML = `
                <td>
                    <input type="checkbox"
                           class="group-checkbox"
                           ${group.isActive ? 'checked' : ''}
                           data-group-id="${group.id}">
                </td>
                <td class="group-name">
                    <strong>${group.name}</strong>
                </td>
                <td>
                    <span class="badge badge-primary">${group.participantCount || 0} üye</span>
                </td>
                <td>${addedDate}</td>
                <td>
                    <button class="btn btn-sm btn-danger delete-group-btn" data-group-id="${group.id}">
                        🗑️ Sil
                    </button>
                </td>
            `;

            tbody.appendChild(row);
        });

        // Checkbox event listeners
        document.querySelectorAll('.group-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const groupId = e.target.getAttribute('data-group-id');
                this.toggleGroupActive(groupId);
            });
        });

        // Delete button event listeners
        document.querySelectorAll('.delete-group-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = e.target.getAttribute('data-group-id');
                this.deleteGroup(groupId);
            });
        });
    }

    deleteGroup(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (!group) return;

        if (!confirm(`"${group.name}" grubunu silmek istediğinize emin misiniz?`)) {
            return;
        }

        this.groups = this.groups.filter(g => g.id !== groupId);
        this.filteredGroups = this.filteredGroups.filter(g => g.id !== groupId);

        this.renderGroupsTable();
        this.updateStats();
        this.showToast(`✅ "${group.name}" grubu silindi`, 'success');
    }

    updateStats() {
        const totalGroups = this.groups.length;
        const activeGroups = this.groups.filter(g => g.isActive).length;
        const totalParticipants = this.groups.reduce((sum, g) => sum + (g.participantCount || 0), 0);

        document.getElementById('totalGroups').textContent = totalGroups;
        document.getElementById('activeGroups').textContent = activeGroups;
        document.getElementById('totalParticipants').textContent = totalParticipants;
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        toastContainer.appendChild(toast);

        // Otomatik kaldır
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
}

// Sayfa yüklendiğinde GroupManager'ı başlat
document.addEventListener('DOMContentLoaded', () => {
    window.groupManager = new GroupManager();
});
