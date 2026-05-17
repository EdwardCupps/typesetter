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
}

export interface Frame {
  id: string;
  storyId: string;
  previousFrame: string | null;
  nextFrame: string | null;
  // Coordinates in spread space (page-local correction is a TODO for the
  // layout engine — requires subtracting each page's ItemTransform offset)
  x: number;
  y: number;
  width: number;
  height: number;
  spreadId: string;
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
