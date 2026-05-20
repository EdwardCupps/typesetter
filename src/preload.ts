import { contextBridge, ipcRenderer } from 'electron';
import type { ParsedDocument } from './shared/types';

contextBridge.exposeInMainWorld('typesetter', {
  idml: {
    parse: (): Promise<ParsedDocument | null> => ipcRenderer.invoke('idml:parse'),
  },
  storage: {
    list: (): Promise<string[]> => ipcRenderer.invoke('storage:list'),
    load: (filename: string): Promise<string> => ipcRenderer.invoke('storage:load', filename),
    save: (filename: string, content: string): Promise<void> =>
      ipcRenderer.invoke('storage:save', filename, content),
  },
  pdf: {
    export: (widthPt: number, heightPt: number): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
      ipcRenderer.invoke('pdf:export', widthPt, heightPt),
  },
});
