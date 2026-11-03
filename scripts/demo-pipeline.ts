import { detectScripts } from '../core/script-detect';
import { buildRuns } from '../core/run-builder';
import { resolveLanguage } from '../core/lang-resolve';

const sample = `
The professor began the lecture by greeting the class: "आज हम भारतीय इतिहास 12 पढ़ेंगे।" She then switched to Urdu for the visiting students, saying شکریہ آپ کا, before continuing in English.

Later, a note on the whiteboard read: 北京 is the capital of China, while 東京 (written in a mix of kanji and かな) is the capital of Japan. A student from Yerevan added Բարև ձեզ in the margin, and someone else wrote привет, друзья! just below it.

The final slide simply said شكرا جزيلا and thanked everyone for coming — page 12 of the handout has more detail, if includeNumbers is set to exclude, this "12" should stand alone.
`.trim();

console.log('='.repeat(70));
console.log('INPUT TEXT');
console.log('='.repeat(70));
console.log(sample);
console.log();

function runPipeline(text: string, includeNumbers: boolean) {
  console.log('='.repeat(70));
  console.log(`PIPELINE OUTPUT (includeNumbers: ${includeNumbers})`);
  console.log('='.repeat(70));

  const graphemes = detectScripts(text);
  const runs = buildRuns(graphemes, { includeNumbers });

  for (const run of runs) {
    if (run.script === 'Latin' || run.script === 'Common') {
      // Not wrapped in real output — just show it's passing through untouched.
      const preview = run.text.replace(/\n/g, '\\n');
      console.log(`  [${run.script.padEnd(7)}] ${JSON.stringify(preview)}`);
      continue;
    }

    const resolution = resolveLanguage(run);
    const preview = run.text.replace(/\n/g, '\\n');
    console.log(
      `  [${run.script.padEnd(7)}] lang="${resolution.lang}" ` +
      `(confidence: ${resolution.confidence}, candidates: [${resolution.candidates.join(', ')}]) ` +
      JSON.stringify(preview)
    );
  }
  console.log();
}

runPipeline(sample, true);
runPipeline(sample, false);
