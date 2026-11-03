import { parseFragment, serialize } from "parse5";

const html = '<p class="intro">Say <em>hello</em> &amp; नमस्ते</p>';

const ogResult = parseFragment(html);
const serializeResult = serialize(ogResult);

console.log(ogResult);
console.log(serializeResult);

