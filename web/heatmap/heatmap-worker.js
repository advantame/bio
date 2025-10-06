// Web Worker for parallel heatmap computation
// Each worker computes a subset of grid cells independently

import { initWasm, runSimulationAndEvaluate } from '../core.js';

let wasmInitialized = false;

self.onmessage = async function(e) {
  const { workerId, cells, metric, tailPct } = e.data;

  // Initialize WASM once per worker
  if (!wasmInitialized) {
    try {
      await initWasm();
      wasmInitialized = true;
    } catch (error) {
      self.postMessage({
        workerId,
        error: `WASM initialization failed: ${error.message}`
      });
      return;
    }
  }

  // Compute metrics for assigned cells
  const results = [];

  try {
    for (const cell of cells) {
      const { i, j, params, cellIndex } = cell;
      const value = runSimulationAndEvaluate(params, metric, tailPct);
      results.push({ i, j, value, cellIndex });
    }

    // Send results back to main thread
    self.postMessage({
      workerId,
      results,
      cellCount: cells.length
    });
  } catch (error) {
    self.postMessage({
      workerId,
      error: `Computation failed: ${error.message}`,
      partialResults: results
    });
  }
};
