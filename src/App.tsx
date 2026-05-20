import React, { useState, useEffect, useRef } from 'react';
import type { ContentBlock, CharRun, ParsedDocument } from './shared/types';
import { PageView } from './renderer/components/PageView';
import { PropertiesPanel } from './renderer/components/PropertiesPanel';

type Selection = { storyId: string; blockIndex: number } | null;

// ---- text edit helpers ------------------------------------------------------

function applyTextEdit(block: ContentBlock, newText: string): ContentBlock {
  const oldText = block.text;
  if (oldText === newText) return block;

  let pre = 0;
  while (pre < oldText.length && pre < newText.length && oldText[pre] === newText[pre]) pre++;

  let suf = 0;
  const maxSuf = Math.min(oldText.length - pre, newText.length - pre);
  while (suf < maxSuf && oldText[oldText.length - 1 - suf] === newText[newText.length - 1 - suf]) suf++;

  const delStart = pre;
  const delEnd = oldText.length - suf;
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

function applyStyleToRange(
  block: ContentBlock,
  selStart: number,
  selEnd: number,
  update: Partial<CharRun>,
): ContentBlock {
  if (selStart >= selEnd) return block;
  const newRuns: CharRun[] = [];
  for (const run of block.charRuns) {
    if (run.end <= selStart || run.start >= selEnd) {
      newRuns.push(run);
      continue;
    }
    if (run.start < selStart) newRuns.push({ ...run, end: selStart });
    const s = Math.max(run.start, selStart);
    const e = Math.min(run.end, selEnd);
    newRuns.push({ ...run, start: s, end: e, ...update });
    if (run.end > selEnd) newRuns.push({ ...run, start: selEnd });
  }
  return { ...block, charRuns: newRuns };
}

// ---- app --------------------------------------------------------------------

export default function App() {
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [past, setPast] = useState<ParsedDocument[]>([]);
  const [future, setFuture] = useState<ParsedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [editSel, setEditSel] = useState<{ start: number; end: number } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session restore on mount
  useEffect(() => {
    async function restore() {
      const files = await window.typesetter.storage.list();
      if (files.length === 0) return;
      const content = await window.typesetter.storage.load(files[0]);
      setDoc(JSON.parse(content));
    }
    restore().catch(() => {});
  }, []);

  // Autosave — debounced 2s after each doc change
  useEffect(() => {
    if (!doc) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const filename = doc.meta.docName.replace(/[^a-zA-Z0-9._-]/g, '_') + '.typesetter';
      window.typesetter.storage.save(filename, JSON.stringify(doc)).catch(() => {});
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [doc]);

  // Undo / redo keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const isZ = e.key === 'z' || e.key === 'Z';
      if (!isZ) return;
      e.preventDefault();
      if (!e.shiftKey && e.key === 'z') {
        // Undo
        if (past.length === 0) return;
        const prev = past[past.length - 1];
        if (doc) setFuture(f => [doc, ...f.slice(0, 49)]);
        setDoc(prev);
        setPast(p => p.slice(0, -1));
      } else {
        // Redo
        if (future.length === 0) return;
        const next = future[0];
        if (doc) setPast(p => [...p.slice(-49), doc]);
        setDoc(next);
        setFuture(f => f.slice(1));
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [past, future, doc]);

  function pushDoc(newDoc: ParsedDocument) {
    if (doc) setPast(p => [...p.slice(-49), doc]);
    setFuture([]);
    setDoc(newDoc);
  }

  async function handleImport() {
    setLoading(true);
    setSelection(null);
    setEditSel(null);
    try {
      const result = await window.typesetter.idml.parse();
      if (result) {
        setDoc(result);
        setPast([]);
        setFuture([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleExportPDF() {
    if (!doc) return;
    const page = doc.pages[0];
    if (!page) return;
    await window.typesetter.pdf.export(page.width, page.height);
  }

  function handleBlockFocus(storyId: string, blockIndex: number) {
    setSelection({ storyId, blockIndex });
  }

  function handleSelectionChange(start: number, end: number) {
    setEditSel({ start, end });
  }

  function handleBlockTextChange(storyId: string, blockIndex: number, newText: string) {
    if (!doc) return;
    const newDoc = {
      ...doc,
      stories: doc.stories.map(s =>
        s.id === storyId
          ? { ...s, content: s.content.map((b, i) => i === blockIndex ? applyTextEdit(b, newText) : b) }
          : s
      ),
    };
    pushDoc(newDoc);
  }

  function handlePageClick() {
    setSelection(null);
    setEditSel(null);
  }

  function handleBlockChange(update: Partial<ContentBlock>) {
    if (!selection || !doc) return;
    const newDoc = {
      ...doc,
      stories: doc.stories.map(s =>
        s.id === selection.storyId
          ? { ...s, content: s.content.map((b, i) => i === selection.blockIndex ? { ...b, ...update } : b) }
          : s
      ),
    };
    pushDoc(newDoc);
  }

  function handleCharRunChange(update: Partial<CharRun>, refRun?: CharRun) {
    if (!selection || !doc) return;
    const { storyId, blockIndex } = selection;
    const newDoc = {
      ...doc,
      stories: doc.stories.map(s =>
        s.id === storyId
          ? {
              ...s,
              content: s.content.map((b, i) => {
                if (i !== blockIndex) return b;
                if (editSel && editSel.start < editSel.end) {
                  return applyStyleToRange(b, editSel.start, editSel.end, update);
                }
                const ref = refRun ?? b.charRuns[0];
                return {
                  ...b,
                  charRuns: b.charRuns.map(r =>
                    r.fontSize === ref?.fontSize && r.fontFamily === ref?.fontFamily
                      ? { ...r, ...update }
                      : r
                  ),
                };
              }),
            }
          : s
      ),
    };
    pushDoc(newDoc);
  }

  const selectedBlock = selection && doc
    ? (doc.stories.find(s => s.id === selection.storyId)?.content[selection.blockIndex] ?? null)
    : null;

  const cursorCharStart = editSel?.start ?? null;
  const page1 = doc?.pages[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#2a2a2a' }}>
      <div
        data-app-chrome
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 16px', background: '#1a1a1a',
          borderBottom: '1px solid #2a2a2a', flexShrink: 0,
        }}
      >
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'system-ui' }}>
          Typesetter
        </span>
        {doc && (
          <span style={{ color: '#555', fontSize: 11, fontFamily: 'system-ui' }}>
            {doc.meta.docName}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {doc && (
            <button
              onClick={handleExportPDF}
              style={{
                padding: '4px 12px',
                background: '#1a3a5a', color: '#7ab8f5', border: '1px solid #2a5a8a',
                borderRadius: 4, cursor: 'pointer', fontSize: 12, fontFamily: 'system-ui',
              }}
            >
              Export PDF
            </button>
          )}
          <button
            onClick={handleImport}
            disabled={loading}
            style={{
              padding: '4px 12px',
              background: '#333', color: '#ccc', border: '1px solid #444',
              borderRadius: 4, cursor: 'pointer', fontSize: 12, fontFamily: 'system-ui',
            }}
          >
            {loading ? 'Parsing…' : 'Import IDML…'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          data-canvas
          style={{
            flex: 1, overflow: 'auto',
            display: 'flex', justifyContent: 'center',
            padding: '40px',
          }}
        >
          {page1 ? (
            <PageView
              page={page1}
              frames={doc!.frames}
              stories={doc!.stories}
              selection={selection}
              onPageClick={handlePageClick}
              onBlockFocus={handleBlockFocus}
              onSelectionChange={handleSelectionChange}
              onBlockTextChange={handleBlockTextChange}
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

        <div data-app-chrome>
          <PropertiesPanel
            block={selectedBlock}
            cursorCharStart={cursorCharStart}
            onBlockChange={handleBlockChange}
            onCharRunChange={handleCharRunChange}
          />
        </div>
      </div>
    </div>
  );
}
