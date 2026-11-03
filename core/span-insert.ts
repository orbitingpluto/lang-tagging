import { resolveLanguage } from "./lang-resolve";
import { buildRuns, type Run } from "./run-builder";
import type { LangResolution } from "./lang-resolve";
import { segmentAttrs } from "./segment-attrs";
import { detectScripts } from "./script-detect";
import { parseFragment, serialize } from "parse5";
import { replaceTextNodes } from "./html-walk";

export interface Segment {
  text: string;
  lang?: string;             // present only when this segment got wrapped
  candidates?: string[];
  confidence?: 'high' | 'low';
  needsLanguage?: boolean;   // true for unmapped scripts — no safe lang to assign
}

export function buildSegments(runs: Run[]): Segment[] {
  const segments: Segment[] = [];
  for (const run of runs) {
    // Case 1: latin / common text only needs text
    if ( run.script == "Latin" || run.script == "Common") {
        segments.push({text: run.text});
    } else {
        const langRes: LangResolution = resolveLanguage(run);
        // Case 2: no language candidates at all, needs language
        if (langRes.lang === '') {
            segments.push({
                text: run.text,
                needsLanguage: true
            });
        } else {
            // Case 3: resolved to a language
            segments.push({
                text: run.text,
                lang: langRes.lang,
                candidates: langRes.candidates,
                confidence: langRes.confidence,
            });
        }
    }
  }
  return segments;
}

export function escapeHtml(text: string): string {
  text = text.replaceAll("&", "&amp;");
  text = text.replaceAll("<", "&lt;");
  text = text.replaceAll(">", "&gt;");
  return text;
}

export function segmentsToHtml(segments: Segment[]): string {
  let out = "";
  for (const seg of segments) {
    const attrs = segmentAttrs(seg);
    if (attrs.length === 0) {
      out += escapeHtml(seg.text);
    } else {
      const attrStr = attrs.map((a) => `${a.name}="${a.value}"`).join(" ");
      out += `<span ${attrStr}>${escapeHtml(seg.text)}</span>`;
    }
  }
  return out;
}


export function insertSpans(runs: Run[]): string {
  return segmentsToHtml(buildSegments(runs));
}

export function textToSegments(
  text: string,
  options: { includeNumbers?: boolean;
              preserveHan?: boolean;
   } = {},
): Segment[] {
  return buildSegments(buildRuns(detectScripts(text), options));
}

// "ar-EG" -> "ar", "zh_Hans" -> "zh". Candidate lists are ISO 639-1, so
// comparing primary subtags is what lets regional variants count as a match.
function primaryLang(tag: string): string {
  return tag.split(/[-_]/)[0]!.toLowerCase();
}

function isPlain(seg: Segment): boolean {
  return seg.lang === undefined && !seg.needsLanguage;
}

// If the author already declared a language on an ancestor, a run is considered
// already correctly tagged when that language is one of the run's candidates
// (so lang="ur" around Arabic-script text is respected, not retagged as "ar").
// Such runs go back to plain text; runs the ancestor does NOT cover
// (e.g. Arabic under lang="en") are left tagged. Adjacent plain segments are
// merged so we don't emit needless text-node fragments.
export function dropAlreadyTagged(
  segments: Segment[],
  ancestorLang: string | undefined,
): Segment[] {
  if (!ancestorLang) return segments;
  const ancestor = primaryLang(ancestorLang);

  const out: Segment[] = [];
  for (const seg of segments) {
    const next: Segment = seg.candidates?.includes(ancestor) ? { text: seg.text } : { ...seg };
    const last = out[out.length - 1];
    if (last && isPlain(last) && isPlain(next)) {
      last.text += next.text;
    } else {
      out.push(next);
    }
  }
  return out;
}

/**
 * Tags non-Latin runs in an HTML *fragment* — the body content only, such as
 * what the Pressbooks code editor holds. Full documents are not supported:
 * <html>, <head> and <body> are discarded by fragment parsing.
 *
 * Only text nodes are edited; existing tags, attributes and entities are
 * preserved. Text inside <script>/<style> is ignored. If an ancestor already
 * declares a language that covers a run (see dropAlreadyTagged), that run is
 * left alone.
 */
export function tagHtml(
  input: string,
  options: { includeNumbers?: boolean } = {},
): string {
  const fragment = parseFragment(input);
  replaceTextNodes(fragment, (text, ctx) => {
    const ancestor = ctx.ancestorLang
      ? primaryLang(ctx.ancestorLang)
      : '';

    const preserveHan = ancestor === 'zh' || ancestor === 'ko';

    return dropAlreadyTagged(
      textToSegments(text, { ...options, preserveHan }),
      ctx.ancestorLang,
    );
  });
  return serialize(fragment);
}