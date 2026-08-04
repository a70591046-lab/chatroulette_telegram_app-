let tgUser = null;
let currentProfile = null;
let webrtc = null;
let activeChatMode = 'solo';
let socketReady = false;

// Railway backend API URL
const BACKEND_API_URL = 'https://web-production-65a7f.up.railway.app';

const ADMIN_TELEGRAM_IDS = ['7713174177', '123456789'];

document.addEventListener('DOMContentLoaded', async () => {
  // Show welcome mode modal immediately
  if (typeof showWelcomeModal === 'function') showWelcomeModal();

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

async function startMatchmakingSearch() {
  if (activeChatMode === 'group') {
    startGroupVideoSearch();
    return;
  }
  if (!socket || !socket.connected) {
    showToast('⏳ Serverga ulanmoqda...');
    if (socket && typeof socket.connect === 'function') {
      socket.connect();
    } else if (typeof initSocketConnection === 'function' && tgUser) {
      initSocketConnection(tgUser.tgId, webrtc);
    }
    let waited = 0;
    while ((!socket || !socket.connected) && waited < 20) {
      await new Promise(r => setTimeout(r, 100));
      waited++;
    }
    if (!socket || !socket.connected) {
      showToast('❌ Server bilan aloqa yo\'q, iltimos sahifani yangilang');
      return;
    }
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

  webrtc.initLocalStream().then(stream => {
    socket.emit('start-search', {
      tgId: tgUser.tgId,
      gender: currentProfile.gender || 'male',
      targetGender: currentProfile.targetGender || 'any',
      profile: currentProfile
    });
  });
}

async function startGroupVideoSearch() {
  activeChatMode = 'group';
  if (!socket || !socket.connected) {
    showToast('⏳ Serverga ulanmoqda...');
    if (socket && typeof socket.connect === 'function') {
      socket.connect();
    } else if (typeof initSocketConnection === 'function' && tgUser) {
      initSocketConnection(tgUser.tgId, webrtc);
    }
    let waited = 0;
    while ((!socket || !socket.connected) && waited < 20) {
      await new Promise(r => setTimeout(r, 100));
      waited++;
    }
    if (!socket || !socket.connected) {
      showToast('❌ Server bilan aloqa yo\'q, iltimos sahifani yangilang');
      return;
    }
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

  showSearchingState();

  webrtc.initLocalStream().then(stream => {
    socket.emit('join-group-room', {
      tgId: tgUser.tgId,
      profile: currentProfile
    });
  });
}
window.startGroupVideoSearch = startGroupVideoSearch;

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

  window.toggleGroupMic = function() {
    const isOn = webrtc.toggleMic();
    const btn = document.getElementById('groupMicToggleBtn');
    if (btn) {
      btn.classList.toggle('btn-disabled', !isOn);
      btn.classList.toggle('btn-active-mic', isOn);
      btn.innerHTML = isOn ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    }
    const selfMicIcon = document.getElementById('mic_status_self');
    if (selfMicIcon) {
      selfMicIcon.innerHTML = isOn ? '<i class="fas fa-microphone text-emerald-400"></i>' : '<i class="fas fa-microphone-slash text-red-400"></i>';
    }
    if (socket) socket.emit('send-mic-toggle', { isMuted: !isOn });
  };

  window.toggleGroupCam = function() {
    const isOn = webrtc.toggleCamera();
    const btn = document.getElementById('groupCamToggleBtn');
    if (btn) {
      btn.classList.toggle('btn-disabled', !isOn);
      btn.innerHTML = isOn ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    }
    if (socket) socket.emit('send-cam-toggle', { isOff: !isOn });
  };

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

  document.getElementById('giftBtn')?.addEventListener('click', () => {
    document.getElementById('giftModal')?.classList.remove('hidden');
  });

  document.getElementById('closeGiftModalBtn')?.addEventListener('click', () => {
    document.getElementById('giftModal')?.classList.add('hidden');
  });

  document.querySelectorAll('.gift-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const giftType = e.currentTarget.getAttribute('data-gift');
      // Send gift using peerSocketId (more reliable than tgId)
      if (currentPeerSocketId && socket) {
        socket.emit('send-gift', { fromTgId: tgUser.tgId, toTgId: currentPeerTgId, peerSocketId: currentPeerSocketId, giftType });
        showToast('🎁 Sovg\'a yuborildi!');
        playGiftAnimation(giftType);
      } else {
        showToast('⚠️ Suhbat topilmadi, avval suhbat boshlang!');
      }
      document.getElementById('giftModal')?.classList.add('hidden');
    });
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

  const localVid = document.getElementById('localVideo');
  if (localVid && webrtc && webrtc.localStream) {
    localVid.srcObject = webrtc.localStream;
    localVid.muted = true;
    localVid.play().catch(() => {});
  }

  if (peerProfile) {
    const nameEl = document.getElementById('peerNameTag');
    const hobbiesEl = document.getElementById('peerHobbiesTag');
    
    let nameHtml = `${peerProfile.firstName || 'Suhbatdosh'}, ${peerProfile.age || 20}`;
    const isPeerAdmin = ADMIN_TELEGRAM_IDS.includes(String(peerProfile.tgId));
    if (isPeerAdmin) {
      nameHtml += ` <span class="bg-amber-500 text-white text-[10px] font-bold px-1 rounded ml-1">👑 EGA</span>`;
    }
    
    if (nameEl) nameEl.innerHTML = nameHtml;
    if (hobbiesEl) hobbiesEl.innerText = (peerProfile.hobbies || []).join(', ') || 'Xobbilar ko\'rsatilmadi';
  }
}

let isCurrentGroupCreator = false;
let currentGroupCreatorSocketId = null;

function showWelcomeModal() {
  const modal = document.getElementById('welcomeModeModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
  }
}
window.showWelcomeModal = showWelcomeModal;

function selectAppMode(mode) {
  const modal = document.getElementById('welcomeModeModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.add('hidden');
  }
  setChatMode(mode);
  if (mode === 'solo') {
    startMatchmakingSearch();
  } else if (mode === 'group') {
    isCurrentGroupCreator = true;
    startGroupVideoSearch();
  }
}
window.selectAppMode = selectAppMode;

// Show welcome modal on load or auto-select if specified in URL
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const initialMode = urlParams.get('mode');
  if (initialMode === 'solo' || initialMode === 'group') {
    selectAppMode(initialMode);
    return;
  }

  setTimeout(() => {
    showWelcomeModal();
  }, 100);
let currentGroupRoomCode = null;

async function ensureSocketConnected() {
  if (!socket || !socket.connected) {
    showToast('⏳ Serverga ulanmoqda...');
    if (socket && typeof socket.connect === 'function') {
      socket.connect();
    } else if (typeof initSocketConnection === 'function' && tgUser) {
      initSocketConnection(tgUser.tgId, webrtc);
    }
    let waited = 0;
    while ((!socket || !socket.connected) && waited < 25) {
      await new Promise(r => setTimeout(r, 100));
      waited++;
    }
  }
  return socket && socket.connected;
}

// ── Group Room Actions ─────────────────────────────
window.createNewGroupRoom = async function() {
  const modal = document.getElementById('welcomeModeModal');
  if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
  setChatMode('group');
  isCurrentGroupCreator = true;

  showSearchingState();

  const connected = await ensureSocketConnected();
  if (!connected) {
    showToast('❌ Server bilan aloqa yo\'q, iltimos qayta urinib ko\'ring');
    hideSearchingState();
    showWelcomeModal();
    return;
  }

  webrtc.initLocalStream().then(stream => {
    if (stream) document.getElementById('mediaPermissionOverlay')?.classList.add('hidden');
  }).catch(() => {});

  socket.emit('create-group-room', {
    tgId: tgUser.tgId,
    profile: currentProfile || { firstName: tgUser.firstName }
  });
};

window.openJoinGroupModal = function() {
  const modal = document.getElementById('welcomeModeModal');
  if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
  document.getElementById('groupJoinModal')?.classList.remove('hidden');
  fetchPublicGroupRooms();
};

window.closeJoinGroupModal = function() {
  document.getElementById('groupJoinModal')?.classList.add('hidden');
  showWelcomeModal();
};

window.submitJoinGroupCode = async function() {
  const input = document.getElementById('groupCodeInput');
  const code = input?.value?.trim();
  if (!code) {
    showToast('⚠️ Iltimos, 6 xonali xona kodini kiriting!');
    return;
  }

  document.getElementById('groupJoinModal')?.classList.add('hidden');
  setChatMode('group');
  showSearchingState();

  const connected = await ensureSocketConnected();
  if (!connected) {
    showToast('❌ Server bilan aloqa yo\'q, iltimos qayta urinib ko\'ring');
    hideSearchingState();
    showWelcomeModal();
    return;
  }

  webrtc.initLocalStream().then(stream => {
    if (stream) document.getElementById('mediaPermissionOverlay')?.classList.add('hidden');
  }).catch(() => {});

  socket.emit('join-group-by-code', {
    tgId: tgUser.tgId,
    profile: currentProfile || { firstName: tgUser.firstName },
    roomCode: code
  });
};

window.joinPublicRoomDirect = async function(code) {
  document.getElementById('groupJoinModal')?.classList.add('hidden');
  setChatMode('group');
  showSearchingState();

  const connected = await ensureSocketConnected();
  if (!connected) {
    showToast('❌ Server bilan aloqa yo\'q, iltimos qayta urinib ko\'ring');
    hideSearchingState();
    showWelcomeModal();
    return;
  }

  webrtc.initLocalStream().then(stream => {
    if (stream) document.getElementById('mediaPermissionOverlay')?.classList.add('hidden');
  }).catch(() => {});

  socket.emit('join-group-by-code', {
    tgId: tgUser.tgId,
    profile: currentProfile || { firstName: tgUser.firstName },
    roomCode: code
  });
};

window.fetchPublicGroupRooms = async function() {
  await ensureSocketConnected();
  if (socket && socket.connected) {
    socket.emit('get-public-rooms');
  }
};

window.renderPublicGroupRooms = function(rooms) {
  const container = document.getElementById('publicRoomsContainer');
  if (!container) return;

  if (!rooms || rooms.length === 0) {
    container.innerHTML = `<div class="text-center text-slate-500 text-[11px] py-4">Hozircha ochiq guruhlar yo'q. Yangi guruh oching!</div>`;
    return;
  }

  container.innerHTML = rooms.map(r => `
    <div class="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
      <div>
        <div class="text-xs font-bold text-slate-200">🔑 Kod: ${r.roomCode}</div>
        <div class="text-[10px] text-slate-400">Admin: ${r.creatorName} | ${r.memberCount}/${r.maxMembers} a'zo</div>
      </div>
      <button onclick="joinPublicRoomDirect('${r.roomCode}')" class="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/40 transition">
        Qo'shilish
      </button>
    </div>
  `).join('');
};

window.copyGroupRoomCode = function() {
  if (!currentGroupRoomCode) return;
  const shareText = `Guruhimga qo'shiling! Xona kodi: ${currentGroupRoomCode}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(currentGroupRoomCode);
  }
  if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openTelegramLink === 'function') {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(BACKEND_API_URL)}&text=${encodeURIComponent(shareText)}`;
    window.Telegram.WebApp.openTelegramLink(shareUrl);
  }
  showToast(`📋 Xona kodi nusxalandi: ${currentGroupRoomCode}`);
};

window.setMemberVolume = function(socketId, value) {
  const vid = document.getElementById(`group_vid_${socketId}`);
  if (vid) {
    vid.volume = parseFloat(value);
  }
};

function showGroupRoomState(data) {
  document.getElementById('initialMatchView')?.classList.add('hidden');
  document.getElementById('searchingRadarView')?.classList.add('hidden');
  document.getElementById('activeCallView')?.classList.add('hidden');

  if (data) {
    isCurrentGroupCreator = !!data.isCreator;
    currentGroupCreatorSocketId = data.creatorSocketId || null;
    currentGroupRoomCode = data.roomCode || data.roomId || null;

    const codeBadge = document.getElementById('currentGroupCodeBadge');
    if (codeBadge && currentGroupRoomCode) {
      codeBadge.innerText = `🔑 Kod: ${currentGroupRoomCode}`;
    }
  }

  // Use display:flex since the element uses inline style
  const groupView = document.getElementById('activeGroupView');
  if (groupView) {
    groupView.style.display = 'flex';
    groupView.classList.remove('hidden');
  }
  document.getElementById('leaveChatTopBtn')?.classList.remove('hidden');

  const grid = document.getElementById('groupVideoGrid');
  if (grid) {
    grid.innerHTML = '';
    const myTile = document.createElement('div');
    myTile.className = 'group-tile';
    const isAdmin = ADMIN_TELEGRAM_IDS.includes(String(tgUser?.tgId));
    const isCreator = isCurrentGroupCreator;

    let myBadge = '';
    if (isAdmin) {
      myBadge += `<span class="ega-badge">👑 EGA</span>`;
    }
    if (isCreator) {
      myBadge += `<span class="bg-purple-600 text-white text-[9px] font-bold px-1 rounded ml-1">⭐ Admin</span>`;
    }

    myTile.innerHTML = `
      <video autoplay playsinline muted></video>
      <div class="group-tile-name">
        <span>Siz ${myBadge}</span>
        <span id="mic_status_self"><i class="fas fa-microphone text-emerald-400"></i></span>
      </div>
    `;
    const v = myTile.querySelector('video');
    v.muted = true; // MUST be muted — prevents local audio echo
    if (webrtc && webrtc.localStream) {
      v.srcObject = webrtc.localStream;
      v.play().catch(() => {});
    }
    grid.appendChild(myTile);
    updateGroupGridLayout();
  }
}

let selectedGroupTarget = null;

window.openTargetedGiftModal = function(socketId, name, tgId) {
  selectedGroupTarget = { socketId, name, tgId };
  const titleEl = document.querySelector('#giftModal h3');
  if (titleEl) titleEl.innerText = `🎁 ${name} ga sovg'a yuborish`;
  document.getElementById('giftModal')?.classList.remove('hidden');
};

function toggleRemoteMemberMic(targetSocketId, currentMuted) {
  if (socket && socket.connected) {
    socket.emit('group-mute-remote-user', { targetSocketId, isMuted: !currentMuted });
  }
}

function kickGroupMember(targetSocketId) {
  if (socket && socket.connected) {
    socket.emit('group-kick-user', { targetSocketId });
  }
}

function addGroupVideoTile(socketId, profile, isTileCreator) {
  const grid = document.getElementById('groupVideoGrid');
  if (!grid || document.getElementById(`group_tile_${socketId}`)) return;
  const tile = document.createElement('div');
  tile.id = `group_tile_${socketId}`;
  tile.className = 'group-tile';

  const isMeEga = ADMIN_TELEGRAM_IDS.includes(String(tgUser?.tgId));
  const isMeCreator = isCurrentGroupCreator;
  const canIControl = isMeEga || isMeCreator; // Admin or EGA controls mute/kick

  const isTargetEga = ADMIN_TELEGRAM_IDS.includes(String(profile?.tgId));
  const isTargetCreator = !!isTileCreator || (currentGroupCreatorSocketId === socketId);

  // KICK BUTTON: Render ONLY if I have admin authority AND target is NOT EGA!
  let kickHtml = '';
  if (canIControl && !isTargetEga) {
    kickHtml = `<button onclick="kickGroupMember('${socketId}')" class="group-tile-kick" title="Chaqirib chiqarish"><i class="fas fa-user-minus"></i></button>`;
  }

  // MUTE BUTTON: Render ONLY if I have admin authority AND target is NOT EGA!
  let muteControlHtml = '';
  if (canIControl && !isTargetEga) {
    muteControlHtml = `<button onclick="toggleRemoteMemberMic('${socketId}', false)" class="group-tile-mute" title="Mikrofonni o'chirish/yoqish"><i class="fas fa-volume-xmark"></i></button>`;
  }

  const giftHtml = `<button onclick="openTargetedGiftModal('${socketId}', '${(profile?.firstName || 'A\'zo').replace(/'/g, "&#39;")}', '${profile?.tgId || ''}')" class="group-tile-gift" title="Sovg'a"><i class="fas fa-gift"></i></button>`;

  let peerBadge = '';
  if (isTargetEga) {
    peerBadge += `<span class="ega-badge">👑 EGA</span>`;
  }
  if (isTargetCreator) {
    peerBadge += `<span class="bg-purple-600 text-white text-[9px] font-bold px-1 rounded ml-1">⭐ Admin</span>`;
  }

  tile.innerHTML = `
    ${kickHtml}
    ${muteControlHtml}
    ${giftHtml}
    <video id="group_vid_${socketId}" autoplay playsinline></video>
    <div class="group-tile-name">
      <div class="flex items-center gap-1 overflow-hidden">
        <span class="truncate max-w-[80px]">${profile?.firstName || 'A\'zo'}</span>
        ${peerBadge}
      </div>
      <div class="flex items-center gap-1.5">
        <!-- Volume Slider for every member -->
        <div class="group-volume-box" title="Ovoz balandligi">
          <i class="fas fa-volume-high text-[10px] text-cyan-400"></i>
          <input type="range" min="0" max="1" step="0.05" value="1" class="group-volume-slider" oninput="setMemberVolume('${socketId}', this.value)">
        </div>
        <span id="mic_status_${socketId}"><i class="fas fa-microphone text-emerald-400"></i></span>
      </div>
    </div>
  `;
  grid.appendChild(tile);
  const remoteStream = (webrtc && typeof webrtc.getGroupRemoteStream === 'function') ? webrtc.getGroupRemoteStream(socketId) : null;
  if (remoteStream) {
    const v = tile.querySelector('video');
    if (v) {
      v.srcObject = remoteStream;
      v.muted = false;
      v.play().catch(() => {});
    }
  }
  updateGroupGridLayout();
}

function removeGroupVideoTile(socketId) {
  document.getElementById(`group_tile_${socketId}`)?.remove();
  updateGroupGridLayout();
}

function updateGroupGridLayout() {
  const grid = document.getElementById('groupVideoGrid');
  if (!grid) return;
  const count = grid.children.length;
  // Remove all count classes
  grid.classList.remove('count-1', 'count-2', 'count-3', 'count-4', 'count-many');
  if (count <= 1)      grid.classList.add('count-1');
  else if (count === 2) grid.classList.add('count-2');
  else if (count === 3) grid.classList.add('count-3');
  else if (count === 4) grid.classList.add('count-4');
  else                  grid.classList.add('count-many');

  const badge = document.getElementById('groupMemberCountBadge');
  if (badge) badge.innerText = `👥 ${count}/4 A'zo`;
}

function resetVideoCallView() {
  document.getElementById('searchingRadarView')?.classList.add('hidden');
  document.getElementById('activeCallView')?.classList.add('hidden');

  const groupView = document.getElementById('activeGroupView');
  if (groupView) {
    groupView.style.display = 'none';
    groupView.classList.add('hidden');
  }

  document.getElementById('initialMatchView')?.classList.remove('hidden');
  document.getElementById('leaveChatTopBtn')?.classList.add('hidden');
  const chatContainer = document.getElementById('chatOverlayContainer');
  if (chatContainer) chatContainer.innerHTML = '';
  currentPeerSocketId = null;
  if (typeof currentPeerTgId !== 'undefined') currentPeerTgId = null;
  showWelcomeModal();
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

window.playGiftAnimation = function(giftType, fromName) {
  const gifts = {
    rose:     { emoji: '🌹', label: 'Atirgul', colors: ['#f43f5e','#fb7185','#fda4af'] },
    heart:    { emoji: '💖', label: 'Yurak',   colors: ['#ec4899','#f472b6','#f9a8d4'] },
    car:      { emoji: '🏎️', label: 'Mashina', colors: ['#06b6d4','#22d3ee','#67e8f9'] },
    crown:    { emoji: '👑', label: 'Toj',     colors: ['#f59e0b','#fbbf24','#fde68a'] },
    diamond:  { emoji: '💎', label: 'Olmos',   colors: ['#8b5cf6','#a78bfa','#c4b5fd'] },
    cake:     { emoji: '🎂', label: 'Tort',    colors: ['#f97316','#fb923c','#fdba74'] },
    firework: { emoji: '🎆', label: 'Salut',   colors: ['#10b981','#34d399','#6ee7b7'] },
    ring:     { emoji: '💍', label: 'Uzuk',    colors: ['#e5e7eb','#f9fafb','#d1d5db'] },
  };
  const g = gifts[giftType] || gifts.rose;

  // 1) Big emoji animation
  const el = document.createElement('div');
  el.className = 'gift-animation-item';
  el.textContent = g.emoji;
  document.body.appendChild(el);
  void el.offsetWidth;
  el.classList.add('animate-gift');
  setTimeout(() => el.remove(), 3200);

  // 2) Label below
  const lbl = document.createElement('div');
  lbl.className = 'gift-label';
  lbl.textContent = g.label;
  document.body.appendChild(lbl);
  setTimeout(() => lbl.remove(), 3200);

  // 3) Confetti particles burst
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'gift-particle';
    p.style.left = cx + 'px';
    p.style.top  = cy + 'px';
    p.style.background = g.colors[i % g.colors.length];
    const angle  = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.6;
    const dist   = 80 + Math.random() * 140;
    p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    p.style.width  = (8 + Math.random() * 10) + 'px';
    p.style.height = p.style.width;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
};

window.kickUserFromGroup = function(socketId) {
  if (confirm("Haqiqatan ham bu foydalanuvchini guruhdan chopmoqchimisiz?")) {
    socket.emit('admin-kick-user', { targetSocketId: socketId });
  }
};

// Called from inline onclick in Gift Modal HTML
window.sendGift = async function(giftType) {
  document.getElementById('giftModal')?.classList.add('hidden');
  
  if (!socket) {
    showToast('⚠️ Ulanish yo\'q!');
    return;
  }

  // Premium gifts require sponsor check if sponsors exist
  const premiumGifts = ['car', 'crown', 'diamond', 'cake', 'firework', 'ring'];
  if (premiumGifts.includes(giftType) && tgUser) {
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/sponsors/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId: tgUser.tgId })
      }).then(r => r.json());

      if (res && res.success && !res.subscribed) {
        showSponsorModal();
        return;
      }
    } catch(e) {}
  }
  
  if (selectedGroupTarget && activeChatMode === 'group') {
    socket.emit('send-gift', {
      fromTgId: tgUser ? tgUser.tgId : null,
      targetSocketId: selectedGroupTarget.socketId,
      targetTgId: selectedGroupTarget.tgId,
      targetName: selectedGroupTarget.name,
      giftType: giftType,
      mode: 'group-targeted'
    });
    showToast(`🎁 ${selectedGroupTarget.name} ga sovg'a yuborildi!`);
    if (typeof playGiftAnimation === 'function') {
      playGiftAnimation(giftType);
    }
    selectedGroupTarget = null;
    return;
  }

  if (activeChatMode === 'group') {
    socket.emit('send-gift', {
      fromTgId: tgUser ? tgUser.tgId : null,
      giftType: giftType,
      mode: 'group'
    });
    showToast('🎁 Guruhga sovg\'a yuborildi!');
    if (typeof playGiftAnimation === 'function') {
      playGiftAnimation(giftType);
    }
  } else {
    if (!currentPeerSocketId) {
      showToast('⚠️ Avval suhbatdosh toping!');
      return;
    }
    
    socket.emit('send-gift', {
      fromTgId: tgUser ? tgUser.tgId : null,
      toTgId: currentPeerTgId,
      peerSocketId: currentPeerSocketId,
      giftType: giftType,
      mode: '1on1'
    });
    
    showToast('🎁 Sovg\'a yuborildi!');
    if (typeof playGiftAnimation === 'function') {
      playGiftAnimation(giftType);
    }
  }
};

window.showSponsorModal = async function() {
  const modal = document.getElementById('sponsorModal');
  const container = document.getElementById('sponsorChannelsContainer');
  if (!modal || !container) return;

  container.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">⏳ Kanallar yuklanmoqda...</div>';
  modal.classList.remove('hidden');

  try {
    const res = await fetch(`${BACKEND_API_URL}/api/sponsors`).then(r => r.json());
    if (res.success && res.sponsors && res.sponsors.length > 0) {
      container.innerHTML = res.sponsors.map(s => `
        <div class="flex items-center justify-between p-3 glass rounded-xl border border-white/10">
          <div class="font-bold text-sm text-white">${s.title || s.id}</div>
          <a href="${s.link}" target="_blank" class="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-cyan-500 hover:brightness-110 text-white rounded-xl text-xs font-bold transition">
            📢 A'zo bo'lish
          </a>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">Xomaki kanallar topilmadi</div>';
    }
  } catch(e) {
    container.innerHTML = '<div class="text-xs text-red-400 text-center py-4">Xatolik yuz berdi</div>';
  }
};

window.checkSponsorSubscription = async function() {
  if (!tgUser) return;
  showToast('⏳ Tekshirilmoqda...');
  try {
    const res = await fetch(`${BACKEND_API_URL}/api/sponsors/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tgId: tgUser.tgId })
    }).then(r => r.json());

    if (res && res.subscribed) {
      document.getElementById('sponsorModal')?.classList.add('hidden');
      showToast('🎉 Rahmat! Barcha sovg\'alar ochildi!');
    } else {
      showToast('❌ Hali barcha kanallarga a\'zo bo\'lmadingiz!');
    }
  } catch(e) {
    showToast('⚠️ Tekshirishda xatolik!');
  }
};
