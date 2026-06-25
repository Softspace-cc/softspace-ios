import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScreenResolution } from '../lib/screenCapture';

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
}

interface SettingsState {
  audioVideo: AudioVideoSettings;
  setAudioVideoSettings: (settings: Partial<AudioVideoSettings>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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
      },
      // notifications setting removed (reverted)
      setAudioVideoSettings: (settings) =>
        set((state) => ({
          audioVideo: { ...state.audioVideo, ...settings },
        })),
      
    }),
    {
      name: 'softspace-settings',
    }
  )
);
