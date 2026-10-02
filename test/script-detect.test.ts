import { describe, it, expect } from 'vitest';
import { detectScripts, segmentGraphemes } from '../core/script-detect';

describe('script detect sanity check', () => {
  it('segments text w several codepoints correctly into graphemes', () => {
    expect(segmentGraphemes("a👨‍👩‍👧‍👦b")).toEqual(["a", "👨‍👩‍👧‍👦", "b"]);
  });

  it('detect scripts correctly', () => {
    expect(detectScripts("aمb")).toEqual([{text: "a", script: "Latin"}, 
                                        {text: "م", script: "Arabic"}, 
                                        {text: "b", script: "Latin"}]);
  });

  it('classifies shared punctuation as Common script', () => {
    expect(detectScripts("،")[0]!.script).toBe('Common');
  });

});