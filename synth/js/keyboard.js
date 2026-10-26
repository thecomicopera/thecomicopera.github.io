/**
 * Interactive Onscreen Piano Keyboard, Computer Keybinds & Wheels
 * Supports mouse drag glissando, multi-touch polyphony, QWERTY mapping,
 * octave shifting, pitch bend spring wheel, and mod wheel.
 */

class SynthKeyboard {
    constructor(container, engine, options = {}) {
        this.container = container;
        this.engine = engine;

        this.baseOctave = options.baseOctave ?? 4; // C4 default middle
        this.numOctaves = options.numOctaves ?? 3; // 3 on-screen octaves
        this.showLabels = true;

        this.activeKeys = new Set();
        this.touchMap = new Map(); // identifier -> midiNote
        this.isMouseDown = false;

        // Pitch bend state
        this.pitchBendSemi = 0;
        this.pitchBendMax = 2; // +/- 2 semitones

        // Computer keyboard mapping
        this.keyMap = {
            // Octave 1
            'KeyA': 0,  // C
            'KeyW': 1,  // C#
            'KeyS': 2,  // D
            'KeyE': 3,  // D#
            'KeyD': 4,  // E
            'KeyF': 5,  // F
            'KeyT': 6,  // F#
            'KeyG': 7,  // G
            'KeyY': 8,  // G#
            'KeyH': 9,  // A
            'KeyU': 10, // A#
            'KeyJ': 11, // B
            // Octave 2
            'KeyK': 12, // C+1
            'KeyO': 13, // C#+1
            'KeyL': 14, // D+1
            'KeyP': 15, // D#+1
            'Semicolon': 16, // E+1
            'Quote': 17 // F+1
        };

        this.keyToMidiNote = new Map(); // e.g. 'KeyA' -> 60

        this.init();
    }

    init() {
        this.renderKeys();
        this.bindMouseAndTouch();
        this.bindComputerKeyboard();
        this.bindPitchAndModWheels();
    }

    renderKeys() {
        this.container.innerHTML = '';
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const startMidi = (this.baseOctave - 1) * 12; // e.g. C3 if baseOctave=4
        const totalNotes = this.numOctaves * 12 + 1;  // +1 for top C

        // 1. Separate into white keys and black keys
        const whiteKeys = [];
        const blackKeys = [];

        for (let i = 0; i < totalNotes; i++) {
            const midiNote = startMidi + i;
            const noteIndex = midiNote % 12;
            const noteName = notes[noteIndex];
            const isBlack = noteName.includes('#');
            const octave = Math.floor(midiNote / 12) - 1;

            if (isBlack) {
                blackKeys.push({ midiNote, noteName, octave, whitePredecessorIdx: whiteKeys.length - 1 });
            } else {
                whiteKeys.push({ midiNote, noteName, octave });
            }
        }

        const totalWhite = whiteKeys.length;

        // 2. Render White Keys
        whiteKeys.forEach((wk, index) => {
            const keyEl = document.createElement('div');
            keyEl.className = 'synth-key white-key';
            keyEl.dataset.midi = wk.midiNote;
            keyEl.dataset.note = `${wk.noteName}${wk.octave}`;

            const labelEl = document.createElement('span');
            labelEl.className = 'key-label';
            const keybind = this.getKeybindLabel(wk.midiNote);
            labelEl.innerHTML = `${wk.noteName}${wk.octave}${keybind ? `<small>${keybind}</small>` : ''}`;
            keyEl.appendChild(labelEl);

            this.container.appendChild(keyEl);
        });

        // 3. Render Black Keys (positioned absolutely)
        const whiteKeyPct = 100 / totalWhite;
        const blackWidthPct = whiteKeyPct * 0.65;

        blackKeys.forEach(bk => {
            const keyEl = document.createElement('div');
            keyEl.className = 'synth-key black-key';
            keyEl.dataset.midi = bk.midiNote;
            keyEl.dataset.note = `${bk.noteName}${bk.octave}`;

            // Centered between the white key and next white key
            const leftPct = (bk.whitePredecessorIdx + 1) * whiteKeyPct - (blackWidthPct / 2);
            keyEl.style.left = `${leftPct}%`;
            keyEl.style.width = `${blackWidthPct}%`;

            const labelEl = document.createElement('span');
            labelEl.className = 'key-label';
            const keybind = this.getKeybindLabel(bk.midiNote);
            labelEl.innerHTML = `${bk.noteName}${bk.octave}${keybind ? `<small>${keybind}</small>` : ''}`;
            keyEl.appendChild(labelEl);

            this.container.appendChild(keyEl);
        });
    }

    getKeybindLabel(midiNote) {
        const rootMidi = (this.baseOctave - 1) * 12;
        const offset = midiNote - rootMidi;
        for (const [code, semi] of Object.entries(this.keyMap)) {
            if (semi === offset) {
                return code.replace('Key', '').replace('Semicolon', ';').replace('Quote', "'");
            }
        }
        return '';
    }

    shiftOctave(delta) {
        const newOctave = Math.max(1, Math.min(6, this.baseOctave + delta));
        if (newOctave !== this.baseOctave) {
            this.engine.allNotesOff();
            this.baseOctave = newOctave;
            this.renderKeys();
            if (this.onOctaveChange) {
                this.onOctaveChange(this.baseOctave);
            }
        }
    }

    playNote(midiNote, velocity = 0.9) {
        if (this.activeKeys.has(midiNote)) return;
        this.activeKeys.add(midiNote);

        this.highlightKey(midiNote, true);
        this.engine.noteOn(midiNote, velocity);
    }

    stopNote(midiNote) {
        if (!this.activeKeys.has(midiNote)) return;
        this.activeKeys.delete(midiNote);

        this.highlightKey(midiNote, false);
        this.engine.noteOff(midiNote);
    }

    highlightKey(midiNote, isActive) {
        const keyEl = this.container.querySelector(`[data-midi="${midiNote}"]`);
        if (keyEl) {
            if (isActive) {
                keyEl.classList.add('key-pressed');
            } else {
                keyEl.classList.remove('key-pressed');
            }
        }
    }

    bindMouseAndTouch() {
        // Mouse Glissando
        this.container.addEventListener('mousedown', (e) => {
            const keyEl = e.target.closest('.synth-key');
            if (keyEl) {
                this.isMouseDown = true;
                const midi = parseInt(keyEl.dataset.midi, 10);
                this.playNote(midi);
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isMouseDown) {
                this.isMouseDown = false;
                for (const midi of Array.from(this.activeKeys)) {
                    this.stopNote(midi);
                }
            }
        });

        this.container.addEventListener('mouseover', (e) => {
            if (!this.isMouseDown) return;
            const keyEl = e.target.closest('.synth-key');
            if (keyEl) {
                const midi = parseInt(keyEl.dataset.midi, 10);
                // Stop any other notes if single touch or keep
                for (const activeMidi of Array.from(this.activeKeys)) {
                    if (activeMidi !== midi) this.stopNote(activeMidi);
                }
                this.playNote(midi);
            }
        });

        // Multi-touch Polyphony
        this.container.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTouches(e.touches);
        }, { passive: false });

        this.container.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleTouches(e.touches);
        }, { passive: false });

        this.container.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleTouches(e.touches);
        }, { passive: false });

        this.container.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.handleTouches(e.touches);
        }, { passive: false });
    }

    handleTouches(touches) {
        const currentTouchMidis = new Set();

        for (let i = 0; i < touches.length; i++) {
            const touch = touches[i];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const keyEl = target ? target.closest('.synth-key') : null;
            if (keyEl) {
                const midi = parseInt(keyEl.dataset.midi, 10);
                currentTouchMidis.add(midi);
                if (!this.activeKeys.has(midi)) {
                    this.playNote(midi);
                }
            }
        }

        // Release any touches that left
        for (const activeMidi of Array.from(this.activeKeys)) {
            if (!currentTouchMidis.has(activeMidi)) {
                this.stopNote(activeMidi);
            }
        }
    }

    bindComputerKeyboard() {
        window.addEventListener('keydown', (e) => {
            // Ignore if user typing into an input/textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Octave controls: Z = Down, X = Up
            if (e.code === 'KeyZ' && !e.repeat) {
                e.preventDefault();
                this.shiftOctave(-1);
                return;
            }
            if (e.code === 'KeyX' && !e.repeat) {
                e.preventDefault();
                this.shiftOctave(1);
                return;
            }

            if (this.keyMap.hasOwnProperty(e.code) && !e.repeat) {
                e.preventDefault();
                const rootMidi = (this.baseOctave - 1) * 12;
                const midi = rootMidi + this.keyMap[e.code];
                this.keyToMidiNote.set(e.code, midi);
                this.playNote(midi);
            }
        });

        window.addEventListener('keyup', (e) => {
            if (this.keyToMidiNote.has(e.code)) {
                e.preventDefault();
                const midi = this.keyToMidiNote.get(e.code);
                this.keyToMidiNote.delete(e.code);
                this.stopNote(midi);
            }
        });
    }

    bindPitchAndModWheels() {
        const pitchWheel = document.getElementById('wheel-pitch');
        const pitchThumb = document.getElementById('wheel-pitch-thumb');
        const modWheel = document.getElementById('wheel-mod');
        const modThumb = document.getElementById('wheel-mod-thumb');

        if (!pitchWheel || !modWheel) return;

        // Pitch Bend (Spring return to 0.5 center)
        let isPitchDragging = false;
        let startPitchY = 0;

        const setPitch = (norm) => {
            // norm: 0.0 (bottom, -2 semi) to 1.0 (top, +2 semi), center 0.5
            const clamped = Math.max(0, Math.min(1, norm));
            pitchThumb.style.top = `${(1 - clamped) * 75}%`;

            const semiOffset = (clamped - 0.5) * 2 * this.pitchBendMax;
            // Apply pitch bend to active voices
            for (const voice of this.engine.activeVoices.values()) {
                const now = this.engine.ctx.currentTime;
                const bentFreq = this.engine.midiToFreq(voice.midiNote + semiOffset);
                if (voice.osc1Node && voice.osc1Node.frequency) {
                    voice.osc1Node.frequency.setTargetAtTime(voice.computeFreq(bentFreq, this.engine.params.osc1), now, 0.01);
                }
                if (voice.osc2Node && voice.osc2Node.frequency) {
                    voice.osc2Node.frequency.setTargetAtTime(voice.computeFreq(bentFreq, this.engine.params.osc2), now, 0.01);
                }
            }
        };

        const onPitchMove = (e) => {
            if (!isPitchDragging) return;
            const rect = pitchWheel.getBoundingClientRect();
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const norm = 1 - ((clientY - rect.top) / rect.height);
            setPitch(norm);
        };

        const onPitchEnd = () => {
            if (isPitchDragging) {
                isPitchDragging = false;
                // Snap smoothly back to center
                setPitch(0.5);
            }
        };

        pitchWheel.addEventListener('mousedown', (e) => {
            isPitchDragging = true;
            onPitchMove(e);
        });
        pitchWheel.addEventListener('touchstart', (e) => {
            isPitchDragging = true;
            onPitchMove(e);
        }, { passive: false });

        window.addEventListener('mousemove', onPitchMove);
        window.addEventListener('touchmove', onPitchMove, { passive: false });
        window.addEventListener('mouseup', onPitchEnd);
        window.addEventListener('touchend', onPitchEnd);

        // Mod Wheel (Sticky position 0.0 to 1.0)
        let isModDragging = false;
        const setMod = (norm) => {
            const clamped = Math.max(0, Math.min(1, norm));
            modThumb.style.top = `${(1 - clamped) * 75}%`;
            // Modulate LFO Depth or Filter Cutoff based on settings
            this.engine.setParam('lfo.depth', clamped);
            const lfoKnob = document.querySelector('[data-param="lfo.depth"]');
            if (lfoKnob && lfoKnob.synthKnob) {
                lfoKnob.synthKnob.setValue(clamped, false);
            }
        };

        const onModMove = (e) => {
            if (!isModDragging) return;
            const rect = modWheel.getBoundingClientRect();
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const norm = 1 - ((clientY - rect.top) / rect.height);
            setMod(norm);
        };

        modWheel.addEventListener('mousedown', (e) => {
            isModDragging = true;
            onModMove(e);
        });
        modWheel.addEventListener('touchstart', (e) => {
            isModDragging = true;
            onModMove(e);
        }, { passive: false });

        window.addEventListener('mousemove', onModMove);
        window.addEventListener('touchmove', onModMove, { passive: false });
        window.addEventListener('mouseup', () => { isModDragging = false; });
        window.addEventListener('touchend', () => { isModDragging = false; });
    }
}

window.SynthKeyboard = SynthKeyboard;
