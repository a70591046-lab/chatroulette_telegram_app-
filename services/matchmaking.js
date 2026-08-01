class MatchmakingService {
  constructor() {
    this.waitingQueue = []; // array of { socketId, tgId, gender, targetGender, hobbies, startTime }
    this.activePairs = new Map(); // socketId -> peerSocketId
    this.groupRooms = new Map(); // roomId -> Set of socketIds
    this.socketGroupRoom = new Map(); // socketId -> roomId
    this.roomCreators = new Map(); // roomId -> creatorSocketId
  }

  addToQueue(socketId, tgId, profile) {
    this.removeFromQueue(socketId);

    const queueItem = {
      socketId,
      tgId: String(tgId || socketId),
      gender: (profile && profile.gender) || 'male',
      targetGender: (profile && profile.targetGender) || 'any',
      hobbies: (profile && profile.hobbies) || [],
      startTime: Date.now()
    };

    const matchSocketId = this.findMatch(queueItem);

    if (matchSocketId) {
      this.removeFromQueue(matchSocketId);
      
      this.activePairs.set(socketId, matchSocketId);
      this.activePairs.set(matchSocketId, socketId);

      return {
        matched: true,
        peerSocketId: matchSocketId
      };
    } else {
      this.waitingQueue.push(queueItem);
      return {
        matched: false
      };
    }
  }

  forceMatch(socketId1, socketId2) {
    this.removeFromQueue(socketId1);
    this.removeFromQueue(socketId2);
    
    this.endCall(socketId1);
    this.endCall(socketId2);

    this.activePairs.set(socketId1, socketId2);
    this.activePairs.set(socketId2, socketId1);
  }

  findMatch(item) {
    for (let i = 0; i < this.waitingQueue.length; i++) {
      const candidate = this.waitingQueue[i];

      if (candidate.socketId === item.socketId) {
        continue;
      }

      const itemMatchesCandidateTarget = candidate.targetGender === 'any' || candidate.targetGender === item.gender;
      const candidateMatchesItemTarget = item.targetGender === 'any' || item.targetGender === item.gender || item.targetGender === candidate.gender;

      if (itemMatchesCandidateTarget && candidateMatchesItemTarget) {
        return candidate.socketId;
      }
    }
    if (this.waitingQueue.length > 0) {
      for (let i = 0; i < this.waitingQueue.length; i++) {
        const candidate = this.waitingQueue[i];
        if (candidate.socketId !== item.socketId) {
          return candidate.socketId;
        }
      }
    }
    return null;
  }

  joinGroupRoom(socketId, tgId, profile) {
    this.removeFromQueue(socketId);
    this.endCall(socketId);

    // Find a group room with less than 4 members or create a new one
    let targetRoomId = null;
    for (const [roomId, members] of this.groupRooms.entries()) {
      if (members.size < 4) {
        targetRoomId = roomId;
        break;
      }
    }

    if (!targetRoomId) {
      targetRoomId = `group_${Date.now()}_${Math.floor(Math.random()*1000)}`;
      this.groupRooms.set(targetRoomId, new Set());
      this.roomCreators.set(targetRoomId, socketId); // First user is Creator / Group Admin!
    }

    const roomMembers = this.groupRooms.get(targetRoomId);
    roomMembers.add(socketId);
    this.socketGroupRoom.set(socketId, targetRoomId);

    const creatorSocketId = this.roomCreators.get(targetRoomId);

    return {
      roomId: targetRoomId,
      creatorSocketId,
      isCreator: creatorSocketId === socketId,
      members: Array.from(roomMembers).filter(id => id !== socketId)
    };
  }

  isRoomCreator(socketId) {
    const roomId = this.socketGroupRoom.get(socketId);
    if (!roomId) return false;
    return this.roomCreators.get(roomId) === socketId;
  }

  getRoomCreator(roomId) {
    return this.roomCreators.get(roomId) || null;
  }

  leaveGroupRoom(socketId) {
    const roomId = this.socketGroupRoom.get(socketId);
    if (roomId && this.groupRooms.has(roomId)) {
      const roomMembers = this.groupRooms.get(roomId);
      roomMembers.delete(socketId);
      this.socketGroupRoom.delete(socketId);

      // If creator leaves, assign next member as creator/admin
      if (this.roomCreators.get(roomId) === socketId) {
        if (roomMembers.size > 0) {
          const nextCreator = Array.from(roomMembers)[0];
          this.roomCreators.set(roomId, nextCreator);
        } else {
          this.roomCreators.delete(roomId);
        }
      }

      if (roomMembers.size === 0) {
        this.groupRooms.delete(roomId);
        this.roomCreators.delete(roomId);
      }
      return { roomId, remainingMembers: Array.from(roomMembers) };
    }
    return null;
  }

  removeFromQueue(socketId) {
    this.waitingQueue = this.waitingQueue.filter(q => q.socketId !== socketId);
  }

  endCall(socketId) {
    const peerSocketId = this.activePairs.get(socketId);
    if (peerSocketId) {
      this.activePairs.delete(socketId);
      this.activePairs.delete(peerSocketId);
    }
    this.removeFromQueue(socketId);
    this.leaveGroupRoom(socketId);
    return peerSocketId;
  }

  getPeer(socketId) {
    return this.activePairs.get(socketId) || null;
  }

  getUserGroupRoom(socketId) {
    return this.socketGroupRoom.get(socketId) || null;
  }

  getGroupRoomMembers(roomId) {
    const members = this.groupRooms.get(roomId);
    return members ? Array.from(members) : [];
  }
}

module.exports = new MatchmakingService();
