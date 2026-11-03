import { describe, it, expect } from 'vitest';
import { finalizeHtml } from '../core/finalize';
import { tagHtml } from '../core/span-insert';

function html(result: ReturnType<typeof finalizeHtml>): string {
  if (!result.ok) throw new Error('expected finalize to succeed');
  return result.html;
}

describe('finalizeHtml — stripping review markers', () => {
  it('strips all review markers from a low-confidence span and keeps lang', () => {
    const input =
      '<p>Say <span lang="ar" data-confidence="low" data-candidates="ar,ur,fa">مرحبا</span> now</p>';

    expect(html(finalizeHtml(input))).toBe(
      '<p>Say <span lang="ar">مرحبا</span> now</p>',
    );
  });

  it('strips data-candidates from a high-confidence span', () => {
    expect(
      html(finalizeHtml('<span lang="ko" data-candidates="ko">안녕</span>')),
    ).toBe('<span lang="ko">안녕</span>');
  });

  it('keeps a reviewer-edited lang (this is the whole override mechanism)', () => {
    const input =
      '<span lang="ur" data-confidence="low" data-candidates="ar,ur,fa">شکریہ</span>';

    expect(html(finalizeHtml(input))).toBe(
      '<span lang="ur">شکریہ</span>',
    );
  });

  it('leaves data-* attributes on non-span elements alone', () => {
    const input =
      '<p data-candidates="x"><a data-confidence="y" href="z">hi</a></p>';

    expect(html(finalizeHtml(input))).toBe(input);
  });

  it('leaves text and entities untouched', () => {
    expect(
      html(finalizeHtml('<p>Tom &amp; Jerry &lt;3</p>')),
    ).toBe('<p>Tom &amp; Jerry &lt;3</p>');
  });

  it('is idempotent', () => {
    const once = html(
      finalizeHtml(
        '<span lang="ar" data-confidence="low" data-candidates="ar,ur">م</span>',
      ),
    );

    expect(html(finalizeHtml(once))).toBe(once);
  });

  it('returns an empty string for empty input', () => {
    expect(finalizeHtml('')).toEqual({ ok: true, html: '' });
  });
});

describe('finalizeHtml — refusing on unresolved spans', () => {
  it('refuses, and reports the text of a span still flagged data-needs-language', () => {
  const input =
    '<p>x <span data-needs-language="true">᚛ᚑᚌᚐዚ</span> y</p>';

  const result = finalizeHtml(input);

  expect(result).toEqual({
    ok: false,
    unresolved: [{ index: 1, text: '᚛ᚑᚌᚐዚ' }],
    invalid: [],
  });
});

  it('reports every unresolved span in document order, even ones nested in other markup', () => {
    const result = finalizeHtml(
      '<p><span data-needs-language="true">ᚑ</span> and <em><span data-needs-language="true">ᚌ</span></em></p>' +
        '<p><span data-needs-language="true">ᚐ</span></p>',
    );

    expect(result).toEqual({
      ok: false,
      unresolved: [
        { index: 1, text: 'ᚑ' },
        { index: 2, text: 'ᚌ' },
        { index: 3, text: 'ᚐ' },
      ],
      invalid: [],
    });
  });

  it('produces no HTML at all when refusing, even if other spans are fine', () => {
    const result = finalizeHtml(
      '<span lang="ar" data-confidence="low">م</span><span data-needs-language="true">ᚑ</span>',
    );

    expect(result.ok).toBe(false);
    expect('html' in result).toBe(false);
  });

  it('treats a flagged span as resolved once the reviewer has given it a lang', () => {
    expect(
      html(
        finalizeHtml(
          '<span data-needs-language="true" lang="la">ᚑ</span>',
        ),
      ),
    ).toBe('<span lang="la">ᚑ</span>');
  });

  it('does not accept an empty lang="" as resolved', () => {
    const result = finalizeHtml(
      '<span data-needs-language="true" lang="">ᚑ</span>',
    );

    expect(result.ok).toBe(false);
  });

  it('does not accept a whitespace-only lang as resolved', () => {
    expect(
      finalizeHtml(
        '<span data-needs-language="true" lang="  ">ᚑ</span>',
      ).ok,
    ).toBe(false);
  });
});

describe('tagHtml → finalizeHtml (review to final)', () => {
  it('produces clean publishable spans from tagged output', () => {
    const final = html(
      finalizeHtml(tagHtml('<p>Say 안녕하세요 and مرحبا</p>')),
    );

    expect(final).toBe(
      '<p>Say <span lang="ko">안녕하세요</span> and <span lang="ar">مرحبا</span></p>',
    );

    expect(final).not.toContain('data-');
  });

  it('refuses output from tagHtml that contains an unmapped script', () => {
    const result = finalizeHtml(
      tagHtml('<p>An Ogham word: ᚛ᚑᚌᚐዚ</p>'),
    );

    expect(result.ok).toBe(false);
  });
});

describe('finalizeHtml — ISO 639-1 validation', () => {
  it.each([
    'xx',
    'zz',
    'sga',
    'eng',
    'bh',
    'sh',
    '123',
    'a',
  ])('rejects invalid code %s on a tool-generated span', (lang) => {
    const result = finalizeHtml(
      `<span lang="${lang}" data-candidates="ar">text</span>`,
    );

    expect(result).toEqual({
      ok: false,
      unresolved: [],
      invalid: [
        {
          index: 1,
          text: 'text',
          lang,
        },
      ],
    });
  });

  it('accepts a valid ISO 639-1 code on a reviewed unresolved span', () => {
    expect(
      finalizeHtml(
        '<span data-needs-language="true" lang="ga">text</span>',
      ),
    ).toEqual({
      ok: true,
      html: '<span lang="ga">text</span>',
    });
  });

  it('does not impose the tool ISO 639-1 restriction on author-authored BCP 47 spans', () => {
    const input = '<span lang="zh-Hant">繁體中文</span>';

    expect(finalizeHtml(input)).toEqual({
      ok: true,
      html: input,
    });
  });
});
describe('review workflow: assign a language, then finalize', () => {
  const flagged = () =>
    '<p>An unmapped word: <span data-needs-language="true">unmapped text</span></p>';

  const expected =
    '<p>An unmapped word: <span lang="ga">unmapped text</span></p>';

  it('finalizes cleanly when the reviewer replaces the marker with a lang', () => {
    expect(finalizeHtml(flagged()).ok).toBe(false);

    const fixed = flagged().replace(
      'data-needs-language="true"',
      'lang="ga"',
    );

    expect(html(finalizeHtml(fixed))).toBe(expected);
  });

  it('finalizes cleanly when the reviewer adds a lang and keeps the marker', () => {
    const fixed = flagged().replace(
      'data-needs-language="true"',
      'data-needs-language="true" lang="ga"',
    );

    expect(html(finalizeHtml(fixed))).toBe(expected);
  });

  it('still finalizes cleanly if tagHtml is re-run in between (marker kept)', () => {
    const fixed = flagged().replace(
      'data-needs-language="true"',
      'data-needs-language="true" lang="ga"',
    );

    expect(html(finalizeHtml(tagHtml(fixed)))).toBe(expected);
  });

  it('refuses a three-letter ISO 639-3 code even when a reviewer supplies it', () => {
    const fixed = flagged().replace(
      'data-needs-language="true"',
      'data-needs-language="true" lang="sga"',
    );

    expect(finalizeHtml(fixed)).toMatchObject({
      ok: false,
      invalid: [
        {
          index: 1,
          text: 'unmapped text',
          lang: 'sga',
        },
      ],
    });
  });
});