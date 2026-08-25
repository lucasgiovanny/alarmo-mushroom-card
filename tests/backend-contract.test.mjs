import assert from 'node:assert/strict';
import { source, sliceBalanced, sliceFunction, evaluate, ok } from './_extract.mjs';

/* This file is the tripwire for an Alarmo-side rename. Every string below is
   part of a contract with an integration this card does not ship, so a change
   there shows up as a blank card rather than an error — unless it fails here
   first. Read out of custom_components/alarmo/websockets.py and
   alarm_control_panel.py at Alarmo 1.10.19. */

const WS = evaluate(sliceBalanced('const WS = Object.freeze(', '{', '}'));
assert.deepEqual(WS, {
  entities: 'alarmo/entities',
  config: 'alarmo/config',
  sensors: 'alarmo/sensors',
  areas: 'alarmo/areas',
  countdown: 'alarmo/countdown',
  readyModes: 'alarmo/ready_to_arm_modes'
});
ok('the six websocket commands are unchanged');

/* Alarmo publishes on the Home Assistant event bus. Its ONLY websocket
   subscription is `alarmo_config_updated`, which sends {id, type:"event"} with
   no event name and no data — a bare ping for its own config panel
   (custom_components/alarmo/websockets.py, handle_subscribe_updates).
   Subscribing to any other command connects to nothing at all and fails
   silently, which took every event-driven feature of this card down with it:
   no wrong-code feedback, no bypass button, no live readiness.

   The three bus events and their payloads are read out of
   custom_components/alarmo/event.py at Alarmo 1.10.19. */
const BUS = evaluate(sliceBalanced('const BUS_EVENTS = Object.freeze(', '{', '}'));
assert.deepEqual(BUS, {
  failed: 'alarmo_failed_to_arm',
  success: 'alarmo_command_success',
  readyModes: 'alarmo_ready_to_arm_modes_updated'
});
ok('the three bus events are unchanged');

assert.ok(!/'alarmo_updated'/.test(source),
  'alarmo_updated is not a command Alarmo serves; subscribing to it fails silently');
assert.match(source, /subscribeEvents/,
  'bus events are reached with subscribeEvents, not subscribeMessage');
ok('the card subscribes to the bus, not to a command that does not exist');

/* One event carries four outcomes and `reason` is what separates them. */
const REASON = evaluate(sliceBalanced('const REASON = Object.freeze(', '{', '}'));
assert.deepEqual(REASON, {
  openSensors: 'open_sensors', notAllowed: 'not_allowed', invalidCode: 'invalid_code'
});
ok('the failure reasons are unchanged');

/* Readiness arrives as a boolean per supported mode, keyed by state name —
   not as a list, which is what the websocket command returns. */
const onEvent = sliceFunction('_onAlarmoEvent');
assert.ok(/key\.indexOf\('armed_'\) === 0 && data\[key\] === true/.test(onEvent),
  'the readiness event is a boolean map, not an array');
ok('the readiness event is read as a boolean map');

assert.match(source, /const DOMAIN = 'alarmo'/);
const SERVICE = evaluate(sliceBalanced('const SERVICE = Object.freeze(', '{', '}'));
assert.deepEqual(SERVICE, { arm: 'arm', disarm: 'disarm', skipDelay: 'skip_delay' });
ok('the event topic and the three services are unchanged');

/* The bitmask is alarm_control_panel's, not Alarmo's, but a wrong bit shows
   up as a mode button that never appears. */
const FEATURE = evaluate(sliceBalanced('const FEATURE = Object.freeze(', '{', '}'));
assert.deepEqual(FEATURE, {
  ARM_HOME: 1, ARM_AWAY: 2, ARM_NIGHT: 4,
  TRIGGER: 8, ARM_CUSTOM_BYPASS: 16, ARM_VACATION: 32
});
ok('the supported_features bits are unchanged');

const ARM_MODES = evaluate(sliceBalanced('const ARM_MODES = Object.freeze(', '[', ']'), { FEATURE });
assert.deepEqual(ARM_MODES.map((m) => m.state), [
  'armed_away', 'armed_home', 'armed_night', 'armed_vacation', 'armed_custom_bypass'
]);
for (const mode of ARM_MODES) {
  assert.ok(Object.values(FEATURE).includes(mode.bit),
    `${mode.state} does not map to a supported_features bit`);
}
ok('every arm mode maps to a feature bit');

/* alarmo/ready_to_arm_modes answers with FULL state names — 'armed_away', not
   'away'. Alarmo's own debug log strips the prefix before printing, which is
   an easy way to end up matching the short form and marking every mode
   not-ready, which then disables every arm button. Read out of
   update_ready_to_arm_modes in custom_components/alarmo/alarm_control_panel.py
   at Alarmo 1.10.19. */
assert.ok(/_readyModes\.includes\(mode\.key\)/.test(source),
  'readiness must be matched against the full state name');
assert.ok(!/_readyModes\.includes\(mode\.mode\)/.test(source),
  'readiness must not be matched against a short mode name');
ok('readiness is matched against full state names');

for (const payloadKey of ['entity_id', 'skip_delay', 'force', 'code', 'mode']) {
  assert.ok(source.includes(payloadKey + ':'), `the arm payload must carry ${payloadKey}`);
}
ok('the arm service payload keys are present');

/* These are entity attributes, not API responses. The card reads only the
   KEYS of open_sensors: the state stored beside each name is a snapshot from
   the moment the arm failed and never updates afterwards. */
for (const attr of ['open_sensors', 'bypassed_sensors', 'arm_mode', 'supported_features']) {
  assert.ok(source.includes(attr), `the card must read attributes.${attr}`);
}
assert.match(source, /Object\.keys\(attrs\.open_sensors\)/,
  'open_sensors must be read for its keys, never for its stale values');
ok('open_sensors is read for names only');

/* The ready dot going stale until a dashboard reload is upstream issue #161.
   The fix is that the live event repaints it, so the handler must exist. */
assert.ok(/case BUS_EVENTS\.readyModes:/.test(source),
  'the readiness dot must be repainted from the live event (alarmo-card#161)');
ok('the readiness dot is driven by the live event');

/* Losing an optional command must not lose the card. */
assert.ok(/_loadReadyModes\(\) \{[\s\S]{0,1200}?catch[\s\S]{0,600}?this\._readyModes = null/.test(source),
  'a missing ready_to_arm_modes must degrade to no dot, not to no card');
ok('an older Alarmo degrades gracefully');

/* Alarmo initialises _ready_to_arm_modes to [] and only recomputes it when a
   sensor changes state (custom_components/alarmo/sensors.py). A house with no
   sensors configured therefore reports [] forever — the very same answer it
   gives when every mode is genuinely blocked. Reading the two alike greyed out
   every arm button in a house with nothing able to block it and, because a
   blocked button is not clickable, left no way to arm at all. */
const modeReady = sliceFunction('_modeReady');
assert.ok(/!this\._readyModes\.length/.test(modeReady),
  'an empty readiness list must be treated as unknown, not as "everything is blocked"');
assert.ok(/_sensorCount/.test(modeReady),
  'readiness is meaningless when Alarmo has no sensors, so the count has to gate it');
assert.match(source, /type: WS\.sensors/,
  'the sensor count comes from alarmo/sensors');
ok('an empty readiness list cannot disable the card');

console.log('backend-contract.test.mjs passed');
