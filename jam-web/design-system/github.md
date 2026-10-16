repo: standardmanual/jam
branch: main
path: jam-web

> 2026-10-16: 아래 Shopify 추출 팔레트·cobalt/ice 서술은 폐기됐다. 색·서체의 원천은 피그마 `JAM-Modulor-V2`와 `docs/plan/jam2/11 JAM 2.0 디자인 시스템.md`다(티켓 20261015_2135). 아래는 2026-08-13 동기화 시점 기록이다.

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
| Navigation components | jam-web/src/components/ui/TopNav.tsx, TabBar.tsx |
