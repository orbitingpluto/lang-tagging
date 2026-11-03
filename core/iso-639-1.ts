/**
 * ISO 639-1 language codes (two-letter codes).
 *
 * Keep this list explicit: /^[a-z]{2}$/ only checks the shape of a code and
 * would incorrectly accept values such as "xx" or "zz".
 */
const ISO_639_1_CODES = new Set(`
  aa ab ae af ak am an ar as av ay az
  ba be bg bi bm bn bo br bs
  ca ce ch co cr cs cu cv cy
  da de dv dz
  ee el en eo es et eu
  fa ff fi fj fo fr fy
  ga gd gl gn gu gv
  ha he hi ho hr ht hu hy hz
  ia id ie ig ii ik io is it iu
  ja jv
  ka kg ki kj kk kl km kn ko kr ks ku kv kw ky
  la lb lg li ln lo lt lu lv
  mg mh mi mk ml mn mr ms mt my
  na nb nd ne ng nl nn no nr nv ny
  oc oj om or os
  pa pi pl ps pt
  qu
  rm rn ro ru rw
  sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw
  ta te tg th ti tk tl tn to tr ts tt tw ty
  ug uk ur uz
  ve vi vo
  wa wo
  xh
  yi yo
  za zh zu
`.trim().split(/\s+/));

/** Returns true only for a registered, lowercase ISO 639-1 code. */
export function isIso6391Code(value: string): boolean {
  return ISO_639_1_CODES.has(value);
}
