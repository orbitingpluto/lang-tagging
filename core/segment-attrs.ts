import type { Segment } from "./span-insert";

// The attributes a segment's <span> should carry. An empty array means the
// segment stays plain text (no span at all). Shared by the string renderer
// (segmentsToHtml) and the DOM editor (replaceTextNodes) so they can't drift.
export function segmentAttrs(seg: Segment): { name: string; value: string }[] {
  if (seg.needsLanguage) {
    return [{ name: "data-needs-language", value: "true" }];
  }
  if (!seg.lang) return [];

  const attrs = [{ name: "lang", value: seg.lang }];
  if (seg.confidence === "low") {
    attrs.push({ name: "data-confidence", value: "low" });
  }
  if (seg.candidates && seg.candidates.length > 0) {
    attrs.push({ name: "data-candidates", value: seg.candidates.join(",") });
  }
  return attrs;
}
