# CLAUDE.md — Quick Context for AI Assistants

**⚠️ IMPORTANT: When project structure or focus changes, UPDATE THIS FILE FIRST.**

## Current Project Status (2025-10-11)

This project focuses on **Interactive Simulator & 3D Heatmap** only.

- **Active:** `/web/simulator/` (time-series visualization) & `/web/heatmap/` (parameter sweep)
- **Archived:** `/web/archive/`, `/docs/archive/` — DO NOT modify unless explicitly requested
- **Tech:** Rust/WASM + JavaScript + Web Workers + IndexedDB

---

## Documentation Map

**Start here for any task:**

| File | Read this when... |
|------|-------------------|
| [`/docs/simulator-and-heatmap-guide.md`](/docs/simulator-and-heatmap-guide.md) | Understanding features, implementation, or performance |
| [`/docs/specification.md`](/docs/specification.md) | Working with mathematical model or equations |
| [`/docs/README.md`](/docs/README.md) | Navigating documentation structure |
| [`/crate/src/lib.rs`](/crate/src/lib.rs) | Modifying simulation logic (requires `wasm-pack build`) |
| [`/web/core.js`](/web/core.js) | Understanding Rust ↔ JavaScript bridge |

**Build & run instructions:** See `/docs/simulator-and-heatmap-guide.md` § Build Instructions

---

## Update Protocol

When making significant changes:

1. ✅ **Update this file** if project scope/structure changes
2. ✅ **Update `/docs/simulator-and-heatmap-guide.md`** for user-facing changes
3. ✅ **Update `/docs/README.md`** if documentation structure changes
4. ✅ **Commit with clear message** (format: `[Area] Brief description`)

---

**Last Updated:** 2025-10-11 | **Next Review:** When project scope changes
