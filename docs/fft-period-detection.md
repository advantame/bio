# FFT-Based Period Detection (Experimental)

## Overview

An experimental Fourier transform-based period detection method has been implemented in the legacy heatmap as an alternative to the simple peak-counting method.

## Location

**File**: `/web/heatmap/heatmap.js`

## Toggle

```javascript
// Line 208
const USE_FFT_PERIOD = false;  // Set to true to enable FFT method
```

## Methods Comparison

### Original Method: Peak Counting

**Function**: `evaluatePeriodPeaks(series, startIdx, dt)`

**Algorithm**:
1. Find local maxima using 3-point comparison: `series[i-1] < series[i] > series[i+1]`
2. Calculate intervals between consecutive peaks
3. Return mean interval × dt

**Pros**:
- Fast O(n) complexity
- Simple and interpretable
- Works well for clean, regular oscillations

**Cons**:
- Sensitive to noise (false peaks)
- Requires ≥2 peaks (fails for slow oscillations)
- No noise filtering

### FFT Method: Power Spectrum Analysis

**Function**: `evaluatePeriodFFT(series, startIdx, dt)`

**Algorithm**:
1. Extract analysis window from `startIdx` to end
2. Remove DC component (subtract mean)
3. Compute Discrete Fourier Transform (DFT):
   ```
   For each frequency bin k:
     real = Σ signal[i] × cos(2πki/n)
     imag = Σ signal[i] × sin(2πki/n)
     power[k] = real² + imag²
   ```
4. Find frequency with maximum power
5. Apply noise threshold: `maxPower > 3 × avgPower`
6. Convert to period: `T = (n × dt) / k`

**Pros**:
- Robust to noise
- Detects dominant frequency even with irregular peaks
- Natural noise filtering via power threshold
- Works with quasi-periodic oscillations

**Cons**:
- Slower O(n²) complexity (naive DFT, not FFT)
- May miss period if signal is too noisy
- Frequency resolution limited by signal length

## Implementation Details

### Noise Threshold

```javascript
const avgPower = power.reduce((a,b) => a+b, 0) / power.length;
if (maxPower < 3 * avgPower) return NaN; // No clear oscillation
```

A 3× threshold ensures the dominant peak is significantly above background noise.

### Frequency Resolution

The minimum detectable period is ~4 samples (Nyquist limit).
The maximum detectable period is the signal length.

Resolution: `Δf = 1 / (n × dt)` Hz

### Computational Cost

- **Peak method**: ~1 ms per heatmap cell
- **FFT method**: ~10-50 ms per heatmap cell (depends on signal length)

For a 20×15 heatmap = 300 cells:
- Peak: ~0.3 s
- FFT: ~3-15 s

## Testing Recommendations

### Test Cases

1. **Clean sinusoid**: Both methods should agree
2. **Noisy oscillation**: FFT should be more robust
3. **Damped oscillation**: FFT may perform better
4. **Irregular amplitude**: FFT ignores amplitude variation
5. **Multiple frequencies**: FFT picks dominant frequency

### Example Test

```javascript
// In browser console on heatmap page
USE_FFT_PERIOD = true;  // Enable FFT
// Run heatmap grid
// Compare results with original method
USE_FFT_PERIOD = false; // Disable FFT
// Re-run and compare
```

## Rollback Instructions

To revert to peak-counting method:

```javascript
const USE_FFT_PERIOD = false;  // Already default
```

To remove FFT code entirely:

```bash
git revert <commit-hash>
```

## Future Improvements

If FFT method proves superior:

1. **Optimize**: Implement Fast Fourier Transform (O(n log n))
   - Use existing library (e.g., fft.js, dsp.js)
   - Or implement Cooley-Tukey algorithm

2. **Windowing**: Apply Hann or Hamming window to reduce spectral leakage

3. **Interpolation**: Use parabolic interpolation around peak for sub-bin resolution

4. **Harmonics**: Detect fundamental frequency even when harmonics are present

5. **UI Control**: Add toggle in heatmap interface for user selection

## References

- DFT formula: Discrete Fourier Transform (standard definition)
- Power spectrum: |DFT|² for frequency component magnitudes
- Nyquist frequency: Maximum detectable frequency = 1/(2×dt)
