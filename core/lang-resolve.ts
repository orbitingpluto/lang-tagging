import deterministicData from '../data/script-lang-deterministic.json';
import ambiguousData from '../data/script-lang-ambiguous.json';
import type { Run } from './run-builder';

export interface LangResolution {
  lang: string;         // '' means "no safe default — force the user to pick"
  candidates: string[];
  confidence: 'high' | 'low';
}

// Unicode's Script property (what getScript()/detectScripts return) uses long
// names. The CLDR-derived tables key on ISO 15924 four-letter codes. This maps
// every script with a clean 1:1 correspondence between the two.
const UNICODE_SCRIPT_TO_ISO15924: Record<string, string> = {
  Arabic: 'Arab', Armenian: 'Armn', Avestan: 'Avst', Bengali: 'Beng',
  Canadian_Aboriginal: 'Cans', Cyrillic: 'Cyrl', Devanagari: 'Deva',
  Ethiopic: 'Ethi', Georgian: 'Geor', Greek: 'Grek', Gujarati: 'Gujr',
  Gurmukhi: 'Guru', Hebrew: 'Hebr', Khmer: 'Khmr', Kannada: 'Knda', Lao: 'Laoo',
  Malayalam: 'Mlym', Myanmar: 'Mymr', Oriya: 'Orya', Sinhala: 'Sinh',
  Tamil: 'Taml', Telugu: 'Telu', Thaana: 'Thaa', Thai: 'Thai',
  Tibetan: 'Tibt', Yi: 'Yiii',
  Latin: 'Latn', // never actually looked up — Latin runs are never wrapped
};

// Scripts CLDR only represents as composite codes (Korean's default script,
// Japanese's default script) — the table lookup above can't reach these no
// matter how it's phrased, so they're handled directly instead.
const SPECIAL_CASES: Record<string, LangResolution> = {
  Hangul: { lang: 'ko', candidates: ['ko'], confidence: 'high' },
  Han: {
    lang: 'zh',
    candidates: ['zh', 'ja'],
    confidence: 'low', // Han alone can't distinguish Chinese from Japanese-kanji text
  },
  Hiragana: { lang: 'ja', candidates: ['ja'], confidence: 'high' },
  Katakana: { lang: 'ja', candidates: ['ja'], confidence: 'high' },
  // Composite label produced by unifyJapanese (Han + kana together).
  Jpan: { lang: 'ja', candidates: ['ja'], confidence: 'high' },
};

const deterministicTable: Record<string, string> = deterministicData.scripts;
const ambiguousTable: Record<string, string[]> = ambiguousData.scripts;

export function resolveLanguage(run: Run): LangResolution {
  if (SPECIAL_CASES[run.script]) {
    return SPECIAL_CASES[run.script]!;
  }

  const iso = UNICODE_SCRIPT_TO_ISO15924[run.script];

  if (iso && deterministicTable[iso]) {
    const lang = deterministicTable[iso];
    return { lang, candidates: [lang], confidence: 'high' };
  }

  if (iso && ambiguousTable[iso]) {
    // Already ranked by estimated speaker population (highest first) —
    // see scripts/rank-ambiguous-candidates.ts. No manual override needed.
    const candidates = ambiguousTable[iso];
    return { lang: candidates[0]!, candidates, confidence: 'low' };
  }

  // A script we haven't mapped at all yet — an honest empty result rather
  // than a silent, possibly-wrong guess.
  return { lang: '', candidates: [], confidence: 'low' };
}