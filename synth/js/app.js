/**
 * Main Synthesizer Application Coordinator
 * Binds UI inputs to the Web Audio engine, synchronizes state,
 * handles user presets, and initializes all interactive modules.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Audio Engine
    const engine = new SynthAudioEngine();

    // 2. Setup Canvas Visualizer
    const canvas = document.getElementById('synth-visualizer-canvas');
    const visualizer = new SynthVisualizer(canvas, engine);
    visualizer.start();

    // Visualizer Mode Buttons
    const btnScope = document.getElementById('vis-btn-scope');
    const btnSpec = document.getElementById('vis-btn-spec');
    if (btnScope && btnSpec) {
        btnScope.addEventListener('click', () => {
            visualizer.setMode('oscilloscope');
            btnScope.classList.add('active');
            btnSpec.classList.remove('active');
        });
        btnSpec.addEventListener('click', () => {
            visualizer.setMode('spectrum');
            btnSpec.classList.add('active');
            btnScope.classList.remove('active');
        });
    }

    // 3. Setup Onscreen Keyboard & Wheels
    const keyboardContainer = document.getElementById('synth-keyboard-keys');
    const keyboard = new SynthKeyboard(keyboardContainer, engine, {
        baseOctave: 4,
        numOctaves: 3
    });

    // Octave display and buttons
    const octValDisplay = document.getElementById('octave-val');
    const btnOctDown = document.getElementById('btn-oct-down');
    const btnOctUp = document.getElementById('btn-oct-up');

    keyboard.onOctaveChange = (oct) => {
        if (octValDisplay) octValDisplay.textContent = `C${oct - 1} - C${oct + 2}`;
    };
    if (btnOctDown) btnOctDown.addEventListener('click', () => keyboard.shiftOctave(-1));
    if (btnOctUp) btnOctUp.addEventListener('click', () => keyboard.shiftOctave(1));

    // Panic button
    const btnPanic = document.getElementById('btn-panic');
    if (btnPanic) {
        btnPanic.addEventListener('click', () => {
            engine.allNotesOff();
            keyboard.activeKeys.clear();
            const keys = document.querySelectorAll('.synth-key');
            keys.forEach(k => k.classList.remove('key-pressed'));
        });
    }

    // Voice Count LED
    const voiceCountEl = document.getElementById('active-voice-count');
    engine.onVoiceCountChange = (count) => {
        if (voiceCountEl) voiceCountEl.textContent = `${count} ${count === 1 ? 'Voice' : 'Voices'}`;
    };

    // 4. Setup Web MIDI
    const midiManager = new SynthMidiManager(engine, keyboard);

    // 5. Setup Live Performance Recorder
    const recorder = new SynthRecorder(engine);

    // 6. Bind All Rotary Knobs
    const knobs = [];
    const knobElements = document.querySelectorAll('.synth-knob');
    knobElements.forEach(el => {
        const knob = new SynthKnob(el, {
            onChange: (val, path) => {
                engine.setParam(path, val);
            }
        });
        el.synthKnob = knob;
        knobs.push(knob);
    });

    // 7. Bind Crossfader Slider
    const crossfader = document.getElementById('osc-crossfader');
    const cfOsc1Label = document.getElementById('cf-pct-osc1');
    const cfOsc2Label = document.getElementById('cf-pct-osc2');

    const updateCrossfadeUI = (val) => {
        const norm = parseFloat(val);
        engine.setParam('crossfade', norm);
        if (crossfader) crossfader.value = norm;
        if (cfOsc1Label && cfOsc2Label) {
            const osc1Pct = Math.round((1 - norm) * 100);
            const osc2Pct = Math.round(norm * 100);
            cfOsc1Label.textContent = `${osc1Pct}%`;
            cfOsc2Label.textContent = `${osc2Pct}%`;
        }
    };

    if (crossfader) {
        crossfader.addEventListener('input', (e) => {
            updateCrossfadeUI(e.target.value);
        });
    }

    // 8. Bind Waveform Selectors for Osc 1 & Osc 2
    // User requested 4 waveforms: sine, square, saw, noise
    const setupWaveformSelector = (oscIndex, paramPath) => {
        const selectorContainer = document.getElementById(`osc${oscIndex}-wave-buttons`);
        if (!selectorContainer) return;

        const buttons = selectorContainer.querySelectorAll('.wave-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const wave = btn.dataset.wave;
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                engine.setParam(paramPath, wave);

                // If currently playing, restart active voices' oscillators to apply immediately
                for (const voice of engine.activeVoices.values()) {
                    if (oscIndex === 1 && voice.osc1Node) {
                        try { voice.osc1Node.stop(); } catch(e){}
                        voice.osc1Node = voice.createOscillator(1);
                        voice.osc1Node.connect(voice.osc1Gain);
                    } else if (oscIndex === 2 && voice.osc2Node) {
                        try { voice.osc2Node.stop(); } catch(e){}
                        voice.osc2Node = voice.createOscillator(2);
                        voice.osc2Node.connect(voice.osc2Gain);
                    }
                }
            });
        });
    };

    setupWaveformSelector(1, 'osc1.type');
    setupWaveformSelector(2, 'osc2.type');

    // 9. Bind Filter Option Selector (2 Filter Options)
    // Option A: 24dB Lowpass, Option B: 12dB Highpass
    const filterOptionButtons = document.querySelectorAll('.filter-opt-btn');
    filterOptionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const opt = btn.dataset.option;
            filterOptionButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            engine.setParam('filter.option', opt);
        });
    });

    // 10. Voice Mode Selector (Polyphonic vs Monophonic / Glide)
    const voiceModeBtns = document.querySelectorAll('.mode-btn');
    voiceModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            voiceModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            engine.params.voiceMode = mode;
        });
    });

    // 11. LFO Target & Waveform Selectors
    const lfoWaveBtns = document.querySelectorAll('.lfo-wave-btn');
    lfoWaveBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            lfoWaveBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            engine.setParam('lfo.type', btn.dataset.lfoWave);
        });
    });

    const lfoTargetBtns = document.querySelectorAll('.lfo-target-btn');
    lfoTargetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            lfoTargetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            engine.params.lfo.target = btn.dataset.lfoTarget;
        });
    });

    const lfoToggle = document.getElementById('lfo-toggle-switch');
    if (lfoToggle) {
        lfoToggle.addEventListener('change', (e) => {
            engine.params.lfo.enabled = e.target.checked;
        });
    }

    // 12. Effects Switches
    const bindFxSwitch = (switchId, paramPath) => {
        const sw = document.getElementById(switchId);
        if (sw) {
            sw.addEventListener('change', (e) => {
                engine.setParam(paramPath, e.target.checked);
            });
        }
    };
    bindFxSwitch('fx-dist-switch', 'effects.distortion.enabled');
    bindFxSwitch('fx-delay-switch', 'effects.delay.enabled');
    bindFxSwitch('fx-reverb-switch', 'effects.reverb.enabled');

    // 13. Preset Manager
    const presetSelect = document.getElementById('preset-select');
    const btnSavePreset = document.getElementById('btn-save-preset');
    const btnRandomPreset = document.getElementById('btn-random-preset');

    const updateUIForPreset = (patch, index) => {
        // Sync Waveform buttons
        const syncWaveBtn = (oscIdx, wave) => {
            const btns = document.querySelectorAll(`#osc${oscIdx}-wave-buttons .wave-btn`);
            btns.forEach(b => {
                if (b.dataset.wave === wave) b.classList.add('active');
                else b.classList.remove('active');
            });
        };
        syncWaveBtn(1, patch.params.osc1?.type || engine.params.osc1.type);
        syncWaveBtn(2, patch.params.osc2?.type || engine.params.osc2.type);

        // Sync Crossfader
        if (patch.params.crossfade !== undefined) {
            updateCrossfadeUI(patch.params.crossfade);
        }

        // Sync Filter Option
        const filterOpt = patch.params.filter?.option || engine.params.filter.option;
        filterOptionButtons.forEach(b => {
            if (b.dataset.option === filterOpt) b.classList.add('active');
            else b.classList.remove('active');
        });

        // Sync Voice Mode
        const vMode = patch.params.voiceMode || engine.params.voiceMode;
        voiceModeBtns.forEach(b => {
            if (b.dataset.mode === vMode) b.classList.add('active');
            else b.classList.remove('active');
        });

        // Sync LFO buttons
        if (patch.params.lfo) {
            lfoWaveBtns.forEach(b => {
                if (b.dataset.lfoWave === patch.params.lfo.type) b.classList.add('active');
                else b.classList.remove('active');
            });
            lfoTargetBtns.forEach(b => {
                if (b.dataset.lfoTarget === patch.params.lfo.target) b.classList.add('active');
                else b.classList.remove('active');
            });
            if (lfoToggle) lfoToggle.checked = patch.params.lfo.enabled ?? true;
        }

        // Sync Effects Switches
        if (patch.params.effects) {
            const distSw = document.getElementById('fx-dist-switch');
            if (distSw) distSw.checked = patch.params.effects.distortion?.enabled ?? false;
            const delaySw = document.getElementById('fx-delay-switch');
            if (delaySw) delaySw.checked = patch.params.effects.delay?.enabled ?? false;
            const revSw = document.getElementById('fx-reverb-switch');
            if (revSw) revSw.checked = patch.params.effects.reverb?.enabled ?? false;
        }

        // Sync all rotary knobs
        knobs.forEach(knob => {
            const pathParts = knob.paramPath.split('.');
            let val = patch.params;
            for (const part of pathParts) {
                if (val && val[part] !== undefined) {
                    val = val[part];
                } else {
                    val = null;
                    break;
                }
            }
            if (val !== null && typeof val === 'number') {
                knob.setValue(val, false);
            }
        });
    };

    const presetManager = new SynthPresetManager(engine, (patch, index) => {
        updateUIForPreset(patch, index);
        if (presetSelect && index >= 0) {
            presetSelect.value = index;
        }
    });

    const populatePresetDropdown = () => {
        if (!presetSelect) return;
        presetSelect.innerHTML = '';
        presetManager.presets.forEach((preset, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `[${preset.category}] ${preset.name}`;
            presetSelect.appendChild(opt);
        });
    };

    populatePresetDropdown();

    if (presetSelect) {
        presetSelect.addEventListener('change', (e) => {
            presetManager.applyPreset(parseInt(e.target.value, 10));
        });
    }

    if (btnRandomPreset) {
        btnRandomPreset.addEventListener('click', () => {
            presetManager.randomizePatch();
        });
    }

    if (btnSavePreset) {
        btnSavePreset.addEventListener('click', () => {
            const name = prompt('Enter a name for your custom patch:');
            if (name) {
                const newIdx = presetManager.saveUserPreset(name);
                populatePresetDropdown();
                presetSelect.value = newIdx;
            }
        });
    }

    // Audio Unlock overlay handling for strict browser audio autoplay policy
    const audioOverlay = document.getElementById('audio-unlock-overlay');
    const startAudio = async () => {
        await engine.ensureAudioReady();
        if (audioOverlay) {
            audioOverlay.classList.add('hidden');
        }
    };

    if (audioOverlay) {
        audioOverlay.addEventListener('click', startAudio);
        audioOverlay.addEventListener('touchstart', startAudio, { passive: false });
    }
    window.addEventListener('keydown', () => engine.ensureAudioReady(), { once: true });
    window.addEventListener('mousedown', () => engine.ensureAudioReady(), { once: true });

    // Load first preset by default
    presetManager.applyPreset(0);

    // Expose synth instances globally for WebMCP and external integrations
    window.synth = {
        engine,
        keyboard,
        visualizer,
        recorder,
        presetManager,
        knobs,
        updateUIForPreset
    };
});
