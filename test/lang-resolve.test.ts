import { describe, it, expect } from 'vitest';
import { resolveLanguage } from '../core/lang-resolve';
import type { Run } from '../core/run-builder';

function run(text: string, script: string): Run {
  return { text, script };
}

describe('resolveLanguage', () => {
  describe('special-case scripts (composite CLDR codes)', () => {
    it('resolves Hangul to Korean with high confidence', () => {
      expect(resolveLanguage(run('환영', 'Hangul'))).toEqual({
        lang: 'ko', candidates: ['ko'], confidence: 'high',
      });
    });

    it('resolves Han with zh as default but keeps ja as a low-confidence candidate', () => {
      const result = resolveLanguage(run('北京', 'Han'));
      expect(result.lang).toBe('zh');
      expect(result.candidates).toEqual(['zh', 'ja']);
      expect(result.confidence).toBe('low');
    });

    it('resolves Hiragana to Japanese with high confidence', () => {
      expect(resolveLanguage(run('ありがとう', 'Hiragana'))).toEqual({
        lang: 'ja', candidates: ['ja'], confidence: 'high',
      });
    });

    it('resolves Katakana to Japanese with high confidence', () => {
      expect(resolveLanguage(run('スミス', 'Katakana'))).toEqual({
        lang: 'ja', candidates: ['ja'], confidence: 'high',
      });
    });
  });

  describe('deterministic table (single 639-1 candidate)', () => {
    it('resolves Armenian to hy', () => {
      expect(resolveLanguage(run('Ա', 'Armenian'))).toEqual({
        lang: 'hy', candidates: ['hy'], confidence: 'high',
      });
    });

    it('resolves Georgian to ka', () => {
      expect(resolveLanguage(run('Ⴀ', 'Georgian'))).toEqual({
        lang: 'ka', candidates: ['ka'], confidence: 'high',
      });
    });

    it('resolves Thai to th (minority Thai-script languages are 639-3-only and filtered out)', () => {
      expect(resolveLanguage(run('สวัสดี', 'Thai'))).toEqual({
        lang: 'th', candidates: ['th'], confidence: 'high',
      });
    });

    it('resolves Gujarati to gu', () => {
      expect(resolveLanguage(run('અ', 'Gujarati'))).toEqual({
        lang: 'gu', candidates: ['gu'], confidence: 'high',
      });
    });
  });

  describe('ambiguous table (multiple 639-1 candidates)', () => {
    it('resolves Arabic script with ar as default and the full candidate list', () => {
      const result = resolveLanguage(run('مرحبا', 'Arabic'));
      expect(result.lang).toBe('ar');
      expect(result.candidates).toEqual(['ar', 'ur', 'fa', 'ps', 'sd', 'ug', 'ks']);
      expect(result.confidence).toBe('low');
    });

    it('resolves Devanagari with hi as default and hi/mr/ne/sa as candidates', () => {
      const result = resolveLanguage(run('अ', 'Devanagari'));
      expect(result.lang).toBe('hi');
      expect(result.candidates).toEqual(['hi', 'mr', 'ne', 'sa']);
      expect(result.confidence).toBe('low');
    });

    it('resolves Hebrew with he as default, alongside yi', () => {
      const result = resolveLanguage(run('שלום', 'Hebrew'));
      expect(result.lang).toBe('he');
      expect(result.candidates).toEqual(['he', 'yi']);
      expect(result.confidence).toBe('low');
    });


        it('applies population-ranked ordering — bn as default, not alphabetical-first as', () => {
      const result = resolveLanguage(run('অ', 'Bengali'));
      expect(result.lang).toBe('bn');
      expect(result.candidates).toEqual(['bn', 'as']); // population-ranked, not alphabetical
      expect(result.confidence).toBe('low');
    });

    it('resolves Cyrillic with ru as default — population-ranked, not alphabetical-first ab', () => {
      const result = resolveLanguage(run('А', 'Cyrillic'));
      expect(result.lang).toBe('ru');
      expect(result.confidence).toBe('low');
    });
  });

  describe('unmapped script fallback', () => {
    it('returns an empty, honest result for a script with no table entry at all', () => {
      // "Common" runs should never actually reach resolveLanguage in practice
      // (span-insert.ts should only call this on non-Latin anchor runs), but
      // the function itself should still fail safely rather than throw or guess.
      expect(resolveLanguage(run(',', 'Common'))).toEqual({
        lang: '', candidates: [], confidence: 'low',
      });
    });
  });
});