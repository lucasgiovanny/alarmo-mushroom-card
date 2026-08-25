import assert from 'node:assert/strict';
import { source, sliceFunction, ok } from './_extract.mjs';

const has = (re, msg) => assert.ok(re.test(source), msg);

/* ---- the #157 decoupling ---- */

const noticeHtml = sliceFunction('_noticeHtml');
const noticeActions = sliceFunction('_noticeActionsHtml');
const bypassAvailable = sliceFunction('_bypassAvailable');

assert.ok(!/bypass/i.test(noticeHtml),
  'the bypass action must not be built inside the message panel: welding the two '
  + 'together is what made show_messages:false remove the only way to arm past an '
  + 'open door (nielsfaber/alarmo-card#157)');
assert.ok(!/show_messages/.test(noticeActions) && !/show_messages/.test(bypassAvailable),
  'the bypass action must not be gated on show_messages');
ok('the bypass action is independent of show_messages');

has(/\.notice\[data-quiet\] \.notice-chips\{display:none\}/,
  'show_messages:false must hide the sensor list and nothing else');
has(/show_bypass_button/, 'the bypass button needs a setting of its own');
ok('show_messages hides the list; the button has its own switch');

/* ---- live sensor state ---- */

const noticeSensors = sliceFunction('_noticeSensors');
assert.ok(/this\._hass\.states\[id\]/.test(noticeSensors),
  'each sensor row must read the live state, never the snapshot frozen inside '
  + 'open_sensors at the moment the arm failed');
assert.ok(/friendly_name/.test(noticeSensors), 'a sensor should be named, not shown as an id');
ok('chips read live sensor state');

const trackedChanged = sliceFunction('_trackedChanged');
assert.ok(/_sensorIds/.test(trackedChanged),
  'the open sensors must be tracked in set hass, or closing a door changes '
  + 'nothing on screen until the next Alarmo event');
ok('closing a sensor repaints the panel');

has(/\.chip\.is-clear\{/, 'a sensor that closes must be able to show as cleared');
has(/\.chip\.is-missing\{/,
  'a sensor named in open_sensors but gone from hass.states must render greyed '
  + 'rather than reading attributes off undefined');
ok('cleared and missing sensors have their own treatment');

/* ---- overflow ---- */

has(/\.notice-chips\{[^}]*overflow-x:auto/, 'the chip row must scroll rather than grow the card');
has(/max_sensor_chips/, 'the visible chip count must be bounded');
has(/id="notice-count"/,
  'the total must survive the chips scrolling out of view, or "3 of 7" reads as "3"');
ok('the chip row is bounded and always reports the true total');

/* ---- one force-arm path ---- */

const bypass = sliceFunction('_bypass');
assert.ok(!/_pending = null/.test(bypass),
  'the retry target must outlive the tap: upstream cleared it here, so a second '
  + 'failure left the button a no-op until a fresh event happened to arrive');
assert.ok(/force: true/.test(bypass) && /force: false/.test(bypass),
  'a retry after everything closed must arm plainly, not force');
ok('the bypass path keeps its target and stops forcing once all is clear');

const callArm = sliceFunction('_callArm');
assert.ok(/_armOptions/.test(callArm),
  'the pre-emptive toggles and the reactive bypass must go through one call site');
ok('there is a single arm call site');

/* ---- the not-ready button warns without barring the way ---- */

const paint = sliceFunction('_paint');
assert.ok(/_setAttr\(selector, 'aria-disabled', null\)/.test(paint),
  'the readiness dot warns; it must not block the tap. Blocking it left no route '
  + 'to arming past a sensor once the pre-emptive bypass chip was removed: the '
  + 'button could not be tapped, so the arm could not fail, so the bypass button '
  + 'never appeared');
assert.ok(/ready\.not_ready/.test(paint),
  'a not-ready button still has to say why it is marked');
ok('a not-ready button warns but still arms');

/* ---- one bypass, not two ---- */

const armOptions = sliceFunction('_armOptionsHtml');
assert.ok(!/force/.test(armOptions),
  'the pre-emptive bypass chip was the same intent as the bypass button, one '
  + 'moment earlier and with less to say — two switches for one idea');
assert.ok(/skip_delay/.test(armOptions), 'the delay shortcut has no reactive twin and stays');
assert.ok(!/show_force_option: true/.test(source),
  'the option that governed the chip must not linger as a default');
assert.match(source, /delete config\.show_force_option/,
  'an existing config naming it must be accepted, not made an error');
ok('bypassing has one switch and one moment');

/* ---- render-model guards ---- */

const onClick = sliceFunction('_onClick');
assert.ok(/composedPath/.test(onClick),
  'a tap landing on the ha-icon inside a button reports that shadow content as '
  + 'the target, and closest() from there never crosses back out');
ok('clicks are resolved through composedPath');

const resetRing = sliceFunction('_resetRing');
assert.ok(/offsetWidth/.test(resetRing),
  'moving the deadline without flushing a reflow animates the arc backwards '
  + 'through zero');
ok('the countdown ring cannot animate backwards');

/* font:inherit resets font-size, and the em-based control icon size is
   measured against it. */
const control = /\.control\{([\s\S]*?)\n    \}/.exec(source);
assert.ok(control, 'could not find the .control rule');
const body = control[1].replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(body.indexOf('font:inherit') < body.indexOf('font-size:'),
  'font-size must be reapplied after the font shorthand or every control icon '
  + 'collapses to the document body size');
ok('the font shorthand does not eat the icon size');

console.log('notice-panel.test.mjs passed');
