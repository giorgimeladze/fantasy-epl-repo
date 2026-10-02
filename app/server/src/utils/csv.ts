/** Parses CSV text (RFC 4180 quoting) into one object per row, keyed by the header row. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  const header = rows.shift();
  if (!header) return [];

  return rows
    .filter((row) => row.length > 1 || row[0] !== '')
    .map((row) => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ''])));
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
