/**
 * Settings Manager - Persists and manages machine configuration
 */

export class Settings {
    constructor() {
        this.defaults = {
            bedWidth: 914,      // 3 feet in mm
            bedHeight: 610,     // 2 feet in mm
            feedRate: 3000,     // Drawing speed mm/min
            travelRate: 6000,   // Rapid travel speed mm/min
            penUpCmd: 'G0 Z5',
            penDownCmd: 'G1 Z0',
            workerUrl: '',
            curveResolution: 10,
            simplifyTolerance: 2
        };

        this.load();
    }

    load() {
        const saved = localStorage.getItem('void-satellite-settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                Object.assign(this, this.defaults, parsed);
            } catch (e) {
                Object.assign(this, this.defaults);
            }
        } else {
            Object.assign(this, this.defaults);
        }
    }

    save() {
        const data = {
            bedWidth: this.bedWidth,
            bedHeight: this.bedHeight,
            feedRate: this.feedRate,
            travelRate: this.travelRate,
            penUpCmd: this.penUpCmd,
            penDownCmd: this.penDownCmd,
            workerUrl: this.workerUrl,
            curveResolution: this.curveResolution,
            simplifyTolerance: this.simplifyTolerance
        };
        localStorage.setItem('void-satellite-settings', JSON.stringify(data));
    }

    update(newSettings) {
        Object.assign(this, newSettings);
        this.save();
    }

    reset() {
        Object.assign(this, this.defaults);
        this.save();
    }
}
