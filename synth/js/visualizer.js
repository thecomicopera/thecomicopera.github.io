/**
 * Real-Time Canvas Audio Visualizer
 * Provides zero-crossing oscilloscope (waveform) and FFT spectrum analyzer
 * with high-DPI scaling, neon glow shader effects, and trigger stabilization.
 */

class SynthVisualizer {
    constructor(canvas, engine) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.engine = engine;

        this.mode = 'oscilloscope'; // 'oscilloscope' | 'spectrum'
        this.isRunning = false;
        this.animationId = null;

        // Buffers
        this.timeData = null;
        this.freqData = null;

        // Visual options
        this.primaryColor = '#00f3ff';   // Cyberpunk Cyan
        this.secondaryColor = '#ff007f'; // Neon Magenta
        this.gridColor = 'rgba(255, 255, 255, 0.05)';

        this.idlePhase = 0;

        this.init();
    }

    init() {
        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;

        this.canvas.width = Math.floor(rect.width * dpr);
        this.canvas.height = Math.floor(rect.height * dpr);
        this.ctx.scale(dpr, dpr);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.render();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    setMode(mode) {
        this.mode = mode;
    }

    render() {
        if (!this.isRunning) return;

        this.animationId = requestAnimationFrame(() => this.render());

        const w = this.width;
        const h = this.height;

        // Dark background clearing with motion trail blur
        this.ctx.fillStyle = 'rgba(10, 14, 23, 0.35)';
        this.ctx.fillRect(0, 0, w, h);

        // Draw background grid lines (vintage CRT scope style)
        this.drawGrid(w, h);

        const analyser = this.engine ? this.engine.analyser : null;

        if (!analyser || (this.engine.ctx && this.engine.ctx.state === 'suspended')) {
            this.drawIdleAnimation(w, h);
            return;
        }

        const bufferLength = analyser.fftSize;
        if (!this.timeData || this.timeData.length !== bufferLength) {
            this.timeData = new Float32Array(bufferLength);
            this.freqData = new Uint8Array(analyser.frequencyBinCount);
        }

        analyser.getFloatTimeDomainData(this.timeData);
        analyser.getByteFrequencyData(this.freqData);

        // Check if any audio is playing
        let maxAmp = 0;
        for (let i = 0; i < 256; i++) {
            const abs = Math.abs(this.timeData[i]);
            if (abs > maxAmp) maxAmp = abs;
        }

        if (maxAmp < 0.005) {
            this.drawIdleAnimation(w, h);
            return;
        }

        if (this.mode === 'oscilloscope') {
            this.drawOscilloscope(w, h);
        } else {
            this.drawSpectrum(w, h);
        }
    }

    drawGrid(w, h) {
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = this.gridColor;

        const xDivisions = 8;
        const yDivisions = 6;

        this.ctx.beginPath();
        for (let i = 1; i < xDivisions; i++) {
            const x = (w / xDivisions) * i;
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
        }
        for (let j = 1; j < yDivisions; j++) {
            const y = (h / yDivisions) * j;
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
        }
        this.ctx.stroke();

        // Center crosshair axis
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.12)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, h / 2);
        this.ctx.lineTo(w, h / 2);
        this.ctx.moveTo(w / 2, 0);
        this.ctx.lineTo(w / 2, h);
        this.ctx.stroke();
    }

    // Zero-crossing trigger search for rock-solid oscilloscope stabilization
    findZeroCrossing(data) {
        let minIndex = 0;
        let maxIndex = Math.min(data.length - 512, 1024);
        for (let i = 1; i < maxIndex; i++) {
            if (data[i - 1] < 0 && data[i] >= 0) {
                return i;
            }
        }
        return 0;
    }

    drawOscilloscope(w, h) {
        const offset = this.findZeroCrossing(this.timeData);
        const sliceLength = Math.min(w * 2, this.timeData.length - offset);

        this.ctx.save();
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = this.primaryColor;

        const gradient = this.ctx.createLinearGradient(0, 0, w, 0);
        gradient.addColorStop(0, '#00f3ff');
        gradient.addColorStop(0.5, '#7b2cbf');
        gradient.addColorStop(1, '#ff007f');

        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();

        const step = sliceLength / w;
        for (let x = 0; x < w; x++) {
            const dataIdx = Math.floor(offset + x * step);
            const sample = this.timeData[dataIdx] || 0;
            // Scale and center sample
            const y = (h / 2) - (sample * (h / 2.2));
            if (x === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawSpectrum(w, h) {
        const bins = this.freqData.length;
        const usefulBins = Math.floor(bins * 0.7); // Discard ultra-high inaudible bins

        const barWidth = w / usefulBins;

        this.ctx.save();
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = this.secondaryColor;

        const grad = this.ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, 'rgba(0, 243, 255, 0.2)');
        grad.addColorStop(0.6, 'rgba(123, 44, 191, 0.7)');
        grad.addColorStop(1, '#ff007f');

        this.ctx.beginPath();
        this.ctx.moveTo(0, h);

        for (let i = 0; i < usefulBins; i++) {
            const x = (i / usefulBins) * w;
            const norm = this.freqData[i] / 255.0;
            const barHeight = norm * (h * 0.92);
            const y = h - barHeight;
            this.ctx.lineTo(x, y);
        }

        this.ctx.lineTo(w, h);
        this.ctx.closePath();

        this.ctx.fillStyle = grad;
        this.ctx.fill();

        // Glowing top stroke line
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        for (let i = 0; i < usefulBins; i++) {
            const x = (i / usefulBins) * w;
            const norm = this.freqData[i] / 255.0;
            const barHeight = norm * (h * 0.92);
            const y = h - barHeight;
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawIdleAnimation(w, h) {
        this.idlePhase += 0.03;

        this.ctx.save();
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = 'rgba(0, 243, 255, 0.4)';
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
        this.ctx.lineWidth = 1.5;

        this.ctx.beginPath();
        for (let x = 0; x < w; x++) {
            const t = (x / w) * Math.PI * 4;
            const y = (h / 2) + Math.sin(t + this.idlePhase) * 6 + Math.cos(t * 0.5 - this.idlePhase) * 3;
            if (x === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();

        // Subtle glowing watermark text
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.font = '10px "Inter", "Segoe UI", monospace';
        this.ctx.textAlign = 'right';
        this.ctx.fillText('SUBTRACTIVE SYNTH // READY', w - 12, h - 12);

        this.ctx.restore();
    }
}

window.SynthVisualizer = SynthVisualizer;
