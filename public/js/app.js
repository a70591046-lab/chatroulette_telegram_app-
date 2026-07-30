let tgUser = null;
let currentProfile = null;
let webrtc = null;
let activeChatMode = 'solo';
let socketReady = false;

// Railway backend API URL
const BACKEND_API_URL = 'https://web-production-65a7f.up.railway.app';

const ADMIN_TELEGRAM_IDS = ['7713174177', '123456789'];

document.addEventListener('DOMContentLoaded', async () => {
  // Telegram WebApp SDK
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      if (typeof window.Telegram.WebApp.requestFullscreen === 'function') {
        window.Telegram.WebApp.requestFullscreen();
      }
    } catch (e) {}
    const user = window.Telegram.WebApp.initDataUnsafe?.user;
    if (user) {
      tgUser = {
        tgId: String(user.id),
        firstName: user.first_name || 'Foydalanuvchi',
        username: user.username || ''
      };
    }
  }

  if (!tgUser) {
    const paramId = String(Math.floor(Math.random() * 9000000) + 1000000);
    tgUser = {
      tgId: paramId,
      firstName: 'Foydalanuvchi',
      username: 'test_user'
    };
  }

  const isAdmin = ADMIN_TELEGRAM_IDS.includes(String(tgUser.tgId));

  webrtc = new WebRTCManager({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  webrtc.onLocalStreamReady = (stream) => {
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
      localVideo.srcObject = stream;
      localVideo.muted = true;
      localVideo.play().catch(() => {});
    }
    document.getElementById('mediaPermissionOverlay')?.classList.add('hidden');
  };

  webrtc.onRemoteStreamReady = (stream) => {
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
      remoteVideo.srcObject = stream;
      remoteVideo.muted = false;
      remoteVideo.play().catch(() => {});
    }
  };

  await loadUserProfile();

  const sock = initSocketConnection(tgUser.tgId, webrtc);
  sock.on('connect', () => {
    socketReady = true;
    console.log('[App] Socket connected:', sock.id);
  });
  sock.on('disconnect', () => {
    socketReady = false;
  });

  setupEventListeners();
  switchTab('chat');

  // Pre-init camera/mic silently
  webrtc.initLocalStream().then((stream) => {
    if (stream) {
      document.getElementById('mediaPermissionOverlay')?.classList.add('hidden');
    }
  }).catch(() => {});
});

async function requestCameraMicPermission() {
  const stream = await webrtc.initLocalStream();
  if (stream) {
    document.getElementById('mediaPermissionOverlay')?.classList.add('hidden');
    showToast('✅ Kamera va mikrofonga ruxsat berildi!');
    return true;
  } else {
    document.getElementById('mediaPermissionOverlay')?.classList.remove('hidden');
    showToast('⚠️ Kamera va mikrofonga ruxsat bering');
    return false;
  }
}

function startMatchmakingSearch() {
  if (!socket || !socket.connected) {
    showToast('❌ Server bilan aloqa yo\'q, iltimos kuting...');
    return;
  }

  if (!currentProfile) {
    currentProfile = {
      tgId: tgUser.tgId,
      firstName: tgUser.firstName,
      gender: 'male',
      targetGender: 'any',
      age: 22
    };
  }

  const targetSelect = document.getElementById('matchTargetGenderSelect');
  if (targetSelect) {
    currentProfile.targetGender = targetSelect.value || 'any';
  }

  showSearchingState();

  webrtc.initLocalStream().then(stream => {
    if (stream) {
      document.getElementById('mediaPermissionOverlay')?.classList.add('hidden');
    }
  }).catch(() => {});

  console.log('[App] Emitting search with tgId:', tgUser.tgId, 'mode:', activeChatMode);

  if (activeChatMode === 'group') {
    socket.emit('start-group-search', { tgId: tgUser.tgId, profile: currentProfile });
  } else {
    socket.emit('start-search', { tgId: tgUser.tgId, profile: currentProfile });
  }
}

// ── Direct Calling Functions ──────────────────────
window.initiateDirectCall = function(targetTgId, targetName) {
  if (!socket || !socket.connected) {
    showToast('❌ Server bilan aloqa yo\'q');
    return;
  }
  showSearchingState();
  const searchStatus = document.getElementById('searchStatusText');
  if (searchStatus) searchStatus.innerText = `${targetName} chaqirilmoqda...`;
  
  webrtc.initLocalStream().then(stream => {
    if (stream) document.getElementById('mediaPermissionOverlay')?.classList.add('hidden');
  }).catch(() => {});

  socket.emit('direct-call-request', { 
    targetTgId: targetTgId,
    callerName: tgUser.firstName || 'Foydalanuvchi'
  });
};

window.acceptDirectCall = function() {
  document.getElementById('incomingCallModal').classList.add('hidden');
  if (window.currentDirectCaller && socket) {
    showSearchingState();
    const searchStatus = document.getElementById('searchStatusText');
    if (searchStatus) searchStatus.innerText = `Ulanmoqda...`;
    
    webrtc.initLocalStream().then(stream => {
      if (stream) document.getElementById('mediaPermissionOverlay')?.classList.add('hidden');
    }).catch(() => {});
    
    socket.emit('direct-call-accept', window.currentDirectCaller);
    window.currentDirectCaller = null;
  }
};

window.declineDirectCall = function() {
  document.getElementById('incomingCallModal').classList.add('hidden');
  if (window.currentDirectCaller && socket) {
    socket.emit('direct-call-decline', window.currentDirectCaller);
    window.currentDirectCaller = null;
  }
};

async function loadUserProfile() {
  try {
    const res = await fetch(`${BACKEND_API_URL}/api/user/${tgUser.tgId}`);
    const data = await res.json();
    if (data.success && data.user) {
      currentProfile = data.user;
    } else {
      currentProfile = {
        tgId: tgUser.tgId,
        firstName: tgUser.firstName,
        gender: 'male',
        targetGender: 'any',
        age: 22,
        bio: '',
        hobbies: ['IT', 'Music'],
        likes: 0,
        followers: 0,
        lang: 'uz'
      };
    }
    setAppLanguage(currentProfile.lang || 'uz');
    fillProfileForm();
  } catch (err) {
    currentProfile = {
      tgId: tgUser.tgId,
      firstName: tgUser.firstName,
      gender: 'male',
      targetGender: 'any',
      age: 22,
      bio: '',
      hobbies: [],
      likes: 0,
      followers: 0,
      lang: 'uz'
    };
    setAppLanguage('uz');
    fillProfileForm();
  }
  loadFriendsList();
}

async function loadFriendsList() {
  try {
    const res = await fetch(`${BACKEND_API_URL}/api/user/${tgUser.tgId}/friends`);
    const data = await res.json();
    if (data.success) {
      renderFriendsList(data.friends);
    }
  } catch (e) {
    console.error('Error loading friends', e);
  }
}

function renderFriendsList(friends) {
  const container = document.getElementById('friendsListContainer');
  if (!container) return;
  
  if (!friends || friends.length === 0) {
    container.innerHTML = `<div class="text-center text-slate-500 text-[10px] py-4">Sizda hali do'stlar yo'q.</div>`;
    return;
  }

  container.innerHTML = friends.map(f => `
    <div class="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
      <div class="flex items-center gap-3">
        <div class="relative">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white font-bold">
            ${f.firstName.charAt(0).toUpperCase()}
          </div>
          ${f.isOnline ? '<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full"></div>' : '<div class="absolute bottom-0 right-0 w-3 h-3 bg-gray-500 border-2 border-slate-900 rounded-full"></div>'}
        </div>
        <div>
          <div class="text-sm font-bold text-slate-200">${f.firstName} ${f.isOnline ? '<span class="text-[9px] text-green-400 ml-1">Online</span>' : '<span class="text-[9px] text-gray-500 ml-1">Offline</span>'}</div>
          <div class="text-[10px] text-slate-400">${f.username ? '@' + f.username : (f.gender === 'female' ? 'Ayol' : 'Erkak')}</div>
        </div>
      </div>
      <button onclick="initiateDirectCall('${f.tgId}', '${f.firstName}')" class="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/40 transition" title="Qo'ng'iroq qilish">
        <i class="fas fa-phone"></i>
      </button>
    </div>
  `).join('');
}

function setChatMode(mode) {
  activeChatMode = mode;
  const soloBtn = document.getElementById('modeSoloBtn');
  const groupBtn = document.getElementById('modeGroupBtn');
  const titleText = document.getElementById('matchTitleText');
  const descText = document.getElementById('matchDescText');

  if (mode === 'group') {
    soloBtn.className = 'px-3 py-1 rounded-lg font-bold text-xs text-slate-400 hover:text-white transition';
    groupBtn.className = 'px-3 py-1 rounded-lg font-bold text-xs bg-cyan-600 text-white transition';
    if (titleText) titleText.innerText = "Guruh Video Muloqot";
    if (descText) descText.innerText = "3-4 kishi bilan birgalikda jonli videoda muloqot qiling.";
  } else {
    soloBtn.className = 'px-3 py-1 rounded-lg font-bold text-xs bg-purple-600 text-white transition';
    groupBtn.className = 'px-3 py-1 rounded-lg font-bold text-xs text-slate-400 hover:text-white transition';
    if (titleText) titleText.innerText = "Tasodifiy Video Muloqot";
    if (descText) descText.innerText = "Yangi do'stlar topish va 1-ga-1 jonli videoni boshlash uchun tugmani bosing.";
  }
}

function toggleGroupMic() {
  const isOn = webrtc.toggleMic();
  const btn = document.getElementById('groupMicToggleBtn');
  if (btn) {
    btn.className = `ctrl-btn ${isOn ? 'btn-active-mic' : 'btn-disabled'}`;
    btn.innerHTML = isOn ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
  }
  if (socket) socket.emit('send-mic-toggle', { isMuted: !isOn });
  showToast(isOn ? '🎤 Mikrofon yoqildi' : '🔇 Mikrofon o\'chirildi');
}

function toggleGroupCam() {
  const isOn = webrtc.toggleCamera();
  const btn = document.getElementById('groupCamToggleBtn');
  if (btn) {
    btn.className = `ctrl-btn ${isOn ? '' : 'btn-disabled'}`;
    btn.innerHTML = isOn ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
  }
  if (socket) socket.emit('send-cam-toggle', { isOff: !isOn });
  showToast(isOn ? '🎥 Kamera yoqildi' : '🚫 Kamera o\'chirildi');
}

function fillProfileForm() {
  if (!currentProfile) return;
  const el = (id) => document.getElementById(id);
  if (el('profileNameInput')) el('profileNameInput').value = currentProfile.firstName || tgUser.firstName;
  if (el('profileAgeInput')) el('profileAgeInput').value = currentProfile.age || 20;
  if (el('profileBioInput')) el('profileBioInput').value = currentProfile.bio || '';
  if (el('profileGenderSelect')) el('profileGenderSelect').value = currentProfile.gender || 'male';
  if (el('profileTargetGenderSelect')) el('profileTargetGenderSelect').value = currentProfile.targetGender || 'any';
  if (el('matchTargetGenderSelect')) el('matchTargetGenderSelect').value = currentProfile.targetGender || 'any';
  if (el('likesCountBadge')) el('likesCountBadge').innerText = currentProfile.likes || 0;
  if (el('followersCountBadge')) el('followersCountBadge').innerText = currentProfile.followers || 0;
  renderHobbyChips(currentProfile.hobbies || []);
}

const ALL_HOBBIES = ['IT', 'Gaming', 'Music', 'Sports', 'Cinema', 'Books', 'Travel', 'Art'];

function renderHobbyChips(selectedHobbies) {
  const container = document.getElementById('hobbyChipsContainer');
  if (!container) return;
  container.innerHTML = ALL_HOBBIES.map(hobby => {
    const active = selectedHobbies.includes(hobby) ? 'active' : '';
    return `<div class="chip ${active}" onclick="toggleHobbyChip('${hobby}', this)">${hobby}</div>`;
  }).join('');
}

function toggleHobbyChip(hobby, element) {
  element.classList.toggle('active');
  if (!currentProfile.hobbies) currentProfile.hobbies = [];
  if (element.classList.contains('active')) {
    if (!currentProfile.hobbies.includes(hobby)) currentProfile.hobbies.push(hobby);
  } else {
    currentProfile.hobbies = currentProfile.hobbies.filter(h => h !== hobby);
  }
}

async function saveUserProfile() {
  currentProfile.firstName = document.getElementById('profileNameInput').value.trim();
  currentProfile.age = parseInt(document.getElementById('profileAgeInput').value) || 20;
  currentProfile.bio = document.getElementById('profileBioInput').value.trim();
  currentProfile.gender = document.getElementById('profileGenderSelect').value;
  currentProfile.targetGender = document.getElementById('profileTargetGenderSelect').value;

  try {
    const res = await fetch(`${BACKEND_API_URL}/api/user/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tgId: tgUser.tgId, profile: currentProfile })
    });
    const data = await res.json();
    if (data.success) showToast(getAppText('profile_saved'));
  } catch (err) {
    showToast('❌ Save error');
  }
}

function setupEventListeners() {
  document.getElementById('langToggleBtn')?.addEventListener('click', () => {
    const nextLang = currentLang === 'uz' ? 'ru' : 'uz';
    currentProfile.lang = nextLang;
    setAppLanguage(nextLang);
    saveUserProfile();
  });

  document.getElementById('startSearchBtn')?.addEventListener('click', () => {
    startMatchmakingSearch();
  });

  document.getElementById('cancelSearchBtn')?.addEventListener('click', () => {
    if (socket) socket.emit('cancel-search');
    resetVideoCallView();
  });

  document.getElementById('camToggleBtn')?.addEventListener('click', () => {
    const isOn = webrtc.toggleCamera();
    const btn = document.getElementById('camToggleBtn');
    if (btn) {
      btn.classList.toggle('btn-disabled', !isOn);
      btn.innerHTML = isOn ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    }
    if (socket) socket.emit('send-cam-toggle', { isOff: !isOn });
  });

  document.getElementById('flipCamBtn')?.addEventListener('click', async () => {
    const mode = await webrtc.flipCamera();
    showToast(`Kamera: ${mode === 'user' ? 'Oldi (Front)' : 'Orqa (Back)'}`);
  });

  document.getElementById('micToggleBtn')?.addEventListener('click', () => {
    const isOn = webrtc.toggleMic();
    const btn = document.getElementById('micToggleBtn');
    if (btn) {
      btn.classList.toggle('btn-disabled', !isOn);
      btn.classList.toggle('btn-active-mic', isOn);
      btn.innerHTML = isOn ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    }
    if (socket) socket.emit('send-mic-toggle', { isMuted: !isOn });
  });

  document.getElementById('likeBtn')?.addEventListener('click', () => {
    if (currentPeerTgId && socket) {
      socket.emit('send-like', { fromTgId: tgUser.tgId, toTgId: currentPeerTgId });
      triggerHeartAnimation();
    }
  });

  document.getElementById('followBtn')?.addEventListener('click', () => {
    if (currentPeerTgId && socket) {
      socket.emit('send-follow', { fromTgId: tgUser.tgId, toTgId: currentPeerTgId });
      showToast('⭐ Obuna bo\'lindi!');
    }
  });

  document.getElementById('friendReqBtn')?.addEventListener('click', () => {
    if (currentPeerTgId && socket) {
      socket.emit('send-friend-request', { fromTgId: tgUser.tgId, toTgId: currentPeerTgId });
      showToast('🤝 Do\'stlik taklifi yuborildi!');
    }
  });

  document.getElementById('reportBtn')?.addEventListener('click', () => {
    if (currentPeerTgId && socket) {
      if (confirm('Rostdan ham bu foydalanuvchi ustidan Adminga shikoyat qilmoqchimisiz?')) {
        socket.emit('report-user', { targetTgId: currentPeerTgId, fromName: tgUser.firstName });
        showToast('⚠️ Shikoyatingiz Adminga yuborildi. Rahmat!');
        startMatchmakingSearch(); // skip immediately
      }
    }
  });

  document.getElementById('skipPeerBtn')?.addEventListener('click', () => {
    startMatchmakingSearch();
  });

  document.getElementById('sendChatBtn')?.addEventListener('click', sendChatMessage);
  document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

function leaveChatRoom() {
  if (socket) socket.emit('leave-chat');
  webrtc.closePeerConnection();
  resetVideoCallView();
  showToast('🚪 Chat xonasini tark etdingiz');
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim();
  if (text && currentPeerSocketId && socket) {
    socket.emit('send-chat-message', { text });
    appendChatMessage(text, true);
    input.value = '';
  }
}

function appendChatMessage(text, isSelf) {
  const container = document.getElementById('chatOverlayContainer');
  if (!container) return;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isSelf ? 'text-cyan-300 font-semibold' : 'text-purple-300'}`;
  bubble.innerText = `${isSelf ? 'Siz' : 'Suhbatdosh'}: ${text}`;
  container.appendChild(bubble);
  if (container.children.length > 5) container.removeChild(container.firstChild);
}

function showSearchingState() {
  document.getElementById('initialMatchView')?.classList.add('hidden');
  document.getElementById('activeCallView')?.classList.add('hidden');
  document.getElementById('activeGroupView')?.classList.add('hidden');
  document.getElementById('searchingRadarView')?.classList.remove('hidden');
  document.getElementById('leaveChatTopBtn')?.classList.remove('hidden');
}

function hideSearchingState() {
  document.getElementById('searchingRadarView')?.classList.add('hidden');
}

function showVideoRoomState(peerProfile) {
  document.getElementById('initialMatchView')?.classList.add('hidden');
  document.getElementById('searchingRadarView')?.classList.add('hidden');
  document.getElementById('activeGroupView')?.classList.add('hidden');
  document.getElementById('activeCallView')?.classList.remove('hidden');
  document.getElementById('leaveChatTopBtn')?.classList.remove('hidden');

  if (peerProfile) {
    const nameEl = document.getElementById('peerNameTag');
    const hobbiesEl = document.getElementById('peerHobbiesTag');
    
    let nameHtml = `${peerProfile.firstName || 'Suhbatdosh'}, ${peerProfile.age || 20}`;
    const isPeerAdmin = ['6080277322', '2130761358'].includes(String(peerProfile.tgId));
    if (isPeerAdmin) {
      nameHtml += ` <span class="bg-amber-500 text-white text-[10px] font-bold px-1 rounded ml-1">👑 ADMIN</span>`;
    }
    
    if (nameEl) nameEl.innerHTML = nameHtml;
    if (hobbiesEl) hobbiesEl.innerText = (peerProfile.hobbies || []).join(', ') || 'Xobbilar ko\'rsatilmadi';
  }
}

function showGroupRoomState(data) {
  document.getElementById('initialMatchView')?.classList.add('hidden');
  document.getElementById('searchingRadarView')?.classList.add('hidden');
  document.getElementById('activeCallView')?.classList.add('hidden');
  document.getElementById('activeGroupView')?.classList.remove('hidden');
  document.getElementById('leaveChatTopBtn')?.classList.remove('hidden');

  const grid = document.getElementById('groupVideoGrid');
  if (grid) {
    grid.innerHTML = '';
    const myTile = document.createElement('div');
    myTile.className = 'group-video-item';
    const isAdmin = ['6080277322', '2130761358'].includes(String(tgUser?.tgId));
    const myBadge = isAdmin ? `<span class="bg-amber-500 text-white text-[9px] font-bold px-1 rounded ml-1">👑 ADMIN</span>` : '';

    myTile.innerHTML = `
      <video autoplay playsinline muted></video>
      <div class="group-tile-badge">
        <span class="text-xs font-bold text-purple-300">Siz ${myBadge}</span>
        <span id="mic_status_self" class="text-xs text-emerald-400"><i class="fas fa-microphone"></i></span>
      </div>
    `;
    const v = myTile.querySelector('video');
    if (webrtc.localStream) v.srcObject = webrtc.localStream;
    grid.appendChild(myTile);
    updateGroupMemberBadge();
  }
}

function addGroupVideoTile(socketId, profile) {
  const grid = document.getElementById('groupVideoGrid');
  if (!grid || document.getElementById(`group_tile_${socketId}`)) return;
  const tile = document.createElement('div');
  tile.id = `group_tile_${socketId}`;
  tile.className = 'group-video-item relative';
  
  const isAdmin = ['6080277322', '2130761358'].includes(String(tgUser?.tgId));
  const kickHtml = isAdmin ? `<button onclick="kickUserFromGroup('${socketId}')" class="absolute top-2 right-2 z-50 text-red-400 bg-slate-900/80 hover:bg-red-500 hover:text-white p-2 rounded-full shadow-lg transition-all" title="Chopish (Admin)"><i class="fas fa-times"></i></button>` : '';

  const isPeerAdmin = ['6080277322', '2130761358'].includes(String(profile?.tgId));
  const peerBadge = isPeerAdmin ? `<span class="bg-amber-500 text-white text-[9px] font-bold px-1 rounded ml-1">👑 ADMIN</span>` : '';

  tile.innerHTML = `
    ${kickHtml}
    <video id="group_vid_${socketId}" autoplay playsinline></video>
    <div class="group-tile-badge">
      <span class="text-xs font-bold text-cyan-300">${profile?.firstName || 'A\'zo'} ${peerBadge}</span>
      <span id="mic_status_${socketId}" class="text-xs text-emerald-400"><i class="fas fa-microphone"></i></span>
    </div>
  `;
  grid.appendChild(tile);
  updateGroupMemberBadge();
}

function removeGroupVideoTile(socketId) {
  document.getElementById(`group_tile_${socketId}`)?.remove();
  updateGroupMemberBadge();
}

function updateGroupMemberBadge() {
  const grid = document.getElementById('groupVideoGrid');
  const count = grid ? grid.children.length : 1;
  const badge = document.getElementById('groupMemberCountBadge');
  if (badge) badge.innerText = `👥 ${count}/4 A'zo`;
}

function resetVideoCallView() {
  document.getElementById('searchingRadarView')?.classList.add('hidden');
  document.getElementById('activeCallView')?.classList.add('hidden');
  document.getElementById('activeGroupView')?.classList.add('hidden');
  document.getElementById('initialMatchView')?.classList.remove('hidden');
  document.getElementById('leaveChatTopBtn')?.classList.add('hidden');
  const chatContainer = document.getElementById('chatOverlayContainer');
  if (chatContainer) chatContainer.innerHTML = '';
  currentPeerSocketId = null;
  if (typeof currentPeerTgId !== 'undefined') currentPeerTgId = null;
}

function switchTab(tabId) {
  ['chatTabContent', 'profileTabContent'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('text-purple-400', 'border-purple-400');
    btn.classList.add('text-gray-400');
  });

  if (tabId === 'chat') {
    document.getElementById('chatTabContent')?.classList.remove('hidden');
    document.getElementById('tabBtnChat')?.classList.add('text-purple-400', 'border-purple-400');
  } else if (tabId === 'profile') {
    document.getElementById('profileTabContent')?.classList.remove('hidden');
    document.getElementById('tabBtnProfile')?.classList.add('text-purple-400', 'border-purple-400');
    if (typeof loadFriendsList === 'function') loadFriendsList();
  }
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'glass-panel px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-lg border border-purple-500/30 animate-bounce';
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function triggerHeartAnimation() {
  const container = document.getElementById('videoWrapper');
  if (!container) return;
  const heart = document.createElement('div');
  heart.className = 'floating-heart';
  heart.innerHTML = '<i class="fas fa-heart"></i>';
  container.appendChild(heart);
  setTimeout(() => heart.remove(), 1200);
}

window.kickUserFromGroup = function(socketId) {
  if (confirm("Haqiqatan ham bu foydalanuvchini guruhdan chopmoqchimisiz?")) {
    socket.emit('admin-kick-user', { targetSocketId: socketId });
  }
};
