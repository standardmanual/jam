---
id: 20260910_1804
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-09-10
closed:
---

# [BadgeEngine] 사용량 지표(follower_count 등)를 다른 measurable 필드와 섞으면 두 엔진이 각자 독립 판정해 AND가 깨진다

## 배경 / 문제 정의

티켓 [20260910_1719(사용량 배지 반복형 조용한 오동작)](../P2-일반/20260910_1719_BadgeEngine_사용량배지-반복형-조용한오동작.md)의
개선 리뷰(progressive)에서 발견한 범위 밖 이슈.

사용량 지표 3종(`follower_count`/`following_count`/`daily_sync_count`, `role: 'meta'`,
티켓 20260910_1557)이 `repeat_count`가 아닌 **다른 measurable Strava 필드**(예:
`distance_km`)와 함께 저장되는 조합을 막는 가드가 없다.

메인 엔진(`badge-engine/index.ts:413`)의 fail-closed 분기는 "measurable 필드가 하나도
없을 때"만 발동한다. 그런데 `distance_km` 같은 measurable 필드가 하나라도 섞여 있으면 이
분기에 안 걸리고, 메인 엔진은 `follower_count` 값을 전혀 참조하지 않은 채 `distance_km`
조건만으로 발급을 진행할 수 있다. 동시에 `usageBadges.ts`의 `evaluateUsageBadges()`도
`distance_km`을 전혀 보지 않고 `follower_count` 조건만으로 같은 배지를 후보에 포함시킨다.

`CONDITION_JSON_SPEC.md` §4는 "모든 필드는 AND 조건"이라 명시하는데, 실제로는 두 경로 중
먼저 조건을 채운 쪽에서 조용히 단독 발급될 수 있어 이 원칙이 깨진다. 20260910_1719가 고친
반복형 문제와 같은 계열(가드 없는 조합 → 조용한 오동작)이며, 필드 조합만 다르다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 프로덕션에 이런 조합(사용량 지표 3종 중 하나 + 다른 measurable 필드)을 가진 기존 배지가
  실제로 있는지 먼저 확인한다(20260910_1719가 반복형 조합을 확인했던 것과 같은 방식 —
  `condition_json`을 서비스 롤 키로 직접 조회).
- 있다면 컨텐츠 정리(조건 수정 또는 배지 삭제)가 별도로 필요하다.
- `findConditionShapeSaveError`(`src/lib/admin/badge-condition-guards.ts` 체인,
  20260910_1719가 만든 `findUsageMetricRepeatConflictError`와 같은 자리)에 "사용량 지표는
  다른 measurable 필드와 함께 쓸 수 없다" 검사를 추가하는 방향을 우선 검토한다.

## 구현 계획
> 조사 후 구체화 — 20260910_1719의 저장 시점 가드 패턴을 그대로 재사용 가능.

1. 프로덕션 DB에서 사용량 지표 + 다른 measurable 필드 조합을 가진 배지 존재 여부 확인
2. 있다면 컨텐츠 정리 방안 결정(사용자 확인 필요할 수 있음)
3. 저장 시점 가드 추가, 회귀 테스트(기존 단독 사용량 지표·단독 measurable 조합엔 영향 없는지)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

1. **프로덕션 실태 조사** — 서비스 롤 키로 `badges` 테이블 전체(`condition_json`이 있는
   636건)를 REST API로 직접 조회해, 사용량 지표 3종(`follower_count`/`following_count`/
   `daily_sync_count`, `daily_sync_streak_days` 포함 4종 모두 확인)과 다른 measurable
   필드가 함께 저장된 배지가 있는지 확인했다. **해당하는 배지는 0건** — 컨텐츠 정리는
   불필요하다.
2. **저장 시점 가드 추가** — `findConditionShapeSaveError` 체인(`badge-condition-guards.ts`)에
   `findUsageMetricOtherMeasurableConflictError`를 새로 추가했다. 사용량 지표 4종
   (`USAGE_METRIC_CONDITION_KEYS`, role: meta) 중 하나라도 있는 조건에 `repeat_count`를
   제외한 다른 `role: 'measurable'` 필드(예: `distance_km`, `total_count`,
   `duration_minutes`)가 섞여 있으면 저장을 거부한다.
   - `repeat_count`는 `MEASURABLE_CONDITION_KEYS`에 포함돼 있지만, 그 조합은 이미
     `findUsageMetricRepeatConflictError`(티켓 20260910_1719)가 전담하므로 이 가드에서는
     명시적으로 제외했다(같은 조합에 두 에러가 겹쳐 뜨는 것을 방지).
3. **회귀 테스트** — 신규 가드 단독 케이스(사용량 지표 × 3종 각각 + distance_km/
   total_count/duration_minutes 조합, 정상 케이스, repeat_count 조합 제외 확인, null 조건)
   와 `findConditionShapeSaveError` 진입점 통합 케이스를 추가했다.

### 변경된 파일
```
jam-web/src/lib/admin/badge-condition-guards.ts
jam-web/src/lib/admin/__tests__/badge-condition-guards.test.ts
```

### 테스트 결과
- [x] `npx vitest run src/lib/admin/__tests__/badge-condition-guards.test.ts` — 44개 전체 통과
- [x] `npm run lint` (jam-web 전체) — 0 errors, 14 warnings (모두 이번 변경과 무관한 기존 경고
      — design-system stories/foundations의 미사용 변수·`<img>` 권고 등)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 새 에러 메시지("저장할 수 없습니다. 서비스 사용량 지표(...)는 다른 활동 조건(...)과
      함께 쓸 수 없습니다...")는 기존 `findUsageMetricRepeatConflictError`·
      `findRepeatRestConflictError` 등과 동일한 [현상]→[원인]→[해결책] 3단 구조·해요체를
      그대로 따랐다.

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- 프로덕션에 사용량 지표 + 다른 measurable 필드 혼합 조합이 실제로는 존재하지 않아, 이번
  작업은 순수 예방 가드로 마무리했다. 컨텐츠 정리 별도 작업은 불필요.
- 가드 위치는 티켓이 지정한 대로 `findConditionShapeSaveError` 체인
  (`findUsageMetricRepeatConflictError` 바로 다음)에 추가해, 어드민 조건 폼(클라이언트)과
  저장 API(`badge-validation.ts`) 양쪽이 같은 문자열로 거부하도록 했다.

### 잔여 이슈
-
