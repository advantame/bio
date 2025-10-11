// CSV ingestion and preprocessing for the Modification Workbench Fit workflow.
// Handles column identification, cross-talk correction, baseline subtraction,
// unit conversions, and basic diagnostics so downstream fitting code can focus
// on modelling rather than I/O. All operations are deterministic to aid in
// reproducible analyses.

const DEFAULT_PREY_OPTIONS = {
  separator: ',',
  header: true,
  timeUnit: 's',
  channels: {
    time: 'time',
    green: 'F_green',
    yellow: 'F_yellow',
  },
  baselinePoints: 10,
  crossTalk: {
    fromGreenToYellow: 0,
    fromYellowToGreen: 0,
  },
  greenScale: 1, // arbitrary fluorescence → concentration multiplier (nM/unit)
};

const DEFAULT_TITRATION_OPTIONS = {
  separator: ',',
  header: true,
  channels: {
    ligand: 'N',
    response: 'F',
  },
};

/** Median helper for small arrays. */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? 0.5 * (sorted[mid - 1] + sorted[mid])
    : sorted[mid];
}

/** Auto-detect separator if not explicitly provided. */
function detectSeparator(line) {
  if (!line) return ',';
  const comma = (line.match(/,/g) || []).length;
  const tab = (line.match(/\t/g) || []).length;
  return tab > comma ? '\t' : ',';
}

/**
 * Parse numeric value; return NaN if invalid but keep trace for diagnostics.
 */
function parseNumber(value) {
  if (value === null || value === undefined) return NaN;
  const trimmed = String(value).trim();
  if (!trimmed) return NaN;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : NaN;
}

/**
 * Normalize options by merging defaults.
 */
function normalizePreyOptions(opts = {}) {
  const merged = {
    ...DEFAULT_PREY_OPTIONS,
    ...opts,
    channels: { ...DEFAULT_PREY_OPTIONS.channels, ...(opts.channels || {}) },
    crossTalk: { ...DEFAULT_PREY_OPTIONS.crossTalk, ...(opts.crossTalk || {}) },
  };
  if (!merged.separator) merged.separator = DEFAULT_PREY_OPTIONS.separator;
  if (!merged.baselinePoints || merged.baselinePoints < 1) merged.baselinePoints = DEFAULT_PREY_OPTIONS.baselinePoints;
  if (merged.greenScale === undefined || merged.greenScale === null) merged.greenScale = DEFAULT_PREY_OPTIONS.greenScale;
  return merged;
}

/**
 * Convert an array of times into minutes given the configured time unit.
 */
function convertTime(values, unit) {
  if (unit === 'min') return values;
  if (unit === 's' || unit === 'sec' || unit === 'seconds') {
    return values.map((v) => v / 60);
  }
  // Fallback: assume minutes to avoid silent large errors.
  return values;
}

/**
 * Apply cross-talk corrections in-place.
 */
function applyCrossTalk(green, yellow, factors) {
  if (!yellow || yellow.length === 0) return { greenCorrected: [...green], yellowCorrected: yellow ? [...yellow] : null };
  const g2y = factors.fromGreenToYellow || 0;
  const y2g = factors.fromYellowToGreen || 0;
  const gOut = new Array(green.length);
  const yOut = new Array(yellow.length);
  for (let i = 0; i < green.length; i += 1) {
    const g = green[i];
    const y = yellow[i];
    yOut[i] = y - g2y * g;
    gOut[i] = g - y2g * y;
  }
  return { greenCorrected: gOut, yellowCorrected: yOut };
}

/**
 * Baseline subtract using the median of the first N points (default 10).
 */
function subtractBaseline(series, count) {
  if (!series || !series.length) {
    return { values: [], baseline: 0 };
  }
  const window = Math.max(1, Math.min(count, series.length));
  const baseline = median(series.slice(0, window));
  const values = series.map((v) => v - baseline);
  return { values, baseline };
}

/**
 * Ingest a prey-only CSV and return processed arrays ready for fitting.
 * @param {string} csvText - Raw CSV text.
 * @param {CsvImportOptions & { baselinePoints?: number, greenScale?: number }} options
 * @returns {{
 *   time: Float64Array,
 *   timeUnit: 'min',
 *   fluorescence: Float64Array,
 *   concentration: Float64Array,
 *   raw: { time: Float64Array, green: Float64Array, yellow?: Float64Array },
 *   baseline: { green: number, yellow?: number },
 *   warnings: string[],
 *   separator: string,
 * }}
 */
export function parsePreyCsv(csvText, options = {}) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw new Error('Empty CSV payload');
  }
  const opts = normalizePreyOptions(options);

  const lines = csvText.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim().length > 0);
  if (!lines.length) throw new Error('CSV payload contains no data rows');

  let separator = opts.separator;
  if (!separator || separator === 'auto') {
    separator = detectSeparator(lines[0]);
  }

  let header = null;
  let dataStartIndex = 0;
  if (opts.header !== false) {
    header = lines[0].split(separator).map((h) => h.trim());
    dataStartIndex = 1;
  }

  const idx = {
    time: header ? header.indexOf(opts.channels.time) : 0,
    green: header ? header.indexOf(opts.channels.green) : 1,
    yellow: header ? header.indexOf(opts.channels.yellow) : -1,
  };

  if (idx.time === -1) throw new Error(`Missing time column '${opts.channels.time}'`);
  if (idx.green === -1) throw new Error(`Missing green channel column '${opts.channels.green}'`);

  const rawTime = [];
  const rawGreen = [];
  const rawYellow = idx.yellow >= 0 ? [] : null;
  const warnings = [];

  for (let i = dataStartIndex; i < lines.length; i += 1) {
    const cols = lines[i].split(separator);
    if (cols.length < 2) continue; // skip empty/invalid row
    const t = parseNumber(cols[idx.time]);
    const g = parseNumber(cols[idx.green]);
    const y = idx.yellow >= 0 ? parseNumber(cols[idx.yellow]) : NaN;
    if (!Number.isFinite(t) || !Number.isFinite(g)) {
      warnings.push(`Row ${i + 1}: invalid numeric data (time=${cols[idx.time]}, green=${cols[idx.green]})`);
      continue;
    }
    rawTime.push(t);
    rawGreen.push(g);
    if (rawYellow) rawYellow.push(Number.isFinite(y) ? y : NaN);
  }

  if (rawTime.length < 3) {
    throw new Error('Insufficient valid data points (need at least 3)');
  }

  const timeMinutes = convertTime(rawTime, opts.timeUnit);
  const { greenCorrected, yellowCorrected } = applyCrossTalk(rawGreen, rawYellow, opts.crossTalk || {});
  const { values: greenBaselineRemoved, baseline: baselineGreen } = subtractBaseline(greenCorrected, opts.baselinePoints);
  let yellowBaselineRemoved = null;
  let baselineYellow = null;
  if (yellowCorrected) {
    const result = subtractBaseline(yellowCorrected, opts.baselinePoints);
    yellowBaselineRemoved = result.values;
    baselineYellow = result.baseline;
  }

  const concentration = greenBaselineRemoved.map((v) => v * opts.greenScale);

  return {
    time: Float64Array.from(timeMinutes),
    timeUnit: 'min',
    fluorescence: Float64Array.from(greenBaselineRemoved),
    concentration: Float64Array.from(concentration),
    raw: {
      time: Float64Array.from(timeMinutes),
      green: Float64Array.from(greenCorrected),
      yellow: yellowCorrected ? Float64Array.from(yellowCorrected) : undefined,
    },
    baseline: {
      green: baselineGreen,
      yellow: baselineYellow,
    },
    warnings,
    separator,
    options: opts,
  };
}

/** Convenience wrapper to read File/Blob objects. */
export async function parsePreyCsvFile(file, options = {}) {
  if (!(file instanceof Blob)) {
    throw new Error('Expected a File or Blob');
  }
  const text = await file.text();
  return parsePreyCsv(text, options);
}

function normalizeTitrationOptions(opts = {}) {
  const merged = {
    ...DEFAULT_TITRATION_OPTIONS,
    ...opts,
    channels: { ...DEFAULT_TITRATION_OPTIONS.channels, ...(opts.channels || {}) },
  };
  if (!merged.separator) merged.separator = DEFAULT_TITRATION_OPTIONS.separator;
  if (merged.header === undefined) merged.header = true;
  return merged;
}

export function parseTitrationCsv(csvText, options = {}) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw new Error('Empty CSV payload');
  }
  const opts = normalizeTitrationOptions(options);
  const lines = csvText.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim().length > 0);
  if (!lines.length) throw new Error('CSV payload contains no data rows');

  let separator = opts.separator;
  if (!separator || separator === 'auto') separator = detectSeparator(lines[0]);

  let header = null;
  let dataStartIndex = 0;
  if (opts.header !== false) {
    header = lines[0].split(separator).map((h) => h.trim());
    dataStartIndex = 1;
  }

  const idxLigand = header ? header.indexOf(opts.channels.ligand) : 0;
  const idxResponse = header ? header.indexOf(opts.channels.response) : 1;
  if (idxLigand === -1) throw new Error(`Missing ligand column '${opts.channels.ligand}'`);
  if (idxResponse === -1) throw new Error(`Missing response column '${opts.channels.response}'`);

  const ligand = [];
  const response = [];
  const warnings = [];

  for (let i = dataStartIndex; i < lines.length; i += 1) {
    const cols = lines[i].split(separator);
    if (cols.length < 2) continue;
    const l = parseNumber(cols[idxLigand]);
    const f = parseNumber(cols[idxResponse]);
    if (!Number.isFinite(l) || !Number.isFinite(f)) {
      warnings.push(`Row ${i + 1}: invalid numeric data (ligand=${cols[idxLigand]}, response=${cols[idxResponse]})`);
      continue;
    }
    ligand.push(l);
    response.push(f);
  }

  if (ligand.length < 3) throw new Error('Need at least 3 titration points');

  return {
    ligand: Float64Array.from(ligand),
    response: Float64Array.from(response),
    warnings,
    separator,
    options: opts,
  };
}

export async function parseTitrationCsvFile(file, options = {}) {
  if (!(file instanceof Blob)) throw new Error('Expected a File or Blob');
  const text = await file.text();
  return parseTitrationCsv(text, options);
}

export default parsePreyCsv;
