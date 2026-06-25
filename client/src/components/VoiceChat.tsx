import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import {
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { api, assetUrl } from '../lib/api';
import { isDesktopApp } from '../lib/platform';
import { captureScreenStream } from '../lib/screenCapture';
import { applyCameraEncoding, applyScreenShareEncoding } from '../lib/webrtcEncoding';
import { useAuthStore, type User } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { ScreenSourcePicker } from './ScreenSourcePicker';

type ExistingPeer = {
  userId: string;
  socketId: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  user?: RemoteUser | null;
};

type VoiceJoinAck =
  | { ok: true; existingPeers: ExistingPeer[] }
  | { ok: false; error: string };

type RemoteUser = {
  id?: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  systemRole?: string | null;
};

type Participant = {
  socketId: string;
  userId: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  stream: MediaStream | null;
  user: RemoteUser | null;
};

function isSessionDescription(data: unknown): data is RTCSessionDescriptionInit {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.type === 'string';
}

function parseIceServerList(value: string | undefined): RTCIceServer[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((server): server is RTCIceServer => {
      if (!server || typeof server !== 'object') return false;
      const urls = (server as RTCIceServer).urls;
      return typeof urls === 'string' || Array.isArray(urls);
    });
  } catch (err) {
    console.warn('Invalid VITE_RTC_ICE_SERVERS JSON, using bundled defaults.', err);
    return null;
  }
}

function buildIceServers(): RTCIceServer[] {
  const configured = parseIceServerList(import.meta.env.VITE_RTC_ICE_SERVERS as string | undefined);
  if (configured?.length) return configured;

  const stunUrls = (import.meta.env.VITE_RTC_STUN_URLS as string | undefined)
    ?.split(',')
    .map(url => url.trim())
    .filter(Boolean);
  const turnUrls = (import.meta.env.VITE_RTC_TURN_URLS as string | undefined)
    ?.split(',')
    .map(url => url.trim())
    .filter(Boolean);
  const turnUsername = (import.meta.env.VITE_RTC_TURN_USERNAME as string | undefined)?.trim();
  const turnCredential = (import.meta.env.VITE_RTC_TURN_CREDENTIAL as string | undefined)?.trim();

  const servers: RTCIceServer[] = [];

  if (stunUrls?.length) {
    stunUrls.forEach(url => servers.push({ urls: url }));
  }
  servers.push({ urls: 'stun:stun.l.google.com:19302' });
  servers.push({ urls: 'stun:stun1.l.google.com:19302' });

  if (turnUrls?.length && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
    return servers;
  }

  if (turnUrls?.length || turnUsername || turnCredential) {
    console.warn(
      'Incomplete TURN configuration: VITE_RTC_TURN_URLS, VITE_RTC_TURN_USERNAME and VITE_RTC_TURN_CREDENTIAL must all be set to use TURN.'
    );
  } else {
    console.warn(
      'No TURN server configured. Voice may still work on direct peer-to-peer networks, but TURN relay will not be available.'
    );
  }

  return servers;
}

export function useSpeaking(stream: MediaStream | null, threshold = -50): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setIsSpeaking(false);
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    let audioContext: AudioContext;
    try {
      audioContext = new AudioContextClass();
    } catch {
      return;
    }

    const analyser = audioContext.createAnalyser();
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.85;

    let source: MediaStreamAudioSourceNode;
    try {
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch {
      audioContext.close();
      return;
    }

    const dataArray = new Float32Array(analyser.frequencyBinCount);
    let rafId: number;

    const checkSpeaking = () => {
      analyser.getFloatFrequencyData(dataArray);
      let max = -Infinity;
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > max) max = dataArray[i];
      }
      setIsSpeaking(max > threshold);
      rafId = requestAnimationFrame(checkSpeaking);
    };

    checkSpeaking();

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      audioContext.close();
    };
  }, [stream, threshold]);

  return isSpeaking;
}

export default function VoiceChat({
  socket,
  channelId,
  isServerMuted = false,
  isServerDeafened = false,
  onLeave,
  isFloating = false,
}: {
  socket: Socket | null;
  channelId: string;
  isServerMuted?: boolean;
  isServerDeafened?: boolean;
  onLeave?: () => void;
  isFloating?: boolean;
}) {
  const { t } = useTranslation();
  const token = useAuthStore(state => state.token);
  const currentUser = useAuthStore(state => state.user);
  const audioVideoSettings = useSettingsStore(state => state.audioVideo);

  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [muted, setMuted] = useState(isServerMuted);
  const [deafened, setDeafened] = useState(isServerDeafened);

  useEffect(() => {
    if (muted !== isServerMuted) setMuted(isServerMuted);
  }, [isServerMuted]);

  useEffect(() => {
    if (deafened !== isServerDeafened) setDeafened(isServerDeafened);
  }, [isServerDeafened]);
  const [videoOn, setVideoOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const iceQueuesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const makingOfferRef = useRef<Record<string, boolean>>({});
  const ignoredOfferRef = useRef<Record<string, boolean>>({});
  const restartTimersRef = useRef<Record<string, number>>({});
  const restartAttemptsRef = useRef<Record<string, number>>({});
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const videoElementsRef = useRef<Record<string, HTMLVideoElement>>({});
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfScreenRef = useRef<HTMLVideoElement | null>(null);

  const iceServers = useMemo(() => buildIceServers(), []);

  // Resolve user info for participants we don't already know.
  const resolveUser = useCallback(
    async (userId: string) => {
      if (!token) return null;
      try {
        const res = await api(`/api/users/${userId}`, {}, token);
        if (!res.ok) return null;
        let data: { user?: RemoteUser } = {};
        try {
          const text = await res.text();
          if (text) data = JSON.parse(text);
        } catch (e) { }
        return data.user ?? null;
      } catch {
        return null;
      }
    },
    [token]
  );

  // Apply mute / deafen flags to local mic + remote audio elements.
  useEffect(() => {
    const local = localStreamRef.current;
    if (local) {
      for (const track of local.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }, [muted]);

  // Apply audio processing constraints live when settings change
  useEffect(() => {
    const local = localStreamRef.current;
    if (local) {
      const audioTrack = local.getAudioTracks()[0];
      if (audioTrack && audioTrack.applyConstraints) {
        audioTrack.applyConstraints({
          noiseSuppression: audioVideoSettings.noiseSuppression,
          echoCancellation: audioVideoSettings.echoCancellation,
          autoGainControl: audioVideoSettings.autoGainControl,
          ...(audioVideoSettings.noiseSuppression ? {
            // @ts-ignore
            googNoiseSuppression: true,
            // @ts-ignore
            googHighpassFilter: true,
            // @ts-ignore
            googTypingNoiseDetection: true,
          } : {}),
          ...(audioVideoSettings.echoCancellation ? {
            // @ts-ignore
            googEchoCancellation: true,
          } : {}),
          ...(audioVideoSettings.autoGainControl ? {
            // @ts-ignore
            googAutoGainControl: true,
          } : {}),
          ...(audioVideoSettings.audioInputDeviceId ? { deviceId: { exact: audioVideoSettings.audioInputDeviceId } } : {})
        }).catch(err => {
          console.error('Failed to apply audio constraints', err);
        });
      }
    }
  }, [audioVideoSettings]);

  useEffect(() => {
    for (const audio of Object.values(audioElementsRef.current)) {
      audio.muted = deafened;
    }
  }, [deafened]);

  // Bind the local camera/screen streams to the self-preview tiles.
  useEffect(() => {
    if (selfVideoRef.current && videoOn && localStreamRef.current) {
      selfVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [videoOn, joined, localStreamRef.current]);

  useEffect(() => {
    if (selfScreenRef.current && screenOn && screenStreamRef.current) {
      selfScreenRef.current.srcObject = screenStreamRef.current;
    }
  }, [screenOn, joined, screenStreamRef.current]);

  useEffect(() => {
    if (!socket || !channelId) return;
    const s = socket;

    let cancelled = false;
    const joinedChannelId = channelId;

    async function attachLocalTracksToPeer(pc: RTCPeerConnection) {
      const localStream = localStreamRef.current;
      if (!localStream) return;

      console.log('Attaching local tracks to peer:', localStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, id: t.id })));

      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }
    }

    function isPolitePeer(remoteSocketId: string) {
      return Boolean(s.id && s.id < remoteSocketId);
    }

    function clearPeerRefs(remoteSocketId: string) {
      const timer = restartTimersRef.current[remoteSocketId];
      if (timer) window.clearTimeout(timer);
      const existingPc = peerConnectionsRef.current[remoteSocketId];
      if (existingPc) {
        try {
          existingPc.close();
        } catch {
          // ignore
        }
      }
      delete peerConnectionsRef.current[remoteSocketId];
      delete iceQueuesRef.current[remoteSocketId];
      delete makingOfferRef.current[remoteSocketId];
      delete ignoredOfferRef.current[remoteSocketId];
      delete restartTimersRef.current[remoteSocketId];
      delete restartAttemptsRef.current[remoteSocketId];
    }

    async function sendOffer(remoteSocketId: string, options?: RTCOfferOptions) {
      const pc = peerConnectionsRef.current[remoteSocketId];
      if (!pc || pc.signalingState === 'closed') return;
      if (makingOfferRef.current[remoteSocketId]) return;

      try {
        makingOfferRef.current[remoteSocketId] = true;
        const offer = await pc.createOffer(options);
        if (pc.signalingState !== 'stable') {
          console.warn(`Skipped offer for ${remoteSocketId}; signalingState=${pc.signalingState}`);
          return;
        }
        await pc.setLocalDescription(offer);
        s.emit('rtc:signal', { to: remoteSocketId, data: pc.localDescription });
      } finally {
        makingOfferRef.current[remoteSocketId] = false;
      }
    }

    function scheduleIceRestart(remoteSocketId: string) {
      const pc = peerConnectionsRef.current[remoteSocketId];
      if (!pc || pc.signalingState === 'closed') return;
      if (restartTimersRef.current[remoteSocketId]) return;

      const attempts = restartAttemptsRef.current[remoteSocketId] ?? 0;
      if (attempts >= 3) {
        console.warn(`ICE restart limit reached for ${remoteSocketId}; check TURN credentials/network path.`);
        clearPeerRefs(remoteSocketId);
        return;
      }

      restartAttemptsRef.current[remoteSocketId] = attempts + 1;
      restartTimersRef.current[remoteSocketId] = window.setTimeout(() => {
        delete restartTimersRef.current[remoteSocketId];
        const current = peerConnectionsRef.current[remoteSocketId];
        if (!current || current.signalingState === 'closed') return;
        console.log(`Attempting ICE restart for ${remoteSocketId} (${attempts + 1}/3)`);
        current.restartIce?.();
        sendOffer(remoteSocketId, { iceRestart: true }).catch(err => {
          console.error('ICE restart failed:', err);
        });
      }, 700 + attempts * 1200);
    }

    async function createPeer(remoteSocketId: string, _remoteUserId: string, initiator: boolean) {
      const existing = peerConnectionsRef.current[remoteSocketId];
      if (existing) {
        if (existing.signalingState === 'closed' || existing.connectionState === 'failed') {
          clearPeerRefs(remoteSocketId);
        } else {
          return existing;
        }
      }

      console.log(`Creating peer connection for ${remoteSocketId}, initiator=${initiator}`, { iceServers });
      const pc = new RTCPeerConnection({ iceServers });
      peerConnectionsRef.current[remoteSocketId] = pc;

      // Hook up the remote audio/video stream when it arrives.
      pc.ontrack = event => {
        const stream = event.streams[0];
        if (!stream) return;

        console.log('Remote track received:', {
          trackKind: event.track.kind,
          trackEnabled: event.track.enabled,
          streamTracks: stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, id: t.id })),
        });

        setParticipants(prev => {
          const existing = prev[remoteSocketId];
          if (!existing) return prev;
          return { ...prev, [remoteSocketId]: { ...existing, stream } };
        });
      };

      pc.onicecandidate = event => {
        if (!event.candidate) return;
        console.log(`Sending ICE candidate to ${remoteSocketId}`);
        s.emit('rtc:ice', { to: remoteSocketId, candidate: event.candidate.toJSON() });
      };

      pc.onicecandidateerror = event => {
        console.warn(`ICE candidate error for ${remoteSocketId}:`, {
          address: event.address,
          port: event.port,
          url: event.url,
          errorCode: event.errorCode,
          errorText: event.errorText,
        });
      };

      pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${remoteSocketId} changed to: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          restartAttemptsRef.current[remoteSocketId] = 0;
        }
        if (pc.connectionState === 'failed') {
          scheduleIceRestart(remoteSocketId);
        }
        if (pc.connectionState === 'closed') {
          clearPeerRefs(remoteSocketId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${remoteSocketId} changed to: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          restartAttemptsRef.current[remoteSocketId] = 0;
        }
        if (pc.iceConnectionState === 'failed') {
          scheduleIceRestart(remoteSocketId);
        }
      };

      await attachLocalTracksToPeer(pc);

      if (initiator) {
        await sendOffer(remoteSocketId);
      }

      return pc;
    }

    async function start() {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.warn('Media devices or getUserMedia not supported.');
          setError('voice_microphone_denied');
          return;
        }
        const audioConstraints: MediaTrackConstraints = {
          noiseSuppression: audioVideoSettings.noiseSuppression,
          echoCancellation: audioVideoSettings.echoCancellation,
          autoGainControl: audioVideoSettings.autoGainControl,
          ...(audioVideoSettings.noiseSuppression ? {
            // @ts-ignore
            googNoiseSuppression: true,
            // @ts-ignore
            googHighpassFilter: true,
            // @ts-ignore
            googTypingNoiseDetection: true,
          } : {}),
          ...(audioVideoSettings.echoCancellation ? {
            // @ts-ignore
            googEchoCancellation: true,
          } : {}),
          ...(audioVideoSettings.autoGainControl ? {
            // @ts-ignore
            googAutoGainControl: true,
          } : {}),
        };
        if (audioVideoSettings.audioInputDeviceId) {
          audioConstraints.deviceId = { exact: audioVideoSettings.audioInputDeviceId };
        }

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
        if (cancelled) {
          localStream.getTracks().forEach(t => t.stop());
          return;
        }
        localStreamRef.current = localStream;

        s.emit(
          'voice:join',
          { channelId: joinedChannelId },
          async (ack: VoiceJoinAck) => {
            if (cancelled) return;
            if (!ack || ack.ok === false) {
              setError(ack && 'error' in ack ? ack.error : 'voice_join_failed');
              return;
            }

            const seed: Record<string, Participant> = {};
            for (const p of ack.existingPeers) {
              seed[p.socketId] = {
                socketId: p.socketId,
                userId: p.userId,
                muted: p.muted,
                deafened: p.deafened,
                video: p.video,
                screen: p.screen,
                stream: null,
                user: p.user ?? null,
              };
            }
            setParticipants(seed);
            setJoined(true);

            // Hydrate user info async (fallback when server didn't supply it).
            for (const p of ack.existingPeers) {
              if (p.user) continue;
              resolveUser(p.userId).then(user => {
                if (cancelled || !user) return;
                setParticipants(prev =>
                  prev[p.socketId]
                    ? { ...prev, [p.socketId]: { ...prev[p.socketId], user } }
                    : prev
                );
              });
            }

            // Initiate offers to existing peers.
            for (const p of ack.existingPeers) {
              try {
                await createPeer(p.socketId, p.userId, true);
              } catch (err) {
                console.error('createPeer failed', err);
              }
            }
          }
        );
      } catch (err) {
        console.error('getUserMedia error', err);
        setError('voice_microphone_denied');
      }
    }

    const handlePeerJoined = ({
      userId,
      muted: pMuted,
      deafened: pDeafened,
      video,
      screen,
    }: {
      userId: string;
      muted?: boolean;
      deafened?: boolean;
      video?: boolean;
      screen?: boolean;
    }) => {
      // We will receive an offer from them shortly, just track presence.
      // Their socketId arrives with the actual signal.
      // Hydrate metadata only.
      void userId;
      void pMuted;
      void pDeafened;
      void video;
      void screen;
    };

    const handlePeerLeft = ({ userId }: { userId: string }) => {
      setParticipants(prev => {
        const next = { ...prev };
        for (const [sockId, p] of Object.entries(next)) {
          if (p.userId === userId) {
            delete next[sockId];
            const pc = peerConnectionsRef.current[sockId];
            if (pc) {
              try { pc.close(); } catch { /* ignore */ }
            }
            clearPeerRefs(sockId);
            const audio = audioElementsRef.current[sockId];
            if (audio) {
              audio.srcObject = null;
              delete audioElementsRef.current[sockId];
            }
            const video = videoElementsRef.current[sockId];
            if (video) {
              video.srcObject = null;
              delete videoElementsRef.current[sockId];
            }
          }
        }
        return next;
      });
    };

    const handlePeerState = (data: {
      userId: string;
      muted: boolean;
      deafened: boolean;
      video: boolean;
      screen: boolean;
    }) => {
      setParticipants(prev => {
        const next = { ...prev };
        for (const [sockId, p] of Object.entries(next)) {
          if (p.userId === data.userId) {
            next[sockId] = { ...p, muted: data.muted, deafened: data.deafened, video: data.video, screen: data.screen };
          }
        }
        return next;
      });
    };

    const handleSignal = ({
      from,
      fromUserId,
      data,
    }: {
      from: string;
      fromUserId: string;
      data: unknown;
    }) => {
      if (!isSessionDescription(data)) return;

      (async () => {
        let pc = peerConnectionsRef.current[from];
        if (!pc) {
          if (data.type !== 'offer') {
            console.warn(`Ignoring ${data.type} from ${from}; no peer connection exists.`);
            return;
          }
          // We're receiving a fresh offer - create the peer as receiver.
          // Always register participant via setState (don't rely on stale closure).
          setParticipants(prev => {
            if (prev[from]) return prev;
            return {
              ...prev,
              [from]: {
                socketId: from,
                userId: fromUserId,
                muted: false,
                deafened: false,
                video: false,
                screen: false,
                stream: null,
                user: null,
              },
            };
          });
          resolveUser(fromUserId).then(user => {
            if (cancelled || !user) return;
            setParticipants(prev =>
              prev[from] ? { ...prev, [from]: { ...prev[from], user } } : prev
            );
          });
          pc = await createPeer(from, fromUserId, false);
        }

        if (data.type === 'answer' && pc.signalingState !== 'have-local-offer') {
          console.warn(`Ignoring answer from ${from}; signalingState=${pc.signalingState}`);
          return;
        }

        if (data.type === 'offer') {
          const offerCollision = makingOfferRef.current[from] || pc.signalingState !== 'stable';
          ignoredOfferRef.current[from] = !isPolitePeer(from) && offerCollision;
          if (ignoredOfferRef.current[from]) {
            console.warn(`Ignoring colliding offer from impolite peer ${from}.`);
            return;
          }
          if (offerCollision) {
            console.log(`Rolling back local description for renegotiation with ${from}`);
            await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
          }
        }

        console.log(`Setting remote description (type=${data.type}) for ${from}, signalingState=${pc.signalingState}`);
        await pc.setRemoteDescription(data);
        if (data.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          s.emit('rtc:signal', { to: from, data: answer });
        }

        // Process any queued candidates for this peer
        const queue = iceQueuesRef.current[from];
        if (queue && queue.length > 0) {
          console.log(`Processing ${queue.length} queued ICE candidates for peer ${from}`);
          for (const cand of queue) {
            pc.addIceCandidate(cand).then(() => {
              console.log(`Successfully added queued ICE candidate from ${from}`);
            }).catch(err => {
              console.warn('addIceCandidate from queue failed', err);
            });
          }
          delete iceQueuesRef.current[from];
        }
      })().catch(err => console.error('rtc:signal handler error:', err));
    };

    const handleIce = ({
      from,
      candidate,
    }: {
      from: string;
      candidate?: RTCIceCandidateInit;
    }) => {
      const pc = peerConnectionsRef.current[from];
      if (!candidate) return;

      if (!pc) {
        if (!iceQueuesRef.current[from]) {
          iceQueuesRef.current[from] = [];
        }
        iceQueuesRef.current[from].push(candidate);
        console.log(`Queued ICE candidate from peer ${from} (peer connection is not ready yet)`);
        return;
      }

      if (!pc.remoteDescription) {
        if (!iceQueuesRef.current[from]) {
          iceQueuesRef.current[from] = [];
        }
        iceQueuesRef.current[from].push(candidate);
        console.log(`Queued ICE candidate from peer ${from} (remoteDescription is not set yet)`);
        return;
      }

      pc.addIceCandidate(candidate).then(() => {
        console.log(`Successfully added ICE candidate from ${from}`);
      }).catch(err => {
        if (ignoredOfferRef.current[from]) return;
        console.warn('addIceCandidate failed', err);
      });
    };

    s.on('voice:peer_joined', handlePeerJoined);
    s.on('voice:peer_left', handlePeerLeft);
    s.on('voice:peer_state', handlePeerState);
    s.on('rtc:signal', handleSignal);
    s.on('rtc:ice', handleIce);

    void start();

    return () => {
      cancelled = true;
      try {
        s.emit('voice:leave');
      } catch {
        // ignore
      }
      s.off('voice:peer_joined', handlePeerJoined);
      s.off('voice:peer_left', handlePeerLeft);
      s.off('voice:peer_state', handlePeerState);
      s.off('rtc:signal', handleSignal);
      s.off('rtc:ice', handleIce);

      for (const pc of Object.values(peerConnectionsRef.current)) {
        try { pc.close(); } catch { /* ignore */ }
      }
      peerConnectionsRef.current = {};
      iceQueuesRef.current = {};

      const local = localStreamRef.current;
      localStreamRef.current = null;
      local?.getTracks().forEach(t => t.stop());

      const screen = screenStreamRef.current;
      screenStreamRef.current = null;
      screen?.getTracks().forEach(t => t.stop());

      for (const audio of Object.values(audioElementsRef.current)) {
        audio.srcObject = null;
      }
      audioElementsRef.current = {};
      for (const video of Object.values(videoElementsRef.current)) {
        video.srcObject = null;
      }
      videoElementsRef.current = {};

      setParticipants({});
      setJoined(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, channelId, iceServers, resolveUser]);

  // Keep server informed about our local mute/deafen/video/screen state.
  useEffect(() => {
    if (!socket || !joined) return;
    socket.emit('voice:state', { muted, deafened, video: videoOn, screen: screenOn });
  }, [socket, joined, muted, deafened, videoOn, screenOn]);

  // Toggle camera: replace/remove the video track on every peer connection.
  const toggleVideo = useCallback(async () => {
    const local = localStreamRef.current;
    if (!local) return;

    const existing = local.getVideoTracks()[0];
    if (existing) {
      existing.stop();
      local.removeTrack(existing);
      for (const pc of Object.values(peerConnectionsRef.current)) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video' && !s.track.label.toLowerCase().includes('screen'));
        if (sender) {
          try { pc.removeTrack(sender); } catch { /* ignore */ }
        }
      }
      setVideoOn(false);
      return;
    }

    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const track = cam.getVideoTracks()[0];
      if (!track) return;
      local.addTrack(track);
      for (const pc of Object.values(peerConnectionsRef.current)) {
        pc.addTrack(track, local);
        const sender = pc.getSenders().find(s => s.track === track);
        if (sender) {
          await applyCameraEncoding(sender, isDesktopApp());
        }
        // Renegotiate
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          // We need to send to the remote peer; we know the socketId from the keys.
          const remoteSocketId = Object.entries(peerConnectionsRef.current).find(
            ([, p]) => p === pc
          )?.[0];
          if (remoteSocketId && socket) {
            socket.emit('rtc:signal', { to: remoteSocketId, data: offer });
          }
        } catch (err) {
          console.error('renegotiate camera', err);
        }
      }
      setVideoOn(true);
      // Ensure the video is attached immediately
      if (selfVideoRef.current) {
        selfVideoRef.current.srcObject = local;
      }
    } catch (err) {
      console.error('camera error', err);
    }
  }, [socket]);

  const startScreenShare = useCallback(async (sourceId?: string | null) => {
    try {
      console.log('Starting screen share with sourceId:', sourceId);
      const display = await captureScreenStream(audioVideoSettings.screenShare, sourceId);
      screenStreamRef.current = display;
      const track = display.getVideoTracks()[0];
      if (!track) {
        console.error('No video track in screen stream');
        return;
      }

      console.log('Screen track obtained:', { kind: track.kind, enabled: track.enabled, id: track.id });

      track.addEventListener('ended', () => {
        console.log('Screen track ended');
        screenStreamRef.current = null;
        setScreenOn(false);
      });

      const desktopApp = isDesktopApp();
      const peerCount = Object.keys(peerConnectionsRef.current).length;
      console.log('Adding screen track to', peerCount, 'peer connections');

      for (const [remoteSocketId, pc] of Object.entries(peerConnectionsRef.current)) {
        console.log('Adding screen track to peer:', remoteSocketId);
        pc.addTrack(track, display);
        const sender = pc.getSenders().find((s) => s.track === track);
        if (sender) {
          await applyScreenShareEncoding(sender, audioVideoSettings.screenShare, desktopApp);
          console.log('Screen encoding applied to sender');
        }
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (socket) socket.emit('rtc:signal', { to: remoteSocketId, data: offer });
          console.log('Screen share offer sent to:', remoteSocketId);
        } catch (err) {
          console.error('renegotiate screen failed for', remoteSocketId, err);
        }
      }
      setScreenOn(true);
      if (selfScreenRef.current) {
        selfScreenRef.current.srcObject = display;
      }
      console.log('Screen share started successfully');
    } catch (err) {
      console.error('screen share error:', err);
    }
  }, [audioVideoSettings.screenShare, socket]);

  const toggleScreen = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      for (const pc of Object.values(peerConnectionsRef.current)) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video' && s.track.label.toLowerCase().includes('screen'));
        if (sender) {
          try { pc.removeTrack(sender); } catch { /* ignore */ }
        }
      }
      setScreenOn(false);
      return;
    }

    if (isDesktopApp()) {
      setScreenPickerOpen(true);
      return;
    }

    await startScreenShare(null);
  }, [startScreenShare]);

  const handleHangup = () => {
    onLeave?.();
  };

  const regularParticipants = Object.values(participants);
  const activeScreenParticipant = regularParticipants.find(p => p.screen);
  const isScreenSharingActive = screenOn || !!activeScreenParticipant;

  const tileCount = 1 + (screenOn ? 1 : 0) + regularParticipants.length;
  const gridClass = isFloating
    ? 'grid-cols-1 gap-2 h-full'
    : tileCount === 1
      ? 'grid-cols-1 max-w-3xl mx-auto h-full'
      : tileCount === 2
        ? 'grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto h-full'
        : tileCount <= 4
          ? 'grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto h-full'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 h-full';

  return (
    <div className={`flex flex-col h-full w-full ${isFloating ? 'bg-transparent' : 'absolute inset-0 bg-softspace-950'} z-50 overflow-hidden`}>
      <ScreenSourcePicker
        open={screenPickerOpen}
        onClose={() => setScreenPickerOpen(false)}
        onSelect={(sourceId) => {
          setScreenPickerOpen(false);
          void startScreenShare(sourceId);
        }}
      />
      <div className={`flex-1 overflow-hidden flex flex-col justify-center ${isFloating ? 'p-2' : 'p-4 md:p-6'}`}>
        {error ? (
          <div className="flex items-center justify-center text-red-300 bg-red-500/10 p-6 rounded-2xl max-w-md mx-auto text-center">
            {translateVoiceError(error, t)}
          </div>
        ) : !joined ? (
          <div className="flex items-center justify-center text-softspace-500 animate-pulse">
            {t('voice_connecting')}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col gap-4 overflow-hidden">
            {isScreenSharingActive && !isFloating ? (
              <div className="flex flex-col lg:flex-row h-full gap-4 overflow-hidden">
                {/* Main Screen Share Area */}
                <div className="flex-1 bg-[#111116] rounded-2xl overflow-hidden border border-softspace-800 relative flex items-center justify-center min-h-[40vh] lg:min-h-0">
                  {screenOn ? (
                    <SelfScreenTile
                      label={`${t('voice_you')} · ${t('voice_your_screen')}`}
                      stream={screenStreamRef.current}
                      large
                      allowFullscreen
                    />
                  ) : activeScreenParticipant ? (
                    <ParticipantTile
                      participant={activeScreenParticipant}
                      audioOutputDeviceId={audioVideoSettings.audioOutputDeviceId}
                      deafened={deafened}
                      large
                      allowFullscreen
                    />
                  ) : null}
                </div>
                {/* Sidebar / Bottom bar for other participants */}
                <div className="lg:w-64 shrink-0 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 lg:pr-2 custom-scrollbar">
                  <SelfTile
                    user={currentUser}
                    videoOn={videoOn}
                    muted={muted}
                    deafened={deafened}
                    label={t('voice_you')}
                    stream={localStreamRef.current}
                    compact
                    allowFullscreen
                  />
                  {regularParticipants.map(p => {
                    if (p.socketId === activeScreenParticipant?.socketId) return null;
                    return (
                      <ParticipantTile
                        key={p.socketId}
                        participant={p}
                        audioOutputDeviceId={audioVideoSettings.audioOutputDeviceId}
                        deafened={deafened}
                        compact
                        allowFullscreen
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={`grid w-full h-full transition-all duration-300 ${gridClass} ${!isFloating ? 'gap-4 overflow-y-auto custom-scrollbar pr-2' : ''}`}>
                {screenOn && (
                  <SelfScreenTile
                    label={`${t('voice_you')} · ${t('voice_your_screen')}`}
                    stream={screenStreamRef.current}
                    allowFullscreen
                  />
                )}
                <SelfTile
                  user={currentUser}
                  videoOn={videoOn}
                  muted={muted}
                  deafened={deafened}
                  label={t('voice_you')}
                  stream={localStreamRef.current}
                  allowFullscreen
                />
                {regularParticipants.map(p => (
                  <ParticipantTile
                    key={p.socketId}
                    participant={p}
                    audioOutputDeviceId={audioVideoSettings.audioOutputDeviceId}
                    deafened={deafened}
                    allowFullscreen
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`border-t border-softspace-800 ${isFloating ? 'bg-softspace-950/90 p-2' : 'bg-softspace-900 p-4 shrink-0'}`}>
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <ControlButton
            active={!muted}
            danger={muted}
            onClick={() => {
              if (isServerMuted) return;
              setMuted(m => !m);
            }}
            label={isServerMuted ? 'Muted by Server' : (muted ? t('unmute') : t('mute'))}
            disabled={isServerMuted}
            small={isFloating}
          >
            {muted ? <MicOff size={isFloating ? 14 : 18} /> : <Mic size={isFloating ? 14 : 18} />}
          </ControlButton>
          <ControlButton
            active={!deafened}
            danger={deafened}
            onClick={() => {
              if (isServerDeafened) return;
              setDeafened(d => !d);
            }}
            label={isServerDeafened ? 'Deafened by Server' : (deafened ? t('undeafen') : t('deafen'))}
            disabled={isServerDeafened}
            small={isFloating}
          >
            {deafened ? <VolumeX size={isFloating ? 14 : 18} /> : <Headphones size={isFloating ? 14 : 18} />}
          </ControlButton>
          <ControlButton
            active={videoOn}
            onClick={toggleVideo}
            label={videoOn ? t('disable_camera') : t('enable_camera')}
            small={isFloating}
          >
            {videoOn ? <Video size={isFloating ? 14 : 18} /> : <VideoOff size={isFloating ? 14 : 18} />}
          </ControlButton>
          <ControlButton
            active={screenOn}
            onClick={toggleScreen}
            label={screenOn ? t('stop_sharing') : t('share_screen')}
            small={isFloating}
          >
            <ScreenShare size={isFloating ? 14 : 18} />
          </ControlButton>
          <button
            type="button"
            onClick={handleHangup}
            className={`ml-1 flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors ${isFloating ? 'px-3 py-1.5 text-xs' : 'px-4 py-2'}`}
          >
            <PhoneOff size={isFloating ? 14 : 18} />
            {t('leave_voice')}
          </button>
        </div>
      </div>
    </div>
  );
}

function FullscreenToggle({
  containerRef,
  visible = true,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  visible?: boolean;
}) {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [containerRef]);

  if (!visible) return null;

  const toggle = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.error('fullscreen error', err);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={isFullscreen ? t('exit_fullscreen') : t('fullscreen')}
      className="absolute top-2 left-2 z-20 bg-softspace-950/80 hover:bg-softspace-800 border border-softspace-700 text-softspace-200 rounded-lg p-1.5 transition-colors"
    >
      {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
    </button>
  );
}

function ParticipantTile({
  participant,
  audioOutputDeviceId,
  deafened,
  large = false,
  compact = false,
  allowFullscreen = false,
}: {
  participant: Participant;
  audioOutputDeviceId: string | null;
  deafened: boolean;
  large?: boolean;
  compact?: boolean;
  allowFullscreen?: boolean;
}) {
  const { t } = useTranslation();
  const name =
    participant.user?.displayName ||
    participant.user?.username ||
    participant.userId;
  const initials = (participant.user?.username ?? participant.userId)
    .charAt(0)
    .toUpperCase();
  const hasVideo = participant.video || participant.screen;
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isSpeaking = useSpeaking(participant.stream);

  // Create a detached audio element that survives DOM reparenting and attach it to the DOM for WebView support
  useEffect(() => {
    const audio = new Audio();
    audio.autoplay = true;
    // @ts-ignore
    audio.playsInline = true;
    // Ensure audio can play without user interaction
    audio.setAttribute('playsinline', '');
    // Appending it to the body ensures mobile WebViews allow audio playback
    audio.style.display = 'none';
    document.body.appendChild(audio);
    audioElRef.current = audio;

    return () => {
      audio.pause();
      audio.srcObject = null;
      if (document.body.contains(audio)) {
        document.body.removeChild(audio);
      }
      audioElRef.current = null;
    };
  }, []);

  // Attach stream to audio element and ensure playback
  useEffect(() => {
    const audio = audioElRef.current;
    if (!audio || !participant.stream) return;

    if (audio.srcObject !== participant.stream) {
      audio.srcObject = participant.stream;
    }

    // Try to play audio with better error handling
    const playAudio = async () => {
      try {
        // Check if audio has any tracks
        if (participant.stream.getAudioTracks().length === 0) {
          console.warn('No audio tracks in stream');
          return;
        }
        await audio.play();
        console.log('Successfully started audio playback for participant stream');
      } catch (e) {
        console.error("Error playing audio stream:", e);
        // Try unmute if autoplay was blocked
        audio.muted = false;
      }
    };

    playAudio();

    const handleTrackAdded = () => {
      console.log('Track added to participant stream, checking playback status');
      playAudio();
    };

    participant.stream.addEventListener('addtrack', handleTrackAdded);

    // Periodically ensure audio is still playing (survives reparenting)
    const interval = setInterval(() => {
      if (audio.paused && audio.srcObject) {
        playAudio();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (participant.stream) {
        participant.stream.removeEventListener('addtrack', handleTrackAdded);
      }
    };
  }, [participant.stream]);

  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.muted = deafened;
    }
  }, [deafened]);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      if (videoRef.current.srcObject !== participant.stream) {
        videoRef.current.srcObject = participant.stream;
      }
    }
  }, [participant.stream, hasVideo]);

  useEffect(() => {
    if (audioElRef.current && audioOutputDeviceId && typeof (audioElRef.current as any).setSinkId === 'function') {
      (audioElRef.current as any).setSinkId(audioOutputDeviceId).catch((e: any) => console.error('Error setting sink ID', e));
    }
  }, [audioOutputDeviceId]);

  return (
    <div ref={containerRef} className={`bg-softspace-950 border ${isSpeaking && !participant.muted ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'border-softspace-800'} rounded-2xl overflow-hidden transition-all duration-100 flex flex-col w-full h-full min-h-0`}>
      <div className="flex-1 bg-softspace-900 relative flex items-center justify-center min-h-0 w-full">
        <FullscreenToggle containerRef={containerRef} visible={allowFullscreen && hasVideo} />
        <video
          autoPlay
          playsInline
          ref={videoRef}
          className={`w-full h-full ${participant.screen ? 'object-contain' : 'object-cover'} ${hasVideo ? 'block' : 'hidden'}`}
        />
        {!hasVideo && (
          <div className={`${large ? 'w-32 h-32' : 'w-16 h-16 sm:w-20 sm:h-20'} rounded-full bg-softspace-800 flex items-center justify-center overflow-hidden shrink-0`}>
            {participant.user?.avatarUrl ? (
              <img
                src={assetUrl(participant.user.avatarUrl)}
                alt={name}
                className="w-full h-full object-cover pointer-events-none select-none"
                draggable="false"
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <span className={`${large ? 'text-5xl' : 'text-2xl sm:text-3xl'} font-bold text-softspace-300 pointer-events-none select-none`}>{initials}</span>
            )}
          </div>
        )}
        {participant.muted && (
          <div className="absolute top-2 right-2 bg-red-500/30 border border-red-500/50 rounded-full p-1.5">
            <MicOff size={14} className="text-red-200" />
          </div>
        )}
      </div>
      {!large && (
        <div className="p-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="font-semibold text-softspace-100 truncate">{name}</div>
            {participant.user?.systemRole === 'CEO' && (
              <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                CEO
              </span>
            )}
          </div>
          <div className="text-xs text-softspace-500 mt-0.5 truncate">@{participant.user?.username ?? '...'}</div>
        </div>
      )}
      {large && (
        <div className="absolute bottom-4 left-4 bg-softspace-950/80 backdrop-blur-md border border-softspace-800 rounded-xl p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-softspace-800">
            {participant.user?.avatarUrl ? (
              <img src={assetUrl(participant.user.avatarUrl)} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-bold text-softspace-300">{initials}</div>
            )}
          </div>
          <div>
            <div className="font-bold text-white flex items-center gap-2">
              {name}
              {participant.user?.systemRole === 'CEO' && (
                <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                  CEO
                </span>
              )}
            </div>
            {participant.screen && <div className="text-xs text-indigo-300 font-medium">{t('voice_screen_sharing')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SelfTile({
  user,
  videoOn,
  muted,
  deafened,
  label,
  stream,
  compact = false,
  allowFullscreen = false,
}: {
  user: User | null;
  videoOn: boolean;
  muted: boolean;
  deafened: boolean;
  label: string;
  stream: MediaStream | null;
  compact?: boolean;
  allowFullscreen?: boolean;
}) {
  const name = user?.displayName || user?.username || label;
  const initials = (user?.username ?? label).charAt(0).toUpperCase();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isSpeaking = useSpeaking(stream);

  useEffect(() => {
    if (videoRef.current) {
      if (videoOn && stream) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [videoOn, stream]);

  return (
    <div ref={containerRef} className={`bg-softspace-950 border ${isSpeaking && !muted ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'border-indigo-500/40'} rounded-2xl overflow-hidden transition-all duration-100 flex flex-col w-full h-full min-h-0`}>
      <div className="flex-1 bg-softspace-900 relative flex items-center justify-center min-h-0 w-full">
        <FullscreenToggle containerRef={containerRef} visible={allowFullscreen && videoOn} />
        <video
          autoPlay
          playsInline
          muted
          ref={videoRef}
          className={`w-full h-full object-cover -scale-x-100 ${videoOn ? 'block' : 'hidden'}`}
        />
        {!videoOn && (
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-softspace-800 flex items-center justify-center overflow-hidden shrink-0">
            {user?.avatarUrl ? (
              <img
                src={assetUrl(user.avatarUrl)}
                alt={name}
                className="w-full h-full object-cover pointer-events-none select-none"
                draggable="false"
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <span className="text-2xl sm:text-3xl font-bold text-softspace-300 pointer-events-none select-none">{initials}</span>
            )}
          </div>
        )}
        <div className="absolute top-2 left-2 bg-emerald-500/20 border border-emerald-500/40 rounded-full px-2 py-0.5 text-xs text-emerald-200">
          {label}
        </div>
        {muted && (
          <div className="absolute top-2 right-2 bg-red-500/30 border border-red-500/50 rounded-full p-1.5">
            <MicOff size={14} className="text-red-200" />
          </div>
        )}
        {deafened && (
          <div className="absolute bottom-2 right-2 bg-red-500/30 border border-red-500/50 rounded-full p-1.5">
            <VolumeX size={14} className="text-red-200" />
          </div>
        )}
      </div>
      <div className="p-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="font-semibold text-softspace-100 truncate">{name}</div>
          {user?.systemRole === 'CEO' && (
            <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
              CEO
            </span>
          )}
        </div>
        <div className="text-xs text-softspace-500 mt-0.5 truncate">@{user?.username ?? '...'}</div>
      </div>
    </div>
  );
}

function SelfScreenTile({
  label,
  stream,
  large = false,
  allowFullscreen = false,
}: {
  label: string;
  stream: MediaStream | null;
  large?: boolean;
  allowFullscreen?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  return (
    <div ref={containerRef} className={`bg-softspace-950 border border-indigo-500/40 rounded-2xl overflow-hidden transition-all duration-100 flex flex-col w-full h-full min-h-0`}>
      <div className="flex-1 bg-softspace-900 relative flex items-center justify-center min-h-0 w-full">
        <FullscreenToggle containerRef={containerRef} visible={allowFullscreen && !!stream} />
        <video
          autoPlay
          playsInline
          muted
          ref={videoRef}
          className="w-full h-full object-contain"
        />
        {!large && (
          <div className="absolute top-2 left-2 bg-indigo-500/20 border border-indigo-500/40 rounded-full px-2 py-0.5 text-xs text-indigo-200 flex items-center gap-1">
            <ScreenShare size={12} />
            {label}
          </div>
        )}
        {large && (
          <div className="absolute bottom-4 left-4 bg-softspace-950/80 backdrop-blur-md border border-softspace-800 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-softspace-800 flex items-center justify-center">
              <ScreenShare size={20} className="text-indigo-400" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                {label}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  active,
  danger,
  onClick,
  label,
  children,
  disabled,
  small,
}: {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={`flex items-center justify-center rounded-xl font-medium transition-colors ${small ? 'w-8 h-8' : 'w-11 h-11'} ${disabled
          ? 'bg-softspace-800 text-softspace-600 cursor-not-allowed'
          : danger
            ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20'
            : active
              ? 'bg-softspace-700 text-softspace-100 hover:bg-softspace-600'
              : 'bg-softspace-800 text-softspace-300 hover:bg-softspace-700'
        }`}
    >
      {children}
    </button>
  );
}

function translateVoiceError(code: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    voice_microphone_denied: t('voice_microphone_denied'),
  };
  return map[code] ?? code;
}
