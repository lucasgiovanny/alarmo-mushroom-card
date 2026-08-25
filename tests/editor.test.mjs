import assert from 'node:assert/strict';
import { source, sliceFunction, ok } from './_extract.mjs';

/* Home Assistant's ha-form reads and writes a section's value through its
   `name`, and treats an empty name as "this section is flat"
   (src/components/ha-form/ha-form.ts):

     getValue = (obj, item) =>
       obj ? (!item.name || item.flatten ? obj : obj[item.name]) : undefined;

     const newValue = !schema.name || ("flatten" in schema && schema.flatten)
       ? changeEv.detail.value
       : { [schema.name]: changeEv.detail.value };

   A named `expandable` therefore hands the editor
   {keypad: {hide_keypad: true}} rather than {hide_keypad: true}. The flat
   lookup misses it, nothing is written, Home Assistant re-applies the previous
   config, and on screen the switch flips itself back. Every control inside a
   named section is affected, which is most of this editor.

   `flatten: true` is the newer way to say the same thing; an empty name works
   on every Home Assistant version, so that is what is asserted here. */

const containers = source.match(/type: '(?:expandable|grid)'/g) || [];
assert.ok(containers.length >= 5, 'expected the editor to still use form sections');

const flat = source.match(/name: '',\s*(?:\n\s*)?type: '(?:expandable|grid)'/g) || [];
assert.equal(flat.length, containers.length,
  `every expandable and grid must carry name: '' — ${containers.length - flat.length} `
  + 'section(s) would nest their values and swallow every control inside');
ok(`all ${containers.length} form sections are flat`);

assert.doesNotMatch(source, /name: '[^']+',\s*(?:\n\s*)?type: '(?:expandable|grid)'/,
  'a named section nests its data and its controls silently stop saving');
ok('no section carries a name');

/* With the name gone, ha-form-expandable falls back to schema.title for its
   heading, so a section without one renders as a blank strip. */
const schema = sliceFunction('_schema');
const expandables = (schema.match(/type: 'expandable'/g) || []).length;
const titles = (schema.match(/title: this\._t\(/g) || []).length;
assert.equal(titles, expandables,
  'an unnamed expandable shows schema.title as its heading, so each one needs a title');
ok('every unnamed section still has a heading');

const stateSections = sliceFunction('_stateSections');
assert.match(stateSections, /title: this\._t\('section_state'\)/,
  'the per-state sections need a heading too');
ok('the per-state sections are titled');

/* set hass fires on every state change in the house. Reassigning schema each
   time makes ha-form rebuild the form, which closes the open section and drops
   a half-typed field. */
const update = sliceFunction('_update');
assert.match(update, /_schemaSig/,
  'the schema must only be rebuilt when what it is made of has changed');
assert.match(update, /_dataSig/, 'the data must only be reassigned when it differs');
ok('the form is not rebuilt on every state change');

/* The keys the editor writes have to be the keys the card reads. */
const valueChanged = sliceFunction('_valueChanged');
assert.match(valueChanged, /SEP/, 'per-state keys travel flat and are re-nested on save');
assert.match(source, /const SEP = '__'/,
  'the flat key separator must not collide with the single underscores in state names');
ok('per-state keys round-trip through a safe separator');

console.log('editor.test.mjs passed');
