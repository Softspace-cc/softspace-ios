import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScreenResolution } from '../lib/screenCapture';
import type { AudioProcessingConfig } from '../lib/audioProcessing';

interface AudioVideoSettings {
  audioInputDeviceId: string | null;
  audioOutputDeviceId: string | null;
  videoInputDeviceId: string | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  screenShare: {
    resolution: ScreenResolution;
    fps: number;
  };
  // Advanced audio processing (Krisp-style)
  krispEnabled: boolean;
  highpassFilter: boolean;
  noiseGateThreshold: number;
  micVolume: number;
  voiceActivityThreshold: number;
  // Granular audio settings
  noiseSuppressionLevel: 'low' | 'medium' | 'high' | 'aggressive';
  echoCancellationDelay: number;
  autoGainControlTarget: number;
  autoGainControlMaxGain: number;
  compressorThreshold: number;
  compressorRatio: number;
  compressorAttack: number;
  compressorRelease: number;
  bandpassFrequency: number;
  bandpassQ: number;
  highpassFrequency: number;
  highpassQ: number;
}

interface SettingsState {
  audioVideo: AudioVideoSettings;
  minimizeToTray: boolean;
  setAudioVideoSettings: (settings: Partial<AudioVideoSettings>) => void;
  setMinimizeToTray: (enabled: boolean) => void;
  getAudioProcessingConfig: () => AudioProcessingConfig;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      audioVideo: {
        audioInputDeviceId: null,
        audioOutputDeviceId: null,
        videoInputDeviceId: null,
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
        screenShare: {
          resolution: '1080p',
          fps: 30,
        },
        krispEnabled: false,
        highpassFilter: true,
        noiseGateThreshold: -50,
        micVolume: 1.0,
        voiceActivityThreshold: -45,
        noiseSuppressionLevel: 'medium',
        echoCancellationDelay: 100,
        autoGainControlTarget: -20,
        autoGainControlMaxGain: 30,
        compressorThreshold: -30,
        compressorRatio: 8,
        compressorAttack: 0.003,
        compressorRelease: 0.1,
        bandpassFrequency: 400,
        bandpassQ: 0.5,
        highpassFrequency: 150,
        highpassQ: 0.7,
      },
      minimizeToTray: false,
      setAudioVideoSettings: (settings) =>
        set((state) => ({
          audioVideo: { ...state.audioVideo, ...settings },
        })),
      setMinimizeToTray: (enabled) =>
        set({ minimizeToTray: enabled }),
      getAudioProcessingConfig: () => {
        const av = get().audioVideo;
        return {
          krispEnabled: av.krispEnabled,
          noiseSuppression: av.noiseSuppression,
          echoCancellation: av.echoCancellation,
          autoGainControl: av.autoGainControl,
          highpassFilter: av.highpassFilter,
          noiseGateThreshold: av.noiseGateThreshold,
          volume: av.micVolume,
          noiseSuppressionLevel: av.noiseSuppressionLevel,
          echoCancellationDelay: av.echoCancellationDelay,
          autoGainControlTarget: av.autoGainControlTarget,
          autoGainControlMaxGain: av.autoGainControlMaxGain,
          compressorThreshold: av.compressorThreshold,
          compressorRatio: av.compressorRatio,
          compressorAttack: av.compressorAttack,
          compressorRelease: av.compressorRelease,
          bandpassFrequency: av.bandpassFrequency,
          bandpassQ: av.bandpassQ,
          highpassFrequency: av.highpassFrequency,
          highpassQ: av.highpassQ,
          voiceActivityThreshold: av.voiceActivityThreshold,
        };
      },
    }),
    {
      name: 'softspace-settings',
    }
  )
);
