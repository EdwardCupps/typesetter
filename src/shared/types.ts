// Shared types used by both main and renderer processes.
// These mirror the JSON schema (all dimensions in pt).

export interface KerningPair {
  index: number; // character index within the paragraph text
  value: number; // thousandths of an em (InDesign standard)
}

export interface CharRun {
  start: number;
  end: number;
  fontFamily?: string;
  fontVariant?: string;
  fontSize?: number;   // pt
  leading?: number;    // pt
  tracking?: number;   // thousandths of an em
}

export interface ContentBlock {
  text: string;
  paragraphStyle: string;
  justification?: string;
  leftIndent?: number;      // pt
  firstLineIndent?: number; // pt (negative = hanging)
  spaceBefore?: number;     // pt
  spaceAfter?: number;      // pt
  autoBullet?: string;      // bullet char prepended at render time (from paragraph style list settings)
  kerningPairs: KerningPair[];
  charRuns: CharRun[];
}

export interface Page {
  id: string;
  spreadId: string;
  pageNumber: string;
  width: number;   // pt
  height: number;  // pt
  margins: { top: number; right: number; bottom: number; left: number };
  // Spread-space offset of this page's origin — subtract from frame coords
  // to get page-local coordinates.
  transform: { tx: number; ty: number };
}

export interface Frame {
  id: string;
  storyId: string;
  previousFrame: string | null;
  nextFrame: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  spreadId: string;
  columnCount: number;   // InDesign TextColumnCount (default 1)
  columnGutter: number;  // pt between columns (default 0)
}

export interface Story {
  id: string;
  content: ContentBlock[];
}

export interface ParsedDocument {
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
