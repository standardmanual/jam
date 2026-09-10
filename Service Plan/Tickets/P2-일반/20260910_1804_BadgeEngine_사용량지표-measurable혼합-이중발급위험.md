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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [ ] 어드민 에러 메시지를 추가한다면 UX Writing 가이드 검증 필요

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
