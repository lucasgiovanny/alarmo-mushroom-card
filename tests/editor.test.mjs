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

/* ---- the keypad section only offers what can do something ---- */

/* Four switches that all mention the keypad, three of which do nothing once
   the overlay is on, is a section nobody can read. A control with no meaning
   in the current context is absent rather than present-and-inert. */
const keypadSchema = new Function('MIN_SCALE', 'MAX_SCALE',
  'return function ' + sliceFunction('_keypadSchema').trimStart().slice('_keypadSchema'.length)
)(1, 2.5);
const names = (config, alarmoConfig) =>
  keypadSchema.call({ _config: config, _alarmoConfig: alarmoConfig })
    .map((f) => f.name);

assert.deepEqual(names({}, { code_format: 'number' }),
  ['use_code_dialog', 'hide_keypad', 'keep_keypad_visible', 'button_scale_keypad']);
ok('a numeric code in the card offers all four');

assert.deepEqual(names({ use_code_dialog: true }, { code_format: 'number' }),
  ['use_code_dialog', 'button_scale_keypad'],
  'an overlay replaces the in-card keypad, so nothing about the in-card one is '
  + 'left to decide — but its own keys still have a size');
ok('the overlay hides the settings it makes meaningless');

assert.deepEqual(names({ hide_keypad: true }, { code_format: 'number' }),
  ['use_code_dialog', 'hide_keypad', 'keep_keypad_visible'],
  'with no grid of digits there is nothing to size');
ok('hiding the keys hides their size');

assert.deepEqual(names({}, { code_format: 'text' }),
  ['use_code_dialog', 'keep_keypad_visible'],
  'a text code has no keys to hide and none to size');
ok('a text code drops both key settings');

/* ---- the open-sensor section, same treatment ---- */

const noticesSchema = new Function(
  'return function ' + sliceFunction('_noticesSchema').trimStart().slice('_noticesSchema'.length)
)();
const noticeNames = (config) => noticesSchema.call({ _config: config }).map((f) => f.name);

assert.deepEqual(noticeNames({ show_messages: true, show_bypass_button: true }),
  ['show_messages', 'max_sensor_chips', 'show_ready_notice', 'show_bypass_button',
   'confirm_bypass', 'show_bypassed_sensors'],
  'read top to bottom: what to show, how much, the all-clear, the action, its '
  + 'safety catch, the armed case');
ok('the open-sensor section reads in order');

assert.ok(!noticeNames({ show_messages: false, show_bypass_button: true })
  .includes('max_sensor_chips'), 'nothing is listed, so there is no length to cap');
assert.ok(!noticeNames({ show_messages: true, show_bypass_button: false })
  .includes('confirm_bypass'), 'no button, nothing to confirm');
assert.deepEqual(noticeNames({ show_messages: false, show_bypass_button: false }),
  ['show_messages', 'show_ready_notice', 'show_bypass_button', 'show_bypassed_sensors']);
ok('a setting that governs nothing is not offered');

/* The schema now depends on more than the entity and the language. */
assert.match(update, /use_code_dialog/,
  'the section has to be rebuilt when the setting that shapes it changes');
assert.match(update, /code_format/,
  'and when the answer about the code format finally arrives');
assert.match(update, /show_messages/,
  'and when the setting that shapes the open-sensor section changes');
ok('the section is rebuilt when what shapes it changes');

console.log('editor.test.mjs passed');
