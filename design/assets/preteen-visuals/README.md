# Preteen Visual Direction Assets

Audience: preteen players, roughly ages 9-12.

Design goal: energetic, collectible, readable, and not babyish. The game should feel like a smart toy or puzzle arcade: bright enough to invite play, restrained enough that board scanning still works.

## Chosen Direction

Recommended default: **Cosmic Arcade**.

Reason: it gives the strongest game feel without relying on character art. It also supports high contrast arrows, clear tile states, and expandable level themes.

## Variant Summary

| Variant | Feel | Use when |
| --- | --- | --- |
| Cosmic Arcade | Neon tokens, space badges, dark board contrast | Default game shell and medium/hard levels |
| Candy Lab | Soft candy colors, gel tiles, playful UI | Tutorial, easy levels, onboarding |
| Island Quest | Sunny map colors, treasure badges, outdoor energy | Seasonal packs or later level worlds |

## Files

- `tokens.css`: CSS custom properties for all three palettes.
- `variants/cosmic-arcade.svg`: visual mood sheet for the recommended direction.
- `variants/candy-lab.svg`: alternate bright tutorial direction.
- `variants/island-quest.svg`: alternate adventure direction.
- `tiles/tile-arrow-sprite.svg`: reusable tile and arrow asset sheet.
- `ui/badges-and-buttons.svg`: level badges, completion stars, and button shapes.
- `ui/background-patterns.svg`: subtle board background patterns.

## Implementation Notes

- Always show arrows/icons. Never rely on color alone for direction.
- Keep tile labels optional. The core signal should be shape + arrow direction.
- Use darker board surfaces behind bright tiles so legal-move scanning stays readable.
- Keep animation snappy: tap, pop, slide out, settle. Avoid long celebratory delays.
- For mobile, preserve 44px minimum touch targets for tile controls when possible.

## Palette Recommendation

Start with Cosmic Arcade:

- Background: `#17162f`
- Board: `#242454`
- Tile colors: `#4de3ff`, `#ff5ea8`, `#ffd166`, `#7cf57c`, `#a78bfa`, `#ff8a3d`
- Text: `#f8fbff`
- Muted text: `#b8c0ff`

Use Candy Lab for the first 5-10 tutorial levels if the default feels too intense for first-time players.
