import { contextBridge, ipcRenderer } from 'electron';
import type { ParsedDocument } from './shared/types';

contextBridge.exposeInMainWorld('typesetter', {
  idml: {
    parse: (): Promise<ParsedDocument | null> => ipcRenderer.invoke('idml:parse'),
  },
});
