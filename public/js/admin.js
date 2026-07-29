class AdminDashboard {
  constructor() {
    this.stats = null;
    this.sponsors = [];
    this.broadcasts = [];
  }

  async loadAll() {
    await Promise.all([
      this.fetchStats(),
      this.fetchSponsors(),
      this.fetchBroadcasts()
    ]);
  }

  async fetchStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success) {
        this.stats = data.stats;
        this.renderStats();
      }
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    }
  }

  async fetchSponsors() {
    try {
      const res = await fetch('/api/admin/sponsors');
      const data = await res.json();
      if (data.success) {
        this.sponsors = data.sponsors;
        this.renderSponsors();
      }
    } catch (err) {
      console.error('Error fetching sponsors:', err);
    }
  }

  async fetchBroadcasts() {
    try {
      const res = await fetch('/api/admin/broadcasts');
      const data = await res.json();
      if (data.success) {
        this.broadcasts = data.broadcasts;
        this.renderBroadcasts();
      }
    } catch (err) {
      console.error('Error fetching broadcasts:', err);
    }
  }

  renderStats() {
    if (!this.stats) return;
    const { totalUsers, dau, mau, genderRatio, langRatio, totalCalls, totalDurationSeconds } = this.stats;

    document.getElementById('statTotalUsers').innerText = totalUsers || 0;
    document.getElementById('statDau').innerText = dau || 0;
    document.getElementById('statMau').innerText = mau || 0;
    document.getElementById('statTotalCalls').innerText = totalCalls || 0;

    const minutes = Math.floor((totalDurationSeconds || 0) / 60);
    document.getElementById('statCallDuration').innerText = `${minutes} min`;

    // Gender ratio progress
    const totalG = (genderRatio.male || 0) + (genderRatio.female || 0);
    const malePct = totalG > 0 ? Math.round((genderRatio.male / totalG) * 100) : 50;
    const femalePct = totalG > 0 ? 100 - malePct : 50;
    
    document.getElementById('genderMalePct').innerText = `${malePct}% Male`;
    document.getElementById('genderFemalePct').innerText = `${femalePct}% Female`;
    document.getElementById('genderBarMale').style.width = `${malePct}%`;

    // Lang ratio progress
    const totalL = (langRatio.uz || 0) + (langRatio.ru || 0);
    const uzPct = totalL > 0 ? Math.round((langRatio.uz / totalL) * 100) : 50;
    const ruPct = totalL > 0 ? 100 - uzPct : 50;

    document.getElementById('langUzPct').innerText = `🇺🇿 ${uzPct}% UZ`;
    document.getElementById('langRuPct').innerText = `🇷🇺 ${ruPct}% RU`;
    document.getElementById('langBarUz').style.width = `${uzPct}%`;
  }

  renderSponsors() {
    const container = document.getElementById('sponsorListContainer');
    if (!container) return;

    if (this.sponsors.length === 0) {
      container.innerHTML = `<div class="text-sm text-gray-400 italic" data-i18n="no_sponsors">${getAppText('no_sponsors')}</div>`;
      return;
    }

    container.innerHTML = this.sponsors.map(sp => `
      <div class="flex items-center justify-between p-3 rounded-xl glass-input mb-2">
        <div>
          <div class="font-bold text-sm text-cyan-400">${sp.title || sp.id}</div>
          <div class="text-xs text-gray-400">${sp.id} • <a href="${sp.link}" target="_blank" class="underline text-purple-400">${sp.link}</a></div>
        </div>
        <button onclick="adminDashboard.removeSponsor('${sp.id}')" class="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded-lg text-xs transition">
          <i class="fas fa-trash-alt"></i> ${getAppText('delete')}
        </button>
      </div>
    `).join('');
  }

  async addSponsor() {
    const channelId = document.getElementById('sponsorIdInput').value.trim();
    const title = document.getElementById('sponsorTitleInput').value.trim();
    const link = document.getElementById('sponsorLinkInput').value.trim();

    if (!channelId) return alert('Kanal ID yoki Usernameniyiring!');

    try {
      const res = await fetch('/api/admin/sponsors/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, title, link })
      });
      const data = await res.json();
      if (data.success) {
        this.sponsors = data.sponsors;
        this.renderSponsors();
        document.getElementById('sponsorIdInput').value = '';
        document.getElementById('sponsorTitleInput').value = '';
        document.getElementById('sponsorLinkInput').value = '';
      }
    } catch (err) {
      alert('Error adding sponsor channel');
    }
  }

  async removeSponsor(channelId) {
    if (!confirm(`Kanalni o'chirishni tasdiqlaysizmi: ${channelId}?`)) return;

    try {
      const res = await fetch('/api/admin/sponsors/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
      const data = await res.json();
      if (data.success) {
        this.sponsors = data.sponsors;
        this.renderSponsors();
      }
    } catch (err) {
      alert('Error removing sponsor channel');
    }
  }

  async sendBroadcast() {
    const text = document.getElementById('broadcastTextInput').value.trim();
    const photoUrl = document.getElementById('broadcastPhotoInput').value.trim();
    const voiceUrl = document.getElementById('broadcastVoiceInput').value.trim();

    if (!text && !photoUrl && !voiceUrl) {
      return alert('Kamida matn, rasm yoki audio kiritilishi shart!');
    }

    const btn = document.getElementById('sendBroadcastBtn');
    btn.disabled = true;
    btn.innerText = '⏳ Yuborilmoqda...';

    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, photoUrl, voiceUrl })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Broadcast yuborildi! Jami yetib borgan: ${data.result.successCount}`);
        document.getElementById('broadcastTextInput').value = '';
        document.getElementById('broadcastPhotoInput').value = '';
        document.getElementById('broadcastVoiceInput').value = '';
        await this.fetchBroadcasts();
      } else {
        alert(`❌ Xatolik: ${data.message}`);
      }
    } catch (err) {
      alert('Broadcast delivery failed');
    } finally {
      btn.disabled = false;
      btn.innerText = getAppText('send_broadcast');
    }
  }

  renderBroadcasts() {
    const container = document.getElementById('broadcastHistoryContainer');
    if (!container) return;

    if (this.broadcasts.length === 0) {
      container.innerHTML = `<div class="text-sm text-gray-400 italic">Hali yuborilgan xabarlar yo'q.</div>`;
      return;
    }

    container.innerHTML = this.broadcasts.map(b => `
      <div class="p-3 rounded-xl glass-input mb-3 text-xs">
        <div class="flex justify-between items-center mb-1">
          <span class="text-purple-400 font-bold">📅 ${new Date(b.sentAt).toLocaleString()}</span>
          <span class="bg-green-500/20 text-green-400 px-2 py-0.5 rounded">Muvaffaqiyatli: ${b.successCount}/${b.totalRecipients}</span>
        </div>
        <div class="text-gray-200 mb-2 font-medium">${b.text || '(Faqat media)'}</div>
        <div class="flex gap-2 justify-end">
          <button onclick="adminDashboard.editBroadcast('${b.id}')" class="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/40">
            <i class="fas fa-edit"></i> ${getAppText('edit')}
          </button>
          <button onclick="adminDashboard.deleteBroadcast('${b.id}')" class="px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/40">
            <i class="fas fa-trash"></i> ${getAppText('delete')}
          </button>
        </div>
      </div>
    `).join('');
  }

  async editBroadcast(id) {
    const b = this.broadcasts.find(item => item.id === id);
    if (!b) return;
    const newText = prompt('Xabar matnini tahrirlang:', b.text);
    if (newText !== null) {
      try {
        const res = await fetch('/api/admin/broadcasts/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, text: newText })
        });
        const data = await res.json();
        if (data.success) {
          this.broadcasts = data.broadcasts;
          this.renderBroadcasts();
        }
      } catch (err) {
        alert('Edit broadcast failed');
      }
    }
  }

  async deleteBroadcast(id) {
    if (!confirm('Ushbu broadcast logini o\'chirishni tasdiqlaysizmi?')) return;
    try {
      const res = await fetch('/api/admin/broadcasts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        this.broadcasts = data.broadcasts;
        this.renderBroadcasts();
      }
    } catch (err) {
      alert('Delete broadcast failed');
    }
  }
}

const adminDashboard = new AdminDashboard();
