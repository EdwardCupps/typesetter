declare module '*.css';

declare global {
  interface Window {
    typesetter: {
      idml: {
        parse: () => Promise<import('./shared/types').ParsedDocument | null>;
      };
      storage: {
        list: () => Promise<string[]>;
        load: (filename: string) => Promise<string>;
        save: (filename: string, content: string) => Promise<void>;
      };
      pdf: {
        export: (
          widthPt: number,
          heightPt: number,
        ) => Promise<{ filePath?: string; canceled?: boolean; error?: string }>;
      };
    };
  }
}

export {};
