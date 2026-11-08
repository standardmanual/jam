---
id: "20261108_2136"
category: UI
priority: P3
status: OPEN
created: 2026-11-08
closed: ""
parent: "20261108_1110"
specs: []
---

# [UI] RarityBadge mystic 칩의 글자 대비가 4.5:1 미만이다

## 핵심 요약

- 요구사항: `RarityBadge`의 `mystic` 등급 칩이 면 `rgb(255, 45, 135)` 위에 흰 글자(`rgb(255,255,255)`)라 계산 대비가 3.51:1이다. WCAG 일반 글자 기준 4.5:1에 못 미친다. 글자 12px 굵게(700)는 큰 글자 기준에도 해당하지 않는다. 글자색이나 면을 조정할지, 다른 등급(`rare`·`epic`)도 같은 문제인지 확인하고 방향을 정한다.
- 구현 계획: 미정. 먼저 모든 등급 칩의 면·글자 대비를 계산하고 서비스 화면 영향을 채원이 판정한다.
- 관련 파일: `jam-web/design-system/components/cards/RarityBadge.jsx`(`config`의 등급별 `bg`·`text`), 서비스 호출부(`FeedSection`, `RecipeRewardRow`, `ItemCandidateRow`, `PoiCarouselModal`, `MissionDetailClient`, `BadgeGridCard` 등).
- 담당 에이전트: 채원(판정), 필요하면 아현.

## 배경 / 문제 정의

`20261108_1110`(`ListRowChip` warning 톤 대비) 작업 중 Storybook `ListRow` «media 변형» 화면에서 칩 색을 재다 발견했다. `MYSTIC` 칩(md 22px)의 면은 `rgb(255, 45, 135)`, 글자는 `rgb(255, 255, 255)`로 계산 대비 3.51:1이었다. 같은 화면의 `ListRowChip` `neutral`은 14.23:1, `done`은 17.47:1이다. 다른 등급(`rare`·`epic`)은 확인하지 않았다. 등급 칩은 등급이라는 정보를 색으로도 전하는 칩이라, 면 색을 바꾸면 등급 색 체계(`--rarity-*`)에 영향이 간다.

## 완료 조건

- 모든 등급(`rare`·`epic`·`mystic`)의 칩 면·글자 대비를 계산해 기록한다.
- 4.5:1에 못 미치는 등급이 있으면 사용자가 방향(글자색 조정, 면 조정, 현행 유지)을 정하고 반영한다.
- 서비스 화면의 등급 칩이 깨지거나 등급 색 구분이 약해지지 않는다(실렌더 확인).

---
## 완료 기록 *(작업 후 작성)*
