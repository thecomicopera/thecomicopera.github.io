You don't need a MIDI controller at all! You have **two direct ways to play** right from your computer:

---

### 1. Play with your Computer Keyboard (QWERTY)
The keys on your computer keyboard map directly to the piano keys just like in music production software (Ableton, FL Studio, Logic):

```text
 Black Keys (Sharps):      [W]  [E]        [T]  [Y]  [U]        [O]  [P]
                          (C#) (D#)       (F#) (G#) (A#)       (C#) (D#)
 White Keys:          [A]  [S]  [D]  [F]   [G]  [H]  [J]  [K]   [L]  [;]
                      (C)  (D)  (E)  (F)   (G)  (A)  (B)  (C)   (D)  (E)
```

* **Shift Octaves**: Press **`Z`** to shift down an octave, or **`X`** to shift up an octave.
* **Chords**: You can press multiple keys simultaneously (e.g. `A + D + G` for a C Major chord).

---

### 2. Play with your Mouse or Trackpad
* **Click any key** on the on-screen piano at the bottom of the screen.
* **Glissando (Slide/Strum)**: Click and hold down your mouse button while dragging across the keys to sweep across notes.
* **Pitch & Mod Wheels**: Click and drag the **PITCH** wheel (it automatically springs back to center when released) or the **MOD** wheel.

---

### 3. Quick Test Walkthrough (In your browser at `http://localhost:8080`)

1. **Start Audio**: Click the bright **"INITIALIZE AUDIO"** button on the screen if you haven't already.
2. **Play a note**: Press the **`A`** key on your computer keyboard or click the first white key. You will hear sound and see the oscilloscope visualizer dance in real time.
3. **Test the 4 Waveforms**:
   - In the **OSC 1** section, click **SINE**, then **SQUARE**, then **SAW**, then **NOISE** while pressing a key to hear the distinct harmonic characters.
4. **Test the Crossfader**:
   - Set Osc 1 to **SAW** and Osc 2 to **NOISE**.
   - Drag the **CROSSFADE BLEND** slider back and forth to hear the smooth morphing between tone and noise.
5. **Test the 2 Filter Options**:
   - Click **OPT A: 24dB LOWPASS** and drag the **CUTOFF** knob down to hear a warm, muffled analog tone.
   - Click **OPT B: 12dB HIGHPASS** to cut out the bass and create a bright, thin, cutting lead.
6. **Try Presets**: Click the preset dropdown at the top to select **"Cyberpunk Sub Bass"**, **"Cosmic Ambient Pad"**, or hit **`🎲 RAND`** to generate random synth patches!

---

### 4. Control with AI via WebMCP (Claude Desktop / Cursor)

If you have the MCP bridge set up, you can control the entire synthesizer in natural language directly from your AI chat window. The AI sees 11 live tools connected to the running page — no manual clicking required.

#### Quick Setup Recap
1. Launch Chrome with remote debugging:
   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-synth-profile"
   ```
2. Open synthWeb in that Chrome window (`http://localhost:8080` or the GitHub Pages URL).
3. Confirm the bridge is registered in your Claude Desktop or Cursor config (see `README-MCP.md`).

#### What the AI Can Do

| What you want | Example prompt |
|---|---|
| **Play a chord or melody** | *"Play a C major chord."* |
| **Tune the filter** | *"Set the filter cutoff to 400Hz with resonance at 8."* |
| **Change oscillator waveforms** | *"Switch Osc 1 to sawtooth and Osc 2 to noise, then crossfade 80% to Osc 2."* |
| **Sculpt the ADSR** | *"Give me a slow attack pad: attack 600ms, decay 1s, sustain 0.8, release 2s."* |
| **Add effects** | *"Enable reverb with a 4-second decay and turn off delay."* |
| **Modulate with LFO** | *"Set the LFO to a triangle wave at 0.5Hz targeting the filter."* |
| **Browse presets** | *"List all presets."* |
| **Load a preset** | *"Load the Acid Reso 303 Lead preset."* |
| **Save a patch** | *"Save the current settings as 'Dark Ambient Drone'."* |
| **Record audio** | *"Start recording, play an A minor arpeggio, then stop and return the audio."* |
| **Snapshot the visualizer** | *"Play a bass note and take a screenshot of the oscilloscope."* |

#### Suggested Prompts to Try

**Sound Design:**
> *"Set the filter cutoff to 200Hz, resonance to 14, and play a slow C minor chord so I can hear the low rumble."*

> *"Design a classic 80s lead sound: sawtooth oscillators slightly detuned, fast attack, no reverb, ping-pong delay at 0.3 seconds."*

**Music Performance:**
> *"Play a C major scale ascending from C4 to C5, one note every 300 milliseconds."*

> *"Play a dramatic cinematic chord progression: Am – F – C – G, each chord held for 1 second."*

**Exploration & Randomization:**
> *"List all the presets and describe what each one sounds like based on its settings, then load the one that sounds most like a sci-fi spaceship."*

> *"Randomize the filter cutoff and resonance to something extreme and play a chord so I can hear it."*

**Recording Session:**
> *"Start recording, play a short funky bassline in E minor at 100bpm, stop recording, and give me the audio."*

#### Tips
- The AI **automatically unlocks the AudioContext** on first use — you don't need to click the "INITIALIZE AUDIO" button when using MCP tools.
- **UI knobs and sliders update in real time** when the AI calls `synth.set_params` — watch the browser while chatting.
- You can **combine instructions** in one prompt: *"Load the Cyberpunk Sub Bass preset, then raise the cutoff to 900Hz and play a 4-note descending riff."*
- The AI discovers tools dynamically, so any tool changes in the page are picked up automatically without restarting the bridge.