// Pure browser-side px <-> rem conversion helpers. No dependencies, no network calls.

export const DEFAULT_ROOT_PX = 16;
export const DEFAULT_PRECISION = 4;

export interface CssConvertOptions {
  rootPx?: number;
  precision?: number;
  skipOnePx?: boolean;
}

export interface CssConvertResult {
  css: string;
  count: number;
}

function assertPositiveRoot(rootPx: number): void {
  if (!Number.isFinite(rootPx) || rootPx <= 0) {
    throw new RangeError('Root font size must be a positive number.');
  }
}

function assertFiniteValue(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
}

function clampPrecision(precision: number): number {
  if (!Number.isInteger(precision) || precision < 0 || precision > 8) {
    throw new RangeError('Precision must be an integer between 0 and 8.');
  }
  return precision;
}

export function formatUnitNumber(value: number, precision = DEFAULT_PRECISION): string {
  assertFiniteValue(value, 'Value');
  const p = clampPrecision(precision);
  const rounded = Number(value.toFixed(p));
  if (Object.is(rounded, -0) || rounded === 0) return '0';
  const str = rounded.toFixed(p);
  return str.includes('e') || str.includes('E') || !str.includes('.')
    ? str
    : str.replace(/\.?0+$/, '');
}

export function pxToRem(
  px: number,
  rootPx = DEFAULT_ROOT_PX,
  precision = DEFAULT_PRECISION,
): number {
  assertFiniteValue(px, 'Pixel value');
  assertPositiveRoot(rootPx);
  const p = clampPrecision(precision);
  const result = Number((px / rootPx).toFixed(p));
  assertFiniteValue(result, 'Converted rem value');
  return Object.is(result, -0) ? 0 : result;
}

export function remToPx(
  rem: number,
  rootPx = DEFAULT_ROOT_PX,
  precision = DEFAULT_PRECISION,
): number {
  assertFiniteValue(rem, 'Rem value');
  assertPositiveRoot(rootPx);
  const p = clampPrecision(precision);
  const result = Number((rem * rootPx).toFixed(p));
  assertFiniteValue(result, 'Converted pixel value');
  return Object.is(result, -0) ? 0 : result;
}

const IDENT_CHAR = /[A-Za-z0-9_-]/;
const DIGIT_CHAR = /[0-9]/;

function isWordBoundaryBefore(text: string, index: number, hasSign: boolean): boolean {
  if (index <= 0) return true;
  const prev = text[index - 1];
  if (hasSign) {
    // Reject identifier hyphens like `font-16px`, `--gap-16px`, or `.p-8px`.
    if (IDENT_CHAR.test(prev) || prev === '.') return false;
    return true;
  }
  // Reject glued identifiers like `box16px`, `col_16px`, or `var16px`.
  // Note: `.5px` starts at `.` so prev is whitespace, `:`, `(`, `,`, etc.
  if (IDENT_CHAR.test(prev) || prev === '.') return false;
  return true;
}

function scanAndConvertCss(
  input: string,
  fromUnit: 'px' | 'rem',
  toUnit: 'rem' | 'px',
  convertValue: (n: number) => number,
  precision: number,
  skipOnePx: boolean,
): CssConvertResult {
  const len = input.length;
  const unitLen = fromUnit.length;
  let i = 0;
  let out = '';
  let count = 0;

  while (i < len) {
    const ch = input[i];

    // 1. Preserve CSS block comments verbatim.
    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      const next = end === -1 ? len : end + 2;
      out += input.slice(i, next);
      i = next;
      continue;
    }

    // 2. Preserve single- and double-quoted strings verbatim.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        if (input[j] === '\\') {
          j += 2;
          continue;
        }
        if (input[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      out += input.slice(i, j);
      i = j;
      continue;
    }

    // 3. Preserve url(...) tokens verbatim, including backslash escapes.
    if (
      (ch === 'u' || ch === 'U') &&
      input.slice(i, i + 4).toLowerCase() === 'url(' &&
      (i === 0 || !IDENT_CHAR.test(input[i - 1]))
    ) {
      let j = i + 4;
      while (j < len && /\s/.test(input[j])) j += 1;
      if (j < len && (input[j] === '"' || input[j] === "'")) {
        const quote = input[j];
        j += 1;
        while (j < len) {
          if (input[j] === '\\') {
            j += 2;
            continue;
          }
          if (input[j] === quote) {
            j += 1;
            break;
          }
          j += 1;
        }
      }
      while (j < len && input[j] !== ')') {
        if (input[j] === '\\') {
          j += 2;
          continue;
        }
        j += 1;
      }
      if (j < len && input[j] === ')') j += 1;
      out += input.slice(i, j);
      i = j;
      continue;
    }

    // 4. Match a CSS <dimension> token: [+-]?(\d+(\.\d+)?|\.\d+)<fromUnit>
    const isSign = ch === '+' || ch === '-';
    const startsNum =
      DIGIT_CHAR.test(ch) ||
      (ch === '.' && i + 1 < len && DIGIT_CHAR.test(input[i + 1])) ||
      (isSign &&
        i + 1 < len &&
        (DIGIT_CHAR.test(input[i + 1]) ||
          (input[i + 1] === '.' && i + 2 < len && DIGIT_CHAR.test(input[i + 2]))));

    if (startsNum && isWordBoundaryBefore(input, i, isSign)) {
      let j = isSign ? i + 1 : i;
      while (j < len && DIGIT_CHAR.test(input[j])) j += 1;
      if (j < len && input[j] === '.' && j + 1 < len && DIGIT_CHAR.test(input[j + 1])) {
        j += 1;
        while (j < len && DIGIT_CHAR.test(input[j])) j += 1;
      }

      const unitSlice = input.slice(j, j + unitLen).toLowerCase();
      const afterUnit = j + unitLen < len ? input[j + unitLen] : '';
      if (unitSlice === fromUnit && (!afterUnit || !IDENT_CHAR.test(afterUnit))) {
        const numStr = input.slice(i, j);
        const num = Number(numStr);
        const tokenEnd = j + unitLen;
        if (Number.isFinite(num)) {
          if (skipOnePx && fromUnit === 'px' && Math.abs(num) === 1) {
            out += input.slice(i, tokenEnd);
          } else {
            const converted = convertValue(num);
            out += `${formatUnitNumber(converted, precision)}${toUnit}`;
            count += 1;
          }
          i = tokenEnd;
          continue;
        }
      }
    }

    out += ch;
    i += 1;
  }

  return { css: out, count };
}

export function convertCssPxToRem(
  css: string,
  options: CssConvertOptions = {},
): CssConvertResult {
  const rootPx = options.rootPx ?? DEFAULT_ROOT_PX;
  const precision = options.precision ?? DEFAULT_PRECISION;
  const skipOnePx = Boolean(options.skipOnePx);
  assertPositiveRoot(rootPx);
  clampPrecision(precision);
  return scanAndConvertCss(
    css,
    'px',
    'rem',
    (n) => pxToRem(n, rootPx, precision),
    precision,
    skipOnePx,
  );
}

export function convertCssRemToPx(
  css: string,
  options: Omit<CssConvertOptions, 'skipOnePx'> = {},
): CssConvertResult {
  const rootPx = options.rootPx ?? DEFAULT_ROOT_PX;
  const precision = options.precision ?? DEFAULT_PRECISION;
  assertPositiveRoot(rootPx);
  clampPrecision(precision);
  return scanAndConvertCss(
    css,
    'rem',
    'px',
    (n) => remToPx(n, rootPx, precision),
    precision,
    false,
  );
}
