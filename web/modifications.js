const STORAGE_KEY_MODS = 'pp_workbench_modifications_v1';
const STORAGE_KEY_ACTIVE = 'pp_workbench_active_mod_v1';
const STORAGE_KEY_OVERLAY = 'pp_workbench_overlay_mods_v1';
const STORAGE_KEY_PREFS = 'pp_workbench_prefs_v1';

export const GAS_CONSTANT_KCAL = 0.00198720425864083; // kcal mol^-1 K^-1
const CARD_SCHEMA_VERSION = 2;

export const WORKFLOW_STEP_STATES = Object.freeze({
  incomplete: 'incomplete',
  inProgress: 'in_progress',
  done: 'done',
});
const WORKFLOW_STEP_KEYS = ['design', 'predict', 'identify', 'compare'];

const DEFAULT_WORKFLOW = Object.freeze({
  design: WORKFLOW_STEP_STATES.inProgress,
  predict: WORKFLOW_STEP_STATES.incomplete,
  identify: WORKFLOW_STEP_STATES.incomplete,
  compare: WORKFLOW_STEP_STATES.incomplete,
});

const DEFAULT_PREFS = Object.freeze({
  mode: 'simple',
  lastVisitedStep: null,
});

const DEFAULT_BASE_PARAMS_FOR_DERIVED = Object.freeze({
  pol: 3.7,
  rec: 32.5,
  k1: 0.0020,
  b: 0.000048,
  G: 150,
  k2: 0.0031,
  KmP: 34,
  N0: 10,
});

function defaultState() {
  return [];
}

function defaultPrefs() {
  return { mode: DEFAULT_PREFS.mode, lastVisitedStep: DEFAULT_PREFS.lastVisitedStep };
}

function readLocalMods() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultState();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_MODS);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return defaultState();
  } catch (err) {
    console.warn('[modifications] failed to parse state', err);
    return defaultState();
  }
}

function writeLocalMods(mods) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY_MODS, JSON.stringify(mods));
}

function readPrefs() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultPrefs();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFS);
    if (!raw) return defaultPrefs();
    return normalizePrefs(JSON.parse(raw));
  } catch (err) {
    console.warn('[modifications] failed to parse preferences', err);
    return defaultPrefs();
  }
}

function writePrefs(prefs) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(normalizePrefs(prefs)));
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isPositiveNumber(value) {
  const num = normalizeNumber(value);
  if (num === null || num <= 0) return null;
  return num;
}

function numbersApproximatelyEqual(a, b, epsilon = 1e-9) {
  const numA = normalizeNumber(a);
  const numB = normalizeNumber(b);
  if (numA === null && numB === null) return true;
  if (numA === null || numB === null) return false;
  if (numA === numB) return true;
  const diff = Math.abs(numA - numB);
  const scale = Math.max(1, Math.abs(numA), Math.abs(numB));
  return diff <= epsilon * scale;
}

function temperatureToKelvin(tempC) {
  return (tempC ?? 25) + 273.15;
}

function deltaToRatio(delta, tempC) {
  const normalized = normalizeNumber(delta);
  if (normalized === null) return null;
  const T = temperatureToKelvin(tempC ?? 25);
  return Math.exp(-normalized / (GAS_CONSTANT_KCAL * T));
}

function ratioToDelta(ratio, tempC) {
  const normalized = isPositiveNumber(ratio);
  if (normalized === null) return null;
  const T = temperatureToKelvin(tempC ?? 25);
  return -Math.log(normalized) * GAS_CONSTANT_KCAL * T;
}

function firstPositive(values) {
  for (const value of values ?? []) {
    const candidate = isPositiveNumber(value);
    if (candidate !== null) return candidate;
  }
  return null;
}

function firstFinite(values) {
  for (const value of values ?? []) {
    const candidate = normalizeNumber(value);
    if (candidate !== null) return candidate;
  }
  return null;
}

function sanitizeConcentration(raw, defaultUnit) {
  if (!raw || typeof raw !== 'object') return null;
  const value = isPositiveNumber(raw.value);
  if (value === null) return null;
  const unit = typeof raw.unit === 'string' ? raw.unit : defaultUnit;
  return { value, unit };
}

function cloneConcentration(conc) {
  if (!conc) return null;
  return { value: conc.value, unit: conc.unit };
}

function deriveAssocInputs(mod) {
  if (!mod || typeof mod !== 'object') {
    return { mode: 'ratio', ratio: 1, delta: 0 };
  }
  const src = mod.inputs?.assoc ?? {};
  const modeCandidate = src.mode || mod.assocSource;
  const mode = modeCandidate === 'delta' ? 'delta' : 'ratio';

  let ratio = firstPositive([src.ratio, mod.rAssoc]);
  let delta = firstFinite([src.delta, mode === 'delta' ? mod.deltaDeltaGAssoc : null]);
  const tempC = mod.temperatureC ?? 25;

  if (mode === 'delta') {
    if (delta !== null && ratio === null) {
      ratio = deltaToRatio(delta, tempC);
    } else if (delta === null && ratio !== null) {
      delta = ratioToDelta(ratio, tempC);
    }
  } else {
    if (ratio !== null && delta === null) {
      delta = ratioToDelta(ratio, tempC);
    } else if (ratio === null && delta !== null) {
      ratio = deltaToRatio(delta, tempC);
    }
  }

  if (ratio !== null && ratio <= 0) ratio = null;
  return { mode, ratio, delta };
}

function deriveNbInputs(mod) {
  if (!mod || typeof mod !== 'object') {
    return { mode: 'ratio', ratio: 1, concentration: null, hillExponent: null };
  }
  const src = mod.inputs?.nb ?? {};
  const ratio = firstPositive([src.ratio, mod.rNick]);
  const concentration = sanitizeConcentration(src.concentration, 'u_per_ml');
  const mode = src.mode === 'concentration' && concentration ? 'concentration' : 'ratio';
  const hillCandidate = normalizeNumber(src.hillExponent ?? mod.nbHillExponent);
  const hillExponent = hillCandidate !== null && hillCandidate > 0 ? hillCandidate : null;
  return { mode, ratio, concentration, hillExponent };
}

function deriveSsbInputs(mod) {
  if (!mod || typeof mod !== 'object') {
    return {
      mode: 'ratio',
      ratio: 1,
      concentration: null,
      hairpin: { enabled: false, deltaGFold: null },
    };
  }
  const src = mod.inputs?.ssb ?? {};
  const ratio = firstPositive([src.ratio, mod.rPoly]);
  const concentration = sanitizeConcentration(src.concentration, 'ug_per_ml');
  const mode = src.mode === 'concentration' && concentration ? 'concentration' : 'ratio';
  const hairpinSrc = src.hairpin ?? {};
  const enabled = hairpinSrc.enabled !== undefined ? Boolean(hairpinSrc.enabled) : Boolean(mod.useHairpin);
  const deltaCandidate = firstFinite([hairpinSrc.deltaGFold, mod.deltaDeltaGFold]);
  const hairpin = {
    enabled,
    deltaGFold: deltaCandidate !== null ? deltaCandidate : null,
  };
  return { mode, ratio, concentration, hairpin };
}

function cloneAssocInputs(inputs) {
  return {
    mode: inputs.mode,
    ratio: inputs.ratio ?? null,
    delta: inputs.delta ?? null,
  };
}

function cloneNbInputs(inputs) {
  return {
    mode: inputs.mode,
    ratio: inputs.ratio ?? null,
    concentration: cloneConcentration(inputs.concentration),
    hillExponent: inputs.hillExponent ?? null,
  };
}

function cloneSsbInputs(inputs) {
  const hairpin = inputs.hairpin ?? { enabled: false, deltaGFold: null };
  return {
    mode: inputs.mode,
    ratio: inputs.ratio ?? null,
    concentration: cloneConcentration(inputs.concentration),
    hairpin: {
      enabled: Boolean(hairpin.enabled),
      deltaGFold: hairpin.deltaGFold ?? null,
    },
  };
}

function concentrationsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.unit === b.unit && numbersApproximatelyEqual(a.value, b.value);
}

function hairpinEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Boolean(a.enabled) === Boolean(b.enabled)
    && numbersApproximatelyEqual(a.deltaGFold, b.deltaGFold);
}

function assocEqual(a, b) {
  if (!a || !b) return false;
  return a.mode === b.mode
    && numbersApproximatelyEqual(a.ratio, b.ratio)
    && numbersApproximatelyEqual(a.delta, b.delta);
}

function nbEqual(a, b) {
  if (!a || !b) return false;
  return a.mode === b.mode
    && numbersApproximatelyEqual(a.ratio, b.ratio)
    && concentrationsEqual(a.concentration, b.concentration)
    && numbersApproximatelyEqual(a.hillExponent, b.hillExponent);
}

function ssbEqual(a, b) {
  if (!a || !b) return false;
  return a.mode === b.mode
    && numbersApproximatelyEqual(a.ratio, b.ratio)
    && concentrationsEqual(a.concentration, b.concentration)
    && hairpinEqual(a.hairpin, b.hairpin);
}

function inputsEqual(prev, next) {
  if (!prev || !next) return false;
  return assocEqual(prev.assoc, next.assoc)
    && nbEqual(prev.nb, next.nb)
    && ssbEqual(prev.ssb, next.ssb);
}

function sanitizeWorkflow(mod) {
  const input = mod.workflow || {};
  const workflow = {};
  WORKFLOW_STEP_KEYS.forEach((key) => {
    const value = input[key];
    if (
      value === WORKFLOW_STEP_STATES.incomplete
      || value === WORKFLOW_STEP_STATES.inProgress
      || value === WORKFLOW_STEP_STATES.done
    ) {
      workflow[key] = value;
    } else if (key === 'design') {
      workflow[key] = WORKFLOW_STEP_STATES.inProgress;
    } else {
      workflow[key] = WORKFLOW_STEP_STATES.incomplete;
    }
  });
  return workflow;
}

function workflowsEqual(a, b) {
  return WORKFLOW_STEP_KEYS.every((key) => {
    const aVal = a && a[key] ? a[key] : (key === 'design' ? WORKFLOW_STEP_STATES.inProgress : WORKFLOW_STEP_STATES.incomplete);
    const bVal = b && b[key] ? b[key] : (key === 'design' ? WORKFLOW_STEP_STATES.inProgress : WORKFLOW_STEP_STATES.incomplete);
    return aVal === bVal;
  });
}

function derivedApproximatelyEqual(prev, next) {
  if (!prev) return false;
  const numericKeys = ['rAssoc', 'rPoly', 'rNick', 'k1Eff', 'bEff', 'gEff', 'gEffFold', 'hairpinFactor', 'betaEff'];
  for (const key of numericKeys) {
    if (!numbersApproximatelyEqual(prev[key], next[key])) return false;
  }
  const prevDom = prev.dominance || 'neutral';
  const nextDom = next.dominance || 'neutral';
  return prevDom === nextDom;
}

function normalizeModification(mod) {
  if (!mod || typeof mod !== 'object') {
    return { mod: null, changed: false };
  }
  const next = { ...mod };
  let changed = false;

  const assocInputs = deriveAssocInputs(next);
  const nbInputs = deriveNbInputs(next);
  const ssbInputs = deriveSsbInputs(next);

  const normalizedInputs = {
    assoc: cloneAssocInputs(assocInputs),
    nb: cloneNbInputs(nbInputs),
    ssb: cloneSsbInputs(ssbInputs),
  };

  if (!inputsEqual(next.inputs, normalizedInputs)) {
    changed = true;
  }
  next.inputs = normalizedInputs;

  const resolvedRAssoc = isPositiveNumber(assocInputs.ratio)
    ?? (assocInputs.delta !== null ? deltaToRatio(assocInputs.delta, next.temperatureC) : null)
    ?? 1;
  if (!numbersApproximatelyEqual(next.rAssoc, resolvedRAssoc)) {
    next.rAssoc = resolvedRAssoc;
    changed = true;
  }

  if (assocInputs.mode === 'delta') {
    const deltaValue = normalizeNumber(assocInputs.delta);
    if (deltaValue === null) {
      if (next.deltaDeltaGAssoc !== undefined) {
        delete next.deltaDeltaGAssoc;
        changed = true;
      }
    } else if (!numbersApproximatelyEqual(next.deltaDeltaGAssoc, deltaValue)) {
      next.deltaDeltaGAssoc = deltaValue;
      changed = true;
    }
  } else if (next.deltaDeltaGAssoc !== undefined) {
    delete next.deltaDeltaGAssoc;
    changed = true;
  }

  const assocMode = assocInputs.mode === 'delta' ? 'delta' : 'ratio';
  if (next.assocSource !== assocMode) {
    next.assocSource = assocMode;
    changed = true;
  }

  const resolvedRNick = isPositiveNumber(nbInputs.ratio) ?? 1;
  if (!numbersApproximatelyEqual(next.rNick, resolvedRNick)) {
    next.rNick = resolvedRNick;
    changed = true;
  }

  if (nbInputs.hillExponent !== null) {
    if (!numbersApproximatelyEqual(next.nbHillExponent, nbInputs.hillExponent)) {
      next.nbHillExponent = nbInputs.hillExponent;
      changed = true;
    }
  } else if (next.nbHillExponent !== undefined) {
    delete next.nbHillExponent;
    changed = true;
  }

  const resolvedRPoly = isPositiveNumber(ssbInputs.ratio) ?? 1;
  if (!numbersApproximatelyEqual(next.rPoly, resolvedRPoly)) {
    next.rPoly = resolvedRPoly;
    changed = true;
  }

  const hairpinEnabled = Boolean(ssbInputs.hairpin?.enabled);
  if (Boolean(next.useHairpin) !== hairpinEnabled) {
    next.useHairpin = hairpinEnabled;
    changed = true;
  }

  const hairpinDelta = ssbInputs.hairpin?.deltaGFold;
  if (hairpinDelta === null) {
    if (next.deltaDeltaGFold !== undefined) {
      delete next.deltaDeltaGFold;
      changed = true;
    }
  } else if (!numbersApproximatelyEqual(next.deltaDeltaGFold, hairpinDelta)) {
    next.deltaDeltaGFold = hairpinDelta;
    changed = true;
  }

  const workflow = sanitizeWorkflow(next);
  if (!workflowsEqual(next.workflow, workflow)) {
    next.workflow = workflow;
    changed = true;
  } else {
    next.workflow = workflow;
  }

  if (next.schemaVersion !== CARD_SCHEMA_VERSION) {
    next.schemaVersion = CARD_SCHEMA_VERSION;
    changed = true;
  }

  const derived = computeEffectiveParameters(DEFAULT_BASE_PARAMS_FOR_DERIVED, next);
  const derivedPayload = { ...derived };
  const previousDerived = next.derived;
  if (!derivedApproximatelyEqual(previousDerived, derivedPayload)) {
    derivedPayload.updatedAt = new Date().toISOString();
    next.derived = derivedPayload;
    changed = true;
  } else if (previousDerived && !previousDerived.updatedAt) {
    next.derived = { ...previousDerived, updatedAt: new Date().toISOString() };
    changed = true;
  } else {
    next.derived = previousDerived || derivedPayload;
  }

  return { mod: next, changed };
}

function normalizePrefs(raw) {
  const prefs = defaultPrefs();
  if (!raw || typeof raw !== 'object') return prefs;
  prefs.mode = raw.mode === 'detail' ? 'detail' : 'simple';
  const step = typeof raw.lastVisitedStep === 'string' && WORKFLOW_STEP_KEYS.includes(raw.lastVisitedStep)
    ? raw.lastVisitedStep
    : null;
  prefs.lastVisitedStep = step;
  return prefs;
}

export function upgradeLegacyModifications(rawMods) {
  if (!Array.isArray(rawMods)) {
    return { mods: [], changed: Boolean(rawMods) };
  }
  const upgraded = [];
  let changed = false;
  rawMods.forEach((mod) => {
    if (!mod || typeof mod !== 'object') {
      changed = true;
      return;
    }
    const { mod: normalized, changed: modChanged } = normalizeModification(mod);
    if (normalized) upgraded.push(normalized);
    if (modChanged) changed = true;
  });
  if (upgraded.length !== rawMods.length) changed = true;
  return { mods: upgraded, changed };
}

export function loadModifications() {
  const raw = readLocalMods();
  const { mods, changed } = upgradeLegacyModifications(raw);
  if (changed) writeLocalMods(mods);
  return mods;
}

export function saveModifications(mods) {
  const input = Array.isArray(mods) ? mods : [];
  const { mods: normalized } = upgradeLegacyModifications(input);
  writeLocalMods(normalized);
}

export function loadWorkbenchPrefs() {
  return { ...readPrefs() };
}

export function saveWorkbenchPrefs(prefs) {
  writePrefs(prefs);
}

export function getActiveModificationId() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage.getItem(STORAGE_KEY_ACTIVE);
}

export function setActiveModificationId(id) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (id) window.localStorage.setItem(STORAGE_KEY_ACTIVE, id);
  else window.localStorage.removeItem(STORAGE_KEY_ACTIVE);
}

export function getOverlayModificationIds() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_OVERLAY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((id) => typeof id === 'string');
    return [];
  } catch (err) {
    console.warn('[modifications] failed to parse overlay ids', err);
    return [];
  }
}

export function setOverlayModificationIds(ids) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (ids && ids.length) {
    window.localStorage.setItem(STORAGE_KEY_OVERLAY, JSON.stringify(ids));
  } else {
    window.localStorage.removeItem(STORAGE_KEY_OVERLAY);
  }
}

export function findModification(mods, id) {
  if (!id) return null;
  return mods.find((m) => m && m.id === id) || null;
}

export function getAssocInputs(mod) {
  return cloneAssocInputs(deriveAssocInputs(mod));
}

export function getNbInputs(mod) {
  return cloneNbInputs(deriveNbInputs(mod));
}

export function getSsbInputs(mod) {
  return cloneSsbInputs(deriveSsbInputs(mod));
}

export function resolveRAssoc(mod) {
  const inputs = getAssocInputs(mod);
  const ratio = isPositiveNumber(inputs.ratio);
  if (ratio !== null) return ratio;
  const delta = inputs.delta;
  const converted = deltaToRatio(delta, mod?.temperatureC);
  return converted ?? 1;
}

export function resolveDeltaFromRAssoc(mod) {
  const inputs = getAssocInputs(mod);
  const delta = normalizeNumber(inputs.delta);
  if (delta !== null) return delta;
  const ratio = isPositiveNumber(inputs.ratio);
  if (ratio !== null) {
    const converted = ratioToDelta(ratio, mod?.temperatureC);
    if (converted !== null) return converted;
  }
  return 0;
}

function computeBaseInvariants(params) {
  const { k1, b, G, k2, KmP } = params;
  const safeK2 = k2 !== 0 ? k2 : 1e-12;
  const safeKmP = KmP !== 0 ? KmP : 1e-12;
  const safeK1 = k1 !== 0 ? k1 : 1e-12;
  const baseG = (safeK1 * G) / (safeK2 * safeKmP);
  const baseBeta = (b * safeK2 * safeKmP * safeKmP) / safeK1;
  return { baseG, baseBeta };
}

function computeHairpinFactor(mod) {
  const ssb = getSsbInputs(mod);
  if (!ssb.hairpin?.enabled) return 1;
  const delta = normalizeNumber(ssb.hairpin.deltaGFold);
  if (delta === null) return 1;
  const T = temperatureToKelvin(mod?.temperatureC ?? 25);
  const denom = Math.exp(delta / (GAS_CONSTANT_KCAL * T));
  return 1 / (1 + denom);
}

export function computeEffectiveParameters(baseParams, mod) {
  if (!mod) {
    const { baseG, baseBeta } = computeBaseInvariants(baseParams);
    return {
      rAssoc: 1,
      rPoly: 1,
      rNick: 1,
      k1Eff: baseParams.k1,
      bEff: baseParams.b,
      gEff: baseG,
      gEffFold: baseG,
      hairpinFactor: 1,
      betaEff: baseBeta,
      dominance: 'neutral',
    };
  }

  const assoc = getAssocInputs(mod);
  const nb = getNbInputs(mod);
  const ssb = getSsbInputs(mod);

  const rAssoc = isPositiveNumber(assoc.ratio) ?? 1;
  const rPoly = isPositiveNumber(ssb.ratio) ?? 1;
  const rNick = isPositiveNumber(nb.ratio) ?? 1;

  const k1Eff = baseParams.k1 * (rAssoc * rPoly / rNick);
  const bEff = baseParams.b * (rAssoc / rNick);

  const { baseG, baseBeta } = computeBaseInvariants(baseParams);
  const gEff = baseG * (rAssoc * rPoly / rNick);
  const betaEff = baseBeta / rPoly;

  const gHairpinFactor = computeHairpinFactor(mod);
  const gEffFold = gEff * gHairpinFactor;

  const dominance = determineDominantFactor({ rAssoc, rPoly, rNick });

  return {
    rAssoc,
    rPoly,
    rNick,
    k1Eff,
    bEff,
    gEff,
    gEffFold,
    hairpinFactor: gHairpinFactor,
    betaEff,
    dominance,
  };
}

function determineDominantFactor({ rAssoc, rPoly, rNick }) {
  const eps = 1e-3;
  const logs = [
    { key: 'association', value: Math.abs(Math.log(rAssoc || 1)) },
    { key: 'polymerase', value: Math.abs(Math.log(rPoly || 1)) },
    { key: 'saturation', value: Math.abs(Math.log(rNick || 1)) },
  ];
  logs.sort((a, b) => b.value - a.value);
  if (logs[0].value < eps) return 'neutral';
  if (logs.length < 2 || logs[1].value < 0.3 * logs[0].value) {
    return logs[0].key;
  }
  return 'mixed';
}

export function buildSimulationVariants(baseParams) {
  const mods = loadModifications();
  const activeId = getActiveModificationId();
  const overlayIds = pruneOverlayIds(getOverlayModificationIds(), mods);

  const variants = [];

  const baselineDerived = computeEffectiveParameters(baseParams, null);
  variants.push({
    id: 'baseline',
    label: 'Baseline',
    params: { ...baseParams },
    derived: baselineDerived,
    type: 'baseline',
  });

  const appendedIds = new Set(['baseline']);

  function pushMod(id, type) {
    if (!id || appendedIds.has(id)) return;
    const mod = findModification(mods, id);
    if (!mod) return;
    const derived = computeEffectiveParameters(baseParams, mod);
    const params = { ...baseParams, k1: derived.k1Eff, b: derived.bEff };
    variants.push({ id, label: mod.label || 'Unnamed', params, derived, type, mod });
    appendedIds.add(id);
  }

  pushMod(activeId, 'active');
  for (const oid of overlayIds) pushMod(oid, 'overlay');

  return variants;
}

export function pruneOverlayIds(modIds, mods) {
  const available = new Set((mods || loadModifications()).map((m) => m.id));
  const filtered = (modIds || []).filter((id) => available.has(id));
  if (filtered.length === (modIds || []).length) return filtered;
  setOverlayModificationIds(filtered);
  return filtered;
}

export function ensureActiveExists() {
  const mods = loadModifications();
  const activeId = getActiveModificationId();
  if (!activeId) return null;
  if (mods.some((m) => m.id === activeId)) return activeId;
  setActiveModificationId(null);
  return null;
}

export function upsertModification(mod) {
  if (!mod || typeof mod !== 'object') return;
  const mods = loadModifications();
  const idx = mods.findIndex((m) => m.id === mod.id);
  if (idx >= 0) mods[idx] = { ...mods[idx], ...mod };
  else mods.push(mod);
  const { mods: normalized } = upgradeLegacyModifications(mods);
  writeLocalMods(normalized);
}

export function deleteModification(id) {
  const mods = loadModifications();
  const next = mods.filter((m) => m.id !== id);
  saveModifications(next);
  const activeId = getActiveModificationId();
  if (activeId === id) setActiveModificationId(null);
  const overlays = getOverlayModificationIds();
  if (overlays.includes(id)) {
    setOverlayModificationIds(overlays.filter((v) => v !== id));
  }
}

export function legacyModFactorToModification(modFactor) {
  if (typeof modFactor !== 'number' || !Number.isFinite(modFactor) || modFactor === 1) return null;
  const candidate = {
    id: `legacy-${Date.now()}`,
    label: `Legacy mod_factor ${modFactor.toFixed(2)}`,
    temperatureC: 25,
    rPoly: modFactor,
    rNick: 1,
    rAssoc: 1,
    notes: 'Imported from legacy mod_factor',
    useHairpin: false,
    assocSource: 'ratio',
  };
  const { mods } = upgradeLegacyModifications([candidate]);
  return mods[0] || candidate;
}

export function formatDominanceText(dominance) {
  switch (dominance) {
    case 'association':
      return 'Association-driven';
    case 'polymerase':
      return 'Polymerase-rate driven';
    case 'saturation':
      return 'Nick saturation-driven';
    case 'mixed':
      return 'Mixed factors';
    default:
      return 'Neutral';
  }
}
