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
    this.facingMode = 'user';
    this.isCameraOn = true;
    this.isMicOn = true;
    this.hasPermission = localStorage.getItem('media_permission_granted') === 'true';

    this.onLocalStreamReady = null;
    this.onRemoteStreamReady = null;
    this.onIceCandidate = null;
    this.onGroupRemoteTrack = null;
  }

  async initLocalStream() {
    // If stream is active, reuse it immediately without asking permission again
    if (this.localStream && this.localStream.active) {
      const vTrack = this.localStream.getVideoTracks()[0];
      const aTrack = this.localStream.getAudioTracks()[0];
      if (vTrack && vTrack.readyState === 'live' && aTrack && aTrack.readyState === 'live') {
        if (this.onLocalStreamReady) this.onLocalStreamReady(this.localStream);
        return this.localStream;
      }
    }

    try {
      const constraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 }
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

      if (this.onLocalStreamReady) this.onLocalStreamReady(this.localStream);
      return this.localStream;
    } catch (err) {
      console.warn('Fallback getUserMedia attempt:', err);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        this.hasPermission = true;
        localStorage.setItem('media_permission_granted', 'true');
        if (this.onLocalStreamReady) this.onLocalStreamReady(this.localStream);
        return this.localStream;
      } catch (e) {
        console.warn('Permission not yet granted by user:', e.message);
        this.hasPermission = false;
        // Graceful fallback - DO NOT ALERT OR CRASH!
        return null;
      }
    }
  }

  // 1-on-1 Mode Connection
  createPeerConnection() {
    this.closePeerConnection();

    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
    this.remoteStream = new MediaStream();
    if (this.onRemoteStreamReady) this.onRemoteStreamReady(this.remoteStream);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(track => {
          if (!this.remoteStream.getTracks().includes(track)) {
            this.remoteStream.addTrack(track);
          }
        });
      } else {
        this.remoteStream.addTrack(event.track);
      }

      const remoteVid = document.getElementById('remoteVideo');
      if (remoteVid) {
        remoteVid.srcObject = this.remoteStream;
        remoteVid.muted = false;
        remoteVid.play().catch(e => console.warn('Remote video play error:', e));
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    return this.peerConnection;
  }

  async createOffer() {
    this.createPeerConnection();
    const offer = await this.peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(sdp) {
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
    const remoteMediaStream = new MediaStream();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(t => {
          if (!remoteMediaStream.getTracks().includes(t)) remoteMediaStream.addTrack(t);
        });
      } else {
        remoteMediaStream.addTrack(event.track);
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

    this.groupConnections.set(targetSocketId, pc);
    return pc;
  }

  async createGroupOffer(targetSocketId, onIce) {
    const pc = this.createGroupPeerConnection(targetSocketId, onIce);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    return offer;
  }

  async handleGroupOffer(targetSocketId, offerSdp, onIce) {
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
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.isCameraOn = videoTrack.enabled;
        return this.isCameraOn;
      }
    }
    return false;
  }

  toggleMic() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.isMicOn = audioTrack.enabled;
        return this.isMicOn;
      }
    }
    return false;
  }

  async flipCamera() {
    this.facingMode = (this.facingMode === 'user') ? 'environment' : 'user';
    
    if (this.localStream) {
      const oldVidTrack = this.localStream.getVideoTracks()[0];
      if (oldVidTrack) oldVidTrack.stop();
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.facingMode } },
        audio: true
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

  closePeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.groupConnections.forEach((pc) => pc.close());
    this.groupConnections.clear();
  }
}
