# Changelog

## 0.1.10 - 2026-08-25

- Changed a mode that cannot be armed to be locked rather than left to fail. `blocked_modes`
  decides what that looks like: `disable` draws it unavailable, `hide` takes it off the row
- Changed *Arm anyway* into a key. Turning it arms nothing — it puts every blocked mode back
  on the row, and the one you then choose is the one that arms. Arming past a sensor is now
  two deliberate taps in two different places, each naming exactly what happens, instead of
  one button having to guess which way to arm the house or wait for an attempt to fail first
- The key is on screen whenever anything is locked, with no failed attempt needed, and stays
  there while turned so there is always a way to put it back
- Removed `confirm_bypass`. Unlocking and then choosing a mode is the second thought it asked
  for. A config still naming it loads without complaint

## 0.1.9 - 2026-08-25

- Fixed the arm-anyway button almost never appearing, which made the setting that governs it
  look broken. It required a failed arm to have already happened, because only the failure
  named a mode to retry. Tapping a blocked mode now names the target then and there, without
  waiting for the round trip, and a single arm mode on offer is unambiguous with no attempt
  behind it at all
- Changed the open-sensor settings to appear only when they can do something, the way the
  keypad settings already did: the chip cap is gone when nothing is listed, and the confirm
  step is gone when there is no button to confirm
- Changed that section to read top to bottom — what to show, how much of it, the all-clear,
  the action, its safety catch, the armed case — and rewrote its labels to say what each one
  does. `show_messages` is *List which sensors are open*, with a note that the panel still
  reports that arming is blocked without it

## 0.1.8 - 2026-08-25

- Added the room under each sensor's name in the open-sensor chips. *Window* names nothing in
  a house with four of them. The area comes from Home Assistant's own registries — the
  entity's area, falling back to its device's — not from Alarmo, whose `area` is its own
  grouping of panels rather than the room the sensor is in
- Fixed the headline sitting at the left of a full-width bar when there is nothing under it,
  which read as a layout that had gone wrong rather than as a status. A panel with no chips —
  the all-clear, or any panel with `show_messages: false` — centres its headline, and an empty
  chip row is no longer drawn at all

## 0.1.7 - 2026-08-25

- Changed the open-sensor panel from a post-mortem into a status. It used to exist only after
  an arm had failed, because `open_sensors` is only ever populated by a failure — so a door
  standing open said nothing until you tried, and the all-clear could only ever appear as the
  aftermath of a failure, which is a strange thing for *everything is fine* to be. The panel
  now answers whether the alarm can be armed right now, worked out from Alarmo's sensor
  config (`alarmo/sensors`) and the live entity states
- Changed which sensors count as in the way to follow the sensor's own configuration:
  `enabled`, `always_on`, `modes`, `allow_open`, `arm_on_close`, `auto_bypass` and its
  per-mode list, and the area. A sensor Alarmo is told to allow open, to bypass by itself, or
  simply to wait for is not in anyone's way
- Changed the per-button readiness dots to read that same live answer instead of Alarmo's
  mode list, so a green *ready to be armed* can no longer sit above a button wearing an amber
  dot. The dots are per mode, so a sensor armed only for away leaves home and night green
- Fixed the header badge lighting up merely because sensors exist. It now means something is
  actually open or bypassed
- The all-clear panel shows no chips: listing every quiet sensor as a green chip buried the
  one line that matters under a wall of things that are fine

## 0.1.6 - 2026-08-25

- Changed the blocked notice to say what is true rather than what is not yet: *The alarm
  cannot be armed* in place of *Cannot arm yet*, and *The alarm is ready to be armed* in place
  of *All clear — ready to arm*. The title wraps now instead of truncating
- Added `show_ready_notice`, for hiding the panel once every blocking sensor has closed again.
  The arm action is governed separately by `show_bypass_button`, so hiding the panel does not
  take the way to arm with it
- Removed the pre-emptive bypass shortcut and its `show_force_option`. It was the same intent
  as the bypass button one moment earlier and with less to say — the button names the sensors
  it is about to ignore, which a chip offered before the attempt never could. A config still
  naming the option loads without complaint
- Changed a not-ready arm button back to being tappable. With no pre-emptive bypass left, a
  blocked button meant the arm could not fail, so the bypass button never appeared and there
  was no way to arm past a sensor at all. The dot warns; the tap still goes through, and the
  panel then names what stopped it
- Removed the per-card `language`. The card follows the Home Assistant profile language, like
  every other card on the dashboard
- Changed the keypad settings to appear only when they can do something: an overlay hides the
  three that describe the in-card keypad, hidden keys hide their own size, and a text code
  drops both key settings. Their labels now say what each one actually does

## 0.1.5 - 2026-08-25

- Changed tapping the card so it no longer opens the Home Assistant entity dialog, which is
  easy to hit by accident on the one card you least want to fumble and shows nothing the card
  is not already showing. A tap now does nothing by default; where the code is asked for in a
  sheet, it opens the sheet instead. `tap_action` — `none`, `code`, `more-info` — decides, and
  the header only looks pressable when a tap actually does something
- Fixed the card restarting its whole backend handshake on every keystroke in the dashboard
  editor, which made the keypad and the readiness dots blink out and come back on each edit.
  Only a change of entity invalidates what the backend already answered
- The countdown ring keeps its own job: tapping it still skips the exit delay, whatever
  `tap_action` is set to

## 0.1.4 - 2026-08-25

- Fixed the card overflowing its cell in a sections dashboard and drawing on top of the cards
  around it. Home Assistant pins a card to an exact pixel height whenever `getGridOptions()`
  reports a numeric `rows` — the `fit-rows` class in `hui-grid-section.ts` — and this card
  reported 3, which is 184px. Its real height is not knowable in advance: the open-sensor
  panel, the bypass button, the shortcut chips and the keypad each come and go with state, so
  it now reports `rows: 'auto'` and the grid takes the height the card actually has
- Added `getLayoutOptions()`, which Home Assistant before 2024.11 asks instead

## 0.1.3 - 2026-08-25

- Fixed the card subscribing to a websocket command Alarmo does not serve. Alarmo's only
  websocket subscription is `alarmo_config_updated`, a bare ping with no event name and no
  data meant for its own config panel; the events live on the Home Assistant bus as
  `alarmo_failed_to_arm`, `alarmo_command_success` and `alarmo_ready_to_arm_modes_updated`.
  Subscribing to the wrong thing failed silently and took every event-driven feature with it:
  no wrong-code feedback, no bypass button after a failed arm, no live readiness
- Fixed the readiness payload being read as a list. The bus event sends a boolean per
  supported mode, keyed by state name
- Added a summary to the code sheet — which alarm, which mode, the exit delay, and how many
  sensors are being bypassed — so the prompt is not a code prompt for something you have to
  remember you asked for
- Changed the code sheet's prompt to 20px: it is the instruction for the thing under the
  thumb, not a caption
- Changed the bypass and no-delay shortcuts into two independent switches,
  `show_force_option` and `show_skip_delay_option`. `show_arm_options` is migrated
- Changed the mode buttons to stay on one row and drop their labels when the words stop
  fitting, instead of wrapping to a second line — a wrap read as a mistake whenever the card
  looked like it had room

## 0.1.2 - 2026-08-25

- Fixed every arm button being disabled, and the card therefore unusable, in a house with no
  sensors configured in Alarmo. Alarmo starts `_ready_to_arm_modes` empty and only recomputes
  it when a sensor changes state, so a house with no sensors reports `[]` forever — the same
  answer it gives when every mode really is blocked. An empty list is now read as "unknown",
  and `alarmo/sensors` supplies the count that tells the two apart
- Fixed the code sheet closing the moment you pressed confirm, which put a rejected-code
  message on the card behind it. The sheet now stays up until the backend answers, shakes and
  says `Wrong code` in place, and closes only once the code is accepted
- Fixed a second wrong code in a row not shaking, because re-adding a class an element
  already carries does not restart its animation
- Fixed `button_order` sending a button to the front instead of to the position its number
  names. A button without an order now keeps its natural place instead of being pushed behind
  every button that has one
- Added `button_content` — the mode buttons can show `icon_and_name` (default), `icon`, or
  `name`. Icon-only no longer has to be asked for by blanking every label
- Changed the code sheet's keypad to a real keypad: keys sized for a thumb with a fill of
  their own, backspace bottom-left, zero centre, and a green confirm bottom-right
- Added `docs/options-harness.html`, which checks every option twice — that the visual editor
  round-trips it, and that setting it visibly changes what the card renders

## 0.1.1 - 2026-08-25

- Fixed every control inside a collapsible section of the visual editor silently
  refusing to save. Home Assistant's `ha-form` reads a section's value as
  `data[schema.name]` and emits it back as `{[schema.name]: value}` unless the name is
  empty, so the named sections handed the editor `{keypad: {hide_keypad: true}}`, the flat
  lookup missed it, and Home Assistant re-applied the previous config a moment later — on
  screen, a switch that flipped itself back. Sections are now unnamed and carry their
  heading in `title`
- Fixed the editor rebuilding its whole form on every state change in the house, which
  closed the section being edited and dropped half-typed fields
- Added `tests/editor.test.mjs` and `docs/editor-harness.html`, which exercises the editor
  against a stand-in for `ha-form` that reproduces Home Assistant's own value-nesting rules

## 0.1.0 - 2026-08-25

- Added `alarmo-mushroom-card`, a Lovelace card for the Alarmo alarm panel drawn in the
  Mushroom design language, with no dependency on `lovelace-mushroom` being installed
- Added an open-sensor panel built from scrollable chips that read live entity state, turn
  green in place when a sensor closes, and keep a true total when the row scrolls out of view
- Added a bypass action that is a sibling of the message panel rather than a child of it, so
  `show_messages: false` no longer removes the only way to arm past an open sensor
  (`nielsfaber/alarmo-card#157`)
- Added a confirm step before bypassing, off with `confirm_bypass: false`
- Added an *All clear — ready to arm* state that turns the retry into a plain arm once every
  blocking sensor has closed, instead of forcing past sensors that are no longer open
- Fixed the ready-to-arm indicator going stale until a dashboard reload, and matched
  readiness against the full state names Alarmo actually reports
  (`nielsfaber/alarmo-card#161`)
- Changed a not-ready arm button to be genuinely untappable rather than merely greyed, so it
  can no longer produce the failed arm it was warning about
- Added `layout`, `fill_container` and `icon_type` following Mushroom's appearance
  conventions, plus `getGridOptions` for the sections view
- Added `--mush-*` token inheritance, so a Mushroom theme already installed themes this card
- Added a keypad with backspace instead of clear-everything, and code dots in place of a text
  field that drags the on-screen keyboard over the card
- Added a countdown ring driven by an absolute deadline, so a backgrounded tab comes back
  correct rather than minutes behind
- Added a visual editor covering every state, `triggered`, `arming` and `pending` included,
  which upstream's editor could not reach
- Added `en`, `pt-br`, `pt-pt`, `es`, `fr`, `de` and `it` translations, with key parity
  enforced by `tests/i18n.test.mjs`
- Added `docs/harness.html`, a fake-`hass` page that mounts one card per state for iterating
  on the CSS without a Home Assistant instance
