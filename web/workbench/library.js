// Helpers for Library filtering and descriptors.

const CHARGE_GROUPS = {
  positive: new Set(['lys', 'arg', 'his']),
  negative: new Set(['asp', 'glu']),
};
const AROMATIC_SET = new Set(['phe', 'tyr', 'trp', 'his']);

function normalizeAmino(acid) {
  if (!acid) return '';
  return String(acid).trim().toLowerCase();
}

export function computeDescriptors(mod) {
  const amino = normalizeAmino(mod?.aminoAcid);
  let charge = 'neutral';
  if (CHARGE_GROUPS.positive.has(amino)) charge = 'positive';
  else if (CHARGE_GROUPS.negative.has(amino)) charge = 'negative';
  const aromatic = AROMATIC_SET.has(amino) ? 'aromatic' : 'non-aromatic';
  const linkerLength = mod?.linker?.length ?? null;
  return { charge, aromatic, linkerLength };
}

export function passesFilters(descriptors, filters) {
  if (!filters) return true;
  if (filters.charge && filters.charge !== 'any' && descriptors.charge !== filters.charge) {
    return false;
  }
  return true;
}

export const CHARGE_FILTER_OPTIONS = [
  { value: 'any', label: 'Any charge' },
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' },
  { value: 'neutral', label: 'Neutral' },
];

export default computeDescriptors;
