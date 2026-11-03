import { defaultTreeAdapter, html, type DefaultTreeAdapterMap } from "parse5";
import type { Segment } from "./span-insert";
import { segmentAttrs } from "./segment-attrs";

type Node = DefaultTreeAdapterMap['node'];
type TextNode = DefaultTreeAdapterMap['textNode'];

export function collectTextNodeRefs(node: Node): TextNode[] {
    const textValues: TextNode[] = [];

    function traverse(currentNode: Node): void {
        if (defaultTreeAdapter.isTextNode(currentNode)) {
            textValues.push(currentNode);
            return;
        }

        if ('childNodes' in currentNode && Array.isArray(currentNode.childNodes)){
            for (const child of currentNode.childNodes) {
                traverse(child);
            }
        }
    }

    traverse(node);
    return textValues;
}

export function collectTextNodes(root: Node): string[] {
    return collectTextNodeRefs(root).map((n) => n.value);
}

const SKIPPED_TAGS = new Set(["script", "style"]);

function shouldSkip(textNode: TextNode): boolean {
  let current: Node | null = textNode.parentNode;
  while (current) {
    if (defaultTreeAdapter.isElementNode(current)) {
      if (SKIPPED_TAGS.has(current.tagName)) return true;
      // Text inside a span this tool already flagged for review is already handled.
      // Re-tagging it would nest a second flagged span inside the first.
      if (current.attrs.some((a) => a.name === "data-needs-language")) return true;
    }
    current = "parentNode" in current ? current.parentNode : null;
  }
  return false;
}

// The language the author already declared for this text: the value of the
// nearest ancestor's lang attribute (xml:lang as a fallback on the same element).
// undefined means no ancestor declares one. An empty string is returned as-is
// (lang="" explicitly means "unknown"), so callers can tell it apart from "none".
function nearestAncestorLang(textNode: TextNode): string | undefined {
  let current: Node | null = textNode.parentNode;
  while (current) {
    if (defaultTreeAdapter.isElementNode(current)) {
      const attr =
        current.attrs.find((a) => a.name === "lang") ??
        current.attrs.find((a) => a.name === "xml:lang");
      if (attr) return attr.value;
    }
    current = "parentNode" in current ? current.parentNode : null;
  }
  return undefined;
}

export interface TextContext {
  ancestorLang?: string;
}

export function replaceTextNodes(
    root: Node,
    fn: (text: string, ctx: TextContext) => Segment[],
): void {
    const textNodes = collectTextNodeRefs(root);

    for (const textNode of textNodes) {
        const parent = textNode.parentNode;
        if (!parent || shouldSkip(textNode)) continue;

        const ctx: TextContext = {};
        const ancestorLang = nearestAncestorLang(textNode);
        if (ancestorLang !== undefined) ctx.ancestorLang = ancestorLang;

        for (const seg of fn(textNode.value, ctx)) {
            const attrs = segmentAttrs(seg);
            if (attrs.length > 0) {
                const span = defaultTreeAdapter.createElement("span", html.NS.HTML, attrs);
                defaultTreeAdapter.insertText(span, seg.text);
                defaultTreeAdapter.insertBefore(parent, span, textNode);
            } else {
                defaultTreeAdapter.insertTextBefore(parent, seg.text, textNode);
            }
        }
        defaultTreeAdapter.detachNode(textNode);
    }
}