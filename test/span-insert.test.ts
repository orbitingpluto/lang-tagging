import { describe, it, expect } from 'vitest';
import { buildSegments, escapeHtml, segmentsToHtml, insertSpans } from '../core/span-insert';
import type { Segment } from '../core/span-insert';
import type { Run } from '../core/run-builder';

function run(text: string, script: string): Run {
  return { text, script };
}

describe('buildSegments', () => {
  it('leaves a Latin run as a plain segment, with no lang-related fields at all', () => {
    const result = buildSegments([run('Hello world', 'Latin')]);
    expect(result).toEqual([{ text: 'Hello world' }]);
  });

  it('leaves a Common run (punctuation/whitespace standing alone) as a plain segment', () => {
    const result = buildSegments([run(' ', 'Common')]);
    expect(result).toEqual([{ text: ' ' }]);
  });

  it('wraps a high-confidence script with lang, candidates, and confidence populated', () => {
    const result = buildSegments([run('환영합니다', 'Hangul')]);
    expect(result).toEqual([
      {
        text: '환영합니다',
        lang: 'ko',
        candidates: ['ko'],
        confidence: 'high',
      },
    ]);
  });

  it('wraps a low-confidence ambiguous script with the full candidate list, default first', () => {
    const result = buildSegments([run('مرحبا', 'Arabic')]);
    expect(result).toEqual([
      {
        text: 'مرحبا',
        lang: 'ar',
        candidates: ['ar', 'ur', 'fa', 'ps', 'sd', 'ug', 'ks'],
        confidence: 'low',
      },
    ]);
  });

  it('marks an unmapped script as needing language, with no lang/candidates/confidence fields', () => {
    // "Ogham" is a real Unicode script with no entry in the resolver's tables —
    // a genuine case of "we haven't mapped this yet," not a fabricated one.
    const result = buildSegments([run('᚛ᚑᚌᚐᚋ᚜', 'Ogham')]);
    expect(result).toEqual([
      {
        text: '᚛ᚑᚌᚐᚋ᚜',
        needsLanguage: true,
      },
    ]);
  });

  it('processes a realistic mixed sequence of runs, one segment per run, in order', () => {
    const runs: Run[] = [
      run('He said', 'Latin'),
      run(' ', 'Common'),
      run('北京', 'Han'),
      run(' ', 'Common'),
      run('proudly.', 'Latin'),
    ];
    const result = buildSegments(runs);

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ text: 'He said' });
    expect(result[1]).toEqual({ text: ' ' });
    expect(result[2]).toEqual({
      text: '北京',
      lang: 'zh',
      candidates: ['zh', 'ja'],
      confidence: 'low',
    });
    expect(result[3]).toEqual({ text: ' ' });
    expect(result[4]).toEqual({ text: 'proudly.' });
  });

  it('returns an empty array for empty input', () => {
    expect(buildSegments([])).toEqual([]);
  });
});

describe('escapeHtml', () => {
  it('escapes & alone', () => {
    expect(escapeHtml('&')).toBe('&amp;');
  });

  it('escapes < alone', () => {
    expect(escapeHtml('<')).toBe('&lt;');
  });

  it('escapes > alone', () => {
    expect(escapeHtml('>')).toBe('&gt;');
  });

  it('escapes all three in one string, every occurrence (not just the first)', () => {
    expect(escapeHtml('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d');
  });

  it('escapes & first so &lt; becomes &amp;lt; (no double-escape trap)', () => {
    // Input is decoded plain text, so a literal "&lt;" typed by the author
    // must display as "&lt;" -- meaning its ampersand gets escaped.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('returns text with none of the three characters unchanged', () => {
    expect(escapeHtml('Hello, world.')).toBe('Hello, world.');
  });

  it('returns an empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('passes non-Latin text through unchanged, including when mixed with escapable characters', () => {
    expect(escapeHtml('مرحبا')).toBe('مرحبا');
    expect(escapeHtml('مرحبا <b>')).toBe('مرحبا &lt;b&gt;');
  });

  it('leaves quotes alone (documents that this is deliberate)', () => {
    // Segment text only ever becomes text-node content, never an attribute
    // value, so quotes are safe. Don't "fix" this later.
    expect(escapeHtml(`"it's"`)).toBe(`"it's"`);
  });
});

describe('segmentsToHtml', () => {
  it('renders a plain segment as escaped text with no wrapper', () => {
    expect(segmentsToHtml([{ text: 'Hello world' }])).toBe('Hello world');
  });

  it('escapes & < > in plain segments', () => {
    expect(segmentsToHtml([{ text: 'a < b & c' }])).toBe('a &lt; b &amp; c');
  });

  it('wraps a high-confidence segment with lang and data-candidates, and no data-confidence', () => {
    const seg: Segment = { text: '환영합니다', lang: 'ko', candidates: ['ko'], confidence: 'high' };
    expect(segmentsToHtml([seg])).toBe(
      '<span lang="ko" data-candidates="ko">환영합니다</span>'
    );
  });

  it('wraps a low-confidence segment with data-confidence="low" and the full candidate list', () => {
    const seg: Segment = {
      text: 'مرحبا',
      lang: 'ar',
      candidates: ['ar', 'ur', 'fa', 'ps', 'sd', 'ug', 'ks'],
      confidence: 'low',
    };
    expect(segmentsToHtml([seg])).toBe(
      '<span lang="ar" data-confidence="low" data-candidates="ar,ur,fa,ps,sd,ug,ks">مرحبا</span>'
    );
  });

  it('puts the default language first: first candidate equals lang', () => {
    const seg: Segment = {
      text: 'мир',
      lang: 'ru',
      candidates: ['ru', 'uk', 'bg'],
      confidence: 'low',
    };
    const html = segmentsToHtml([seg]);
    expect(html).toContain('lang="ru"');
    expect(html).toContain('data-candidates="ru,uk,bg"');
  });

  it('marks a needsLanguage segment with data-needs-language and no lang or candidates', () => {
    const html = segmentsToHtml([{ text: '᚛ᚑᚌᚐᚋ᚜', needsLanguage: true }]);
    expect(html).toBe('<span data-needs-language="true">᚛ᚑᚌᚐᚋ᚜</span>');
    expect(html).not.toContain('lang=');
    expect(html).not.toContain('data-candidates');
  });

  it('escapes special characters inside a wrapped segment, but not the tags it builds', () => {
    const seg: Segment = { text: 'مرحبا <b>', lang: 'ar', candidates: ['ar'], confidence: 'high' };
    expect(segmentsToHtml([seg])).toBe(
      '<span lang="ar" data-candidates="ar">مرحبا &lt;b&gt;</span>'
    );
  });

  it('joins a realistic mixed sequence in order with no separator', () => {
    const segs: Segment[] = [
      { text: 'He said' },
      { text: ' ' },
      { text: '北京', lang: 'zh', candidates: ['zh', 'ja'], confidence: 'low' },
      { text: ' ' },
      { text: 'proudly.' },
    ];
    expect(segmentsToHtml(segs)).toBe(
      'He said <span lang="zh" data-confidence="low" data-candidates="zh,ja">北京</span> proudly.'
    );
  });

  it('returns an empty string for an empty array', () => {
    expect(segmentsToHtml([])).toBe('');
  });

  it('round-trips: stripping the added spans reproduces the original text', () => {
    const original = 'Say "مرحبا" & <leave>';
    const runs: Run[] = [
      { text: 'Say "', script: 'Common' },
      { text: 'مرحبا', script: 'Arabic' },
      { text: '" & <leave>', script: 'Common' },
    ];
    const html = insertSpans(runs);
    const stripped = html.replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '');
    const unescaped = stripped
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');
    expect(unescaped).toBe(original);
  });
});

describe('insertSpans', () => {
  it('chains runs through buildSegments and segmentsToHtml end to end', () => {
    const runs: Run[] = [
      { text: 'He said ', script: 'Latin' },
      { text: '북경', script: 'Hangul' },
      { text: ' proudly.', script: 'Latin' },
    ];
    expect(insertSpans(runs)).toBe(
      'He said <span lang="ko" data-candidates="ko">북경</span> proudly.'
    );
  });

  it('returns an empty string for no runs', () => {
    expect(insertSpans([])).toBe('');
  });
});