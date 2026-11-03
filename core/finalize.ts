import {
  parseFragment,
  serialize,
  defaultTreeAdapter,
  type DefaultTreeAdapterMap,
} from "parse5";

import { collectTextNodes } from "./html-walk";
import { isIso6391Code } from "./iso-639-1";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

// The review-only attributes segmentAttrs() adds to a tagged <span>.
const REVIEW_MARKERS = new Set([
  "data-confidence",
  "data-candidates",
  "data-needs-language",
]);

export interface UnresolvedSpan {
  index: number;
  text: string;
}

export interface InvalidLanguageSpan {
  index: number;
  text: string;
  lang: string;
}

export type FinalizeResult =
  | { ok: true; html: string }
  | {
      ok: false;
      unresolved: UnresolvedSpan[];
      invalid: InvalidLanguageSpan[];
    };

function attrValue(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

/**
 * Converts review-mode HTML into publishable HTML.
 *
 * Tool-generated spans must have a valid ISO 639-1 language code.
 * Author-authored spans without review markers are left alone,
 * including valid BCP 47 tags such as "zh-Hant".
 *
 * Review-only data attributes are removed from spans after validation.
 */
export function finalizeHtml(input: string): FinalizeResult {
  const fragment = parseFragment(input);

  const spans: Element[] = [];
  const unresolved: UnresolvedSpan[] = [];
  const invalid: InvalidLanguageSpan[] = [];

  function visit(node: Node): void {
    if (
      defaultTreeAdapter.isElementNode(node) &&
      node.tagName === "span"
    ) {
      spans.push(node);

      const isToolSpan =
        attrValue(node, "data-needs-language") !== undefined ||
        attrValue(node, "data-confidence") !== undefined ||
        attrValue(node, "data-candidates") !== undefined;

      if (isToolSpan) {
        const lang = attrValue(node, "lang");
        const text = collectTextNodes(node).join("");

        if (lang === undefined || lang.trim() === "") {
          if (attrValue(node, "data-needs-language") !== undefined) {
            unresolved.push({
              index: unresolved.length + 1,
              text,
            });
          }
        } else if (!isIso6391Code(lang)) {
          invalid.push({
            index: invalid.length + 1,
            text,
            lang,
          });
        }
      }
    }

    if ("childNodes" in node && Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) {
        visit(child);
      }
    }
  }

  visit(fragment);

  if (unresolved.length > 0 || invalid.length > 0) {
    return {
      ok: false,
      unresolved,
      invalid,
    };
  }

  for (const span of spans) {
    span.attrs = span.attrs.filter(
      (a) => !REVIEW_MARKERS.has(a.name),
    );
  }

  return {
    ok: true,
    html: serialize(fragment),
  };
}