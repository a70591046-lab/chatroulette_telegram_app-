class WebRTCManager {
  constructor(config) {
    this.iceServers = config.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.groupConnections = new Map();
    this.groupRemoteStreams = new Map();
    this.facingMode = 'user';
    this.isCameraOn = true;
    this.isMicOn = true;
    this.hasPermission = localStorage.getItem('media_permission_granted') === 'true';

    this.onLocalStreamReady = null;
    this.onRemoteStreamReady = null;
    this.onIceCandidate = null;
    this.onGroupRemoteTrack = null;
  }

  getGroupRemoteStream(targetSocketId) {
    return this.groupRemoteStreams.get(targetSocketId) || null;
  }

  async initLocalStream(forceRefresh = false) {
    // If stream is active and tracks are live, reuse it immediately
    if (!forceRefresh && this.localStream && this.localStream.active) {
      const vTrack = this.localStream.getVideoTracks()[0];
      const aTrack = this.localStream.getAudioTracks()[0];
      if (vTrack && vTrack.readyState === 'live' && aTrack && aTrack.readyState === 'live') {
        vTrack.enabled = this.isCameraOn;
        aTrack.enabled = this.isMicOn;
        if (this.onLocalStreamReady) this.onLocalStreamReady(this.localStream);
        return this.localStream;
      }
    }

    // Stop old tracks if any to release camera hardware
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => {
        try { t.stop(); } catch(e) {}
      });
      this.localStream = null;
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.hasPermission = true;
      localStorage.setItem('media_permission_granted', 'true');

      this.localStream.getVideoTracks().forEach(t => t.enabled = this.isCameraOn);
      this.localStream.getAudioTracks().forEach(t => t.enabled = this.isMicOn);

      if (this.onLocalStreamReady) this.onLocalStreamReady(this.localStream);

      const localVid = document.getElementById('localVideo');
      if (localVid) {
        localVid.srcObject = null;
        localVid.srcObject = this.localStream;
        localVid.muted = true;
        localVid.play().catch(() => {});
      }

      return this.localStream;
    } catch (err) {
      console.warn('Fallback getUserMedia attempt:', err);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        this.hasPermission = true;
        localStorage.setItem('media_permission_granted', 'true');

        this.localStream.getVideoTracks().forEach(t => t.enabled = this.isCameraOn);
        this.localStream.getAudioTracks().forEach(t => t.enabled = this.isMicOn);

        if (this.onLocalStreamReady) this.onLocalStreamReady(this.localStream);

        const localVid = document.getElementById('localVideo');
        if (localVid) {
          localVid.srcObject = null;
          localVid.srcObject = this.localStream;
          localVid.muted = true;
          localVid.play().catch(() => {});
        }

        return this.localStream;
      } catch (e) {
        console.warn('Permission not yet granted by user:', e.message);
        this.hasPermission = false;
        return null;
      }
    }
  }

  async ensureLocalStream(force = false) {
    if (force || !this.localStream || !this.localStream.active) {
      await this.initLocalStream(true);
    } else {
      const vTrack = this.localStream.getVideoTracks()[0];
      const aTrack = this.localStream.getAudioTracks()[0];
      if (!vTrack || vTrack.readyState !== 'live' || !aTrack || aTrack.readyState !== 'live') {
        await this.initLocalStream(true);
      }
    }
    return this.localStream;
  }

  // 1-on-1 Mode Connection
  createPeerConnection() {
    // Close old connections without killing group ones
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
    this.remoteStream = new MediaStream();

    // Add local tracks — MUST happen before creating offer/answer
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          if (track.readyState === 'live') {
            this.peerConnection.addTrack(track, this.localStream);
          }
        } catch(e) {
          console.warn('[WebRTC] addTrack error:', e);
        }
      });
    }

    this.peerConnection.ontrack = (event) => {
      const incomingStream = (event.streams && event.streams[0]) ? event.streams[0] : null;
      if (incomingStream) {
        incomingStream.getTracks().forEach(track => {
          if (!this.remoteStream.getTracks().find(t => t.id === track.id)) {
            this.remoteStream.addTrack(track);
          }
        });
      } else if (event.track) {
        if (!this.remoteStream.getTracks().find(t => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }
      }

      const remoteVid = document.getElementById('remoteVideo');
      if (remoteVid) {
        const streamToUse = incomingStream || this.remoteStream;
        remoteVid.srcObject = null; // Re-trigger decoder
        remoteVid.srcObject = streamToUse;
        remoteVid.muted = false;
        remoteVid.play().catch(e => console.warn('[WebRTC] remoteVideo play error:', e));
      }

      if (this.onRemoteStreamReady) this.onRemoteStreamReady(this.remoteStream);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('[WebRTC] Connection state:', state);
      if (state === 'disconnected' || state === 'failed') {
        console.log('[WebRTC] Peer disconnected abruptly. Auto-skipping...');
        if (typeof window.skipPeer === 'function') window.skipPeer();
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('[WebRTC] ICE Connection state:', state);
      if (state === 'disconnected' || state === 'failed') {
        console.log('[WebRTC] ICE Connection failed. Auto-skipping...');
        if (typeof window.skipPeer === 'function') window.skipPeer();
      }
    };

    return this.peerConnection;
  }

  async createOffer() {
    await this.ensureLocalStream();
    this.createPeerConnection();
    const offer = await this.peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(sdp) {
    await this.ensureLocalStream();
    this.createPeerConnection();
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(sdp) {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  async handleIceCandidate(candidate) {
    if (this.peerConnection && candidate) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('ICE error:', err);
      }
    }
  }

  // Group Mesh Connections
  createGroupPeerConnection(targetSocketId, onIce) {
    if (this.groupConnections.has(targetSocketId)) {
      this.groupConnections.get(targetSocketId).close();
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    let remoteMediaStream = this.groupRemoteStreams.get(targetSocketId);
    if (!remoteMediaStream) {
      remoteMediaStream = new MediaStream();
      this.groupRemoteStreams.set(targetSocketId, remoteMediaStream);
    }

    // Add local tracks — must happen before offer/answer
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try { pc.addTrack(track, this.localStream); } catch(e) {}
      });
    }

    pc.ontrack = (event) => {
      const incomingStream = (event.streams && event.streams[0]) ? event.streams[0] : null;
      if (incomingStream) {
        incomingStream.getTracks().forEach(t => {
          if (!remoteMediaStream.getTracks().find(x => x.id === t.id)) {
            remoteMediaStream.addTrack(t);
          }
        });
      } else if (event.track) {
        if (!remoteMediaStream.getTracks().find(x => x.id === event.track.id)) {
          remoteMediaStream.addTrack(event.track);
        }
      }

      // Bind directly to the video element
      const vidEl = document.getElementById(`group_vid_${targetSocketId}`);
      if (vidEl) {
        const streamToUse = (incomingStream && incomingStream.getVideoTracks().length > 0) ? incomingStream : remoteMediaStream;
        vidEl.srcObject = null; // Re-trigger decoder
        vidEl.srcObject = streamToUse;
        vidEl.muted = false;
        vidEl.play().catch(e => console.warn('[Group] Remote video play:', e));
      }

      if (this.onGroupRemoteTrack) {
        this.onGroupRemoteTrack(targetSocketId, remoteMediaStream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && onIce) {
        onIce(targetSocketId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Group] ${targetSocketId} state:`, pc.connectionState);
    };

    this.groupConnections.set(targetSocketId, pc);
    return pc;
  }

  async createGroupOffer(targetSocketId, onIce) {
    await this.ensureLocalStream();
    const pc = this.createGroupPeerConnection(targetSocketId, onIce);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    return offer;
  }

  async handleGroupOffer(targetSocketId, offerSdp, onIce) {
    await this.ensureLocalStream();
    const pc = this.createGroupPeerConnection(targetSocketId, onIce);
    await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }

  async handleGroupAnswer(targetSocketId, answerSdp) {
    const pc = this.groupConnections.get(targetSocketId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
    }
  }

  async handleGroupIceCandidate(targetSocketId, candidate) {
    const pc = this.groupConnections.get(targetSocketId);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Group ICE error:', e);
      }
    }
  }

  toggleCamera() {
    this.isCameraOn = !this.isCameraOn;

    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(t => {
        t.enabled = this.isCameraOn;
      });
    }

    const updatePc = (pc) => {
      if (!pc) return;
      pc.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'video') {
          sender.track.enabled = this.isCameraOn;
        }
      });
    };

    updatePc(this.peerConnection);
    this.groupConnections.forEach(pc => updatePc(pc));

    return this.isCameraOn;
  }

  toggleMic(forceState = null) {
    if (forceState !== null) {
      this.isMicOn = forceState;
    } else {
      this.isMicOn = !this.isMicOn;
    }

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => {
        t.enabled = this.isMicOn;
      });
    }

    const updatePc = (pc) => {
      if (!pc) return;
      pc.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.track.enabled = this.isMicOn;
        }
      });
    };

    updatePc(this.peerConnection);
    this.groupConnections.forEach(pc => updatePc(pc));

    return this.isMicOn;
  }

  async flipCamera() {
    this.facingMode = (this.facingMode === 'user') ? 'environment' : 'user';
    
    if (this.localStream) {
      const oldVidTrack = this.localStream.getVideoTracks()[0];
      if (oldVidTrack) oldVidTrack.stop();
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.facingMode }, frameRate: { ideal: 30, max: 30 } }
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      if (this.localStream && newVideoTrack) {
        const oldTrack = this.localStream.getVideoTracks()[0];
        if (oldTrack) this.localStream.removeTrack(oldTrack);
        this.localStream.addTrack(newVideoTrack);

        const localVid = document.getElementById('localVideo');
        if (localVid) localVid.srcObject = this.localStream;

        if (this.peerConnection) {
          const senders = this.peerConnection.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) await videoSender.replaceTrack(newVideoTrack);
        }

        for (const pc of this.groupConnections.values()) {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) await videoSender.replaceTrack(newVideoTrack);
        }
      }
    } catch (err) {
      console.warn('Camera flip error:', err);
    }
    return this.facingMode;
  }

  async toggleScreenShare() {
    this.isScreenSharing = !this.isScreenSharing;

    if (this.isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Listen for browser "Stop Sharing" button
        screenTrack.onended = () => {
          if (this.isScreenSharing) {
            this.toggleScreenShare(); // revert to camera
          }
        };

        if (this.localStream) {
          const oldTrack = this.localStream.getVideoTracks()[0];
          if (oldTrack) {
            this.localStream.removeTrack(oldTrack);
            oldTrack.stop(); // Stop camera momentarily to free resources
          }
          this.localStream.addTrack(screenTrack);

          const localVid = document.getElementById('localVideo');
          if (localVid) {
            localVid.srcObject = this.localStream;
            localVid.style.transform = 'none'; // Un-mirror screen share
            localVid.play().catch(e => console.warn('Play error:', e));
          }

          if (this.peerConnection) {
            const senders = this.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) await videoSender.replaceTrack(screenTrack);
          }

          for (const pc of this.groupConnections.values()) {
            const senders = pc.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) await videoSender.replaceTrack(screenTrack);
          }
        }
        return true;
      } catch (err) {
        console.warn('Screen share error:', err);
        this.isScreenSharing = false;
        return false;
      }
    } else {
      // Revert to camera
      try {
        if (this.localStream) {
          const oldScreenTrack = this.localStream.getVideoTracks()[0];
          if (oldScreenTrack) oldScreenTrack.stop();
        }

        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: this.facingMode }, frameRate: { ideal: 30, max: 30 } }
        });
        const camTrack = camStream.getVideoTracks()[0];

        if (this.localStream && camTrack) {
          const oldTrack = this.localStream.getVideoTracks()[0];
          if (oldTrack) this.localStream.removeTrack(oldTrack);
          this.localStream.addTrack(camTrack);

          const localVid = document.getElementById('localVideo');
          if (localVid) {
            localVid.srcObject = this.localStream;
            if (this.facingMode === 'user') localVid.style.transform = 'scaleX(-1)';
            else localVid.style.transform = 'none';
            localVid.play().catch(e => console.warn('Play error:', e));
          }

          if (this.peerConnection) {
            const senders = this.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) await videoSender.replaceTrack(camTrack);
          }

          for (const pc of this.groupConnections.values()) {
            const senders = pc.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) await videoSender.replaceTrack(camTrack);
          }
        }
        return false;
      } catch (err) {
        console.warn('Revert to camera error:', err);
        return false;
      }
    }
  }

  closePeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.groupConnections.forEach((pc) => pc.close());
    this.groupConnections.clear();
    this.groupRemoteStreams.clear();
  }

  closeGroupPeerConnection(targetSocketId) {
    const pc = this.groupConnections.get(targetSocketId);
    if (pc) {
      pc.close();
      this.groupConnections.delete(targetSocketId);
    }
    this.groupRemoteStreams.delete(targetSocketId);
  }
}
