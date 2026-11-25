/** RFC 4180 CSV serializer (with spreadsheet formula neutralization) and parser. No external dependencies. */

/** One spreadsheet cell: always quoted, quotes doubled, and a leading formula character is neutralized. */
export function csvCell(v: string): string {
  const t = v.replace(/^ +/, "");
  const guarded = /^[=+\-@\t\r\n]/.test(t) ? `'${t}` : v;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Remove the single-quote formula guard on import so labels like "-20% off" round-trip cleanly. */
export function unescapeCsvFormula(v: string): string {
  return /^'[=+\-@\t\r\n]/.test(v) ? v.slice(1) : v;
}

/** Write rows of strings as RFC 4180 CSV with formula-safe quoting and trailing newline. */
export function writeCsv(rows: string[][]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

/**
 * Parse RFC 4180 CSV text into rows of string cells.
 * Handles UTF-8 BOM, CRLF/LF line endings, quoted fields with escaped quotes (""), and embedded newlines.
 */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith("\ufeff") ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        cell += ch;
        i += 1;
      }
      continue;
    }

    if (ch === '"' && cell === "") {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
    } else if (ch === "\r" || ch === "\n") {
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (ch === "\r" && text[i + 1] === "\n") i += 2;
      else i += 1;
    } else {
      cell += ch;
      i += 1;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}
