/**
 * Synthesizer Preset Bank & Patch Management
 * Contains carefully crafted factory patches showcasing the 2 oscillators,
 * crossfade, 4 waveforms (including noise), dual filters, and effects.
 * Supports saving custom patches to localStorage and random sound generator.
 */

const FACTORY_PRESETS = [
    {
        name: "Neon Synthwave Lead",
        category: "Lead",
        params: {
            masterGain: 0.75,
            voiceMode: 'poly',
            glideTime: 0.02,
            crossfade: 0.5,
            osc1: { type: 'sawtooth', octave: 0, semi: 0, fine: -6, gain: 1.0 },
            osc2: { type: 'square', octave: 0, semi: 0, fine: 6, gain: 1.0 },
            filter: { option: 'optionA', cutoff: 3400, resonance: 4.8, envAmount: 3800, keyTrack: 0.6 },
            ampEnv: { attack: 0.015, decay: 0.25, sustain: 0.7, release: 0.4 },
            filterEnv: { attack: 0.03, decay: 0.35, sustain: 0.3, release: 0.4 },
            lfo: { type: 'sine', rate: 4.5, depth: 0.15, target: 'pitch', enabled: true },
            effects: {
                distortion: { enabled: false, drive: 15, mix: 0.2 },
                delay: { enabled: true, time: 0.28, feedback: 0.35, mix: 0.3 },
                reverb: { enabled: true, decay: 2.2, mix: 0.35 }
            }
        }
    },
    {
        name: "Cyberpunk Sub Bass",
        category: "Bass",
        params: {
            masterGain: 0.85,
            voiceMode: 'mono',
            glideTime: 0.045,
            crossfade: 0.35,
            osc1: { type: 'sawtooth', octave: -1, semi: 0, fine: 0, gain: 1.0 },
            osc2: { type: 'square', octave: -2, semi: 0, fine: 4, gain: 1.0 },
            filter: { option: 'optionA', cutoff: 750, resonance: 6.5, envAmount: 2600, keyTrack: 0.3 },
            ampEnv: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.18 },
            filterEnv: { attack: 0.005, decay: 0.22, sustain: 0.15, release: 0.2 },
            lfo: { type: 'sine', rate: 1.5, depth: 0.0, target: 'filter', enabled: false },
            effects: {
                distortion: { enabled: true, drive: 35, mix: 0.45 },
                delay: { enabled: false, time: 0.2, feedback: 0.2, mix: 0.1 },
                reverb: { enabled: false, decay: 1.2, mix: 0.1 }
            }
        }
    },
    {
        name: "Cosmic Ambient Pad",
        category: "Pad",
        params: {
            masterGain: 0.7,
            voiceMode: 'poly',
            glideTime: 0.05,
            crossfade: 0.55,
            osc1: { type: 'sawtooth', octave: 0, semi: 0, fine: -8, gain: 0.9 },
            osc2: { type: 'sine', octave: 1, semi: 0, fine: 8, gain: 0.8 },
            filter: { option: 'optionA', cutoff: 1600, resonance: 2.2, envAmount: 1800, keyTrack: 0.5 },
            ampEnv: { attack: 0.65, decay: 1.2, sustain: 0.85, release: 1.8 },
            filterEnv: { attack: 0.8, decay: 1.5, sustain: 0.6, release: 1.6 },
            lfo: { type: 'triangle', rate: 0.8, depth: 0.35, target: 'filter', enabled: true },
            effects: {
                distortion: { enabled: false, drive: 10, mix: 0.1 },
                delay: { enabled: true, time: 0.45, feedback: 0.45, mix: 0.38 },
                reverb: { enabled: true, decay: 4.2, mix: 0.55 }
            }
        }
    },
    {
        name: "Sci-Fi Noise Sculptor",
        category: "FX",
        params: {
            masterGain: 0.75,
            voiceMode: 'poly',
            glideTime: 0.03,
            crossfade: 0.2, // Mostly Osc 1 (Noise)
            osc1: { type: 'noise', octave: 0, semi: 0, fine: 0, gain: 1.0 },
            osc2: { type: 'sawtooth', octave: -1, semi: 7, fine: 0, gain: 0.6 },
            // Filter Option B (12dB Highpass) for sharp frequency carving
            filter: { option: 'optionB', cutoff: 1400, resonance: 12.0, envAmount: 3200, keyTrack: 0.7 },
            ampEnv: { attack: 0.08, decay: 0.6, sustain: 0.4, release: 0.7 },
            filterEnv: { attack: 0.15, decay: 0.7, sustain: 0.2, release: 0.8 },
            lfo: { type: 'sawtooth', rate: 2.2, depth: 0.5, target: 'filter', enabled: true },
            effects: {
                distortion: { enabled: false, drive: 20, mix: 0.2 },
                delay: { enabled: true, time: 0.33, feedback: 0.5, mix: 0.4 },
                reverb: { enabled: true, decay: 3.5, mix: 0.5 }
            }
        }
    },
    {
        name: "Acid Reso 303 Lead",
        category: "Lead",
        params: {
            masterGain: 0.8,
            voiceMode: 'mono',
            glideTime: 0.06,
            crossfade: 0.1,
            osc1: { type: 'sawtooth', octave: 0, semi: 0, fine: 0, gain: 1.0 },
            osc2: { type: 'square', octave: 1, semi: 0, fine: 5, gain: 0.3 },
            filter: { option: 'optionA', cutoff: 850, resonance: 15.0, envAmount: 6200, keyTrack: 0.4 },
            ampEnv: { attack: 0.005, decay: 0.25, sustain: 0.25, release: 0.2 },
            filterEnv: { attack: 0.005, decay: 0.18, sustain: 0.1, release: 0.18 },
            lfo: { type: 'sine', rate: 3.0, depth: 0.0, target: 'pitch', enabled: false },
            effects: {
                distortion: { enabled: true, drive: 42, mix: 0.5 },
                delay: { enabled: true, time: 0.25, feedback: 0.35, mix: 0.3 },
                reverb: { enabled: false, decay: 1.5, mix: 0.15 }
            }
        }
    },
    {
        name: "Dreamy 80s Chimes",
        category: "Keys",
        params: {
            masterGain: 0.75,
            voiceMode: 'poly',
            glideTime: 0.02,
            crossfade: 0.4,
            osc1: { type: 'sine', octave: 1, semi: 0, fine: 0, gain: 1.0 },
            osc2: { type: 'square', octave: 2, semi: 7, fine: 8, gain: 0.4 },
            filter: { option: 'optionA', cutoff: 4500, resonance: 3.5, envAmount: 2000, keyTrack: 0.5 },
            ampEnv: { attack: 0.008, decay: 0.9, sustain: 0.2, release: 0.6 },
            filterEnv: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.4 },
            lfo: { type: 'sine', rate: 4.8, depth: 0.15, target: 'pitch', enabled: true },
            effects: {
                distortion: { enabled: false, drive: 10, mix: 0.1 },
                delay: { enabled: true, time: 0.3, feedback: 0.4, mix: 0.35 },
                reverb: { enabled: true, decay: 2.8, mix: 0.4 }
            }
        }
    },
    {
        name: "Highpass Chiptune Hero",
        category: "Lead",
        params: {
            masterGain: 0.75,
            voiceMode: 'poly',
            glideTime: 0.02,
            crossfade: 0.8, // More Osc 2
            osc1: { type: 'noise', octave: 0, semi: 0, fine: 0, gain: 0.3 },
            osc2: { type: 'square', octave: 0, semi: 0, fine: 0, gain: 1.0 },
            // Filter Option B (12dB Highpass) for crisp bite
            filter: { option: 'optionB', cutoff: 450, resonance: 3.5, envAmount: 1500, keyTrack: 0.4 },
            ampEnv: { attack: 0.002, decay: 0.15, sustain: 0.0, release: 0.08 },
            filterEnv: { attack: 0.002, decay: 0.1, sustain: 0.0, release: 0.08 },
            lfo: { type: 'square', rate: 7.0, depth: 0.0, target: 'pitch', enabled: false },
            effects: {
                distortion: { enabled: false, drive: 10, mix: 0.1 },
                delay: { enabled: true, time: 0.18, feedback: 0.25, mix: 0.2 },
                reverb: { enabled: false, decay: 1.0, mix: 0.1 }
            }
        }
    },
    {
        name: "Vintage Brass Section",
        category: "Brass",
        params: {
            masterGain: 0.78,
            voiceMode: 'poly',
            glideTime: 0.03,
            crossfade: 0.5,
            osc1: { type: 'sawtooth', octave: 0, semi: 0, fine: -5, gain: 1.0 },
            osc2: { type: 'sawtooth', octave: 0, semi: 0, fine: 5, gain: 1.0 },
            filter: { option: 'optionA', cutoff: 1400, resonance: 4.0, envAmount: 4500, keyTrack: 0.65 },
            ampEnv: { attack: 0.06, decay: 0.45, sustain: 0.75, release: 0.4 },
            filterEnv: { attack: 0.08, decay: 0.5, sustain: 0.4, release: 0.4 },
            lfo: { type: 'sine', rate: 5.0, depth: 0.12, target: 'pitch', enabled: true },
            effects: {
                distortion: { enabled: false, drive: 12, mix: 0.15 },
                delay: { enabled: true, time: 0.3, feedback: 0.25, mix: 0.2 },
                reverb: { enabled: true, decay: 2.2, mix: 0.3 }
            }
        }
    }
];

class SynthPresetManager {
    constructor(engine, onPresetLoaded) {
        this.engine = engine;
        this.onPresetLoaded = onPresetLoaded;
        this.presets = [...FACTORY_PRESETS];
        this.currentPresetIndex = 0;

        this.loadUserPresets();
    }

    loadUserPresets() {
        try {
            const saved = localStorage.getItem('synth_user_presets');
            if (saved) {
                const userPresets = JSON.parse(saved);
                this.presets = [...FACTORY_PRESETS, ...userPresets];
            }
        } catch (e) {
            console.warn('Unable to load presets from localStorage', e);
        }
    }

    saveUserPreset(name) {
        if (!name || !name.trim()) return;
        const newPreset = {
            name: name.trim(),
            category: "User",
            params: JSON.parse(JSON.stringify(this.engine.params))
        };
        this.presets.push(newPreset);

        // Store user presets in localStorage
        const userPresets = this.presets.filter(p => p.category === 'User');
        localStorage.setItem('synth_user_presets', JSON.stringify(userPresets));

        this.applyPreset(this.presets.length - 1);
        return this.presets.length - 1;
    }

    applyPreset(index) {
        if (index < 0 || index >= this.presets.length) return;
        this.currentPresetIndex = index;
        const patch = this.presets[index];

        // Deep merge into engine params
        const mergeDeep = (target, source) => {
            for (const key of Object.keys(source)) {
                if (source[key] instanceof Object && !Array.isArray(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    mergeDeep(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        };

        mergeDeep(this.engine.params, patch.params);

        if (this.onPresetLoaded) {
            this.onPresetLoaded(patch, index);
        }
    }

    randomizePatch() {
        const waveforms = ['sine', 'square', 'sawtooth', 'noise'];
        const osc1Wave = waveforms[Math.floor(Math.random() * waveforms.length)];
        const osc2Wave = waveforms[Math.floor(Math.random() * waveforms.length)];
        const filterOpts = ['optionA', 'optionB'];

        const randomParams = {
            crossfade: Math.random(),
            osc1: {
                type: osc1Wave,
                octave: Math.floor(Math.random() * 3) - 1, // -1, 0, 1
                semi: 0,
                fine: (Math.random() - 0.5) * 20,
                gain: 1.0
            },
            osc2: {
                type: osc2Wave,
                octave: Math.floor(Math.random() * 3) - 1,
                semi: [0, 0, 7, 12, -12][Math.floor(Math.random() * 5)],
                fine: (Math.random() - 0.5) * 20,
                gain: 1.0
            },
            filter: {
                option: filterOpts[Math.floor(Math.random() * filterOpts.length)],
                cutoff: Math.exp(Math.log(80) + Math.random() * (Math.log(12000) - Math.log(80))),
                resonance: 1.0 + Math.random() * 12.0,
                envAmount: (Math.random() - 0.3) * 6000,
                keyTrack: Math.random() * 0.8
            },
            ampEnv: {
                attack: 0.005 + Math.random() * 0.4,
                decay: 0.1 + Math.random() * 0.8,
                sustain: 0.2 + Math.random() * 0.7,
                release: 0.1 + Math.random() * 0.9
            },
            filterEnv: {
                attack: 0.01 + Math.random() * 0.5,
                decay: 0.1 + Math.random() * 0.8,
                sustain: Math.random() * 0.8,
                release: 0.1 + Math.random() * 0.8
            },
            lfo: {
                type: ['sine', 'triangle', 'sawtooth'][Math.floor(Math.random() * 3)],
                rate: 0.5 + Math.random() * 8.0,
                depth: Math.random() * 0.4,
                target: ['filter', 'pitch', 'amp'][Math.floor(Math.random() * 3)],
                enabled: Math.random() > 0.4
            }
        };

        const randomPreset = {
            name: "🎲 Sonic Experiment",
            category: "Random",
            params: randomParams
        };

        this.engine.allNotesOff();
        Object.assign(this.engine.params.osc1, randomParams.osc1);
        Object.assign(this.engine.params.osc2, randomParams.osc2);
        Object.assign(this.engine.params.filter, randomParams.filter);
        Object.assign(this.engine.params.ampEnv, randomParams.ampEnv);
        Object.assign(this.engine.params.filterEnv, randomParams.filterEnv);
        Object.assign(this.engine.params.lfo, randomParams.lfo);
        this.engine.params.crossfade = randomParams.crossfade;

        if (this.onPresetLoaded) {
            this.onPresetLoaded(randomPreset, -1);
        }
    }
}

window.SynthPresetManager = SynthPresetManager;
window.FACTORY_PRESETS = FACTORY_PRESETS;
