---
id: "20261001_1204"
category: UI
priority: P2
status: CLOSED
created: 2026-10-01
closed: 2026-10-01
parent: "20260930_1453"
specs:
  - "docs/specs/prd/home-feed/PRD.md"
---

# [UI] MODULAR `LabelChip`과 카드 눌림 토큰을 만든다 (1453-b0)

> 상위: 20260930_1453 「확정 설계」 4절·8절·11절 조각 b0 · 결정 15 · 티켓 20260927_2235·20260927_2236 흡수

## 핵심 요약

- 요구사항: 홈 화면에 세 번 복제된 칩 라벨 마크업을 MODULAR 신규 컴포넌트 `LabelChip` 하나로 합치고(픽셀 동일), 카드 눌림 배율 토큰
  `--scale-press-card: 0.98`과 공용 클래스 `.jam-press`를 만든다. 두 가지 모두 사용자가 2026-09-30 결정 15로 승인했다.
- 구현 계획: 이 조각은 `LabelChip`을 현황 줄과 온보딩 퀘스트 카드 두 곳에만 적용한다. 투데이 카드(`TodayCardStack.tsx`의 `TemplateChip`)와
  카드 눌림 적용은 새 카드 그리기 조각 b2에서 한다. `TodayCardStack.tsx`는 티켓 20260930_1645가 고치는 중이라 이 조각에서 건드리지 않는다.
- 관련 파일:
  - MODULAR: `jam-web/design-system/components/` 아래 `LabelChip`(구현·타입·Story. 폴더와 파일 형식은 기존 컴포넌트를 따르고 채원이 정한다),
    `jam-web/design-system/_ds_manifest.json`과 readme(`npm run ds:manifest`로 생성)
  - 토큰: `jam-web/design-system/tokens/motion.css` 21줄 `--scale-press` 옆에 `--scale-press-card: 0.98`. 시간은 기존 `--duration-micro`(80ms, 10줄)를 쓴다
  - 클래스: `jam-web/src/components/transitions.css`(601줄) 「프로젝트 확장」 절에 `.jam-press`(눌림 시 `transform: scale(var(--scale-press-card))`,
    `transition-duration: var(--duration-micro)`, `prefers-reduced-motion: reduce`에서는 배율과 전환이 없다)
  - 적용: `jam-web/src/app/(main)/TodayStatusStrip.tsx` 26줄 `CellLabel`과 사용처 39~119줄, `jam-web/src/app/(main)/OnboardingQuestCard.tsx`의 칩 마크업(21줄 주석이 출처를 적는다)과 그 테스트
  - 참고(이 조각에서 고치지 않음): `jam-web/src/app/(main)/TodayCardStack.tsx` 45줄 `TemplateChip`, 89·125·170·201·227·284줄의 `active:scale-[0.98] … duration-100`

## 배경 / 문제 정의

- 칩 라벨 마크업이 `TodayStatusStrip`·`OnboardingQuestCard`·`TodayCardStack` 세 곳에 복제돼 있다(티켓 2235).
- 카드 눌림이 클래스 문자열 `active:scale-[0.98] transition-transform duration-100`로 여섯 곳에 흩어져 있고, 동작 줄이기 설정을 따르지 않는다(티켓 2236).
- 2235·2236은 1453 구현 뒤로 미뤄졌고(티켓 20260930_1451 사용자 결정), 1453 결정 15로 이 조각에 흡수됐다.

## 구현 계획

1. 지금 칩 세 곳의 마크업을 비교해 `LabelChip`의 props(글자, 색조 변형 등)를 정한다. 적용한 두 곳의 렌더 결과는 지금과 픽셀 단위로 같아야 한다.
2. `LabelChip` Story에 지금 쓰이는 변형을 모두 넣는다.
3. 토큰과 `.jam-press`를 더한다. 이 조각에서는 `.jam-press`를 어디에도 적용하지 않아도 된다(b2에서 카드에 적용한다). 적용처가 없어 검사가
   경고하면 Story나 테스트에서 확인 경로를 만든다.
4. `npm run ds:manifest`로 매니페스트를 다시 만들고 `npm run ds:check`를 통과시킨다.

## 완료 조건

- `TodayStatusStrip`·`OnboardingQuestCard`의 칩이 `LabelChip`을 쓰고, 렌더된 클래스·크기·색이 바뀌기 전과 같다(기존 테스트 통과, 필요하면 스냅숏 비교).
- `LabelChip` Story가 있고 `npm run ds:check`가 통과한다.
- `--scale-press-card: 0.98`이 `motion.css`에 있고, `.jam-press`가 `transitions.css` 한 곳에서 정의되며 동작 줄이기 설정에서 배율이 없다.
- 홈 화면에서 현황 줄과 온보딩 퀘스트 카드의 모습이 바뀌지 않는다.
- `scripts/verify.sh`가 통과한다.
- 완료 기록에 ds 연결 범위와, b2에서 카드 눌림 시간이 100ms에서 80ms로 바뀐다는 메모를 남긴다(1453 가정 A10).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
MODULAR 신규 컴포넌트 `LabelChip`(카드 좌상단 라벨 필)을 만들고 현황 줄(`TodayStatusStrip`)과 온보딩 퀘스트 카드(`OnboardingQuestCard`)의 칩 복제 두 곳을 이 컴포넌트로 바꿨다. 인라인 스타일 열 개 값은 기존 Tailwind 클래스의 계산값과 같다(픽셀 동일). 카드 눌림 배율 토큰 `--scale-press-card: 0.98`과 공용 클래스 `.jam-press`(시간 `--duration-micro` 80ms, 이징 `--ease-out`, 동작 줄이기에서 배율·전환 없음)를 만들었고, 적용은 b2에서 한다. 티켓 20260927_2235·20260927_2236의 공용화 부분을 흡수했다(두 티켓의 CLOSED는 카드 쪽 적용이 끝나는 1453-b7에서 한다).

### 변경된 파일
```
jam-web/design-system/_ds_manifest.json
jam-web/design-system/components/cards/LabelChip.d.ts
jam-web/design-system/components/cards/LabelChip.jsx
jam-web/design-system/components/cards/LabelChip.prompt.md
jam-web/design-system/components/cards/LabelChip.stories.tsx
jam-web/design-system/foundations/Motion.stories.tsx
jam-web/design-system/readme.md
jam-web/design-system/tokens/motion.css
jam-web/src/app/(main)/OnboardingQuestCard.test.tsx
jam-web/src/app/(main)/OnboardingQuestCard.tsx
jam-web/src/app/(main)/TodayStatusStrip.test.tsx
jam-web/src/app/(main)/TodayStatusStrip.tsx
jam-web/src/components/LabelChip.test.tsx
jam-web/src/components/transitions.css
jam-web/src/components/transitions.test.ts
```

### 테스트 결과
- [x] LabelChip.test.tsx(계산 스타일 열 개 값, 빈 children null, props 통과), transitions.test.ts(.jam-press 단일 정의·토큰 사용·reduce 해제), OnboardingQuestCard.test.tsx(상태 4종 칩), 신규 TodayStatusStrip.test.tsx — 채원 독립 재실행 58개 통과
- [x] `npm run ds:check` 오류 0
- [x] CI verify 성공(run 36809923388), 게이트 PASS, 채원② 중대 문제 없음
- [ ] Storybook·홈 화면 눈 확인: 하지 않았다(계산값 대조·단위 테스트로만 확인). staging 홈에서 현황 줄·퀘스트 카드 칩이 전과 같은지 사용자 확인 대상

### 배포 정보
- 배포일: 2026-10-01 staging 반영. 프로덕션은 `/jam-ship` 대기
- 환경: staging
- 커밋: c8095499c(토큰·클래스), d2576701b(LabelChip), 09018a198(호출부 교체)

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 채원①·구현·게이트∥채원② | jam-designer, jam-developer, jam-reviewer, jam-designer | 363,479 | 96,129 / 47,106 (채원① 65,711) | 19분 23초 | 144 |
| 합계 | 4 | 363,479 | 96,129 / 47,106 | 19분 23초 | 144 |

### 주요 의사결정 / 핵심 메모
- 채원① 판정: MODULAR 확장(신규 컴포넌트). 기존 ShapeTag·RarityBadge·BadgeLevelChip은 크기·용도가 달라 재사용할 수 없다. 변형 prop(tone·size)은 만들지 않았다(지금 쓰이는 모양이 하나뿐이고 변형은 새 디자인 결정). `self-start`는 부모 배치에 달린 것이라 호출부 className으로 남겼다. 새 컴포넌트·토큰은 1453 결정 15로 승인돼 있어 `needsApproval: false`였다.
- ds 연결 범위: 토큰(`motion.css`는 globals.css가 직접 import해 즉시 반영, 이번 조각은 사용처 0) + 연결된 컴포넌트 신규 편입(서비스가 `@ds/components/cards/LabelChip`을 import, 병존 구현 없음). `.jam-press`는 서비스 CSS라 DS 네 부류 밖이다. 연결된 컴포넌트는 21종에서 22종이 됐다.
- b2 메모(1453 가정 A10): 카드 눌림이 100ms·Tailwind 기본 이징에서 80ms·`--ease-out`으로 바뀐다. 카드 래퍼가 `display:block`이어야 하고 비활성 카드에는 붙이지 않는다. 남은 눌림 문자열은 `TodayCardStack.tsx` 6곳과 `TodayStatusStrip.tsx` 22줄 `CELL_CLASS`다.
- 아현이 홈피드 PRD 동기화 검사를 `JAM_SKIP_DOCLINT=1`로 건너뛰었고 사유(렌더 결과가 같아 PRD 서술 변화 없음)를 커밋에 남겼다. 민지가 타당하다고 판정했다.
- `_ds_manifest.json`에 기존 드리프트(`--duration-quest-pulse`·`--ease-quest-pulse`) 2건이 재생성 결과로 함께 들어갔다.
- 범위 밖 발견물: 기사 화면 반전 칩 → 20261001_1248(P3), DS 문서·Story 정리 3건 → 20261001_1249(P3).

### 잔여 이슈
- staging 홈에서 현황 줄·온보딩 퀘스트 카드 칩의 모습이 전과 같은지 눈으로 확인한다.
