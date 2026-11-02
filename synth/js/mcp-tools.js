/**
 * synthWeb MCP Tool Registration via WebMCP
 * Exposes synthesizer engine control to AI assistants via WebMCP (document.modelContext).
 */

import { installWebMCP } from '@mcp-b/webmcp-polyfill';

// Active recording session state for synth.record_start / record_stop
let activeMcpRecorder = null;
let activeMcpStreamDest = null;
let activeMcpChunks = [];

/**
 * Deep merge source into target and update engine audio parameters
 */
function applyParams(engine, source, basePath = '') {
    for (const key of Object.keys(source)) {
        const val = source[key];
        const currentPath = basePath ? `${basePath}.${key}` : key;
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            applyParams(engine, val, currentPath);
        } else {
            engine.setParam(currentPath, val);
        }
    }
}

/**
 * Build tool definitions
 */
function createToolDefinitions() {
    return [
        {
            name: 'synth.get_state',
            description: 'Get the full synthesizer parameters snapshot, active voice count, and current preset info.',
            inputSchema: {
                type: 'object',
                properties: {}
            },
            async execute() {
                const synth = window.synth;
                if (!synth || !synth.engine) {
                    throw new Error('Synth engine instance is not available');
                }
                return {
                    params: JSON.parse(JSON.stringify(synth.engine.params)),
                    activeVoiceCount: synth.engine.activeVoices.size,
                    currentPresetIndex: synth.presetManager?.currentPresetIndex ?? 0,
                    audioState: synth.engine.ctx?.state || 'uninitialized'
                };
            }
        },
        {
            name: 'synth.set_params',
            description: 'Update synthesizer parameters with partial deep-merge and UI synchronization (knobs, buttons, crossfader).',
            inputSchema: {
                type: 'object',
                properties: {
                    masterGain: {
                        type: 'number',
                        minimum: 0.0,
                        maximum: 1.0,
                        description: 'Master output gain (0.0 to 1.0)'
                    },
                    voiceMode: {
                        type: 'string',
                        enum: ['poly', 'mono'],
                        description: 'Polyphonic (poly) or monophonic with glide (mono)'
                    },
                    glideTime: {
                        type: 'number',
                        minimum: 0.001,
                        maximum: 0.5,
                        description: 'Portamento glide time in seconds (0.001 to 0.5)'
                    },
                    crossfade: {
                        type: 'number',
                        minimum: 0.0,
                        maximum: 1.0,
                        description: 'Oscillator crossfade (0.0 = 100% Osc 1, 1.0 = 100% Osc 2, 0.5 = 50/50)'
                    },
                    osc1: {
                        type: 'object',
                        description: 'Oscillator 1 settings',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['sine', 'square', 'sawtooth', 'noise'],
                                description: 'Waveform type'
                            },
                            octave: {
                                type: 'integer',
                                minimum: -2,
                                maximum: 2,
                                description: 'Octave shift (-2 to +2)'
                            },
                            semi: {
                                type: 'integer',
                                minimum: -12,
                                maximum: 12,
                                description: 'Semitone pitch offset (-12 to +12)'
                            },
                            fine: {
                                type: 'number',
                                minimum: -50,
                                maximum: 50,
                                description: 'Fine detune in cents (-50 to +50)'
                            },
                            gain: {
                                type: 'number',
                                minimum: 0.0,
                                maximum: 1.0,
                                description: 'Oscillator gain level (0.0 to 1.0)'
                            },
                            enabled: {
                                type: 'boolean',
                                description: 'Enable or disable Oscillator 1'
                            }
                        }
                    },
                    osc2: {
                        type: 'object',
                        description: 'Oscillator 2 settings',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['sine', 'square', 'sawtooth', 'noise'],
                                description: 'Waveform type'
                            },
                            octave: {
                                type: 'integer',
                                minimum: -2,
                                maximum: 2,
                                description: 'Octave shift (-2 to +2)'
                            },
                            semi: {
                                type: 'integer',
                                minimum: -12,
                                maximum: 12,
                                description: 'Semitone pitch offset (-12 to +12)'
                            },
                            fine: {
                                type: 'number',
                                minimum: -50,
                                maximum: 50,
                                description: 'Fine detune in cents (-50 to +50)'
                            },
                            gain: {
                                type: 'number',
                                minimum: 0.0,
                                maximum: 1.0,
                                description: 'Oscillator gain level (0.0 to 1.0)'
                            },
                            enabled: {
                                type: 'boolean',
                                description: 'Enable or disable Oscillator 2'
                            }
                        }
                    },
                    filter: {
                        type: 'object',
                        description: 'Filter settings',
                        properties: {
                            option: {
                                type: 'string',
                                enum: ['optionA', 'optionB', 'bandpass'],
                                description: 'Filter type: optionA (24dB Lowpass) | optionB (12dB Highpass) | bandpass'
                            },
                            cutoff: {
                                type: 'number',
                                minimum: 20,
                                maximum: 20000,
                                description: 'Filter cutoff frequency in Hz (20 to 20000)'
                            },
                            resonance: {
                                type: 'number',
                                minimum: 0.5,
                                maximum: 24,
                                description: 'Resonance / Q factor (0.5 to 24)'
                            },
                            envAmount: {
                                type: 'number',
                                minimum: -8000,
                                maximum: 8000,
                                description: 'Filter envelope modulation amount in Hz (-8000 to +8000)'
                            },
                            keyTrack: {
                                type: 'number',
                                minimum: 0.0,
                                maximum: 1.0,
                                description: 'Keyboard pitch tracking ratio (0.0 to 1.0)'
                            },
                            drive: {
                                type: 'number',
                                minimum: 0.0,
                                maximum: 5.0,
                                description: 'Pre-filter saturation drive (0.0 to 5.0)'
                            }
                        }
                    },
                    ampEnv: {
                        type: 'object',
                        description: 'Amplifier ADSR envelope',
                        properties: {
                            attack: { type: 'number', minimum: 0.001, maximum: 5.0, description: 'Attack time in seconds' },
                            decay: { type: 'number', minimum: 0.01, maximum: 5.0, description: 'Decay time in seconds' },
                            sustain: { type: 'number', minimum: 0.0, maximum: 1.0, description: 'Sustain level (0.0 to 1.0)' },
                            release: { type: 'number', minimum: 0.01, maximum: 10.0, description: 'Release time in seconds' }
                        }
                    },
                    filterEnv: {
                        type: 'object',
                        description: 'Filter ADSR envelope',
                        properties: {
                            attack: { type: 'number', minimum: 0.001, maximum: 5.0, description: 'Attack time in seconds' },
                            decay: { type: 'number', minimum: 0.01, maximum: 5.0, description: 'Decay time in seconds' },
                            sustain: { type: 'number', minimum: 0.0, maximum: 1.0, description: 'Sustain level (0.0 to 1.0)' },
                            release: { type: 'number', minimum: 0.01, maximum: 10.0, description: 'Release time in seconds' }
                        }
                    },
                    lfo: {
                        type: 'object',
                        description: 'Low-Frequency Oscillator (LFO)',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['sine', 'triangle', 'sawtooth', 'square'],
                                description: 'LFO waveform'
                            },
                            rate: {
                                type: 'number',
                                minimum: 0.1,
                                maximum: 25.0,
                                description: 'LFO frequency in Hz (0.1 to 25.0)'
                            },
                            depth: {
                                type: 'number',
                                minimum: 0.0,
                                maximum: 1.0,
                                description: 'LFO modulation depth (0.0 to 1.0)'
                            },
                            target: {
                                type: 'string',
                                enum: ['filter', 'pitch', 'amp', 'crossfade'],
                                description: 'Modulation destination'
                            },
                            enabled: {
                                type: 'boolean',
                                description: 'Enable or disable LFO'
                            }
                        }
                    },
                    effects: {
                        type: 'object',
                        description: 'Effects section',
                        properties: {
                            distortion: {
                                type: 'object',
                                properties: {
                                    enabled: { type: 'boolean', description: 'Enable distortion' },
                                    drive: { type: 'number', minimum: 0, maximum: 100, description: 'Distortion drive (0 to 100)' },
                                    mix: { type: 'number', minimum: 0.0, maximum: 1.0, description: 'Wet/dry mix (0.0 to 1.0)' }
                                }
                            },
                            delay: {
                                type: 'object',
                                properties: {
                                    enabled: { type: 'boolean', description: 'Enable stereo delay' },
                                    time: { type: 'number', minimum: 0.01, maximum: 2.0, description: 'Delay time in seconds' },
                                    feedback: { type: 'number', minimum: 0.0, maximum: 0.95, description: 'Feedback level' },
                                    mix: { type: 'number', minimum: 0.0, maximum: 1.0, description: 'Wet/dry mix (0.0 to 1.0)' }
                                }
                            },
                            reverb: {
                                type: 'object',
                                properties: {
                                    enabled: { type: 'boolean', description: 'Enable algorithmic reverb' },
                                    decay: { type: 'number', minimum: 0.1, maximum: 10.0, description: 'Reverb decay time in seconds' },
                                    mix: { type: 'number', minimum: 0.0, maximum: 1.0, description: 'Wet/dry mix (0.0 to 1.0)' }
                                }
                            }
                        }
                    }
                }
            },
            async execute(args) {
                const synth = window.synth;
                if (!synth || !synth.engine) {
                    throw new Error('Synth engine instance is not available');
                }
                const paramsToApply = (args && args.params) ? args.params : args;
                if (!paramsToApply || typeof paramsToApply !== 'object') {
                    throw new Error('Invalid params provided');
                }

                // 1. Apply to audio engine
                applyParams(synth.engine, paramsToApply);

                // If osc types changed, restart voices
                if (paramsToApply.osc1?.type) {
                    for (const voice of synth.engine.activeVoices.values()) {
                        if (voice.osc1Node) {
                            try { voice.osc1Node.stop(); } catch(e){}
                            voice.osc1Node = voice.createOscillator(1);
                            voice.osc1Node.connect(voice.osc1Gain);
                        }
                    }
                }
                if (paramsToApply.osc2?.type) {
                    for (const voice of synth.engine.activeVoices.values()) {
                        if (voice.osc2Node) {
                            try { voice.osc2Node.stop(); } catch(e){}
                            voice.osc2Node = voice.createOscillator(2);
                            voice.osc2Node.connect(voice.osc2Gain);
                        }
                    }
                }

                // 2. Synchronize UI knobs, sliders, and buttons
                if (typeof synth.updateUIForPreset === 'function') {
                    synth.updateUIForPreset({ params: synth.engine.params });
                }

                return {
                    status: 'ok',
                    params: JSON.parse(JSON.stringify(synth.engine.params))
                };
            }
        },
        {
            name: 'synth.note_on',
            description: 'Trigger a note on event with MIDI note number and velocity.',
            inputSchema: {
                type: 'object',
                properties: {
                    note: {
                        type: 'integer',
                        minimum: 0,
                        maximum: 127,
                        description: 'MIDI note number (e.g. 60 for C4, 69 for A4 440Hz)'
                    },
                    velocity: {
                        type: 'number',
                        minimum: 0.0,
                        maximum: 1.0,
                        default: 0.8,
                        description: 'Note velocity/amplitude (0.0 to 1.0)'
                    }
                },
                required: ['note']
            },
            async execute({ note, velocity = 0.8 }) {
                const synth = window.synth;
                if (!synth || !synth.engine) throw new Error('Synth engine instance is not available');
                await synth.engine.ensureAudioReady();
                if (synth.keyboard) {
                    synth.keyboard.playNote(note, velocity);
                } else {
                    synth.engine.noteOn(note, velocity);
                }
                return {
                    status: 'ok',
                    note,
                    velocity,
                    activeVoices: synth.engine.activeVoices.size
                };
            }
        },
        {
            name: 'synth.note_off',
            description: 'Trigger a note off event to release a sounding note.',
            inputSchema: {
                type: 'object',
                properties: {
                    note: {
                        type: 'integer',
                        minimum: 0,
                        maximum: 127,
                        description: 'MIDI note number to release'
                    }
                },
                required: ['note']
            },
            async execute({ note }) {
                const synth = window.synth;
                if (!synth || !synth.engine) throw new Error('Synth engine instance is not available');
                if (synth.keyboard) {
                    synth.keyboard.stopNote(note);
                } else {
                    synth.engine.noteOff(note);
                }
                return {
                    status: 'ok',
                    note,
                    activeVoices: synth.engine.activeVoices.size
                };
            }
        },
        {
            name: 'synth.play_sequence',
            description: 'Play a timed sequence or chord progression of notes.',
            inputSchema: {
                type: 'object',
                properties: {
                    notes: {
                        type: 'array',
                        description: 'List of timed notes to play',
                        items: {
                            type: 'object',
                            properties: {
                                note: {
                                    type: 'integer',
                                    minimum: 0,
                                    maximum: 127,
                                    description: 'MIDI note number'
                                },
                                velocity: {
                                    type: 'number',
                                    minimum: 0.0,
                                    maximum: 1.0,
                                    default: 0.8,
                                    description: 'Note velocity'
                                },
                                duration: {
                                    type: 'number',
                                    minimum: 0.01,
                                    maximum: 30.0,
                                    description: 'Duration in seconds (e.g. 0.5)'
                                },
                                time: {
                                    type: 'number',
                                    minimum: 0.0,
                                    description: 'Start offset in seconds from sequence start. If omitted, notes play sequentially.'
                                }
                            },
                            required: ['note']
                        }
                    }
                },
                required: ['notes']
            },
            async execute({ notes }) {
                const synth = window.synth;
                if (!synth || !synth.engine) throw new Error('Synth engine instance is not available');
                await synth.engine.ensureAudioReady();

                const hasTime = notes.some(n => n.time !== undefined);
                let maxDurationMs = 0;

                if (hasTime) {
                    for (const item of notes) {
                        const startOffset = Math.max(0, item.time ?? 0) * 1000;
                        const dur = Math.max(0.05, item.duration ?? 0.5) * 1000;
                        const vel = item.velocity ?? 0.8;
                        maxDurationMs = Math.max(maxDurationMs, startOffset + dur);

                        setTimeout(() => {
                            if (synth.keyboard) synth.keyboard.playNote(item.note, vel);
                            else synth.engine.noteOn(item.note, vel);
                        }, startOffset);

                        setTimeout(() => {
                            if (synth.keyboard) synth.keyboard.stopNote(item.note);
                            else synth.engine.noteOff(item.note);
                        }, startOffset + dur);
                    }
                    await new Promise(resolve => setTimeout(resolve, maxDurationMs));
                } else {
                    for (const item of notes) {
                        const dur = Math.max(0.05, item.duration ?? 0.5) * 1000;
                        const vel = item.velocity ?? 0.8;
                        if (synth.keyboard) synth.keyboard.playNote(item.note, vel);
                        else synth.engine.noteOn(item.note, vel);

                        await new Promise(resolve => setTimeout(resolve, dur));

                        if (synth.keyboard) synth.keyboard.stopNote(item.note);
                        else synth.engine.noteOff(item.note);

                        await new Promise(resolve => setTimeout(resolve, 30));
                    }
                }

                return { status: 'ok', notesCount: notes.length };
            }
        },
        {
            name: 'synth.list_presets',
            description: 'List all available factory and user presets with their indexes and categories.',
            inputSchema: {
                type: 'object',
                properties: {}
            },
            async execute() {
                const synth = window.synth;
                if (!synth || !synth.presetManager) throw new Error('Preset manager instance is not available');
                const presets = synth.presetManager.presets.map((p, idx) => ({
                    index: idx,
                    name: p.name,
                    category: p.category
                }));
                return {
                    presets,
                    currentPresetIndex: synth.presetManager.currentPresetIndex
                };
            }
        },
        {
            name: 'synth.load_preset',
            description: 'Load a preset by its index or patch name.',
            inputSchema: {
                type: 'object',
                properties: {
                    index: {
                        type: 'integer',
                        description: 'Preset index'
                    },
                    name: {
                        type: 'string',
                        description: 'Preset name (case-insensitive substring match)'
                    }
                }
            },
            async execute({ index, name }) {
                const synth = window.synth;
                if (!synth || !synth.presetManager) throw new Error('Preset manager instance is not available');
                let targetIndex = -1;
                if (typeof index === 'number' && index >= 0 && index < synth.presetManager.presets.length) {
                    targetIndex = index;
                } else if (name) {
                    const query = name.toLowerCase().trim();
                    targetIndex = synth.presetManager.presets.findIndex(p => p.name.toLowerCase().includes(query));
                }

                if (targetIndex === -1) {
                    throw new Error(`Preset not found: ${JSON.stringify({ index, name })}`);
                }

                synth.presetManager.applyPreset(targetIndex);
                const presetSelect = document.getElementById('preset-select');
                if (presetSelect) presetSelect.value = targetIndex;

                return {
                    status: 'ok',
                    loadedIndex: targetIndex,
                    preset: synth.presetManager.presets[targetIndex]
                };
            }
        },
        {
            name: 'synth.save_preset',
            description: 'Save current synthesizer parameters as a custom user preset in localStorage.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Name for the custom patch'
                    }
                },
                required: ['name']
            },
            async execute({ name }) {
                const synth = window.synth;
                if (!synth || !synth.presetManager) throw new Error('Preset manager instance is not available');
                const newIndex = synth.presetManager.saveUserPreset(name);

                const presetSelect = document.getElementById('preset-select');
                if (presetSelect) {
                    presetSelect.innerHTML = '';
                    synth.presetManager.presets.forEach((preset, idx) => {
                        const opt = document.createElement('option');
                        opt.value = idx;
                        opt.textContent = `[${preset.category}] ${preset.name}`;
                        presetSelect.appendChild(opt);
                    });
                    presetSelect.value = newIndex;
                }

                return { status: 'ok', name, index: newIndex };
            }
        },
        {
            name: 'synth.record_start',
            description: 'Start recording master synthesizer audio output to WebM format.',
            inputSchema: {
                type: 'object',
                properties: {}
            },
            async execute() {
                const synth = window.synth;
                if (!synth || !synth.engine) throw new Error('Synth engine instance is not available');
                await synth.engine.ensureAudioReady();

                if (activeMcpRecorder && activeMcpRecorder.state === 'recording') {
                    try { activeMcpRecorder.stop(); } catch(e){}
                }

                const ctx = synth.engine.ctx;
                activeMcpStreamDest = ctx.createMediaStreamDestination();
                synth.engine.masterGainNode.connect(activeMcpStreamDest);

                const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
                activeMcpRecorder = new MediaRecorder(activeMcpStreamDest.stream, { mimeType });
                activeMcpChunks = [];

                activeMcpRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) activeMcpChunks.push(e.data);
                };

                activeMcpRecorder.start(100);
                return { status: 'recording_started', mimeType };
            }
        },
        {
            name: 'synth.record_stop',
            description: 'Stop recording audio and return the recorded sound as base64-encoded WebM audio.',
            inputSchema: {
                type: 'object',
                properties: {}
            },
            async execute() {
                const synth = window.synth;
                if (!synth || !synth.engine) throw new Error('Synth engine instance is not available');
                if (!activeMcpRecorder || activeMcpRecorder.state === 'inactive') {
                    throw new Error('No active recording session');
                }

                const mimeType = activeMcpRecorder.mimeType || 'audio/webm';

                const audioResult = await new Promise((resolve, reject) => {
                    activeMcpRecorder.onstop = () => {
                        try {
                            const blob = new Blob(activeMcpChunks, { type: mimeType });
                            if (activeMcpStreamDest && synth.engine.masterGainNode) {
                                try { synth.engine.masterGainNode.disconnect(activeMcpStreamDest); } catch(e){}
                            }
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const dataUrl = reader.result;
                                const base64 = typeof dataUrl === 'string' ? dataUrl.split(',')[1] : '';
                                resolve({
                                    status: 'ok',
                                    mimeType,
                                    sizeBytes: blob.size,
                                    base64,
                                    dataUrl
                                });
                            };
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        } catch (err) {
                            reject(err);
                        }
                    };
                    activeMcpRecorder.stop();
                });

                activeMcpRecorder = null;
                activeMcpStreamDest = null;
                activeMcpChunks = [];

                return audioResult;
            }
        },
        {
            name: 'synth.snapshot',
            description: 'Capture a snapshot image of the current synthesizer visualizer canvas as a base64 PNG data URL.',
            inputSchema: {
                type: 'object',
                properties: {}
            },
            async execute() {
                const synth = window.synth;
                if (!synth || !synth.visualizer || !synth.visualizer.canvas) {
                    throw new Error('Visualizer canvas instance is not available');
                }
                const dataUrl = synth.visualizer.canvas.toDataURL('image/png');
                return {
                    status: 'ok',
                    mimeType: 'image/png',
                    dataUrl,
                    width: synth.visualizer.canvas.width,
                    height: synth.visualizer.canvas.height
                };
            }
        }
    ];
}

/**
 * Register all WebMCP tools on document.modelContext or navigator.modelContext
 */
async function registerWebMCPTools() {
    // 1. Install polyfill if native modelContext is absent
    try {
        if (typeof installWebMCP === 'function') {
            installWebMCP();
        }
    } catch (err) {
        console.warn('installWebMCP polyfill call failed:', err);
    }

    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!modelContext) {
        console.warn('WebMCP modelContext is unavailable; MCP tools will not be registered.');
        return;
    }

    const tools = createToolDefinitions();
    for (const tool of tools) {
        if (typeof modelContext.registerTool === 'function') {
            try {
                await modelContext.registerTool(tool);
            } catch (err) {
                console.error(`Failed to register tool ${tool.name}:`, err);
            }
        }
    }

    console.log(`[WebMCP] Successfully registered ${tools.length} synthWeb tools on modelContext.`);
}

// Ensure execution occurs after DOMContentLoaded and window.synth is attached
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(registerWebMCPTools, 0);
    });
} else {
    setTimeout(registerWebMCPTools, 0);
}

