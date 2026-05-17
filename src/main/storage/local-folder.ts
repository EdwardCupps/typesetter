import * as fs from 'fs/promises';
import * as path from 'path';
import type { StorageAdapter } from './adapter';

export class LocalFolderAdapter implements StorageAdapter {
  constructor(private readonly folderPath: string) {}

  async read(filename: string): Promise<string> {
    return fs.readFile(path.join(this.folderPath, filename), 'utf-8');
  }

  async write(filename: string, content: string): Promise<void> {
    await fs.mkdir(this.folderPath, { recursive: true });
    await fs.writeFile(path.join(this.folderPath, filename), content, 'utf-8');
  }

  async list(): Promise<string[]> {
    const entries = await fs.readdir(this.folderPath);
    return entries.filter(e => e.endsWith('.typesetter'));
  }
}
