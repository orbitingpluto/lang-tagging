
    
  
import { describe, it, expect } from 'vitest';
import { detectScripts } from '../core/script-detect';
import { buildRuns } from '../core/run-builder';

function run(text: string) {
  return buildRuns(detectScripts(text));
}

describe('buildRuns', () => {

  it('builds run correctly, no punctuation or number yet', () => {
    expect(buildRuns(detectScripts("abمنc"))).toEqual([{ text: "ab", script: "Latin" },
                                                        { text: "من", script: "Arabic" },
                                                        { text: "c", script: "Latin" }
                                                        ]);
  });

  it('builds run correctly with empty string', () => {
    expect(buildRuns(detectScripts(""))).toEqual([]);
  });

  it('merges consecutive same-script graphemes (basic case)', () => {
    expect(run('abمنc')).toEqual([
      { text: 'ab', script: 'Latin' },
      { text: 'من', script: 'Arabic' },
      { text: 'c', script: 'Latin' },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(run('')).toEqual([]);
  });

  it('attaches internal whitespace between same-script words', () => {
    // "آداب بہت" — two Urdu words separated by a space; space should join
    expect(run('آداب بہت')).toEqual([
      { text: 'آداب بہت', script: 'Arabic' },
    ]);
  });

  it('does NOT attach whitespace between two different scripts', () => {
    // Arabic, space, Chinese — space belongs to neither
    const result = run('مرحبا 你好');
    expect(result).toEqual([
      { text: 'مرحبا', script: 'Arabic' },
      { text: ' ', script: 'Common' },
      { text: '你好', script: 'Han' },
    ]);
  });

  it('attaches non-whitespace punctuation directly touching a run, regardless of far side', () => {
    // Arabic run followed immediately by a comma, then space, then Latin —
    // comma should join Arabic even though what follows (past the space) is Latin
    const result = run('شكرا، thanks');
    expect(result).toEqual([
      { text: 'شكرا،', script: 'Arabic' },
      { text: ' ', script: 'Common' },
      { text: 'thanks', script: 'Latin' },
    ]);
  });

  it('attaches leading punctuation to the run that starts right after it', () => {
    // opening quote before Devanagari — should prepend into the run, not get dropped
    const result = run('"अ');
    expect(result).toEqual([
      { text: '"अ', script: 'Devanagari' },
    ]);
  });

  it('attaches trailing punctuation at end of string to the preceding run', () => {
    const result = run('الفصل رقم يبدأ.');
    expect(result).toEqual([
      { text: 'الفصل رقم يبدأ.', script: 'Arabic' },
    ]);
  });

  it('handles quotes wrapping a non-Latin phrase mid-sentence (corpus case 14)', () => {
  const result = run('He asked what "तुम कैसे हो" meant in English.');
  expect(result).toEqual([
    { text: 'He asked what', script: 'Latin' },
    { text: ' ', script: 'Common' },
    { text: '"तुम कैसे हो"', script: 'Devanagari' },
    { text: ' ', script: 'Common' },
    { text: 'meant in English.', script: 'Latin' },
  ]);
});

  it('does not merge across two different non-Latin scripts even with no space (adjacent punctuation edge case)', () => {
    // Arabic run directly followed by Chinese, no separator at all
    const result = run('مرحبا你好');
    expect(result).toEqual([
      { text: 'مرحبا', script: 'Arabic' },
      { text: '你好', script: 'Han' },
    ]);
  });

  it('does not attach em dashes to language runs', () => {
  const runs = buildRuns(detectScripts('한국어—日本語'));

  expect(runs).toEqual([
    { text: '한국어', script: 'Hangul' },
    { text: '—', script: 'Common' },
    { text: '日本語', script: 'Han' },
  ]);
});

it('does not attach digits to language runs when includeNumbers is false', () => {
  expect(
    buildRuns(detectScripts('한국어123!'), { includeNumbers: false })
  ).toEqual([
    { text: '한국어', script: 'Hangul' },
    { text: '123!', script: 'Common' }
  ]);
});

it('preserves currency expressions as Common text', () => {
  const runs = buildRuns(detectScripts('한국어 $50.'));

  expect(runs).toEqual([
    { text: '한국어', script: 'Hangul' },
    { text: ' $50.', script: 'Common' },
  ]);
});

it('treats em dashes as hard boundaries', () => {
  expect(run('한국어—日本語')).toEqual([
  { text: '한국어', script: 'Hangul' },
  { text: '—', script: 'Common' },
  { text: '日本語', script: 'Han' }
]);
});

it('does not attach numbers or punctuation after a hard boundary to the next run', () => {
  expect(run('한국어—123!한국어')).toEqual([
    { text: '한국어', script: 'Hangul' },
    { text: '—123!', script: 'Common' },
    { text: '한국어', script: 'Hangul' },
  ]);
});

it('still attaches numbers to the preceding run when includeNumbers is true', () => {
  expect(buildRuns(detectScripts('한국어123!'), {
    includeNumbers: true,
  })).toEqual([
    { text: '한국어123!', script: 'Hangul' },
  ]);
});

it('excludes numbers when includeNumbers is false', () => {
  expect(buildRuns(detectScripts('한국어123!'), {
    includeNumbers: false,
  })).toEqual([
    { text: '한국어', script: 'Hangul' },
    { text: '123!', script: 'Common' },
  ]);
});

it('keeps currency expressions outside language spans', () => {
  expect(run('한국어 $50.')).toEqual([
    { text: '한국어', script: 'Hangul' },
    { text: ' $50.', script: 'Common' },
  ]);
});

it('preserves whitespace around hard boundaries', () => {
  expect(run('한국어 — 日本語')).toEqual([
  { text: '한국어', script: 'Hangul' },
  { text: ' — ', script: 'Common' },
  { text: '日本語', script: 'Han' }
]);
});

it('recognizes Japanese after an em dash when kana is present', () => {
  expect(run('한국어—日本語かな')).toEqual([
    { text: '한국어', script: 'Hangul' },
    { text: '—', script: 'Common' },
    { text: '日本語かな', script: 'Jpan' }
  ]);
});
});

