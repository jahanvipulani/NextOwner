import { describe, expect, it } from 'vitest';
import { EVIDENCE_LABELS, REVIEW_LABELS, detailValue, fmtBytes, isValidEmail, orUnknown } from './format';
import { formatError } from './errors';

describe('format helpers', () => {
  it('shows Unknown for missing values instead of inventing one', () => {
    expect(orUnknown(null)).toBe('Unknown');
    expect(orUnknown('   ')).toBe('Unknown');
    expect(orUnknown('Priya')).toBe('Priya');
  });
  it('reads claim details safely', () => {
    expect(detailValue({ a: 'x' }, 'a')).toBe('x');
    expect(detailValue({ a: 'x' }, 'b')).toBeNull();
    expect(detailValue(null, 'a')).toBeNull();
  });
  it('formats file sizes and validates emails', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2.0 KB');
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
  });
  it('uses the four evidence labels and five review labels from the brief', () => {
    expect(Object.values(EVIDENCE_LABELS)).toEqual(['Verified', 'Single source', 'Conflicting', 'No evidence']);
    expect(Object.keys(REVIEW_LABELS)).toEqual(['pending', 'accepted', 'edited', 'rejected', 'unknown']);
  });
});

describe('formatError', () => {
  it('reads FastAPI string and validation-array errors', () => {
    expect(formatError({ response: { data: { detail: 'Nope' } } })).toBe('Nope');
    expect(formatError({ response: { data: { detail: [{ loc: ['body', 'email'], msg: 'bad email' }] } } })).toBe('email: bad email');
  });
  it('falls back to a readable sentence', () => {
    expect(formatError(undefined)).toMatch(/went wrong/i);
  });
});
