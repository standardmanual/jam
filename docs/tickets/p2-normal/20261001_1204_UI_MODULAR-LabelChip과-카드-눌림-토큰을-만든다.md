---
id: "20261001_1204"
category: UI
priority: P2
status: OPEN
created: 2026-10-01
closed:
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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|

### 주요 의사결정 / 핵심 메모
- 새 컴포넌트와 새 토큰은 1453 결정 15로 사용자가 승인했다. 크기 기준 면제는 1453 결정 20에 따른다.

### 잔여 이슈
-
