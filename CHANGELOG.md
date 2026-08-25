# Changelog

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
