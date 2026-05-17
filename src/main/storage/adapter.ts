export interface StorageAdapter {
  read(filename: string): Promise<string>;
  write(filename: string, content: string): Promise<void>;
  list(): Promise<string[]>;
}
