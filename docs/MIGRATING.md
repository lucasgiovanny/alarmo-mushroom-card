# Migrating from `alarmo-card`

Change the type and nothing else:

```diff
-type: custom:alarmo-card
+type: custom:alarmo-mushroom-card
```

Every option `nielsfaber/alarmo-card` accepts is read here the same way, the legacy
`button_scale` included. What follows is the short list of behaviours that are deliberately
different, so none of them arrive as a surprise.

## `show_messages: false` no longer removes the bypass button

Upstream built the bypass button inside the message box, so turning messages off also removed
the only way to arm past an open door
([alarmo-card#157](https://github.com/nielsfaber/alarmo-card/issues/157), closed unfixed).

Here `show_messages: false` hides the sensor list and nothing else — the headline and the
count stay, because knowing *that* something is open is the point, and the button is an
action rather than a message. If you were relying on `show_messages: false` to hide the
button too, add:

```yaml
show_bypass_button: false
```

## Bypassing asks for a second tap

Force-arming is a deliberate security downgrade, and upstream put it one tap from a fat
finger. The button now says *Tap again to confirm* for four seconds first. To go back to the
single tap:

```yaml
confirm_bypass: false
```

## `use_code_dialog` opens this card's own sheet

Upstream calls Home Assistant's `showEnterCodeDialog`, which lives behind a private frontend
module. Reaching it from a card with no build step means hardcoding an internal path, and
every card that has done so has had to chase a rename roughly once a year.

The sheet here is the card's own: same keypad, same behaviour, a backdrop you can tap to
dismiss, and no dependency on a frontend internal.

## The arm options are chips, not a kebab menu

`force` and `skip_delay` were behind a three-dot menu pinned to the card's corner, which
upstream then had to hide below 250px wide. They are two toggles; they fit on a line. Turn
them off with:

```yaml
show_arm_options: false
```

The force chip hides itself while the bypass button is on screen — offering the same action
twice, side by side, only invites the question of how the two differ.

## Buttons default to Mushroom's model

Disarmed shows the arm modes; armed shows a single disarm button. Upstream drew every button
at all times in one segmented row.

Anything you set explicitly still wins, so the old row comes back with:

```yaml
states:
  disarmed:
    hide: never
  armed_away:
    hide: never
  armed_home:
    hide: never
```

## A not-ready button cannot be tapped

Upstream greyed the readiness dot but left the button live, so tapping a mode with an open
sensor produced a failed arm and then a message about it. The button is now genuinely
disabled until the mode is ready — or until you turn on the bypass toggle, which is what says
you meant it.

`show_ready_indicator: false` turns the whole mechanism off.

## An unknown state key is now an error

```yaml
states:
  armed_hom:      # <- typo
    button_label: Home
```

Upstream accepted this and silently never applied it. This card reports it as a
configuration error instead.

## `button_order` counts from where the button already is

Upstream sorted every button carrying an order ahead of every button without one, so
`button_order: 9` on a single mode sent it to the *front*. Here a button without an order
keeps its natural position, and 9 means ninth. Where the visual editor has written an order
for every button — which is what upstream's editor always did — the two rules agree.

## No `button_order` in the visual editor yet

Upstream's drag-to-reorder rewrote absolute indices into *every* state the first time you
touched it, which destroyed a partial hand-written order. `button_order` is still read from
YAML and still respected; the visual reordering will come back in a way that only moves what
you actually moved.
