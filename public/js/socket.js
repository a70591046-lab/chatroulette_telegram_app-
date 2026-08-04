// =====================================================
// socket.js - Global socket & signaling handlers
// socket & currentPeerSocketId are globally accessible
// =====================================================

var socket = null;
var currentPeerSocketId = null;
var currentPeerTgId = null;
var currentRoomId = null;

// Railway backend URL (Socket.io server)
var BACKEND_URL = (window.location.origin && window.location.origin.startsWith('http')) 
  ? window.location.origin 
  : 'https://web-production-65a7f.up.railway.app';

function initSocketConnection(tgId, webrtcManager) {
  if (socket && socket.connected) return socket;

  socket = io(BACKEND_URL, {
    query: { tgId: String(tgId) },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected, ID:', socket.id, 'tgId:', tgId);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  // ── Searching state ──────────────────────────────
  socket.on('searching', () => {
    console.log('[Socket] Searching for peer...');
    showSearchingState();
  });

  // ── 1-on-1 Match Found ──────────────────────────
  socket.on('match-found', async (data) => {
    console.log('[Socket] Match found! isInitiator:', data.isInitiator);
    currentPeerSocketId = data.peerSocketId;
    currentPeerTgId = data.peerProfile?.tgId;
    hideSearchingState();
    showVideoRoomState(data.peerProfile);

    // Make sure local stream exists BEFORE creating peer connection
    if (!webrtcManager.localStream || !webrtcManager.localStream.active) {
      await webrtcManager.initLocalStream();
    }

    if (data.isInitiator) {
      try {
        const offer = await webrtcManager.createOffer();
        socket.emit('webrtc-offer', { sdp: offer });
      } catch (e) {
        console.error('[WebRTC] Create offer error:', e);
      }
    }
    // Non-initiator: wait for webrtc-offer event
  });

  // ── Peer mic/cam toggle signals ─────────────────
  socket.on('peer-mic-toggle', (data) => {
    const isMuted = data.isMuted;
    showToast(isMuted ? '🔇 Suhbatdosh mikrofonni o\'chirdi' : '🎤 Suhbatdosh mikrofonni yoqdi');
    const mic = document.getElementById(`mic_status_${data.fromSocketId}`);
    if (mic) {
      mic.innerHTML = isMuted
        ? '<i class="fas fa-microphone-slash text-red-400"></i>'
        : '<i class="fas fa-microphone text-emerald-400"></i>';
    }

    // Force remote video element volume/mute state to guarantee 100% silence
    const remoteVid = document.getElementById('remoteVideo');
    if (remoteVid) {
      remoteVid.muted = isMuted;
    }
    const groupVid = document.getElementById(`group_vid_${data.fromSocketId}`);
    if (groupVid) {
      groupVid.muted = isMuted;
    }
  });

  socket.on('peer-cam-toggle', (data) => {
    showToast(data.isOff ? '🚫 Suhbatdosh kamerani o\'chirdi' : '🎥 Suhbatdosh kamerani yoqdi');
  });

  socket.on('group-join-error', (data) => {
    hideSearchingState();
    showToast(`❌ ${data.message || 'Guruhga ulanishda xatolik!'}`);
    if (typeof showWelcomeModal === 'function') showWelcomeModal();
  });

  socket.on('public-rooms-list', (data) => {
    if (typeof renderPublicGroupRooms === 'function') {
      renderPublicGroupRooms(data.rooms || []);
    }
  });

  // ── Group Mode (Full Mesh WebRTC) ───────────────
  socket.on('group-joined', async (data) => {
    console.log('[Socket] Group joined, room:', data.roomId, 'members:', data.existingMembers);
    currentRoomId = data.roomId;
    hideSearchingState();
    showGroupRoomState(data);

    for (const mem of data.existingMembers) {
      const memberSocketId = typeof mem === 'object' ? mem.socketId : mem;
      const memberProfile  = typeof mem === 'object' ? mem.profile  : { firstName: 'Guruh A\'zosi' };
      const isMemCreator  = typeof mem === 'object' ? !!mem.isCreator : (memberSocketId === data.creatorSocketId);
      addGroupVideoTile(memberSocketId, memberProfile, isMemCreator);
      try {
        const offer = await webrtcManager.createGroupOffer(memberSocketId, (to, candidate) => {
          socket.emit('group-ice-candidate', { to, candidate });
        });
        socket.emit('group-offer', { to: memberSocketId, sdp: offer });
      } catch (e) {
        console.error('[Group WebRTC] Offer error:', e);
      }
    }
  });

  socket.on('group-peer-joined', (data) => {
    showToast(`👥 ${data.peerProfile?.firstName || 'Yangi a\'zo'} guruhga qo\'shildi!`);
    addGroupVideoTile(data.peerSocketId, data.peerProfile, !!data.isCreator);
  });

  socket.on('group-offer', async (data) => {
    console.log('[Group WebRTC] Received offer from:', data.from);
    try {
      const answer = await webrtcManager.handleGroupOffer(data.from, data.sdp, (to, candidate) => {
        socket.emit('group-ice-candidate', { to, candidate });
      });
      socket.emit('group-answer', { to: data.from, sdp: answer });
    } catch (e) {
      console.error('[Group WebRTC] Handle offer error:', e);
    }
  });

  socket.on('group-answer', async (data) => {
    try {
      await webrtcManager.handleGroupAnswer(data.from, data.sdp);
    } catch (e) {
      console.error('[Group WebRTC] Handle answer error:', e);
    }
  });

  socket.on('group-ice-candidate', async (data) => {
    try {
      await webrtcManager.handleGroupIceCandidate(data.from, data.candidate);
    } catch (e) {}
  });

  socket.on('group-peer-left', (data) => {
    showToast('A\'zo guruhni tark etdi');
    if (webrtcManager && typeof webrtcManager.closeGroupPeerConnection === 'function') {
      webrtcManager.closeGroupPeerConnection(data.peerSocketId);
    }
    removeGroupVideoTile(data.peerSocketId);
  });

  webrtcManager.onGroupRemoteTrack = (peerSocketId, stream) => {
    const vid = document.getElementById(`group_vid_${peerSocketId}`);
    if (vid) {
      vid.srcObject = stream;
      vid.muted = false;
      vid.play().catch(() => {});
    }
  };

  socket.on('kicked-from-group', () => {
    if (typeof leaveChatRoom === 'function') leaveChatRoom();
    showToast('❌ Admin sizni guruhdan chetlatdi!');
  });

  socket.on('banned', () => {
    if (typeof leaveChatRoom === 'function') leaveChatRoom();
    showToast('🚫 Siz platformadan butunlay bloklandingiz!');
  });

  socket.on('received-gift', (data) => {
    const gifts = {
      rose:     { emoji: '🌹', label: 'Atirgul' },
      heart:    { emoji: '💖', label: 'Yurak'   },
      car:      { emoji: '🏎️', label: 'Mashina' },
      crown:    { emoji: '👑', label: 'Toj'     },
      diamond:  { emoji: '💎', label: 'Olmos'   },
      cake:     { emoji: '🎂', label: 'Tort'    },
      firework: { emoji: '🎆', label: 'Salut'   },
      ring:     { emoji: '💍', label: 'Uzuk'    },
    };
    const g = gifts[data.giftType] || { emoji: '🎁', label: 'Sovg\'a' };
    const sender = data.fromName || 'Suhbatdosh';
    let mainTitle = `${sender} sizga sovg'a yubordi!`;
    if (data.mode === 'group') {
      mainTitle = `${sender} guruhga sovg'a yubordi!`;
    } else if (data.mode === 'group-targeted') {
      if (data.isRecipient) {
        mainTitle = `🎁 ${sender} sizga ${g.label} yubordi!`;
      } else {
        mainTitle = `🎁 ${sender} → ${data.toName || 'A\'zo'}ga ${g.label} yubordi!`;
      }
    }

    // Show received banner
    const banner = document.createElement('div');
    banner.className = 'gift-received-banner';
    banner.innerHTML = `
      <div class="g-emoji">${g.emoji}</div>
      <div>
        <div class="g-text">${mainTitle}</div>
        <div class="g-sub">${g.label} ${g.emoji}</div>
      </div>`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3600);

    // Also play animation
    if (typeof playGiftAnimation === 'function') {
      playGiftAnimation(data.giftType);
    }
  });

  // ── 1-on-1 WebRTC signals ───────────────────────
  socket.on('webrtc-offer', async (data) => {
    console.log('[WebRTC] Received offer');
    try {
      // Ensure local stream before handling offer
      if (!webrtcManager.localStream || !webrtcManager.localStream.active) {
        await webrtcManager.initLocalStream();
      }
      const answer = await webrtcManager.handleOffer(data.sdp);
      socket.emit('webrtc-answer', { sdp: answer });
    } catch (e) {
      console.error('[WebRTC] Handle offer error:', e);
    }
  });

  socket.on('webrtc-answer', async (data) => {
    try {
      await webrtcManager.handleAnswer(data.sdp);
    } catch (e) {
      console.error('[WebRTC] Handle answer error:', e);
    }
  });

  socket.on('ice-candidate', async (data) => {
    try {
      await webrtcManager.handleIceCandidate(data.candidate);
    } catch (e) {}
  });

  // ── Reactions ───────────────────────────────────
  socket.on('received-like', () => {
    triggerHeartAnimation();
    showToast('❤️ Suhbatdosh sizga Like bosdi!');
  });

  socket.on('received-follow', () => {
    showToast('⭐ Suhbatdosh sizga obuna bo\'ldi!');
  });

  socket.on('received-friend-request', () => {
    showToast('🤝 Suhbatdosh sizga do\'stlik taklifini yubordi!');
    if (typeof loadFriendsList === 'function') loadFriendsList();
  });

  // ── Live Chat ───────────────────────────────────
  socket.on('chat-message', (data) => {
    appendChatMessage(data.text, false);
  });

  // ── Chat / Peer Left ────────────────────────────
  socket.on('chat-left', () => {
    webrtcManager.closePeerConnection();
    showToast('🚪 Chat tark etildi');
    resetVideoCallView();
  });

  socket.on('peer-left', () => {
    webrtcManager.closePeerConnection();
    showToast('🚪 Suhbatdosh muloqotni tark etdi');
    resetVideoCallView();
  });

  socket.on('search-cancelled', () => {
    resetVideoCallView();
  });

  // ── Direct Calling System ───────────────────────
  socket.on('direct-call-incoming', (data) => {
    window.currentDirectCaller = data;
    document.getElementById('incomingCallerName').innerText = `${data.callerName} sizga qo'ng'iroq qilyapti...`;
    document.getElementById('incomingCallModal').classList.remove('hidden');
  });

  socket.on('direct-call-declined', () => {
    showToast('❌ Foydalanuvchi qo\'ng\'iroqni rad etdi');
    resetVideoCallView();
  });

  socket.on('direct-call-error', (data) => {
    showToast(`❌ Xato: ${data.message}`);
    resetVideoCallView();
  });

  socket.on('kicked-from-group', () => {
    showToast('❌ Siz guruhdan chiqarildingiz!');
    resetVideoCallView();
  });

  // Forced Mic Toggle from Group Admin or EGA
  socket.on('remote-mic-force-toggle', (data) => {
    webrtcManager.toggleMic(!data.isMuted);
    showToast(data.isMuted ? '🔇 Admin mikrofoningizni o\'chirdi!' : '🎤 Admin mikrofoningizni yoqdi!');
  });

  // Action Denied (e.g. trying to kick or mute EGA)
  socket.on('action-denied', (data) => {
    showToast(`⚠️ ${data.message || 'Amal bajarilmadi!'}`);
  });

  // ── ICE candidate passthrough ───────────────────
  webrtcManager.onIceCandidate = (candidate) => {
    if (socket && socket.connected) {
      socket.emit('ice-candidate', { candidate });
    }
  };

  return socket;
}
