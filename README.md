# Void-Satellite 🛰️

AI-powered raster-to-vector-to-G-code converter for CNC pen plotters.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![GRBL](https://img.shields.io/badge/GRBL-compatible-green.svg)

## Features

- 🤖 **AI-Powered Vectorization** - Cloudflare Workers AI for intelligent edge detection
- ✏️ **Interactive Vector Editor** - Draw, edit, and manipulate paths with Fabric.js
- 📐 **Precision Grid** - mm ruler overlay with 100mm major / 10mm minor grid
- 🎯 **GRBL Compatible** - Generates clean G-code for Arduino CNC Shield
- ⚡ **Client-Side Processing** - Falls back to local edge detection when offline
- 🎬 **Toolpath Simulation** - Animate and visualize pen movement before cutting

## Use Case

Designed for **RC hobby plane foam cutting templates** - trace your plans, edit the paths, and generate precise G-code for your CNC plotter.

## Machine Configuration

| Setting | Default |
|---------|---------|
| Work Area | 914mm × 610mm (3' × 2') |
| Draw Speed | 3000 mm/min |
| Travel Speed | 6000 mm/min |
| Pen Up | `G0 Z5` |
| Pen Down | `G1 Z0` |

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Cloudflare Worker (AI Backend)

```bash
cd worker
npm install
npm run dev     # Local development
npm run deploy  # Deploy to Cloudflare
```

## Project Structure

```
void-satellite/
├── index.html          # Main HTML
├── index.css           # Premium dark theme
├── src/
│   ├── main.js         # App orchestrator
│   ├── vectorEditor.js # Fabric.js editor
│   ├── gcodeGenerator.js # Path to G-code
│   ├── gcodeTerminal.js  # Editable G-code
│   ├── preview.js      # Toolpath preview
│   ├── aiTracer.js     # AI/edge detection
│   └── settings.js     # Machine config
└── worker/
    ├── wrangler.toml   # Worker config
    └── src/index.js    # AI endpoints
```

## G-code Output Example

```gcode
; Void-Satellite CNC Plotter
; Work Area: 914mm × 610mm

G21 ; mm mode
G90 ; absolute positioning

; --- Path 1 ---
G0 Z5 ; pen up
G0 X10.00 Y20.00 F6000 ; travel
G1 Z0 ; pen down
G1 X50.00 Y20.00 F3000
G1 X50.00 Y80.00 F3000
...

M2 ; end program
```

## Tech Stack

- **Frontend**: Vite + Vanilla JS
- **Vector Editor**: Fabric.js
- **AI Backend**: Cloudflare Workers AI
- **Styling**: Custom CSS (dark theme, glassmorphism)

## License

MIT

---

Made with ❤️ for the RC hobby community
