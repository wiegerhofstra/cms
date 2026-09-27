import assert from "node:assert/strict";
import { test } from "node:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { toRichText, plainText } from "./html.mjs";

const schema = getSchema([StarterKit, TableKit]);
test("HTML import preserves tables, currency, headings, links, emphasis and ordered lists", () => {
  const document = toRichText('<h4>Tarieven &amp; voorwaarden</h4><p>Een <strong>goed</strong> <a href="/afspraak">plan</a>.</p><table><tr><th>Naam</th><th>Prijs</th></tr><tr><td colspan="1">Behandeling</td><td>&euro; 53,00</td></tr></table><ol start="3"><li>Eerste<br>regel</li><li><p>Tweede</p><ul><li>Subitem</li></ul></li></ol>');
  schema.nodeFromJSON(document).check();
  assert.equal(document.content[0].attrs.level, 4);
  assert.equal(document.content[2].type, "table");
  assert.equal(document.content[2].content[1].content[1].content[0].content[0].text, "€ 53,00");
  assert.equal(document.content[3].attrs.start, 3);
  assert.match(plainText(document), /Een goed plan\./);
  assert.equal(document.content[1].content.find((n) => n.text === "plan").marks[0].attrs.href, "/afspraak");
});

test("plain biographies preserve paragraphs, line breaks and literal punctuation", () => {
  const document = toRichText("First line\r\nNext line\r\n\r\nSecond paragraph < 3 & happy");
  schema.nodeFromJSON(document).check();
  assert.equal(document.content.length, 2);
  assert.equal(document.content[0].content[1].type, "hardBreak");
  assert.match(plainText(document), /< 3 & happy/);
  schema.nodeFromJSON(toRichText(null)).check();
});

test("unsupported embeds and unsafe links abort instead of being silently lost", () => {
  assert.throws(() => toRichText('<p>Keep</p><img src="photo.jpg">'), /Unsupported HTML element/);
  assert.throws(() => toRichText('<a href="javascript:alert(1)">Unsafe</a>'), /Unsupported link protocol/);
});
