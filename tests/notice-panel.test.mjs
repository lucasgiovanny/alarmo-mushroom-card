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

/* The panel used to exist only after an arm had failed, because open_sensors is
   only ever populated by a failure. So a door standing open said nothing until
   you tried, and the all-clear could only appear as the aftermath of a failure
   — which is a strange thing for "everything is fine" to be. It is a live
   answer now, computed from the sensor config and the current states. */
const noticeKind = sliceFunction('_noticeKind');
assert.ok(/_blockingSensors\(\)/.test(noticeKind),
  'blocked and ready must be decided from live state, not from a past failure');
assert.ok(/!this\._sensorCount/.test(noticeKind),
  'a house with nothing registered in Alarmo has nothing to report');
const blocks = sliceFunction('_blocksMode') + sliceFunction('_configuredSensors');
for (const field of ['allow_open', 'arm_on_close', 'auto_bypass', 'always_on', 'enabled']) {
  assert.ok(new RegExp(field).test(blocks),
    `${field} changes whether a sensor is in the way, so it has to be read`);
}
ok('what blocks arming is computed live from the sensor config');

/* The panel and the per-button dots have to answer from the same place. Taking
   readiness from Alarmo's mode list while the panel worked it out from the
   sensors let the two disagree on screen: a green "ready to be armed" sitting
   over a button wearing an amber dot. */
const modeReady = sliceFunction('_modeReady');
assert.ok(/_blockingSensorsFor\(mode\.key\)/.test(modeReady),
  'the dots must read the same live computation the panel does');
ok('the dots and the panel cannot disagree');

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

/* ---- a lone headline sits in the middle of its bar ---- */

/* With nothing under it, the headline is the whole panel. Tucked into the left
   of a full-width bar with a hand's width of nothing beside it, it reads as a
   layout that went wrong rather than as a status. */
has(/\.notice\[data-headline\] \.notice-head\{justify-content:center/,
  'a panel with no chips must centre its headline');
has(/\.notice\[data-headline\] \.notice-title\{flex:0 1 auto;text-align:center\}/,
  'the title must stop filling the row, or centring the row moves nothing');
assert.match(noticeHtml, /shown\.length && this\._config\.show_messages \? '' : ' data-headline'/,
  'quiet hides the chips with CSS rather than dropping them, so it leaves the '
  + 'same lone headline over the same empty bar and has to be centred too');
assert.match(noticeHtml, /shown\.length \? '<div class="notice-chips">/,
  'an empty chip row must not be drawn at all');
ok('a headline with nothing under it is centred');

/* ---- a sensor is named by its room, not only by itself ---- */

/* "Window" names nothing in a house with four of them. The area does. It comes
   from Home Assistant's own registries rather than from Alarmo, whose `area` is
   its own grouping of panels and not the room the sensor is in. */
const areaFn = new Function(
  'return function ' + sliceFunction('_areaNameFor').trimStart().slice('_areaNameFor'.length)
)();
const hass = {
  areas: { living: { area_id: 'living', name: 'Living room' },
           hall: { area_id: 'hall', name: 'Hallway' } },
  entities: {
    'binary_sensor.a': { entity_id: 'binary_sensor.a', area_id: 'living' },
    'binary_sensor.b': { entity_id: 'binary_sensor.b', device_id: 'd1' },
    'binary_sensor.c': { entity_id: 'binary_sensor.c' }
  },
  devices: { d1: { id: 'd1', area_id: 'hall' } }
};
assert.equal(areaFn.call({ _hass: hass }, 'binary_sensor.a'), 'Living room');
assert.equal(areaFn.call({ _hass: hass }, 'binary_sensor.b'), 'Hallway',
  "a sensor with no area of its own falls back to its device's, as Home Assistant does");
assert.equal(areaFn.call({ _hass: hass }, 'binary_sensor.c'), null,
  'an unplaced sensor gets no second line rather than an empty one');
assert.equal(areaFn.call({ _hass: {} }, 'binary_sensor.a'), null,
  'a Home Assistant too old to publish the registries must not throw');
ok('the area comes from the entity, then its device, then nothing');

assert.match(noticeHtml, /s\.area \? '<span class="chip-area">/,
  'the second line is only drawn when there is a room to name');
has(/\.chip \.chip-area\{/, 'the area line needs its own quieter treatment');
has(/\.chip\{[^}]*min-height:var\(--amc-chip-height\)/,
  'a fixed chip height would clip the line that says which window it is');
ok('the chip carries the room under the name');

/* ---- the bypass button has to be reachable ---- */

/* It used to require a failed arm to have already happened, because only the
   failure named a mode to retry. So the button almost never appeared, and the
   setting that governs it looked broken. A tap on a blocked mode names the
   target then and there, without waiting for the round trip. */
const handleMode = sliceFunction('_handleMode');
assert.ok(/_blockingSensorsFor\(key\)\.length/.test(handleMode),
  'tapping a blocked mode must name the retry target immediately');
assert.ok(/this\._pending = \{ mode: key/.test(handleMode),
  'the target is set locally, not awaited from the backend');
ok('tapping a blocked mode makes the bypass button appear at once');

const bypassMode = sliceFunction('_bypassMode');
assert.ok(/arms\.length === 1/.test(bypassMode),
  'a single arm mode on offer is unambiguous with no attempt behind it');
const bypassAvail = sliceFunction('_bypassAvailable');
assert.ok(/show_bypass_button/.test(bypassAvail),
  'the setting still governs the button');
assert.ok(/kind === 'ready' && !\(this\._pending/.test(bypassAvail),
  'an all-clear with nothing attempted needs no action: the mode buttons are '
  + 'right there and nothing is in the way');
ok('the button appears when it has something unambiguous to do');

console.log('notice-panel.test.mjs passed');
