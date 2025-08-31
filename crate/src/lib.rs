use wasm_bindgen::prelude::*;

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
