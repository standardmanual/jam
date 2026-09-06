---
id: 20260906_1928
category: BadgeEngine
status: OPEN
created: 2026-09-06
closed:
---

# [BadgeEngine] `overrideFirstSync` 이중 의미 정리 · 회귀 테스트 고정

> 선행: `20260906_1431`(카탈로그 확장 시 기존유저 재평가 경로 신설). 개선 리뷰 제안에서 분리
> (2026-09-06 사용자 승인).

## 배경 / 문제 정의

티켓 `20260906_1431` 게이트 리뷰에서 실제 회귀가 하나 발견됐다. `evaluateBadgesDetailed`의
`overrideFirstSync` 파라미터가 **하나의 값으로 서로 다른 두 가지 의미**를 동시에 표현하고
있었기 때문이다.

- `isFirstSync = overrideFirstSync ?? !userInitialSyncDone` — 첫 싱크 게이트(Common/Lv.1
  제한) 적용 여부
- `!dryRun && !overrideFirstSync && !userInitialSyncDone` (수정 전) — `users.initial_sync_done`을
  `true`로 갱신할지 여부

이 두 조건이 **같은 변수의 "값"에 얽혀 있어서**, 카탈로그 재평가 배치(`reevaluateCatalog.ts`)가
"게이트는 적용하지 말고, 상태 갱신도 하지 말라"는 조합을 표현할 방법이 코드에 없었다.
1차 시도(`overrideFirstSync` 미전달)는 상태가 조용히 갱신되는 회귀를, 사용자가 처음
승인한 방향("항상 `true` 전달")을 문자 그대로 구현했다면 반대로 게이트가 전원에게
강제 적용되는 회귀를 냈을 것이다 — 실제로는 가드 판정 기준을 `!overrideFirstSync`(값 기준)에서
`overrideFirstSync === undefined`(호출 의도 기준)로 바꾸고 `overrideFirstSync: false`를
명시하는 것으로 해소했다(`jam-web/src/lib/badge-engine/index.ts`).

**지금 상태로는 다음에 이 파라미터를 쓰는 새 호출부가 추가되면 같은 함정에 다시 빠질 수 있다**
— 값 3가지(`true`/`false`/`undefined`)가 서로 다른 계약을 갖는다는 것이 타입 선언만 봐서는
드러나지 않는다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `jam-web/src/lib/badge-engine/index.ts`의 `overrideFirstSync?: boolean` 타입 선언부에
  "값과 `undefined`가 서로 다른 계약을 가진다"는 인라인 JSDoc을 추가한다 — 최소한의 방어선.
- (판단 필요) 장기적으로 이 파라미터를 관심사별로 분리하는 리팩터링을 검토한다 —
  예: `overrideFirstSync?: boolean`(게이트 적용 여부)과 `skipInitialSyncFlagUpdate?: boolean`
  (상태 갱신 여부)로 나누면 이중 의미 자체가 사라진다. 기존 호출부(`/api/admin/simulate`,
  `strava/sync.ts`, `reevaluateCatalog.ts`) 전부 마이그레이션이 필요한 범위이므로,
  타입 주석만으로 충분한지 리팩터링까지 필요한지는 구현자가 판단한다.
- `overrideFirstSync`의 `true`/`false`/`undefined` 3가지 값 각각에 대해
  "게이트 적용 여부"·"`initial_sync_done` 갱신 여부"를 고정하는 유닛 테스트를 추가한다.
  지금은 이 계약이 프로덕션 공유 DB에 대한 수동 SELECT 검증에만 의존하고 있어 재발 방지
  안전망이 약하다.

### UI/UX 관점

해당 없음.

### 컨텐츠 관점

해당 없음.

## 구현 계획

1. JSDoc 보강 (최소 조치)
2. 유닛 테스트 3종(true/false/undefined) 추가
3. 리팩터링 여부 판단 — 필요하다고 판단되면 기존 호출부 3곳 함께 마이그레이션

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증
사용자 노출 텍스트 없음 — 해당 없음.

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
