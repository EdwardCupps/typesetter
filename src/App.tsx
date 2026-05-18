import React, { useState } from 'react';
import type { ContentBlock, CharRun, ParsedDocument } from './shared/types';
import { PageView } from './renderer/components/PageView';
import { PropertiesPanel } from './renderer/components/PropertiesPanel';

type Selection = { storyId: string; blockIndex: number } | null;

export default function App() {
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);

  async function handleImport() {
    setLoading(true);
    setSelection(null);
    try {
      const result = await window.typesetter.idml.parse();
      setDoc(result);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(storyId: string, blockIndex: number) {
    setSelection(blockIndex === -1 ? null : { storyId, blockIndex });
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
    // Only update runs that share the same font family + size as the reference run
    // (caller supplies the focused segment's run; falls back to charRuns[0]).
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
              onSelect={handleSelect}
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
