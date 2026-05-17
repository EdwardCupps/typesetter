declare module '*.css';

declare global {
  interface Window {
    typesetter: {
      idml: {
        parse: () => Promise<import('./shared/types').ParsedDocument | null>;
      };
    };
  }
}

export {};
