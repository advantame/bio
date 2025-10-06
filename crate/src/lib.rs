use wasm_bindgen::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};

#[wasm_bindgen]
pub fn simulate(beta: f64, delta: f64, lam: f64, n0_nm: f64, p0_nm: f64, g_in: f64) -> Vec<f32> {
    // MATLABと同じ定数・時間離散
    let kmp = 34.0;
    let n_pts = 2601usize; // 0..=2600
    let mut tau = vec![0.0f64; n_pts];
    for i in 0..n_pts { tau[i] = (i as f64) / 2.6; }

    // 初期条件（無次元）
    let mut n = n0_nm / kmp;
    let mut p = p0_nm / kmp;
    let g = g_in / 53.0;

    // RK4
    let mut prey_nm: Vec<f32> = Vec::with_capacity(n_pts);
    let mut pred_nm: Vec<f32> = Vec::with_capacity(n_pts);
    prey_nm.push((400.0 - n * kmp) as f32);
    pred_nm.push((p * kmp) as f32);

    for i in 0..(n_pts - 1) {
        let h = tau[i + 1] - tau[i];
        let (k1n, k1p) = rhs(n, p, beta, delta, lam, g);
        let (k2n, k2p) = rhs(n + h*k1n/2.0, p + h*k1p/2.0, beta, delta, lam, g);
        let (k3n, k3p) = rhs(n + h*k2n/2.0, p + h*k2p/2.0, beta, delta, lam, g);
        let (k4n, k4p) = rhs(n + h*k3n,     p + h*k3p,     beta, delta, lam, g);

        n += (h/6.0) * (k1n + 2.0*k2n + 2.0*k3n + k4n);
        p += (h/6.0) * (k1p + 2.0*k2p + 2.0*k3p + k4p);

        if n < 0.0 { n = 0.0; }
        if p < 0.0 { p = 0.0; }

        prey_nm.push((400.0 - n * kmp) as f32);
        pred_nm.push((p * kmp) as f32);
    }

    // [prey..., pred...] の連結で返す
    let mut out = Vec::with_capacity(2 * n_pts);
    out.extend(prey_nm);
    out.extend(pred_nm);
    out
}

#[inline]
fn rhs(n: f64, p: f64, beta: f64, delta: f64, lam: f64, g: f64) -> (f64, f64) {
    let dnd = (g*n) / (1.0 + beta*g*n) - (p*n) - ((lam*delta*n) / (1.0 + p));
    let dpd = (p*n) - ((delta*p) / (1.0 + p));
    (dnd, dpd)
}

// -----------------------------------------------------------------------------
// Physical-parameter formulation (SI S3 Eq. 3,4) with amino-acid modification
// -----------------------------------------------------------------------------

/// Simulate the physical ODEs using RK4 and return [N_series..., P_series...]
///
/// Parameters (use consistent units, typically minutes and nM):
/// - pol, rec: enzyme concentrations (scaling factors in the original model)
/// - G: template DNA concentration
/// - k1, k2: growth/capture efficiencies
/// - kN, kP: degradation efficiencies for N and P
/// - b: saturation strength for N growth
/// - KmP: Michaelis-Menten constant for P degradation (K_{m,P})
/// - N0, P0: initial concentrations [nM]
/// - mod_factor: multiplicative modifier for k1 (1.0=no modification)
/// - t_end_min: total simulated time in minutes (e.g., 2600)
/// - dt_min: time step in minutes (e.g., 1.0)
#[wasm_bindgen]
pub fn simulate_physical(
    pol: f64,
    rec: f64,
    g: f64,
    k1: f64,
    k2: f64,
    k_n: f64,
    k_p: f64,
    b: f64,
    km_p: f64,
    n0: f64,
    p0: f64,
    mod_factor: f64,
    t_end_min: f64,
    dt_min: f64,
) -> Vec<f32> {
    // Guardrails
    let dt = if dt_min > 0.0 { dt_min } else { 1.0 };
    let steps = ((t_end_min / dt).round() as i64).max(1) as usize;

    // Initial conditions (physical units: nM)
    let mut n = n0.max(0.0);
    let mut p = p0.max(0.0);

    // Pre-allocate output buffers
    let mut n_series: Vec<f32> = Vec::with_capacity(steps + 1);
    let mut p_series: Vec<f32> = Vec::with_capacity(steps + 1);
    n_series.push(n as f32);
    p_series.push(p as f32);

    // Effective k1 with modification factor
    let k1_eff = (k1 * mod_factor).max(0.0);

    // RHS in physical variables (N, P)
    #[inline]
    fn rhs_phys(
        n: f64,
        p: f64,
        pol: f64,
        rec: f64,
        g: f64,
        k1_eff: f64,
        k2: f64,
        k_n: f64,
        k_p: f64,
        b: f64,
        km_p: f64,
    ) -> (f64, f64) {
        let growth = k1_eff * pol * g * (n / (1.0 + b * g * n));
        let predation = k2 * pol * n * p;
        let deg_n = rec * k_n * (n / (1.0 + (p / km_p)));
        let deg_p = rec * k_p * (p / (1.0 + (p / km_p)));
        let dn = growth - predation - deg_n;
        let dp = predation - deg_p;
        (dn, dp)
    }

    // RK4 loop
    for _ in 0..steps {
        let (k1n, k1p) = rhs_phys(n, p, pol, rec, g, k1_eff, k2, k_n, k_p, b, km_p);
        let (k2n, k2p) = rhs_phys(
            n + 0.5 * dt * k1n,
            p + 0.5 * dt * k1p,
            pol, rec, g, k1_eff, k2, k_n, k_p, b, km_p,
        );
        let (k3n, k3p) = rhs_phys(
            n + 0.5 * dt * k2n,
            p + 0.5 * dt * k2p,
            pol, rec, g, k1_eff, k2, k_n, k_p, b, km_p,
        );
        let (k4n, k4p) = rhs_phys(
            n + dt * k3n,
            p + dt * k3p,
            pol, rec, g, k1_eff, k2, k_n, k_p, b, km_p,
        );

        n += (dt / 6.0) * (k1n + 2.0 * k2n + 2.0 * k3n + k4n);
        p += (dt / 6.0) * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);

        if n < 0.0 { n = 0.0; }
        if p < 0.0 { p = 0.0; }

        n_series.push(n as f32);
        p_series.push(p as f32);
    }

    // Concatenate [N..., P...]
    let mut out = Vec::with_capacity(n_series.len() + p_series.len());
    out.extend(n_series);
    out.extend(p_series);
    out
}

// -----------------------------------------------------------------------------
// Performance-optimized simulation with metric evaluation (no data export)
// -----------------------------------------------------------------------------

/// Simulate and evaluate metric in one call (eliminates data transfer overhead)
///
/// This function runs the same simulation as simulate_physical but evaluates
/// the metric directly in Rust and returns only the final f64 value.
///
/// Parameters: Same as simulate_physical
/// - metric: "amplitude", "period", or "period_fft"
/// - tail_pct: Percentage of tail to analyze (0-100)
///
/// Returns: Metric value (f64) or NaN if metric cannot be computed
#[wasm_bindgen]
pub fn simulate_and_evaluate(
    pol: f64,
    rec: f64,
    g: f64,
    k1: f64,
    k2: f64,
    k_n: f64,
    k_p: f64,
    b: f64,
    km_p: f64,
    n0: f64,
    p0: f64,
    mod_factor: f64,
    t_end_min: f64,
    dt_min: f64,
    metric: &str,
    tail_pct: f64,
) -> f64 {
    // Guardrails
    let dt = if dt_min > 0.0 { dt_min } else { 1.0 };
    let steps = ((t_end_min / dt).round() as i64).max(1) as usize;

    // Initial conditions (physical units: nM)
    let mut n = n0.max(0.0);
    let mut p = p0.max(0.0);

    // Pre-allocate P series only (we only need P for metrics)
    let mut p_series: Vec<f32> = Vec::with_capacity(steps + 1);
    p_series.push(p as f32);

    // Effective k1 with modification factor
    let k1_eff = (k1 * mod_factor).max(0.0);

    // RHS in physical variables (N, P)
    #[inline]
    fn rhs_phys(
        n: f64,
        p: f64,
        pol: f64,
        rec: f64,
        g: f64,
        k1_eff: f64,
        k2: f64,
        k_n: f64,
        k_p: f64,
        b: f64,
        km_p: f64,
    ) -> (f64, f64) {
        let growth = k1_eff * pol * g * (n / (1.0 + b * g * n));
        let predation = k2 * pol * n * p;
        let deg_n = rec * k_n * (n / (1.0 + (p / km_p)));
        let deg_p = rec * k_p * (p / (1.0 + (p / km_p)));
        let dn = growth - predation - deg_n;
        let dp = predation - deg_p;
        (dn, dp)
    }

    // RK4 loop
    for _ in 0..steps {
        let (k1n, k1p) = rhs_phys(n, p, pol, rec, g, k1_eff, k2, k_n, k_p, b, km_p);
        let (k2n, k2p) = rhs_phys(
            n + 0.5 * dt * k1n,
            p + 0.5 * dt * k1p,
            pol, rec, g, k1_eff, k2, k_n, k_p, b, km_p,
        );
        let (k3n, k3p) = rhs_phys(
            n + 0.5 * dt * k2n,
            p + 0.5 * dt * k2p,
            pol, rec, g, k1_eff, k2, k_n, k_p, b, km_p,
        );
        let (k4n, k4p) = rhs_phys(
            n + dt * k3n,
            p + dt * k3p,
            pol, rec, g, k1_eff, k2, k_n, k_p, b, km_p,
        );

        n += (dt / 6.0) * (k1n + 2.0 * k2n + 2.0 * k3n + k4n);
        p += (dt / 6.0) * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);

        if n < 0.0 { n = 0.0; }
        if p < 0.0 { p = 0.0; }

        p_series.push(p as f32);
    }

    // Evaluate metric on P series tail
    let start_idx = ((p_series.len() as f64) * (1.0 - tail_pct / 100.0).max(0.0).min(1.0)) as usize;
    let start_idx = start_idx.min(p_series.len().saturating_sub(1));

    match metric {
        "amplitude" => evaluate_amplitude(&p_series, start_idx),
        "period" => evaluate_period_peaks(&p_series, start_idx, dt),
        "period_fft" => evaluate_period_fft(&p_series, start_idx, dt),
        _ => f64::NAN,
    }
}

/// Calculate amplitude (max - min) in the tail region
fn evaluate_amplitude(series: &[f32], start_idx: usize) -> f64 {
    if start_idx >= series.len() {
        return f64::NAN;
    }

    let mut min = f32::INFINITY;
    let mut max = f32::NEG_INFINITY;

    for &v in &series[start_idx..] {
        if v < min { min = v; }
        if v > max { max = v; }
    }

    if min.is_finite() && max.is_finite() {
        (max - min) as f64
    } else {
        f64::NAN
    }
}

/// Calculate period using peak detection (3-point comparison)
fn evaluate_period_peaks(series: &[f32], start_idx: usize, dt: f64) -> f64 {
    if start_idx + 2 >= series.len() {
        return f64::NAN;
    }

    // Find peaks: series[i] > series[i-1] && series[i] > series[i+1]
    let mut peaks = Vec::new();
    for i in (start_idx + 1)..(series.len() - 1) {
        if series[i] > series[i - 1] && series[i] > series[i + 1] {
            peaks.push(i);
        }
    }

    if peaks.len() < 2 {
        return f64::NAN;
    }

    // Calculate mean interval between consecutive peaks
    let sum: usize = peaks.windows(2).map(|w| w[1] - w[0]).sum();
    let mean_step = sum as f64 / (peaks.len() - 1) as f64;

    mean_step * dt
}

/// Calculate period using FFT-based frequency detection
fn evaluate_period_fft(series: &[f32], start_idx: usize, dt: f64) -> f64 {
    let n = series.len() - start_idx;
    if n < 4 {
        return f64::NAN;
    }

    // Remove DC component (mean)
    let mean: f32 = series[start_idx..].iter().sum::<f32>() / n as f32;
    let mut signal: Vec<Complex<f32>> = series[start_idx..]
        .iter()
        .map(|&v| Complex::new(v - mean, 0.0))
        .collect();

    // Run FFT
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);
    fft.process(&mut signal);

    // Compute power spectrum (only first half, up to Nyquist frequency)
    let n_half = n / 2;
    let power: Vec<f32> = signal[1..n_half]
        .iter()
        .map(|c| c.norm_sqr())
        .collect();

    if power.is_empty() {
        return f64::NAN;
    }

    // Find peak in power spectrum
    let (max_k, max_power) = power
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(k, &p)| (k + 1, p))
        .unwrap_or((1, 0.0));

    // Apply noise threshold (require 3× average power for significant oscillation)
    let avg_power: f32 = power.iter().sum::<f32>() / power.len() as f32;
    if max_power < 3.0 * avg_power {
        return f64::NAN;
    }

    // Convert frequency bin to period
    // Period = (n * dt) / k
    (n as f64 * dt) / max_k as f64
}
