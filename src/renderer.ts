/**
 * R0 Font Spike — renderer process
 *
 * Tests:
 * 1. Font Access API availability and permission in Electron
 * 2. Enumeration of Frutiger CE and Garamond Premier Pro variants
 * 3. Canvas rendering of "Edward Cupps" with and without IDML kerning pairs
 */

import './index.css';

const log = (msg: string) => {
  const el = document.getElementById('log')!;
  el.textContent += msg + '\n';
  console.log(msg);
};

// Kerning pairs for " Edward Cupps..." extracted from DesignedResume.idml.
// Index = character position in the full paragraph text (leading space at 0).
// Value = thousandths of an em (InDesign standard unit).
const IDML_KERNING: Record<number, number> = {
  1: -20,  // before 'E'
  3: -20,  // before 'w'
  4: -40,  // before 'a'
  5: -38,  // before 'r'
  8: -60,  // before 'C'
  10: -20, // before first 'p'
};

// "Edward Cupps" starts at text index 1 (index 0 is a leading space).
// Remap to 0-based indices within just the name.
const NAME_KERNING: Record<number, number> = Object.fromEntries(
  Object.entries(IDML_KERNING).map(([i, v]) => [Number(i) - 1, v])
);

const NAME = 'Edward Cupps';
const FONT_SIZE_PX = 48; // scaled up for visibility; proportions match 24pt original

function drawName(canvasId: string, useKerning: boolean) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.font = `${FONT_SIZE_PX}px 'Frutiger CE 45 Light'`;
  ctx.textBaseline = 'alphabetic';

  const x0 = 20;
  const y = 58;

  if (!useKerning) {
    ctx.fillText(NAME, x0, y);
    return;
  }

  let x = x0;
  for (let i = 0; i < NAME.length; i++) {
    const kern = ((NAME_KERNING[i] ?? 0) / 1000) * FONT_SIZE_PX;
    x += kern;
    ctx.fillText(NAME[i], x, y);
    x += ctx.measureText(NAME[i]).width;
  }
}

function makeTable(rows: string[][]): string {
  const [header, ...body] = rows;
  return `<table>
    <tr>${header.map(h => `<th>${h}</th>`).join('')}</tr>
    ${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
  </table>`;
}

interface FontData {
  family: string;
  style: string;
  fullName: string;
  postscriptName: string;
}

async function runSpike() {
  const apiEl = document.getElementById('api-status')!;

  // ---- 1. Font Access API availability ------------------------------------
  if (!('queryLocalFonts' in window)) {
    apiEl.innerHTML = '<span class="status err">NOT AVAILABLE — queryLocalFonts not in window</span>';
    log('FAIL: Font Access API not available');
    drawName('canvas-nokern', false);
    drawName('canvas-kern', true);
    return;
  }

  let fonts: FontData[];
  try {
    fonts = await (window as unknown as { queryLocalFonts(): Promise<FontData[]> }).queryLocalFonts();
    apiEl.innerHTML = `<span class="status ok">OK — ${fonts.length} fonts enumerated</span>`;
    log(`OK: queryLocalFonts() returned ${fonts.length} entries`);
  } catch (err) {
    apiEl.innerHTML = `<span class="status err">PERMISSION DENIED — ${err}</span>`;
    log(`FAIL: queryLocalFonts() threw: ${err}`);
    drawName('canvas-nokern', false);
    drawName('canvas-kern', true);
    return;
  }

  // ---- 2. Find target fonts -----------------------------------------------
  const frutigerCE = fonts.filter(f => f.family.includes('Frutiger CE'));
  const garamondPP = fonts.filter(f =>
    f.family.toLowerCase().includes('garamond') &&
    (f.family.includes('Premr') || f.fullName.toLowerCase().includes('premier'))
  );

  const fruEl = document.getElementById('frutiger-results')!;
  if (frutigerCE.length) {
    fruEl.innerHTML = makeTable([
      ['family', 'style', 'fullName', 'postscriptName'],
      ...frutigerCE.map(f => [f.family, f.style, f.fullName, f.postscriptName]),
    ]);
    log(`Frutiger CE: ${frutigerCE.length} variants found`);
  } else {
    fruEl.innerHTML = '<span class="status warn">Not found in queryLocalFonts()</span>';
    log('WARN: Frutiger CE not returned by Font Access API');
  }

  const garEl = document.getElementById('garamond-results')!;
  if (garamondPP.length) {
    garEl.innerHTML = makeTable([
      ['family', 'style', 'fullName', 'postscriptName'],
      ...garamondPP.map(f => [f.family, f.style, f.fullName, f.postscriptName]),
    ]);
    log(`Garamond Premier Pro: ${garamondPP.length} variants found`);
  } else {
    garEl.innerHTML = '<span class="status warn">Not found in queryLocalFonts()</span>';
    log('WARN: Garamond Premier Pro not returned by Font Access API');
  }

  // ---- 3. Canvas rendering ------------------------------------------------
  drawName('canvas-nokern', false);
  drawName('canvas-kern', true);
  log('Canvas rendering complete');
}

runSpike().catch(err => log(`Unhandled: ${err}`));
