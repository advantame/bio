// Test script to verify the ratio-based parameter calculation

const K1_BASE = 0.0020;
const B_BASE = 0.000048;

function computeK1B(r_assoc, r_nick, r_poly) {
  const k1 = K1_BASE * (r_assoc * r_poly / r_nick);
  const b = B_BASE * (r_assoc / r_nick);
  const k1_over_b = k1 / b;
  const expected_k1_over_b = (K1_BASE / B_BASE) * r_poly;
  return { k1, b, k1_over_b, expected_k1_over_b };
}

console.log("=== Testing ratio-based parameter system ===\n");

// Test 1: Baseline (all ratios = 1)
console.log("Test 1: Baseline (r_assoc=1, r_nick=1, r_poly=1)");
let result = computeK1B(1, 1, 1);
console.log(`  k1 = ${result.k1.toExponential(4)} (expected: ${K1_BASE.toExponential(4)})`);
console.log(`  b  = ${result.b.toExponential(4)} (expected: ${B_BASE.toExponential(4)})`);
console.log(`  k1/b = ${result.k1_over_b.toFixed(2)} (expected: ${result.expected_k1_over_b.toFixed(2)})`);
console.log(`  ✓ Match: ${Math.abs(result.k1 - K1_BASE) < 1e-10 && Math.abs(result.b - B_BASE) < 1e-12}\n`);

// Test 2: Pure association change (r_assoc=2)
console.log("Test 2: Pure association change (r_assoc=2, r_nick=1, r_poly=1)");
result = computeK1B(2, 1, 1);
console.log(`  k1 = ${result.k1.toExponential(4)} (2× baseline)`);
console.log(`  b  = ${result.b.toExponential(4)} (2× baseline)`);
console.log(`  k1/b = ${result.k1_over_b.toFixed(2)} (should be unchanged)`);
console.log(`  ✓ k1/b unchanged: ${Math.abs(result.k1_over_b - result.expected_k1_over_b) < 1e-6}\n`);

// Test 3: Pure polymerase change (r_poly=3)
console.log("Test 3: Pure polymerase (turnover) change (r_assoc=1, r_nick=1, r_poly=3)");
result = computeK1B(1, 1, 3);
console.log(`  k1 = ${result.k1.toExponential(4)} (3× baseline)`);
console.log(`  b  = ${result.b.toExponential(4)} (unchanged)`);
console.log(`  k1/b = ${result.k1_over_b.toFixed(2)} (3× baseline)`);
console.log(`  ✓ k1/b scaled by r_poly: ${Math.abs(result.k1_over_b / (K1_BASE/B_BASE) - 3) < 1e-6}\n`);

// Test 4: Pure saturation change (r_nick=0.5)
console.log("Test 4: Pure saturation change (r_assoc=1, r_nick=0.5, r_poly=1)");
result = computeK1B(1, 0.5, 1);
console.log(`  k1 = ${result.k1.toExponential(4)} (2× baseline)`);
console.log(`  b  = ${result.b.toExponential(4)} (2× baseline)`);
console.log(`  k1/b = ${result.k1_over_b.toFixed(2)} (unchanged)`);
console.log(`  ✓ k1/b unchanged: ${Math.abs(result.k1_over_b - result.expected_k1_over_b) < 1e-6}\n`);

// Test 5: Combined change
console.log("Test 5: Combined change (r_assoc=2, r_nick=0.5, r_poly=1.5)");
result = computeK1B(2, 0.5, 1.5);
console.log(`  k1 = ${result.k1.toExponential(4)} (2×1.5/0.5 = 6× baseline)`);
console.log(`  b  = ${result.b.toExponential(4)} (2/0.5 = 4× baseline)`);
console.log(`  k1/b = ${result.k1_over_b.toFixed(2)} (1.5× baseline)`);
console.log(`  ✓ k1/b = (k1_base/b_base) × r_poly: ${Math.abs(result.k1_over_b / (K1_BASE/B_BASE) - 1.5) < 1e-6}\n`);

console.log("=== All tests completed ===");
console.log(`\nPhysical interpretation:`);
console.log(`  - r_assoc scales both k1 and b (association strength)`);
console.log(`  - r_nick inversely scales both k1 and b (saturation effect)`);
console.log(`  - r_poly scales only k1/b ratio (turnover rate)`);
console.log(`  - k1/b = (k1_0/b_0) × r_poly always holds`);
