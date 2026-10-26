/**
 * Web MIDI API Manager
 * Auto-detects connected hardware MIDI controllers and routes
 * Note On, Note Off, Pitch Bend, Mod Wheel CC#1, and Sustain Pedal CC#64.
 */

class SynthMidiManager {
    constructor(engine, keyboard) {
        this.engine = engine;
        this.keyboard = keyboard;
        this.midiAccess = null;
        this.connectedDevices = new Set();
        this.sustainPedalDown = false;
        this.sustainedNotes = new Set();

        this.statusBadge = document.getElementById('midi-status-badge');
        this.init();
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            this.updateStatus('MIDI Not Supported', false);
            return;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            this.updateDeviceList();

            this.midiAccess.onstatechange = (e) => {
                this.updateDeviceList();
            };
        } catch (err) {
            console.warn('Web MIDI Access request denied or failed:', err);
            this.updateStatus('MIDI Disabled', false);
        }
    }

    updateDeviceList() {
        if (!this.midiAccess) return;

        this.connectedDevices.clear();
        let deviceNames = [];

        for (const input of this.midiAccess.inputs.values()) {
            this.connectedDevices.add(input.id);
            deviceNames.push(input.name || 'MIDI Device');
            input.onmidimessage = (e) => this.handleMidiMessage(e);
        }

        if (deviceNames.length > 0) {
            this.updateStatus(`MIDI: ${deviceNames[0]}`, true);
        } else {
            this.updateStatus('MIDI: No Device', false);
        }
    }

    updateStatus(text, isConnected) {
        if (!this.statusBadge) return;
        this.statusBadge.textContent = text;
        if (isConnected) {
            this.statusBadge.classList.add('midi-connected');
            this.statusBadge.classList.remove('midi-disconnected');
        } else {
            this.statusBadge.classList.remove('midi-connected');
            this.statusBadge.classList.add('midi-disconnected');
        }
    }

    handleMidiMessage(event) {
        const [status, data1, data2] = event.data;
        const command = status >> 4;
        const channel = status & 0xf;

        switch (command) {
            case 9: // Note On
                if (data2 > 0) {
                    const velocity = data2 / 127;
                    this.keyboard.playNote(data1, velocity);
                } else {
                    // Velocity 0 is Note Off
                    this.handleMidiNoteOff(data1);
                }
                break;

            case 8: // Note Off
                this.handleMidiNoteOff(data1);
                break;

            case 11: // Control Change (CC)
                if (data1 === 1) {
                    // CC 1: Mod Wheel
                    const norm = data2 / 127;
                    this.engine.setParam('lfo.depth', norm);
                    const modThumb = document.getElementById('wheel-mod-thumb');
                    if (modThumb) modThumb.style.top = `${(1 - norm) * 75}%`;
                    const lfoKnob = document.querySelector('[data-param="lfo.depth"]');
                    if (lfoKnob && lfoKnob.synthKnob) lfoKnob.synthKnob.setValue(norm, false);
                } else if (data1 === 64) {
                    // CC 64: Sustain Pedal
                    this.sustainPedalDown = data2 >= 64;
                    if (!this.sustainPedalDown) {
                        for (const note of Array.from(this.sustainedNotes)) {
                            this.keyboard.stopNote(note);
                        }
                        this.sustainedNotes.clear();
                    }
                }
                break;

            case 14: // Pitch Bend
                // 14-bit value: data1 is LSB, data2 is MSB
                const rawBend = ((data2 << 7) | data1) - 8192; // -8192 to +8191
                const bendNorm = (rawBend / 8192) * 2; // +/- 2 semitones
                const pitchThumb = document.getElementById('wheel-pitch-thumb');
                if (pitchThumb) {
                    const thumbNorm = 0.5 + (bendNorm / 4);
                    pitchThumb.style.top = `${(1 - thumbNorm) * 75}%`;
                }
                for (const voice of this.engine.activeVoices.values()) {
                    const now = this.engine.ctx.currentTime;
                    const bentFreq = this.engine.midiToFreq(voice.midiNote + bendNorm);
                    if (voice.osc1Node && voice.osc1Node.frequency) {
                        voice.osc1Node.frequency.setTargetAtTime(voice.computeFreq(bentFreq, this.engine.params.osc1), now, 0.01);
                    }
                    if (voice.osc2Node && voice.osc2Node.frequency) {
                        voice.osc2Node.frequency.setTargetAtTime(voice.computeFreq(bentFreq, this.engine.params.osc2), now, 0.01);
                    }
                }
                break;
        }
    }

    handleMidiNoteOff(midiNote) {
        if (this.sustainPedalDown) {
            this.sustainedNotes.add(midiNote);
        } else {
            this.keyboard.stopNote(midiNote);
        }
    }
}

window.SynthMidiManager = SynthMidiManager;
