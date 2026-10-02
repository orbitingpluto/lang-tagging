import { describe, it, expect } from 'vitest';
import { detectScripts } from '../core/script-detect';
import { buildRuns } from '../core/run-builder';

function run(text: string, includeNumbers = true) {
  return buildRuns(detectScripts(text), { includeNumbers });
}

describe('buildRuns — numbers toggle', () => {
  it('includeNumbers: true — Western digit attaches to touching non-Latin run', () => {
    const result = run('الفصل رقم 12 يبدأ من هنا.', true);
    expect(result).toEqual([
      { text: 'الفصل رقم 12 يبدأ من هنا.', script: 'Arabic' },
    ]);
  });

  it('includeNumbers: false — Western digit breaks the run but survives as its own entry', () => {
    const result = run('الفصل رقم 12 يبدأ من هنا.', false);
    expect(result).toEqual([
  { text: 'الفصل رقم', script: 'Arabic' },
  { text: ' ', script: 'Common' },
  { text: '12', script: 'Common' },
  { text: ' ', script: 'Common' },
  { text: 'يبدأ من هنا.', script: 'Arabic' },
]);
  });

  it('includeNumbers: false — a run of MULTIPLE consecutive digits stays together as one Common entry, not split digit-by-digit', () => {
    const result = run('صفحة 123 التالية', false);
    expect(result).toEqual([
      { text: 'صفحة', script: 'Arabic' },
      { text: ' ', script: 'Common' },
      { text: '123', script: 'Common' },
      { text: ' ', script: 'Common' },
      { text: 'التالية', script: 'Arabic' },
    ]);
  });

  it('native Eastern Arabic-Indic digits always merge into the run regardless of the toggle', () => {
    const withNumbers = run('الصفحة ١٢ من الكتاب.', true);
    const withoutNumbers = run('الصفحة ١٢ من الكتاب.', false);
    const expected = [{ text: 'الصفحة ١٢ من الكتاب.', script: 'Arabic' }];
    expect(withNumbers).toEqual(expected);
    expect(withoutNumbers).toEqual(expected);
  });

  it('a digit surrounded entirely by Latin text is never tagged non-Latin, regardless of toggle', () => {
    const withNumbers = run('I have 5 apples', true);
    const withoutNumbers = run('I have 5 apples', false);
    const expected = [{ text: 'I have 5 apples', script: 'Latin' }];
    expect(withNumbers).toEqual(expected);
    expect(withoutNumbers).toEqual(expected);
  });

  it('includeNumbers defaults to true when options are omitted', () => {
    const result = buildRuns(detectScripts('رقم 5 هنا'));
    expect(result).toEqual([
      { text: 'رقم 5 هنا', script: 'Arabic' },
    ]);
  });

});