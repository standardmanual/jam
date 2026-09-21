---
id: 20260921_1112
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-09-21
parent: "20260914_1130"
---

# [BadgeEngine] 컬렉션 완성 분모 통일 ③ 컬렉션 화면·API 표시

## 핵심 요약

- 요구사항: 컬렉션 목록·상세·프로필 카드·배지 화면이 「N/M」과 완성 여부를 공용 함수로 계산하게 한다.
- 관련 파일: `app/api/itembooks/route.ts`, `app/api/users/[username]/itembooks/route.ts`, `app/(main)/collections/[id]/page.tsx`, `app/(main)/[username]/collections/page.tsx`, `app/(main)/badges/page.tsx`
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
- 각 위치의 배지 조회에 `drop_excluded`를 컬럼으로 추가하고(서버 필터 금지), `totalBadgeCount`·`slottedCount`·`isCompleted` 계산을 공용 함수 `computeBookCompletion`으로 바꾼다. 위치마다 배지 type 조건이 다르다(`item`만, `item`+`checkin`)는 점은 함수 옵션 `types`로 흡수한다. 각 위치의 기존 type 조건과 소프트 삭제 필터(`deleted_at`)는 그대로 유지한다.
- 슬롯 select에 `badge_id`가 없으면 추가한다.
- `collections/[id]/page.tsx`의 `isCompleted`는 완성 기록 존재(`completionRes.data != null`) 또는 분자 ≥ 분모다. 이 논리는 유지하고 분모·분자 계산만 바꾼다. 상세 화면의 개별 배지 목록(제외 배지 포함 노출)은 바꾸지 않는다 — 이번 통일은 「N/M」 수치와 완성 여부만 대상이다.
- 사용자 노출 문구는 바꾸지 않는다.

### 테스트
- 위치별 계산이 공용 함수를 쓰도록 바뀌었음을 기존 테스트 또는 신규 테스트로 확인한다. 제외 배지가 있는 컬렉션에서 「N/M」의 M이 줄어드는 케이스를 포함한다.

### 문서
- 갱신할 문서가 있으면 판정 티켓 20260921_1110에서 이미 바꾼 서술과 어긋나지 않게만 맞춘다.

### UI/UX 관점
- 화면 레이아웃·문구 변경 없음. 수치만 바뀌므로 채원 판정은 필요하지 않다(가벼운 UI 경로 아님, 엔진 유형).

## 완료 조건

- 다섯 위치가 모두 공용 함수를 쓴다.
- 제외 배지가 있는 컬렉션에서 「N/M」과 완성 여부가 판정 코어(20260921_1110)와 일치한다.
- `scripts/verify.sh`가 통과한다.

## 관련 티켓

- 상위 20260914_1130
- 형제: 판정 코어 20260921_1110, 슬롯 RPC 20260921_1111, 화면·API 표시 20260921_1112, Today·알림 표시 20260921_1113, 삭제 배지 처리 통일 검토 20260921_1114
- 정책 근거 20260911_2236(개별 배지 드랍 제외, 컬렉션 완성 분모)

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
- 환경:
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
