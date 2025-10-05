// Utilities for managing modification cards and applying effective parameters
// across the simulator pages. Stored data lives in localStorage so it can be
// shared among all pages without a dedicated backend.

const STORAGE_KEY_MODS = 'pp_workbench_modifications_v1';
const STORAGE_KEY_ACTIVE = 'pp_workbench_active_mod_v1';
const STORAGE_KEY_OVERLAY = 'pp_workbench_overlay_mods_v1';
const STORAGE_KEY_PREFS = 'pp_workbench_prefs_v1';

export const GAS_CONSTANT_KCAL = 0.00198720425864083; // kcal mol^-1 K^-1
export const CURRENT_SCHEMA_VERSION = 2;

function defaultState() {
  return [];
}

// ========================================
// Schema Migration (v1 → v2)
// ========================================

/**
 * Upgrades a modification from legacy (v1) to schema v2.
 * v2 introduces nested structure:
 *  - inputs: primary user inputs (concentration, ratios, ΔΔG, etc.)
 *  - derived: cached computed values (k1Eff, bEff, etc.)
 *  - workflow: fit/titration history and metadata
 */
export function upgradeLegacyModifications(mods) {
  if (!Array.isArray(mods)) return [];

  return mods.map((mod) => {
    // Already v2
    if (mod.schemaVersion === 2) return mod;

    // Migrate v1 → v2
    const upgraded = {
      schemaVersion: 2,
      id: mod.id || `mod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      label: mod.label || 'Untitled modification',

      inputs: {
        // Ratio inputs (existing)
        r_assoc: mod.rAssoc ?? 1,
        r_poly: mod.rPoly ?? 1,
        r_nick: mod.rNick ?? 1,

        // ΔΔG inputs
        deltaDeltaGAssoc: mod.deltaDeltaGAssoc ?? null,
        deltaDeltaGFold: mod.deltaDeltaGFold ?? null,

        // Temperature
        temperatureC: mod.temperatureC ?? 37,

        // Hairpin
        useHairpin: mod.useHairpin ?? false,

        // Association lock (which field drives conversion)
        assocLock: mod.assocSource || (typeof mod.deltaDeltaGAssoc === 'number' ? 'delta' : 'r'),

        // Concentration inputs (not available in v1, will be added in Simple Mode UI)
        Nb_nM: mod.Nb_nM ?? null,
        ETSSB_nM: mod.ETSSB_nM ?? null,

        // Metadata
        aminoAcid: mod.aminoAcid ?? null,
        linker: mod.linker ?? null,
      },

      // Derived cache (will be populated by ensureDerivedCache)
      derived: mod.derived ?? null,

      // Workflow state
      workflow: {
        fitHistory: mod.fitHistory ?? [],
        titrationHistory: mod.titrationHistory ?? [],
        lastModified: mod.lastModified ?? Date.now(),
      },

      notes: mod.notes ?? '',
    };

    return upgraded;
  });
}

/**
 * Ensures derived values are cached on a modification.
 * Returns the modification with derived cache populated.
 */
export function ensureDerivedCache(mod, baseParams) {
  if (!mod) return null;

  // If already cached and recent, return as-is
  if (mod.derived && mod.workflow?.lastModified) {
    return mod;
  }

  // Compute derived values
  const derived = computeEffectiveParameters(baseParams, mod);

  return {
    ...mod,
    derived,
    workflow: {
      ...mod.workflow,
      lastModified: Date.now(),
    },
  };
}

// ========================================
// Preferences Storage
// ========================================

/**
 * Load user preferences (mode, lastStep)
 */
export function loadPreferences() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { mode: 'simple', lastStep: 1 };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFS);
    if (!raw) return { mode: 'simple', lastStep: 1 };

    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === 'detail' ? 'detail' : 'simple',
      lastStep: Number.isInteger(parsed.lastStep) && parsed.lastStep >= 1 && parsed.lastStep <= 4
        ? parsed.lastStep
        : 1,
    };
  } catch (err) {
    console.warn('[modifications] failed to parse preferences', err);
    return { mode: 'simple', lastStep: 1 };
  }
}

/**
 * Save user preferences
 */
export function savePreferences(prefs) {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const validated = {
    mode: prefs.mode === 'detail' ? 'detail' : 'simple',
    lastStep: Number.isInteger(prefs.lastStep) && prefs.lastStep >= 1 && prefs.lastStep <= 4
      ? prefs.lastStep
      : 1,
  };

  window.localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(validated));
}

// ========================================
// Helper Accessors (for schema v2)
// ========================================

/**
 * Get association inputs from a modification
 */
export function getAssocInputs(mod) {
  if (!mod) return { r_assoc: 1, deltaDeltaGAssoc: null, lock: 'r' };

  if (mod.schemaVersion === 2) {
    return {
      r_assoc: mod.inputs?.r_assoc ?? 1,
      deltaDeltaGAssoc: mod.inputs?.deltaDeltaGAssoc ?? null,
      lock: mod.inputs?.assocLock ?? 'r',
    };
  }

  // Legacy fallback
  return {
    r_assoc: mod.rAssoc ?? 1,
    deltaDeltaGAssoc: mod.deltaDeltaGAssoc ?? null,
    lock: mod.assocSource ?? 'r',
  };
}

/**
 * Get enzyme ratio inputs from a modification
 */
export function getEnzymeInputs(mod) {
  if (!mod) return { r_poly: 1, r_nick: 1 };

  if (mod.schemaVersion === 2) {
    return {
      r_poly: mod.inputs?.r_poly ?? 1,
      r_nick: mod.inputs?.r_nick ?? 1,
    };
  }

  // Legacy fallback
  return {
    r_poly: mod.rPoly ?? 1,
    r_nick: mod.rNick ?? 1,
  };
}

/**
 * Get concentration inputs from a modification
 */
export function getConcentrationInputs(mod) {
  if (!mod) return { Nb_nM: null, ETSSB_nM: null };

  if (mod.schemaVersion === 2) {
    return {
      Nb_nM: mod.inputs?.Nb_nM ?? null,
      ETSSB_nM: mod.inputs?.ETSSB_nM ?? null,
    };
  }

  // Legacy has no concentration inputs
  return { Nb_nM: null, ETSSB_nM: null };
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
  const mods = readLocalMods();
  // Auto-migrate and save if any modifications were upgraded
  const upgraded = upgradeLegacyModifications(mods);
  const needsSave = upgraded.some((m, i) => m.schemaVersion === 2 && mods[i]?.schemaVersion !== 2);
  if (needsSave) {
    writeLocalMods(upgraded);
  }

  // Add v1 compatibility properties to v2 objects for legacy UI support
  return upgraded.map((mod) => {
    if (mod.schemaVersion === 2) {
      return {
        ...mod,
        // v1 compatibility properties (read-only, for legacy UI)
        rAssoc: mod.inputs?.r_assoc ?? 1,
        rPoly: mod.inputs?.r_poly ?? 1,
        rNick: mod.inputs?.r_nick ?? 1,
        deltaDeltaGAssoc: mod.inputs?.deltaDeltaGAssoc ?? null,
        deltaDeltaGFold: mod.inputs?.deltaDeltaGFold ?? null,
        temperatureC: mod.inputs?.temperatureC ?? 37,
        useHairpin: mod.inputs?.useHairpin ?? false,
        assocSource: mod.inputs?.assocLock ?? 'r',
        aminoAcid: mod.inputs?.aminoAcid ?? null,
        linker: mod.inputs?.linker ?? null,
      };
    }
    return mod;
  });
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

  // v2 schema
  if (mod.schemaVersion === 2) {
    const rAssoc = mod.inputs?.r_assoc;
    const deltaDeltaGAssoc = mod.inputs?.deltaDeltaGAssoc;
    const tempC = mod.inputs?.temperatureC ?? 37;

    if (rAssoc && rAssoc > 0) return rAssoc;
    if (typeof deltaDeltaGAssoc === 'number') {
      const T = temperatureToKelvin(tempC);
      return Math.exp(-deltaDeltaGAssoc / (GAS_CONSTANT_KCAL * T));
    }
    return 1;
  }

  // v1 legacy
  if (mod.rAssoc && mod.rAssoc > 0) return mod.rAssoc;
  if (typeof mod.deltaDeltaGAssoc === 'number') {
    const T = temperatureToKelvin(mod.temperatureC ?? 25);
    return Math.exp(-mod.deltaDeltaGAssoc / (GAS_CONSTANT_KCAL * T));
  }
  return 1;
}

export function resolveDeltaFromRAssoc(mod) {
  if (!mod) return 0;

  // v2 schema
  if (mod.schemaVersion === 2) {
    const deltaDeltaGAssoc = mod.inputs?.deltaDeltaGAssoc;
    const rAssoc = mod.inputs?.r_assoc;
    const tempC = mod.inputs?.temperatureC ?? 37;

    if (typeof deltaDeltaGAssoc === 'number') return deltaDeltaGAssoc;
    if (rAssoc && rAssoc > 0) {
      const T = temperatureToKelvin(tempC);
      return -Math.log(rAssoc) * GAS_CONSTANT_KCAL * T;
    }
    return 0;
  }

  // v1 legacy
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
  if (!mod) return 1;

  // v2 schema
  if (mod.schemaVersion === 2) {
    if (!mod.inputs?.useHairpin) return 1;
    if (typeof mod.inputs?.deltaDeltaGFold !== 'number') return 1;
    const T = temperatureToKelvin(mod.inputs?.temperatureC ?? 37);
    const delta = mod.inputs.deltaDeltaGFold;
    const denom = Math.exp(delta / (GAS_CONSTANT_KCAL * T));
    return 1 / (1 + denom);
  }

  // v1 legacy
  if (!mod.useHairpin) return 1;
  if (typeof mod.deltaDeltaGFold !== 'number') return 1;
  const T = temperatureToKelvin(mod.temperatureC ?? 25);
  const delta = mod.deltaDeltaGFold;
  const denom = Math.exp(delta / (GAS_CONSTANT_KCAL * T));
  return 1 / (1 + denom);
}

export function computeEffectiveParameters(baseParams, mod) {
  const rAssoc = resolveRAssoc(mod);

  // Get rPoly and rNick based on schema version
  let rPoly, rNick;
  if (mod?.schemaVersion === 2) {
    rPoly = mod.inputs?.r_poly && mod.inputs.r_poly > 0 ? mod.inputs.r_poly : 1;
    rNick = mod.inputs?.r_nick && mod.inputs.r_nick > 0 ? mod.inputs.r_nick : 1;
  } else {
    rPoly = mod?.rPoly && mod.rPoly > 0 ? mod.rPoly : 1;
    rNick = mod?.rNick && mod.rNick > 0 ? mod.rNick : 1;
  }

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

  // Normalize incoming mod to v2 schema if it has v1 properties
  let normalized = mod;
  if (mod.schemaVersion !== 2 && (mod.rAssoc || mod.rPoly || mod.rNick)) {
    // Convert v1 properties to v2 schema
    normalized = {
      schemaVersion: 2,
      id: mod.id || `mod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      label: mod.label || 'Untitled modification',
      inputs: {
        r_assoc: mod.rAssoc ?? 1,
        r_poly: mod.rPoly ?? 1,
        r_nick: mod.rNick ?? 1,
        deltaDeltaGAssoc: mod.deltaDeltaGAssoc ?? null,
        deltaDeltaGFold: mod.deltaDeltaGFold ?? null,
        temperatureC: mod.temperatureC ?? 37,
        useHairpin: mod.useHairpin ?? false,
        assocLock: mod.assocSource || (typeof mod.deltaDeltaGAssoc === 'number' ? 'delta' : 'r'),
        Nb_nM: mod.Nb_nM ?? null,
        ETSSB_nM: mod.ETSSB_nM ?? null,
        aminoAcid: mod.aminoAcid ?? null,
        linker: mod.linker ?? null,
      },
      derived: mod.derived ?? null,
      workflow: {
        fitHistory: mod.fitHistory ?? [],
        titrationHistory: mod.titrationHistory ?? [],
        lastModified: Date.now(),
      },
      notes: mod.notes ?? '',
    };
  }

  if (idx >= 0) mods[idx] = { ...mods[idx], ...normalized };
  else mods.push(normalized);

  // Save the v2 schema (without v1 compatibility props)
  const toSave = mods.map((m) => {
    if (m.schemaVersion === 2) {
      // Remove v1 compatibility properties before saving
      const { rAssoc, rPoly, rNick, deltaDeltaGAssoc, deltaDeltaGFold, temperatureC, useHairpin, assocSource, aminoAcid, linker, ...v2Only } = m;
      return v2Only;
    }
    return m;
  });

  writeLocalMods(toSave);
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
