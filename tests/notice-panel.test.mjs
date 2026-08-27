import assert from 'node:assert/strict';
import { source, sliceBalanced, sliceFunction, evaluate, ok } from './_extract.mjs';

const has = (re, msg) => assert.ok(re.test(source), msg);

/* ---- the #157 decoupling ---- */

const noticeHtml = sliceFunction('_noticeHtml');
const sensorChips = sliceFunction('_sensorChipsHtml');
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
/* Both set aside something the alarm would otherwise insist on, so they share
   one colour and one way of looking turned. */
assert.ok(!/\.opt\.bypass\{/.test(source),
  'the key must not carry a colour of its own');
has(/\.opt\[data-on\]\{[^}]*rgba\(var\(--amc-rgb-warning\),0\.2\)/,
  'turned is the warning colour, for both chips alike');
has(/\.opt\[data-on\]\{[^}]*box-shadow:inset 0 0 0 1px/,
  'and carries a ring, so turned reads as turned rather than merely tinted');
ok('the two chips share one shape, one colour and one selected state');

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

has(/\.notice-chips\{[^}]*overflow-x:auto/,
  'the chip row must scroll rather than grow the card, and scrolling is what '
  + 'replaced capping the list: a cap put sensors behind a number that had to '
  + 'be tapped before it would say which ones they were');
assert.ok(!/max_sensor_chips: \d/.test(source), 'the cap must not linger as a default');
assert.match(source, /delete config\.max_sensor_chips/,
  'a config still naming the cap must load without erroring');
has(/id="notice-count"/,
  'the total must survive the chips scrolling out of view, or "3 of 7" reads as "3"');
assert.match(source, /show_sensor_count/, 'and showing it at all is a choice');
ok('the chip row scrolls, and the total is optional');

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

assert.match(sensorChips, /s\.area \? '<span class="chip-area">/,
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

/* ---- a headline that introduces its list, or stands alone ---- */

/* A title ending in a colon with nothing after it — which is exactly what
   show_messages:false leaves behind — reads as a sentence that got cut off. */
const paintNotice = sliceFunction('_paintNotice');
const noticeTitle = sliceFunction('_noticeTitle');
assert.match(paintNotice,
  /this\._noticeTitle\(sensors\.length > 0 && this\._config\.show_messages\)/,
  'on the card the headline has to know whether anything follows it');
for (const kind of ['blocked', 'triggered', 'bypassed']) {
  /* Plain string matching: the escaping needed to build these as regexes is
     more likely to be wrong than the thing being checked. */
  assert.ok(noticeTitle.includes(
    `${kind}: listed ? 'notice.${kind}_title_list'`),
    `${kind} needs both forms`);
}
assert.ok(!/ready: listed/.test(noticeTitle),
  'the all-clear introduces nothing, so it has only the one form');
ok('each headline has a form that introduces its list and one that does not');

/* In the overlay the list is the whole screen, so the introducing form is
   always the right one — there is never nothing under it. */
assert.match(sliceFunction('_paintSensorSheet'), /this\._noticeTitle\(true\)/,
  'the overlay always has a list under its headline');
ok('the overlay headline always introduces its list');

const I18N = evaluate(sliceBalanced('const I18N = Object.freeze(', '{', '}'));
for (const lang of Object.keys(I18N)) {
  const n = I18N[lang].notice;
  for (const kind of ['blocked', 'triggered', 'bypassed']) {
    assert.ok(n[kind + '_title_list'].endsWith(':'),
      `${lang}: the introducing form has to read as one, not just be longer`);
    assert.ok(!n[kind + '_title'].endsWith(':'),
      `${lang}: the standing-alone form must not trail a colon into nothing`);
  }
}
ok('the introducing form ends in a colon and the standalone one does not');

/* ---- the list the panel could not spare room for ---- */

/* show_messages:false leaves a headline naming a number of sensors and no way
   to find out which. The count was the whole complaint about max_sensor_chips
   in 0.1.12; hiding the list outright had left the same hole behind it. */
const tappable = new Function(
  'return function ' + sliceFunction('_sensorsTappable').trimStart().slice('_sensorsTappable'.length)
)();
const stand = (config, sensors, visible = true) => tappable.call({
  _config: config,
  _noticeVisible: () => visible,
  _noticeSensors: () => sensors
});

const two = [{ id: 'binary_sensor.a' }, { id: 'binary_sensor.b' }];
assert.equal(stand({ show_messages: false, show_sensors_on_tap: true }, two), true,
  'the list is off and sensors are what the headline is about');
assert.equal(stand({ show_messages: true, show_sensors_on_tap: true }, two), false,
  'with the list on screen there is nothing left behind a tap');
assert.equal(stand({ show_messages: false, show_sensors_on_tap: false }, two), false,
  'the setting has to be able to switch it off');
assert.equal(stand({ show_messages: false, show_sensors_on_tap: true }, []), false,
  'a green all-clear names nobody, so a tap would open an empty list');
assert.equal(stand({ show_messages: false, show_sensors_on_tap: true }, two, false), false,
  'a panel that is not drawn cannot be tapped');
ok('the tap is offered exactly where the names are otherwise unreachable');

/* Both lists are built by the same function, so a chip cannot say one thing on
   the card and another in the overlay. */
const sheetHtml = sliceFunction('_sensorSheetHtml');
assert.match(sheetHtml, /_sensorChipsHtml\('sheet-chip-'\)/,
  'the overlay lists the same chips the card would have');
assert.match(noticeHtml, /_sensorChipsHtml\('chip-'\)/,
  'and the card builds its row from the same place');
assert.match(sensorChips, /id="' \+ prefix \+ i \+ '"/,
  'the two sets need ids of their own, or repainting one patches the other');
ok('one builder feeds the row and the overlay alike');

/* A door closing while the overlay is up has to reach it, exactly as it
   reaches the row on the card. */
assert.match(sliceFunction('_paintSensorSheet'), /#sheet-chip-icon-/,
  'the overlay icons swap open for closed in place, like the ones on the card');
ok('the overlay follows the sensors while it is open');

/* The overlay is the card's own, not more-info: more-info answers about one
   entity and the question here is which of them. */
assert.match(sheetHtml, /class="sheet-panel sheet-sensors"/,
  'the overlay reuses the sheet the code prompt already established');
has(/\.sensor-list\{[^}]*flex-direction:column/,
  'on a screen of its own the sensors read as a column, not as a row that scrolls '
  + 'sideways to hide the names it exists to show');
has(/\.sensor-list\{[^}]*max-height:min\(/,
  'a house with twenty open sensors still gets an overlay that fits the screen');
/* The code sheet's title is a two-word prompt for the thing under the thumb.
   This one is a sentence introducing a list, and at that size and centred it
   wrapped onto a second line that hung there mid-air. */
has(/\.sheet-sensors \.sheet-title\{[^}]*text-align:left/,
  'the overlay headline is a sentence over its list, not a centred prompt');
has(/\.sheet-sensors \.sheet-title\{[^}]*font-size:16px/,
  'and is sized like a headline rather than like the code prompt');
ok('the overlay gives the list the room the card could not');

/* An overlay with no way out but the mouse is a trap on a keyboard, and the
   sensor overlay is reachable on a card that asks for no code at all — so the
   escape has to come before the code-entry guard. */
const keydown = sliceFunction('_onKeydown');
assert.ok(keydown.indexOf('_sensorsOpen') < keydown.indexOf('!this._codeVisible()'),
  'Escape must close the sensor overlay before the code guard turns the key away');
ok('Escape closes the overlay on any card');

/* Doors close while it is open. Once the last one has, the list is empty and
   the card behind is already saying the all-clear. */
assert.match(sliceFunction('_render'),
  /this\._sensorsOpen && !this\._sensorsTappable\(\)/,
  'an overlay with nothing left to name closes itself');
assert.match(sliceFunction('_shellSignature'), /_sensorsOpen/,
  'opening and closing the overlay changes the shape of the DOM, so the shell '
  + 'has to be rebuilt for it');
ok('the overlay opens, follows and ends with the question it answers');

/* The headline is a real button rather than a div wearing a click handler:
   it takes focus, answers the keyboard and carries a label. */
assert.match(noticeHtml, /<button class="notice-head" data-act="notice-list" aria-label="/,
  'the tappable headline is a button, with a name for a screen reader');
assert.match(noticeHtml, /' data-tap data-act="notice-list"'/,
  'and the panel around it takes the same tap, so its padding is not a dead border');
has(/\.notice\[data-tap\]\{cursor:pointer/, 'a panel that can be tapped has to look like it');
has(/button\.notice-head:focus-visible\{/, 'and has to show where the keyboard is');
ok('the headline is a button, and reads as one');

console.log('notice-panel.test.mjs passed');
