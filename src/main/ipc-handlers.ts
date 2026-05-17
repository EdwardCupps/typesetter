import { ipcMain, dialog } from 'electron';
import { parseIDML } from './idml-parser';

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
}
