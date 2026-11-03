import { describe, it, expect } from "vitest";
import { isIso6391Code } from "../core/iso-639-1";

describe("isIso6391Code", () => {
  it.each([
    "ar",
    "en",
    "ga",
    "ja",
    "ko",
    "zh",
  ])("accepts current ISO 639-1 code %s", (code) => {
    expect(isIso6391Code(code)).toBe(true);
  });

  it.each([
    "xx",
    "zz",
    "sga",
    "eng",
    "bh",
    "sh",
    "EN",
    "a",
    "123",
    "",
  ])("rejects non-current ISO 639-1 code %s", (code) => {
    expect(isIso6391Code(code)).toBe(false);
  });
});