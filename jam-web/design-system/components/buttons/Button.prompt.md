Pill-shaped button in five variants — primary (`--accent`), secondary (`--btn-secondary`), danger (`--danger` fill + `--snow` text), outline (same `--btn-secondary` fill, no outline — visually identical to secondary), ghost (text-only `--link`) — for two surfaces (light/dark backgrounds). Every variant carries a 1px border (always transparent), so switching variants never changes the height (md = 52px).

```jsx
<Button variant="primary">드랍하러 가기</Button>
<Button variant="secondary">취소</Button>
<Button variant="danger">삭제</Button>
<Button variant="outline">필터</Button>
<Button variant="ghost">더보기 →</Button>
```

One primary per area, everything else secondary. A primary + secondary pair sits in a footer as two equal-width buttons with a gap of 8. `danger` is a black fill like primary, so it carries `--snow` text and is told apart by wording and position, not color. On a `Card` default (#f7f7f7) a `secondary` pill (#e5e5e5) stays visible; do not rely on `--default` (#f5f5f5) for a pill on a card.

Use `surface="dark"` only when placed on a `--background-inverse` (black) section — primary is a `--snow` fill with `--foreground` text, secondary is a transparent pill with a 1px `--snow` border and `--snow` text, ghost text is `--snow`. `danger` and `outline` have no dark value and fall back to the light one. On a light surface (`--background`, `--surface`) keep the default `surface="light"`; `dark` there makes the text near-white and unreadable. `fullWidth` stretches to container width. Minimum touch target 44px per iOS HIG.

`size="sm"` (`44px * var(--scale-compact)`, ≈31px — token in `tokens/motion.css`) is an explicit exception to the 44px rule — use it only inside a fixed-height dense context (e.g. a navigation bar) where a full 44px control would overflow the bar. Default is `size="md"` (44px).

```jsx
<Button variant="secondary" size="sm">동기화</Button>
```

Text weight is 400 in every variant, the same as the service `Button` (ticket 20261112_1816, decided 2026-11-12). Do not set a heavier weight on a single button.

Usage guidance (ticket 20261112_1626): a list-bottom «더보기» is always `LoadMoreButton`, never a hand-made button (see `LoadMoreButton.prompt.md`). A save + cancel pair sits on one line, half and half (`flex gap-2` of two `fullWidth` buttons: primary save, secondary cancel; 176.5px each in a 361px column). A large button inside a bottom sheet takes `SHEET_BUTTON_CLASS` (`src/components/ui/sheetClasses.ts`, 16px text, 56px high). A navigation shortcut that looks like a button (e.g. «랭킹 보기») is an `outline` Button with `onClick` navigation, not a Button nested inside a link.
