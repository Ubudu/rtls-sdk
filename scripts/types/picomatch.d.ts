// Minimal ambient types for picomatch 4 (the package ships none), limited to what the P0 tooling uses.
declare module 'picomatch' {
  export interface PicomatchOptions {
    dot?: boolean;
    nocase?: boolean;
    ignore?: string | string[];
  }
  export type Matcher = (input: string) => boolean;
  function picomatch(glob: string | string[], options?: PicomatchOptions): Matcher;
  export default picomatch;
}
