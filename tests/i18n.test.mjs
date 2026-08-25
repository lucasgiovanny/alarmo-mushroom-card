import assert from 'node:assert/strict';
import { source, sliceBalanced, evaluate, flatten, ok } from './_extract.mjs';

const I18N = evaluate(sliceBalanced('const I18N = Object.freeze(', '{', '}'));
const langs = Object.keys(I18N);

assert.deepEqual(
  langs.sort(),
  ['de', 'en', 'es', 'fr', 'it', 'pt-br', 'pt-pt'].sort(),
  'the shipped language set changed without the tests being updated'
);
ok('ships the expected languages');

/* A missing key does not throw at runtime — tLang falls through to English —
   so an untranslated string ships silently unless parity is asserted here. */
const reference = flatten(I18N.en).sort();
for (const lang of langs) {
  assert.deepEqual(flatten(I18N[lang]).sort(), reference,
    `${lang} is not in key parity with en`);
}
ok('every bundle is in key parity with en');

const SUPPORTED = evaluate(sliceBalanced('const SUPPORTED_LANGS =', '[', ']'));
assert.deepEqual(SUPPORTED.slice().sort(), langs.slice().sort(),
  'SUPPORTED_LANGS and the I18N bundles disagree');
ok('SUPPORTED_LANGS matches the bundles');

/* Brazilian and European Portuguese must stay apart: they are the two the
   user actually reads, and collapsing either into a bare "pt" hands one of
   them the other's wording. */
assert.match(source, /LANGUAGE_ALIASES = new Map\(\[\['pt', 'pt-pt'\]\]\)/,
  'a bare pt profile must resolve to European Portuguese');
assert.notEqual(I18N['pt-br'].state.arming, I18N['pt-pt'].state.arming,
  'pt-BR and pt-PT bundles are not actually distinct');
ok('pt-BR and pt-PT stay distinct');

for (const state of evaluate(sliceBalanced('const STATE_KEYS = Object.freeze(', '[', ']'))) {
  assert.ok(I18N.en.state[state], `no state label for ${state}`);
}
ok('every configurable state has a label');

const options = evaluate(sliceBalanced('const LANGUAGE_OPTIONS = Object.freeze(', '[', ']'));
for (const option of options) {
  const key = option.labelKey.split('.').slice(1).join('.');
  assert.ok(I18N.en.editor[key], `language option ${option.value} has no label key`);
}
ok('every language option resolves to a label');

console.log('i18n.test.mjs passed');
