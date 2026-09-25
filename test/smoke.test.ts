import { describe, it, expect } from 'vitest';
import unicodeProps from 'unicode-properties';

describe('environment sanity check', () => {
  it('detects Arabic script correctly', () => {
    expect(unicodeProps.getScript(0x0627)).toBe('Arabic');
  });
  it('detects Latin script correctly', () => {
    expect(unicodeProps.getScript(0x0041)).toBe('Latin');
  });
});