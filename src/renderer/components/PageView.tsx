import React, { useEffect, useRef, useMemo, useState } from 'react';
import type { ContentBlock, Frame, Page, Story } from '../../shared/types';

const pt = (n: number) => `${n}pt`;

// ---- font face injection ----------------------------------------------------

interface FontData {
  family: string;
  style: string;
  fullName: string;
  postscriptName: string;
}
declare global {
  interface Window { queryLocalFonts?: () => Promise<FontData[]>; }
}

type FontLookup = Map<string, string>;

function syntheticName(psName: string) { return `__ts_${psName}`; }

function useFontLookup(stories: Story[]): FontLookup {
  const [allFonts, setAllFonts] = useState<FontData[]>([]);

  useEffect(() => {
    if (typeof window.queryLocalFonts === 'function') {
      window.queryLocalFonts().then(f => setAllFonts(f)).catch(() => {});
    }
  }, []);

  const lookup = useMemo(() => {
    const map: FontLookup = new Map();
    if (!allFonts.length) return map;
    for (const story of stories) {
      for (const block of story.content) {
        for (const run of block.charRuns) {
          if (!run.fontFamily || map.has(run.fontFamily)) continue;
          const font =
            allFonts.find(f => f.fullName === run.fontFamily) ??
            allFonts.find(f => f.family === run.fontFamily);
          if (font) map.set(run.fontFamily, syntheticName(font.postscriptName));
        }
      }
    }
    return map;
  }, [allFonts, stories]);

  useEffect(() => {
    const rules: string[] = [];
    for (const [, cssFamily] of lookup) {
      const psName = cssFamily.slice('__ts_'.length);
      rules.push(`@font-face{font-family:'${cssFamily}';src:local('${psName}');font-weight:normal;font-style:normal;}`);
    }
    let el = document.getElementById('__ts_fontfaces');
    if (!el) {
      el = document.createElement('style');
      el.id = '__ts_fontfaces';
      document.head.appendChild(el);
    }
    el.textContent = rules.join('\n');
  }, [lookup]);

  return lookup;
}

// ---- text rendering ---------------------------------------------------------

function charRunStyle(block: ContentBlock, charIndex: number, fontLookup: FontLookup): React.CSSProperties {
  const run = block.charRuns.find(r => charIndex >= r.start && charIndex < r.end);
  if (!run) return {};
  const style: React.CSSProperties = {};

  if (run.fontFamily) {
    const cssFamily = fontLookup.get(run.fontFamily);
    if (cssFamily) {
      style.fontFamily = `'${cssFamily}'`;
    } else {
      style.fontFamily = `'${run.fontFamily}'`;
      const nameHasWeight = /bold|light|medium|black|heavy|thin|ultra|condensed/i.test(run.fontFamily);
      const nameHasStyle  = /italic|oblique/i.test(run.fontFamily);
      if (!nameHasWeight && run.fontVariant === 'Bold') style.fontWeight = 'bold';
      if (!nameHasStyle && (run.fontVariant === 'Italic' || run.fontVariant?.includes('Italic')))
        style.fontStyle = 'italic';
      if (!nameHasWeight && !nameHasStyle && run.fontVariant === 'Bold Italic') {
        style.fontWeight = 'bold'; style.fontStyle = 'italic';
      }
    }
  }

  if (run.fontSize) style.fontSize = pt(run.fontSize);
  if (run.leading) style.lineHeight = pt(run.leading);
  if (run.tracking) style.letterSpacing = `${run.tracking / 1000}em`;
  return style;
}

function justificationToTextAlign(j: string | undefined): React.CSSProperties['textAlign'] {
  switch (j) {
    case 'FullyJustified': return 'justify';
    case 'RightJustified': return 'right';
    case 'CenterJustified': return 'center';
    default: return 'left';
  }
}

// ---- paragraph --------------------------------------------------------------

function ParagraphBlock({
  block, blockIndex, isSelected, fontLookup,
}: {
  block: ContentBlock;
  blockIndex: number;
  isSelected: boolean;
  fontLookup: FontLookup;
}) {
  const firstRun = block.charRuns[0];
  const firstCssFamily = firstRun?.fontFamily
    ? (fontLookup.get(firstRun.fontFamily) ?? firstRun.fontFamily)
    : undefined;

  const segments: { text: string; style: React.CSSProperties }[] = [];
  for (const run of block.charRuns) {
    const runStyle = charRunStyle(block, run.start, fontLookup);
    const runKerns = block.kerningPairs.filter(kp => kp.index >= run.start && kp.index < run.end);
    if (runKerns.length === 0) {
      segments.push({ text: block.text.slice(run.start, run.end), style: runStyle });
    } else {
      let pos = run.start;
      for (const kp of runKerns) {
        if (kp.index > pos) segments.push({ text: block.text.slice(pos, kp.index), style: runStyle });
        segments.push({
          text: block.text[kp.index] ?? '',
          style: { ...runStyle, display: 'inline-block', marginLeft: `${kp.value / 1000}em` },
        });
        pos = kp.index + 1;
      }
      if (pos < run.end) segments.push({ text: block.text.slice(pos, run.end), style: runStyle });
    }
  }

  return (
    <p
      data-block-index={blockIndex}
      style={{
        fontFamily: firstCssFamily ? `'${firstCssFamily}'` : undefined,
        fontSize: firstRun?.fontSize ? pt(firstRun.fontSize) : undefined,
        lineHeight: firstRun?.leading ? pt(firstRun.leading) : undefined,
        textAlign: justificationToTextAlign(block.justification),
        textAlignLast: block.justification === 'FullyJustified' ? 'justify' : undefined,
        paddingLeft: block.leftIndent ? pt(block.leftIndent) : undefined,
        textIndent: block.firstLineIndent ? pt(block.firstLineIndent) : undefined,
        margin: 0, marginTop: 0, marginBottom: 0, padding: 0,
        whiteSpace: 'pre-wrap',
        outline: isSelected ? '1px solid rgba(74,158,255,0.35)' : 'none',
        outlineOffset: '1px',
      }}
    >
      {segments.map((seg, i) => <span key={i} style={seg.style}>{seg.text}</span>)}
    </p>
  );
}

// ---- frame ------------------------------------------------------------------
// The frame div is one contenteditable region. All paragraphs inside are
// editable as a unit. selectionchange tracks which paragraph has the cursor.

type Selection = { storyId: string; blockIndex: number } | null;

function charOffsetOf(container: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

function FrameView({
  frame, localX, localY, story, selection, fontLookup,
  onBlockFocus, onSelectionChange, onBlockTextChange,
}: {
  frame: Frame;
  localX: number;
  localY: number;
  story: Story;
  selection: Selection;
  fontLookup: FontLookup;
  onBlockFocus: (storyId: string, blockIndex: number) => void;
  onSelectionChange: (start: number, end: number) => void;
  onBlockTextChange: (storyId: string, blockIndex: number, newText: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const cols = frame.columnCount > 1 ? frame.columnCount : undefined;

  // One selectionchange listener handles all paragraphs in this frame.
  useEffect(() => {
    function onSel() {
      const sel = window.getSelection();
      if (!sel || !frameRef.current) return;
      const anchor = sel.anchorNode;
      if (!anchor || !frameRef.current.contains(anchor)) return;

      // Walk up from anchor to find the <p data-block-index>.
      let node: Node | null = anchor;
      while (node && node !== frameRef.current) {
        if (node instanceof HTMLElement && node.dataset.blockIndex !== undefined) {
          const blockIndex = parseInt(node.dataset.blockIndex);
          const a = charOffsetOf(node, anchor, sel.anchorOffset);
          const f = sel.focusNode && node.contains(sel.focusNode)
            ? charOffsetOf(node, sel.focusNode, sel.focusOffset)
            : a;
          onBlockFocus(story.id, blockIndex);
          onSelectionChange(Math.min(a, f), Math.max(a, f));
          return;
        }
        node = node.parentNode;
      }
    }
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [story.id, onBlockFocus, onSelectionChange]);

  return (
    <div
      ref={frameRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={{
        position: 'absolute',
        left: pt(localX), top: pt(localY),
        width: pt(frame.width), height: pt(frame.height),
        overflow: 'visible',
        boxSizing: 'border-box',
        outline: 'none',
        ...(cols ? { columnCount: cols, columnGap: pt(frame.columnGutter) } : {}),
      }}
      onClick={e => e.stopPropagation()}
      onBlur={e => {
        if (frameRef.current?.contains(e.relatedTarget as Node)) return;
        frameRef.current?.querySelectorAll<HTMLElement>('[data-block-index]').forEach(el => {
          onBlockTextChange(story.id, parseInt(el.dataset.blockIndex!), el.innerText.replace(/\n$/, ''));
        });
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Enter') {
          e.preventDefault();
          document.execCommand('insertText', false, '\n');
        }
      }}
    >
      {story.content.map((block, i) => (
        <ParagraphBlock
          key={i}
          block={block}
          blockIndex={i}
          isSelected={selection?.storyId === story.id && selection?.blockIndex === i}
          fontLookup={fontLookup}
        />
      ))}
    </div>
  );
}

// ---- page -------------------------------------------------------------------

export function PageView({
  page, frames, stories, selection, onPageClick, onBlockFocus, onSelectionChange, onBlockTextChange,
}: {
  page: Page;
  frames: Frame[];
  stories: Story[];
  selection: Selection;
  onPageClick: () => void;
  onBlockFocus: (storyId: string, blockIndex: number) => void;
  onSelectionChange: (start: number, end: number) => void;
  onBlockTextChange: (storyId: string, blockIndex: number, newText: string) => void;
}) {
  const fontLookup = useFontLookup(stories);
  const pageFrames = frames.filter(f => f.spreadId === page.spreadId);

  return (
    <div
      style={{
        position: 'relative',
        width: pt(page.width),
        height: pt(page.height),
        background: '#fff',
        boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
        flexShrink: 0,
      }}
      onClick={onPageClick}
    >
      <div style={{
        position: 'absolute',
        top: pt(page.margins.top),
        left: pt(page.margins.left),
        right: pt(page.margins.right),
        bottom: pt(page.margins.bottom),
        outline: '1px solid rgba(255,0,255,0.25)',
        pointerEvents: 'none',
      }} />

      {pageFrames.map(frame => {
        const story = stories.find(s => s.id === frame.storyId);
        if (!story) return null;
        return (
          <FrameView
            key={frame.id}
            frame={frame}
            localX={frame.x - page.transform.tx}
            localY={frame.y - page.transform.ty}
            story={story}
            selection={selection}
            fontLookup={fontLookup}
            onBlockFocus={onBlockFocus}
            onSelectionChange={onSelectionChange}
            onBlockTextChange={onBlockTextChange}
          />
        );
      })}
    </div>
  );
}
