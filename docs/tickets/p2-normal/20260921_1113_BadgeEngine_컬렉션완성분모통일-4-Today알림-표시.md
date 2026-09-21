---
id: 20260921_1113
category: BadgeEngine
priority: P2
status: CLOSED
created: 2026-09-21
parent: "20260914_1130"
closed: 2026-09-21
---

# [BadgeEngine] 컬렉션 완성 분모 통일 ④ Today·알림 표시

## 핵심 요약

- 요구사항: Today 화면의 진행 중 컬렉션과 컬렉션 알림 배치가 분모를 드랍 제외 배지를 뺀 기준으로 계산하게 한다.
- 관련 파일: `lib/today/status.ts`, `lib/today/exposure.ts`, `lib/notifications/batch/collections.ts`, 관련 테스트(`lib/today/__tests__/today-logic.test.ts`, `lib/notifications/__tests__/batch-drafts.test.ts`)
- 상위 티켓: 20260914_1130 (사용자 결정 2026-09-21: 「완성 판정과 보상까지 포함해 드랍 제외 배지를 분모에서 뺀다」)

## 배경 / 문제 정의

개별 배지 `badges.drop_excluded = true`는 컬렉션 완성 분모에서 제외한다는 정책(티켓 20260911_2236 확정)을 지금은 드랍엔진(`lib/drop-engine/index.ts`의 `buildBadgeIdsOfBook`)만 따른다. 완성 판정·보상 발급·화면 표시는 배지 전체를 센다. 사용자 결정으로 이 정책을 전 구간에 통일한다. 설계안의 공통 원칙은 아래와 같다.

- **분모**: 컬렉션 소속 배지에서 `drop_excluded = true`를 뺀 id 집합.
- **분자**: 사용자가 장착(`user_item_book_slots.badge_id`)했거나 획득한 배지 id 집합과 분모의 **교집합 크기**. 슬롯 개수(count)를 그대로 쓰지 않는다. 제외 배지를 이미 장착한 사용자가 조기 완성되거나 「9/8」이 되는 것을 막는다.
- **공용 함수**: `jam-web/src/lib/itembook/completion-basis.ts`의 순수 함수 `computeBookCompletion`. 입력은 `{id, item_book_id, type, drop_excluded}` 배지 목록과 채운 배지 id 집합, 옵션 `types`(예: item, item+checkin)다. 출력은 북별 `{denomIds, filledIds, total, filled, complete}`다. 분모는 `buildBadgeIdsOfBook`을 재사용한다(이 함수는 type을 보지 않으므로 호출 전에 types로 거른다).
- **사용자 결정으로 확정한 범위 밖 항목**: (1) 소프트 삭제 배지 처리가 위치마다 다른 문제(checker·completable은 삭제 배지를 분모에 포함, RPC·화면은 제외)는 이번에 통일하지 않는다. 별도 티켓 20260921_1114에서 다룬다. (2) checker의 catch-up 경로가 포인트를 지급하지 않는 현행 동작은 그대로 둔다. (3) 이미 완성 기록이 있는 사용자의 기록·보상은 건드리지 않는다.
- **의도된 동작**: 제외 배지를 보유하지 않은 채 나머지를 모두 장착한 사용자는 재계산으로 즉시 완성 처리된다(티켓 20260911_2236 확정).

## 상세 요구사항

### 서비스/코드베이스 관점
- `today/status.ts`·`today/exposure.ts`는 슬롯 개수와 배지 개수를 비교한다. 슬롯 select에 `badge_id`를 추가하고 공용 함수로 교체한다.
- `notifications/batch/collections.ts`: 분모 조회에 `drop_excluded`를 컬럼으로 추가하고 공용 함수를 쓴다.
- 이 티켓의 세 위치에서 `ambient-drop`은 배지 수를 세지 않으므로 대상이 아니다.

### 테스트
- 기존 `today-logic.test.ts`와 `batch-drafts.test.ts`를 새 기준에 맞춰 고치고, 제외 배지가 있는 컬렉션에서 진행 표시와 알림 기준이 분모 축소를 따르는 케이스를 추가한다.

### UI/UX 관점
- 문구·레이아웃 변경 없음.

## 완료 조건

- 세 위치가 공용 함수를 쓰고 관련 테스트가 통과한다.
- 판정 코어(20260921_1110)와 표시 기준이 일치한다.
- `scripts/verify.sh`가 통과한다.

## 관련 티켓

- 상위 20260914_1130
- 형제: 판정 코어 20260921_1110, 슬롯 RPC 20260921_1111, 화면·API 표시 20260921_1112, Today·알림 표시 20260921_1113, 삭제 배지 처리 통일 검토 20260921_1114
- 정책 근거 20260911_2236(개별 배지 드랍 제외, 컬렉션 완성 분모)

---
## 완료 기록

### 구현 내용 요약
Today 화면의 진행 중 컬렉션(`today/status.ts`), 미완성 컬렉션 노출 태그(`today/exposure.ts`), 컬렉션 알림 배치(`notifications/batch/collections.ts`)가 공용 함수 `computeBookCompletion`으로 분모(드랍 제외 배지를 뺀 집합)와 분자(분모와 채운 배지의 교집합)를 계산하게 했다. `status.ts`·`exposure.ts`는 슬롯 조회에 `badge_id`를, 배지 조회에 `type`·`drop_excluded`를 추가했고 type 필터는 `['item']`로 유지했다. 테스트할 수 있도록 순수 함수 `buildCollectionProgress`와 `hasIncompleteBook`을 분리했다. 알림 배치는 분모를 유저 루프 밖에서 한 번만 계산하고, 이후 #9·#10·#11 판정이 그 분모를 쓴다.

### 변경된 파일
```
jam-web/src/lib/today/status.ts
jam-web/src/lib/today/exposure.ts
jam-web/src/lib/notifications/batch/collections.ts
jam-web/src/lib/today/__tests__/today-logic.test.ts
jam-web/src/lib/notifications/__tests__/batch-drafts.test.ts
```

### 테스트 결과
- [x] 위치별 테스트 추가: today-logic 5건(`buildCollectionProgress` 3건, `hasIncompleteBook` 2건), batch-drafts 2건. 제외 배지가 분모에서 빠지는지, 제외 배지를 장착해도 분자에 세지 않는지, 분모를 다 채우면 후보에서 빠지는지, 제외 배지를 빼면 잔여 1칸이 되어 완성 임박 알림이 나가는지를 확인
- [x] 민지가 두 테스트 파일을 직접 실행해 통과 확인(batch-drafts 42건, today-logic 22건)
- [x] `scripts/verify.sh` 전 항목 통과
- [x] 민지 게이트 리뷰 PASS

### 배포 정보
- 배포일: 미배포 (staging 머지만 했고 push는 이 묶음 마무리 때 한다)
- 환경: staging(로컬 머지)
- 커밋: ce98a32a(구현), a2ef380a(머지)
- 워크플로 실행: 에이전트 2명, 전체 91,110토큰, 257초(출력 토큰: 아현 14,913, 게이트 2,638)

### 주요 의사결정 / 핵심 메모
- 알림 배치 입력에 checkin 배지가 섞여 있지만 type 필터를 걸지 않아 기존처럼 전부 분모에 남는다.
- 소프트 삭제 배지 처리는 기존대로 유지했다(티켓 20260921_1114 범위).

### 잔여 이슈
- 슬롯이 제외 배지 하나뿐인 컬렉션이 Today에 「0/N 진행 중」으로 나올 수 있다(아래 발견물 티켓)
