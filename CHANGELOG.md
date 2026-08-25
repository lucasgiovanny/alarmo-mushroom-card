# Changelog

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
