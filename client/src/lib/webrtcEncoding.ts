import type { AudioVideoSettings } from './screenCapture';

type ResolutionKey = AudioVideoSettings['screenShare']['resolution'];

const SCREEN_BITRATES: Record<ResolutionKey, Record<number, number>> = {
  native: { 60: 20_000_000, 30: 10_000_000, 15: 5_000_000 },
  '1440p': { 60: 14_000_000, 30: 7_000_000, 15: 3_500_000 },
  '1080p': { 60: 10_000_000, 30: 5_000_000, 15: 2_500_000 },
  '720p': { 60: 5_000_000, 30: 2_500_000, 15: 1_200_000 },
  '480p': { 60: 2_000_000, 30: 1_000_000, 15: 500_000 },
};

export async function applyScreenShareEncoding(
  sender: RTCRtpSender,
  settings: AudioVideoSettings['screenShare'],
  desktopApp: boolean
) {
  if (!desktopApp) return;

  const params = sender.getParameters();
  if (!params.encodings?.length) {
    params.encodings = [{}];
  }

  const fps = settings.fps || 30;
  const encoding = params.encodings[0];
  const bitrateTable = SCREEN_BITRATES[settings.resolution] ?? SCREEN_BITRATES['1080p'];
  encoding.maxBitrate = bitrateTable[fps] ?? bitrateTable[30];
  encoding.maxFramerate = fps;
  encoding.scaleResolutionDownBy = 1;

  params.degradationPreference = fps >= 60 ? 'maintain-framerate' : 'maintain-resolution';

  try {
    await sender.setParameters(params);
  } catch (err) {
    console.warn('applyScreenShareEncoding failed', err);
  }
}

export async function applyCameraEncoding(sender: RTCRtpSender, desktopApp: boolean) {
  if (!desktopApp) return;

  const params = sender.getParameters();
  if (!params.encodings?.length) {
    params.encodings = [{}];
  }

  params.encodings[0].maxBitrate = 2_500_000;
  params.encodings[0].maxFramerate = 30;
  params.degradationPreference = 'balanced';

  try {
    await sender.setParameters(params);
  } catch (err) {
    console.warn('applyCameraEncoding failed', err);
  }
}
