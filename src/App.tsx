import React, { useState } from 'react';
import type { ParsedDocument } from './shared/types';

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

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui', color: '#e0e0e0', background: '#1a1a1a', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Typesetter</h1>

      <button
        onClick={handleImport}
        disabled={loading}
        style={{ marginTop: 24, padding: '8px 16px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
      >
        {loading ? 'Parsing…' : 'Import IDML…'}
      </button>

      {doc && (
        <div style={{ marginTop: 32, fontSize: 12, color: '#aaa' }}>
          <p style={{ color: '#fff', fontSize: 14, marginBottom: 12 }}>{doc.meta.docName}</p>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {Object.entries(doc.summary).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ paddingRight: 24, paddingBottom: 4, color: '#666' }}>{k}</td>
                  <td style={{ paddingBottom: 4 }}>{Array.isArray(v) ? v.join(', ') : String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
