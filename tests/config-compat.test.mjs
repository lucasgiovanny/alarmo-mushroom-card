import assert from 'node:assert/strict';
import { source, sliceBalanced, evaluate, sandbox, ok } from './_extract.mjs';

const DEFAULTS = evaluate(sliceBalanced('const DEFAULTS = Object.freeze(', '{', '}'));
const STATE_KEYS = evaluate(sliceBalanced('const STATE_KEYS = Object.freeze(', '[', ']'));
const TRANSIENT = evaluate(sliceBalanced('const TRANSIENT_STATES = Object.freeze(', '[', ']'));
const HIDE_MODES = evaluate(sliceBalanced('const HIDE_MODES = Object.freeze(', '[', ']'));

const preamble = `
  const DEFAULTS = ${JSON.stringify(DEFAULTS)};
  const STATE_KEYS = ${JSON.stringify(STATE_KEYS)};
  const TRANSIENT_STATES = ${JSON.stringify(TRANSIENT)};
  const HIDE_MODES = ${JSON.stringify(HIDE_MODES)};
  const MIN_SCALE = 1, MAX_SCALE = 2.5;
  const DEFAULT_LANG = 'en';
  const tLang = (l, k) => k;
`;
const { normalizeConfig, normalizeHide, isButtonVisible } =
  sandbox(preamble, ['clamp', 'normalizeHide', 'isButtonVisible', 'normalizeConfig']);

const base = { entity: 'alarm_control_panel.alarmo' };

/* --- the upstream surface still has to normalize --- */

assert.throws(() => normalizeConfig({}), 'a config without an entity must fail loudly');
assert.throws(() => normalizeConfig({ entity: 'light.kitchen' }),
  'a non-alarm entity must fail loudly rather than render an empty card');
ok('rejects a missing or wrong-domain entity');

/* Upstream seeded both scales from one legacy key. Dropping that migration
   would silently reset every pre-existing card to scale 1. */
let cfg = normalizeConfig({ ...base, button_scale: 1.5 });
assert.equal(cfg.button_scale_actions, 1.5);
assert.equal(cfg.button_scale_keypad, 1.5);
assert.equal(cfg.button_scale, undefined, 'the legacy key must not survive normalization');
ok('legacy button_scale seeds both scales and then disappears');

cfg = normalizeConfig({ ...base, button_scale: 1.5, button_scale_keypad: 2 });
assert.equal(cfg.button_scale_keypad, 2, 'an explicit scale must beat the legacy one');
assert.equal(cfg.button_scale_actions, 1.5);
ok('an explicit scale wins over the legacy key');

assert.equal(normalizeConfig({ ...base, button_scale_actions: 9 }).button_scale_actions, 2.5);
assert.equal(normalizeConfig({ ...base, button_scale_actions: 0.2 }).button_scale_actions, 1);
ok('scales are clamped to the upstream 1 to 2.5 range');

/* --- hide: the values stay byte-identical to upstream --- */

assert.equal(normalizeHide(true), 'always');
assert.equal(normalizeHide(false), 'never');
assert.equal(normalizeHide(undefined), 'never');
assert.equal(normalizeHide('nonsense'), 'never');
for (const mode of HIDE_MODES) assert.equal(normalizeHide(mode), mode);
ok('hide accepts booleans and the four upstream strings');

/* Read out of upstream's alarmo-actions-bar calcButtonVisible: the stored
   value names WHEN THE BUTTON IS HIDDEN. 'armed' hides it while armed, which
   is to say it shows only while disarmed. Getting this backwards inverts every
   migrated dashboard, so it is pinned here. */
assert.equal(isButtonVisible('always', true), false);
assert.equal(isButtonVisible('always', false), false);
assert.equal(isButtonVisible('never', true), true);
assert.equal(isButtonVisible('armed', true), true, "'armed' hides while armed");
assert.equal(isButtonVisible('armed', false), false);
assert.equal(isButtonVisible('disarmed', true), false, "'disarmed' hides while disarmed");
assert.equal(isButtonVisible('disarmed', false), true);
ok('hide semantics match upstream');

cfg = normalizeConfig({ ...base, states: { armed_home: { hide: true } } });
assert.equal(cfg.states.armed_home.hide, 'always');
ok('a boolean hide in existing YAML still applies');

/* --- typos are loud, not silent --- */

assert.throws(() => normalizeConfig({ ...base, states: { armed_hom: {} } }),
  'an unknown state key must be reported, not silently ignored');
ok('an unknown state key is rejected');

/* --- transient states carry labels and colours only --- */

cfg = normalizeConfig({
  ...base,
  states: { triggered: { state_label: 'Intruso', color: 'red', button_label: 'x' } }
});
assert.equal(cfg.states.triggered.state_label, 'Intruso');
assert.equal(cfg.states.triggered.color, 'red');
assert.equal(cfg.states.triggered.button_label, undefined,
  'a transient state has no button, so it must not keep a button label');
ok('transient states keep labels and colours but no button fields');

/* --- a real upstream config must survive untouched --- */

const upstream = {
  type: 'custom:alarmo-card',
  entity: 'alarm_control_panel.alarmo',
  name: 'Casa',
  button_scale: 1.2,
  hide_keypad: true,
  show_messages: false,
  states: {
    disarmed: { button_label: 'Desligar', hide: 'disarmed' },
    armed_away: { button_label: 'Fora', color: '#f44336', button_order: 1 },
    armed_home: { hide: false, button_order: 2 }
  }
};
cfg = normalizeConfig(upstream);
assert.equal(cfg.name, 'Casa');
assert.equal(cfg.hide_keypad, true);
assert.equal(cfg.show_messages, false);
assert.equal(cfg.button_scale_actions, 1.2);
assert.equal(cfg.states.disarmed.hide, 'disarmed');
assert.equal(cfg.states.armed_away.color, '#f44336');
assert.equal(cfg.states.armed_home.hide, 'never');
assert.equal(cfg.states.armed_away.button_order, 1);
ok('a real upstream config normalizes without loss');

/* --- the added options must all default to the old behaviour --- */

for (const [key, value] of Object.entries({
  layout: 'default', fill_container: false, icon_type: 'icon',
  show_bypass_button: true, confirm_bypass: true,
  show_force_option: true, show_skip_delay_option: true,
  button_content: 'icon_and_name', language: 'auto'
})) {
  assert.equal(DEFAULTS[key], value, `${key} must default to ${value}`);
}
ok('every added option defaults to the pre-existing behaviour');

/* show_arm_options switched both shortcuts at once in 0.1.0 and 0.1.1. It is
   migrated rather than kept, so a config written against it keeps behaving the
   same without the card carrying two ways to say one thing. */
cfg = normalizeConfig({ ...base, show_arm_options: false });
assert.equal(cfg.show_force_option, false);
assert.equal(cfg.show_skip_delay_option, false);
assert.equal(cfg.show_arm_options, undefined, 'the superseded key must not survive');
cfg = normalizeConfig({ ...base, show_arm_options: false, show_skip_delay_option: true });
assert.equal(cfg.show_skip_delay_option, true, 'an explicit new key beats the old one');
assert.equal(cfg.show_force_option, false);
ok('show_arm_options migrates into the two independent switches');

assert.equal(normalizeConfig({ ...base, button_content: 'nonsense' }).button_content,
  'icon_and_name', 'an unknown button_content falls back rather than drawing nothing');
ok('button_content is validated');

console.log('config-compat.test.mjs passed');
