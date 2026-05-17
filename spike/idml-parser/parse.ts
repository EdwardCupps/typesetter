/**
 * R0 Spike — IDML Parser
 *
 * Validates that we can parse a real .idml file and reconstruct document
 * structure matching the Typesetter JSON schema (spreads > pages > stories >
 * frames, with kerning pairs at character-index level).
 *
 * Usage: npx tsx spike/idml-parser/parse.ts <path-to.idml>
 */

import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

// ---- helpers ----------------------------------------------------------------

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// ItemTransform is "a b c d tx ty" — a standard 2D affine matrix
function parseTransform(s: string) {
  const [a, b, c, d, tx, ty] = String(s).trim().split(/\s+/).map(Number);
  return { a, b, c, d, tx, ty };
}

// GeometricBounds in InDesign XML is "y1 x1 y2 x2" (top left bottom right)
function parseBounds(s: string) {
  const [y1, x1, y2, x2] = String(s).trim().split(/\s+/).map(Number);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function parseAnchor(s: string) {
  const [x, y] = String(s).trim().split(/\s+/).map(Number);
  return { x, y };
}

// fast-xml-parser wraps text nodes as { '#text': value } when the element also
// has attributes. This extracts the text in both cases.
function textOf(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && '#text' in (v as object))
    return String((v as Record<string, unknown>)['#text']);
  return String(v);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---- types ------------------------------------------------------------------

interface Page {
  id: string;
  spreadId: string;
  pageNumber: string;
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
}

interface Frame {
  id: string;
  storyId: string;
  previousFrame: string | null;
  nextFrame: string | null;
  // Position in spread coordinates (not yet corrected to page-local coords —
  // that requires subtracting the page's ItemTransform offset, noted as a
  // finding for the architecture phase)
  x: number;
  y: number;
  width: number;
  height: number;
  spreadId: string;
}

interface CharRun {
  start: number;
  end: number;
  fontFamily?: string;
  fontVariant?: string;
  fontSize?: number;
  leading?: number;
  tracking?: number;
}

interface ContentBlock {
  text: string;
  paragraphStyle: string;
  kerningPairs: Array<{ index: number; value: number }>;
  charRuns: CharRun[];
}

interface Story {
  id: string;
  content: ContentBlock[];
}

interface ParsedDocument {
  meta: {
    docName: string;
    domVersion: string;
    storyList: string[];
  };
  pages: Page[];
  frames: Frame[];
  stories: Story[];
  summary: {
    pageCount: number;
    frameCount: number;
    storyCount: number;
    totalParagraphs: number;
    totalKerningPairs: number;
    fontsUsed: string[];
  };
}

// ---- parser -----------------------------------------------------------------

async function parseIDML(idmlPath: string): Promise<ParsedDocument> {
  const data = fs.readFileSync(idmlPath);
  const zip = await JSZip.loadAsync(data);

  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseAttributeValue: true,
    textNodeName: '#text',
    trimValues: false, // preserve spaces in Content elements
  });

  async function readXml(filePath: string): Promise<Record<string, unknown>> {
    const file = zip.file(filePath);
    if (!file) throw new Error(`Missing in IDML archive: ${filePath}`);
    return xmlParser.parse(await file.async('string')) as Record<string, unknown>;
  }

  // ---- designmap -----------------------------------------------------------
  const designmap = await readXml('designmap.xml');
  const doc = designmap['Document'] as Record<string, unknown>;
  const docName = String(doc['@_Name']);
  const domVersion = String(doc['@_DOMVersion']);
  const storyList = String(doc['@_StoryList']).split(/\s+/).filter(Boolean);

  // ---- spreads -------------------------------------------------------------
  const spreadFiles = Object.keys(zip.files)
    .filter(f => f.startsWith('Spreads/') && f.endsWith('.xml'));

  const pages: Page[] = [];
  const frames: Frame[] = [];

  for (const sf of spreadFiles) {
    const raw = await readXml(sf);
    const spreadWrapper = raw['idPkg:Spread'] as Record<string, unknown>;
    const spread = spreadWrapper['Spread'] as Record<string, unknown>;
    const spreadId = String(spread['@_Self']);

    for (const page of toArray(spread['Page'] as Record<string, unknown>)) {
      const bounds = parseBounds(String(page['@_GeometricBounds']));
      const mp = page['MarginPreference'] as Record<string, unknown>;
      pages.push({
        id: String(page['@_Self']),
        spreadId,
        pageNumber: String(page['@_Name']),
        width: round2(bounds.width),
        height: round2(bounds.height),
        margins: {
          top: round2(Number(mp['@_Top'])),
          right: round2(Number(mp['@_Right'])),
          bottom: round2(Number(mp['@_Bottom'])),
          left: round2(Number(mp['@_Left'])),
        },
      });
    }

    for (const frame of toArray(spread['TextFrame'] as Record<string, unknown>)) {
      const transform = parseTransform(String(frame['@_ItemTransform']));
      const props = frame['Properties'] as Record<string, unknown> | undefined;
      const pts = toArray(
        (props?.['PathGeometry'] as Record<string, unknown>)
          ?.['GeometryPathType'] as Record<string, unknown>
      ).flatMap(gpt =>
        toArray(
          (gpt['PathPointArray'] as Record<string, unknown>)
            ?.['PathPointType'] as Record<string, unknown>
        )
      );

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pt of pts) {
        const { x, y } = parseAnchor(String(pt['@_Anchor']));
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }

      const prev = String(frame['@_PreviousTextFrame']);
      const next = String(frame['@_NextTextFrame']);

      frames.push({
        id: String(frame['@_Self']),
        storyId: String(frame['@_ParentStory']),
        previousFrame: prev === 'n' ? null : prev,
        nextFrame: next === 'n' ? null : next,
        x: round2(minX + transform.tx),
        y: round2(minY + transform.ty),
        width: round2(maxX - minX),
        height: round2(maxY - minY),
        spreadId,
      });
    }
  }

  // ---- stories -------------------------------------------------------------
  const storyFiles = Object.keys(zip.files)
    .filter(f => f.startsWith('Stories/') && f.endsWith('.xml'));

  const stories: Story[] = [];
  const fontsUsed = new Set<string>();

  for (const sf of storyFiles) {
    const raw = await readXml(sf);
    const storyWrapper = raw['idPkg:Story'] as Record<string, unknown>;
    const story = storyWrapper['Story'] as Record<string, unknown>;
    const storyId = String(story['@_Self']);

    const content: ContentBlock[] = [];

    for (const para of toArray(story['ParagraphStyleRange'] as Record<string, unknown>)) {
      const styleAttr = String(para['@_AppliedParagraphStyle']);
      // Strip IDML prefix: "ParagraphStyle/$ID/NormalParagraphStyle" → "NormalParagraphStyle"
      const paragraphStyle = styleAttr.replace(/^ParagraphStyle\/(\$ID\/)?/, '');

      let text = '';
      const kerningPairs: ContentBlock['kerningPairs'] = [];
      const charRuns: CharRun[] = [];

      for (const cr of toArray(para['CharacterStyleRange'] as Record<string, unknown>)) {
        const startIdx = text.length;

        // KerningValue on a CharacterStyleRange is the kerning applied BEFORE
        // the first character of this range
        const kv = cr['@_KerningValue'];
        if (kv !== undefined && kv !== 0 && kv !== '') {
          kerningPairs.push({ index: startIdx, value: Number(kv) });
        }

        // Accumulate text — Content may be parsed as string, number, or object
        const rawContent = cr['Content'];
        const chunk =
          rawContent == null ? '' :
          typeof rawContent === 'object' ? textOf(rawContent) :
          String(rawContent);
        text += chunk;

        // Collect per-run style props
        const crProps = cr['Properties'] as Record<string, unknown> | undefined;
        const fontFamily = crProps?.['AppliedFont'] ? textOf(crProps['AppliedFont']) : undefined;
        const fontVariant = cr['@_FontStyle'] ? String(cr['@_FontStyle']) : undefined;
        const fontSize = cr['@_PointSize'] != null ? Number(cr['@_PointSize']) : undefined;
        const leading = crProps?.['Leading'] != null ? Number(textOf(crProps['Leading'])) : undefined;
        const tracking = cr['@_Tracking'] != null ? Number(cr['@_Tracking']) : undefined;

        if (fontFamily) fontsUsed.add(fontFamily);

        const run: CharRun = { start: startIdx, end: text.length };
        if (fontFamily) run.fontFamily = fontFamily;
        if (fontVariant) run.fontVariant = fontVariant;
        if (fontSize != null) run.fontSize = fontSize;
        if (leading != null) run.leading = leading;
        if (tracking != null) run.tracking = tracking;
        charRuns.push(run);
      }

      if (text.trim()) {
        content.push({ text, paragraphStyle, kerningPairs, charRuns });
      }
    }

    stories.push({ id: storyId, content });
  }

  const totalKerningPairs = stories.reduce(
    (n, s) => n + s.content.reduce((m, c) => m + c.kerningPairs.length, 0), 0
  );

  return {
    meta: { docName, domVersion, storyList },
    pages,
    frames,
    stories,
    summary: {
      pageCount: pages.length,
      frameCount: frames.length,
      storyCount: stories.length,
      totalParagraphs: stories.reduce((n, s) => n + s.content.length, 0),
      totalKerningPairs,
      fontsUsed: [...fontsUsed].sort(),
    },
  };
}

// ---- entry ------------------------------------------------------------------

const idmlPath = process.argv[2];
if (!idmlPath) {
  console.error('Usage: npx tsx spike/idml-parser/parse.ts <path-to.idml>');
  process.exit(1);
}

parseIDML(path.resolve(idmlPath))
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(err => { console.error(err); process.exit(1); });
