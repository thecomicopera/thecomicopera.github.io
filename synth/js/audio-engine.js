/**
 * Subtractive Synthesizer Web Audio Engine
 * Polyphonic voice architecture with 2 oscillators, crossfade,
 * dual filter options (24dB Lowpass & 12dB Highpass/Bandpass),
 * ADSR envelopes, LFO matrix, and built-in effects.
 */

class SynthAudioEngine {
    constructor() {
        this.ctx = null;
        this.isInitialized = false;

        // Synth Settings & Parameters
        this.params = {
            // Master
            masterGain: 0.8,
            voiceMode: 'poly', // 'poly' | 'mono'
            glideTime: 0.03,   // seconds

            // Oscillator 1
            osc1: {
                type: 'sawtooth', // 'sine' | 'square' | 'sawtooth' | 'noise'
                octave: 0,        // -2 to +2
                semi: 0,          // -12 to +12
                fine: 0,          // -50 to +50 cents
                gain: 1.0,
                enabled: true
            },

            // Oscillator 2
            osc2: {
                type: 'square',   // 'sine' | 'square' | 'sawtooth' | 'noise'
                octave: 0,        // -2 to +2
                semi: 7,          // -12 to +12 (default 5th for punch)
                fine: 8,          // slight detune for richness
                gain: 1.0,
                enabled: true
            },

            // Crossfade: 0.0 = 100% Osc 1, 1.0 = 100% Osc 2, 0.5 = 50/50 equal power
            crossfade: 0.5,

            // Filter (2 Filter Options: Option A = 24dB Lowpass, Option B = 12dB Highpass / Bandpass)
            filter: {
                option: 'optionA', // 'optionA' (24dB Lowpass) | 'optionB' (12dB Highpass) | 'bandpass'
                cutoff: 2400,      // 20Hz - 20000Hz
                resonance: 4.5,    // Q: 0.5 - 24
                envAmount: 4000,   // -8000 to +8000 Hz modulation
                keyTrack: 0.5,     // 0 to 1
                drive: 1.0         // Pre-filter saturation
            },

            // Amplifier ADSR
            ampEnv: {
                attack: 0.015,
                decay: 0.25,
                sustain: 0.65,
                release: 0.4
            },

            // Filter ADSR
            filterEnv: {
                attack: 0.05,
                decay: 0.4,
                sustain: 0.3,
                release: 0.5
            },

            // LFO
            lfo: {
                type: 'sine',     // 'sine' | 'triangle' | 'sawtooth' | 'square'
                rate: 3.5,        // 0.1 - 25 Hz
                depth: 0.25,      // 0 - 1
                target: 'filter', // 'filter' | 'pitch' | 'amp' | 'crossfade'
                enabled: true
            },

            // Effects Rack
            effects: {
                distortion: {
                    enabled: false,
                    drive: 25,
                    mix: 0.3
                },
                delay: {
                    enabled: true,
                    time: 0.28,
                    feedback: 0.35,
                    mix: 0.25
                },
                reverb: {
                    enabled: true,
                    decay: 2.2,
                    mix: 0.28
                }
            }
        };

        // Voice state management
        this.maxPolyphony = 10;
        this.activeVoices = new Map(); // midiNote -> Voice
        this.lastMidiNote = null;

        // Global master nodes
        this.masterOut = null;
        this.analyser = null;
        this.limiter = null;
        this.lfoNode = null;
        this.lfoGain = null;

        // Shared noise buffer
        this.noiseBuffer = null;

        // Callbacks
        this.onVoiceCountChange = null;
    }

    init() {
        if (this.isInitialized) return;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();

        // 1. Generate master looped noise buffer (5 seconds stereo white noise)
        this.createNoiseBuffer();

        // 2. Setup Master Bus and Analyser
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.85;

        // Limiter / Compressor to avoid harsh digital clipping
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
        this.limiter.knee.setValueAtTime(6.0, this.ctx.currentTime);
        this.limiter.ratio.setValueAtTime(16.0, this.ctx.currentTime);
        this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.limiter.release.setValueAtTime(0.1, this.ctx.currentTime);

        this.masterGainNode = this.ctx.createGain();
        this.masterGainNode.gain.setValueAtTime(this.params.masterGain, this.ctx.currentTime);

        // 3. Effects Bus
        this.setupEffectsBus();

        // 4. Global LFO
        this.setupGlobalLFO();

        // Chain: Synth Voice Outs -> Effects Input -> Limiter -> Master Gain -> Analyser -> Destination
        this.effectsBus.output.connect(this.limiter);
        this.limiter.connect(this.masterGainNode);
        this.masterGainNode.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        this.isInitialized = true;
    }

    async ensureAudioReady() {
        if (!this.isInitialized) {
            this.init();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    createNoiseBuffer() {
        const bufferSize = this.ctx.sampleRate * 4; // 4 seconds buffer
        const buffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);
        const leftChannel = buffer.getChannelData(0);
        const rightChannel = buffer.getChannelData(1);

        for (let i = 0; i < bufferSize; i++) {
            // High quality white noise with gentle roll-off
            leftChannel[i] = (Math.random() * 2 - 1) * 0.7;
            rightChannel[i] = (Math.random() * 2 - 1) * 0.7;
        }

        this.noiseBuffer = buffer;
    }

    setupEffectsBus() {
        const now = this.ctx.currentTime;

        // Distortion curve
        this.distortionNode = this.ctx.createWaveShaper();
        this.updateDistortionCurve(this.params.effects.distortion.drive);
        this.distortionGain = this.ctx.createGain();
        this.distortionGain.gain.setValueAtTime(this.params.effects.distortion.enabled ? this.params.effects.distortion.mix : 0, now);

        // Stereo Ping-Pong / Stereo Delay
        this.delayNodeL = this.ctx.createDelay(2.0);
        this.delayNodeR = this.ctx.createDelay(2.0);
        this.delayNodeL.delayTime.setValueAtTime(this.params.effects.delay.time, now);
        this.delayNodeR.delayTime.setValueAtTime(this.params.effects.delay.time * 1.333, now); // rhythmic offset for wide stereo

        this.delayFeedbackL = this.ctx.createGain();
        this.delayFeedbackR = this.ctx.createGain();
        this.delayFeedbackL.gain.setValueAtTime(this.params.effects.delay.feedback, now);
        this.delayFeedbackR.gain.setValueAtTime(this.params.effects.delay.feedback, now);

        // Delay damping filter
        this.delayDamp = this.ctx.createBiquadFilter();
        this.delayDamp.type = 'lowpass';
        this.delayDamp.frequency.setValueAtTime(3200, now);

        this.delayGain = this.ctx.createGain();
        this.delayGain.gain.setValueAtTime(this.params.effects.delay.enabled ? this.params.effects.delay.mix : 0, now);

        // Ping-pong routing: L -> Feedback -> R, R -> Feedback -> L
        this.delayNodeL.connect(this.delayDamp);
        this.delayDamp.connect(this.delayFeedbackL);
        this.delayFeedbackL.connect(this.delayNodeR);
        this.delayNodeR.connect(this.delayFeedbackR);
        this.delayFeedbackR.connect(this.delayNodeL);

        // Create stereo merger for delay
        this.delayMerger = this.ctx.createChannelMerger(2);
        this.delayNodeL.connect(this.delayMerger, 0, 0);
        this.delayNodeR.connect(this.delayMerger, 0, 1);
        this.delayMerger.connect(this.delayGain);

        // Algorithmic Reverb using impulse response
        this.convolver = this.ctx.createConvolver();
        this.updateReverbImpulse(this.params.effects.reverb.decay);
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.setValueAtTime(this.params.effects.reverb.enabled ? this.params.effects.reverb.mix : 0, now);
        this.convolver.connect(this.reverbGain);

        // Dry bus
        this.dryGain = this.ctx.createGain();
        this.dryGain.gain.setValueAtTime(1.0, now);

        // Input and Output hubs
        this.fxInput = this.ctx.createGain();
        this.fxOutput = this.ctx.createGain();

        // Connect inputs to dry and fx
        this.fxInput.connect(this.dryGain);
        this.fxInput.connect(this.distortionNode);
        this.distortionNode.connect(this.distortionGain);

        this.fxInput.connect(this.delayNodeL);
        this.fxInput.connect(this.convolver);

        // Mix down to fxOutput
        this.dryGain.connect(this.fxOutput);
        this.distortionGain.connect(this.fxOutput);
        this.delayGain.connect(this.fxOutput);
        this.reverbGain.connect(this.fxOutput);

        this.effectsBus = {
            input: this.fxInput,
            output: this.fxOutput
        };
    }

    updateDistortionCurve(amount) {
        if (!this.ctx) return;
        const k = typeof amount === 'number' ? amount : 20;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        this.distortionNode.curve = curve;
        this.distortionNode.oversample = '4x';
    }

    updateReverbImpulse(decayTime) {
        if (!this.ctx) return;
        const rate = this.ctx.sampleRate;
        const length = Math.max(0.1, rate * decayTime);
        const impulse = this.ctx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const t = i / length;
            // Exponential decay envelope with subtle diffusion
            const env = Math.pow(1 - t, 2.5) * (Math.random() * 2 - 1);
            left[i] = env * Math.sin(i * 0.05);
            right[i] = env * Math.cos(i * 0.05);
        }
        this.convolver.buffer = impulse;
    }

    setupGlobalLFO() {
        this.lfoNode = this.ctx.createOscillator();
        this.lfoNode.type = this.params.lfo.type;
        this.lfoNode.frequency.setValueAtTime(this.params.lfo.rate, this.ctx.currentTime);

        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.setValueAtTime(this.params.lfo.depth, this.ctx.currentTime);

        this.lfoNode.connect(this.lfoGain);
        this.lfoNode.start();
    }

    // Convert MIDI note number (e.g. 60 = Middle C) to Frequency (Hz)
    midiToFreq(midiNote) {
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }

    // Equal-Power Crossfade helper
    // position from 0.0 (all Osc 1) to 1.0 (all Osc 2)
    calculateCrossfadeGains(position) {
        // Equal power curve maintains perceived loudness across crossfade
        const clamped = Math.max(0, Math.min(1, position));
        const angle = clamped * (Math.PI / 2);
        return {
            gain1: Math.cos(angle),
            gain2: Math.sin(angle)
        };
    }

    /**
     * Trigger a note on event
     */
    noteOn(midiNote, velocity = 1.0) {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        // If in monophonic mode, glide if voice already active
        if (this.params.voiceMode === 'mono' && this.activeVoices.size > 0) {
            const existingVoice = this.activeVoices.values().next().value;
            if (existingVoice) {
                const targetFreq = this.midiToFreq(midiNote);
                existingVoice.glideTo(targetFreq, this.params.glideTime);
                this.lastMidiNote = midiNote;
                return;
            }
        }

        // If voice already active for this exact note, stop it first
        if (this.activeVoices.has(midiNote)) {
            this.noteOff(midiNote);
        }

        // Voice Stealing if exceeding max polyphony
        if (this.activeVoices.size >= this.maxPolyphony) {
            const oldestMidi = this.activeVoices.keys().next().value;
            this.noteOff(oldestMidi, true);
        }

        // Create new Voice
        const voice = new SynthVoice(this, midiNote, velocity);
        this.activeVoices.set(midiNote, voice);
        this.lastMidiNote = midiNote;

        if (this.onVoiceCountChange) {
            this.onVoiceCountChange(this.activeVoices.size);
        }
    }

    /**
     * Trigger a note off event
     */
    noteOff(midiNote, immediate = false) {
        const voice = this.activeVoices.get(midiNote);
        if (voice) {
            voice.release(immediate);
            this.activeVoices.delete(midiNote);

            if (this.onVoiceCountChange) {
                this.onVoiceCountChange(this.activeVoices.size);
            }
        }
    }

    /**
     * Kill all sounding notes (Panic button)
     */
    allNotesOff() {
        for (const [midiNote, voice] of this.activeVoices.entries()) {
            voice.release(true);
        }
        this.activeVoices.clear();
        if (this.onVoiceCountChange) {
            this.onVoiceCountChange(0);
        }
    }

    /**
     * Update individual parameters with real-time audio thread syncing
     */
    setParam(path, value) {
        const parts = path.split('.');
        let obj = this.params;
        for (let i = 0; i < parts.length - 1; i++) {
            obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = value;

        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Master Volume
        if (path === 'masterGain') {
            this.masterGainNode.gain.setTargetAtTime(value, now, 0.02);
        }

        // Crossfade
        if (path === 'crossfade') {
            const gains = this.calculateCrossfadeGains(value);
            for (const voice of this.activeVoices.values()) {
                voice.updateCrossfade(gains);
            }
        }

        // Filter updates
        if (path.startsWith('filter.')) {
            for (const voice of this.activeVoices.values()) {
                voice.updateFilterParams();
            }
        }

        // LFO updates
        if (path === 'lfo.rate' && this.lfoNode) {
            this.lfoNode.frequency.setTargetAtTime(value, now, 0.02);
        }
        if (path === 'lfo.depth' && this.lfoGain) {
            this.lfoGain.gain.setTargetAtTime(value, now, 0.02);
        }
        if (path === 'lfo.type' && this.lfoNode) {
            this.lfoNode.type = value;
        }

        // Effect updates
        if (path === 'effects.delay.time') {
            this.delayNodeL.delayTime.setTargetAtTime(value, now, 0.05);
            this.delayNodeR.delayTime.setTargetAtTime(value * 1.333, now, 0.05);
        }
        if (path === 'effects.delay.feedback') {
            this.delayFeedbackL.gain.setTargetAtTime(value, now, 0.02);
            this.delayFeedbackR.gain.setTargetAtTime(value, now, 0.02);
        }
        if (path === 'effects.delay.mix' || path === 'effects.delay.enabled') {
            const mix = this.params.effects.delay.enabled ? this.params.effects.delay.mix : 0;
            this.delayGain.gain.setTargetAtTime(mix, now, 0.02);
        }
        if (path === 'effects.reverb.decay') {
            this.updateReverbImpulse(value);
        }
        if (path === 'effects.reverb.mix' || path === 'effects.reverb.enabled') {
            const mix = this.params.effects.reverb.enabled ? this.params.effects.reverb.mix : 0;
            this.reverbGain.gain.setTargetAtTime(mix, now, 0.02);
        }
        if (path === 'effects.distortion.drive') {
            this.updateDistortionCurve(value);
        }
        if (path === 'effects.distortion.mix' || path === 'effects.distortion.enabled') {
            const mix = this.params.effects.distortion.enabled ? this.params.effects.distortion.mix : 0;
            this.distortionGain.gain.setTargetAtTime(mix, now, 0.02);
        }
    }
}

/**
 * Individual Synthesizer Voice
 * Polyphonic voice containing:
 * - Osc 1 & Osc 2 (with noise buffers, pitch tune, octave)
 * - Crossfader Mixer
 * - 2 Filter Options (Option A: 24dB cascade lowpass, Option B: 12dB highpass/bandpass)
 * - Amp Envelope & Filter Envelope
 */
class SynthVoice {
    constructor(engine, midiNote, velocity) {
        this.engine = engine;
        this.ctx = engine.ctx;
        this.midiNote = midiNote;
        this.velocity = velocity;
        this.baseFreq = engine.midiToFreq(midiNote);

        const now = this.ctx.currentTime;

        // 1. Voice Amp Gain (Controlled by Amp ADSR)
        this.ampGain = this.ctx.createGain();
        this.ampGain.gain.setValueAtTime(0.0001, now);

        // 2. Dual Filter Section (2 Filter Options)
        // Filter 1 & Filter 2 cascade for rich 24dB slope (Option A) or Highpass / Bandpass (Option B)
        this.filter1 = this.ctx.createBiquadFilter();
        this.filter2 = this.ctx.createBiquadFilter();

        this.configureFilters();

        // 3. Crossfade Mixer
        this.osc1Gain = this.ctx.createGain();
        this.osc2Gain = this.ctx.createGain();
        const cfGains = engine.calculateCrossfadeGains(engine.params.crossfade);
        this.osc1Gain.gain.setValueAtTime(cfGains.gain1 * engine.params.osc1.gain, now);
        this.osc2Gain.gain.setValueAtTime(cfGains.gain2 * engine.params.osc2.gain, now);

        // Mixer summing node
        this.mixer = this.ctx.createGain();
        this.mixer.gain.setValueAtTime(1.0, now);
        this.osc1Gain.connect(this.mixer);
        this.osc2Gain.connect(this.mixer);

        // 4. Oscillators creation
        this.osc1Node = this.createOscillator(1);
        this.osc2Node = this.createOscillator(2);

        // Connect Oscillators -> Crossfade Gains
        if (this.osc1Node) this.osc1Node.connect(this.osc1Gain);
        if (this.osc2Node) this.osc2Node.connect(this.osc2Gain);

        // Connect Mixer -> Filter 1 -> Filter 2 -> Amp Gain -> FX Bus Input
        this.mixer.connect(this.filter1);
        this.filter1.connect(this.filter2);
        this.filter2.connect(this.ampGain);
        this.ampGain.connect(engine.effectsBus.input);

        // 5. Connect LFO modulation if active
        this.connectLfo();

        // 6. Trigger Envelopes (Attack Phase)
        this.triggerAttack(now);
    }

    /**
     * Compute actual frequency with octave, semitone, and fine tune offsets
     */
    computeFreq(baseFreq, oscConfig) {
        const totalSemis = (oscConfig.octave * 12) + oscConfig.semi + (oscConfig.fine / 100);
        return baseFreq * Math.pow(2, totalSemis / 12);
    }

    /**
     * Create either Web Audio OscillatorNode or Looped Noise Buffer Node
     */
    createOscillator(oscIndex) {
        const cfg = oscIndex === 1 ? this.engine.params.osc1 : this.engine.params.osc2;
        const now = this.ctx.currentTime;

        if (cfg.type === 'noise') {
            // White / Pink Noise generator from shared master buffer
            const noiseSource = this.ctx.createBufferSource();
            noiseSource.buffer = this.engine.noiseBuffer;
            noiseSource.loop = true;
            noiseSource.loopStart = Math.random() * 2; // Random phase
            noiseSource.loopEnd = noiseSource.loopStart + 2;
            noiseSource.start(now);
            return noiseSource;
        } else {
            // Standard Tone Oscillator (sine, square, sawtooth)
            const osc = this.ctx.createOscillator();
            osc.type = cfg.type;
            const freq = this.computeFreq(this.baseFreq, cfg);
            osc.frequency.setValueAtTime(freq, now);
            osc.start(now);
            return osc;
        }
    }

    /**
     * Configures the 2 filter options:
     * Option A: 24dB Resonant Lowpass (Dual 12dB biquads cascaded)
     * Option B: 12dB Sculpting Highpass (or switchable to Bandpass)
     */
    configureFilters() {
        const f = this.engine.params.filter;
        const now = this.ctx.currentTime;

        if (f.option === 'optionA') {
            // Option 1: 24dB Lowpass Filter (Steep warm vintage synth ladder style)
            this.filter1.type = 'lowpass';
            this.filter2.type = 'lowpass';
            this.filter1.Q.setValueAtTime(Math.min(f.resonance, 18), now);
            this.filter2.Q.setValueAtTime(Math.min(f.resonance * 0.7, 14), now);
        } else if (f.option === 'optionB') {
            // Option 2: 12dB Highpass Filter (For sharp cutting leads, chiptune & high frequency sculpts)
            this.filter1.type = 'highpass';
            this.filter2.type = 'allpass'; // transparent second stage
            this.filter1.Q.setValueAtTime(f.resonance, now);
            this.filter2.Q.setValueAtTime(1, now);
        } else if (f.option === 'bandpass') {
            // Alternative Option: Resonant Bandpass
            this.filter1.type = 'bandpass';
            this.filter2.type = 'allpass';
            this.filter1.Q.setValueAtTime(f.resonance, now);
            this.filter2.Q.setValueAtTime(1, now);
        }
    }

    updateCrossfade(cfGains) {
        const now = this.ctx.currentTime;
        this.osc1Gain.gain.setTargetAtTime(cfGains.gain1 * this.engine.params.osc1.gain, now, 0.01);
        this.osc2Gain.gain.setTargetAtTime(cfGains.gain2 * this.engine.params.osc2.gain, now, 0.01);
    }

    updateFilterParams() {
        this.configureFilters();
        const now = this.ctx.currentTime;
        const targetCutoff = this.calculateBaseCutoff();
        this.filter1.frequency.setTargetAtTime(targetCutoff, now, 0.02);
        this.filter2.frequency.setTargetAtTime(targetCutoff, now, 0.02);
    }

    calculateBaseCutoff() {
        const f = this.engine.params.filter;
        // Keytracking: higher notes offset the base cutoff frequency
        const keyTrackFactor = Math.pow(this.baseFreq / 261.63, f.keyTrack);
        let cutoff = f.cutoff * keyTrackFactor;
        return Math.max(20, Math.min(20000, cutoff));
    }

    connectLfo() {
        const lfo = this.engine.params.lfo;
        if (!lfo.enabled || !this.engine.lfoGain) return;

        if (lfo.target === 'filter') {
            // Modulate filter cutoff (scaled to frequency range)
            const lfoFilterScale = this.ctx.createGain();
            lfoFilterScale.gain.setValueAtTime(2500, this.ctx.currentTime);
            this.engine.lfoGain.connect(lfoFilterScale);
            lfoFilterScale.connect(this.filter1.frequency);
        } else if (lfo.target === 'pitch') {
            // Modulate oscillator frequencies (vibrato)
            const lfoPitchScale = this.ctx.createGain();
            lfoPitchScale.gain.setValueAtTime(40, this.ctx.currentTime);
            this.engine.lfoGain.connect(lfoPitchScale);
            if (this.osc1Node && this.osc1Node.frequency) this.engine.lfoGain.connect(this.osc1Node.frequency);
            if (this.osc2Node && this.osc2Node.frequency) this.engine.lfoGain.connect(this.osc2Node.frequency);
        } else if (lfo.target === 'amp') {
            // Tremolo
            const lfoAmpScale = this.ctx.createGain();
            lfoAmpScale.gain.setValueAtTime(0.4, this.ctx.currentTime);
            this.engine.lfoGain.connect(lfoAmpScale);
            lfoAmpScale.connect(this.ampGain.gain);
        }
    }

    triggerAttack(now) {
        const amp = this.engine.params.ampEnv;
        const fEnv = this.engine.params.filterEnv;
        const f = this.engine.params.filter;

        // 1. Amp Envelope (ADSR)
        const peakGain = Math.max(0.01, this.velocity * 0.9);
        const sustainGain = Math.max(0.0001, peakGain * amp.sustain);

        this.ampGain.gain.cancelScheduledValues(now);
        this.ampGain.gain.setValueAtTime(0.0001, now);
        // Attack
        this.ampGain.gain.linearRampToValueAtTime(peakGain, now + Math.max(0.002, amp.attack));
        // Decay to Sustain
        this.ampGain.gain.exponentialRampToValueAtTime(sustainGain, now + amp.attack + Math.max(0.01, amp.decay));

        // 2. Filter Envelope (ADSR)
        const baseCutoff = this.calculateBaseCutoff();
        const envPeakCutoff = Math.max(20, Math.min(20000, baseCutoff + f.envAmount));
        const envSustainCutoff = Math.max(20, Math.min(20000, baseCutoff + (f.envAmount * fEnv.sustain)));

        this.filter1.frequency.cancelScheduledValues(now);
        this.filter2.frequency.cancelScheduledValues(now);

        this.filter1.frequency.setValueAtTime(baseCutoff, now);
        this.filter2.frequency.setValueAtTime(baseCutoff, now);

        // Filter Attack
        const fAttackEnd = now + Math.max(0.002, fEnv.attack);
        this.filter1.frequency.linearRampToValueAtTime(envPeakCutoff, fAttackEnd);
        this.filter2.frequency.linearRampToValueAtTime(envPeakCutoff, fAttackEnd);

        // Filter Decay to Sustain
        const fDecayEnd = fAttackEnd + Math.max(0.01, fEnv.decay);
        this.filter1.frequency.exponentialRampToValueAtTime(envSustainCutoff, fDecayEnd);
        this.filter2.frequency.exponentialRampToValueAtTime(envSustainCutoff, fDecayEnd);
    }

    glideTo(newBaseFreq, glideDuration) {
        this.baseFreq = newBaseFreq;
        const now = this.ctx.currentTime;
        const target1 = this.computeFreq(newBaseFreq, this.engine.params.osc1);
        const target2 = this.computeFreq(newBaseFreq, this.engine.params.osc2);

        if (this.osc1Node && this.osc1Node.frequency) {
            this.osc1Node.frequency.cancelScheduledValues(now);
            this.osc1Node.frequency.setTargetAtTime(target1, now, glideDuration);
        }
        if (this.osc2Node && this.osc2Node.frequency) {
            this.osc2Node.frequency.cancelScheduledValues(now);
            this.osc2Node.frequency.setTargetAtTime(target2, now, glideDuration);
        }
    }

    release(immediate = false) {
        const now = this.ctx.currentTime;
        const amp = this.engine.params.ampEnv;
        const fEnv = this.engine.params.filterEnv;
        const releaseTime = immediate ? 0.02 : Math.max(0.01, amp.release);

        // Fade out amp envelope
        this.ampGain.gain.cancelScheduledValues(now);
        this.ampGain.gain.setValueAtTime(Math.max(0.0001, this.ampGain.gain.value), now);
        this.ampGain.gain.exponentialRampToValueAtTime(0.00001, now + releaseTime);

        // Fade filter frequency back to base
        const baseCutoff = this.calculateBaseCutoff();
        const fReleaseTime = immediate ? 0.02 : Math.max(0.01, fEnv.release);
        this.filter1.frequency.cancelScheduledValues(now);
        this.filter2.frequency.cancelScheduledValues(now);
        this.filter1.frequency.setTargetAtTime(baseCutoff, now, fReleaseTime * 0.3);
        this.filter2.frequency.setTargetAtTime(baseCutoff, now, fReleaseTime * 0.3);

        // Stop oscillators and clean nodes after release finishes
        setTimeout(() => {
            try {
                if (this.osc1Node) this.osc1Node.stop();
                if (this.osc2Node) this.osc2Node.stop();
                this.ampGain.disconnect();
                this.filter1.disconnect();
                this.filter2.disconnect();
                this.mixer.disconnect();
            } catch (e) {
                // Ignore already disconnected or stopped nodes
            }
        }, (releaseTime + 0.1) * 1000);
    }
}

window.SynthAudioEngine = SynthAudioEngine;
