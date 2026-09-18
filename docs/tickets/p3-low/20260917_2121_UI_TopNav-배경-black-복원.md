---
id: 20260917_2121
category: UI
priority: P3
status: CLOSED
created: 2026-09-17
closed: 2026-09-17
---

# [UI] TopNav 배경을 기본값(#000)으로 복원

## 배경 / 문제 정의

`TopNav`는 기본 배경이 `--color-bg`(`#000000`)인데, 티켓 `20260917_2042`(대체됨) 시절
페이지 배경이 `--color-surface`였을 때 그에 맞추려고 9개 화면이
`headerStyle={{ background: 'var(--color-surface)' }}`로 덮어쓰고 있었다. 티켓
`20260917_2105`로 페이지 배경이 그라데이션(위쪽 `#000`)으로 바뀌면서 이 덮어쓰기가
불필요해졌다 — 사용자가 TopNav 배경을 `#000`으로 바꿔달라고 요청, 실제로는 이 stale
오버라이드를 제거해 기본값이 적용되게 하는 것으로 해결.

## 상세 요구사항

아래 위치의 `headerStyle={{ background: 'var(--color-surface)' }}`(또는 그 변형)을
제거해 `TopNav` 기본 배경(`--color-bg`)이 그대로 적용되게 한다.

---
## 완료 기록

### 구현 내용 요약
9개 화면에서 stale `headerStyle` 오버라이드 제거:
- `page.tsx`, `MissionsListClient.tsx`, `DropsClient.tsx`, `ProfileClient.tsx`,
  `inventory/page.tsx`, `BadgesClient.tsx`: `headerStyle={{ background:
  'var(--color-surface)' }}` prop 삭제
- `MissionDetailClient.tsx`, `CombineClient.tsx`, `BadgeTreeClient.tsx`: 같은 prop을
  줄 단위로 제거
- `badges/[id]/page.tsx`: 배지 테마 배경 로직과 결합된 `topNavStyle`의 비테마 분기 fallback을
  `'var(--color-surface)'` → `undefined`로 변경(themedBackground일 때는 기존대로
  `'transparent'` 유지)

### 변경된 파일
```
jam-web/src/app/(main)/page.tsx
jam-web/src/app/(main)/combine/CombineClient.tsx
jam-web/src/app/(main)/missions/MissionsListClient.tsx
jam-web/src/app/(main)/missions/[id]/MissionDetailClient.tsx
jam-web/src/app/(main)/drops/DropsClient.tsx
jam-web/src/app/(main)/profile/ProfileClient.tsx
jam-web/src/app/(main)/inventory/page.tsx
jam-web/src/app/(main)/badges/BadgesClient.tsx
jam-web/src/app/(main)/badges/tree/BadgeTreeClient.tsx
jam-web/src/app/(main)/badges/[id]/page.tsx
jam-web/src/app/(main)/collections/[id]/page.tsx
```

### 테스트 결과
- [x] `npx eslint` 대상 파일 전체 — 0 errors(ProfileClient.tsx의 기존 무관 경고 1건만)
- [x] `npx tsc --noEmit` — 오류 없음

### 배포 정보
- 배포일: 2026-09-17
- 환경: staging
- 커밋: staging 직접 커밋

### 주요 의사결정 / 핵심 메모
- 경미 수정 기준(원인-결과 명확한 stale 값 제거) 충족으로 오케스트레이터가 직접 처리.
- **후속 처리**: `src/app/(main)/collections/[id]/page.tsx`가 자체 `PAGE_BG =
  'var(--color-surface)'` 상수를 페이지 루트와 TopNav 양쪽에 인라인 스타일로 쓰고 있어,
  티켓 `20260917_2105`의 grep(className 기반)에 걸리지 않아 그라데이션 적용에서 빠져
  있었다(사용자 확인 후 함께 정리). `PAGE_BG`를 `undefined`로 바꿔 테마가 없을 때도
  상위 그라데이션이 그대로 비치게 했다 — 테마가 있을 때의 `'transparent'` 분기와
  결과가 같아져 로직이 단순해졌다.

### 잔여 이슈
- 없음
