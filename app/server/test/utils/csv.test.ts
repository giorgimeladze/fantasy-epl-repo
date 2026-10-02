import assert from 'node:assert/strict';
import { parseCsv } from '../../src/utils/csv.js';

describe('parseCsv', () => {
  it('maps rows to objects keyed by the header', () => {
    assert.deepEqual(parseCsv('id,name\n1,Saka\n2,Rice\n'), [
      { id: '1', name: 'Saka' },
      { id: '2', name: 'Rice' },
    ]);
  });

  it('handles quoted fields with commas, quotes and newlines', () => {
    assert.deepEqual(parseCsv('name,news\n"Ødegaard, Martin","Said ""fit""\nfor Sunday"'), [
      { name: 'Ødegaard, Martin', news: 'Said "fit"\nfor Sunday' },
    ]);
  });

  it('handles CRLF line endings and blank lines', () => {
    assert.deepEqual(parseCsv('a,b\r\n1,2\r\n\r\n'), [{ a: '1', b: '2' }]);
  });

  it('fills missing trailing fields with empty strings', () => {
    assert.deepEqual(parseCsv('a,b,c\n1,2'), [{ a: '1', b: '2', c: '' }]);
  });

  it('returns no rows for empty input', () => {
    assert.deepEqual(parseCsv(''), []);
  });
});
