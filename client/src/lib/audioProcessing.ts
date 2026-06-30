/**
 * WebAudio-based noise suppression pipeline.
 * Provides "Krisp-like" aggressive noise reduction using:
 * - Band-pass filter (removes non-voice frequencies)
 * - Noise gate (cuts silence below threshold)
 * - Compressor (smooths volume)
 * - Optional high-pass rumble filter
 */

export type AudioProcessingConfig = {
  krispEnabled: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  highpassFilter: boolean;
  noiseGateThreshold: number; // -dB, default -50
  volume: number;             // 0.0 - 2.0, default 1.0
  // Advanced granular settings
  noiseSuppressionLevel: 'low' | 'medium' | 'high' | 'aggressive';
  echoCancellationDelay: number; // ms, default 100
  autoGainControlTarget: number; // dB, default -20
  autoGainControlMaxGain: number; // dB, default 30
  compressorThreshold: number; // dB, default -30
  compressorRatio: number; // default 8
  compressorAttack: number; // seconds, default 0.003
  compressorRelease: number; // seconds, default 0.1
  bandpassFrequency: number; // Hz, default 400
  bandpassQ: number; // default 0.5
  highpassFrequency: number; // Hz, default 150
  highpassQ: number; // default 0.7
  voiceActivityThreshold: number; // -dB, default -45
};

const DEFAULT_CONFIG: AudioProcessingConfig = {
  krispEnabled: false,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  highpassFilter: true,
  noiseGateThreshold: -50,
  volume: 1.0,
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
  voiceActivityThreshold: -45,
};

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private processedStream: MediaStream | null = null;

  // Processing nodes
  private bandpassFilter: BiquadFilterNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private noiseGateEnabled = false;
  private noiseGateThreshold = -50;
  private isRunning = false;
  private config: AudioProcessingConfig = { ...DEFAULT_CONFIG };

  /**
   * Attach audio processing to a local mic stream.
   * Returns a new processed MediaStream. Call stop() to clean up.
   */
  attachStream(inputStream: MediaStream, config: AudioProcessingConfig): MediaStream {
    this.config = { ...config };

    // If processing is disabled, return the original stream
    if (!this.config.krispEnabled && !this.config.highpassFilter && !this.config.noiseSuppression) {
      return inputStream;
    }

    try {
      this.audioContext = new AudioContext();
      this.source = this.audioContext.createMediaStreamSource(inputStream);
      this.destination = this.audioContext.createMediaStreamDestination();

      let lastNode: AudioNode = this.source;

      // 1. High-pass filter (removes rumble / low-end noise)
      if (this.config.highpassFilter) {
        this.highpassFilter = this.audioContext.createBiquadFilter();
        this.highpassFilter.type = 'highpass';
        this.highpassFilter.frequency.value = this.config.highpassFrequency;
        this.highpassFilter.Q.value = this.config.highpassQ;
        lastNode.connect(this.highpassFilter);
        lastNode = this.highpassFilter;
      }

      // 2. Band-pass filter (Krisp mode — voice-grade channel)
      if (this.config.krispEnabled) {
        this.bandpassFilter = this.audioContext.createBiquadFilter();
        this.bandpassFilter.type = 'bandpass';
        this.bandpassFilter.frequency.value = this.config.bandpassFrequency;
        this.bandpassFilter.Q.value = this.config.bandpassQ;
        lastNode.connect(this.bandpassFilter);
        lastNode = this.bandpassFilter;
      }

      // 3. Compressor (smooths volume spikes — helps with Krisp clarity)
      if (this.config.krispEnabled || this.config.autoGainControl) {
        this.compressorNode = this.audioContext.createDynamicsCompressor();
        this.compressorNode.threshold.value = this.config.compressorThreshold;
        this.compressorNode.knee.value = 10;
        this.compressorNode.ratio.value = this.config.compressorRatio;
        this.compressorNode.attack.value = this.config.compressorAttack;
        this.compressorNode.release.value = this.config.compressorRelease;
        lastNode.connect(this.compressorNode);
        lastNode = this.compressorNode;
      }

      // 4. Gain control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = config.volume;
      lastNode.connect(this.gainNode);
      lastNode = this.gainNode;

      // 5. Noise gate (cuts silence when below threshold)
      this.noiseGateThreshold = config.noiseGateThreshold;
      this.noiseGateEnabled = config.krispEnabled || config.noiseSuppression;
      if (this.noiseGateEnabled) {
        this.startNoiseGate(inputStream);
      }

      lastNode.connect(this.destination);
      this.processedStream = this.destination.stream;
      this.isRunning = true;

      return this.processedStream;
    } catch (err) {
      console.error('AudioProcessor: failed to attach stream', err);
      this.cleanup();
      return inputStream;
    }
  }

  /**
   * Update config live without re-creating the pipeline.
   */
  updateConfig(config: Partial<AudioProcessingConfig>) {
    Object.assign(this.config, config);

    if (this.gainNode) {
      this.gainNode.gain.value = this.config.volume;
    }

    if (this.highpassFilter) {
      this.highpassFilter.frequency.value = this.config.highpassFilter ? this.config.highpassFrequency : 20;
      this.highpassFilter.Q.value = this.config.highpassQ;
    }

    if (this.bandpassFilter) {
      this.bandpassFilter.frequency.value = this.config.bandpassFrequency;
      this.bandpassFilter.Q.value = this.config.bandpassQ;
    }

    if (this.compressorNode) {
      this.compressorNode.threshold.value = this.config.compressorThreshold;
      this.compressorNode.ratio.value = this.config.compressorRatio;
      this.compressorNode.attack.value = this.config.compressorAttack;
      this.compressorNode.release.value = this.config.compressorRelease;
    }

    this.noiseGateThreshold = this.config.noiseGateThreshold;
    this.noiseGateEnabled = this.config.krispEnabled || this.config.noiseSuppression;
  }

  /**
   * Gets the currently processed stream (if any), or null.
   */
  getStream(): MediaStream | null {
    return this.processedStream;
  }

  /**
   * Stop processing and release all resources.
   */
  stop() {
    this.cleanup();
  }

  private cleanup() {
    this.isRunning = false;
    try {
      this.source?.disconnect();
    } catch { /* ignore */ }
    try {
      this.highpassFilter?.disconnect();
    } catch { /* ignore */ }
    try {
      this.bandpassFilter?.disconnect();
    } catch { /* ignore */ }
    try {
      this.compressorNode?.disconnect();
    } catch { /* ignore */ }
    try {
      this.gainNode?.disconnect();
    } catch { /* ignore */ }
    try {
      this.destination?.disconnect();
    } catch { /* ignore */ }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }

    this.audioContext = null;
    this.source = null;
    this.destination = null;
    this.processedStream = null;
    this.highpassFilter = null;
    this.bandpassFilter = null;
    this.compressorNode = null;
    this.gainNode = null;
  }

  /**
   * Simple noise gate using a script processor (fallback).
   * Silences audio below the threshold on the input stream.
   */
  private startNoiseGate(inputStream: MediaStream) {
    if (!this.audioContext) return;

    // Use a low-frequency analyser to detect voice activity
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.8;

    try {
      const tempSource = this.audioContext.createMediaStreamSource(inputStream);
      tempSource.connect(analyser);
    } catch {
      return;
    }

    const dataArray = new Float32Array(analyser.frequencyBinCount);
    const gateCheck = () => {
      if (!this.isRunning || !this.audioContext) return;

      analyser.getFloatTimeDomainData(dataArray);
      let rms = 0;
      for (let i = 0; i < dataArray.length; i++) {
        rms += dataArray[i] * dataArray[i];
      }
      rms = Math.sqrt(rms / dataArray.length);
      const db = 20 * Math.log10(Math.max(rms, 0.00001));

      // Gate: if volume is below threshold, mute the gain node
      if (this.gainNode) {
        const targetGain = db > this.noiseGateThreshold ? this.config.volume : 0;
        // Smooth transition
        this.gainNode.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.05);
      }

      requestAnimationFrame(gateCheck);
    };

    requestAnimationFrame(gateCheck);
  }
}
