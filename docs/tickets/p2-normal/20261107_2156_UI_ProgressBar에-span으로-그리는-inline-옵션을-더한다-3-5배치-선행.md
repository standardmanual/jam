---
id: "20261107_2156"
category: UI
priority: P2
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
specs:
  - jam-web/design-system/components/feedback/ProgressBar.jsx
  - jam-web/design-system/components/feedback/ProgressBar.prompt.md
---

# [UI] ProgressBar에 span으로 그리는 `inline` 옵션을 더한다 (3-5배치 선행, ds)

## 핵심 요약

- 요구사항: MODULAR `ProgressBar`는 `<div>` 두 겹(바깥 + 트랙 + 채움)을 그린다. `ListRow`의 `meta`는 클릭 영역(`Link`) 안이라 phrasing 요소만 넣을 수 있어, 순위 행(`RankingListRow`)의 진행 바를 못 넣는다. `ProgressBar`에 **기본값이 바뀌지 않는 새 prop**(이름은 `inline`을 기본안으로 한다)을 더해 켜면 바깥·트랙·채움을 모두 `<span>`으로 그린다. 상위 티켓 4단계 3-5배치(20261107_1947)의 선행 `ds` 티켓이다.
- 구현 계획: `ds` 유형. 채원 사전 판정(연결 범위·prop 이름·값 확정) → 아현 구현(원본·`.d.ts`·`prompt.md`·Story) → 민지 게이트 → 채원 사후 리뷰. 파일 단위 계획은 «구현 계획».
- 관련 파일: `jam-web/design-system/components/feedback/ProgressBar.jsx`(149줄, `bar` 정의 85~127줄, 반환 부분 129~148줄), `ProgressBar.d.ts`(`ProgressBarProps`), `ProgressBar.prompt.md`, `ProgressBar.stories.tsx`(`Outlined` 164줄 근처에 새 Story 추가). 서비스는 이 원본을 `@ds/...`로 직접 import하므로(서비스 사본 없음) 변경이 즉시 반영된다. 사용처: `ItemBookHeroSection`, `CollectionGridCard`, `collections/page`, `MissionDetailClient`, `inventory/page`, `MissionStatusClient`, `RankingListRow`, `OnboardingQuestCard`, `TodayStatusStrip`, `DualAxisGauge`.

## 배경 / 문제 정의

3-5배치 채원 사전 판정에서 나온 승인 항목 1이다. 순위 행은 이름 아래에 높이 6px, 폭 가변의 진행 바(1위 대비 비율)가 있고, 이 행은 프로필 링크라 바가 클릭 영역 안에 놓인다. 클릭 영역 안에 `<div>`를 두면 안 된다는 1~3배치 확정 규칙 때문에 `ProgressBar`를 그대로 쓸 수 없다. 사용자 결정(2026-11-07): 채원 추천 (a)안으로 `ProgressBar`에 span 렌더 옵션을 더한다. (b) 바를 빼는 안과 (c) 서비스 전용 바를 새로 만드는 안은 택하지 않았다.

## 사용자 결정

- 기본값은 바뀌지 않는다. 새 prop을 켠 호출부만 달라진다. 기존 호출처 10곳(위 목록)의 마크업과 모양이 그대로여야 한다.
- 새 토큰은 만들지 않는다.
- `ListRow` 원본·서비스 사본은 건드리지 않는다.

## 범위

1. `ProgressBar.jsx`에 새 prop(기본안 `inline`, 기본 `false`)을 더한다. 켜면 바깥 래퍼·트랙·채움을 `<span>`으로 그리고, `display:block`/`flex`/`position` 값으로 `<div>` 때와 같은 모양(폭 100%, 높이, radius, 채움 폭 전환)을 낸다. 라벨(`labelType`)이 있을 때의 배치도 같은 모양이어야 하지만, 이번 사용처는 `labelType="none"`뿐이다.
2. `ProgressBar.d.ts`에 prop 설명을 더한다(기본 false, 켜는 이유: 클릭 영역·`<a>`·`<button>` 안 phrasing 요건).
3. `ProgressBar.prompt.md`에 한 줄을 더한다(언제 켜는가).
4. `ProgressBar.stories.tsx`에 새 Story를 더한다: `inline` 켜고 끈 모양이 같음을 나란히 보이고, `<a>` 안에 놓인 사례 하나를 둔다.
5. `scripts/ds-sync-check.mjs`·매니페스트에 `ProgressBar`가 등록돼 있는지 확인하고 `npm run ds:check`가 오류 0이다.
6. 기존 사용처의 시험이 통과한다(`LockedItemDetail.test.tsx`, `cardFacePairs.test.tsx` 등). 기존 호출부는 코드 변경이 없다.

범위 밖: `RankingListRow`·`AchievementRow` 구현(3-5배치 본 티켓 20261107_1947), `ListRow`·`ListRowCard`, 진행 바 색·높이 값 변경.

## 판정이 필요한 점 (채원 사전 판정 입력)

1. **prop 이름**: `inline`을 기본안으로 하되 기존 prop 어휘(`labelType`·`fillMode`·`outlined`)와 어울리는 이름인지 확인한다(예: `inline`, `phrasing`, `as="span"`). 이름이 `ProgressBar.d.ts`·prompt·Story에 같은 뜻으로 쓰인다.
2. **라벨과의 조합**: `inline`이 `labelType`·`labelPosition`과 함께 쓰일 때의 마크업(`<span>` 래퍼의 flex 정렬)을 정한다. 이번 사용처가 없더라도 조합이 깨지지 않게 한다.
3. **접근성**: 진행 바는 정보인데 지금은 `role="progressbar"`가 없다. 이번 변경에서 속성을 더할지(기본 동작 변경이 되므로 `inline`일 때만 더할지) 정한다. 기존 호출부의 보조기술 읽기는 바뀌지 않아야 한다.
4. **연결 범위 분류**: 「연결된 컴포넌트 24종 — 서비스에 즉시 반영」 부류(`ds-connection-scope.md`)로 보고, 기존 호출처가 영향받지 않음을 어떻게 확인할지 정한다.

## 구현 계획

파일 단위 계획(계획 반환 면제 사유: 변경 파일이 원본 4개(`.jsx`·`.d.ts`·`.prompt.md`·`.stories.tsx`) 이내이고 위치가 확정돼 있다).

1. `ProgressBar.jsx` — `bar`(85~127줄)와 반환부(129~148줄)에서 `div`를 prop에 따라 `span`으로 바꾼다(`const Tag = inline ? 'span' : 'div'`). 기본 경로의 마크업은 한 글자도 바뀌지 않는다.
2. `ProgressBar.d.ts`, `ProgressBar.prompt.md` — 설명 추가.
3. `ProgressBar.stories.tsx` — 새 Story.
4. 기존 시험 통과 확인, `npm run ds:check`.

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- 새 prop을 켜지 않은 `ProgressBar`의 렌더 결과(마크업·인라인 스타일)가 이전과 한 글자도 다르지 않다(기존 호출처 10곳 영향 없음).
- 새 prop을 켜면 바깥·트랙·채움이 모두 `<span>`이고, 폭 100%·높이·radius·채움 폭 전환이 켜지 않았을 때와 같은 모양으로 보인다.
- `.d.ts`·`prompt.md`·Story가 같은 뜻으로 갱신돼 있고 Story에서 두 모양을 눈으로 비교할 수 있다.
- `npm run ds:check`가 오류 0이고 `scripts/verify.sh`와 기존 `ProgressBar` 사용처 시험이 통과한다.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)

- 머지 뒤 3-5배치 본 티켓(20261107_1947)을 이 prop을 써서 진행한다.
- staging에서 `ProgressBar`를 쓰는 화면(컬렉션 히어로, 미션 상세, 인벤토리, 온보딩 카드 등)이 그대로인지 확인한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
