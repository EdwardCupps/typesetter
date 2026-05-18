import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentBlock, CharRun } from '../../shared/types';

// Font Access API — not yet in lib.dom.d.ts
interface FontData {
  family: string;
  style: string;
  fullName: string;
  postscriptName: string;
}
declare global {
  interface Window { queryLocalFonts?: () => Promise<FontData[]>; }
}

// ---- shared styles ----------------------------------------------------------

const s = {
  label: { flex: 1, color: '#777', fontSize: 11, fontFamily: 'system-ui' } as React.CSSProperties,
  value: {
    color: '#aaa', fontSize: 11, fontFamily: 'system-ui',
    maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  } as React.CSSProperties,
  input: {
    width: 52, padding: '2px 5px',
    background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 3,
    color: '#ccc', fontSize: 11, fontFamily: 'system-ui', outline: 'none',
  } as React.CSSProperties,
  unit: { color: '#555', fontSize: 10, fontFamily: 'system-ui' } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 } as React.CSSProperties,
  section: {
    color: '#555', fontSize: 10, fontFamily: 'system-ui', fontWeight: 600,
    letterSpacing: '0.07em', textTransform: 'uppercase' as const,
    marginTop: 14, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #2a2a2a',
  } as React.CSSProperties,
  alignBtn: (active: boolean): React.CSSProperties => ({
    padding: '2px 6px', fontSize: 10, fontFamily: 'system-ui',
    background: active ? '#3a3a3a' : 'transparent',
    color: active ? '#ddd' : '#555',
    border: '1px solid ' + (active ? '#4a4a4a' : '#333'),
    borderRadius: 3, cursor: 'pointer',
  }),
};

// ---- font picker ------------------------------------------------------------

function FontPicker({ value, variants, onPick }: {
  value: string | undefined;
  variants: FontData[];
  onPick: (font: FontData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return variants.filter(f => f.fullName.toLowerCase().includes(q));
  }, [variants, query]);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <button
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        style={{
          width: '100%', textAlign: 'left', padding: '2px 6px',
          background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 3,
          color: value ? '#ccc' : '#555', fontSize: 11, fontFamily: 'system-ui',
          cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {value || '—'}
      </button>

      {open && (
        <div style={{
          position: 'fixed', zIndex: 1000,
          width: 220, maxHeight: 260, display: 'flex', flexDirection: 'column',
          background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}
          ref={el => {
            if (el && ref.current) {
              const r = ref.current.getBoundingClientRect();
              el.style.top = (r.bottom + 4) + 'px';
              el.style.left = r.left + 'px';
            }
          }}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search fonts…"
            style={{
              padding: '6px 8px', background: 'transparent',
              border: 'none', borderBottom: '1px solid #2a2a2a',
              color: '#ccc', fontSize: 11, fontFamily: 'system-ui', outline: 'none', flexShrink: 0,
            }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '8px', color: '#555', fontSize: 11, fontFamily: 'system-ui' }}>No matches</div>
            )}
            {filtered.map(f => (
              <div
                key={f.postscriptName}
                onClick={() => { onPick(f); setOpen(false); }}
                style={{
                  padding: '5px 8px', cursor: 'pointer',
                  background: f.fullName === value ? '#2a3a4a' : 'transparent',
                  color: f.fullName === value ? '#7ab8f5' : '#bbb',
                  fontSize: 11, fontFamily: 'system-ui',
                }}
                onMouseEnter={e => { if (f.fullName !== value) (e.currentTarget as HTMLDivElement).style.background = '#252525'; }}
                onMouseLeave={e => { if (f.fullName !== value) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                {f.fullName}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- style segment ----------------------------------------------------------
// A segment groups consecutive charRuns that share the same visual style.
// Used to let the user pick which style to inspect/edit within a block that
// contains multiple sizes or fonts (e.g. header + subtitle in one PSR).

interface StyleSegment {
  startChar: number; // start index of first run — stable identity even after edits
  runs: CharRun[];
  preview: string;   // short text snippet for the chip label
}

function buildSegments(block: ContentBlock): StyleSegment[] {
  const segs: StyleSegment[] = [];
  for (const run of block.charRuns) {
    const key = `${run.fontFamily ?? ''}|${run.fontSize ?? ''}|${run.fontVariant ?? ''}|${run.leading ?? ''}`;
    const last = segs[segs.length - 1];
    const lastKey = last
      ? `${last.runs[0].fontFamily ?? ''}|${last.runs[0].fontSize ?? ''}|${last.runs[0].fontVariant ?? ''}|${last.runs[0].leading ?? ''}`
      : null;
    if (last && lastKey === key) {
      last.runs.push(run);
    } else {
      const rawText = block.text.slice(run.start, run.end).replace(/\n/g, ' ').trim();
      const preview = rawText.length > 14 ? rawText.slice(0, 13) + '…' : rawText || `${run.fontSize ?? '?'}pt`;
      segs.push({ startChar: run.start, runs: [run], preview });
    }
  }
  return segs;
}

// ---- panel ------------------------------------------------------------------

interface Props {
  block: ContentBlock | null;
  onBlockChange: (update: Partial<ContentBlock>) => void;
  onCharRunChange: (update: Partial<CharRun>, refRun?: CharRun) => void;
}

export function PropertiesPanel({ block, onBlockChange, onCharRunChange }: Props) {
  const [allFonts, setAllFonts] = useState<FontData[]>([]);
  // Stable identity for the current block selection — only resets focused
  // segment when the user clicks a different paragraph, not on every edit.
  const blockSignature = block ? `${block.text.length}|${block.charRuns.length}|${block.paragraphStyle}` : '';
  const [focusedStart, setFocusedStart] = useState<number>(0);

  useEffect(() => {
    if (typeof window.queryLocalFonts === 'function') {
      window.queryLocalFonts()
        .then(f => setAllFonts(f.sort((a, b) => a.fullName.localeCompare(b.fullName))))
        .catch(() => {});
    }
  }, []);

  const styleSegments = useMemo(
    () => (block ? buildSegments(block) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block]
  );

  // Reset focused segment when a different block is selected.
  useEffect(() => {
    setFocusedStart(styleSegments[0]?.startChar ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockSignature]);

  const focusedSegment =
    styleSegments.find(s => s.startChar === focusedStart) ?? styleSegments[0];
  const focusedRun = focusedSegment?.runs[0];

  // Variants for the focused run's font family.
  const familyVariants = useMemo(() => {
    if (!focusedRun?.fontFamily) return [];
    const font = allFonts.find(f => f.fullName === focusedRun.fontFamily)
      ?? allFonts.find(f => f.family === focusedRun.fontFamily);
    if (!font) return [];
    return allFonts.filter(f => f.family === font.family);
  }, [allFonts, focusedRun?.fontFamily]);

  function pickFont(font: FontData) {
    onCharRunChange({ fontFamily: font.fullName, fontVariant: font.style }, focusedRun);
  }

  function pickVariant(postscriptName: string) {
    const font = allFonts.find(f => f.postscriptName === postscriptName);
    if (font) onCharRunChange({ fontFamily: font.fullName, fontVariant: font.style }, focusedRun);
  }

  const currentVariantPs = (
    allFonts.find(f => f.fullName === focusedRun?.fontFamily)
    ?? allFonts.find(f => f.family === focusedRun?.fontFamily)
  )?.postscriptName ?? '';

  const multiSegment = styleSegments.length > 1;

  return (
    <div style={{
      width: 216, flexShrink: 0,
      background: '#1a1a1a', borderLeft: '1px solid #2a2a2a',
      padding: '10px 14px', overflowY: 'auto',
    }}>
      {!block ? (
        <div style={{ color: '#3a3a3a', fontSize: 11, fontFamily: 'system-ui', marginTop: 6 }}>
          Click a paragraph to inspect
        </div>
      ) : (
        <>
          <div style={s.section}>Paragraph</div>

          <div style={s.row}>
            <span style={s.label}>Style</span>
            <span style={s.value}>{block.paragraphStyle || '—'}</span>
          </div>

          <div style={s.row}>
            <span style={s.label}>Align</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['LeftJustified', 'CenterJustified', 'RightJustified', 'FullyJustified'] as const).map(j => (
                <button key={j} onClick={() => onBlockChange({ justification: j })} style={s.alignBtn(block.justification === j)}>
                  {j === 'LeftJustified' ? 'L' : j === 'CenterJustified' ? 'C' : j === 'RightJustified' ? 'R' : 'J'}
                </button>
              ))}
            </div>
          </div>

          <div style={s.row}>
            <span style={s.label}>Left indent</span>
            <input type="number" style={s.input} value={block.leftIndent ?? 0}
              onChange={e => onBlockChange({ leftIndent: Number(e.target.value) })} />
            <span style={s.unit}>pt</span>
          </div>

          <div style={s.row}>
            <span style={s.label}>First line</span>
            <input type="number" style={s.input} value={block.firstLineIndent ?? 0}
              onChange={e => onBlockChange({ firstLineIndent: Number(e.target.value) })} />
            <span style={s.unit}>pt</span>
          </div>

          <div style={s.section}>Type</div>

          {/* Segment chips — only shown when the block has multiple styles */}
          {multiSegment && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {styleSegments.map(seg => {
                const active = seg.startChar === focusedSegment?.startChar;
                const size = seg.runs[0]?.fontSize;
                const label = size ? `${size}pt` : seg.preview;
                return (
                  <button
                    key={seg.startChar}
                    title={seg.preview}
                    onClick={() => setFocusedStart(seg.startChar)}
                    style={{
                      padding: '2px 7px', fontSize: 10, fontFamily: 'system-ui',
                      background: active ? '#2a3a4a' : '#222',
                      color: active ? '#7ab8f5' : '#555',
                      border: '1px solid ' + (active ? '#3a5a7a' : '#333'),
                      borderRadius: 10, cursor: 'pointer',
                      maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ ...s.row, alignItems: 'flex-start', flexDirection: 'column', gap: 3 }}>
            <span style={s.label}>Font</span>
            <FontPicker value={focusedRun?.fontFamily} variants={allFonts} onPick={pickFont} />
          </div>

          {familyVariants.length > 1 && (
            <div style={s.row}>
              <span style={s.label}>Variant</span>
              <select
                value={currentVariantPs}
                onChange={e => pickVariant(e.target.value)}
                style={{
                  flex: 1, padding: '2px 4px',
                  background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 3,
                  color: '#ccc', fontSize: 11, fontFamily: 'system-ui', outline: 'none',
                }}
              >
                {familyVariants.map(f => (
                  <option key={f.postscriptName} value={f.postscriptName}>{f.style}</option>
                ))}
              </select>
            </div>
          )}

          <div style={s.row}>
            <span style={s.label}>Size</span>
            <input type="number" style={s.input} value={focusedRun?.fontSize ?? ''}
              onChange={e => onCharRunChange({ fontSize: Number(e.target.value) }, focusedRun)} />
            <span style={s.unit}>pt</span>
          </div>

          <div style={s.row}>
            <span style={s.label}>Leading</span>
            <input type="number" style={s.input} value={focusedRun?.leading ?? ''}
              onChange={e => onCharRunChange({ leading: Number(e.target.value) }, focusedRun)} />
            <span style={s.unit}>pt</span>
          </div>

          <div style={s.row}>
            <span style={s.label}>Tracking</span>
            <input type="number" style={s.input} value={focusedRun?.tracking ?? 0}
              onChange={e => onCharRunChange({ tracking: Number(e.target.value) }, focusedRun)} />
          </div>
        </>
      )}
    </div>
  );
}
