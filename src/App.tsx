import React, { useState } from 'react';
import type { ParsedDocument } from './shared/types';
import { PageView } from './renderer/components/PageView';

export default function App() {
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleImport() {
    setLoading(true);
    try {
      const result = await window.typesetter.idml.parse();
      setDoc(result);
    } finally {
      setLoading(false);
    }
  }

  const page1 = doc?.pages[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#2a2a2a' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 16px', background: '#1a1a1a',
        borderBottom: '1px solid #333', flexShrink: 0,
      }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'system-ui' }}>
          Typesetter
        </span>
        {doc && (
          <span style={{ color: '#666', fontSize: 11, fontFamily: 'system-ui' }}>
            {doc.meta.docName}
          </span>
        )}
        <button
          onClick={handleImport}
          disabled={loading}
          style={{
            marginLeft: 'auto', padding: '4px 12px',
            background: '#333', color: '#ccc', border: '1px solid #555',
            borderRadius: 4, cursor: 'pointer', fontSize: 12, fontFamily: 'system-ui',
          }}
        >
          {loading ? 'Parsing…' : 'Import IDML…'}
        </button>
      </div>

      {/* Canvas area */}
      <div style={{
        flex: 1, overflow: 'auto',
        display: 'flex', justifyContent: 'center',
        padding: '40px 40px',
      }}>
        {page1 ? (
          <PageView
            page={page1}
            frames={doc!.frames}
            stories={doc!.stories}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#555', fontSize: 13, fontFamily: 'system-ui',
          }}>
            Import an IDML file to begin
          </div>
        )}
      </div>
    </div>
  );
}
