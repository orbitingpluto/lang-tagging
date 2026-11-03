/**
 * Generates data/script-lang-deterministic.json and data/script-lang-ambiguous.json
 * from CLDR's likelySubtags.xml.
 *
 * likelySubtags maps language -> default script (e.g. "af" -> "af_Latn_ZA").
 * We invert that: for every bare-language entry, pull out the script, and group
 * all languages that share a default script together. A script with exactly one
 * language in its group is a strong deterministic candidate; a script with more
 * than one is a real ambiguity case for lang-resolve.ts's heuristic layer.
 *
 * Caveat (documented in the output files too): likelySubtags reflects
 * population-weighted DEFAULTS, not an exhaustive list of every language that
 * has ever been written in a script. A script landing in the "deterministic"
 * bucket here is "very likely safe," not mathematically proven unambiguous —
 * hand-review before shipping, and hand-edit the JSON if you find a gap.
 *
 * Run once (or whenever you want to refresh against newer CLDR data):
 *   npx tsx scripts/generate-script-lang-table.ts
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/unicode-org/cldr/main/common/supplemental/likelySubtags.xml';

const LIKELY_SUBTAG_RE = /<likelySubtag\s+from="([^"]+)"\s+to="([^"]+)"\s*\/>/g;

// A bare language code: letters/digits only, no underscore (so "aa" qualifies,
// "abq_TR" and "abq_Latn" don't — those already have region/script specified,
// which isn't the "just the language, what's its default script" row we want).
function isBareLanguageCode(from: string): boolean {
  return !from.includes('_');
}

// ISO 639-1 codes are, by definition, exactly two letters — ISO 639-3 codes
// are three. This length check is what restricts the table to 639-1 only,
// dropping the much larger set of 639-3-only minority-language codes CLDR
// also tracks (e.g. Devanagari's raw candidate list has 56 entries; nearly
// all of them are 639-3-only and disappear once we filter to 639-1).
function isIso639_1(code: string): boolean {
  return /^[a-z]{2}$/.test(code);
}

// A small, stable set of deprecated ISO 639-1 codes CLDR still carries,
// normalized to their current replacement so they don't show up as separate
// "different" candidates for what's actually the same language.
const DEPRECATED_639_1: Record<string, string> = {
  iw: 'he', // old Hebrew
  in: 'id', // old Indonesian
  ji: 'yi', // old Yiddish
  jw: 'jv', // original ISO 639-1 Javanese code was a typo, corrected to "jv"
};

function normalize639_1(code: string): string {
  return DEPRECATED_639_1[code] ?? code;
}

// "af_Latn_ZA" -> "Latn". Guards against malformed rows instead of silently
// mis-grouping — better to throw and notice bad data than produce a quietly
// wrong table.
function extractScript(to: string): string {
  const parts = to.split('_');
  if (parts.length < 2) {
    throw new Error(`Unexpected "to" format, no script segment found: "${to}"`);
  }
  return parts[1];
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();

  const scriptToLangs = new Map<string, Set<string>>();
  let match: RegExpExecArray | null;
  let totalRows = 0;
  let bareLangRows = 0;

  while ((match = LIKELY_SUBTAG_RE.exec(xml)) !== null) {
    totalRows++;
    const [, from, to] = match;
    if (!isBareLanguageCode(from)) continue;
    bareLangRows++;

    if (!isIso639_1(from)) continue; // drop 639-3-only codes entirely
    const lang = normalize639_1(from);

    const script = extractScript(to);
    if (!scriptToLangs.has(script)) scriptToLangs.set(script, new Set());
    scriptToLangs.get(script)!.add(lang);
  }

  if (totalRows === 0) {
    throw new Error('No <likelySubtag> rows matched — CLDR file format may have changed.');
  }

  const deterministic: Record<string, string> = {};
  const ambiguous: Record<string, string[]> = {};

  for (const [script, langsSet] of scriptToLangs) {
    const langs = [...langsSet].sort();
    if (langs.length === 1) {
      deterministic[script] = langs[0];
    } else {
      ambiguous[script] = langs;
    }
  }

  const outDir = path.resolve(__dirname, '../data');

  const deterministicOut = {
    _generatedFrom: SOURCE_URL,
    _generatedAt: new Date().toISOString(),
    _caveat:
      'Derived from CLDR likelySubtags.xml (population-weighted defaults), ' +
      'not an exhaustive list of every language a script has ever been used for. ' +
      'Treat as "very likely safe," not proven unambiguous. Hand-edit if you find a gap. ' +
      'ISO 639-1 ONLY: languages with no 2-letter code (639-3-only) are dropped entirely ' +
      'from this table, and a script counts as "deterministic" here if it has exactly one ' +
      '639-1 candidate — it may still have other 639-3-only languages using it in reality.',
    scripts: deterministic,
  };

  const ambiguousOut = {
    _generatedFrom: SOURCE_URL,
    _generatedAt: new Date().toISOString(),
    _note:
      'Scripts where CLDR lists more than one ISO 639-1 language defaulting to this script. ' +
      'These need lang-resolve.ts heuristics (distinguishing letters, digit ranges, ' +
      'statistical fallback) rather than a direct lookup. "langs" is every 639-1 candidate, ' +
      'not yet ranked by likelihood — CLDR does not provide a popularity ranking here.',
    scripts: ambiguous,
  };

  writeFileSync(
    path.join(outDir, 'script-lang-deterministic.json'),
    JSON.stringify(deterministicOut, null, 2)
  );
  writeFileSync(
    path.join(outDir, 'script-lang-ambiguous.json'),
    JSON.stringify(ambiguousOut, null, 2)
  );

  console.log(`Parsed ${totalRows} total rows, ${bareLangRows} bare-language rows.`);
  console.log(`${Object.keys(deterministic).length} deterministic scripts.`);
  console.log(`${Object.keys(ambiguous).length} ambiguous scripts.`);
  console.log(`Written to ${outDir}/script-lang-deterministic.json and script-lang-ambiguous.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
