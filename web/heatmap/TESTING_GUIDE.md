# Testing Guide - Memory Optimization

## Quick Test (Recommended First)

### 1. Unit Tests
Open in browser: `/web/heatmap/test-memory.html`

Run all 4 tests in sequence:
1. ✅ **IndexedDB Storage Test** - Verifies frame storage/retrieval
2. ✅ **Memory API Test** - Shows current memory usage (Chrome only)
3. ✅ **Generator Pattern Test** - Confirms on-demand processing works
4. ✅ **Frame Streaming Test** - Tests 100 frames end-to-end

Expected: All tests pass with green checkmarks.

---

## Full Integration Test (Large Simulation)

### 2. Production Test - 50×50×50 Grid

1. **Open heatmap page:**
   ```
   http://localhost:8000/web/heatmap/
   ```

2. **Configure T-axis mode:**
   - ✅ Check "T軸を有効化" (Enable T-axis)
   - T-axis parameter: `G` (or any parameter)
   - T-min: `50`
   - T-max: `300`
   - T-steps: `50`

3. **Configure X and Y axes:**
   - X-axis parameter: `assoc_ddg`
   - X-min: `-5`, X-max: `5`, X-steps: `50`
   - Y-axis parameter: `rec`
   - Y-min: `10`, Y-max: `50`, Y-steps: `50`

4. **Run simulation:**
   - Click "実行" (Run)
   - **Total simulations:** 50 × 50 × 50 = **125,000 runs**

5. **Monitor during execution:**
   - Open Chrome DevTools (F12)
   - Go to: Performance → Memory
   - Watch "JS Heap Size" graph
   - Expected: Should stay < 100 MB peak

6. **Expected behavior:**
   ```
   Progress: 0% → 100% smoothly
   Status: "3D空間シミュレーション実行中..."
   → "並列計算完了"
   → "グローバル範囲を計算中..."
   → "動画エンコード中... 1/50"
   → "動画生成完了"
   ```

7. **Verify results:**
   - ✅ Video plays correctly
   - ✅ No memory errors
   - ✅ Browser didn't crash
   - ✅ Timeline shows T-axis parameter changing

---

## Advanced Testing

### 3. IndexedDB Inspection

**Chrome DevTools:**
1. F12 → Application tab
2. IndexedDB → HeatmapFrameDB → frames
3. Should see 50 entries with:
   - `id`: sessionId_frameIndex
   - `grid`: Float32Array(2500) for 50×50
   - `tVal`: T-axis value
   - `timestamp`: Current time

**Cleanup:**
- Old sessions (>1 hour) auto-deleted on next run
- Manual: Right-click HeatmapFrameDB → Delete database

### 4. Memory Profiling (Chrome)

**Before running:**
1. DevTools → Performance
2. Click "Record" (⚫)
3. Run 50×50×50 simulation
4. Stop recording when video complete

**Analyze:**
- JS Heap timeline should show:
  - Gradual increase during computation (chunked processing)
  - Sharp drops after each chunk (GC working)
  - Stable during video generation
  - **Never exceeds ~100 MB**

**Old behavior (for comparison):**
- Would spike to 200-300 MB
- Eventually crash with "Out of Memory"

### 5. Worker Performance

**Console should show:**
```
✅ 3D grid completed in 32.5s (50×50×50 = 125000 cells)
   Average: 0.26ms per cell
   Mode: Parallel (4 workers)
```

**Verify parallel execution:**
- Status updates every 100ms
- Progress: 0% → 100% in ~30-40 seconds
- 4 workers mentioned in status

---

## Stress Testing

### 6. Extreme Scale (Optional)

**WARNING:** This will take 5-10 minutes!

Configuration:
- X-steps: `75`
- Y-steps: `75`
- T-steps: `75`
- **Total:** 421,875 simulations

Expected results:
- ✅ Should still work without memory errors
- ✅ Peak memory < 150 MB
- ✅ Completion time: ~5-8 minutes

If this fails with memory error, the optimization needs tuning (reduce CHUNK_SIZE).

---

## Troubleshooting

### Memory Error Still Occurs

**Symptoms:**
- Browser crashes
- "Out of Memory" error
- Tab becomes unresponsive

**Solutions:**
1. **Reduce chunk size:**
   ```javascript
   // In heatmap.js, line ~505
   const CHUNK_SIZE = 5000;  // Was 10000
   ```

2. **Increase GC frequency:**
   ```javascript
   // In processChunk(), add after each worker completes:
   forceGCHint();
   ```

3. **Enable Chrome flags:**
   ```
   chrome://flags/#enable-webassembly-threads
   chrome://flags/#enable-shared-array-buffer
   ```

### IndexedDB Quota Exceeded

**Symptoms:**
- Error: "QuotaExceededError"
- Frames not being stored

**Solutions:**
1. Clear old data manually (DevTools → Application → Clear storage)
2. Request larger quota:
   ```javascript
   // In frame-storage.js
   await navigator.storage.persist();
   ```

### Video Generation Fails

**Symptoms:**
- Computation completes but video doesn't play
- MediaRecorder errors

**Solutions:**
1. Check browser support: Chrome/Firefox recommended
2. Verify codec:
   ```javascript
   MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
   // Should return true
   ```

### Slow Performance

**If computation takes >2 minutes for 125k cells:**

1. **Check worker count:**
   ```javascript
   console.log(navigator.hardwareConcurrency);
   // Should be 4+ for modern CPUs
   ```

2. **Verify WASM is loaded:**
   ```javascript
   // In console before running
   await initWasm();
   // Should resolve without errors
   ```

3. **Disable IndexedDB temporarily:**
   ```javascript
   // In runTimeAxisAnimation(), force sequential mode
   const USE_PARALLEL = false;
   ```

---

## Performance Benchmarks

### Target Times (4-core CPU)

| Grid Size | Cells | Time | Memory |
|-----------|-------|------|--------|
| 20×20×20 | 8,000 | ~3s | 20 MB |
| 30×30×30 | 27,000 | ~10s | 35 MB |
| 50×50×50 | 125,000 | ~35s | 75 MB |
| 75×75×75 | 421,875 | ~5min | 120 MB |

**If your times are 2× slower:** Still acceptable, likely CPU-bound.

**If your times are 5× slower:** Something is wrong, check:
- Workers not parallelizing (check console)
- WASM not initialized
- Heavy browser extensions interfering

---

## Success Criteria

All of the following should be true:

- ✅ All 4 unit tests pass (test-memory.html)
- ✅ 50×50×50 simulation completes without errors
- ✅ Peak memory < 100 MB (Chrome DevTools)
- ✅ Video plays correctly with smooth animation
- ✅ Console shows parallel execution (4 workers)
- ✅ No browser crashes or hangs
- ✅ IndexedDB contains frame data during/after execution
- ✅ Old sessions auto-cleaned up (>1 hour)

---

## Reporting Issues

If tests fail, please provide:

1. **Browser version:**
   ```
   chrome://version/
   ```

2. **Console errors:**
   DevTools → Console tab → screenshot

3. **Memory profile:**
   DevTools → Performance → Memory tab → screenshot

4. **Configuration:**
   - Grid dimensions (nx, ny, nt)
   - Parameters used
   - Error message (if any)

5. **IndexedDB state:**
   DevTools → Application → IndexedDB → screenshot
