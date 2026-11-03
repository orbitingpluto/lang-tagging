/**
 * Re-orders data/script-lang-ambiguous.json's candidate arrays by estimated
 * speaker population (data/language-population.json), highest first, instead
 * of the alphabetical order generate-script-lang-table.ts originally wrote.
 *
 * Run AFTER both generate-script-lang-table.ts and
 * generate-language-population.ts.
 *
 * A language with no population data at all (not present in CLDR's
 * territoryInfo) is sorted to the end, after every language that does have
 * an estimate — better than guessing it's popular, and better than dropping
 * it from the candidate list entirely.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(__dirname, '../data');

const ambiguous = JSON.parse(readFileSync(path.join(dataDir, 'script-lang-ambiguous.json'), 'utf-8'));
const population = JSON.parse(readFileSync(path.join(dataDir, 'language-population.json'), 'utf-8'));

const popMap: Record<string, number> = population.languages;

for (const [script, langs] of Object.entries(ambiguous.scripts) as [string, string[]][]) {
  const ranked = [...langs].sort((a, b) => {
    const popA = popMap[a] ?? -1;
    const popB = popMap[b] ?? -1;
    return popB - popA; // descending — highest speaker count first
  });
  ambiguous.scripts[script] = ranked;
}

ambiguous._note =
  (ambiguous._note ?? '') +
  ' Candidate order within each script is now ranked by estimated speaker ' +
  'population (see language-population.json), highest first — not alphabetical.';

writeFileSync(
  path.join(dataDir, 'script-lang-ambiguous.json'),
  JSON.stringify(ambiguous, null, 2)
);

console.log('Re-ranked candidate order for', Object.keys(ambiguous.scripts).length, 'ambiguous scripts.');
for (const [script, langs] of Object.entries(ambiguous.scripts)) {
  console.log(`  ${script}: ${(langs as string[]).slice(0, 5).join(', ')}${(langs as string[]).length > 5 ? ', ...' : ''}`);
}
