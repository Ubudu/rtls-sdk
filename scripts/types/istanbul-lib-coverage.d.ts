// Minimal ambient types for istanbul-lib-coverage 3 (no @types package is installed), limited to what the P0
// live-coverage check uses.
declare module 'istanbul-lib-coverage' {
  export interface Position {
    line: number;
    column: number | null;
  }
  export interface Range {
    start: Position;
    end: Position;
  }
  export interface FunctionMapping {
    name: string;
    decl: Range;
    loc: Range;
    line: number;
  }
  export interface FileCoverageData {
    path: string;
    statementMap: Record<string, Range>;
    fnMap: Record<string, FunctionMapping>;
    branchMap: Record<string, unknown>;
    s: Record<string, number>;
    f: Record<string, number>;
    b: Record<string, number[]>;
  }
  export interface FileCoverage extends FileCoverageData {
    merge(other: FileCoverage | FileCoverageData): void;
    getLineCoverage(): Record<string, number>;
    toJSON(): FileCoverageData;
  }
  export function createFileCoverage(pathOrData: string | FileCoverageData): FileCoverage;
  const lib: { createFileCoverage: typeof createFileCoverage };
  export default lib;
}
