import React, { useEffect, useRef, useMemo, useState } from 'react';
import type { ContentBlock, Frame, Page, Story } from '../../shared/types';

// CSS pt units map directly to InDesign pt values — no conversion needed.
const pt = (n: number) => `${n}pt`;

// ---- font face injection ----------------------------------------------------
// We resolve each IDML font name to a PostScript name via the Font Access API,
// then inject @font-face rules that reference the exact face via local().
// This sidesteps CSS family-name ambiguity (e.g. "Frutiger CE 65 Bold" may not
// be a registered CSS family; its PostScript name "FrutigerCE-Bold" always is).

interface FontData {
  family: string;
  style: string;
  fullName: string;
  postscriptName: string;
}
declare global {
  interface Window { queryLocalFonts?: () => Promise<FontData[]>; }
}

// Map from IDML fontFamily string → synthetic CSS family name (based on PS name)
type FontLookup = Map<string, string>;

function syntheticName(psName: string) {
  return `__ts_${psName}`;
}

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

  // Inject @font-face rules whenever the lookup changes.
  useEffect(() => {
    const rules: string[] = [];
    for (const [, cssFamily] of lookup) {
      const psName = cssFamily.slice('__ts_'.length);
      // font-weight/style are intentionally "normal" — the @font-face pins the
      // exact variant, so we never need CSS weight/style synthesis on top.
      rules.push(
        `@font-face{font-family:'${cssFamily}';src:local('${psName}');font-weight:normal;font-style:normal;}`
      );
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

function charRunStyle(
  block: ContentBlock,
  charIndex: number,
  fontLookup: FontLookup,
): React.CSSProperties {
  const run = block.charRuns.find(r => charIndex >= r.start && charIndex < r.end);
  if (!run) return {};
  const style: React.CSSProperties = {};

  if (run.fontFamily) {
    const cssFamily = fontLookup.get(run.fontFamily);
    if (cssFamily) {
      // Synthetic @font-face family — exact variant, no weight/style needed.
      style.fontFamily = `'${cssFamily}'`;
    } else {
      // Font Access API unavailable or font not found — fall back to IDML name
      // and apply weight/style heuristics. We only set font-weight/style when
      // the family name doesn't already encode the variant, to avoid browser
      // synthesis doubling the weight on faces like "Frutiger CE 65 Bold".
      style.fontFamily = `'${run.fontFamily}'`;
      const nameHasWeight = /bold|light|medium|black|heavy|thin|ultra|condensed/i.test(run.fontFamily);
      const nameHasStyle  = /italic|oblique/i.test(run.fontFamily);
      if (!nameHasWeight && run.fontVariant === 'Bold') style.fontWeight = 'bold';
      if (!nameHasStyle && (run.fontVariant === 'Italic' || run.fontVariant?.includes('Italic')))
        style.fontStyle = 'italic';
      if (!nameHasWeight && !nameHasStyle && run.fontVariant === 'Bold Italic') {
        style.fontWeight = 'bold';
        style.fontStyle = 'italic';
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

// Get the character offset of a DOM node+offset relative to a container element.
function charOffsetOf(container: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

function ParagraphBlock({
  block, isSelected, isEditing, onSelect, onStartEdit, onSelectionChange, onTextChange, onEndEdit, fontLookup,
}: {
  block: ContentBlock;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onSelectionChange: (start: number, end: number) => void;
  onTextChange: (text: string) => void;
  onEndEdit: () => void;
  fontLookup: FontLookup;
}) {
  const firstRun = block.charRuns[0];
  const firstCssFamily = firstRun?.fontFamily
    ? (fontLookup.get(firstRun.fontFamily) ?? firstRun.fontFamily)
    : undefined;
  const ceRef = useRef<HTMLParagraphElement>(null);

  // Track text selection to drive the properties panel.
  useEffect(() => {
    if (!isEditing) return;
    function onSelChange() {
      const sel = window.getSelection();
      if (!sel || !ceRef.current) return;
      const anchor = sel.anchorNode;
      const focus = sel.focusNode;
      if (!anchor || !ceRef.current.contains(anchor)) return;
      const a = charOffsetOf(ceRef.current, anchor, sel.anchorOffset);
      const f = focus && ceRef.current.contains(focus)
        ? charOffsetOf(ceRef.current, focus, sel.focusOffset)
        : a;
      onSelectionChange(Math.min(a, f), Math.max(a, f));
    }
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, [isEditing, onSelectionChange]);

  // Shared layout properties (font, size, alignment, indents).
  const sharedStyle: React.CSSProperties = {
    fontFamily: firstCssFamily ? `'${firstCssFamily}'` : undefined,
    fontSize: firstRun?.fontSize ? pt(firstRun.fontSize) : undefined,
    lineHeight: firstRun?.leading ? pt(firstRun.leading) : undefined,
    textAlign: justificationToTextAlign(block.justification),
    paddingLeft: block.leftIndent ? pt(block.leftIndent) : undefined,
    textIndent: block.firstLineIndent ? pt(block.firstLineIndent) : undefined,
  };

  // Build styled segments from charRuns + kerning pairs.
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

  if (isEditing) {
    // contenteditable keeps the document look — styled spans stay visible, user
    // can click anywhere and the selection drives the properties panel.
    return (
      <p
        ref={ceRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={e => {
          // Strip any trailing newline browsers sometimes append.
          const text = e.currentTarget.innerText.replace(/\n$/, '');
          onTextChange(text);
          onEndEdit();
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); }
          // Let the browser insert a literal \n (soft return) on Enter rather
          // than splitting into a new block element.
          if (e.key === 'Enter') {
            e.preventDefault();
            document.execCommand('insertText', false, '\n');
          }
        }}
        onClick={e => e.stopPropagation()}
        style={{
          ...sharedStyle,
          margin: 0, marginTop: 0, marginBottom: 0,
          padding: 0,
          whiteSpace: 'pre-wrap',
          textAlignLast: block.justification === 'FullyJustified' ? 'justify' : undefined,
          outline: '1px solid rgba(74,158,255,0.8)',
          outlineOffset: '1px',
          cursor: 'text',
        }}
      >
        {segments.map((seg, i) => <span key={i} style={seg.style}>{seg.text}</span>)}
      </p>
    );
  }

  return (
    <p
      style={{
        ...sharedStyle,
        margin: 0, marginTop: 0, marginBottom: 0,
        padding: 0,
        whiteSpace: 'pre-wrap',
        textAlignLast: block.justification === 'FullyJustified' ? 'justify' : undefined,
        cursor: 'default',
        outline: isSelected ? '1px solid rgba(74,158,255,0.5)' : 'none',
        outlineOffset: '1px',
      }}
      onClick={e => { e.stopPropagation(); onSelect(); }}
      onDoubleClick={e => { e.stopPropagation(); onStartEdit(); }}
    >
      {segments.map((seg, i) => <span key={i} style={seg.style}>{seg.text}</span>)}
    </p>
  );
}

// ---- frame ------------------------------------------------------------------

type Selection = { storyId: string; blockIndex: number } | null;

function FrameView({
  frame, localX, localY, story, selection, editing, onSelect, onStartEdit, onSelectionChange, onTextChange, onEndEdit, fontLookup,
}: {
  frame: Frame;
  localX: number;
  localY: number;
  story: Story;
  selection: Selection;
  editing: Selection;
  onSelect: (storyId: string, blockIndex: number) => void;
  onStartEdit: (storyId: string, blockIndex: number) => void;
  onSelectionChange: (start: number, end: number) => void;
  onTextChange: (text: string) => void;
  onEndEdit: () => void;
  fontLookup: FontLookup;
}) {
  const cols = frame.columnCount > 1 ? frame.columnCount : undefined;
  return (
    <div style={{
      position: 'absolute',
      left: pt(localX),
      top: pt(localY),
      width: pt(frame.width),
      height: pt(frame.height),
      overflow: 'visible',
      boxSizing: 'border-box',
      ...(cols ? { columnCount: cols, columnGap: pt(frame.columnGutter) } : {}),
    }}>
      {story.content.map((block, i) => (
        <ParagraphBlock
          key={i}
          block={block}
          isSelected={selection?.storyId === story.id && selection?.blockIndex === i}
          isEditing={editing?.storyId === story.id && editing?.blockIndex === i}
          onSelect={() => onSelect(story.id, i)}
          onStartEdit={() => onStartEdit(story.id, i)}
          onSelectionChange={onSelectionChange}
          onTextChange={onTextChange}
          onEndEdit={onEndEdit}
          fontLookup={fontLookup}
        />
      ))}
    </div>
  );
}

// ---- page -------------------------------------------------------------------

export function PageView({
  page, frames, stories, selection, editing, onSelect, onStartEdit, onSelectionChange, onTextChange, onEndEdit,
}: {
  page: Page;
  frames: Frame[];
  stories: Story[];
  selection: Selection;
  editing: Selection;
  onSelect: (storyId: string, blockIndex: number) => void;
  onStartEdit: (storyId: string, blockIndex: number) => void;
  onSelectionChange: (start: number, end: number) => void;
  onTextChange: (text: string) => void;
  onEndEdit: () => void;
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
      onClick={() => onSelect('', -1)}
    >
      {/* Margin guide */}
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
        const localX = frame.x - page.transform.tx;
        const localY = frame.y - page.transform.ty;
        return (
          <FrameView
            key={frame.id}
            frame={frame}
            localX={localX}
            localY={localY}
            story={story}
            selection={selection}
            editing={editing}
            onSelect={onSelect}
            onStartEdit={onStartEdit}
            onSelectionChange={onSelectionChange}
            onTextChange={onTextChange}
            onEndEdit={onEndEdit}
            fontLookup={fontLookup}
          />
        );
      })}
    </div>
  );
}
