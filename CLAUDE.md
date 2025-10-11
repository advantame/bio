# CLAUDE.md — Quick Context for AI Assistants

**⚠️ IMPORTANT: When project structure or focus changes, UPDATE THIS FILE FIRST.**

## Current Project Status (2025-10-11)

**Active Features:**
- `/web/simulator/` — Interactive time-series & phase portrait visualization
- `/web/heatmap/` — 2D/3D parameter sweep with video generation

**Archived Features (DO NOT modify unless explicitly requested):**
- `/web/archive/` — Workbench, Simple Flow, Bifurcation, Contour, Detail apps
- `/docs/archive/` — Old development plans, handoff notes, roadmaps

**Tech Stack:**
- Rust/WASM (RK4 ODE integration) — `/crate/src/lib.rs`
- JavaScript (UI, visualization) — `/web/simulator/`, `/web/heatmap/`
- Web Workers (parallel execution) — `/web/heatmap/heatmap-worker.js`
- IndexedDB (memory-optimized 3D video) — `/web/heatmap/frame-storage.js`

---

## Quick Reference

### Documentation
- **Main guide**: `/docs/simulator-and-heatmap-guide.md` (read this first)
- **Math model**: `/docs/specification.md`
- **Index**: `/docs/README.md`

### Key Files
| File | Purpose |
|------|---------|
| `/web/core.js` | WASM interface (Rust ↔ JS bridge) |
| `/web/modifications.js` | Parameter variant system |
| `/web/simulator/simulator.js` | Time-series & phase portrait logic |
| `/web/heatmap/heatmap.js` | Parameter sweep & video generation |
| `/web/heatmap/heatmap-worker.js` | Parallel simulation worker |
| `/web/heatmap/frame-storage.js` | IndexedDB streaming layer |
| `/crate/src/lib.rs` | Rust simulation engine |

### Build Commands
```bash
# Build WASM (run from project root)
wasm-pack build --target web --release --out-dir web/pkg

# Local server
python3 -m http.server --directory web 8080

# Access
# http://localhost:8080/           → Landing page
# http://localhost:8080/simulator/  → Interactive Simulator
# http://localhost:8080/heatmap/    → 3D Heatmap
```

---

## Common Tasks

### 1. Modify Simulation Logic
**File:** `/crate/src/lib.rs` (`simulate_physical` function)
**After editing:** Run `wasm-pack build` to recompile

### 2. Update Simulator UI
**Files:** `/web/simulator/simulator.js`, `/web/simulator/simulator.html`
**No rebuild needed** (pure JavaScript)

### 3. Update Heatmap Logic
**Files:** `/web/heatmap/heatmap.js`, `/web/heatmap/heatmap-worker.js`
**No rebuild needed** (pure JavaScript)

### 4. Add New Parameters
1. Update Rust function signature in `/crate/src/lib.rs`
2. Update WASM call in `/web/core.js` (`runSimulationPhysical`)
3. Add UI controls in simulator/heatmap HTML/JS
4. Run `wasm-pack build`

### 5. Performance Optimization
**Current bottlenecks:**
- Heatmap: JavaScript metric evaluation (not WASM simulation)
- 3D video: IndexedDB I/O during rendering
- See `/docs/simulator-and-heatmap-guide.md` § Performance Optimization

---

## Don't Do This

❌ **DO NOT modify archived features** (`/web/archive/`, `/docs/archive/`) unless explicitly asked
❌ **DO NOT add dependencies** without confirming (keep it vanilla JS + Rust + WASM)
❌ **DO NOT use `mod_factor`** (deprecated parameter, kept for compatibility only)
❌ **DO NOT break WASM interface** (many files depend on `simulate_physical` signature)

---

## Project History (TL;DR)

1. **Phase 1**: Rust/WASM migration (replaced pure JS with compiled Rust)
2. **Phase 2A**: Web Workers parallelization (15-40× speedup)
3. **Phase 2B**: IndexedDB streaming (fixed memory crashes on large 3D grids)
4. **Phase 3**: WebGPU attempt → **rolled back** (browser compatibility issues)
5. **2025-10-11**: Archived all features except Simulator & Heatmap (simplified project)

---

## Update Protocol

**When you make significant changes:**

1. Update this file (`CLAUDE.md`) if project structure or focus changes
2. Update `/docs/simulator-and-heatmap-guide.md` for user-facing changes
3. Update `/docs/README.md` if documentation structure changes
4. Commit with clear message describing what changed and why

**Example commit message:**
```
Add GPU acceleration to heatmap

- Implement WebGL compute shaders for metric evaluation
- Update CLAUDE.md to reflect new GPU dependency
- Update simulator-and-heatmap-guide.md with performance benchmarks
```

---

## Questions to Ask User

If unsure, ask:
- "Should I modify the archived features, or only Simulator/Heatmap?"
- "Do you want me to rebuild WASM after this change?"
- "Should this change be documented in the user guide?"
- "Is this a temporary experiment or permanent change?"

---

**Last Updated:** 2025-10-11
**Next Review:** When project scope changes
