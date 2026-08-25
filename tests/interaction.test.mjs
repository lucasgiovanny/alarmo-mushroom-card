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
assert.ok(/REASON\.invalidCode/.test(onEvent),
  'a rejected code has to reach the card as an event, not be assumed');
assert.ok(/BUS_EVENTS\.success/.test(onEvent),
  'the sheet closes on the success event, not on a guess about timing');
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

/* And having said it there, it must not say it again on the card behind the
   sheet, where nobody is looking. */
const paintFn = sliceFunction('_paint');
assert.ok(/this\._flash && !this\._sheetOpen/.test(paintFn),
  'the card must not repeat a message the sheet is already showing in place');
ok('the message is said once, where it was typed');

/* ---- a message must not outlive what it was about ---- */

/* The flash carries its own four-second timer. A wrong code in the overlay
   followed by a right one closed the overlay and then showed "wrong code" on
   the card behind it for the rest of that timer — a complaint about a code
   that had just been accepted. */
const onEventFn = sliceFunction('_onAlarmoEvent');
assert.ok(/case BUS_EVENTS\.success:[\s\S]{0,300}?_clearFlash\(\)/.test(onEventFn),
  'an accepted code must take the previous complaint with it');
const closeSheet = sliceFunction('_closeSheet');
assert.ok(/_clearFlash\(\)/.test(closeSheet),
  'dismissing the overlay dismisses what it was saying');
const clearFlash = sliceFunction('_clearFlash');
assert.ok(/clearTimeout\(this\._flashTimer\)/.test(clearFlash),
  'the timer has to go too, or it fires later over whatever is on screen then');
assert.ok(/_codeError = false/.test(clearFlash),
  'and the shake state with it');
ok('a stale message cannot outlive the code it was about');

/* ---- how much the card is allowed to move ---- */

/* One control, three levels, because the question a person actually has is
   "how much movement do I want", not "which of six things may twitch". */
const codePaint = sliceFunction('_paintCode');
assert.ok(/animations === 'full'/.test(codePaint),
  'at full, a rejected code moves the whole panel — four small dots is a twitch '
  + 'you can miss');
assert.ok(/animations !== 'none'/.test(codePaint),
  'and at none, nothing shakes at all');
assert.match(source, /\.code-dots\.shake,\.code\.shake,\.sheet-panel\.shake\{animation:amc-shake/,
  'the panel and the dots must share the one shake');
ok('the wrong-code shake scales with the movement setting');

assert.match(source, /:host\(\[data-anim="full"\]\[data-state="triggered"\]\) ha-card\[data-outline\]\{\s*animation:amc-ring/,
  'the one loop worth having is a ring breathing while the alarm is going off');
assert.ok(!/animation:amc-ring[\s\S]{0,200}armed_/.test(source),
  'nothing that is not an alarm condition may loop: a card that always moves '
  + 'becomes wallpaper within a day, and then hides the day it matters');
ok('only a triggered alarm loops, and only when asked');

assert.match(source, /:host\(\[data-anim="none"\]\) \.shape\{animation:none !important\}/,
  'off must mean off, including the pulse the card ships with');
assert.match(source, /:host\(\[data-anim="none"\]\) \.ring \.arc\{transition:none\}/);
ok('none stops the movement the card ships with');

/* Whatever the setting says, the system preference still wins. */
assert.match(source, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.code-dots\.shake,\.code\.shake,\.sheet-panel\.shake\{animation:none\}/,
  'a reader who has asked their system for less motion gets it regardless');
ok('the system preference outranks the setting');

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

/* ---- the sheet summary, run for real ---- */

/* The method is lifted out of the bundle and called against a stub `this`, so
   these are its actual return values rather than a description of them. */
import { sliceBalanced, evaluate } from './_extract.mjs';

const I18N = evaluate(sliceBalanced('const I18N = Object.freeze(', '{', '}'));
const preamble = `
  const I18N = ${JSON.stringify(I18N)};
  const SUPPORTED_LANGS = ['en','pt-br','pt-pt','es','fr','de','it'];
  const DEFAULT_LANG = 'en';
  const LANGUAGE_ALIASES = new Map([['pt','pt-pt']]);
  /* Stood in rather than sliced: the real esc() holds /'/g and /"/g, and the
     slicer reads the quote inside a regex literal as the start of a string.
     Escaping is not what these assertions are about. */
  const esc = (v) => String(v == null ? '' : v);
`;
const summaryFn = new Function(preamble
  + sliceFunction('normalizeLanguageCode')
  + sliceFunction('getByPath')
  + sliceFunction('tLang')
  + sliceFunction('tCount')
  + sliceFunction('stateBlock')
  /* The slice starts at the newline before the method, so it is trimmed
     before the signature is rewritten into a plain function expression. */
  + 'return ' + sliceFunction('_sheetSummaryHtml').trimStart()
      .replace(/^_sheetSummaryHtml\s*\(\s*\)/, 'function ()')
)();

function summary(over) {
  const ctx = Object.assign({
    _config: { entity: 'alarm_control_panel.alarmo', states: {} },
    _sheetMode: 'armed_away',
    _modes: { armed_away: { exit_time: 60 }, armed_home: { exit_time: 0 } },
    _armOptions: { force: false, skip_delay: false },
    _lang: () => 'en',
    _t: (k, f) => summaryFn && tOf(k, f),
    _modeLabel: (s) => ({ armed_away: 'Away', armed_home: 'Home' })[s] || s,
    _nameText: () => 'Alarmo',
    _stateObj: () => ({ state: 'disarmed', attributes: { friendly_name: 'Alarmo' } }),
    _blockingSensors: () => []
  }, over);
  return summaryFn.call(ctx);
}
function tOf(key, fallback) {
  const parts = key.split('.');
  let cur = I18N.en;
  for (const p of parts) cur = cur ? cur[p] : undefined;
  return cur || fallback || key;
}

let out = summary({});
assert.match(out, /Arming Alarmo · Away/, 'the summary must name the alarm and the mode');
assert.match(out, /60 s to leave/, 'an exit delay is the thing most worth warning about');
ok('the summary names the alarm, the mode and the exit delay');

out = summary({ _armOptions: { force: false, skip_delay: true } });
assert.match(out, /No exit delay/, 'skipping the delay changes what happens after the last digit');
assert.doesNotMatch(out, /60 s/);
ok('the summary reflects the no-delay shortcut');

out = summary({ _sheetMode: 'armed_home' });
assert.match(out, /Arming Alarmo · Home/);
assert.doesNotMatch(out, /to leave/, 'a mode with no exit delay must not claim one');
ok('a mode without an exit delay says nothing about one');

out = summary({ _sheetMode: 'disarmed' });
assert.match(out, /Disarming Alarmo/);
assert.doesNotMatch(out, /to leave/, 'disarming has no exit delay to report');
ok('disarming reads as disarming');

out = summary({
  _armOptions: { force: true, skip_delay: false },
  _blockingSensors: () => ['a', 'b']
});
assert.match(out, /bypassing 2 sensors/,
  'the count is what is standing in the way right now, live');
ok('the summary counts the sensors actually in the way');

out = summary({ _modes: null });
assert.match(out, /Arming Alarmo · Away/,
  'an Alarmo too old to answer alarmo/areas must still get a summary');
assert.doesNotMatch(out, /to leave/);
ok('a missing area config costs the delay line, not the summary');

console.log('interaction.test.mjs sheet summary passed');
