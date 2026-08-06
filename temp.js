
  const API = 'https://web-production-65a7f.up.railway.app';
  let adminToken = '';
  let allUsers = [];

  // Auto-login from URL param ?token=XXXX
  async function init() {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      try {
        const res = await fetch(`${API}/api/admin/stats?adminToken=${urlToken}`);
        if (res.ok) {
          adminToken = urlToken;
          document.getElementById('loginScreen').style.display = 'none';
          document.getElementById('adminApp').classList.remove('hidden');
          document.getElementById('sidebarAdminId').textContent = `ID: ${urlToken}`;
          loadDashboard();
          return;
        }
      } catch(e) {}
    }
    // Show login screen if no valid token in URL
    document.getElementById('loginScreen').style.display = 'flex';
  }

  window.addEventListener('DOMContentLoaded', init);

  async function doLogin() {
    const val = document.getElementById('adminTokenInput').value.trim();
    if (!val) return;
    
    const btn = event.target;
    btn.textContent = '⏳ Tekshirilmoqda...';
    btn.disabled = true;

    try {
      const res = await fetch(`${API}/api/admin/stats?adminToken=${val}`);
      if (res.status === 403) {
        document.getElementById('loginError').classList.remove('hidden');
        btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Kirish';
        btn.disabled = false;
        return;
      }
      adminToken = val;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('adminApp').classList.remove('hidden');
      document.getElementById('sidebarAdminId').textContent = `ID: ${val}`;
      loadDashboard();
    } catch(e) {
      document.getElementById('loginError').classList.remove('hidden');
      document.getElementById('loginError').textContent = '❌ Server bilan bog\'lanishda xato!';
      btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Kirish';
      btn.disabled = false;
    }
  }

  document.addEventListener('keypress', e => {
    if (e.key === 'Enter' && !adminToken) doLogin();
  });

  function showTab(tab) {
    ['dashboard','users','banned','broadcast','gifts','sponsors'].forEach(t => {
      document.getElementById(`tab-${t}`)?.classList.add('hidden');
      document.getElementById(`nav-${t}`)?.classList.remove('active');
      document.getElementById(`mnav-${t}`)?.classList.remove('bg-purple-600', 'text-white');
      document.getElementById(`mnav-${t}`)?.classList.add('bg-white/5');
    });
    document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
    document.getElementById(`nav-${tab}`)?.classList.add('active');
    document.getElementById(`mnav-${tab}`)?.classList.remove('bg-white/5');
    document.getElementById(`mnav-${tab}`)?.classList.add('bg-purple-600', 'text-white');

    const titles = {
      dashboard: ['Dashboard', 'Platforma statistikasi va boshqaruv'],
      users: ['Foydalanuvchilar', 'Barcha ro\'yxatdan o\'tgan foydalanuvchilar'],
      banned: ['Bloklangan', 'Platformadan ban qilingan foydalanuvchilar'],
      broadcast: ['Xabar Tarqatish', 'Barcha foydalanuvchilarga xabar yuborish'],
      gifts: ['Sovg\'alar Tarixi', 'Kim kimga qanday sovg\'a yuborgani logi'],
      sponsors: ['Majburiy Obunalar', 'Foydalanuvchilar a\'zo bo\'lishi shart bo\'lgan kanallar']
    };
    document.getElementById('pageTitle').textContent = titles[tab][0];
    document.getElementById('pageSubtitle').textContent = titles[tab][1];
    if (tab === 'users') loadUsers();
    if (tab === 'banned') loadBanned();
    if (tab === 'gifts') loadGifts();
    if (tab === 'sponsors') loadSponsors();
  }

  async function api(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      ...opts
    });
    return res.json();
  }

  async function loadDashboard() {
    const [statsRes, usersRes] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/users')
    ]);
    if (statsRes.success) {
      const s = statsRes.stats;
      document.getElementById('s-total').textContent = s.totalUsers;
      document.getElementById('s-online').textContent = s.onlineUsers;
      document.getElementById('s-calls').textContent = s.totalCalls;
      document.getElementById('s-banned').textContent = s.bannedCount;
      document.getElementById('s-dau').textContent = s.dau;
      document.getElementById('s-mau').textContent = s.mau;
      document.getElementById('s-dur').textContent = s.totalDurationMin + ' daq';
      document.getElementById('s-gender').textContent = `${s.males} / ${s.females}`;
      document.getElementById('onlineCountBadge').textContent = s.onlineUsers;
      const mobBadge = document.getElementById('mobileOnlineCount');
      if (mobBadge) mobBadge.textContent = `${s.onlineUsers} Online`;
    }
    if (usersRes.success) {
      allUsers = usersRes.users;
      const recent = [...usersRes.users].reverse().slice(0, 6);
      document.getElementById('recentUsersList').innerHTML = recent.map(u => userRow(u, true)).join('');
    }
  }

  async function loadUsers() {
    const res = await api('/api/admin/users');
    if (res.success) {
      allUsers = res.users;
      renderUsers(allUsers);
    }
  }

  async function loadBanned() {
    const res = await api('/api/admin/users');
    if (res.success) {
      const banned = res.users.filter(u => u.isBanned);
      document.getElementById('bannedTableBody').innerHTML = banned.length 
        ? banned.map(u => `
            <tr class="table-row border-b border-white/5">
              <td class="py-3 px-4">
                <div class="font-semibold text-white">${u.firstName || 'Noma\'lum'}</div>
                <div class="text-xs text-slate-500">@${u.username || '—'}</div>
              </td>
              <td class="py-3 px-4 font-mono text-slate-400">${u.tgId}</td>
              <td class="py-3 px-4">
                <button onclick="unbanUser('${u.tgId}')" class="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/40 transition">
                  <i class="fas fa-unlock mr-1"></i>Blokdan chiqarish
                </button>
              </td>
            </tr>`).join('')
        : '<tr><td colspan="3" class="py-8 text-center text-slate-500">Bloklangan foydalanuvchi yo\'q</td></tr>';
    }
  }

  function userRow(u, compact = false) {
    const statusBadge = u.isBanned 
      ? `<span class="badge-banned text-[10px] font-bold px-2 py-0.5 rounded-full">BAN</span>`
      : u.isOnline 
        ? `<span class="badge-online text-[10px] font-bold px-2 py-0.5 rounded-full">● Online</span>`
        : `<span class="badge-offline text-[10px] font-bold px-2 py-0.5 rounded-full">Offline</span>`;

    if (compact) return `
      <div class="flex items-center justify-between py-2 px-2 rounded-xl hover:bg-white/5 transition">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center font-bold text-xs">${(u.firstName || '?')[0]}</div>
          <div>
            <div class="font-semibold text-sm text-white">${u.firstName || 'Noma\'lum'} <span class="text-slate-500">@${u.username || '—'}</span></div>
            <div class="text-xs text-slate-500 font-mono">ID: ${u.tgId}</div>
          </div>
        </div>
        ${statusBadge}
      </div>`;

    return `
      <tr class="table-row border-b border-white/5">
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center font-bold text-xs flex-shrink-0">${(u.firstName || '?')[0]}</div>
            <div>
              <div class="font-semibold text-white">${u.firstName || 'Noma\'lum'}</div>
              <div class="text-xs text-slate-500">@${u.username || '—'}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4 font-mono text-slate-400 text-xs">${u.tgId}</td>
        <td class="py-3 px-4">${statusBadge}</td>
        <td class="py-3 px-4 text-slate-300">${u.gender === 'female' ? '👩 Ayol' : '👨 Erkak'}</td>
        <td class="py-3 px-4 text-slate-300">${u.lang === 'ru' ? '🇷🇺 RU' : '🇺🇿 UZ'}</td>
        <td class="py-3 px-4">
          ${u.isBanned 
            ? `<button onclick="unbanUser('${u.tgId}')" class="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/40 transition">Unban</button>`
            : `<button onclick="banUser('${u.tgId}')" class="px-3 py-1 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold hover:bg-red-500/40 transition"><i class="fas fa-ban mr-1"></i>Ban</button>`
          }
        </td>
      </tr>`;
  }

  function renderUsers(users) {
    document.getElementById('usersTableBody').innerHTML = users.length
      ? users.map(u => userRow(u)).join('')
      : '<tr><td colspan="6" class="py-8 text-center text-slate-500">Foydalanuvchilar topilmadi</td></tr>';
    document.getElementById('usersCount').textContent = `Jami: ${users.length} ta foydalanuvchi`;
  }

  function filterUsers() {
    const search = document.getElementById('userSearch').value.toLowerCase();
    const filter = document.getElementById('userFilter').value;
    let filtered = allUsers.filter(u => {
      const matchSearch = !search 
        || (u.firstName || '').toLowerCase().includes(search)
        || (u.username || '').toLowerCase().includes(search)
        || String(u.tgId).includes(search);
      const matchFilter = filter === 'all' 
        || (filter === 'online' && u.isOnline)
        || (filter === 'banned' && u.isBanned)
        || (filter === 'male' && u.gender === 'male')
        || (filter === 'female' && u.gender === 'female');
      return matchSearch && matchFilter;
    });
    renderUsers(filtered);
  }

  async function banUser(tgId) {
    if (!confirm(`${tgId} ni bloklaysizmi?`)) return;
    const res = await api('/api/admin/ban', { method: 'POST', body: JSON.stringify({ tgId }) });
    if (res.success) {
      showNotif(`✅ ${tgId} bloklandi!`, 'green');
      loadUsers();
    }
  }

  async function unbanUser(tgId) {
    if (!confirm(`${tgId} ni blokdan chiqarasizmi?`)) return;
    const res = await api('/api/admin/unban', { method: 'POST', body: JSON.stringify({ tgId }) });
    if (res.success) {
      showNotif(`✅ ${tgId} blokdan chiqarildi!`, 'green');
      loadUsers();
      loadBanned();
    }
  }

  async function sendBroadcast() {
    const text = document.getElementById('broadcastText').value.trim();
    if (!text) return;
    const statusEl = document.getElementById('broadcastStatus');
    statusEl.textContent = '⏳ Yuborilmoqda...';
    const res = await api('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ text }) });
    if (res.success) {
      statusEl.textContent = `✅ ${res.sent} ta foydalanuvchiga yuborildi!`;
      statusEl.className = 'text-sm text-emerald-400';
      document.getElementById('broadcastText').value = '';
    } else {
      statusEl.textContent = '❌ Xatolik yuz berdi!';
      statusEl.className = 'text-sm text-red-400';
    }
  }

  async function loadGifts() {
    const res = await api('/api/admin/gifts');
    if (res.success) {
      const giftMap = {
        rose: '🌹 Atirgul', heart: '💖 Yurak', car: '🏎️ Mashina', crown: '👑 Toj',
        diamond: '💎 Olmos', cake: '🎂 Tort', firework: '🎆 Salut', ring: '💍 Uzuk'
      };
      const tbody = document.getElementById('giftsTableBody');
      if (!tbody) return;
      tbody.innerHTML = res.gifts.length
        ? res.gifts.map(g => `
            <tr class="table-row border-b border-white/5">
              <td class="py-3 px-4 font-bold text-pink-300 text-base">${giftMap[g.giftType] || g.giftType}</td>
              <td class="py-3 px-4 font-medium text-white">${g.fromName || "Noma'lum"}</td>
              <td class="py-3 px-4 font-medium text-white">${g.toName || "Noma'lum"}</td>
              <td class="py-3 px-4">
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${(g.mode || '').includes('group') ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'}">
                  ${g.mode === 'group-targeted' ? '👥 Guruh (Aniq a\'zoga)' : (g.mode === 'group' ? '👥 Guruh' : '👤 1-ga-1')}
                </span>
              </td>
              <td class="py-3 px-4 text-xs text-slate-400 font-mono">${new Date(g.timestamp).toLocaleString('uz-UZ')}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="5" class="py-8 text-center text-slate-500">Hali sovg\'a yuborilmadi</td></tr>';
    }
  }

  async function loadSponsors() {
    const res = await api('/api/admin/sponsors');
    if (res.success) {
      const container = document.getElementById('sponsorsListContainer');
      if (!container) return;
      container.innerHTML = res.sponsors.length
        ? res.sponsors.map(s => `
            <div class="flex items-center justify-between p-4 glass rounded-xl border border-white/5">
              <div>
                <div class="font-bold text-white text-base">${s.title || s.id}</div>
                <div class="text-xs text-slate-400 font-mono mt-0.5">${s.id} — <a href="${s.link}" target="_blank" class="text-cyan-400 underline">${s.link}</a></div>
              </div>
              <button onclick="deleteSponsor('${s.id}')" class="px-3 py-1.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold hover:bg-red-500/40 transition">
                <i class="fas fa-trash-alt mr-1"></i>O'chirish
              </button>
            </div>
          `).join('')
        : '<div class="py-8 text-center text-slate-500">Hali majburiy obuna kanali qo\'shilmagan</div>';
    }
  }

  async function addSponsor() {
    const channelId = document.getElementById('spId').value.trim();
    const title = document.getElementById('spTitle').value.trim();
    const link = document.getElementById('spLink').value.trim();

    if (!channelId) {
      alert('Kanal ID yoki Username ni kiriting!');
      return;
    }

    const res = await api('/api/admin/sponsors/add', {
      method: 'POST',
      body: JSON.stringify({ channelId, title, link })
    });

    if (res.success) {
      showNotif('✅ Kanal muvaffaqiyatli qo\'shildi!', 'green');
      document.getElementById('spId').value = '';
      document.getElementById('spTitle').value = '';
      document.getElementById('spLink').value = '';
      loadSponsors();
    }
  }

  async function deleteSponsor(channelId) {
    if (!confirm(`${channelId} kanalini o'chirasizmi?`)) return;
    const res = await api('/api/admin/sponsors/delete', {
      method: 'POST',
      body: JSON.stringify({ channelId })
    });
    if (res.success) {
      showNotif('✅ Kanal o\'chirildi!', 'green');
      loadSponsors();
    }
  }

  async function refreshData() {
    const icon = document.getElementById('refreshIcon');
    icon.className = 'fas fa-sync-alt fa-spin';
    await loadDashboard();
    setTimeout(() => icon.className = 'fas fa-sync-alt', 800);
  }

  function showNotif(msg, color = 'purple') {
    const colors = { green: 'bg-emerald-500', red: 'bg-red-500', purple: 'bg-purple-500' };
    const el = document.createElement('div');
    el.className = `fixed top-4 right-4 z-50 ${colors[color]} text-white px-4 py-3 rounded-xl font-semibold text-sm shadow-lg`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // Auto-refresh every 30s
  setInterval(() => { if (adminToken) loadDashboard(); }, 30000);
