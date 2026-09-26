---
id: "20260926_1356"
category: BadgeEngine
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260926_1344"
  - "20260926_1245"
  - "20260921_1129"
---

# [BadgeEngine] `computeBookCompletion`을 `filledByBook` 없이 부르는 나머지 호출부 9곳도 북별 집합으로 맞춘다

> 2026-09-26 티켓 20260926_1344(완성 판정 정리 묶음) 게이트(민지)의 재작업 중 확인한 사실에서 나온 후속이다.

## 핵심 요약

- 요구사항: 묶음 티켓 20260926_1344로 보정 함수(`checker.ts`)와 `completable.ts`는 컬렉션별 집합(`buildFilledByBook`)으로 분자를 센다. 그러나 `computeBookCompletion`을 `filledByBook` 옵션 없이 부르는 호출부가 아직 있고 슬롯 배지를 하나의 집합에 모아 모든 북에 공통으로 쓴다. 배지의 컬렉션이 바뀐 경우 이 화면·API들이 보정 함수와 다른 완성 결과를 낼 수 있다. 옵션 없는 호출부의 이 기준을 컬렉션별 집합으로 맞출지 정하고 맞춘다.
- 대상 호출부(2026-09-26 `git grep`): `jam-web/src/app/(main)/badges/page.tsx:147`, `(main)/collections/[id]/page.tsx:235`, `(main)/[username]/collections/page.tsx:134`, `src/app/api/itembooks/route.ts:82`, `src/app/api/users/[username]/itembooks/route.ts:98`, `src/lib/today/exposure.ts:174,188`, `src/lib/today/status.ts:120`, `src/lib/notifications/batch/collections.ts:127`(빈 집합으로 분모만 쓰는 호출로 보이니 대상인지 먼저 확인한다).
- 구현 계획: 각 호출부가 슬롯·체크인 이력을 어떻게 읽는지 확인하고 `buildFilledByBook`(`lib/itembook/filled-by-book.ts`)으로 바꾼다. 화면 표시가 바뀌므로 호출부별로 회귀 테스트를 함께 정한다(티켓 20260921_1129와 함께 다룬다).

## 완료 조건

- 위 호출부(알림 배치는 대상 여부 확인 후)가 `filledByBook`을 넘기거나, 넘기지 않아도 되는 근거가 호출부별로 기록되어 있다. `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
