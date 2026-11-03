import { describe, it, expect } from 'vitest';
import { parseFragment, serialize } from 'parse5';
import { collectTextNodes, replaceTextNodes } from '../core/html-walk';
import { tagHtml } from '../core/span-insert';

const wrapAll = (text: string) => [{ text, lang: 'xx' }];

describe('collectTextNodes', () => {
  it('returns decoded text of every text node in document order', () => {
    const frag = parseFragment('<p>Hi <em>there</em> &amp; you</p>');
    expect(collectTextNodes(frag)).toEqual(['Hi ', 'there', ' & you']);
  });
});

describe('replaceTextNodes', () => {
  it('wraps text nodes at any depth and re-escapes entities on serialize', () => {
    const frag = parseFragment('<p>Hi <em>there</em> &amp; you</p>');
    replaceTextNodes(frag, wrapAll);
    expect(serialize(frag)).toBe(
      '<p><span lang="xx">Hi </span><em><span lang="xx">there</span></em><span lang="xx"> &amp; you</span></p>'
    );
  });

  it('skips text inside <script> and <style>', () => {
    const frag = parseFragment('<script>a</script><style>b</style>');
    replaceTextNodes(frag, wrapAll);
    expect(serialize(frag)).toBe('<script>a</script><style>b</style>');
  });

  it('reports the nearest ancestor lang to the callback (lang first, then xml:lang)', () => {
    const frag = parseFragment(
      '<div lang="hi"><p lang="ar">a</p><p>b</p></div><p>c</p><p xml:lang="fr">d</p><p lang="de" xml:lang="fr">e</p>'
    );
    const seen: Record<string, string | undefined> = {};
    replaceTextNodes(frag, (text, ctx) => {
      seen[text] = ctx.ancestorLang;
      return [{ text }];
    });
    expect(seen).toEqual({ a: 'ar', b: 'hi', c: undefined, d: 'fr', e: 'de' });
  });

  it('no longer skips text just because an ancestor has a lang (the callback decides per run)', () => {
    const frag = parseFragment('<div lang="hi"><p>c</p></div>');
    replaceTextNodes(frag, wrapAll);
    expect(serialize(frag)).toBe('<div lang="hi"><p><span lang="xx">c</span></p></div>');
  });

  it('leaves plain segments as bare text, not spans', () => {
    const frag = parseFragment('<p>abc</p>');
    replaceTextNodes(frag, (t) => [{ text: t }]);
    expect(serialize(frag)).toBe('<p>abc</p>');
  });
});

describe('tagHtml (end to end)', () => {
  it('tags non-Latin text inside existing markup and leaves tags/attributes alone', () => {
    expect(tagHtml('<p class="intro">Say 안녕하세요 now</p>')).toBe(
      '<p class="intro">Say <span lang="ko" data-candidates="ko">안녕하세요</span> now</p>'
    );
  });

  it('does not double-escape existing entities', () => {
    expect(tagHtml('<p>Tom &amp; Jerry &lt;3</p>')).toBe('<p>Tom &amp; Jerry &lt;3</p>');
  });

  it('adds review markers for ambiguous scripts', () => {
    expect(tagHtml('<p>مرحبا</p>')).toContain('data-confidence="low"');
  });

  it('does not touch angle brackets inside tags or attribute values', () => {
    expect(tagHtml('<a title="a > b" href="x">hello</a>')).toBe('<a title="a > b" href="x">hello</a>');
  });

  it('returns an empty string for empty input', () => {
    expect(tagHtml('')).toBe('');
  });
});

describe('tagHtml with author-declared languages', () => {
  it('still tags non-Latin text under an unrelated wrapper lang (e.g. a whole-chapter lang="en")', () => {
    const out = tagHtml('<div lang="en"><p>She said شكرا جزيلا today.</p></div>');
    expect(out).toContain('<span lang="ar"');
    expect(out).toContain('شكرا جزيلا</span>');
    expect(out.startsWith('<div lang="en">')).toBe(true);
  });

  it('leaves a run alone when the ancestor lang is its default language', () => {
    expect(tagHtml('<div lang="hi"><p>नमस्ते</p></div>')).toBe('<div lang="hi"><p>नमस्ते</p></div>');
  });

  it('respects an author-declared non-default candidate (lang="ur" is not retagged as ar)', () => {
    expect(tagHtml('<p lang="ur">مرحبا</p>')).toBe('<p lang="ur">مرحبا</p>');
  });

  it('matches on the primary subtag, so regional variants count (ar-EG, ja-JP)', () => {
    expect(tagHtml('<p lang="ar-EG">مرحبا</p>')).toBe('<p lang="ar-EG">مرحبا</p>');
    expect(tagHtml('<p lang="ja-JP">北京</p>')).toBe('<p lang="ja-JP">北京</p>');
  });

  it('tags a run whose script the ancestor lang does not cover (Arabic under lang="hi")', () => {
    expect(tagHtml('<div lang="hi"><p>مرحبا</p></div>')).toContain('<span lang="ar"');
  });

  it('in a mixed text node, tags only the uncovered runs and keeps plain text unfragmented', () => {
    expect(tagHtml('<p lang="ar">Hello مرحبا world</p>')).toBe('<p lang="ar">Hello مرحبا world</p>');
    const out = tagHtml('<p lang="en">Hello مرحبا world</p>');
    expect(out).toContain('Hello <span lang="ar"');
    expect(out).toContain('</span> world</p>');
  });

  it('treats xml:lang like lang', () => {
    expect(tagHtml('<p xml:lang="ar">شكرا</p>')).toBe('<p xml:lang="ar">شكرا</p>');
    expect(tagHtml('<p xml:lang="en">شكرا</p>')).toContain('<span lang="ar"');
  });

  it('tags normally when the ancestor lang is empty ("unknown")', () => {
    expect(tagHtml('<p lang="">مرحبا</p>')).toContain('<span lang="ar"');
  });

  it('still tags unmapped scripts under an ancestor lang (no candidates to match against)', () => {
    expect(tagHtml('<p lang="en">᚛ᚑᚌᚐᚋ᚜</p>')).toContain('data-needs-language="true"');
  });
});

describe('tagHtml is stable on its own review output', () => {
  it('re-running on tagged output changes nothing, including flagged unmapped-script spans', () => {
    const once = tagHtml('<p>Say 안녕 and مرحبا and ᚛ᚑᚌᚐᚋ᚜ ok</p>');
    expect(tagHtml(once)).toBe(once);
  });

  it('does not add a new flagged span inside one a reviewer has since given a lang', () => {
    const reviewed = tagHtml('<p>᚛ᚑᚌᚐᚋ᚜</p>').replace('data-needs-language="true"', 'data-needs-language="true" lang="la"');
    const rerun = tagHtml(reviewed);
    expect(rerun).toBe(reviewed);
    expect(rerun.match(/<span/g)).toHaveLength(1);
  });
});