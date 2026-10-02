import unicode from 'unicode-properties';

export function segmentGraphemes(text: string): string[] {
  // split `text` into an array of grapheme cluster strings
  const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
  const segments = segmenter.segment(text);
  return Array.from(segments, (s) => s.segment);
}

export interface ScriptedGrapheme {
  text: string;
  script: string;
}

export function detectScripts(text: string): ScriptedGrapheme[] {
  // segment into graphemes, then for each one look up
  // the script of its first codepoint using unicode-properties
  
  let scriptedGraphemeArr: ScriptedGrapheme[] = [];

  const graphemes = segmentGraphemes(text);

  for (const grapheme of graphemes){
    // get first codepoint of each grapheme cluster (base character always comes first for letter + diacritic pairs)
    const firstCodePoint = grapheme.codePointAt(0)!;

    const script = unicode.getScript(firstCodePoint);

    const scriptedGrapheme: ScriptedGrapheme = {
        text:grapheme,
        script:script
    };
    scriptedGraphemeArr.push(scriptedGrapheme);
  }
  return scriptedGraphemeArr;
}

