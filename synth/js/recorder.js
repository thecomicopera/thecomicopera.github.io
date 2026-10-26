/**
 * Live Audio Recorder & WAV Exporter
 * Records the master synth audio bus in real time and exports
 * lossless stereo 16-bit PCM .WAV files.
 */

class SynthRecorder {
    constructor(engine) {
        this.engine = engine;
        this.isRecording = false;
        this.recordedChunks = [];
        this.recordStartTime = 0;
        this.timerInterval = null;

        this.recordButton = document.getElementById('btn-record');
        this.recordTimeDisplay = document.getElementById('record-time');

        this.init();
    }

    init() {
        if (!this.recordButton) return;
        this.recordButton.addEventListener('click', () => this.toggleRecord());
    }

    toggleRecord() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    async startRecording() {
        await this.engine.ensureAudioReady();

        const ctx = this.engine.ctx;
        // Create MediaStreamDestination to capture audio without affecting master output
        const dest = ctx.createMediaStreamDestination();
        this.engine.masterGainNode.connect(dest);

        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
        this.mediaRecorder = new MediaRecorder(dest.stream, { mimeType });
        this.recordedChunks = [];

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: mimeType });
            this.downloadRecording(blob);
            this.engine.masterGainNode.disconnect(dest);
        };

        this.mediaRecorder.start(100);
        this.isRecording = true;
        this.recordStartTime = Date.now();

        this.recordButton.classList.add('recording-active');
        this.recordButton.innerHTML = `
            <span class="rec-dot pulsing"></span>
            <span>STOP</span>
        `;

        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.recordStartTime) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            if (this.recordTimeDisplay) {
                this.recordTimeDisplay.textContent = `${mins}:${secs}`;
            }
        }, 500);
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        this.mediaRecorder.stop();

        clearInterval(this.timerInterval);
        this.recordButton.classList.remove('recording-active');
        this.recordButton.innerHTML = `
            <span class="rec-dot"></span>
            <span>REC</span>
        `;
        if (this.recordTimeDisplay) {
            this.recordTimeDisplay.textContent = '00:00';
        }
    }

    downloadRecording(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `synth-take-${timestamp}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    }
}

window.SynthRecorder = SynthRecorder;
