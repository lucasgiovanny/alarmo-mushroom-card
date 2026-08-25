import assert from 'node:assert/strict';
import { sliceFunction, ok } from './_extract.mjs';

/* How the card reports its own size to the dashboard. Home Assistant's grid
   section applies a fixed pixel height — the `fit-rows` class — whenever rows
   is a NUMBER:

     "fit-rows": typeof rows === "number"
     .card.fit-rows { height: calc((var(--row-size) * (var(--row-height) +
                      var(--row-gap))) - var(--row-gap)) }

   (src/panels/lovelace/sections/hui-grid-section.ts)

   This card's height is not knowable in advance: the open-sensor panel, the
   bypass button, the shortcut chips and the keypad each come and go with
   state. A fixed guess of 3 rows pinned it to 184px, and everything past that
   spilled out of its cell and drew on top of the neighbouring cards. */

/* `name() { ... }` becomes `function () { ... }` by keeping everything from
   the opening bracket onwards. */
function asFunction(name) {
  const src = sliceFunction(name).trimStart();
  return new Function('return function ' + src.slice(src.indexOf('(')))();
}

const gridOptions = asFunction('getGridOptions');
const layoutOptions = asFunction('getLayoutOptions');

for (const layout of [undefined, 'default', 'vertical', 'horizontal']) {
  const config = layout ? { layout } : null;
  const grid = gridOptions.call({ _config: config });
  assert.equal(grid.rows, 'auto',
    `layout ${layout}: rows must be 'auto', or the grid pins the card to a height `
    + 'it outgrows the moment a sensor opens');
  assert.notEqual(typeof grid.rows, 'number');
  assert.ok(grid.columns >= grid.min_columns && grid.min_columns >= 1);

  const legacy = layoutOptions.call({ _config: config });
  assert.equal(legacy.grid_rows, 'auto',
    `layout ${layout}: the pre-2024.11 name has to say the same thing`);
}
ok('every layout reports an automatic height, under both names');

/* These run on layout paths that fire before hass is set, and a throw there
   drops the card out of the view rather than showing an error. */
assert.doesNotThrow(() => gridOptions.call({ _config: null }),
  'getGridOptions must survive being called before setConfig');
assert.doesNotThrow(() => layoutOptions.call({ _config: null }));
assert.ok(!/_hass|_stateObj|hass\./.test(sliceFunction('getGridOptions')),
  'getGridOptions must not read the entity: it runs before hass exists');
ok('reporting a size never depends on state that may not be there yet');

/* Masonry has no grid options and falls back to this. */
const size = asFunction('getCardSize').call({});
assert.ok(Number.isInteger(size) && size >= 3 && size <= 10,
  'getCardSize is the masonry fallback and should be a plausible row count');
ok('masonry gets a plausible fallback size');

console.log('layout.test.mjs passed');
