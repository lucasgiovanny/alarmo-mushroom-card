import assert from 'node:assert/strict';
import { source, sliceFunction, ok } from './_extract.mjs';

/* ---- the code sheet has to outlive the answer it is waiting for ---- */

const submitSheet = sliceFunction('_submitSheet');
assert.ok(!/_sheetOpen = false/.test(submitSheet),
  'the sheet must not close on submit: doing so put the "wrong code" message on '
  + 'the card behind it, where the person who had just typed the code was not '
  + 'looking, and from the front it read as nothing having happened at all');
ok('submitting does not close the sheet');

const onEvent = sliceFunction('_onAlarmoEvent');
assert.ok(/_sheetOpen = false/.test(onEvent),
  'the sheet closes from the arm/disarm event, once the code is known good');
assert.ok(/invalid_code_provided/.test(onEvent) && /no_code_provided/.test(onEvent),
  'a rejected code has to reach the card as an event, not be assumed');
ok('the sheet closes only once the code is accepted');

/* Re-adding a class an element already carries does not restart its animation,
   so the second wrong code in a row sat perfectly still. */
const paintCode = sliceFunction('_paintCode');
assert.ok(/offsetWidth/.test(paintCode),
  'the shake must be rewound with a reflow so a repeated wrong code shakes again');
ok('a repeated wrong code shakes again');

assert.match(source, /@keyframes amc-shake/, 'the shake keyframes must exist');
assert.match(source, /id="sheet-hint"/, 'the sheet needs somewhere to show the error');
ok('the sheet can show the error itself');

/* ---- the sheet keypad is a keypad ---- */

const keys = sliceFunction('_keysHtml');
assert.match(keys, /'back', '0', 'submit'/,
  'the sheet takes the phone-keypad bottom row so confirm sits under the thumb '
  + 'on the right instead of hanging off a fifth row alone');
assert.match(keys, /'', '0', 'back'/,
  'inline has no confirm — pressing a mode button is what submits there');
ok('confirm sits bottom-right in the sheet, and only there');

assert.match(source, /\.sheet \.keypad\{[^}]*--amc-h:calc\(60px/,
  'sheet keys are sized for a thumb, not for a dense card');
assert.match(source, /\.sheet \.keypad \.control\{[^}]*background-color:rgba\(var\(--amc-rgb-text\),0\.08\)/,
  'at the card\'s own 5% tint the keys read as empty space with a number in it');
assert.match(source, /\.key-submit\{/, 'confirm is coloured apart from the digits');
ok('the sheet keys are sized and filled like a keypad');

/* ---- button_order means what the number says ---- */

const visibleModes = sliceFunction('_visibleModes');
assert.ok(/key: \(item\.order !== undefined && isFinite\(raw\)\) \? raw : index/.test(visibleModes),
  'a button without an order keeps its natural position. Sorting every ordered '
  + 'item ahead of every unordered one sent a lone button_order: 9 to the front, '
  + 'which is the exact opposite of what the number says');
ok('an unordered button keeps its place');

/* ---- what the mode buttons show is a choice, not a side effect ---- */

const actionsHtml = sliceFunction('_actionsHtml');
assert.match(actionsHtml, /content === 'icon'/, 'icon-only must be selectable outright');
assert.match(actionsHtml, /nameOnly/, 'name-only must be selectable outright');
assert.match(actionsHtml, /modes\.every\(function \(m\) \{ return !m\.label; \}\)/,
  'the upstream way of asking for icon-only — every label empty — still works');
ok('button_content offers icon, name, or both');

console.log('interaction.test.mjs passed');
