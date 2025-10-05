// Utilities for managing modification cards and applying effective parameters
// across the simulator pages. Stored data lives in localStorage so it can be
// shared among all pages without a dedicated backend.

const STORAGE_KEY_MODS = 'pp_workbench_modifications_v1';
const STORAGE_KEY_ACTIVE = 'pp_workbench_active_mod_v1';
const STORAGE_KEY_OVERLAY = 'pp_workbench_overlay_mods_v1';

export const GAS_CONSTANT_KCAL = 0.00198720425864083; // kcal mol^-1 K^-1

function defaultState() {
  return [];
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

export function loadModifications() {
  return readLocalMods();
}

export function saveModifications(mods) {
  writeLocalMods(mods);
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

function temperatureToKelvin(tempC) {
  return (tempC ?? 25) + 273.15;
}

export function resolveRAssoc(mod) {
  if (!mod) return 1;
  if (mod.rAssoc && mod.rAssoc > 0) return mod.rAssoc;
  if (typeof mod.deltaDeltaGAssoc === 'number') {
    const T = temperatureToKelvin(mod.temperatureC ?? 25);
    return Math.exp(-mod.deltaDeltaGAssoc / (GAS_CONSTANT_KCAL * T));
  }
  return 1;
}

export function resolveDeltaFromRAssoc(mod) {
  if (!mod) return 0;
  if (typeof mod.deltaDeltaGAssoc === 'number') return mod.deltaDeltaGAssoc;
  if (mod.rAssoc && mod.rAssoc > 0) {
    const T = temperatureToKelvin(mod.temperatureC ?? 25);
    return -Math.log(mod.rAssoc) * GAS_CONSTANT_KCAL * T;
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
  if (!mod || !mod.useHairpin) return 1;
  if (typeof mod.deltaDeltaGFold !== 'number') return 1;
  const T = temperatureToKelvin(mod.temperatureC ?? 25);
  const delta = mod.deltaDeltaGFold;
  const denom = Math.exp(delta / (GAS_CONSTANT_KCAL * T));
  return 1 / (1 + denom);
}

export function computeEffectiveParameters(baseParams, mod) {
  const rAssoc = resolveRAssoc(mod);
  const rPoly = mod?.rPoly && mod.rPoly > 0 ? mod.rPoly : 1;
  const rNick = mod?.rNick && mod.rNick > 0 ? mod.rNick : 1;

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
  const mods = loadModifications();
  const idx = mods.findIndex((m) => m.id === mod.id);
  if (idx >= 0) mods[idx] = { ...mods[idx], ...mod };
  else mods.push(mod);
  saveModifications(mods);
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
  if (typeof modFactor !== 'number' || modFactor === 1) return null;
  return {
    id: `legacy-${Date.now()}`,
    label: `Legacy mod_factor ${modFactor.toFixed(2)}`,
    temperatureC: 25,
    rPoly: modFactor,
    rNick: 1,
    rAssoc: 1,
    notes: 'Imported from legacy mod_factor',
  };
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
