// =====================================================
// socket.js - Global socket & signaling handlers
// socket & currentPeerSocketId are globally accessible
// =====================================================

var socket = null;
var currentPeerSocketId = null;
var currentPeerTgId = null;
var currentRoomId = null;

// Railway backend URL (Socket.io server)
var BACKEND_URL = 'https://web-production-65a7f.up.railway.app';

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

    if (data.isInitiator) {
      try {
        const offer = await webrtcManager.createOffer();
        socket.emit('webrtc-offer', { sdp: offer });
      } catch (e) {
        console.error('[WebRTC] Create offer error:', e);
      }
    }
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
  });

  socket.on('peer-cam-toggle', (data) => {
    showToast(data.isOff ? '🚫 Suhbatdosh kamerani o\'chirdi' : '🎥 Suhbatdosh kamerani yoqdi');
  });

  // ── Group Mode (Full Mesh WebRTC) ───────────────
  socket.on('group-joined', async (data) => {
    console.log('[Socket] Group joined, room:', data.roomId, 'members:', data.existingMembers);
    currentRoomId = data.roomId;
    hideSearchingState();
    showGroupRoomState(data);

    for (const memberSocketId of data.existingMembers) {
      addGroupVideoTile(memberSocketId, { firstName: 'Guruh A\'zosi' });
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
    addGroupVideoTile(data.peerSocketId, data.peerProfile);
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

  // ── 1-on-1 WebRTC signals ───────────────────────
  socket.on('webrtc-offer', async (data) => {
    console.log('[WebRTC] Received offer');
    try {
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

  // ── ICE candidate passthrough ───────────────────
  webrtcManager.onIceCandidate = (candidate) => {
    if (socket && socket.connected) {
      socket.emit('ice-candidate', { candidate });
    }
  };

  return socket;
}
