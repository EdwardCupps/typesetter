import React from 'react';
import type { ContentBlock, CharRun } from '../../shared/types';

const s = {
  label: {
    flex: 1, color: '#777', fontSize: 11, fontFamily: 'system-ui',
  } as React.CSSProperties,
  value: {
    color: '#aaa', fontSize: 11, fontFamily: 'system-ui',
    maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  } as React.CSSProperties,
  input: {
    width: 52, padding: '2px 5px',
    background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 3,
    color: '#ccc', fontSize: 11, fontFamily: 'system-ui',
    outline: 'none',
  } as React.CSSProperties,
  unit: {
    color: '#555', fontSize: 10, fontFamily: 'system-ui',
  } as React.CSSProperties,
  row: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
  } as React.CSSProperties,
  section: {
    color: '#555', fontSize: 10, fontFamily: 'system-ui', fontWeight: 600,
    letterSpacing: '0.07em', textTransform: 'uppercase' as const,
    marginTop: 14, marginBottom: 6, paddingBottom: 4,
    borderBottom: '1px solid #2a2a2a',
  } as React.CSSProperties,
  alignBtn: (active: boolean): React.CSSProperties => ({
    padding: '2px 6px', fontSize: 10, fontFamily: 'system-ui',
    background: active ? '#3a3a3a' : 'transparent',
    color: active ? '#ddd' : '#555',
    border: '1px solid ' + (active ? '#4a4a4a' : '#333'),
    borderRadius: 3, cursor: 'pointer',
  }),
};

interface Props {
  block: ContentBlock | null;
  onBlockChange: (update: Partial<ContentBlock>) => void;
  onCharRunChange: (update: Partial<CharRun>) => void;
}

export function PropertiesPanel({ block, onBlockChange, onCharRunChange }: Props) {
  const firstRun = block?.charRuns[0];

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

          <div style={s.row}>
            <span style={s.label}>Font</span>
            <span style={s.value}>{firstRun?.fontFamily || '—'}</span>
          </div>

          <div style={s.row}>
            <span style={s.label}>Variant</span>
            <span style={s.value}>{firstRun?.fontVariant || '—'}</span>
          </div>

          <div style={s.row}>
            <span style={s.label}>Size</span>
            <input type="number" style={s.input} value={firstRun?.fontSize ?? ''}
              onChange={e => onCharRunChange({ fontSize: Number(e.target.value) })} />
            <span style={s.unit}>pt</span>
          </div>

          <div style={s.row}>
            <span style={s.label}>Leading</span>
            <input type="number" style={s.input} value={firstRun?.leading ?? ''}
              onChange={e => onCharRunChange({ leading: Number(e.target.value) })} />
            <span style={s.unit}>pt</span>
          </div>

          <div style={s.row}>
            <span style={s.label}>Tracking</span>
            <input type="number" style={s.input} value={firstRun?.tracking ?? 0}
              onChange={e => onCharRunChange({ tracking: Number(e.target.value) })} />
          </div>
        </>
      )}
    </div>
  );
}
