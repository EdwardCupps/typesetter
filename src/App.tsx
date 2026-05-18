import React, { useState } from 'react';
import type { ContentBlock, CharRun, ParsedDocument } from './shared/types';
import { PageView } from './renderer/components/PageView';
import { PropertiesPanel } from './renderer/components/PropertiesPanel';

type Selection = { storyId: string; blockIndex: number } | null;

// Adjust charRun boundaries and kerning pairs after a text edit, preserving
// per-segment styling. Diffs old vs new text to find the changed region, then
// shifts run boundaries accordingly.
function applyTextEdit(block: ContentBlock, newText: string): ContentBlock {
  const oldText = block.text;
  if (oldText === newText) return block;

  // Find longest common prefix and suffix to locate the changed region.
  let pre = 0;
  while (pre < oldText.length && pre < newText.length && oldText[pre] === newText[pre]) pre++;

  let suf = 0;
  const maxSuf = Math.min(oldText.length - pre, newText.length - pre);
  while (suf < maxSuf && oldText[oldText.length - 1 - suf] === newText[newText.length - 1 - suf]) suf++;

  const delStart = pre;
  const delEnd = oldText.length - suf;   // exclusive end of deleted region
  const insertLen = newText.length - pre - suf;
  const delta = insertLen - (delEnd - delStart);

  function shiftPos(pos: number): number {
    if (pos >= delEnd) return pos + delta;
    if (pos > delStart) return delStart + insertLen;
    return pos;
  }

  const newRuns = block.charRuns
    .map(r => {
      const s = shiftPos(r.start);
      const e = shiftPos(r.end);
      return s < e ? { ...r, start: s, end: e } : null;
    })
    .filter((r): r is CharRun => r !== null);

  // If text remains but all runs were collapsed, extend the last surviving run
  // (or clone the first) to cover the full new text.
  if (newText.length > 0 && newRuns.length === 0) {
    const proto = block.charRuns[0] ?? { start: 0, end: 0 };
    newRuns.push({ ...proto, start: 0, end: newText.length });
  } else if (newRuns.length > 0) {
    const last = newRuns[newRuns.length - 1];
    if (last.end < newText.length) newRuns[newRuns.length - 1] = { ...last, end: newText.length };
  }

  const newKerning = block.kerningPairs
    .map(kp => {
      if (kp.index >= delEnd) return { ...kp, index: kp.index + delta };
      if (kp.index >= delStart) return null;
      return kp;
    })
    .filter((kp): kp is ContentBlock['kerningPairs'][0] => kp !== null);

  return { ...block, text: newText, charRuns: newRuns, kerningPairs: newKerning };
}

export default function App() {
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [editing, setEditing] = useState<Selection>(null);

  async function handleImport() {
    setLoading(true);
    setSelection(null);
    setEditing(null);
    try {
      const result = await window.typesetter.idml.parse();
      setDoc(result);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(storyId: string, blockIndex: number) {
    if (blockIndex === -1) {
      setSelection(null);
      setEditing(null);
    } else {
      setSelection({ storyId, blockIndex });
    }
  }

  function handleStartEdit(storyId: string, blockIndex: number) {
    setSelection({ storyId, blockIndex });
    setEditing({ storyId, blockIndex });
  }

  function handleTextChange(newText: string) {
    if (!editing) return;
    const { storyId, blockIndex } = editing;
    setDoc(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        stories: prev.stories.map(s =>
          s.id === storyId
            ? {
                ...s,
                content: s.content.map((b, i) =>
                  i === blockIndex ? applyTextEdit(b, newText) : b
                ),
              }
            : s
        ),
      };
    });
  }

  function handleEndEdit() {
    setEditing(null);
  }

  function handleBlockChange(update: Partial<ContentBlock>) {
    if (!selection || !doc) return;
    setDoc(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        stories: prev.stories.map(s =>
          s.id === selection.storyId
            ? { ...s, content: s.content.map((b, i) => i === selection.blockIndex ? { ...b, ...update } : b) }
            : s
        ),
      };
    });
  }

  function handleCharRunChange(update: Partial<CharRun>, refRun?: CharRun) {
    if (!selection || !doc) return;
    const block = doc.stories.find(s => s.id === selection.storyId)?.content[selection.blockIndex];
    if (!block) return;
    const ref = refRun ?? block.charRuns[0];
    setDoc(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        stories: prev.stories.map(s =>
          s.id === selection.storyId
            ? {
                ...s,
                content: s.content.map((b, i) =>
                  i === selection.blockIndex
                    ? {
                        ...b,
                        charRuns: b.charRuns.map(r =>
                          r.fontSize === ref?.fontSize && r.fontFamily === ref?.fontFamily
                            ? { ...r, ...update }
                            : r
                        ),
                      }
                    : b
                ),
              }
            : s
        ),
      };
    });
  }

  const selectedBlock = selection && doc
    ? (doc.stories.find(s => s.id === selection.storyId)?.content[selection.blockIndex] ?? null)
    : null;

  const page1 = doc?.pages[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#2a2a2a' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 16px', background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a', flexShrink: 0,
      }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'system-ui' }}>
          Typesetter
        </span>
        {doc && (
          <span style={{ color: '#555', fontSize: 11, fontFamily: 'system-ui' }}>
            {doc.meta.docName}
          </span>
        )}
        <button
          onClick={handleImport}
          disabled={loading}
          style={{
            marginLeft: 'auto', padding: '4px 12px',
            background: '#333', color: '#ccc', border: '1px solid #444',
            borderRadius: 4, cursor: 'pointer', fontSize: 12, fontFamily: 'system-ui',
          }}
        >
          {loading ? 'Parsing…' : 'Import IDML…'}
        </button>
      </div>

      {/* Canvas + panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Canvas */}
        <div style={{
          flex: 1, overflow: 'auto',
          display: 'flex', justifyContent: 'center',
          padding: '40px',
        }}>
          {page1 ? (
            <PageView
              page={page1}
              frames={doc!.frames}
              stories={doc!.stories}
              selection={selection}
              editing={editing}
              onSelect={handleSelect}
              onStartEdit={handleStartEdit}
              onTextChange={handleTextChange}
              onEndEdit={handleEndEdit}
            />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#444', fontSize: 13, fontFamily: 'system-ui',
            }}>
              Import an IDML file to begin
            </div>
          )}
        </div>

        {/* Properties panel */}
        <PropertiesPanel
          block={selectedBlock}
          onBlockChange={handleBlockChange}
          onCharRunChange={handleCharRunChange}
        />
      </div>
    </div>
  );
}
