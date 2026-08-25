import assert from 'node:assert/strict';
import { source, sliceFunction, ok } from './_extract.mjs';

const has = (re, msg) => assert.ok(re.test(source), msg);

/* ---- the #157 decoupling ---- */

const noticeHtml = sliceFunction('_noticeHtml');
const armOptions = sliceFunction('_armOptionsHtml');
const bypassAvailable = sliceFunction('_bypassAvailable');

assert.ok(!/bypass/i.test(noticeHtml),
  'the key must not be built inside the message panel: welding the two together '
  + 'is what made show_messages:false remove the only way to arm past an open '
  + 'door (nielsfaber/alarmo-card#157)');
assert.ok(!/show_messages/.test(armOptions) && !/show_messages/.test(bypassAvailable),
  'the key must not be gated on show_messages');
ok('the key is independent of show_messages');

/* The key and the delay shortcut both describe the next arm rather than
   performing one, so they read as one row of the same shape. */
assert.match(armOptions, /class="opt bypass"/,
  'the key takes the same chip shape as the shortcut beside it');
has(/\.opt\.bypass\{[^}]*rgba\(var\(--amc-rgb-warning\),0\.16\)/,
  'and keeps the warning colour: a neutral chip beside an amber panel reads as '
  + 'unrelated to it');
has(/\.opt\.bypass\[data-on\]\{/, 'turned, it has to look turned');
ok('the key is a chip in the warning colour');

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

const callArm = sliceFunction('_callArm');
assert.ok(/_armOptions/.test(callArm),
  'the key and the mode buttons must go through one call site, so what is sent '
  + 'is decided in one place');
ok('there is a single arm call site');

/* ---- a blocked mode is locked, and the key is the way past ---- */

const paint = sliceFunction('_paint');
assert.ok(/_modeBlocked\(mode\)/.test(paint),
  'the locked look must follow what is actually blocked right now');
assert.ok(/ready\.not_ready/.test(paint),
  'a locked button still has to say why');
has(/\.control\[disabled\],\.control\[aria-disabled="true"\]\{[^}]*pointer-events:none/,
  'locked means locked: a tap that only produces the failure it was warning '
  + 'about is not an affordance');
ok('a blocked mode is drawn locked');

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

/* ---- the way past a blocked sensor is a key, not a guess ---- */

/* The button used to have to name a mode to arm, which meant either waiting for
   a failed attempt to name one or guessing between several. Turning it arms
   nothing: it puts the blocked modes back on the row and you choose. Two
   deliberate taps in two different places, naming exactly what happens. */
const bypassFn = sliceFunction('_bypass');
assert.ok(/_armOptions\.force = !this\._armOptions\.force/.test(bypassFn),
  'the button must toggle the key rather than arm anything');
assert.ok(!/_callArm/.test(bypassFn), 'turning a key is not arming');
ok('the button unlocks instead of guessing a mode');

const avail = sliceFunction('_bypassAvailable');
assert.ok(/_anyBlocked\(\)/.test(avail),
  'the key is offered whenever something is locked, with no attempt needed');
assert.ok(/this\._unlocked\(\)/.test(avail),
  'and stays on screen while turned, so there is a way to put it back');
ok('the key is on screen whenever something is locked');

const unlocked = sliceFunction('_unlocked');
assert.ok(/_armOptions\.force/.test(unlocked), 'the key is the force option itself');
const modeBlocked = sliceFunction('_modeBlocked');
assert.ok(/this\._unlocked\(\) \) return false|_unlocked\(\)\) return false/.test(modeBlocked),
  'nothing is blocked once the key is turned — that is the whole point of it');
ok('turning the key puts every blocked mode back');

const rendered = sliceFunction('_renderedModes');
assert.ok(/blocked_modes !== 'hide'/.test(rendered),
  'a blocked mode is either taken off the row or drawn unavailable, by setting');
const offered = sliceFunction('_offeredModes');
assert.ok(!/_blockingSensorsFor/.test(offered),
  'the offered list is the input to working out what is blocked; narrowing it '
  + 'first would leave the card concluding that nothing blocks anything');
ok('what is offered and what is drawn are kept apart');

assert.match(source, /delete config\.confirm_bypass/,
  'the retired confirm step must load without erroring');
assert.ok(!/confirm_bypass', selector/.test(source),
  'and must not still be offered in the editor');
ok('the confirm step retired cleanly');

console.log('notice-panel.test.mjs passed');
