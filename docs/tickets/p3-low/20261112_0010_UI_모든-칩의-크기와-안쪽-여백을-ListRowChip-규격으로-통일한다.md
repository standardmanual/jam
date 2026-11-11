---
id: "20261112_0010"
category: UI
priority: P3
status: CLOSED
created: 2026-11-12
closed: 2026-11-12
parent: "20261111_2350"
---

# [UI] 모든 칩의 크기와 안쪽 여백을 ListRowChip 규격으로 통일한다

## 핵심 요약

- 요구사항: 칩의 글자 크기·안쪽 여백·높이를 모두 `ListRowChip`에 맞춘다. 홈피드와 내 프로필 피드의 칩도 포함한다. 색은 지금 값 그대로다(사용자 지시, 2026-11-12). 처음에는 `BadgeGridCard`(22px)에 맞추라고 했다가 같은 날 `ListRowChip`(20px)에 맞추는 것으로 바꿨다.
- 규격: 글자 12px(`--text-xs`), 줄 높이 16px(`--text-xs--line-height`), 안쪽 `--chip-padding`(2px 8px), 굵기 700, 높이 20px.
- 구현: 공통 토큰 `--chip-padding`을 만들고(`--list-row-chip-padding`은 이 값의 별칭) `RarityBadge`의 `md`·`row`, `BadgeLevelChip`의 `md`·`row`(가로 패딩 0, 폭 52px 유지), `LabelChip`(6px 10px, 줄 높이 1, 높이 24px에서), `ListRowChip`이 같은 값을 쓰게 했다. 방문 횟수 칩(`VisitCountChip`)과 DS 사본의 방문 칩, 컬렉션 카드의 «완성» 칩(서비스는 `ListRowChip`, DS 사본은 `TAG_STYLE`)도 맞췄다.
- 관련 파일: `jam-web/design-system/tokens/spacing.css`, `design-system/components/cards/{RarityBadge,BadgeLevelChip,LabelChip}.jsx`, `design-system/components/patterns/{ListRow,BadgeGridCard,CollectionGridCard}.jsx`, `src/components/ui/{ListRow,VisitCountChip,CollectionGridCard}.tsx`, 문서 `*.d.ts`·`*.prompt.md`, `design-system/_ds_manifest.json`.

## 상세 요구사항

- 배지 목록 카드·배지 상세·인벤토리·오늘 카드 등 `RarityBadge`·`BadgeLevelChip` `md`를 쓰던 곳은 칩 높이가 22px에서 20px로, 홈 카드 `LabelChip`은 24px에서 20px로 줄었다.
- `RarityBadge` 기본값 `sm`(8px, 안쪽 4px 9px)은 바꾸지 않았다. 크기를 넘기지 않는 호출부는 `PoiCarouselModal`의 잠긴 드랍 칩 한 곳이다.
- 손으로 만든 칩 중 인벤토리의 후보 행(`ItemCandidateRow`: 일련번호·만료 칩)과 `InventoryGrid`의 만료 칩은 같은 날 사용자 지시로 `ListRowChip`으로 바꿨다(색은 그대로: 일련번호 = `--background` 면, 만료 = 투명 면 + `--border` 안쪽 선 + `--muted` 글자). `SlotActionPill`(버튼)과 VOC 상태 칩은 건드리지 않았다.
- `_ds_manifest.json`을 재생성하며 그동안 빠져 있던 토큰(`--status-*`, `--card-padding*` 등)도 함께 들어갔다.

---
## 완료 기록

### 변경된 파일
디자인시스템 토큰·칩 컴포넌트·카드 사본과 문서, 서비스 칩 컴포넌트, 칩 크기를 단정하던 시험 15건 안팎(`LabelChip.test.tsx`, 오늘 카드 시험들, `CollectionGridCard.tagOrder.test.tsx`, `BadgesClient.visitChip.test.tsx`, `checkinDetail.test.tsx`, `CombineClient.test.tsx`).

### 테스트 결과
- [x] `vitest run` 전체에서 어드민·`asset-generator`(기존 환경 실패) 외 실패 없음, `npm run typecheck` 통과, eslint 오류 0, `ds-sync-check` 오류 0
- [x] 개발 서버에서 배지 목록·홈·내 프로필 화면의 칩이 모두 12px·700·높이 20px(안쪽 2px 8px, 레벨 칩은 2px 0)임을 측정
- [ ] `CombineClient.test.tsx`는 앞선 티켓 20261111_2340(칩 굵기 700)에서 이미 깨져 있던 것을 이번에 함께 고쳤다
- [ ] 인벤토리 칩 세 곳은 이 계정에 해당 상태(만료 임박·선택 시트)가 없어 화면에서는 보지 못했다. 시험 178건과 타입 검사로만 확인했다
- [ ] claude.ai/design 업로드본 갱신과 Storybook 시각 확인은 하지 못했다
