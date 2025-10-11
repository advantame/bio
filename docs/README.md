# Documentation Index

## Active Documents

### Main Guide
- **simulator-and-heatmap-guide.md** - Complete guide for Interactive Simulator & 3D Heatmap
  - Real-time time-series and phase portrait visualization
  - Parameter sweep visualization with video generation
  - Technical implementation and performance optimization

### Technical Details
- **specification.md** - Mathematical model and system equations
- **fft-period-detection.md** - FFT-based period detection (experimental feature)

### Reference
- **reference/Supplementary_Information.md** - Scientific background and kinetic model derivation

## Archived Documents

The `archive/` directory contains documentation for deprecated features:
- Modification Workbench (workbench-simple-mode-plan.md, modification-workbench-*.md)
- Simple Flow UI (handoff-simple-flow-phase7.md)
- Historical development plans (simulation_plan.md, HANDOFF.md, tests.md)
- Performance optimization history (performance-optimization-full-plan.md)

## Quick Start

### For Users
1. Read **simulator-and-heatmap-guide.md** to understand:
   - How to use the Interactive Simulator
   - How to create 2D/3D heatmaps
   - Performance tips and troubleshooting

### For Developers
1. Review **specification.md** for the mathematical model
2. Check **simulator-and-heatmap-guide.md** (Technical Implementation section) for architecture details
3. Current stack: Rust/WASM + Web Workers + IndexedDB

### Build Instructions
```bash
# Build WASM module
wasm-pack build --target web --release --out-dir web/pkg

# Start local server
python3 -m http.server --directory web 8080
```

Access:
- Interactive Simulator: http://localhost:8080/simulator/
- 3D Heatmap: http://localhost:8080/heatmap/

---

**Current Focus**: Interactive Simulator & 3D Heatmap only
**Deprecated Features**: Workbench, Simple Flow, Bifurcation, Contour apps (see archive/)
