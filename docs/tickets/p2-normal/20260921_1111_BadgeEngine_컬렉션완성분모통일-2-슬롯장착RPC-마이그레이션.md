---
id: 20260921_1111
category: BadgeEngine
priority: P2
status: WAITING
created: 2026-09-21
parent: "20260914_1130"
---

# [BadgeEngine] 컬렉션 완성 분모 통일 ② 슬롯 장착 RPC 마이그레이션

## 핵심 요약

- 요구사항: 슬롯 장착 시 실시간 완성을 처리하는 SQL 함수 `slot_item_into_book`의 분모·분자를 드랍 제외 배지를 뺀 기준으로 바꾸는 마이그레이션 파일을 작성한다.
- 관련 파일: `jam-web/supabase/migrations/157_item_book_completion_points.sql`(현재 정의, 읽기 전용 참조), 신규 `178_*.sql`
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
- 실시간 완성 판정은 `app/api/itembooks/[id]/slot/route.ts`가 아니라 SQL RPC `slot_item_into_book`이 한다. 현재 정의는 마이그레이션 157에 있고, 완성 판정에 `COUNT(*) ... deleted_at IS NULL` 개수 비교를 쓴다. 이후 마이그레이션에서 이 함수를 다시 정의한 것이 있는지 먼저 `grep -l slot_item_into_book jam-web/supabase/migrations/*`로 전수 확인하고 **가장 마지막 정의**를 기준으로 한다.
- 새 마이그레이션(번호는 현재 최대 번호 다음, 177 다음이므로 178부터)에서 `CREATE OR REPLACE FUNCTION`으로 분모(`drop_excluded = false` 배지)와 분자(슬롯 중 분모에 속한 배지만)를 바꾼다. 함수 시그니처를 바꾸지 않는다(파라미터를 추가하면 오버로드가 생겨 호출이 모호해진다 — `DEV_PROCESS_GUARDRAILS.md` 패턴 14).
- 완성 기록·포인트 지급의 중복 방지(`ON CONFLICT`, `ROW_COUNT`)와 기존 완성자를 건드리지 않는 동작은 그대로 유지한다.
- **SQL 파일 작성까지만 한다. 실행하지 않는다.** 적용은 사용자가 Supabase에서 직접 한다(카리나의 DB 적용 호출은 권한 분류기가 거부하는 것이 확인됐다). 배포 순서상 이 마이그레이션은 공용 함수 티켓(20260921_1110)과 함께 적용·배포한다.
- 마이그레이션을 추가했으므로 생성 타입에 영향이 있는지 확인한다(함수만 바꾸면 테이블 타입은 그대로다).

### 테스트
- 함수 시그니처가 같은지, 기존 정의와 diff가 의도한 두 곳(분모·분자)뿐인지 확인한다. 실행은 하지 않으므로 「적용 후 확인 쿼리」(제외 배지가 있는 컬렉션에서 분모가 줄어드는지 읽기 전용으로 확인하는 SELECT)를 티켓에 적어 둔다.

### UI/UX 관점
- 해당 없음.

## 완료 조건

- `178_*.sql`이 작성돼 커밋됐고, 기존 정의 대비 변경이 분모·분자 두 곳뿐이다.
- 사용자가 적용한 뒤 확인 쿼리로 동작을 확인한다.
- `scripts/verify.sh`가 통과한다.

## 관련 티켓

- 상위 20260914_1130
- 형제: 판정 코어 20260921_1110, 슬롯 RPC 20260921_1111, 화면·API 표시 20260921_1112, Today·알림 표시 20260921_1113, 삭제 배지 처리 통일 검토 20260921_1114
- 정책 근거 20260911_2236(개별 배지 드랍 제외, 컬렉션 완성 분모)

---
## 완료 기록 *(SQL 적용 대기 — 사용자가 Supabase에서 적용한 뒤 CLOSED)*

### 구현 내용 요약
슬롯 장착 시 실시간 완성을 처리하는 SQL 함수 `slot_item_into_book`의 완성 판정을 바꾸는 마이그레이션 `178_slot_item_into_book_completion_basis.sql`을 작성했다. 가장 최신 정의(157)와 함수 본문을 비교해 바뀐 곳이 완성 체크 쿼리 두 곳뿐임을 확인했다.

- 분모: `deleted_at IS NULL AND drop_excluded = false`인 배지 수
- 분자: 슬롯 중 분모에 속한 배지만 센 `COUNT(DISTINCT badge_id)`(교집합)
- 함수 시그니처, `ON CONFLICT`·`ROW_COUNT` 중복 방지, 포인트 지급, `REVOKE`·`GRANT`(service_role 전용)는 157과 같다.
- 소프트 삭제 배지는 기존대로 분모에서 제외한다(통일 검토는 20260921_1114).

### 변경된 파일
```
jam-web/supabase/migrations/178_slot_item_into_book_completion_basis.sql (신규)
```

### 테스트 결과
- [x] 민지 게이트 리뷰 WARN(코드 결함 없음). WARN 사유 두 가지: (1) 워크트리의 `core.hooksPath`가 `/dev/null`이라 `verify.sh` contract 항목이 실패한 환경 문제(이번 변경과 무관, 메인에서 복구 후 재검증), (2) 확인 쿼리가 SQL 머리 주석에만 있어 아래에 옮겨 적음
- [x] 카리나가 157과 178의 함수 본문을 직접 비교해 차이가 의도한 두 쿼리뿐임을 확인
- [ ] 실행하지 않음. 적용 후 아래 확인 쿼리로 동작을 확인한다.

### 적용 후 확인 쿼리 (읽기 전용)
```sql
-- 제외 배지가 있는 컬렉션에서 분모가 줄어드는지
SELECT item_book_id,
       COUNT(*) FILTER (WHERE deleted_at IS NULL) AS 이전_분모,
       COUNT(*) FILTER (WHERE deleted_at IS NULL AND drop_excluded = false) AS 새_분모
FROM public.badges WHERE item_book_id IS NOT NULL
GROUP BY item_book_id
HAVING COUNT(*) FILTER (WHERE drop_excluded = true) > 0;

-- 함수 정의가 바뀌었는지(본문에 drop_excluded가 들어 있어야 한다)
SELECT prosrc ILIKE '%drop_excluded%' AS 적용됨
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'slot_item_into_book';
```

### 배포 정보
- 배포일: 미배포. 이 SQL은 사용자가 Supabase에서 직접 적용한다(카리나의 DB 적용 호출은 권한 분류기가 거부한다).
- 적용 시점: 판정 코어(20260921_1110) 코드가 프로덕션에 나가는 시점과 맞춘다. 코드만 먼저 나가면 실시간 완성(RPC)과 catch-up(checker) 기준이 잠시 다르다.
- 커밋: 8f0a364d(구현), fd1fb7b7(머지)
- 워크플로 실행: 에이전트 2명, 전체 76,569토큰, 218초(출력 토큰: 아현 5,512, 게이트 3,416)

### 주요 의사결정 / 핵심 메모
- 아현이 보고한 `diffLineCount` 0은 틀린 값이었고 민지가 재측정한 값은 141이다.
- 이 SQL을 적용하기 전에 커밋된 코드가 staging에 올라가도 실행 결과는 바뀌지 않는다(함수 정의는 DB에 있다).

### 잔여 이슈
- 사용자의 SQL 적용과 확인 쿼리 결과 확인이 남았다. 확인되면 이 티켓을 CLOSED 처리한다.
