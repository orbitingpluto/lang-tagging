import { describe, it, expect } from 'vitest';
import corpus from '../data/test-corpus.json';
import { detectScripts } from '../core/script-detect';
import { buildRuns } from '../core/run-builder';
import { resolveLanguage } from '../core/lang-resolve';

// Shape of data/test-corpus.json. Normal cases list `text`; numbers-toggle
// cases instead list `numbersIncluded` (one string) and `numbersExcluded`
// (array of strings) for the two includeNumbers settings.
interface ExpectedRun {
  text?: string;
  numbersIncluded?: string;
  numbersExcluded?: string[];
  script: string;
  langCandidates: string[];
}
interface Case {
  id: string;
  description: string;
  input: string;
  expectedRuns: ExpectedRun[];
  numbersToggleRelevant: boolean;
  ambiguityNote?: string;
}

const cases = (corpus as { cases: Case[] }).cases;

// Real gaps the corpus has surfaced, kept visible instead of deleted.
// `it.fails` passes while the gap exists and starts failing once it is fixed,
// which is the cue to remove the entry here.
const KNOWN_GAPS: Record<string, string> = {};

// Run the real pipeline and keep only the runs that would get wrapped.
function actualRuns(input: string, includeNumbers: boolean) {
  return buildRuns(detectScripts(input), { includeNumbers })
    .filter((r) => r.script !== 'Latin' && r.script !== 'Common');
}

// Same shape, built from the corpus's expectations for a given toggle setting.
function expectedFor(c: Case, includeNumbers: boolean) {
  return c.expectedRuns.flatMap((e) => {
    const texts = c.numbersToggleRelevant
      ? includeNumbers
        ? [e.numbersIncluded!]
        : e.numbersExcluded!
      : [e.text!];
    return texts.map((text) => ({ text, script: e.script }));
  });
}

describe('test-corpus.json', () => {
  for (const c of cases) {
    // Cases that don't depend on the toggle are checked under both settings.
    describe(c.id, () => {
      for (const includeNumbers of [true, false]) {
        // Toggle-independent cases have no digits to treat differently, but
        // checking both settings guards against the toggle leaking into them.
        const test = c.id in KNOWN_GAPS ? it.fails : it;
        test(`wraps the expected runs (includeNumbers: ${includeNumbers})`, () => {
          expect(actualRuns(c.input, includeNumbers)).toEqual(expectedFor(c, includeNumbers));
        });
      }

      it('has the expected default language among the resolver candidates', () => {
        // Only the first corpus candidate (the expected default) is checked,
        // and only for membership: Urdu/Persian letter heuristics are
        // descoped from v1, so the resolver's own default may differ.
        const runs = actualRuns(c.input, true);
        for (const [i, run] of runs.entries()) {
          const expectedDefault = c.expectedRuns[Math.min(i, c.expectedRuns.length - 1)]!.langCandidates[0]!;
          expect(resolveLanguage(run).candidates).toContain(expectedDefault);
        }
      });
    });
  }
});