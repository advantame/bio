# Documentation Index

## Active Documents

### Project Overview
- **specification.md** - Complete project specification with mathematical models
- **new-Implementation-request.md** - Simple Flow requirements and design

### Development Plans
- **modification-workbench-development-plan.md** - Milestone tracking (A-D)
- **modification-workbench-roadmap.md** - Priority queue for features
- **workbench-simple-mode-plan.md** - Simple Flow phase-by-phase implementation plan

### Implementation Details
- **fft-period-detection.md** - FFT period detection implementation (experimental feature)
- **tests.md** - Regression testing and performance testing harness

### Current State (as of 2025-10-07)
- **Phase 2A Complete**: Web Workers parallelization (15-40x speedup for heatmaps)
- **Simple Flow Phase 7 Complete**: KaTeX integration & Japanese UI
- **Simple Flow Phase 8 Pending**: QA & Documentation
- **Phase 3 (WebGPU)**: Rolled back due to browser compatibility issues

## Archived Documents

### Performance Optimization (Phase 3 Rollback)
- **archive/performance-optimization-full-plan.md** - Full optimization plan (Phase 1-3, including rolled-back WebGPU)
- **archive/handoff-performance-phase1.md** - Phase 1 handoff (Rust integration & Web Workers)

### Historical Handoffs
- **archive/handoff-simple-flow-phase7.md** - Simple Flow Phase 7 handoff document
- **archive/plan.md** - Original development plan (mod_factor era)

## Quick Start

For new contributors:
1. Read **specification.md** to understand the mathematical model
2. Review **modification-workbench-development-plan.md** for current milestones
3. Check **HANDOFF.md** for the latest state and next tasks

For performance optimization:
- See **archive/performance-optimization-full-plan.md** for context
- Current implementation uses Rust (Phase 1) + Web Workers (Phase 2A)
- WebGPU (Phase 3) was rolled back

For Simple Flow development:
- Follow **workbench-simple-mode-plan.md**
- Current progress: Phase 0-7 complete, Phase 8 pending
