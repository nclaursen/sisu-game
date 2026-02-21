interface ToneOptions {
  frequency: number;
  type: OscillatorType;
  duration: number;
  volume: number;
  sweepToFrequency?: number;
}

interface MelodyEvent {
  step: number;
  note: number;
  lengthSteps: number;
}

const BPM = 108;
const BEAT_SEC = 60 / BPM;
const EIGHTH_SEC = BEAT_SEC / 2;
const STEPS_PER_BAR = 8; // eighth notes in 4/4
const LOOP_BARS = 8;
const LOOP_STEPS = STEPS_PER_BAR * LOOP_BARS;

const SCHEDULE_AHEAD_SEC = 0.24;
const SCHEDULER_INTERVAL_MS = 25;

// C major progression: C | C | Am | Am | F | F | G | G
const CHORDS: Array<[number, number, number]> = [
  [48, 52, 55],
  [48, 52, 55],
  [45, 48, 52],
  [45, 48, 52],
  [41, 45, 48],
  [41, 45, 48],
  [43, 47, 50],
  [43, 47, 50]
];

const MELODY_EVENTS: MelodyEvent[] = [
  { step: 0, note: 72, lengthSteps: 2 },
  { step: 2, note: 76, lengthSteps: 2 },
  { step: 4, note: 79, lengthSteps: 2 },
  { step: 6, note: 76, lengthSteps: 2 },

  { step: 8, note: 74, lengthSteps: 2 },
  { step: 10, note: 76, lengthSteps: 2 },
  { step: 12, note: 79, lengthSteps: 3 },
  { step: 15, note: 81, lengthSteps: 1 },

  { step: 16, note: 72, lengthSteps: 2 },
  { step: 18, note: 69, lengthSteps: 2 },
  { step: 20, note: 72, lengthSteps: 2 },
  { step: 22, note: 76, lengthSteps: 2 },

  { step: 24, note: 74, lengthSteps: 2 },
  { step: 26, note: 72, lengthSteps: 2 },
  { step: 28, note: 69, lengthSteps: 3 },
  { step: 31, note: 67, lengthSteps: 1 },

  { step: 32, note: 65, lengthSteps: 2 },
  { step: 34, note: 69, lengthSteps: 2 },
  { step: 36, note: 72, lengthSteps: 2 },
  { step: 38, note: 69, lengthSteps: 2 },

  { step: 40, note: 67, lengthSteps: 2 },
  { step: 42, note: 69, lengthSteps: 2 },
  { step: 44, note: 72, lengthSteps: 3 },
  { step: 47, note: 74, lengthSteps: 1 },

  { step: 48, note: 67, lengthSteps: 2 },
  { step: 50, note: 71, lengthSteps: 2 },
  { step: 52, note: 74, lengthSteps: 2 },
  { step: 54, note: 71, lengthSteps: 2 },

  { step: 56, note: 69, lengthSteps: 2 },
  { step: 58, note: 67, lengthSteps: 2 },
  { step: 60, note: 64, lengthSteps: 2 },
  { step: 62, note: 71, lengthSteps: 2 }
];

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private melodyDelay: DelayNode | null = null;
  private melodyFeedback: GainNode | null = null;
  private melodyDelayMix: GainNode | null = null;

  private enabled = true;
  private unlockAttached = false;

  private musicPlaying = false;
  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private nextStepIndex = 0;

  constructor() {
    this.attachUnlockListeners();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.masterGain && this.audioContext) {
      this.masterGain.gain.setValueAtTime(enabled ? 0.22 : 0, this.audioContext.currentTime);
    }
  }

  async unlock(): Promise<void> {
    this.ensureContext();
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  startMusic(): void {
    this.ensureContext();
    if (!this.audioContext || this.musicPlaying) {
      return;
    }

    this.musicPlaying = true;
    this.nextStepIndex = 0;
    this.nextStepTime = this.audioContext.currentTime + 0.05;

    this.schedulerId = window.setInterval(() => {
      this.scheduleMusic();
    }, SCHEDULER_INTERVAL_MS);
  }

  stopMusic(): void {
    this.musicPlaying = false;
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  playJump(): void {
    this.createTone({ frequency: 500, sweepToFrequency: 650, type: "square", duration: 0.12, volume: 0.11 });
  }

  playStomp(): void {
    this.createTone({ frequency: 220, type: "square", duration: 0.1, volume: 0.12 });
  }

  playDig(): void {
    this.createTone({ frequency: 180, sweepToFrequency: 120, type: "triangle", duration: 0.08, volume: 0.09 });
  }

  playBonePickup(): void {
    this.createTone({ frequency: 800, type: "square", duration: 0.1, volume: 0.1 });
  }

  playGoldenToyPickup(): void {
    const now = this.getNow();
    this.createTone({ frequency: 700, type: "square", duration: 0.15, volume: 0.1 }, now);
    this.createTone({ frequency: 900, type: "square", duration: 0.15, volume: 0.1 }, now + 0.16);
  }

  playHurt(): void {
    this.createTone({ frequency: 300, sweepToFrequency: 100, type: "sawtooth", duration: 0.2, volume: 0.12 });
  }

  playGateUnlock(): void {
    this.createTone({ frequency: 400, sweepToFrequency: 600, type: "triangle", duration: 0.2, volume: 0.1 });
  }

  playLevelComplete(): void {
    const now = this.getNow();
    this.createTone({ frequency: 600, type: "square", duration: 0.11, volume: 0.11 }, now);
    this.createTone({ frequency: 800, type: "square", duration: 0.11, volume: 0.11 }, now + 0.13);
    this.createTone({ frequency: 1000, type: "square", duration: 0.14, volume: 0.11 }, now + 0.26);
  }

  private scheduleMusic(): void {
    if (!this.audioContext || !this.musicPlaying) {
      return;
    }

    while (this.nextStepTime < this.audioContext.currentTime + SCHEDULE_AHEAD_SEC) {
      this.scheduleStep(this.nextStepIndex, this.nextStepTime);
      this.nextStepIndex = (this.nextStepIndex + 1) % LOOP_STEPS;
      this.nextStepTime += EIGHTH_SEC;
    }
  }

  private scheduleStep(stepIndex: number, time: number): void {
    if (!this.audioContext || !this.musicGain) {
      return;
    }

    const barIndex = Math.floor(stepIndex / STEPS_PER_BAR);
    const stepInBar = stepIndex % STEPS_PER_BAR;
    const chord = CHORDS[barIndex];

    // Bass: root on beat 1 and fifth on beat 3.
    if (stepInBar === 0) {
      this.scheduleVoice({
        frequency: midiToFrequency(chord[0] - 12),
        type: "triangle",
        start: time,
        duration: BEAT_SEC * 0.95,
        volume: 0.07,
        attack: 0.008,
        release: 0.08,
        destination: this.musicGain
      });
    }
    if (stepInBar === 4) {
      this.scheduleVoice({
        frequency: midiToFrequency(chord[2] - 12),
        type: "triangle",
        start: time,
        duration: BEAT_SEC * 0.9,
        volume: 0.06,
        attack: 0.008,
        release: 0.08,
        destination: this.musicGain
      });
    }

    // Arpeggio: subtle broken triad as eighth notes.
    const arpPattern = [0, 1, 2, 1, 0, 1, 2, 1];
    const arpDegree = arpPattern[stepInBar];
    this.scheduleVoice({
      frequency: midiToFrequency(chord[arpDegree] + 12),
      type: "square",
      start: time,
      duration: EIGHTH_SEC * 0.78,
      volume: 0.03,
      attack: 0.005,
      release: 0.04,
      destination: this.musicGain
    });

    // Melody events start at specific steps.
    for (const event of MELODY_EVENTS) {
      if (event.step !== stepIndex) {
        continue;
      }
      const duration = event.lengthSteps * EIGHTH_SEC * 0.92;
      this.scheduleMelodyVoice(midiToFrequency(event.note), time, duration);
    }
  }

  private scheduleMelodyVoice(frequency: number, start: number, duration: number): void {
    if (!this.musicGain || !this.melodyDelayMix) {
      return;
    }

    this.scheduleVoice({
      frequency,
      type: "square",
      start,
      duration,
      volume: 0.055,
      attack: 0.01,
      release: 0.1,
      destination: this.musicGain
    });

    // Subtle delay send for melody only.
    this.scheduleVoice({
      frequency,
      type: "square",
      start,
      duration,
      volume: 0.02,
      attack: 0.01,
      release: 0.1,
      destination: this.melodyDelayMix
    });
  }

  private getNow(): number {
    this.ensureContext();
    return this.audioContext ? this.audioContext.currentTime : 0;
  }

  private createTone(options: ToneOptions, startAt?: number): void {
    this.ensureContext();
    if (!this.audioContext || !this.sfxGain || !this.enabled) {
      return;
    }

    const start = startAt ?? this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = options.type;
    osc.frequency.setValueAtTime(options.frequency, start);
    if (typeof options.sweepToFrequency === "number") {
      osc.frequency.linearRampToValueAtTime(options.sweepToFrequency, start + options.duration);
    }

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(options.volume, start + 0.01);
    gain.gain.linearRampToValueAtTime(0.0001, start + options.duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(start);
    osc.stop(start + options.duration + 0.02);
  }

  private scheduleVoice(options: {
    frequency: number;
    type: OscillatorType;
    start: number;
    duration: number;
    volume: number;
    attack: number;
    release: number;
    destination: AudioNode;
  }): void {
    if (!this.audioContext) {
      return;
    }

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = options.type;
    osc.frequency.setValueAtTime(options.frequency, options.start);

    const releaseStart = Math.max(options.start + options.attack, options.start + options.duration - options.release);
    gain.gain.setValueAtTime(0, options.start);
    gain.gain.linearRampToValueAtTime(options.volume, options.start + options.attack);
    gain.gain.setValueAtTime(options.volume, releaseStart);
    gain.gain.linearRampToValueAtTime(0.0001, options.start + options.duration);

    osc.connect(gain);
    gain.connect(options.destination);

    osc.start(options.start);
    osc.stop(options.start + options.duration + 0.02);
  }

  private ensureContext(): void {
    if (this.audioContext) {
      return;
    }

    const ContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ContextCtor) {
      return;
    }

    this.audioContext = new ContextCtor();

    this.masterGain = this.audioContext.createGain();
    this.sfxGain = this.audioContext.createGain();
    this.musicGain = this.audioContext.createGain();

    this.melodyDelay = this.audioContext.createDelay(0.25);
    this.melodyFeedback = this.audioContext.createGain();
    this.melodyDelayMix = this.audioContext.createGain();

    this.masterGain.gain.value = this.enabled ? 0.22 : 0;
    this.sfxGain.gain.value = 1;
    this.musicGain.gain.value = 0.49;

    this.melodyDelay.delayTime.value = 0.15;
    this.melodyFeedback.gain.value = 0.2;
    this.melodyDelayMix.gain.value = 1;

    this.sfxGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);

    this.melodyDelayMix.connect(this.melodyDelay);
    this.melodyDelay.connect(this.melodyFeedback);
    this.melodyFeedback.connect(this.melodyDelay);
    this.melodyDelay.connect(this.musicGain);

    this.masterGain.connect(this.audioContext.destination);
  }

  private attachUnlockListeners(): void {
    if (this.unlockAttached) {
      return;
    }
    this.unlockAttached = true;

    const unlockOnce = async (): Promise<void> => {
      await this.unlock();
      if (this.audioContext && this.audioContext.state === "running") {
        window.removeEventListener("pointerdown", unlockOnce);
        window.removeEventListener("touchstart", unlockOnce);
        window.removeEventListener("keydown", unlockOnce);
      }
    };

    window.addEventListener("pointerdown", unlockOnce);
    window.addEventListener("touchstart", unlockOnce);
    window.addEventListener("keydown", unlockOnce);
  }
}

function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}
