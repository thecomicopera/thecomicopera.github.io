# synthWeb MCP Control (WebMCP Architecture)

Control the **synthWeb (AURORA-X)** subtractive synthesizer live in your browser from AI assistants such as **Claude Desktop** and **Cursor** using the W3C Web Model Context Protocol (WebMCP) client-side architecture.

---

## Architecture Overview

```
+-------------------------------------------------------+
|  AI Assistant (Claude Desktop / Cursor)               |
+-------------------------------------------------------+
                           |
                           | stdio (JSON-RPC MCP Protocol)
                           v
+-------------------------------------------------------+
|  Local Node.js Bridge (bridge/index.js)               |
|  - Stateless routing glue (zero synth business logic) |
|  - Dynamic tool discovery via CDP                     |
|  - Trusted CDP mouse dispatch for AudioContext unlock |
+-------------------------------------------------------+
                           |
                           | Chrome DevTools Protocol (CDP, port 9222)
                           v
+-------------------------------------------------------+
|  Running Chrome Browser (synthWeb Tab)                |
|  - document.modelContext (WebMCP Polyfill)            |
|  - Plain HTML + ES Modules (No build step)            |
|  - Direct in-page control of live SynthAudioEngine    |
|  - Full UI synchronization (knobs, sliders, keys)     |
+-------------------------------------------------------+
```

1. **Browser Tab (synthWeb)**:
   - Registers all synthesizer tools directly on `document.modelContext` using `@mcp-b/webmcp-polyfill`.
   - Tool handlers interact directly with live in-memory instances (`window.synth.engine`, `window.synth.keyboard`, `window.synth.visualizer`, etc.).
   - No build step or bundler required; runs as native static HTML + ES modules.
2. **Local Node.js Bridge (`bridge/`)**:
   - Speaks standard Model Context Protocol (MCP) over `stdio` to the AI client.
   - Forwards `tools/list` dynamically from `document.modelContext.getTools()`.
   - Forwards `tools/call` to `document.modelContext.executeTool()`.
   - Before the first tool execution in a session, dispatches a trusted CDP mouse event (`Input.dispatchMouseEvent`) to bypass browser audio autoplay restrictions and engages `engine.ensureAudioReady()`.
   - Generic: contains zero synth-specific logic, schemas, or tool names.

---

## Quickstart Guide

### 1. Launch Chrome with Remote Debugging Enabled

Close existing Chrome instances or launch a dedicated instance with `--remote-debugging-port=9222`:

#### Windows:
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-synth-profile"
```

#### macOS:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-synth-profile
```

#### Linux:
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-synth-profile
```

### 2. Open synthWeb

In the launched Chrome window, navigate to your synthWeb instance:
- **Hosted GitHub Pages**: `https://thecomicopera.github.io/synthWeb/`
- **Or Local HTTP Server**:
  ```bash
  # Inside repo root
  npx serve . -p 8000
  ```
  Navigate to `http://localhost:8000`.

### 3. Install Bridge Dependencies

```bash
cd bridge
npm install
```

---

## AI Client Configuration

### Claude Desktop

Edit your Claude Desktop configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the `synthweb` MCP server entry under `mcpServers`:

```json
{
  "mcpServers": {
    "synthweb": {
      "command": "node",
      "args": [
        "./bridge/index.js",
        "--remote-debugging-port=9222",
        "--target-url=synthWeb"
      ]
    }
  }
}
```

*(Path is relative to the repository root. On Windows with Claude Desktop you may need an absolute path if relative resolution fails.)*.

### Cursor

In Cursor:
1. Open **Settings** -> **Features** -> **MCP Servers**.
2. Click **Add New MCP Server**.
3. Configure:
   - **Name**: `synthweb`
   - **Type**: `command`
   - **Command**: `node /absolute/path/to/synthWeb/bridge/index.js --remote-debugging-port=9222`

Or add to `.cursor/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "synthweb": {
      "command": "node",
      "args": [
        "${workspaceFolder}/bridge/index.js",
        "--remote-debugging-port=9222",
        "--target-url=synthWeb"
      ]
    }
  }
}
```

---

## Available MCP Tools

All tools are discovered dynamically from `document.modelContext`:

| Tool | Parameters | Description |
|---|---|---|
| `synth.get_state` | None | Returns a complete snapshot of all synthesizer parameters, active voice count, and current preset index. |
| `synth.set_params` | Object (partial `params`) | Updates synthesizer parameters (oscillators, filters, ADSR, LFO, effects) with real-time audio update and UI knob/slider synchronization. |
| `synth.note_on` | `note` (0-127), `velocity` (0.0-1.0) | Triggers a voice for the specified MIDI note and highlights the on-screen key. |
| `synth.note_off` | `note` (0-127) | Releases the sounding voice for the specified MIDI note. |
| `synth.play_sequence` | `notes`: `[{ note, velocity, duration, time }]` | Plays a timed musical sequence or chord progression with visual keyboard feedback. |
| `synth.list_presets` | None | Lists all factory and custom saved user patches with names and categories. |
| `synth.load_preset` | `index` (int) or `name` (string) | Applies a preset by index or patch name and synchronizes all UI controls. |
| `synth.save_preset` | `name` (string) | Saves current synth settings to browser `localStorage` as a new preset. |
| `synth.record_start` | None | Begins recording the master synth output bus to WebM audio. |
| `synth.record_stop` | None | Stops recording and returns base64-encoded WebM audio data and data URL. |
| `synth.snapshot` | None | Returns an image snapshot of the real-time visualizer canvas (oscilloscope / FFT spectrum) as a PNG data URL. |

---

## Example AI Prompts

Try asking your AI assistant:
- *"Set the filter cutoff to 200Hz, turn on distortion, and play a C major chord."*
- *"List all presets, then load the Cyberpunk Sub Bass patch."*
- *"Play a fast 16th-note synthwave arpeggio in A minor."*
- *"Start recording, play a dramatic chord progression, stop recording, and return the audio."*
- *"Take a snapshot of the visualizer canvas while playing a note."*

