import * as fs from 'fs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { ParsedDocument, Page, Frame, Story, ContentBlock, CharRun } from '../shared/types';

// ---- helpers ----------------------------------------------------------------

type Rec = Record<string, unknown>;

function toArray(v: unknown): Rec[] {
  if (v == null) return [];
  return Array.isArray(v) ? (v as Rec[]) : [(v as Rec)];
}

function parseTransform(s: string) {
  const [a, b, c, d, tx, ty] = String(s).trim().split(/\s+/).map(Number);
  return { a, b, c, d, tx, ty };
}

// InDesign GeometricBounds: "y1 x1 y2 x2"
function parseBounds(s: string) {
  const [y1, x1, y2, x2] = String(s).trim().split(/\s+/).map(Number);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function parseAnchor(s: string) {
  const [x, y] = String(s).trim().split(/\s+/).map(Number);
  return { x, y };
}

function textOf(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && '#text' in (v as object))
    return String((v as Record<string, unknown>)['#text']);
  return String(v);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---- parser -----------------------------------------------------------------

export async function parseIDML(idmlPath: string): Promise<ParsedDocument> {
  const data = fs.readFileSync(idmlPath);
  const zip = await JSZip.loadAsync(data);

  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseAttributeValue: true,
    textNodeName: '#text',
    trimValues: false,
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
      const t = parseTransform(String(page['@_ItemTransform']));
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
        transform: { tx: round2(t.tx), ty: round2(t.ty) },
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
      const paragraphStyle = styleAttr.replace(/^ParagraphStyle\/(\$ID\/)?/, '');

      let text = '';
      const kerningPairs: ContentBlock['kerningPairs'] = [];
      const charRuns: CharRun[] = [];

      for (const cr of toArray(para['CharacterStyleRange'] as Record<string, unknown>)) {
        const startIdx = text.length;

        const kv = cr['@_KerningValue'];
        if (kv !== undefined && kv !== 0 && kv !== '') {
          kerningPairs.push({ index: startIdx, value: Number(kv) });
        }

        const rawContent = cr['Content'];
        const chunk =
          rawContent == null ? '' :
          typeof rawContent === 'object' ? textOf(rawContent) :
          String(rawContent);
        text += chunk;

        const endIdx = text.length;

        // Skip zero-width runs — these are InDesign style-change markers
        if (startIdx === endIdx) continue;

        const crProps = cr['Properties'] as Record<string, unknown> | undefined;
        const fontFamily = crProps?.['AppliedFont'] ? textOf(crProps['AppliedFont']) : undefined;
        const fontVariant = cr['@_FontStyle'] ? String(cr['@_FontStyle']) : undefined;
        const fontSize = cr['@_PointSize'] != null ? Number(cr['@_PointSize']) : undefined;
        const leading = crProps?.['Leading'] != null ? Number(textOf(crProps['Leading'])) : undefined;
        const tracking = cr['@_Tracking'] != null ? Number(cr['@_Tracking']) : undefined;

        if (fontFamily) fontsUsed.add(fontFamily);

        const run: CharRun = { start: startIdx, end: endIdx };
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
