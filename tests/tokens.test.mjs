import assert from 'node:assert/strict';
import { source, sliceFunction, ok } from './_extract.mjs';

/* Mushroom's real token defaults, read from piitaya/lovelace-mushroom
   src/utils/theme.ts. Drifting from these is what makes a card that "looks
   sort of like Mushroom" instead of sitting beside one. */
const MUSHROOM_TOKENS = {
  spacing: '10px',
  'control-spacing': '12px',
  'icon-size': '36px',
  'icon-symbol-size': '0.667em',
  'icon-border-radius': '50%',
  'badge-size': '16px',
  'badge-icon-size': '0.75em',
  'badge-border-radius': '50%',
  'control-height': '42px',
  'control-border-radius': '12px',
  'control-icon-size': '0.5em',
  'chip-height': '36px',
  'chip-border-radius': '19px',
  'card-primary-font-size': '14px',
  'card-primary-font-weight': '500',
  'card-primary-line-height': '20px',
  'card-primary-letter-spacing': '0.1px',
  'card-secondary-font-size': '12px',
  'card-secondary-font-weight': '400',
  'card-secondary-line-height': '16px',
  'card-secondary-letter-spacing': '0.4px'
};

for (const [name, value] of Object.entries(MUSHROOM_TOKENS)) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* Reading through --mush-* is what lets a Mushroom theme already installed
     in the house theme this card too, without it knowing the card exists. */
  const pattern = new RegExp(`var\\(--mush-${name},\\s*${escaped}\\)`);
  assert.match(source, pattern,
    `--amc-* must read --mush-${name} with Mushroom's own default of ${value}`);
}
ok(`all ${Object.keys(MUSHROOM_TOKENS).length} Mushroom tokens are honoured with their defaults`);

assert.match(source, /--amc-secondary-color:var\(--mush-card-secondary-color,var\(--primary-text-color\)\)/,
  'Mushroom paints the secondary line in --primary-text-color, not --secondary-text-color');
ok('the secondary line uses primary-text-color, as Mushroom does');

/* Dark mode moves exactly one token. More overrides means a second palette to
   keep in sync, and Home Assistant already flips --primary-text-color. */
assert.match(source, /:host\(\[data-dark\]\)\{\s*--amc-rgb-disabled:111,111,111;\s*\}/,
  'dark mode must override only --amc-rgb-disabled');
ok('dark mode overrides exactly one token');

assert.match(source, /@keyframes amc-pulse\{0%\{opacity:1\}50%\{opacity:0\}100%\{opacity:1\}\}/,
  "the pulse must be Mushroom's own opacity keyframes");
ok('the pulse keyframes match Mushroom');

/* The whole colour system is rgba(<triplet>, alpha), so any bare hex in the
   stylesheet is a colour that cannot follow a theme — the #d0863d hardcoded
   in upstream's warning box is exactly this bug. */
const styleRegion = source.slice(source.indexOf('const TOKENS_CSS'), source.indexOf('const DEFAULTS'));
/* Comments carry upstream issue numbers like #157, which are not colours. */
const declarations = styleRegion.replace(/\/\*[\s\S]*?\*\//g, '');
const hexes = declarations.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
/* #fff is allowed only as the last resort behind --ha-card-background and as
   the badge glyph, both of which sit on a colour the theme already chose. */
const stray = hexes.filter((hex) => hex.toLowerCase() !== '#fff');
assert.deepEqual(stray, [],
  `every colour must come from a theme token; found ${stray.join(', ')}`);
ok('no hardcoded theme colours in the stylesheet');

assert.match(source, /transition:background-color 280ms ease-in-out/,
  "280ms is Mushroom's colour transition and the entire press affordance");
assert.doesNotMatch(declarations, /\.control\{[^}]*transform:/,
  'a scale on the control rounds the radius unevenly and re-lays out its flex neighbours');
ok('controls use the 280ms colour transition and no transform');

assert.match(source, /rgba\(var\(--amc-rgb-text\),0\.05\)/,
  "the neutral shape tint must be Mushroom's 5% of the text colour");
assert.match(source, /rgba\(' \+ rgb \+ ',0\.2\)/,
  'the active shape tint must be 20% of the state colour');
ok('the shape colour formula matches Mushroom');

assert.match(source, /CSS\.supports/,
  'theme tokens must be probed before use — an empty one invalidates var() and resets the property');
ok('theme tokens are validated before being applied');

/* ---- one colour per way of being armed ---- */

/* Mushroom collapses every armed_* into one green, and for a card that only
   reports whether an alarm is on, that is right. This one is read to find out
   *which* way the house is armed, and a colour answers that from further away
   than a word does. */
const colorFor = new Function(
  'return ' + sliceFunction('stateColorVar'))();
const modes = ['armed_away', 'armed_home', 'armed_night', 'armed_vacation',
               'armed_custom_bypass'];
const colors = modes.map(colorFor);
assert.equal(new Set(colors).size, modes.length,
  'each armed mode needs a colour of its own, or the ring and the icon say only '
  + 'that the house is armed and not how');
for (const c of colors) assert.match(c, /^var\(--amc-rgb-armed-/);
ok('every armed mode has its own colour');

assert.equal(colorFor('triggered'), 'var(--amc-rgb-triggered)',
  'triggered stays one colour everywhere: that question outranks the others');
assert.equal(colorFor('disarmed'), 'var(--amc-rgb-disarmed)');
assert.notEqual(colorFor('disarmed'), colorFor('armed_away'),
  'with away in green, disarmed in green would make green mean both "safe" and '
  + '"armed away" on the same card');
assert.equal(colorFor('armed_something_new'), 'var(--amc-rgb-armed-away)',
  'an armed_* Alarmo grows later still gets a colour rather than grey');
ok('triggered and disarmed stay apart from the modes');

/* Night is read in the dark more than any other mode, and indigo goes muddy
   against a dark card. */
assert.match(source, /--amc-rgb-armed-night:var\(--amc-rgb-purple\)/,
  'night takes the lighter violet, not indigo');
ok('night is legible in the dark');

/* A button is coloured by the state it leads to. Disarm is the only one on
   screen while armed, so leaving it neutral made the one thing you came to
   press the quietest thing on the card. */
const paintFn = sliceFunction('_paint');
assert.ok(/const coloured = isActive \|\| !mode\.arms;/.test(paintFn),
  'Disarm must take colour even though it is never the active state');
ok('Disarm is coloured by the state it leads to');

console.log('tokens.test.mjs passed');
