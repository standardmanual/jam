---
id: 20260820_006
category: UI
status: CLOSED
created: 2026-08-20
closed: 2026-08-20
---

# [UI] ProgressBar에 radius override 추가 + MissionStatusClient 마저 전환

## 배경 / 문제 정의

티켓 20260820_005에서 6개 실사용처 중 5곳을 `@ds/components/feedback/ProgressBar`로
전환했다. `MissionStatusClient.tsx`(미션 랭킹, `RankingListRow`/`MyRankCard` 2곳)만
`ProgressBar`가 radius를 `var(--radius-pill)`로 하드코딩하고 오버라이드 prop이 없어
보류됐다 — 이 화면은 원래 radius 3px(임의값) + 순위별 그라데이션 필 + `transform: scaleX()`
구현 방식을 쓴다.

이 티켓은 `ProgressBar`에 `radius` prop을 추가해 마지막 1곳까지 전환을 완료한다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **`design-system/components/feedback/ProgressBar.jsx` + `.d.ts` 확장**: `radius?: string`
   prop 추가, 기본값은 기존 그대로 `var(--radius-pill)`(하위 호환 — 기존 5개 호출처와
   `ProgressBar.stories.tsx`에 영향 없어야 함). `MissionStatusClient`가 쓰던 `3px`를 그대로
   전달할 수 있게 문자열(px 값)을 받는다.
2. **`ProgressBar.stories.tsx`에 radius override 예시 Story 추가** (pre-commit 훅이 컴포넌트
   변경 시 Story 동반을 확인한다).
3. **`MissionStatusClient.tsx` 전환**: `RankingListRow`/`MyRankCard` 2곳의 `transform:
   scaleX()` 기반 인라인 마크업을 `<ProgressBar percent={...} color={getRankGradient(entry.rank)}
   radius="3px" labelType="none" trackColor="var(--color-surface-elevated)" height={6} />`로
   교체. `ProgressBar`는 `width` 기반 애니메이션(다른 5곳과 동일 방식)을 쓰므로 `scaleX` 대비
   구현 방식이 달라지지만 최종 렌더링 결과(채워진 비율)는 동일해야 한다 — 이 차이가 실제
   애니메이션 체감에 영향 있는지도 확인.
4. **회귀 없음 확인**: 기존 5개 호출처(`radius` prop 안 쓰는 곳들)가 계속 `var(--radius-pill)`
   기본값을 그대로 쓰는지 확인 — prop 추가가 기본 동작을 바꾸면 안 된다.

### UI/UX 관점

- 미션 랭킹 화면의 시각적 결과(그라데이션, radius 3px, 트랙 색)는 교체 전후로 동일해야 한다 —
  순수 리팩터링.

## 구현 계획

1. `ProgressBar.jsx`/`.d.ts`에 `radius` prop 추가 (기본값 유지, 하위 호환)
2. Story 추가
3. `MissionStatusClient.tsx` 2곳 전환
4. staging에서 dev-login으로 미션 랭킹 화면 실제 확인 (순위 그라데이션·radius 3px 유지 확인)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `ProgressBar.jsx`/`.d.ts`에 `radius` prop 추가 (기본값 `var(--radius-pill)` 유지, 하위 호환).
  트랙 div와 필 div의 `borderRadius`를 하드코딩 `var(--radius-pill)`에서 `radius` prop 참조로 교체.
- `ProgressBar.stories.tsx`에 `RadiusOverride` Story 추가, `RealServiceContext`의
  MissionStatusClient 예시에도 `radius="3px"` 반영.
- `MissionStatusClient.tsx`의 `RankingListRow`/`MyRankCard` 2곳을 `scaleX` 기반 인라인
  마크업에서 `<ProgressBar percent radius="3px" color={gradient} trackColor height={6}
  labelType="none" />`로 교체.
- 기존 5개 호출처(`MissionDetailClient`, `inventory/page`, `ItemBookHeroSection`,
  `[username]/itembooks/page`, `CollectionGridCard`)는 `radius` prop을 쓰지 않아 기본값
  `var(--radius-pill)`을 그대로 사용 — 회귀 없음 확인(grep으로 radius 미사용 확인).

### 변경된 파일
```
design-system/components/feedback/ProgressBar.jsx
design-system/components/feedback/ProgressBar.d.ts
design-system/components/feedback/ProgressBar.stories.tsx
design-system/components/feedback/ProgressBar.prompt.md
src/app/(main)/missions/[id]/status/MissionStatusClient.tsx
```

### 테스트 결과
- [x] `npx tsc --noEmit` — MissionStatusClient/ProgressBar 관련 오류 없음
- [x] `npx eslint` (변경 파일) — 관련 에러 없음 (기존 미사용 변수 경고 2건은 이번 변경과 무관)
- [ ] staging dev-login 실제 화면 확인 — 이 브랜치가 staging에 병합되기 전이라 미반영,
      병합 후 확인 필요

### UX Writing 검증
- 해당 없음 (순수 리팩터링, 노출 텍스트 변경 없음)

### 배포 정보
- 배포일: 2026-08-20
- 환경: staging
- 커밋: 브랜치 병합 (staging), 프로덕션 미배포 — 사용자 승인 대기

### 주요 의사결정 / 핵심 메모
- 애니메이션 방식이 `transform: scaleX()`(GPU 합성, transform-origin: left)에서
  `width` 애니메이션(`transition: width var(--duration-slow) var(--ease-smooth-out)`,
  다른 5곳과 동일 방식)으로 바뀐다. 토큰 실측값은 `--duration-slow: 400ms`(기존 `0.4s`와 동일),
  `--ease-smooth-out: cubic-bezier(0.22, 1, 0.36, 1)`(기존 `ease`와 유사한 ease-out 계열) —
  속도·체감 차이는 미미할 것으로 판단. 다만 `width` 트랜지션은 `transform`과 달리 매 프레임
  레이아웃 리플로우를 유발해 GPU 합성보다 성능 비용이 약간 더 든다(다른 5곳과 동일 트레이드오프를
  공유하는 것이므로 이번 티켓 범위에서는 허용).

### 잔여 이슈
- staging 병합 후 실제 화면(순위 그라데이션·radius 3px·애니메이션 체감)을 dev-login으로
  확인해야 함.
