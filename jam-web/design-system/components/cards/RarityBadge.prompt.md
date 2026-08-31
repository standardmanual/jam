Small uppercase pill showing a badge's rarity tier. `rarity="common"` renders nothing (common is the default tier, not called out). Fixed 3-color mapping for rare/epic/mystic — rare=green `#00cc7a`, epic=gold `#f5a300`, mystic=pink `#ff2d87`. Colors come from `--color-rarity-*` tokens; never re-map these, users have learned the color language.

Naming history: tiers 3 and 4 were renamed on 2026-08-31 (ticket 20260831_1115). Only the names changed — each color stayed on the same rank. See `Service Plan/Specs/UX_WRITING_GUIDELINE.md` for the old→new mapping.

```jsx
<RarityBadge rarity="epic" />
```
