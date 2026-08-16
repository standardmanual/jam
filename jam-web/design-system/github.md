repo: standardmanual/jam
branch: main
path: jam-web

## Last sync
date: 2026-08-13T08:05:16Z

### Updated in this project
- Read JAM! app content/structure (Today, Badges, Drops, Inventory, Profile screens; TabBar/TopNav patterns) — used as the UI kit's screen structure and copy source.
- Read `UX_WRITING_GUIDELINE.md` — used for the readme's Content Fundamentals section.
- Deliberately did NOT import JAM!'s own `globals.css` token system (cobalt/ice binary) — superseded by the Shopify-extracted palette per explicit direction.
- Copied `jam-web/public/jam-logo-white.png` as a brand asset.

## Screen map
| Design system screen | Repo source |
|---|---|
| ui_kits/jam-app (Today) | jam-web/src/app/(main)/page.tsx, TodayCardStack.tsx |
| ui_kits/jam-app (Badges) | jam-web/src/components/ui/Badge.tsx |
| ui_kits/jam-app (Drops) | jam-web/src/lib/drop-engine/ (content reference only) |
| ui_kits/jam-app (Inventory) | jam-web/src/components/inventory/InventoryGrid.tsx |
| ui_kits/jam-app (Profile) | jam-web/src/app/(main)/layout.tsx, TabBar.tsx |
| Navigation components | jam-web/src/components/ui/TopNav.tsx, TabBar.tsx |
