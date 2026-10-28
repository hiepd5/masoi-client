// =============================================================================
// ĐỘNG CƠ ĐÀM THOẠI WEBRTC P2P MESH ZERO-LEAK ($0/THÁNG — BẢN LỀ V4.2)
// - Tự động kích hoạt < 300ms khi LiveKit Cloud hết Quota / lỗi kết nối / thiếu khóa
// - Chuẩn nén Opus 16kbps Mono + DTX (0 kbps khi im lặng) + Google STUN miễn phí
// - Giữ kết nối xuyên suốt Sảnh Chờ 3D <-> Trong Trận <-> Ván Mới (0ms rớt mạch)
// - Hỗ trợ Listen-Only mượt mà cho máy không cắm Mic / từ chối quyền / người đã chết
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

export const VOICE_CAPTURE_OPTIONS = {
  channelCount: 1,
  sampleRate: 24000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function tuneOpusSdpForVoice(sdp) {
  if (!sdp || typeof sdp !== "string") return sdp;
  const lines = sdp.split("\r\n");
  let opusPt = null;
  for (const line of lines) {
    const m = /^a=rtpmap:(\d+)\s+opus\/48000/i.exec(line);
    if (m) {
      opusPt = m[1];
      break;
    }
  }
  if (!opusPt) return sdp;

  let patchedFmtp = false;
  const out = lines.map((line) => {
    if (line.startsWith(`a=fmtp:${opusPt} `)) {
      patchedFmtp = true;
      let extra = "";
      if (!/maxaveragebitrate=/i.test(line)) extra += ";maxaveragebitrate=16000";
      if (!/usedtx=/i.test(line)) extra += ";usedtx=1";
      if (!/(^|;)stereo=/i.test(line)) extra += ";stereo=0;sprop-stereo=0";
      return line + extra;
    }
    return line;
  });

  if (!patchedFmtp) {
    const rtpmapIdx = out.findIndex((l) => l.startsWith(`a=rtpmap:${opusPt} `));
    if (rtpmapIdx >= 0) {
      out.splice(
        rtpmapIdx + 1,
        0,
        `a=fmtp:${opusPt} minptime=10;useinbandfec=1;maxaveragebitrate=16000;usedtx=1;stereo=0;sprop-stereo=0`
      );
    }
  }

  return out.join("\r\n");
}

export function useP2PVoiceMesh({
  active = false,
  socketRef,
  roomCode,
  myFallbackId = null,
  myFallbackName = "Bạn",
  canPublish = true,
  wantTransmitNow = false,
  volumeMap = {},
  mcDuckingActive = false,
  isSuppressedForRecap = false,
  shouldHearIdentity,
}) {
  const [connected, setConnected] = useState(false);
  const [selfPeer, setSelfPeer] = useState(null);
  const [remotePeers, setRemotePeers] = useState([]);
  const [speakingIds, setSpeakingIds] = useState([]);
  const [micWarning, setMicWarning] = useState(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const peersMetaRef = useRef(new Map()); // identity -> { identity, displayName, canPublish, isSpectator }
  const pcMapRef = useRef(new Map()); // identity -> { pc, transceiver, makingOffer, ignoreOffer, pendingCandidates, audioEl }
  const localStreamRef = useRef(null);
  const iceServersRef = useRef(FALLBACK_ICE_SERVERS);
  const selfIdentityRef = useRef(myFallbackId);
  const activeRef = useRef(active);
  const wantTransmitRef = useRef(wantTransmitNow);
  const canPublishRef = useRef(canPublish);
  const shouldHearRef = useRef(shouldHearIdentity);
  const volumeMapRef = useRef(volumeMap);
  const duckFactorRef = useRef(1);

  const audioCtxRef = useRef(null);
  const analyserTimerRef = useRef(null);
  const localSpeakingRef = useRef(false);
  const lastVoiceDetectedAtRef = useRef(0);
  const serverSpeakingSetRef = useRef(new Set());

  activeRef.current = active;
  wantTransmitRef.current = wantTransmitNow;
  canPublishRef.current = canPublish;
  shouldHearRef.current = shouldHearIdentity;
  volumeMapRef.current = volumeMap;
  duckFactorRef.current = isSuppressedForRecap ? 0 : mcDuckingActive ? 0.6 : 1;

  const syncRemotePeersState = useCallback(() => {
    setRemotePeers(Array.from(peersMetaRef.current.values()));
  }, []);

  const recomputeVisibleSpeakers = useCallback(() => {
    const out = [];
    const myIdNow = selfIdentityRef.current;
    if (localSpeakingRef.current && wantTransmitRef.current && myIdNow) {
      out.push(myIdNow);
    }
    for (const id of serverSpeakingSetRef.current.values()) {
      if (id === myIdNow) continue;
      const userVol = volumeMapRef.current?.[id] ?? 1;
      const canHear =
        !isSuppressedForRecap &&
        userVol > 0 &&
        (typeof shouldHearRef.current === "function" ? shouldHearRef.current(id) : true);
      if (canHear && !out.includes(id)) {
        out.push(id);
      }
    }
    out.sort();
    setSpeakingIds((prev) => {
      if (prev.length === out.length && prev.every((v, i) => v === out[i])) return prev;
      return out;
    });
  }, [isSuppressedForRecap]);

  const applyAllAudioElementGains = useCallback(() => {
    const factor = duckFactorRef.current;
    for (const [peerId, entry] of pcMapRef.current.entries()) {
      const audioEl = entry?.audioEl;
      if (!audioEl) continue;
      const userVol = volumeMapRef.current?.[peerId] ?? 1;
      const allowed = Boolean(
        factor > 0 &&
          userVol > 0 &&
          (typeof shouldHearRef.current === "function" ? shouldHearRef.current(peerId) : true)
      );
      audioEl.muted = !allowed;
      audioEl.volume = allowed ? Math.max(0, Math.min(1, userVol * factor)) : 0;
      if (allowed && audioEl.paused && audioEl.srcObject) {
        audioEl.play().catch((err) => {
          if (err?.name === "NotAllowedError") {
            setAutoplayBlocked(true);
          }
        });
      }
    }
    recomputeVisibleSpeakers();
  }, [recomputeVisibleSpeakers]);

  useEffect(() => {
    applyAllAudioElementGains();
  }, [volumeMap, mcDuckingActive, isSuppressedForRecap, shouldHearIdentity, applyAllAudioElementGains]);

  const resumePlayback = useCallback(() => {
    setAutoplayBlocked(false);
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    for (const entry of pcMapRef.current.values()) {
      if (entry?.audioEl && entry.audioEl.srcObject) {
        entry.audioEl.play().catch(() => {});
      }
    }
  }, []);

  const stopLocalAnalyser = useCallback(() => {
    if (analyserTimerRef.current) {
      clearInterval(analyserTimerRef.current);
      analyserTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }
    if (localSpeakingRef.current) {
      localSpeakingRef.current = false;
      socketRef?.current?.emit("voice:speaking", { speaking: false });
      recomputeVisibleSpeakers();
    }
  }, [socketRef, recomputeVisibleSpeakers]);

  const stopLocalHardwareStream = useCallback(() => {
    stopLocalAnalyser();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      localStreamRef.current = null;
    }
    for (const entry of pcMapRef.current.values()) {
      try {
        entry.transceiver?.sender?.replaceTrack?.(null)?.catch?.(() => {});
      } catch {
        // ignore
      }
    }
  }, [stopLocalAnalyser]);

  const startLocalAnalyser = useCallback(
    (stream) => {
      stopLocalAnalyser();
      const AudioContextCtor =
        typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
      if (!AudioContextCtor || !stream) return;

      try {
        const ctx = new AudioContextCtor();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.55;
        source.connect(analyser);
        audioCtxRef.current = ctx;

        const buf = new Uint8Array(analyser.fftSize);
        analyserTimerRef.current = setInterval(() => {
          if (!activeRef.current || !wantTransmitRef.current || !canPublishRef.current) {
            if (localSpeakingRef.current) {
              localSpeakingRef.current = false;
              socketRef?.current?.emit("voice:speaking", { speaking: false });
              recomputeVisibleSpeakers();
            }
            return;
          }
          if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
            return;
          }
          analyser.getByteTimeDomainData(buf);
          let sumSq = 0;
          for (let i = 0; i < buf.length; i += 1) {
            const norm = (buf[i] - 128) / 128;
            sumSq += norm * norm;
          }
          const rms = Math.sqrt(sumSq / buf.length);
          const now = Date.now();
          if (rms > 0.018) {
            lastVoiceDetectedAtRef.current = now;
          }
          const nextSpeaking = rms > 0.018 || now - lastVoiceDetectedAtRef.current < 320;
          if (nextSpeaking !== localSpeakingRef.current) {
            localSpeakingRef.current = nextSpeaking;
            socketRef?.current?.emit("voice:speaking", { speaking: nextSpeaking });
            recomputeVisibleSpeakers();
          }
        }, 140);
      } catch {
        // WebAudio analyser optional fallback
      }
    },
    [stopLocalAnalyser, socketRef, recomputeVisibleSpeakers]
  );

  const ensureLocalHardwareMic = useCallback(async () => {
    if (!activeRef.current || !canPublishRef.current) {
      stopLocalHardwareStream();
      return null;
    }
    const existingTrack = localStreamRef.current?.getAudioTracks?.()[0];
    if (existingTrack && existingTrack.readyState === "live") {
      existingTrack.enabled = Boolean(wantTransmitRef.current);
      return existingTrack;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicWarning("Trình duyệt không hỗ trợ thu âm Micro — đang ở chế độ Chỉ Nghe.");
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: VOICE_CAPTURE_OPTIONS,
        video: false,
      });
      if (!activeRef.current || !canPublishRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      localStreamRef.current = stream;
      setMicWarning(null);
      const track = stream.getAudioTracks()[0] || null;
      if (track) {
        track.enabled = Boolean(wantTransmitRef.current);
        for (const entry of pcMapRef.current.values()) {
          try {
            entry.transceiver?.sender?.replaceTrack?.(track)?.catch?.(() => {});
          } catch {
            // ignore
          }
        }
        startLocalAnalyser(stream);
      }
      return track;
    } catch (err) {
      const code = String(err?.name || "");
      if (code === "NotAllowedError" || code === "PermissionDeniedError") {
        setMicWarning("Bạn đang chặn quyền Micro — vẫn nghe mọi người bình thường (Chỉ Nghe).");
      } else if (code === "NotFoundError" || code === "DevicesNotFoundError") {
        setMicWarning("Không tìm thấy thiết bị Micro — đang ở chế độ Chỉ Nghe.");
      } else {
        setMicWarning("Không mở được Micro phần cứng — đang ở chế độ Chỉ Nghe.");
      }
      return null;
    }
  }, [stopLocalHardwareStream, startLocalAnalyser]);

  const closePeerConnection = useCallback((peerIdentity) => {
    const entry = pcMapRef.current.get(peerIdentity);
    if (!entry) return;
    pcMapRef.current.delete(peerIdentity);
    try {
      if (entry.audioEl) {
        entry.audioEl.pause();
        entry.audioEl.srcObject = null;
        entry.audioEl.remove?.();
      }
    } catch {
      // ignore
    }
    try {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onnegotiationneeded = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.close();
    } catch {
      // ignore
    }
  }, []);

  const closeAllPeers = useCallback(() => {
    for (const id of Array.from(pcMapRef.current.keys())) {
      closePeerConnection(id);
    }
    peersMetaRef.current.clear();
    serverSpeakingSetRef.current.clear();
    setRemotePeers([]);
    setSpeakingIds([]);
  }, [closePeerConnection]);

  const getOrCreatePeerConnection = useCallback(
    (peerIdentity, { initiateOffer = false } = {}) => {
      if (!peerIdentity || peerIdentity === selfIdentityRef.current) return null;
      const existing = pcMapRef.current.get(peerIdentity);
      if (existing) return existing;
      if (typeof RTCPeerConnection === "undefined") return null;

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current || FALLBACK_ICE_SERVERS,
      });

      const audioEl = typeof document !== "undefined" ? document.createElement("audio") : null;
      if (audioEl) {
        audioEl.autoplay = true;
        audioEl.playsInline = true;
      }

      const currentTrack = localStreamRef.current?.getAudioTracks?.()[0] || null;
      let transceiver = null;
      try {
        transceiver = pc.addTransceiver(currentTrack || "audio", {
          direction: "sendrecv",
        });
      } catch {
        if (currentTrack && localStreamRef.current) {
          pc.addTrack(currentTrack, localStreamRef.current);
        }
      }

      const entry = {
        pc,
        transceiver,
        makingOffer: false,
        ignoreOffer: false,
        pendingCandidates: [],
        audioEl,
      };
      pcMapRef.current.set(peerIdentity, entry);

      const sendOffer = async () => {
        if (!activeRef.current || entry.makingOffer) return;
        try {
          entry.makingOffer = true;
          const offer = await pc.createOffer();
          const tunedSdp = tuneOpusSdpForVoice(offer.sdp);
          await pc.setLocalDescription({ type: offer.type, sdp: tunedSdp });
          socketRef?.current?.emit("voice:signal", {
            targetIdentity: peerIdentity,
            signal: {
              type: "offer",
              sdp: pc.localDescription.sdp,
            },
          });
        } catch {
          // ignore transient signaling glare
        } finally {
          entry.makingOffer = false;
        }
      };

      pc.onicecandidate = (ev) => {
        if (!ev.candidate || !activeRef.current) return;
        socketRef?.current?.emit("voice:signal", {
          targetIdentity: peerIdentity,
          signal: {
            type: "candidate",
            candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate,
          },
        });
      };

      pc.ontrack = (ev) => {
        if (!entry.audioEl) return;
        const remoteStream =
          ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
        if (entry.audioEl.srcObject !== remoteStream) {
          entry.audioEl.srcObject = remoteStream;
        }
        applyAllAudioElementGains();
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" && activeRef.current) {
          const amInitiator = String(selfIdentityRef.current || "") < String(peerIdentity);
          if (amInitiator) {
            try {
              pc.restartIce?.();
            } catch {
              // ignore
            }
            sendOffer();
          }
        }
      };

      if (initiateOffer) {
        sendOffer();
      }

      return entry;
    },
    [socketRef, applyAllAudioElementGains]
  );

  // Đồng bộ bật/tắt đường truyền Micro tức thì (0ms cho Push-to-Talk & Chuyển Đêm/Ngày)
  useEffect(() => {
    if (!active) return;
    if (!canPublish) {
      stopLocalHardwareStream();
      return;
    }
    const track = localStreamRef.current?.getAudioTracks?.()[0];
    if (track && track.readyState === "live") {
      track.enabled = Boolean(wantTransmitNow);
      if (!wantTransmitNow && localSpeakingRef.current) {
        localSpeakingRef.current = false;
        socketRef?.current?.emit("voice:speaking", { speaking: false });
        recomputeVisibleSpeakers();
      }
    } else if (wantTransmitNow) {
      ensureLocalHardwareMic();
    }
  }, [
    active,
    canPublish,
    wantTransmitNow,
    stopLocalHardwareStream,
    ensureLocalHardwareMic,
    socketRef,
    recomputeVisibleSpeakers,
  ]);

  // Vòng đời tham gia / duy trì / dọn dẹp P2P Mesh theo phòng
  useEffect(() => {
    const socket = socketRef?.current;
    if (!active || !socket || !roomCode) {
      setConnected(false);
      stopLocalHardwareStream();
      closeAllPeers();
      return undefined;
    }

    let cancelled = false;

    const joinMesh = async () => {
      if (canPublishRef.current) {
        await ensureLocalHardwareMic();
      }
      if (cancelled) return;

      socket.emit("voice:join", {}, (res) => {
        if (cancelled || !res?.ok) return;
        if (Array.isArray(res.iceServers) && res.iceServers.length > 0) {
          iceServersRef.current = res.iceServers;
        }
        const myMeta = res.self || {
          identity: myFallbackId,
          displayName: myFallbackName,
          canPublish: canPublishRef.current,
        };
        selfIdentityRef.current = myMeta.identity;
        setSelfPeer(myMeta);
        setConnected(true);

        peersMetaRef.current.clear();
        const list = Array.isArray(res.peers) ? res.peers : [];
        for (const p of list) {
          if (!p?.identity || p.identity === myMeta.identity) continue;
          peersMetaRef.current.set(p.identity, p);
          const shouldInitiate = String(myMeta.identity) < String(p.identity);
          getOrCreatePeerConnection(p.identity, { initiateOffer: shouldInitiate });
        }
        syncRemotePeersState();
      });
    };

    const handlePeerJoined = ({ peer } = {}) => {
      if (cancelled || !peer?.identity || peer.identity === selfIdentityRef.current) return;
      peersMetaRef.current.set(peer.identity, peer);
      syncRemotePeersState();
      const shouldInitiate = String(selfIdentityRef.current || "") < String(peer.identity);
      getOrCreatePeerConnection(peer.identity, { initiateOffer: shouldInitiate });
    };

    const handlePeerUpdated = ({ peer } = {}) => {
      if (cancelled || !peer?.identity || peer.identity === selfIdentityRef.current) return;
      peersMetaRef.current.set(peer.identity, peer);
      syncRemotePeersState();
    };

    const handlePeerLeft = ({ identity } = {}) => {
      if (!identity) return;
      peersMetaRef.current.delete(identity);
      serverSpeakingSetRef.current.delete(identity);
      closePeerConnection(identity);
      syncRemotePeersState();
      recomputeVisibleSpeakers();
    };

    const handleSignal = async ({ fromIdentity, fromName, canPublish: peerCanPub, signal } = {}) => {
      if (cancelled || !fromIdentity || !signal) return;
      if (!peersMetaRef.current.has(fromIdentity)) {
        peersMetaRef.current.set(fromIdentity, {
          identity: fromIdentity,
          displayName: fromName || fromIdentity.slice(0, 8),
          canPublish: Boolean(peerCanPub),
          isSpectator: String(fromIdentity).startsWith("spec_"),
        });
        syncRemotePeersState();
      }

      const entry = getOrCreatePeerConnection(fromIdentity, { initiateOffer: false });
      if (!entry) return;
      const { pc } = entry;
      const isPolite = String(selfIdentityRef.current || "") > String(fromIdentity);

      try {
        if (signal.type === "offer") {
          const offerCollision = entry.makingOffer || pc.signalingState !== "stable";
          entry.ignoreOffer = !isPolite && offerCollision;
          if (entry.ignoreOffer) return;

          await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          if (entry.transceiver && entry.transceiver.direction !== "sendrecv") {
            try {
              entry.transceiver.direction = "sendrecv";
            } catch {
              // ignore
            }
          }
          while (entry.pendingCandidates.length > 0) {
            const c = entry.pendingCandidates.shift();
            await pc.addIceCandidate(c).catch(() => {});
          }
          const answer = await pc.createAnswer();
          const tunedAnswerSdp = tuneOpusSdpForVoice(answer.sdp);
          await pc.setLocalDescription({ type: "answer", sdp: tunedAnswerSdp });
          socket.emit("voice:signal", {
            targetIdentity: fromIdentity,
            signal: { type: "answer", sdp: pc.localDescription.sdp },
          });
        } else if (signal.type === "answer") {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
            while (entry.pendingCandidates.length > 0) {
              const c = entry.pendingCandidates.shift();
              await pc.addIceCandidate(c).catch(() => {});
            }
          }
        } else if (signal.type === "candidate" && signal.candidate) {
          if (entry.ignoreOffer) return;
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(signal.candidate).catch(() => {});
          } else {
            entry.pendingCandidates.push(signal.candidate);
          }
        }
      } catch {
        // ignore transient WebRTC state mismatch
      }
    };

    const handleSpeakingUpdate = ({ speakingIds: nextIds } = {}) => {
      serverSpeakingSetRef.current = new Set(Array.isArray(nextIds) ? nextIds : []);
      recomputeVisibleSpeakers();
    };

    const handleSocketReconnect = () => {
      if (!cancelled && activeRef.current) {
        joinMesh();
      }
    };

    const handleVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        resumePlayback();
      }
    };

    socket.on("voice:peer_joined", handlePeerJoined);
    socket.on("voice:peer_updated", handlePeerUpdated);
    socket.on("voice:peer_left", handlePeerLeft);
    socket.on("voice:signal", handleSignal);
    socket.on("voice:speaking_update", handleSpeakingUpdate);
    socket.on("connect", handleSocketReconnect);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVis);
    }

    joinMesh();

    return () => {
      cancelled = true;
      socket.off("voice:peer_joined", handlePeerJoined);
      socket.off("voice:peer_updated", handlePeerUpdated);
      socket.off("voice:peer_left", handlePeerLeft);
      socket.off("voice:signal", handleSignal);
      socket.off("voice:speaking_update", handleSpeakingUpdate);
      socket.off("connect", handleSocketReconnect);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVis);
      }
      socket.emit("voice:leave");
      stopLocalHardwareStream();
      closeAllPeers();
      setConnected(false);
    };
  }, [
    active,
    roomCode,
    socketRef,
    myFallbackId,
    myFallbackName,
    ensureLocalHardwareMic,
    getOrCreatePeerConnection,
    closePeerConnection,
    closeAllPeers,
    stopLocalHardwareStream,
    syncRemotePeersState,
    recomputeVisibleSpeakers,
    resumePlayback,
  ]);

  // Đồng bộ lại quyền canPublish trên Server khi người chết bước sang ván mới / Khán giả lên ghế
  useEffect(() => {
    const socket = socketRef?.current;
    if (!active || !connected || !socket) return;
    socket.emit("voice:sync_peers", {}, (res) => {
      if (res?.ok && res.self) {
        selfIdentityRef.current = res.self.identity;
        setSelfPeer(res.self);
      }
      if (Array.isArray(res?.peers)) {
        for (const p of res.peers) {
          if (p?.identity && p.identity !== selfIdentityRef.current) {
            peersMetaRef.current.set(p.identity, p);
          }
        }
        syncRemotePeersState();
      }
    });
    if (canPublish) {
      ensureLocalHardwareMic();
    } else {
      stopLocalHardwareStream();
    }
  }, [
    active,
    connected,
    canPublish,
    socketRef,
    syncRemotePeersState,
    ensureLocalHardwareMic,
    stopLocalHardwareStream,
  ]);

  return {
    connected,
    selfPeer,
    remotePeers,
    speakingIds,
    micWarning,
    clearMicWarning: () => setMicWarning(null),
    autoplayBlocked,
    resumePlayback,
  };
}
