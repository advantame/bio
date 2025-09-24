use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn simulate(beta: f64, delta: f64, lam: f64, n0_nm: f64, p0_nm: f64, g_in: f64) -> Vec<f32> {
    // MATLABと同じ定数・時間離散
    let kmp = 34.0;
    let n_pts = 2601usize; // 0..=2600
    let mut tau = vec![0.0f64; n_pts];
    for i in 0..n_pts {
        tau[i] = (i as f64) / 2.6;
    }

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
        let (k2n, k2p) = rhs(n + h * k1n / 2.0, p + h * k1p / 2.0, beta, delta, lam, g);
        let (k3n, k3p) = rhs(n + h * k2n / 2.0, p + h * k2p / 2.0, beta, delta, lam, g);
        let (k4n, k4p) = rhs(n + h * k3n, p + h * k3p, beta, delta, lam, g);

        n += (h / 6.0) * (k1n + 2.0 * k2n + 2.0 * k3n + k4n);
        p += (h / 6.0) * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);

        if n < 0.0 {
            n = 0.0;
        }
        if p < 0.0 {
            p = 0.0;
        }

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
    let dnd = (g * n) / (1.0 + beta * g * n) - (p * n) - ((lam * delta * n) / (1.0 + p));
    let dpd = (p * n) - ((delta * p) / (1.0 + p));
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
            pol,
            rec,
            g,
            k1_eff,
            k2,
            k_n,
            k_p,
            b,
            km_p,
        );
        let (k3n, k3p) = rhs_phys(
            n + 0.5 * dt * k2n,
            p + 0.5 * dt * k2p,
            pol,
            rec,
            g,
            k1_eff,
            k2,
            k_n,
            k_p,
            b,
            km_p,
        );
        let (k4n, k4p) = rhs_phys(
            n + dt * k3n,
            p + dt * k3p,
            pol,
            rec,
            g,
            k1_eff,
            k2,
            k_n,
            k_p,
            b,
            km_p,
        );

        n += (dt / 6.0) * (k1n + 2.0 * k2n + 2.0 * k3n + k4n);
        p += (dt / 6.0) * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);

        if n < 0.0 {
            n = 0.0;
        }
        if p < 0.0 {
            p = 0.0;
        }

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
// Modification helpers (k1/b remapping for association/polymerase/nicking rates)
// -----------------------------------------------------------------------------

/// Parameters describing how a modification perturbs the elementary rates.
#[wasm_bindgen]
pub struct ModificationParams {
    r_assoc: f64,
    r_poly: f64,
    r_nick: f64,
    use_hairpin: bool,
    ddelta_g_fold: f64,
}

#[wasm_bindgen]
impl ModificationParams {
    #[wasm_bindgen(constructor)]
    pub fn new(r_assoc: f64, r_poly: f64, r_nick: f64) -> ModificationParams {
        ModificationParams {
            r_assoc,
            r_poly,
            r_nick,
            use_hairpin: false,
            ddelta_g_fold: 0.0,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn r_assoc(&self) -> f64 {
        self.r_assoc
    }

    #[wasm_bindgen(setter)]
    pub fn set_r_assoc(&mut self, value: f64) {
        self.r_assoc = value;
    }

    #[wasm_bindgen(getter)]
    pub fn r_poly(&self) -> f64 {
        self.r_poly
    }

    #[wasm_bindgen(setter)]
    pub fn set_r_poly(&mut self, value: f64) {
        self.r_poly = value;
    }

    #[wasm_bindgen(getter)]
    pub fn r_nick(&self) -> f64 {
        self.r_nick
    }

    #[wasm_bindgen(setter)]
    pub fn set_r_nick(&mut self, value: f64) {
        self.r_nick = value;
    }

    #[wasm_bindgen(getter)]
    pub fn use_hairpin(&self) -> bool {
        self.use_hairpin
    }

    #[wasm_bindgen(setter)]
    pub fn set_use_hairpin(&mut self, value: bool) {
        self.use_hairpin = value;
    }

    #[wasm_bindgen(getter)]
    pub fn ddelta_g_fold(&self) -> f64 {
        self.ddelta_g_fold
    }

    #[wasm_bindgen(setter)]
    pub fn set_ddelta_g_fold(&mut self, value: f64) {
        self.ddelta_g_fold = value;
    }
}

/// Effective parameters (k1, b) after applying modification ratios.
#[wasm_bindgen]
pub struct EffectiveParams {
    k1_eff: f64,
    b_eff: f64,
}

#[wasm_bindgen]
impl EffectiveParams {
    #[wasm_bindgen(getter)]
    pub fn k1_eff(&self) -> f64 {
        self.k1_eff
    }

    #[wasm_bindgen(getter)]
    pub fn b_eff(&self) -> f64 {
        self.b_eff
    }
}

/// Map base (k1, b) to effective values given modification ratios.
#[wasm_bindgen]
pub fn map_modification(base_k1: f64, base_b: f64, params: &ModificationParams) -> EffectiveParams {
    let r_assoc = params.r_assoc;
    let r_poly = params.r_poly;
    let r_nick = if params.r_nick.abs() < std::f64::EPSILON {
        std::f64::EPSILON
    } else {
        params.r_nick
    };

    let k1_eff = base_k1 * (r_assoc * r_poly / r_nick);
    let b_eff = base_b * (r_assoc / r_nick);

    EffectiveParams { k1_eff, b_eff }
}
