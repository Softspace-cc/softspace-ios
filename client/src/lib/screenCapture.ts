import { isDesktopApp } from './platform';

export type ScreenResolution = 'native' | '1440p' | '1080p' | '720p' | '480p';

export type AudioVideoSettings = {
  screenShare: {
    resolution: ScreenResolution;
    fps: number;
  };
};

export type DesktopCaptureSource = {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string | null;
  displayId?: string;
};

const RESOLUTION_PRESETS: Record<Exclude<ScreenResolution, 'native'>, { width: number; height: number }> = {
  '1440p': { width: 2560, height: 1440 },
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
  '480p': { width: 854, height: 480 },
};

export function getScreenCaptureConstraints(settings: AudioVideoSettings['screenShare']) {
  const fps = settings.fps || 30;
  const preset =
    settings.resolution === 'native'
      ? { width: 3840, height: 2160 }
      : RESOLUTION_PRESETS[settings.resolution];

  return {
    width: preset.width,
    height: preset.height,
    fps,
  };
}

function buildWebConstraints(settings: AudioVideoSettings['screenShare']): MediaStreamConstraints {
  const { width, height, fps } = getScreenCaptureConstraints(settings);

  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: fps, max: fps },
    },
  };
}

function buildElectronConstraints(
  sourceId: string,
  settings: AudioVideoSettings['screenShare']
): MediaStreamConstraints {
  const { width, height, fps } = getScreenCaptureConstraints(settings);

  return {
    audio: false, // System audio often not available in Electron, make it optional
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxWidth: width,
        maxHeight: height,
        maxFrameRate: fps,
        minFrameRate: Math.min(fps, 15),
      },
      optional: [
        { chromeMediaSource: 'desktop' },
        { chromeMediaSourceId: sourceId },
      ],
      width: { ideal: width, max: width },
      height: { ideal: height, max: height },
      frameRate: { ideal: fps, max: fps, min: Math.min(fps, 15) },
    } as MediaTrackConstraints,
  };
}

async function applyTrackQuality(track: MediaStreamTrack, settings: AudioVideoSettings['screenShare']) {
  const { width, height, fps } = getScreenCaptureConstraints(settings);

  try {
    await track.applyConstraints({
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: fps, max: fps },
    });
  } catch (err) {
    console.warn('applyTrackQuality failed', err);
  }

  track.contentHint = fps >= 60 ? 'motion' : 'detail';
}

export async function listDesktopCaptureSources(): Promise<DesktopCaptureSource[]> {
  if (!isDesktopApp() || !window.electron?.getDesktopSources) {
    console.warn('getDesktopSources not available:', { isDesktopApp: isDesktopApp(), hasElectron: !!window.electron, hasGetDesktopSources: !!window.electron?.getDesktopSources });
    return [];
  }
  try {
    const sources = await window.electron.getDesktopSources({ types: ['screen', 'window'] });
    console.log('Desktop capture sources:', sources);
    return sources;
  } catch (err) {
    console.error('listDesktopCaptureSources failed:', err);
    return [];
  }
}

export async function captureScreenStream(
  settings: AudioVideoSettings['screenShare'],
  sourceId?: string | null
): Promise<MediaStream> {
  const desktopApp = isDesktopApp();

  console.log('captureScreenStream called:', { desktopApp, sourceId, hasElectron: !!window.electron });

  let stream: MediaStream;

  if (desktopApp && sourceId && window.electron?.getDesktopSources) {
    console.log('Using Electron constraints with sourceId:', sourceId);
    stream = await navigator.mediaDevices.getUserMedia(buildElectronConstraints(sourceId, settings));
  } else {
    console.log('Using Web getDisplayMedia');
    stream = await navigator.mediaDevices.getDisplayMedia(buildWebConstraints(settings));
  }

  console.log('Screen stream obtained:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, id: t.id })));

  const track = stream.getVideoTracks()[0];
  if (track) {
    await applyTrackQuality(track, settings);
  }

  return stream;
}
