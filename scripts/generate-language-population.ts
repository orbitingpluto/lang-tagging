/**
 * Generates data/language-population.json — an estimated total speaker count
 * per ISO 639-1 language, derived from CLDR's supplementalData.xml
 * <territoryInfo> section.
 *
 * For each territory, CLDR lists its total population and, for each language
 * spoken there, what percentage of that territory speaks it. We estimate a
 * language's total speakers by summing (territory population × that
 * language's percentage) across every territory it appears in.
 *
 * Caveat: percentages in this data can include people who speak a language
 * as a second language, not just native speakers, and a single person can be
 * counted under multiple languages within the same territory (multilingual
 * populations). Treat this as "a reasonable estimate of real-world
 * prevalence," not a precise census — good enough for ranking candidate
 * defaults, not a claim of exact speaker counts.
 *
 * Run:
 *   npx tsx scripts/generate-language-population.ts
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/unicode-org/cldr/main/common/supplemental/supplementalData.xml';

function isIso639_1(code: string): boolean {
  return /^[a-z]{2}$/.test(code);
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const xml = await res.text();

  const territoryInfoMatch = xml.match(/<territoryInfo>([\s\S]*?)<\/territoryInfo>/);
  if (!territoryInfoMatch) {
    throw new Error('Could not find <territoryInfo> section — CLDR file format may have changed.');
  }
  const territoryInfoXml = territoryInfoMatch[1];

  const TERRITORY_RE = /<territory\s+type="([^"]+)"[^>]*\bpopulation="([^"]+)"[^>]*>([\s\S]*?)<\/territory>/g;
  const LANG_POP_RE = /<languagePopulation\s+type="([^"]+)"\s+populationPercent="([^"]+)"/g;

  const speakerTotals = new Map<string, number>();
  let territoryCount = 0;
  let languagePopRows = 0;
  let skippedNon639_1 = 0;

  let territoryMatch: RegExpExecArray | null;
  while ((territoryMatch = TERRITORY_RE.exec(territoryInfoXml)) !== null) {
    territoryCount++;
    const [, , populationStr, territoryBody] = territoryMatch;
    const territoryPopulation = parseFloat(populationStr);
    if (!Number.isFinite(territoryPopulation)) continue;

    let langMatch: RegExpExecArray | null;
    LANG_POP_RE.lastIndex = 0;
    while ((langMatch = LANG_POP_RE.exec(territoryBody)) !== null) {
      languagePopRows++;
      const [, lang, percentStr] = langMatch;

      if (!isIso639_1(lang)) {
        skippedNon639_1++;
        continue; // consistent with the rest of the project: 639-1 only
      }

      const percent = parseFloat(percentStr);
      if (!Number.isFinite(percent)) continue;

      const estimatedSpeakers = territoryPopulation * (percent / 100);
      speakerTotals.set(lang, (speakerTotals.get(lang) ?? 0) + estimatedSpeakers);
    }
  }

  if (territoryCount === 0) {
    throw new Error('No <territory> entries matched — CLDR file format may have changed.');
  }

  // Round for readability; these are estimates, not precise counts, and
  // fractional people are a sign of that, not a sign of extra precision.
  const rounded: Record<string, number> = {};
  for (const [lang, total] of [...speakerTotals.entries()].sort((a, b) => b[1] - a[1])) {
    rounded[lang] = Math.round(total);
  }

  const out = {
    _generatedFrom: SOURCE_URL,
    _generatedAt: new Date().toISOString(),
    _caveat:
      'Estimated total speakers per ISO 639-1 language, from CLDR territoryInfo ' +
      '(territory population × language population percentage, summed across ' +
      'territories). May include second-language speakers and double-counts ' +
      'multilingual populations. A reasonable ranking signal, not a census.',
    languages: rounded,
  };

  const outPath = path.resolve(__dirname, '../data/language-population.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`Parsed ${territoryCount} territories, ${languagePopRows} language-population rows.`);
  console.log(`Skipped ${skippedNon639_1} non-639-1 language rows.`);
  console.log(`${Object.keys(rounded).length} languages with population estimates.`);
  console.log(`Written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
