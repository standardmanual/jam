---
id: "20261107_2156"
category: UI
priority: P2
status: CLOSED
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
5. `jam-web/scripts/ds-sync-check.mjs`·매니페스트에 `ProgressBar`가 등록돼 있는지 확인하고 `npm run ds:check`가 오류 0이다.
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
## 완료 기록

### 구현 내용 요약

- `ProgressBar`에 `as?: 'div' | 'span'`(기본 `'div'`)을 더했다. `'span'`이면 바깥 래퍼 3곳(라벨 없음·`labelPosition="top"`·라벨 inline)과 트랙, 채움 2갈래(solid·track-gradient)를 모두 `<span>`으로 그린다. `display:block`은 span 경로에서만 조건부 스프레드로 붙고(라벨 없는 바깥과 트랙), flex 래퍼와 채움에는 붙이지 않는다. div 경로의 스타일 키 순서와 마크업은 바뀌지 않는다. `role`·`aria-*`는 더하지 않았다.
- `ProgressBar.d.ts`(`ProgressBarAs` 타입), `ProgressBar.prompt.md`(«추가 — span 렌더» 절), `ProgressBar.stories.tsx`(Story `AsSpan`, play 함수 단정)를 같은 뜻으로 갱신했다.
- 새 시험 `src/components/ui/__tests__/ProgressBar.markup.test.tsx`(92건)를 추가했다.

### 채원 사전 판정 (needsApproval: false)

- 재사용이 아니라 **MODULAR 확장**이다(좁은 범위). 새 컴포넌트·새 토큰·서비스 전용 바는 없다.
- prop 이름은 티켓 기본안 `inline`이 아니라 `as`로 정했다. 이 컴포넌트에 이미 `labelPosition="inline"`(라벨이 바 옆)이 있어 `inline`이 두 뜻이 되기 때문이다. `as="span"`은 «어떤 태그로 그리는가»를 그대로 말한다. 다른 컴포넌트로 확산시키지 않고 `ProgressBar` 한정으로 `prompt.md`에 적었다.
- 접근성 속성(`role`·`aria-*`)은 이번에 더하지 않는다(읽기가 바뀌는 판단이라 별도 티켓).
- 연결 범위: 「연결된 컴포넌트 — 서비스에 즉시 반영」. 서비스 사본이 없어 `@ds/components/feedback/ProgressBar`를 직접 import하는 호출부에 즉시 반영되고, 병존 구현이 아니다. 영향 호출부는 9개 파일 10곳(`OnboardingQuestCard` 2곳, `[username]/collections/page`, `TodayStatusStrip`, `ItemBookHeroSection`, `inventory/page`, `MissionDetailClient`, `MissionStatusClient`, `RankingListRow`, `CollectionGridCard`)이고 모두 `as`를 켜지 않는다. 티켓에 적었던 `DualAxisGauge`는 티켓 20261018_1817에서 이미 삭제됐다. `jam-web/scripts/ds-sync-check.mjs`에는 `ProgressBar`가 등록돼 있지 않고 병존 페어에도 없다.

### 게이트 결과 (민지 WARN, 채원 사후 중대 문제 없음)

- 브랜치 CI `verify` success(run 42375723854).
- 불변 증명: 수정 전 코드에서 29개 조합(실제 호출 11개, 라벨 percent·fraction × inline·top, track-gradient, outlined, className, 폭 경계 0·100·음수·100 초과·total 0·없음)의 마크업을 뽑아 시험에 고정했고, 수정 후 29개가 한 글자도 다르지 않다(시험 92건 통과). 민지가 `ProgressBar.jsx`를 수정 전 버전으로 되돌려 기본 경로 58건이 통과하는 것까지 독립적으로 재현했다.
- WARN 사유: Storybook `AsSpan`의 눈 확인을 하지 못했다(격리 워크트리 경로의 `!` 때문에 `storybook dev`가 스토리를 찾지 못함). Story play 함수의 단정(높이 6px·radius·채움 폭·`<div>` 부재)은 CI에서 돌지 않아 실행으로 검증된 적이 없다. 메인 트리에서도 확인하지 못했다(아래).
- 사용자가 머지를 승인했다(2026-11-07).
- 머지 중에 병렬 세션이 `origin/staging`에 컬러 개편 티켓 커밋(47a755ff5)을 올려 리뷰 브랜치가 최신 staging의 조상을 물지 않게 됐다. 임시 워크트리에서 최신 `origin/staging` 위에 같은 커밋을 cherry-pick해(문서만 달랐고 충돌 없음) 머지했다.

### 변경된 파일

```
jam-web/design-system/components/feedback/ProgressBar.jsx
jam-web/design-system/components/feedback/ProgressBar.d.ts
jam-web/design-system/components/feedback/ProgressBar.prompt.md
jam-web/design-system/components/feedback/ProgressBar.stories.tsx
jam-web/src/components/ui/__tests__/ProgressBar.markup.test.tsx (신규)
```

### 테스트 결과
- [x] 브랜치 CI `verify` success, `scripts/verify.sh` 전 항목 통과(아현 실행), `ds:check` 오류 0
- [x] 기존 호출처 29개 조합 마크업 불변 증명(아현), 수정 전 코드 재현(민지)
- [ ] Storybook `AsSpan` 눈 확인, play 함수 실행: 하지 못함. 메인 트리 개발 환경이 병렬 세션의 컬러 개편 작업 중이라 머지 코드가 반영된 Storybook을 띄우지 못했다
- [ ] staging 화면 확인과 Vercel 배포 상태: push 뒤 확인

### 주요 의사결정 / 핵심 메모

- 이번 티켓은 `as`를 켜는 호출부가 없어 화면이 달라지지 않는다. 켜는 곳은 3-5배치 본 티켓(20261107_1947)의 `RankingListRow`다.
- 후속으로 P3 티켓 셋을 올렸다: 20261107_2243(진행 바 접근성 `role`), 20261107_2244(`prefers-reduced-motion` 처리 없음), 20261107_2245(`AsSpan` Story 간격값을 토큰으로).

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1회차 | 4 | 224,120 | 25,300 / 7,932 | 20분 17초 | 82 |
| 합계 | 4 | 224,120 | 25,300 / 7,932 | 20분 17초 | 82 |
