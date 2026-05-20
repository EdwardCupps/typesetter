import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import { parseIDML } from './idml-parser';

const storageDir = path.join(app.getPath('userData'), 'documents');

async function ensureStorageDir() {
  await fs.mkdir(storageDir, { recursive: true });
}

export function registerHandlers() {
  ipcMain.handle('idml:parse', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open IDML file',
      filters: [{ name: 'InDesign Markup', extensions: ['idml'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return null;
    return parseIDML(filePaths[0]);
  });

  ipcMain.handle('storage:list', async () => {
    await ensureStorageDir();
    const entries = await fs.readdir(storageDir);
    return entries.filter(e => e.endsWith('.typesetter'));
  });

  ipcMain.handle('storage:load', async (_e, filename: string) => {
    const safe = path.basename(filename);
    return fs.readFile(path.join(storageDir, safe), 'utf-8');
  });

  ipcMain.handle('storage:save', async (_e, filename: string, content: string) => {
    await ensureStorageDir();
    const safe = path.basename(filename);
    await fs.writeFile(path.join(storageDir, safe), content, 'utf-8');
  });

  ipcMain.handle('pdf:export', async (event, widthPt: number, heightPt: number) => {
    const ptToMicrons = (pt: number) => Math.round(pt * 25400 / 72);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { error: 'no window' };

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export PDF',
      defaultPath: 'resume.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { canceled: true };

    const buffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: ptToMicrons(widthPt), height: ptToMicrons(heightPt) },
      margins: { marginType: 'none' },
    });

    await fs.writeFile(filePath, buffer);
    return { filePath };
  });
}
