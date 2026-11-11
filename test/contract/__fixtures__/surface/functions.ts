export function helper(): number {
  return 1;
}

export const arrowHelper = (): number => 2;

/** @internal */
export function internalHelper(): number {
  return 3;
}

export const VERSION = '1.0.0';

export function renamed(): number {
  return 4;
}
