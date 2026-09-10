---
id: 20260910_2027
category: Admin
priority: P2
status: CLOSED
created: 2026-09-10
closed: 2026-09-10
---

# [Admin] `daily_sync_count` 조건 필드의 native `max` 속성이 실제 저장값을 초과해 수정 저장을 막을 수 있음

## 배경 / 문제 정의

티켓 20260910_1959(사용량 배지 3종 생성) 게이트 리뷰 중 발견된 범위 밖 이슈. 원인 파일은
이번 티켓이 아니라 선행 티켓 20260910_1557 산출물이다.

`conditionRegistry.ts`의 `daily_sync_count` 필드가 `max: 100`으로 선언돼 있고
([conditionRegistry.ts:1543](../../../jam-web/src/lib/badge-engine/conditionRegistry.ts:1543)),
이 값은 `BadgeForm.tsx:492`에서 `<input type="number" max={meta.max}>`에 그대로 스프레드된다.
같은 폼(`BadgeForm.tsx:563`의 `<form>`)에 `noValidate`가 없어 브라우저 네이티브 검증이 활성
상태다.

티켓 20260910_1959로 `daily_sync_count=1,000,000`짜리 배지("백만 번의 동기화")가 이미 생성돼
있다. 이 배지를 향후 `/admin/badges/{id}` 개별 수정 화면에서 열어 "수정 저장"을 누르면 — 그
필드를 건드리지 않아도 — 현재 값(1,000,000)이 `max=100`을 초과해 제출이 조용히 막힐 수 있다.

`follower_count`·`following_count`는 `max: 1,000,000`으로 선언돼 있어 이 문제가 없다.
`daily_sync_count` 1개 필드만의 문제다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `conditionRegistry.ts`의 `daily_sync_count` 필드 `max` 값을 실사용 가능한 상한으로 올린다
  (예: 다른 두 지표와 동일하게 1,000,000, 또는 그 이상 — 의도적으로 달성 불가능한 히든 조건을
  또 만들 가능성을 감안해 여유 있게 잡는다).
- 또는 `BadgeForm.tsx`의 `<form>`에 `noValidate`를 추가해 브라우저 네이티브 검증 자체를 끄고
  서버/클라이언트 커스텀 검증으로 대체하는 방법도 있으나, 이는 이 필드만의 문제를 넘어 폼
  전체의 검증 방식을 바꾸는 더 큰 변경이라 범위가 다르다 — 이번 티켓은 `max` 값 조정만 다룬다.

## 구현 계획

`conditionRegistry.ts`의 `daily_sync_count` 필드 선언에서 `max` 값만 수정한다. 코드 변경
1줄 수준이므로 파이프라인 없이 직접 처리 가능(SKILL.md "경미 수정" 기준 충족 여부는 담당자
판단).

### Acceptance Criteria

1. `daily_sync_count` 조건을 가진 배지를 `/admin/badges/{id}` 수정 화면에서 값 변경 없이
   "수정 저장"을 눌러도 정상 저장된다.
2. 기존 다른 조건 필드의 `max` 동작에는 영향이 없다.

### Files Reference

| 파일 | 변경 |
|---|---|
| `jam-web/src/lib/badge-engine/conditionRegistry.ts:1543` | `daily_sync_count` 필드 `max` 값 상향 |

### Out of Scope

- 폼 전체의 네이티브 검증 방식(`noValidate`) 변경

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

`conditionRegistry.ts`의 `daily_sync_count` 필드 `max` 값을 100에서 1,000,000으로 올렸다.
`follower_count`·`following_count`와 동일한 상한으로 맞춰, 이미 생성된 "백만 번의 동기화"
배지(`daily_sync_count: 1,000,000`)가 향후 어드민 개별 수정 화면에서 값 변경 없이 저장돼도
더 이상 브라우저 네이티브 `max` 검증에 막히지 않는다.

경미 수정 기준(파일 1개, diff 1줄, 원인-결과 1:1 명확)에 해당해 파이프라인 없이 직접 처리했다.

### 변경된 파일
```
jam-web/src/lib/badge-engine/conditionRegistry.ts
```

### 테스트 결과
- [x] `npx eslint src/lib/badge-engine/conditionRegistry.ts` — 오류·경고 0건
- [x] 코드 레벨 확인 — `max: 1000000`으로 변경되어 기존 배지 값(1,000,000)이 더 이상 상한을
      초과하지 않음을 확인. 실브라우저 검증은 생략(경미 수정 기준, 후속 티켓 20260910_2055의
      어드민 실렌더 검증 범위에서 함께 확인될 예정)

### 배포 정보
- 환경: staging (프로덕션 승격은 `/jam-ship`으로 별도 진행)

### 주요 의사결정 / 핵심 메모
- `noValidate` 도입(폼 전체 네이티브 검증 방식 변경)은 원 티켓이 명시한 대로 범위 밖으로
  유지했다 — `max` 값 상향만으로 문제가 해소되므로 더 큰 변경을 끌어올 이유가 없었다.

### 잔여 이슈
- 없음
