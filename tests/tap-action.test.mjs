import assert from 'node:assert/strict';
import { source, sliceBalanced, sliceFunction, evaluate, ok } from './_extract.mjs';

const PENDING_STATES =
  evaluate(sliceBalanced('const PENDING_STATES = Object.freeze(', '[', ']'));

function asFunction(name) {
  const src = sliceFunction(name).trimStart();
  return new Function('PENDING_STATES',
    'return function ' + src.slice(src.indexOf('(')))(PENDING_STATES);
}

const tapAction = asFunction('_tapAction');
const tapMode = asFunction('_tapMode');
const tappable = asFunction('_headerTappable');

/* Opening the more-info dialog is easy to hit by accident on the one card you
   least want to fumble, and shows nothing the card is not already showing. */
assert.equal(tapAction.call({ _config: {} }), 'none',
  'a tap on the card must do nothing unless asked to do something');
assert.equal(tapAction.call({ _config: { use_code_dialog: true } }), 'code',
  'a house that asks for its code in a sheet should get the sheet from a tap');
assert.equal(tapAction.call({ _config: { use_code_dialog: true, tap_action: 'none' } }), 'none',
  'an explicit choice beats the default');
assert.equal(tapAction.call({ _config: { tap_action: 'more-info' } }), 'more-info',
  'more-info stays available for anyone who wants it');
ok('a tap does nothing by default, and opens the sheet where a code is asked for');

/* Disarming is the only unambiguous action while armed; while disarmed it is
   unambiguous only when a single arm mode is on offer. */
const ctx = (state, arms) => ({
  _stateObj: () => ({ state }),
  _visibleModes: () => arms.map((k) => ({ key: k, arms: k !== 'disarmed' }))
});
assert.equal(tapMode.call(ctx('armed_away', ['disarmed'])), 'disarmed');
assert.equal(tapMode.call(ctx('triggered', ['disarmed'])), 'disarmed');
assert.equal(tapMode.call(ctx('disarmed', ['armed_away', 'armed_home'])), null,
  'two arm modes give a tap nothing to mean');
assert.equal(tapMode.call(ctx('disarmed', ['armed_away'])), 'armed_away',
  'one arm mode is unambiguous');
assert.equal(tapMode.call({ _stateObj: () => null }), null);
ok('a tap only stands for an action that is unambiguous');

/* A header that looks pressable and is not is worse than one that plainly is
   not, so the class and the role follow what the tap will actually do. */
const head = (over) => Object.assign({
  _config: {}, _stateObj: () => ({ state: 'armed_away' }),
  _tapAction: tapAction, _tapMode: tapMode,
  _visibleModes: () => [{ key: 'disarmed', arms: false }],
  _codeRequired: () => true, _deadline: 0
}, over);
assert.equal(tappable.call(head({})), false, 'the default tap does nothing, so it must not invite one');
assert.equal(tappable.call(head({ _config: { use_code_dialog: true } })), true);
assert.equal(tappable.call(head({ _config: { use_code_dialog: true }, _codeRequired: () => false })),
  false, 'a sheet that asks for a code nobody needs is a dead end');
assert.equal(tappable.call(head({ _stateObj: () => ({ state: 'arming' }) })), true,
  'the countdown ring keeps its own job — it visibly invites the tap that skips the delay');
ok('the header only looks pressable when a tap does something');

assert.match(source, /\.header \.state-item\.is-tappable\{cursor:pointer\}/,
  'the pointer cursor has to follow the class, not the element');
assert.ok(!/\.header \.state-item\{[^}]*cursor:pointer/.test(source),
  'the header must not be pointer-cursored unconditionally');
ok('the cursor follows what the tap does');

/* The skip-delay path has to survive ahead of the tap action, or the ring
   stops working the moment the tap is set to do nothing. */
const onClick = sliceFunction('_onClick');
const skipAt = onClick.indexOf('_skipDelay');
const actionAt = onClick.indexOf('_tapAction');
assert.ok(skipAt > -1 && actionAt > -1 && skipAt < actionAt,
  'skipping the delay is checked before the tap action, so the ring keeps working');
ok('the countdown ring is unaffected by the tap action');

console.log('tap-action.test.mjs passed');
