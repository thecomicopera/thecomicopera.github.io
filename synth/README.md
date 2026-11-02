# AURORA-X // Subtractive Synthesizer

A dual-oscillator subtractive synthesizer playable directly in modern web browsers, engineered with the Web Audio API and modern HTML5/CSS3.

## Features

### 1. Dual Oscillators & 4 Selectable Waveforms
- **Oscillator 1 & Oscillator 2**: Independent waveform selectors, octave switching (-2 to +2), semitone tuning (-12 to +12 st), and fine tuning (-50 to +50 cents).
- **4 Selectable Waveforms**:
  - `Sine`: Pure, warm fundamental tone
  - `Square`: Rich odd-harmonic pulse wave
  - `Saw` (Sawtooth): Classic bright brass and cutting lead waveform
  - `Noise`: Looped stereo white/pink noise buffer generator for percussive hits, breath sounds, and ambient sweeps
- **Equal-Power Crossfader**: Smooth blend control transitioning from 100% Osc 1 to 100% Osc 2 with real-time percentage indicators.

### 2. Subtractive Filter with 2 Filter Options
- **Filter Option A**: 24dB Cascaded Resonant Lowpass (warm analog ladder-style slope)
- **Filter Option B**: 12dB Sculpting Highpass (for carving low-end and thin chiptunes/leads)
- **Bandpass Mode**: Resonant bandpass filter
- **Controls**: Logarithmic Cutoff Frequency (20Hz - 20,000Hz), Resonance (Q factor 0.5 - 20), Envelope Modulation Depth (-8000Hz to +8000Hz), and Key Tracking (0 - 100%).

### 3. Envelopes & Modulation
- **Dual ADSR Envelopes**:
  - **Amplifier Envelope**: Attack (1ms - 4s), Decay (10ms - 5s), Sustain (0 - 100%), Release (10ms - 5s)
  - **Filter Envelope**: Attack, Decay, Sustain, Release
- **LFO Modulation Matrix**:
  - Waveforms: Sine, Triangle, Saw, Square
  - Destinations: Filter Cutoff, Pitch (Vibrato), Amplifier (Tremolo)
  - Rate (0.1Hz - 20Hz) and Depth controls
- **Voicing Modes**: Selectable Polyphonic mode (up to 10 voices with voice stealing) and Monophonic mode with Portamento / Glide.

### 4. Studio Effects Rack & Real-Time Scope
- **Warm Overdrive / Distortion**: Soft-clipping hyperbolic tangent curve
- **Stereo Ping-Pong Delay**: Time, Feedback, Damping, and Mix
- **Algorithmic Reverb**: Space decay time and Wet/Dry mix
- **Master Visualizer**: Switchable between zero-crossing stabilized CRT Oscilloscope (time domain) and FFT Spectrum Analyzer (frequency domain).

### 5. Multi-Input Playability
- **On-Screen Piano Keyboard**: 3 octaves with glissando drag, multi-touch polyphony, and visual key press states.
- **Computer Keyboard**: QWERTY keys `[A]` through `[K]` mapped to piano notes, `[Z]` (Octave Down) and `[X]` (Octave Up).
- **Pitch Bend & Modulation Wheels**: Spring-loaded pitch bend wheel (+/- 2 semitones) and sticky mod wheel.
- **Web MIDI API**: Plug & play support for USB and Bluetooth MIDI controllers (Note On/Off, Velocity, Pitch Bend, Mod Wheel CC#1, Sustain Pedal CC#64).
- **Built-in Performance Recorder**: Record audio in real time and download as WebM/audio file.
- **Preset Library**: 8 factory patches, user preset saving via LocalStorage, and a patch randomizer dice button.

## Running Locally

Run a local HTTP server:
```bash
python -m http.server 8080
```
or
```bash
npx serve
```
Open [http://localhost:8080](http://localhost:8080) in your web browser.
