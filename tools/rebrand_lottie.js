/**
 * Rebrand Lottie animation: "Kraken" -> "Astellr"
 * 
 * Strategy:
 * - Layer ind=40 (nm='K') contains "to Kraken Wallet" as vector shapes
 * - shapes[0-1] = "t", "o" (keep or remove — they exist on separate layer too)
 * - shapes[2-7] = "K", "r", "a", "k", "e", "n" → REPLACE with "A", "s", "t", "e", "l", "l", "r"
 * - shapes[8-13] = "W", "a", "l", "l", "e", "t" → KEEP
 * 
 * Source letters:
 * - A: Layer ind=15, shape[0] — needs Y shift +52 (from baseline -14.7 to 37.3)
 * - s: Layer ind=2, shape[9] (from "chains.") — baseline at 37.8 ✓ 
 * - t: Layer ind=40, shape[13] — reuse from "Wallet" (baseline 37.8 ✓)
 * - e: Layer ind=40, shape[6] — reuse from "Kraken" (baseline 37.8 ✓)
 * - l: Layer ind=40, shape[10] — reuse from "Wallet" (baseline 37.3 ✓)
 * - l: Layer ind=40, shape[11] — reuse from "Wallet" (baseline 37.3 ✓)
 * - r: Layer ind=40, shape[3] — reuse from "Kraken" (baseline 37.3 ✓)
 */

const fs = require('fs');

const inputPath = process.argv[2] || '/tmp/introAnimation_original.json';
const outputPath = process.argv[3] || '/Users/humbertolobo/nuble_wallet/src/screens/Onboarding/assets/introAnimation.json';

const anim = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getShapeBounds(shape) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  shape.it.forEach(item => {
    if (item.ty === 'sh') {
      item.ks.k.v.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
    }
  });
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function shiftShapeXY(shape, dx, dy) {
  shape.it.forEach(item => {
    if (item.ty === 'sh') {
      // Only shift vertex positions (v), NOT control point offsets (i, o) since those are relative
      item.ks.k.v = item.ks.k.v.map(([x, y]) => [x + dx, y + dy]);
    }
  });
  return shape;
}

// Get source layers
const layer40 = anim.layers.find(l => l.ind === 40); // 'K' layer
const layer15 = anim.layers.find(l => l.ind === 15); // 'A' layer (Access)
const layer2 = anim.layers.find(l => l.ind === 2);   // 'M' layer (Many chains.)

// Original "Kraken" letter positions in Layer 40:
// [2] K: x -167.5 to -137.0 (width 30.5)
// [3] r: x -133.4 to -119.3 (width 14.1)
// [4] a: x -116.5 to -91.0  (width 25.5)
// [5] k: x -84.3  to -60.1  (width 24.2)
// [6] e: x -59.1  to -34.6  (width 24.5)
// [7] n: x -29.4  to -6.4   (width 23.0)
// Total "Kraken" width: -167.5 to -6.4 = 161.1
// Gaps: K-r=3.6, r-a=2.8, a-k=6.7, k-e=1.0, e-n=5.2
// Avg gap ≈ 3.9

// "Wallet" positions:
// [8]  W: x 8.0  to 56.8  (width 48.8)
// [9]  a: x 54.8 to 80.4  (width 25.6)
// [10] l: x 87.0 to 94.1  (width 7.1)
// [11] l: x 100.7 to 107.7 (width 7.0)
// [12] e: x 112.9 to 137.4 (width 24.5)
// [13] t: x 139.7 to 157.1 (width 17.4)
// Gap between "Kraken" end (-6.4) and "Wallet" start (8.0) = 14.4

// Prepare source shapes
const srcA = clone(layer15.shapes[0]); // A from "Access"
const srcS = clone(layer2.shapes[9]);   // s from "chains."
const srcT = clone(layer40.shapes[13]); // t from "Wallet"
const srcE = clone(layer40.shapes[6]);  // e from "Kraken"
const srcL1 = clone(layer40.shapes[10]); // l from "Wallet"
const srcL2 = clone(layer40.shapes[11]); // l from "Wallet"
const srcR = clone(layer40.shapes[3]);  // r from "Kraken"

// Log sources
console.log('Source letters:');
console.log('  A:', srcA.nm, getShapeBounds(srcA));
console.log('  s:', srcS.nm, getShapeBounds(srcS));
console.log('  t:', srcT.nm, getShapeBounds(srcT));
console.log('  e:', srcE.nm, getShapeBounds(srcE));
console.log('  l1:', srcL1.nm, getShapeBounds(srcL1));
console.log('  l2:', srcL2.nm, getShapeBounds(srcL2));
console.log('  r:', srcR.nm, getShapeBounds(srcR));

// Step 1: Shift A from baseline -14.7 to baseline 37.3 (dy = +52)
shiftShapeXY(srcA, 0, 52);
srcA.nm = 'A'; // keep name
console.log('\nAfter Y-shift, A bounds:', getShapeBounds(srcA));

// Step 2: Calculate positioning
// "Astellr" should be centered the same way "Kraken" was
// "Kraken" center X = (-167.5 + -6.4) / 2 = -86.95
// Let me compute "Astellr" total width first, then center it at -86.95

const letterShapes = [srcA, srcS, srcT, srcE, srcL1, srcL2, srcR];
const letterBounds = letterShapes.map(s => getShapeBounds(s));
const letterWidths = letterBounds.map(b => b.width);

console.log('\nLetter widths:', letterWidths.map(w => w.toFixed(1)));

// Gap between letters — use average from original Kraken: ~3.5
// But let's look at gaps between similar letters in original
// Between lowercase letters in "Wallet": 
// a(80.4)->l(87.0) = 6.6, l(94.1)->l(100.7) = 6.6, l(107.7)->e(112.9) = 5.2, e(137.4)->t(139.7) = 2.3
// Average in Wallet: 5.175

// For "Astellr" let's use appropriate gaps:
// A-s: ~4 (uppercase to lowercase, like K-r which was 3.6)
// s-t: ~3 
// t-e: ~3
// e-l: ~5 (like a-l in Wallet = 6.6, but e is slightly narrower)
// l-l: ~6.6 (like l-l in Wallet)
// l-r: ~5

const gaps = [4.0, 3.5, 3.0, 5.0, 6.6, 5.0];

// Total "Astellr" width = sum of letter widths + sum of gaps
const totalWidth = letterWidths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
console.log('Total Astellr width:', totalWidth.toFixed(1));

// Center of original "Kraken": -86.95
// But actually, the gap between "Kraken" end and "Wallet" start is 14.4
// "Wallet" starts at x=8.0, so "Astellr" should end at approximately 8.0 - 14.4 = -6.4
// OR we can center "Astellr" in the same span as "Kraken"

// Let's keep the same gap to "Wallet": end of "Astellr" at -6.4 (same as "Kraken")
const endX = -6.4;
const startX = endX - totalWidth;
console.log('Astellr X range:', startX.toFixed(1), 'to', endX.toFixed(1));

// Position each letter
let currentX = startX;
letterShapes.forEach((shape, i) => {
  const bounds = getShapeBounds(shape);
  const dx = currentX - bounds.minX;
  shiftShapeXY(shape, dx, 0);
  const newBounds = getShapeBounds(shape);
  console.log('Letter', i, shape.nm, ': x', newBounds.minX.toFixed(1), '..', newBounds.maxX.toFixed(1), 'y', newBounds.minY.toFixed(1), '..', newBounds.maxY.toFixed(1));
  currentX = newBounds.maxX + (gaps[i] || 0);
});

// Step 3: Rename shapes
srcA.nm = 'A';
srcS.nm = 's';
srcT.nm = 't';
srcE.nm = 'e';
srcL1.nm = 'l';
srcL2.nm = 'l';
srcR.nm = 'r';

// Step 4: Replace shapes in Layer 40
// Keep shapes[0,1] ("to") and shapes[8-13] ("Wallet"), replace shapes[2-7] ("Kraken") with "Astellr"
const toShapes = layer40.shapes.slice(0, 2);    // "to"
const walletShapes = layer40.shapes.slice(8);     // "Wallet" (6 shapes)

// Now shift Wallet shapes to account for different "Astellr" ending position
// Original "Kraken" ended at -6.4, our "Astellr" ends at approximately the same
// So Wallet should stay where it is — no shift needed

layer40.shapes = [...toShapes, srcA, srcS, srcT, srcE, srcL1, srcL2, srcR, ...walletShapes];

console.log('\nNew Layer 40 shapes:', layer40.shapes.length);
layer40.shapes.forEach((s, i) => {
  console.log('  [' + i + ']', s.nm);
});

// Write output
fs.writeFileSync(outputPath, JSON.stringify(anim));
console.log('\nWritten to:', outputPath);
