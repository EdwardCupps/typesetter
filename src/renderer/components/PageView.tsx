import React from 'react';
import type { ContentBlock, Frame, Page, Story } from '../../shared/types';

// CSS pt units map directly to InDesign pt values — no conversion needed.
const pt = (n: number) => `${n}pt`;

// ---- text rendering ---------------------------------------------------------

function charRunStyle(block: ContentBlock, charIndex: number): React.CSSProperties {
  const run = block.charRuns.find(r => charIndex >= r.start && charIndex < r.end);
  if (!run) return {};
  const style: React.CSSProperties = {};
  if (run.fontFamily) style.fontFamily = `'${run.fontFamily}'`;
  if (run.fontSize) style.fontSize = pt(run.fontSize);
  if (run.leading) style.lineHeight = pt(run.leading);
  if (run.tracking) style.letterSpacing = `${run.tracking / 1000}em`;
  if (run.fontVariant === 'Bold') style.fontWeight = 'bold';
  if (run.fontVariant === 'Italic' || run.fontVariant?.includes('Italic')) style.fontStyle = 'italic';
  if (run.fontVariant === 'Bold Italic') { style.fontWeight = 'bold'; style.fontStyle = 'italic'; }
  return style;
}

function ParagraphBlock({ block }: { block: ContentBlock }) {
  const firstRun = block.charRuns[0];

  // Paragraph-level defaults from the dominant (first) run
  const paraStyle: React.CSSProperties = {
    margin: 0,
    padding: 0,
    whiteSpace: 'pre-wrap',
    fontFamily: firstRun?.fontFamily ? `'${firstRun.fontFamily}'` : undefined,
    fontSize: firstRun?.fontSize ? pt(firstRun.fontSize) : undefined,
    lineHeight: firstRun?.leading ? pt(firstRun.leading) : undefined,
    letterSpacing: firstRun?.tracking ? `${firstRun.tracking / 1000}em` : undefined,
  };

  // Build a kerning map: charIndex → kern value (thousandths of em)
  const kernMap: Record<number, number> = {};
  for (const kp of block.kerningPairs) kernMap[kp.index] = kp.value;

  // Split text into segments at charRun boundaries and kerning positions.
  // Each segment renders as a single <span>.
  const segments: { text: string; style: React.CSSProperties }[] = [];

  for (const run of block.charRuns) {
    const runText = block.text.slice(run.start, run.end);
    const runStyle = charRunStyle(block, run.start);

    // Find kerning pairs within this run
    const runKerns = block.kerningPairs.filter(
      kp => kp.index >= run.start && kp.index < run.end
    );

    if (runKerns.length === 0) {
      segments.push({ text: runText, style: runStyle });
    } else {
      // Split at each kerning position — each kerned character needs its own span
      let pos = run.start;
      for (const kp of runKerns) {
        if (kp.index > pos) {
          segments.push({ text: block.text.slice(pos, kp.index), style: runStyle });
        }
        segments.push({
          text: block.text[kp.index] ?? '',
          style: {
            ...runStyle,
            display: 'inline-block',
            marginLeft: `${kp.value / 1000}em`,
          },
        });
        pos = kp.index + 1;
      }
      if (pos < run.end) {
        segments.push({ text: block.text.slice(pos, run.end), style: runStyle });
      }
    }
  }

  return (
    <p style={paraStyle}>
      {segments.map((seg, i) => (
        <span key={i} style={seg.style}>{seg.text}</span>
      ))}
    </p>
  );
}

// ---- frame ------------------------------------------------------------------

function FrameView({
  frame, localX, localY, story,
}: {
  frame: Frame;
  localX: number;
  localY: number;
  story: Story;
}) {
  return (
    <div style={{
      position: 'absolute',
      left: pt(localX),
      top: pt(localY),
      width: pt(frame.width),
      height: pt(frame.height),
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      {story.content.map((block, i) => (
        <ParagraphBlock key={i} block={block} />
      ))}
    </div>
  );
}

// ---- page -------------------------------------------------------------------

export function PageView({
  page, frames, stories,
}: {
  page: Page;
  frames: Frame[];
  stories: Story[];
}) {
  const pageFrames = frames.filter(f => f.spreadId === page.spreadId);

  return (
    <div style={{
      position: 'relative',
      width: pt(page.width),
      height: pt(page.height),
      background: '#fff',
      boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
      flexShrink: 0,
    }}>
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
          />
        );
      })}
    </div>
  );
}
