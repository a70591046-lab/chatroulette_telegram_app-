const matchmaking = require('./matchmaking');
const db = require('../db/database');

const connectedUsers = new Map(); // tgId -> socketId
let ioInstance = null;

function setupWebRTCSignaling(io) {
  ioInstance = io;
  const socketCallStartTime = new Map(); // socketId -> startTime

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);
    const tgId = socket.handshake.query.tgId;
    if (tgId) {
      connectedUsers.set(String(tgId), socket.id);
    }

    // Join 1-on-1 Matchmaking Queue
    socket.on('start-search', (data) => {
      console.log(`[Socket] ${socket.id} started search with data:`, data);
      const { tgId, profile } = data;
      if (!tgId) {
        console.log(`[Socket] ${socket.id} no tgId provided`);
        return;
      }
      
      if (db.isBanned(tgId)) {
        socket.emit('banned');
        return;
      }

      db.recordActivity(tgId);
      
      const result = matchmaking.addToQueue(socket.id, tgId, profile);
      console.log(`[Socket] ${socket.id} matchmaking result:`, result);

      if (result.matched) {
        const peerSocketId = result.peerSocketId;
        const now = Date.now();
        socketCallStartTime.set(socket.id, now);
        socketCallStartTime.set(peerSocketId, now);

        const myProfile = db.getUser(tgId) || profile;
        const peerSocket = io.sockets.sockets.get(peerSocketId);
        const peerTgId = peerSocket ? peerSocket.handshake.query.tgId : null;
        const peerProfileData = peerTgId ? db.getUser(peerTgId) : null;
        // IMPORTANT: always include tgId in peerProfile for gifts, report, etc.
        const peerProfileFull = Object.assign({}, peerProfileData || { firstName: 'Suhbatdosh', age: 20, hobbies: [] }, { tgId: peerTgId });
        const myProfileFull = Object.assign({}, myProfile, { tgId: tgId });

        socket.emit('match-found', {
          peerSocketId,
          isInitiator: true,
          peerProfile: peerProfileFull
        });

        io.to(peerSocketId).emit('match-found', {
          peerSocketId: socket.id,
          isInitiator: false,
          peerProfile: myProfileFull
        });
      } else {
        socket.emit('searching', { status: 'looking_for_peer' });
      }
    });

    // Join Group Video Chat Lounge
    const handleGroupJoin = (data) => {
      const { tgId, profile } = data;
      if (!tgId) return;

      if (db.isBanned(tgId)) {
        socket.emit('banned');
        return;
      }

      db.recordActivity(tgId);
      const res = matchmaking.joinGroupRoom(socket.id, tgId, profile);

      socket.join(res.roomId);

      const existingMemberProfiles = res.members.map(mSocketId => {
        const mSocket = io.sockets.sockets.get(mSocketId);
        const mTgId = mSocket ? mSocket.handshake.query.tgId : null;
        const mUser = mTgId ? db.getUser(mTgId) : null;
        return {
          socketId: mSocketId,
          isCreator: mSocketId === res.creatorSocketId,
          profile: Object.assign({}, mUser || { firstName: 'Guruh A\'zosi' }, { tgId: mTgId })
        };
      });

      const myProfileFull = Object.assign({}, db.getUser(tgId) || profile, { tgId: String(tgId) });

      socket.emit('group-joined', {
        roomId: res.roomId,
        creatorSocketId: res.creatorSocketId,
        isCreator: res.isCreator,
        existingMembers: existingMemberProfiles,
        myProfile: myProfileFull
      });

      socket.to(res.roomId).emit('group-peer-joined', {
        peerSocketId: socket.id,
        creatorSocketId: res.creatorSocketId,
        isCreator: res.isCreator,
        peerProfile: myProfileFull
      });
    };

    socket.on('start-group-search', handleGroupJoin);
    socket.on('join-group-room', handleGroupJoin);

    // Real-time Mute/Unmute Mic Signal
    socket.on('send-mic-toggle', (data) => {
      const peerSocketId = matchmaking.getPeer(socket.id);
      if (peerSocketId) {
        io.to(peerSocketId).emit('peer-mic-toggle', { fromSocketId: socket.id, isMuted: data.isMuted });
      }
      const roomId = matchmaking.socketGroupRoom.get(socket.id);
      if (roomId) {
        io.to(roomId).emit('peer-mic-toggle', { fromSocketId: socket.id, isMuted: data.isMuted });
      }
    });

    // Real-time Camera Toggle Signal
    socket.on('send-cam-toggle', (data) => {
      const peerSocketId = matchmaking.getPeer(socket.id);
      if (peerSocketId) {
        io.to(peerSocketId).emit('peer-cam-toggle', { fromSocketId: socket.id, isOff: data.isOff });
      }
      const roomId = matchmaking.socketGroupRoom.get(socket.id);
      if (roomId) {
        io.to(roomId).emit('peer-cam-toggle', { fromSocketId: socket.id, isOff: data.isOff });
      }
    });

    // Group Signaling: Mesh Offer/Answer/ICE
    socket.on('group-offer', (data) => {
      io.to(data.to).emit('group-offer', {
        sdp: data.sdp,
        from: socket.id
      });
    });

    socket.on('group-answer', (data) => {
      io.to(data.to).emit('group-answer', {
        sdp: data.sdp,
        from: socket.id
      });
    });

    socket.on('group-ice-candidate', (data) => {
      io.to(data.to).emit('group-ice-candidate', {
        candidate: data.candidate,
        from: socket.id
      });
    });

    // Leave Chat
    socket.on('leave-chat', () => {
      handleCallEnd(socket.id);
      const groupRes = matchmaking.leaveGroupRoom(socket.id);
      if (groupRes) {
        socket.leave(groupRes.roomId);
        io.to(groupRes.roomId).emit('group-peer-left', { peerSocketId: socket.id });
      }

      const peerSocketId = matchmaking.endCall(socket.id);
      if (peerSocketId) {
        io.to(peerSocketId).emit('peer-left', { reason: 'left' });
      }
      socket.emit('chat-left');
    });

    // Cancel Search
    socket.on('cancel-search', () => {
      matchmaking.removeFromQueue(socket.id);
      matchmaking.leaveGroupRoom(socket.id);
      socket.emit('search-cancelled');
    });

    // 1-on-1 WebRTC Offer
    socket.on('webrtc-offer', (data) => {
      const peerSocketId = matchmaking.getPeer(socket.id);
      if (peerSocketId) {
        io.to(peerSocketId).emit('webrtc-offer', {
          sdp: data.sdp,
          from: socket.id
        });
      }
    });

    socket.on('webrtc-answer', (data) => {
      const peerSocketId = matchmaking.getPeer(socket.id);
      if (peerSocketId) {
        io.to(peerSocketId).emit('webrtc-answer', {
          sdp: data.sdp,
          from: socket.id
        });
      }
    });

    socket.on('ice-candidate', (data) => {
      const peerSocketId = matchmaking.getPeer(socket.id);
      if (peerSocketId) {
        io.to(peerSocketId).emit('ice-candidate', {
          candidate: data.candidate,
          from: socket.id
        });
      }
    });

    // Interactive Actions
    socket.on('send-like', (data) => {
      const peerSocketId = matchmaking.getPeer(socket.id);
      const { fromTgId, toTgId } = data;
      if (fromTgId && toTgId) db.addLike(fromTgId, toTgId);
      if (peerSocketId) io.to(peerSocketId).emit('received-like', { fromSocket: socket.id });
    });

    socket.on('send-follow', (data) => {
      const peerSocketId = matchmaking.getPeer(socket.id);
      const { fromTgId, toTgId } = data;
      if (fromTgId && toTgId) db.addFollow(fromTgId, toTgId);
      if (peerSocketId) io.to(peerSocketId).emit('received-follow', { fromSocket: socket.id });
    });

    socket.on('send-friend-request', (data) => {
      const peerSocketId = matchmaking.getPeer(socket.id);
      const { fromTgId, toTgId } = data;
      if (fromTgId && toTgId) db.addFriendRequest(fromTgId, toTgId);
      if (peerSocketId) io.to(peerSocketId).emit('received-friend-request', { fromSocket: socket.id });
    });

    // Direct Call System
    socket.on('direct-call-request', (data) => {
      const targetSocketId = connectedUsers.get(String(data.targetTgId));
      if (targetSocketId) {
        io.to(targetSocketId).emit('direct-call-incoming', {
          callerTgId: socket.handshake.query.tgId,
          callerName: data.callerName,
          callerSocketId: socket.id
        });
      } else {
        socket.emit('direct-call-error', { message: 'Foydalanuvchi oflayn' });
      }
    });

    socket.on('direct-call-accept', (data) => {
      const callerSocketId = data.callerSocketId;
      if (io.sockets.sockets.get(callerSocketId)) {
        // Set them up in a 1-on-1 match
        matchmaking.forceMatch(callerSocketId, socket.id);
        const myProfile = db.getUser(socket.handshake.query.tgId) || { firstName: 'Suhbatdosh' };
        const peerProfile = db.getUser(data.callerTgId) || { firstName: 'Suhbatdosh' };
        
        socket.emit('match-found', {
          peerSocketId: callerSocketId,
          isInitiator: false,
          peerProfile: peerProfile,
          direct: true
        });

        io.to(callerSocketId).emit('match-found', {
          peerSocketId: socket.id,
          isInitiator: true,
          peerProfile: myProfile,
          direct: true
        });
      }
    });

    socket.on('direct-call-decline', (data) => {
      io.to(data.callerSocketId).emit('direct-call-declined');
    });

    // Live Chat
    socket.on('send-chat-message', (data) => {
      const peerSocketId = matchmaking.getPeer(socket.id);
      if (peerSocketId) {
        io.to(peerSocketId).emit('chat-message', {
          text: data.text,
          from: socket.id,
          timestamp: Date.now()
        });
      }
    });

    // Send Gift
    socket.on('send-gift', (data) => {
      const fromTgId = socket.handshake.query.tgId;
      const giftType  = data.giftType;
      const mode      = data.mode || '1on1';
      const fromUser  = db.getUser(fromTgId);
      const fromName  = fromUser ? fromUser.firstName : 'Foydalanuvchi';

      if (mode === 'group-targeted' && data.targetSocketId) {
        // Targeted gift to a specific person in the group
        const roomId = matchmaking.getUserGroupRoom(socket.id);
        if (roomId) {
          const members = matchmaking.getGroupRoomMembers(roomId);
          const targetSocket = io.sockets.sockets.get(data.targetSocketId);
          const targetTgId = targetSocket ? targetSocket.handshake.query.tgId : data.targetTgId;
          const targetUser = db.getUser(targetTgId);
          const targetName = targetUser ? targetUser.firstName : (data.targetName || 'A\'zo');

          members.forEach(memberId => {
            if (memberId !== socket.id) {
              const isRecipient = (memberId === data.targetSocketId);
              io.to(memberId).emit('received-gift', {
                giftType,
                fromTgId,
                fromName,
                toName: targetName,
                mode: 'group-targeted',
                isRecipient
              });
            }
          });
          db.logGift({ fromTgId, toTgId: targetTgId || 'group:' + roomId, giftType, mode: 'group-targeted' });
        }
      } else if (mode === 'group') {
        // Broadcast to everyone in the same group room
        const roomId = matchmaking.getUserGroupRoom(socket.id);
        if (roomId) {
          const members = matchmaking.getGroupRoomMembers(roomId);
          members.forEach(memberId => {
            if (memberId !== socket.id) {
              io.to(memberId).emit('received-gift', { giftType, fromTgId, fromName, mode: 'group' });
            }
          });
          db.logGift({ fromTgId, toTgId: 'group:' + roomId, giftType, mode: 'group' });
        }
      } else {
        // 1-on-1 mode
        let targetSocketId = data.peerSocketId || matchmaking.getPeer(socket.id);
        if (targetSocketId) {
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          const toTgId = targetSocket ? targetSocket.handshake.query.tgId : data.toTgId;
          io.to(targetSocketId).emit('received-gift', { giftType, fromTgId, fromName, mode: '1on1' });
          db.logGift({ fromTgId, toTgId, giftType, mode: '1on1' });
        }
      }
    });

    // Report User
    socket.on('report-user', (data) => {
      const reporterTgId = socket.handshake.query.tgId;
      const targetTgId = data.targetTgId;
      const targetUser = db.getUser(targetTgId);
      const targetName = targetUser ? targetUser.firstName : 'Noma\'lum';
      
      const { sendToAdmins } = require('../bot/bot');
      sendToAdmins(`⚠️ **SHIKOYAT!**\n\nFoydalanuvchi: ${data.fromName || reporterTgId}\nShikoyat qildi: ${targetName} (ID: ${targetTgId})\n\nBu foydalanuvchini bloklash uchun pastdagi tugmani bosing:`, {
        reply_markup: {
          inline_keyboard: [[ { text: "🚫 Ban Qilish (Bloklash)", callback_data: `ban_user_${targetTgId}` } ]]
        }
      });
    });

    // Group Kick User (Group Creator OR EGA can kick members, BUT EGA CAN NEVER BE KICKED)
    socket.on('group-kick-user', (data) => {
      const senderTgId = String(socket.handshake.query.tgId || '');
      const config = require('../config');
      const isEga = config.ADMIN_IDS.includes(senderTgId);
      const isCreator = matchmaking.isRoomCreator(socket.id);

      if (!isEga && !isCreator) {
        socket.emit('action-denied', { message: "Faqat guruh admini yoki EGA guruhdan chiqara oladi!" });
        return;
      }

      const targetSocketId = data.targetSocketId;
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        const targetTgId = String(targetSocket.handshake.query.tgId || '');
        if (config.ADMIN_IDS.includes(targetTgId)) {
          socket.emit('action-denied', { message: "👑 EGA guruhdan chopilmaydi!" });
          return;
        }

        targetSocket.emit('kicked-from-group');
        const result = matchmaking.leaveGroupRoom(targetSocketId);
        if (result) {
          result.remainingMembers.forEach(memId => {
            io.to(memId).emit('group-peer-left', { peerSocketId: targetSocketId });
          });
        }
      }
    });

    // Remote Mute / Unmute Mic (Group Creator OR EGA, BUT EGA MIC CAN NEVER BE MUTED BY OTHERS)
    socket.on('group-mute-remote-user', (data) => {
      const senderTgId = String(socket.handshake.query.tgId || '');
      const config = require('../config');
      const isEga = config.ADMIN_IDS.includes(senderTgId);
      const isCreator = matchmaking.isRoomCreator(socket.id);

      if (!isEga && !isCreator) {
        socket.emit('action-denied', { message: "Faqat guruh admini yoki EGA ovozni boshqara oladi!" });
        return;
      }

      const targetSocketId = data.targetSocketId;
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        const targetTgId = String(targetSocket.handshake.query.tgId || '');
        if (config.ADMIN_IDS.includes(targetTgId)) {
          socket.emit('action-denied', { message: "👑 EGA mikrofoni o'chirilmaydi!" });
          return;
        }

        targetSocket.emit('remote-mic-force-toggle', { isMuted: !!data.isMuted });
      }
    });

    // Skip Peer
    socket.on('skip-peer', (data) => {
      const { tgId, profile } = data;
      handleCallEnd(socket.id);

      const peerSocketId = matchmaking.endCall(socket.id);
      if (peerSocketId) {
        io.to(peerSocketId).emit('peer-left', { reason: 'skipped' });
      }

      if (tgId && profile) {
        const result = matchmaking.addToQueue(socket.id, tgId, profile);
        if (result.matched) {
          const newPeerSocketId = result.peerSocketId;
          const now = Date.now();
          socketCallStartTime.set(socket.id, now);
          socketCallStartTime.set(newPeerSocketId, now);

          const myProfile = db.getUser(tgId) || profile;
          const newPeerSocket = io.sockets.sockets.get(newPeerSocketId);
          const newPeerTgId = newPeerSocket ? newPeerSocket.handshake.query.tgId : null;
          const newPeerProfile = newPeerTgId ? db.getUser(newPeerTgId) : null;

          socket.emit('match-found', {
            peerSocketId: newPeerSocketId,
            isInitiator: true,
            peerProfile: newPeerProfile || { firstName: 'Suhbatdosh', age: 20, hobbies: [] }
          });

          io.to(newPeerSocketId).emit('match-found', {
            peerSocketId: socket.id,
            isInitiator: false,
            peerProfile: myProfile
          });
        } else {
          socket.emit('searching', { status: 'looking_for_peer' });
        }
      }
    });

    // End Call
    socket.on('end-call', () => {
      handleCallEnd(socket.id);
      const peerSocketId = matchmaking.endCall(socket.id);
      if (peerSocketId) {
        handleCallEnd(peerSocketId);
        io.to(peerSocketId).emit('peer-left', { reason: 'ended' });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      
      const tgId = socket.handshake.query.tgId;
      if (tgId && connectedUsers.get(String(tgId)) === socket.id) {
        connectedUsers.delete(String(tgId));
      }

      handleCallEnd(socket.id);
      matchmaking.leaveGroupRoom(socket.id);
      const peerSocketId = matchmaking.endCall(socket.id);
      if (peerSocketId) {
        io.to(peerSocketId).emit('peer-left', { reason: 'disconnected' });
      }
    });

    function handleCallEnd(sId) {
      if (socketCallStartTime.has(sId)) {
        const start = socketCallStartTime.get(sId);
        const durationSec = Math.floor((Date.now() - start) / 1000);
        if (durationSec > 1) {
          db.recordCall(durationSec);
        }
        socketCallStartTime.delete(sId);
      }
    }
  });
};

function disconnectUser(tgId) {
  const socketId = connectedUsers.get(String(tgId));
  if (socketId && ioInstance) {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('banned');
      socket.disconnect(true);
    }
  }
}

module.exports = { setupWebRTCSignaling, connectedUsers, disconnectUser };
