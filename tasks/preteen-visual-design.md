# Preteen Visual Design Direction

Last Updated: 2026-06-04

## Goal

Create a visual direction for a browser tile puzzle that preteen players can like without making the game feel babyish or visually noisy.

## Audience

- Ages: roughly 9-12.
- Taste target: playful, confident, collectible, quick to understand.
- Avoid: preschool colors, mascot-heavy UI, tiny text, color-only logic, overdecorated boards.

## Recommended Direction

Use **Cosmic Arcade** as the default.

Why:

- High contrast helps puzzle scanning.
- Neon token colors feel game-like and energetic.
- The theme can support future level packs without needing characters.
- Dark board surfaces make bright direction tiles readable.

## Asset Package

Preview:

- [index.html](../design/assets/preteen-visuals/index.html)

Core files:

- [README.md](../design/assets/preteen-visuals/README.md)
- [tokens.css](../design/assets/preteen-visuals/tokens.css)
- [cosmic-arcade.svg](../design/assets/preteen-visuals/variants/cosmic-arcade.svg)
- [candy-lab.svg](../design/assets/preteen-visuals/variants/candy-lab.svg)
- [island-quest.svg](../design/assets/preteen-visuals/variants/island-quest.svg)
- [tile-arrow-sprite.svg](../design/assets/preteen-visuals/tiles/tile-arrow-sprite.svg)
- [badges-and-buttons.svg](../design/assets/preteen-visuals/ui/badges-and-buttons.svg)
- [background-patterns.svg](../design/assets/preteen-visuals/ui/background-patterns.svg)

## Design Rules

- Use arrows/icons on every tile. Do not rely on color alone.
- Keep the first viewport as the playable game.
- Use short labels: `Next`, `Undo`, `Hint`, `Retry`.
- Keep visual detail in the shell and rewards, not inside puzzle tiles.
- Use strong contrast between board surface and tile colors.
- Keep animations short: pop, slide, settle.
- Minimum mobile touch target should be 44px when layout allows.

## Theme Mapping

| Game Area | Recommended Theme |
| --- | --- |
| Default shell | Cosmic Arcade |
| Tutorial levels | Candy Lab accents, optional |
| Later level packs | Island Quest or future pack variants |
| Completion states | Cosmic Arcade badge + star burst |
| Hint/blocked feedback | High-contrast outline, not only red |

## Implementation Notes

- `tokens.css` can be copied into the app and mapped to `data-theme`.
- The SVG sheets are source assets. Implementation can either inline them, cut them into components, or export individual optimized SVGs later.
- If using React, convert repeated SVG shapes into `TileView`, `LevelBadge`, and `GameButton` components rather than importing the whole sheet as one image.

## Open Design Questions

- Whether the board should use square grid only for MVP or support hex visuals early.
- Whether tutorial levels should use Candy Lab accents or keep Cosmic Arcade from the first level.
- Whether to add subtle sound/haptics-style visual feedback later.
