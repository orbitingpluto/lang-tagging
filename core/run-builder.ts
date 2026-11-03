import type { ScriptedGrapheme } from "./script-detect";

// final output shape
export interface Run {
  text: string;
  script: string;
}

// 1: classify + merge graphemes into raw typed chunks

type RawChunk =
  | { kind: 'anchor'; script: string; text: string } // actual script text
  | { kind: 'ws'; text: string } //whitespace
  | { kind: 'punct'; text: string } // non-whitespace/digit Common script characters
  | { kind: 'digit'; text: string } // western digits
  | { kind: 'symbol'; text: string };

function isPunctuation(text: string): boolean {
  return /^\p{P}\p{M}*$/u.test(text);
}

function classifyRaw(text: string, script: string): RawChunk {
  if (script === 'Common') {
    if (/^\s$/u.test(text)) return { kind: 'ws', text };
    if (/^\d$/u.test(text)) return { kind: 'digit', text };
    if (isPunctuation(text)) return { kind: 'punct', text };
    return { kind: 'symbol', text };
  }
  return { kind: 'anchor', script, text };
}

function mergeRawChunks(graphemes: ScriptedGrapheme[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  for (const g of graphemes) {
    const next = classifyRaw(g.text, g.script);
    const last = chunks[chunks.length - 1];

    // compare this grapheme and last grapheme on kind 
    const sameKind = last && last.kind === next.kind;
    // compare on script only if theyre both anchors
    const sameScript =
      next.kind === 'anchor' && last?.kind === 'anchor' && last.script === next.script;

    // merge them if the kinds match, and if script matches for anchors
    if (sameKind && (next.kind !== 'anchor' || sameScript)) {
      last!.text += next.text;
    } else {
      chunks.push(next); // otherwise, just push it as a new chunk
    }
  }
  return chunks; // consecutive script letters have all collapsed into single chunks
}

// 1b: resolve digits into 'attach' or 'hardbreak', given the toggle

// final chunk shape used to construct runs
export type Chunk =
  | { kind: 'anchor'; script: string; text: string } // extends currentRun if script match, otherwise close old and start new
  | { kind: 'ws'; text: string } // looks ahead to next script
  | { kind: 'attach'; text: string } // joins currentRun if one exists, otherwise waits in pendingAttachPrefix for next run
  | { kind: 'hardbreak'; text: string }; // closes currentRun, flushes leftover pendingAttachPrefix, pushes self as standalone Common entry

// skips outward over whitespace only, looking for the nearest anchor's script.
// stops (returns null) at any non-ws, non-anchor chunk, or the array edge.
function nearestAnchorScript(chunks: RawChunk[], index: number, direction: 1 | -1): string | null {
  let i = index + direction;
  while (i >= 0 && i < chunks.length) {
    const c = chunks[i]!;
    if (c.kind === 'anchor') return c.script; // found it
    if (c.kind === 'ws') { i += direction; continue; } // skip
    return null; // attach/digit/punct - nothing nearby that counts
  }
  return null;
}

// 
export function chunkify(graphemes: ScriptedGrapheme[], includeNumbers: boolean): Chunk[] {
  const raw = mergeRawChunks(graphemes);

  return raw.map((c, i): Chunk => {
    if (c.kind === 'punct') return { kind: 'attach', text: c.text };
    if (c.kind === 'symbol') return { kind: 'hardbreak', text: c.text};
    if (c.kind !== 'digit') return c; // ws and anchor unchanged

    // digit processing
    const isNonLatin = (s: string | null) => s !== null && s !== 'Latin';

    // if not include numbers and is surrounded by non latin text, hardbreak
    // i.e., don't tag the number as non-English
    // possibly a desire for early chapters of basic language textbooks.
    const nearBefore = nearestAnchorScript(raw, i, -1);
    const nearAfter = nearestAnchorScript(raw, i, 1);
    const shouldHardBreak = !includeNumbers && (isNonLatin(nearBefore) || isNonLatin(nearAfter));

    return shouldHardBreak
      ? { kind: 'hardbreak', text: c.text }
      // otherwise, include the digit in the anchor chunk.
      : { kind: 'attach', text: c.text };
  });
}

// 2: reduce the chunk list into final runs

// Looks past ws/attach chunks to find the script of the next anchor —
// a hardbreak blocks the lookahead entirely, since it's always a hard boundary.
function nextAnchorScript(chunks: Chunk[], from: number): string | null {
  for (let i = from; i < chunks.length; i++) {
    if (chunks[i]!.kind === 'anchor') return (chunks[i] as { script: string }).script;
    if (chunks[i]!.kind === 'hardbreak') return null;
  }
  return null;
}

export function reduceChunks(chunks: Chunk[]): Run[] {
  const runArr: Run[] = [];
  let currentRun: Run | null = null;
  let pendingAttachPrefix = '';

  const closeRun = () => {
    if (currentRun) runArr.push(currentRun);
    currentRun = null;
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;

    // extend existing same-script run, otherwise close and start new one
    if (chunk.kind === 'anchor') {
      if (currentRun && currentRun.script === chunk.script) {
        currentRun.text += chunk.text;
      } else {
        closeRun();
        currentRun = { text: pendingAttachPrefix + chunk.text, script: chunk.script };
        pendingAttachPrefix = '';
      }
      continue;
    }

    // append punct/digits to existing chunk, otherwise pending
    if (chunk.kind === 'attach') {
      if (currentRun) {
        currentRun.text += chunk.text; // touching the run being built — always joins
      } else {
        pendingAttachPrefix += chunk.text; // leading punctuation, waits for the next anchor
      }
      continue;
    }

    // excluded digit always forces break. adds as standalone Common entry
    if (chunk.kind === 'hardbreak') {
      closeRun();
      if (pendingAttachPrefix) {
        runArr.push({ text: pendingAttachPrefix, script: 'Common' });
        pendingAttachPrefix = '';
      }
      runArr.push({ text: chunk.text, script: 'Common' });
      continue;
    }

    // look ahead to find the next script.
    // if run open and match, ws joins run
    // otherwise close run and push ws as own entry
    if (chunk.kind === 'ws') {
      const nextScript = nextAnchorScript(chunks, i + 1);
      if (currentRun && nextScript === currentRun.script) {
        currentRun.text += chunk.text; // same script on both sides — joins
      } else {
        closeRun();
        runArr.push({ text: chunk.text, script: 'Common' });
      }
      continue;
    }
  }

  // flush whatever is still open and/or orphaned pending
  closeRun();
  if (pendingAttachPrefix) {
    runArr.push({ text: pendingAttachPrefix, script: 'Common' });
  }

  return runArr;
}

// Japanese is written with three scripts at once (Han + Hiragana + Katakana),
// so per-script run building would split one Japanese phrase into pieces.
// This pass relabels those graphemes as the composite script "Jpan" (CLDR's
// name for exactly this combination) wherever Japanese is evident.
//
// A "cluster" is a maximal stretch of Han/Hiragana/Katakana graphemes plus
// non-whitespace Common characters (punctuation, digits) between them.
// Whitespace ends a cluster. If a cluster contains any kana, all of it becomes
// Jpan; a Han-only cluster is left alone, because it could be Chinese.
const JAPANESE_PARTS = new Set(['Han', 'Hiragana', 'Katakana']);

export function unifyJapanese(graphemes: ScriptedGrapheme[]): ScriptedGrapheme[] {
  const result = graphemes.map((g) => ({ ...g }));
  const inCluster = (g: ScriptedGrapheme) =>
    JAPANESE_PARTS.has(g.script) ||
   (g.script === 'Common' && (isPunctuation(g.text) || /^\d$/u.test(g.text)));

  let i = 0;
  while (i < result.length) {
    if (!inCluster(result[i]!)) { i++; continue; }

    let j = i;
    let hasKana = false;
    while (j < result.length && inCluster(result[j]!)) {
      const script = result[j]!.script;
      if (script === 'Hiragana' || script === 'Katakana') hasKana = true;
      j++;
    }

    if (hasKana) {
      for (let k = i; k < j; k++) {
        if (JAPANESE_PARTS.has(result[k]!.script)) result[k]!.script = 'Jpan';
      }
    }
    i = j;
  }
  return result;
}

// Public entry point 

export function buildRuns(
  graphemes: ScriptedGrapheme[],
  options: { includeNumbers?: boolean } = {}
): Run[] {
  const { includeNumbers = true } = options;
  const chunks = chunkify(unifyJapanese(graphemes), includeNumbers);
  return reduceChunks(chunks);
}