/**
 * Interactive Rotary Knob Controller & UI Bindings
 * Supports mouse drag, touch, mouse wheel, double click to reset,
 * and high-resolution SVG ring visualization.
 */

class SynthKnob {
    constructor(element, options = {}) {
        this.el = element;
        this.paramPath = element.dataset.param;
        this.min = parseFloat(element.dataset.min ?? options.min ?? 0);
        this.max = parseFloat(element.dataset.max ?? options.max ?? 1);
        this.step = parseFloat(element.dataset.step ?? options.step ?? 0.01);
        this.defaultValue = parseFloat(element.dataset.default ?? options.default ?? this.min);
        this.value = parseFloat(element.dataset.value ?? this.defaultValue);
        this.unit = element.dataset.unit ?? options.unit ?? '';
        this.curve = element.dataset.curve ?? options.curve ?? 'linear'; // 'linear' | 'log'
        this.precision = parseInt(element.dataset.precision ?? options.precision ?? 2, 10);

        this.onChange = options.onChange || null;

        // Visual elements
        this.ringPath = this.el.querySelector('.knob-ring-progress');
        this.indicator = this.el.querySelector('.knob-indicator');
        this.valueDisplay = this.el.querySelector('.knob-value-display');

        // Drag tracking state
        this.isDragging = false;
        this.startY = 0;
        this.startVal = 0;
        this.sensitivity = 180; // pixels of drag for full range

        this.init();
    }

    init() {
        this.updateVisuals();

        // Mouse events
        this.el.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', () => this.onMouseUp());

        // Touch events
        this.el.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        window.addEventListener('touchend', () => this.onMouseUp());

        // Mouse wheel for quick adjustments
        this.el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Double click to reset to default
        this.el.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.setValue(this.defaultValue);
        });

        // Accessibility keyboard support
        this.el.setAttribute('tabindex', '0');
        this.el.setAttribute('role', 'slider');
        this.el.setAttribute('aria-valuemin', this.min);
        this.el.setAttribute('aria-valuemax', this.max);
        this.el.setAttribute('aria-valuenow', this.value);
        this.el.addEventListener('keydown', (e) => this.onKeyDown(e));
    }

    // Normalized ratio 0.0 to 1.0
    getNormalized() {
        if (this.curve === 'log') {
            const minLog = Math.log(Math.max(1, this.min));
            const maxLog = Math.log(this.max);
            const valLog = Math.log(Math.max(1, this.value));
            return (valLog - minLog) / (maxLog - minLog);
        }
        return (this.value - this.min) / (this.max - this.min);
    }

    setFromNormalized(norm) {
        const clampedNorm = Math.max(0, Math.min(1, norm));
        let val;
        if (this.curve === 'log') {
            const minLog = Math.log(Math.max(1, this.min));
            const maxLog = Math.log(this.max);
            val = Math.exp(minLog + clampedNorm * (maxLog - minLog));
        } else {
            val = this.min + clampedNorm * (this.max - this.min);
        }

        // Snap to step if linear
        if (this.curve === 'linear' && this.step > 0) {
            val = Math.round(val / this.step) * this.step;
        }

        this.setValue(val);
    }

    setValue(newVal, triggerChange = true) {
        this.value = Math.max(this.min, Math.min(this.max, newVal));
        this.updateVisuals();

        this.el.setAttribute('aria-valuenow', this.value);

        if (triggerChange && this.onChange) {
            this.onChange(this.value, this.paramPath);
        }
    }

    updateVisuals() {
        const norm = this.getNormalized();
        // Angle range: -135deg to +135deg (270 degrees total rotation)
        const angle = -135 + (norm * 270);

        if (this.indicator) {
            this.indicator.style.transform = `rotate(${angle}deg)`;
        }

        // SVG stroke-dasharray progress ring
        if (this.ringPath) {
            // Circumference of r=18 is ~113.1, 270deg arc is ~84.8
            const maxArc = 84.82;
            const offset = maxArc * (1 - norm);
            this.ringPath.style.strokeDashoffset = offset;
        }

        if (this.valueDisplay) {
            this.valueDisplay.textContent = this.formatValue(this.value);
        }
    }

    formatValue(val) {
        if (this.unit === 'Hz') {
            if (val >= 1000) return `${(val / 1000).toFixed(1)}k Hz`;
            return `${Math.round(val)} Hz`;
        }
        if (this.unit === 's' || this.unit === 'ms') {
            if (val < 1) return `${Math.round(val * 1000)}ms`;
            return `${val.toFixed(2)}s`;
        }
        if (this.unit === '%') {
            return `${Math.round(val * 100)}%`;
        }
        if (this.unit === 'st' || this.unit === 'oct') {
            return (val > 0 ? `+${val}` : `${val}`) + (this.unit === 'st' ? ' st' : ' oct');
        }
        if (this.unit === 'cents') {
            return (val > 0 ? `+${val}` : `${val}`) + ' c';
        }
        if (this.precision === 0) return `${Math.round(val)}${this.unit}`;
        return `${val.toFixed(this.precision)}${this.unit}`;
    }

    onMouseDown(e) {
        if (e.button !== 0) return; // Primary click only
        e.preventDefault();
        this.isDragging = true;
        this.startY = e.clientY;
        this.startNorm = this.getNormalized();
        document.body.classList.add('knob-dragging-cursor');
    }

    onMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const deltaY = this.startY - e.clientY;
        // Holding shift slows down drag for micro adjustments
        const speedMultiplier = e.shiftKey ? 0.2 : 1.0;
        const normChange = (deltaY / this.sensitivity) * speedMultiplier;
        this.setFromNormalized(this.startNorm + normChange);
    }

    onMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            document.body.classList.remove('knob-dragging-cursor');
        }
    }

    onTouchStart(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        this.isDragging = true;
        this.startY = e.touches[0].clientY;
        this.startNorm = this.getNormalized();
    }

    onTouchMove(e) {
        if (!this.isDragging || e.touches.length !== 1) return;
        e.preventDefault();
        const deltaY = this.startY - e.touches[0].clientY;
        const normChange = deltaY / this.sensitivity;
        this.setFromNormalized(this.startNorm + normChange);
    }

    onWheel(e) {
        e.preventDefault();
        const stepNorm = (e.shiftKey ? 0.01 : 0.04) * (e.deltaY > 0 ? -1 : 1);
        this.setFromNormalized(this.getNormalized() + stepNorm);
    }

    onKeyDown(e) {
        let step = this.step || 0.05;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            this.setValue(this.value + step);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            this.setValue(this.value - step);
        } else if (e.key === 'Home') {
            e.preventDefault();
            this.setValue(this.min);
        } else if (e.key === 'End') {
            e.preventDefault();
            this.setValue(this.max);
        }
    }
}

window.SynthKnob = SynthKnob;
