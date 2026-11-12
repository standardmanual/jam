# BadgeHeroSection

The hero card for a single badge: image, rarity/level chip, name, description, stacked and centered in one white card. Promoted from the service in ticket 20261112_1818.

It is a pure display component. Everything service-specific (safe image rendering, blob background, theme detection, sentence splitting) is computed by the caller and passed in as slots or plain values. The service keeps a thin adapter (`src/components/BadgeHeroSection.tsx`) that does that work and renders this component.

```jsx
// Plain badge
<BadgeHeroSection
  name="한강 러너"
  rarity="rare"
  descriptionLines={['짝 잃은 양말이 제 짝을 찾아 빨랫줄에 나란히 걸렸습니다.']}
  imageSlot={<img src={url} width={200} height={200} />}
/>

// Level badge: `level` wins over `rarity`, the chip becomes Lv.N
<BadgeHeroSection name="누적 러닝 거리" level={7} imageSlot={...} />

// Locked item: extra chip, custom title and description, locked tile as the image
<BadgeHeroSection
  name="잠긴 배지" rarity="rare"
  chipExtra={<LabelChip>잠김</LabelChip>}
  titleNode="이름을 가렸어요"
  descriptionNode="열면 어떤 배지인지 알 수 있어요."
  imageSlot={<LockedTile size={200} />}
/>

// Over a dark background: transparent card, all text --snow
<BadgeHeroSection onMedia backgroundSlot={<Canvas />} backgroundColor={bgColor} textStyle={shadow} ... />
```

## Rules

- **One card only.** Do not use it as a list row (use `ListRow`) or for long body text. The centered layout is intended for "one hero image + name + short description".
- `imageSlot` is required. Its size rule (page 200 / sheet 176) lives inside the slot, in the caller, not here. Missing image, locked tile, crossfades are all the caller's job.
- Chips are the DS `RarityBadge` and `BadgeLevelChip`, both `size="md"` (12px / 20px). `level != null` picks `BadgeLevelChip`, otherwise `RarityBadge`. A null rarity with no level draws no chip.
- Card face `bg-card-bg`, `rounded-2xl`, no outline, no shadow, no glass, no default gradient. Height is decided by the content (no `aspect-square`).
- Title is `text-3xl font-bold` in `text-foreground`; description is `text-base` in `text-muted`. With `onMedia` both become `text-snow` and the card face becomes `bg-transparent`. `onMedia` is for dark surfaces only; contrast depends on the background color the caller chose.
- Long names wrap to two or three lines. No ellipsis.
- The description block is not rendered when neither `descriptionNode` nor `descriptionLines` is given. Description paragraphs use `text-wrap!` to turn off the global `p { text-wrap: balance }`.
- `backgroundSlot` sits at the bottom of the card (`z-0`), clipped by the rounded corners. The DS draws no default background. `backgroundColor` is the first-paint fallback and is applied inline only when given. `textStyle` (for example a text shadow over a bright background) goes on the text block and the DS does not know its value.
- `size`: `page` (default) = wrapper `relative z-10 px-4 pt-0 pb-5`, card `p-6`. `sheet` = wrapper `relative z-10`, card `py-6 px-4`; the outer margin is the caller's.
- No color literals in this file. Only `text-snow`, `text-foreground`, `text-muted`, `bg-card-bg`.

## Styling exception

Every other DS component uses inline `style` and CSS variables. This one keeps the Tailwind alias classes from the service markup because the service tests assert the class strings and the promotion must change zero pixels. Storybook loads `globals.css`, so the classes work there too.

## Used by

- Service adapter `BadgeHeroSection.tsx`, which renders it for the badge detail page, locked item detail, check-in detail sheet (`size="sheet"`), the admin detail preview and the dev sample page.
