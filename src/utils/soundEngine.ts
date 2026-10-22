import type { CompositionType, ImpactSimulationResult } from '../types';

interface AcousticProfile {
  sizeFactor: number; // 0 (5m pebble) -> 1 (15km planetary killer)
  speedFactor: number; // 0 (11 km/s) -> 1 (72 km/s)
  angleFactor: number; // 0 (10° shallow graze) -> 1 (90° vertical plunge)
  yieldFactor: number; // 0 (kiloton airburst) -> 1 (teraton extinction)
  composition: CompositionType;
  isAirburst: boolean;
  isOcean: boolean;
}

// Procedural Web Audio API synthesizer for realistic hypersonic atmospheric roar,
// deep seismic shockwaves, and subtle mechanical tactile feedback (zero electronic beeps)
class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private brownNoiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;
  private activeApproachStopFns: Array<() => void> = [];

  private ensureContext(): AudioContext | null {
    if (this.isMuted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Normalize asteroid physical parameters into continuous 0..1 acoustic scaling factors
  private computeAcousticProfile(
    input?: ImpactSimulationResult | boolean
  ): AcousticProfile {
    if (!input || typeof input === 'boolean') {
      return {
        sizeFactor: 0.45,
        speedFactor: 0.35,
        angleFactor: 0.5,
        yieldFactor: 0.45,
        composition: 'stony',
        isAirburst: typeof input === 'boolean' ? input : false,
        isOcean: false,
      };
    }

    // Log-scale diameter from 5m (0.0) up to 15,000m (1.0)
    const clampedDiam = Math.max(5, Math.min(15000, input.diameter_m || 150));
    const sizeFactor = Math.max(
      0,
      Math.min(1, Math.log10(clampedDiam / 5) / Math.log10(15000 / 5))
    );

    // Linear-scale velocity from 11 km/s (0.0) up to 72 km/s (1.0)
    const clampedVel = Math.max(11, Math.min(72, input.velocity_km_s || 20));
    const speedFactor = (clampedVel - 11) / (72 - 11);

    // Angle from 10° (0.0 shallow long atmospheric skim) to 90° (1.0 steep vertical drop)
    const clampedAngle = Math.max(10, Math.min(90, input.angle_deg || 45));
    const angleFactor = (clampedAngle - 10) / 80;

    // Log-scale kinetic yield (megatons) from 0.001 MT to 10,000,000 MT
    const clampedYield = Math.max(0.001, Math.min(1e7, input.tnt_megatons || 10));
    const yieldFactor = Math.max(
      0,
      Math.min(1, (Math.log10(clampedYield) + 3) / 10)
    );

    return {
      sizeFactor,
      speedFactor,
      angleFactor,
      yieldFactor,
      composition: input.composition || 'stony',
      isAirburst: Boolean(input.is_airburst),
      isOcean: Boolean(input.is_ocean_impact),
    };
  }

  // Generate cached Brown Noise buffer (deep 1/f^2 rumble for atmospheric roar & seismic thunder)
  private getBrownNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.brownNoiseBuffer && this.brownNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.brownNoiseBuffer;
    }
    const duration = 6.5;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lastOut = 0.0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.025 * white) / 1.025;
        // Add subtle low-frequency pressure turbulence modulation
        const turbulence = 0.82 + 0.18 * Math.sin(i * 0.00045 + ch * 1.3);
        data[i] = Math.max(-1, Math.min(1, lastOut * 3.2 * turbulence));
      }
    }
    this.brownNoiseBuffer = buffer;
    return buffer;
  }

  // Generate cached Pink Noise buffer (1/f aerodynamic wind shear & shockwave crackle)
  private getPinkNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.pinkNoiseBuffer && this.pinkNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.pinkNoiseBuffer;
    }
    const duration = 6.5;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    this.pinkNoiseBuffer = buffer;
    return buffer;
  }

  // Soft-clipping saturation curve for warm analog compression on shockwaves
  private createWarmSaturationCurve(drive: number = 1.8): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * drive);
    }
    return curve;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopActiveSounds();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public stopActiveSounds() {
    while (this.activeApproachStopFns.length > 0) {
      const stopFn = this.activeApproachStopFns.pop();
      if (stopFn) {
        try {
          stopFn();
        } catch {
          // Ignore already stopped nodes
        }
      }
    }
  }

  // Subtle low mechanical switch click (replaces high-pitched electronic beep)
  // Filter cutoff shifts slightly with the passed parameter frequency hint so heavy/light adjustments feel distinct
  public playTick(freqHint: number = 160) {
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const noise = ctx.createBufferSource();
      noise.buffer = this.getPinkNoiseBuffer(ctx);

      const clampedCutoff = Math.max(95, Math.min(280, freqHint * 0.28));
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(clampedCutoff, now);
      filter.Q.setValueAtTime(1.8, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now, Math.random() * 2.0, 0.025);
    } catch {
      // Ignore audio context restrictions
    }
  }

  // Deep muted tactile thud when locking coordinates on the globe (no electronic chirp)
  public playTargetLock() {
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const noise = ctx.createBufferSource();
      noise.buffer = this.getBrownNoiseBuffer(ctx);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, now);
      filter.frequency.exponentialRampToValueAtTime(55, now + 0.065);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now, Math.random() * 2.0, 0.08);
    } catch {
      // Ignore audio context restrictions
    }
  }

  public playLaunchSequence(result?: ImpactSimulationResult) {
    this.playApproachEntry(result, 5.5);
  }

  // Realistic 5.5s asteroid approach & hypersonic atmospheric entry roar scaled by:
  // - Size (sub-bass weight, overall rumble volume, lowpass resonance)
  // - Speed (hypersonic wind shear bandpass frequency, atmospheric turbulence intensity)
  // - Composition (iron = dense sub-bass; ice/porous_rock = high-altitude ablation crackle & hiss)
  // - Entry angle (shallow = earlier, longer atmospheric skimming roar; steep = late, abrupt compression)
  public playApproachEntry(
    result?: ImpactSimulationResult,
    durationSec: number = 5.5
  ) {
    try {
      this.stopActiveSounds();
      const ctx = this.ensureContext();
      if (!ctx) return;

      const profile = this.computeAcousticProfile(result);
      const { sizeFactor, speedFactor, angleFactor, composition, isAirburst } = profile;

      // Composition modifiers
      const isFragile = composition === 'ice' || composition === 'porous_rock';
      const isIron = composition === 'iron';
      const densityWeight =
        composition === 'iron'
          ? 1.35
          : composition === 'stony'
          ? 1.0
          : composition === 'porous_rock'
          ? 0.78
          : 0.65; // ice

      const now = ctx.currentTime;
      // Shallow entry angles (angleFactor ~ 0) enter the upper atmosphere earlier and skim longer;
      // steep vertical plunges (angleFactor ~ 1) hit the dense lower atmosphere later and more abruptly
      const entryRatio = 0.25 + angleFactor * 0.18;
      const entryStart = now + durationSec * entryRatio;
      const peakTime = now + durationSec * (isAirburst ? 0.88 : 0.94);

      // Master bus for clean fade-out on cancel/reset
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(1.0, now);
      masterGain.connect(ctx.destination);

      // 1. Deep seismic/atmospheric Brown Noise roar (scales strongly with size & density)
      const brownSource = ctx.createBufferSource();
      brownSource.buffer = this.getBrownNoiseBuffer(ctx);
      brownSource.loop = true;

      const brownFilter = ctx.createBiquadFilter();
      brownFilter.type = 'lowpass';
      brownFilter.Q.setValueAtTime(isIron ? 1.35 : 0.95, now);

      // Larger objects have a deeper, heavier fundamental rumble; faster objects sweep higher in ram compression
      const startCutoff = 35 + (1 - sizeFactor) * 25;
      const entryCutoff = startCutoff + 20 + speedFactor * 30;
      const peakCutoff = 120 + speedFactor * 160 + (1 - sizeFactor) * 70;

      brownFilter.frequency.setValueAtTime(startCutoff, now);
      brownFilter.frequency.linearRampToValueAtTime(entryCutoff, entryStart);
      brownFilter.frequency.exponentialRampToValueAtTime(peakCutoff, peakTime);
      brownFilter.frequency.linearRampToValueAtTime(peakCutoff * 0.65, now + durationSec);

      // Gain scales from subtle (0.09 for a 5m meteoroid) up to massive (0.44 for a 10km iron/stony bolide)
      const peakBrownGain = Math.min(
        0.46,
        (0.08 + sizeFactor * 0.26 + speedFactor * 0.06) * densityWeight
      );

      const brownGain = ctx.createGain();
      brownGain.gain.setValueAtTime(0.001, now);
      brownGain.gain.linearRampToValueAtTime(peakBrownGain * 0.16, entryStart);
      brownGain.gain.exponentialRampToValueAtTime(peakBrownGain, peakTime);
      brownGain.gain.exponentialRampToValueAtTime(0.008, now + durationSec);

      brownSource.connect(brownFilter);
      brownFilter.connect(brownGain);
      brownGain.connect(masterGain);

      // 2. Hypersonic atmospheric wind shear & ablating plasma rush (scales strongly with velocity & fragility)
      const windSource = ctx.createBufferSource();
      windSource.buffer = this.getPinkNoiseBuffer(ctx);
      windSource.loop = true;

      const windBandpass = ctx.createBiquadFilter();
      windBandpass.type = 'bandpass';
      // Faster & icy/porous bolides have a fiercer, brighter plasma wind-shear whistle/roar
      windBandpass.Q.setValueAtTime(isFragile ? 1.6 : 1.1 + speedFactor * 0.5, now);
      const windStartFreq = 80 + speedFactor * 60;
      const windPeakFreq =
        210 + speedFactor * 360 + (isFragile ? 95 : 0) + (1 - sizeFactor) * 60;

      windBandpass.frequency.setValueAtTime(windStartFreq, now);
      windBandpass.frequency.linearRampToValueAtTime(windStartFreq * 1.35, entryStart);
      windBandpass.frequency.exponentialRampToValueAtTime(windPeakFreq, peakTime);
      windBandpass.frequency.linearRampToValueAtTime(windPeakFreq * 0.7, now + durationSec);

      const windLowpass = ctx.createBiquadFilter();
      windLowpass.type = 'lowpass';
      windLowpass.frequency.setValueAtTime(320 + speedFactor * 480 + (isFragile ? 180 : 0), now);

      const peakWindGain = Math.min(
        0.34,
        (0.06 + speedFactor * 0.16 + sizeFactor * 0.07) * (isFragile ? 1.3 : 1.0)
      );

      const windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0.0001, now);
      windGain.gain.setValueAtTime(0.002, entryStart);
      windGain.gain.exponentialRampToValueAtTime(peakWindGain, peakTime);
      windGain.gain.exponentialRampToValueAtTime(0.004, now + durationSec);

      windSource.connect(windBandpass);
      windBandpass.connect(windLowpass);
      windLowpass.connect(windGain);
      windGain.connect(masterGain);

      // 3. Infrasonic sub-bass pressure wave (24Hz-46Hz physical weight; dominant for large & iron asteroids)
      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      const baseSubFreq = isIron ? 25 : 32 - sizeFactor * 6;
      subOsc.frequency.setValueAtTime(baseSubFreq, now);
      subOsc.frequency.linearRampToValueAtTime(baseSubFreq + 5, entryStart);
      subOsc.frequency.linearRampToValueAtTime(
        baseSubFreq + 10 + speedFactor * 6,
        peakTime
      );
      subOsc.frequency.linearRampToValueAtTime(baseSubFreq - 2, now + durationSec);

      // Small 5m pebbles barely excite sub-bass (0.015), whereas multi-km iron impactors drive heavy sub-bass (0.22)
      const peakSubGain = Math.min(
        0.24,
        (0.015 + Math.pow(sizeFactor, 1.3) * 0.16) * (isIron ? 1.35 : 1.0)
      );

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.0005, now);
      subGain.gain.linearRampToValueAtTime(peakSubGain * 0.25, entryStart);
      subGain.gain.linearRampToValueAtTime(peakSubGain, peakTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      subOsc.connect(subGain);
      subGain.connect(masterGain);

      // 4. High-altitude thermal ablation & fragmentation crackle bursts
      // Stronger for porous_rock / ice / airbursts or hypervelocity (>35 km/s) entries
      const crackleSource = ctx.createBufferSource();
      crackleSource.buffer = this.getPinkNoiseBuffer(ctx);
      crackleSource.loop = true;

      const crackleFilter = ctx.createBiquadFilter();
      crackleFilter.type = 'bandpass';
      crackleFilter.frequency.setValueAtTime(480 + speedFactor * 340, now);
      crackleFilter.Q.setValueAtTime(2.2, now);

      const crackleIntensity =
        (isFragile ? 0.085 : 0.03) +
        (isAirburst ? 0.05 : 0) +
        speedFactor * 0.045;
      const crackleGain = ctx.createGain();
      crackleGain.gain.setValueAtTime(0.0001, now);
      crackleGain.gain.setValueAtTime(0.0005, now + durationSec * 0.55);
      // Fluttering fragmentation spikes during peak ram pressure (70% -> 92% of flight)
      crackleGain.gain.exponentialRampToValueAtTime(
        crackleIntensity * 0.6,
        now + durationSec * 0.72
      );
      crackleGain.gain.exponentialRampToValueAtTime(
        crackleIntensity * 0.25,
        now + durationSec * 0.79
      );
      crackleGain.gain.exponentialRampToValueAtTime(
        crackleIntensity,
        now + durationSec * 0.87
      );
      crackleGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      crackleSource.connect(crackleFilter);
      crackleFilter.connect(crackleGain);
      crackleGain.connect(masterGain);

      brownSource.start(now, Math.random() * 1.5);
      windSource.start(now, Math.random() * 1.5);
      subOsc.start(now);
      crackleSource.start(now, Math.random() * 2.0);

      brownSource.stop(now + durationSec + 0.05);
      windSource.stop(now + durationSec + 0.05);
      subOsc.stop(now + durationSec + 0.05);
      crackleSource.stop(now + durationSec + 0.05);

      this.activeApproachStopFns.push(() => {
        const stopTime = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(stopTime);
        masterGain.gain.setValueAtTime(masterGain.gain.value, stopTime);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, stopTime + 0.08);
        setTimeout(() => {
          try {
            brownSource.stop();
            windSource.stop();
            subOsc.stop();
            crackleSource.stop();
          } catch {
            // Ignore
          }
        }, 100);
      });
    } catch {
      // Ignore audio context restrictions
    }
  }

  // Heavy physical detonation shockwave + rolling seismic/atmospheric/oceanic thunder
  // Scaled by size, kinetic yield, speed, composition (ice/porous/stony/iron), and target regime (airburst/ocean/land)
  public playImpactDetonation(resultOrAirburst: ImpactSimulationResult | boolean) {
    try {
      this.stopActiveSounds();
      const ctx = this.ensureContext();
      if (!ctx) return;

      const profile = this.computeAcousticProfile(resultOrAirburst);
      const {
        sizeFactor,
        speedFactor,
        yieldFactor,
        composition,
        isAirburst,
        isOcean,
      } = profile;

      const isIron = composition === 'iron';
      const isFragile = composition === 'ice' || composition === 'porous_rock';

      // Overall intensity combines size, kinetic yield, and speed
      const intensity = Math.max(
        0.12,
        Math.min(1.0, sizeFactor * 0.5 + yieldFactor * 0.35 + speedFactor * 0.15)
      );

      // Decay duration scales from ~1.3s for a tiny 5m airburst up to ~5.4s for a multi-km planetary impact
      const tailDuration =
        (isAirburst ? 1.35 : 2.1) +
        intensity * (isAirburst ? 1.6 : 3.2) +
        (isIron ? 0.5 : 0);

      const now = ctx.currentTime;
      const shaper = ctx.createWaveShaper();
      // Higher saturation drive for extreme megaton/teraton impacts and dense iron projectiles
      const drive = 1.2 + intensity * 1.4 + (isIron ? 0.35 : 0);
      shaper.curve = this.createWarmSaturationCurve(drive);
      shaper.connect(ctx.destination);

      // 1. Initial concussive shockwave thud (sub-bass pressure drop, scaled by size & composition)
      const impactSub = ctx.createOscillator();
      const impactSubGain = ctx.createGain();
      impactSub.type = 'sine';

      // Airbursts and small bolides have a higher, punchier pressure snap (75-95 Hz);
      // Giant iron/stony ground impacts start deep (45-58 Hz) and plunge into infrasonic 15 Hz tectonic waves
      const startSubFreq = isAirburst
        ? 68 + (1 - sizeFactor) * 28 + speedFactor * 12
        : (isIron ? 46 : 54) + (1 - sizeFactor) * 16;
      const endSubFreq = isAirburst ? 24 : Math.max(15, 22 - sizeFactor * 7);
      const subDecay = Math.min(tailDuration * 0.78, 1.1 + intensity * 2.4);

      impactSub.frequency.setValueAtTime(startSubFreq, now);
      impactSub.frequency.exponentialRampToValueAtTime(endSubFreq, now + subDecay);

      const subPeakGain = Math.min(
        0.48,
        (0.11 + intensity * 0.32) * (isIron ? 1.22 : isFragile ? 0.82 : 1.0)
      );
      impactSubGain.gain.setValueAtTime(subPeakGain, now);
      impactSubGain.gain.exponentialRampToValueAtTime(0.0001, now + subDecay + 0.15);

      impactSub.connect(impactSubGain);
      impactSubGain.connect(shaper);
      impactSub.start(now);
      impactSub.stop(now + subDecay + 0.2);

      // 2. Explosive blast wave transient & rolling seismic thunder (filtered Brown Noise)
      const blastNoise = ctx.createBufferSource();
      blastNoise.buffer = this.getBrownNoiseBuffer(ctx);
      blastNoise.loop = true;

      const blastFilter = ctx.createBiquadFilter();
      blastFilter.type = 'lowpass';
      blastFilter.Q.setValueAtTime(isAirburst ? 1.8 : isIron ? 1.6 : 1.3, now);

      // Faster velocities produce a sharper initial shockwave crack; larger sizes rumble deeper into the tail
      const initialBlastCutoff =
        (isAirburst ? 340 : 210) + speedFactor * 220 + (1 - sizeFactor) * 90;
      const finalBlastCutoff = isAirburst ? 52 : Math.max(26, 44 - sizeFactor * 16);

      blastFilter.frequency.setValueAtTime(initialBlastCutoff, now);
      blastFilter.frequency.exponentialRampToValueAtTime(
        finalBlastCutoff,
        now + tailDuration
      );

      const blastPeakGain = Math.min(
        0.52,
        (0.12 + intensity * 0.36) * (isIron ? 1.18 : 1.0)
      );
      const blastGain = ctx.createGain();
      blastGain.gain.setValueAtTime(blastPeakGain, now);
      // Secondary seismic/atmospheric after-rumble swell before decaying
      blastGain.gain.exponentialRampToValueAtTime(
        blastPeakGain * (isAirburst ? 0.28 : 0.44),
        now + 0.38 + intensity * 0.25
      );
      blastGain.gain.exponentialRampToValueAtTime(0.0001, now + tailDuration);

      blastNoise.connect(blastFilter);
      blastFilter.connect(blastGain);
      blastGain.connect(shaper);

      blastNoise.start(now, Math.random() * 1.0);
      blastNoise.stop(now + tailDuration + 0.1);

      // 3. Regime & Composition-Specific Secondary Layer:
      // - Oceanic impact: deep surging hydro-acoustic cavity collapse & water-wall roar
      // - Airburst / Ice / Porous: bright high-altitude fragmentation snap & acoustic shock crackle
      // - Continental Stony / Iron: heavy bedrock pulverization & ejecta debris curtain roar
      const secondarySource = ctx.createBufferSource();
      secondarySource.buffer = this.getPinkNoiseBuffer(ctx);
      secondarySource.loop = true;

      const secondaryFilter = ctx.createBiquadFilter();
      const secondaryGain = ctx.createGain();

      if (isOcean && !isAirburst) {
        // Oceanic hydro-acoustic cavity collapse & surging tsunami roar
        secondaryFilter.type = 'bandpass';
        secondaryFilter.Q.setValueAtTime(1.4, now);
        secondaryFilter.frequency.setValueAtTime(190 + speedFactor * 110, now);
        secondaryFilter.frequency.exponentialRampToValueAtTime(
          65,
          now + tailDuration * 0.45
        );
        secondaryFilter.frequency.linearRampToValueAtTime(
          155,
          now + tailDuration * 0.7
        );
        secondaryFilter.frequency.exponentialRampToValueAtTime(
          48,
          now + tailDuration
        );

        const oceanGain = Math.min(0.32, 0.09 + intensity * 0.22);
        secondaryGain.gain.setValueAtTime(oceanGain * 0.6, now);
        secondaryGain.gain.linearRampToValueAtTime(
          oceanGain,
          now + 0.55 + intensity * 0.4
        );
        secondaryGain.gain.exponentialRampToValueAtTime(0.0001, now + tailDuration);
      } else if (isAirburst || isFragile) {
        // High-altitude atmospheric fragmentation snap & sharp shockwave crackle
        secondaryFilter.type = 'bandpass';
        secondaryFilter.Q.setValueAtTime(1.1, now);
        secondaryFilter.frequency.setValueAtTime(
          460 + speedFactor * 320 + (1 - sizeFactor) * 140,
          now
        );
        secondaryFilter.frequency.exponentialRampToValueAtTime(
          95,
          now + tailDuration * 0.65
        );

        const airburstCrackleGain = Math.min(
          0.3,
          0.08 + intensity * 0.16 + speedFactor * 0.07
        );
        secondaryGain.gain.setValueAtTime(airburstCrackleGain, now);
        secondaryGain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + tailDuration * 0.7
        );
      } else {
        // Continental crater excavation: shattered bedrock & ejecta curtain roar
        secondaryFilter.type = 'bandpass';
        secondaryFilter.Q.setValueAtTime(0.85, now);
        secondaryFilter.frequency.setValueAtTime(
          260 + speedFactor * 180 - sizeFactor * 50,
          now
        );
        secondaryFilter.frequency.exponentialRampToValueAtTime(
          60,
          now + tailDuration * 0.8
        );

        const ejectaGain = Math.min(
          0.28,
          (0.07 + intensity * 0.18) * (isIron ? 1.15 : 1.0)
        );
        secondaryGain.gain.setValueAtTime(ejectaGain, now);
        secondaryGain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + tailDuration * 0.82
        );
      }

      secondarySource.connect(secondaryFilter);
      secondaryFilter.connect(secondaryGain);
      secondaryGain.connect(shaper);

      secondarySource.start(now, Math.random() * 1.0);
      secondarySource.stop(now + tailDuration + 0.1);
    } catch {
      // Ignore audio context restrictions
    }
  }
}

export const soundEngine = new SoundEngine();

