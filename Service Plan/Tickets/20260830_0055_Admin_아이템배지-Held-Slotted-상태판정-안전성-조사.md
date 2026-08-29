---
id: 20260830_0055
category: Admin
status: CLOSED
created: 2026-08-30
closed: 2026-08-30
---

# [Admin] 아이템배지 Held/Slotted 상태판정(`deriveItemBadgeStatus`) 안전성 조사

## 배경 / 문제 정의

[`jam-web/src/lib/admin/item-badge-status.ts`](../../jam-web/src/lib/admin/item-badge-status.ts)의
`deriveItemBadgeStatus()`는 `inventory_items.inventory_id`와 `slotted_in` 두 컬럼의 조합만으로
Held/Slotted를 판정한다(`inventory_id`가 있으면 `slotted_in` 유무로 분기).

티켓 [20260829_2150](20260829_2150_Admin_고아-아이템배지-관리-기능.md) 게이트 리뷰 중 나온
side finding: `admin_reassign_orphaned_item()` RPC
(`jam-web/supabase/migrations/110_admin_orphaned_item_actions.sql`)가 재배정 시
`slotted_in`을 방어적으로 `NULL` 처리해뒀다 — 이 방어 코드의 존재 자체가 "다른 경로에서
`slotted_in`이 stale하게 남을 위험이 있다"는 뜻일 수 있어, 실제로 그런 경로가 있는지
전수 조사했다.

## 조사 범위

`slotted_in`을 갱신·참조하는 모든 코드 경로를 grep으로 전수 확인:
`jam-web/src/types/database*.ts`(타입), 어드민 상세 페이지 2곳(읽기 전용),
`api/itembooks/[id]/slot/route.ts`(장착·해제), `api/itembooks/[id]/route.ts`(읽기),
`api/inventory/items/route.ts`(읽기), `combine/page.tsx`·`lib/combine/index.ts`(조합 소모),
`lib/itembook/completable.ts`(읽기), `inventory/page.tsx`·`collections/[id]/page.tsx`(읽기),
`lib/notifications/batch/collections.ts`(읽기), 마이그레이션
`017_item_book_slots.sql`·`068_used_slots_slot_policy_fix.sql`·
`108_item_identity_custody_model.sql`·`110_admin_orphaned_item_actions.sql`.

## 결론 — 구조적 위험은 확인되지 않았으나, 별개의 실제 레이스 가능성 1건 발견

### 1) 계정 탈퇴(정상 경로)는 안전하다

`inventory_id`와 `slotted_in`은 서로 다른 FK 체인을 통해 **같은 `DELETE FROM users`
트랜잭션 안에서 독립적으로** `SET NULL` 된다:
- `inventory.user_id` → `ON DELETE CASCADE` → `inventory` row 삭제 →
  `inventory_items.inventory_id`의 FK(`108`에서 `CASCADE`→`SET NULL`로 전환)가 발동
- `user_item_book_slots.user_id` → `ON DELETE CASCADE` → 슬롯 row 삭제 →
  `inventory_items.slotted_in`의 FK(`017`, `ON DELETE SET NULL`)가 발동

두 SET NULL은 서로의 현재 값에 의존하지 않으므로 실행 순서와 무관하게 항상 둘 다 NULL로
귀결된다. → `admin_reassign_orphaned_item()`의 방어 코드는 **정상 경로에서는 불필요**하고,
주석에도 그렇게 명시돼 있다(방어적 이중 처리, 실제 결함 아님).

### 2) `inventory_id`를 쓰는 모든 커스터디 전이 RPC는 이미 안전하다

- `create_user_drop()`: `slotted_in IS NOT NULL`이면 드랍 자체를 차단(`item_slotted` 에러) →
  드랍되는 아이템은 항상 `slotted_in = NULL` 상태에서만 `inventory_id = NULL`로 전이.
- `pickup_drop()`: `inventory_id`를 새 소유자로 세팅하지만, 이 시점의 아이템은 항상
  (a) `create_user_drop()`을 통과했거나 (b) `mint_and_place_ambient_drop()`으로 갓
  발급된 fresh row — 둘 다 `slotted_in`이 이미 NULL임이 보장된다.
- `expire_stale_poi_drops()`: 미픽업 상태(한 번도 `Held`였던 적 없음)의 아이템만 파괴 →
  `slotted_in`이 애초에 NULL일 수밖에 없다.
- `admin_destroy_orphaned_item()`: `destroyed_at`을 세팅할 뿐인데, `deriveItemBadgeStatus()`는
  `destroyedAt`을 최우선으로 체크하므로 `slotted_in` 잔存 여부와 무관하게 항상
  Consumed/Destroyed로 정확히 표기된다.
- 조합 소모(`combineItems()`): 재료 조회 쿼리 자체가 `.is('slotted_in', null)`로 필터링 —
  슬롯된 아이템은 애초에 재료로 선택될 수 없다.

→ `slotted_in`이 `deriveItemBadgeStatus()`의 판정에 영향을 주는 지점은 **오직
`inventory_id`가 non-null로 (재)설정되는 순간뿐**이며, 위 전수 확인 결과 그 지점들은
전부 `slotted_in = NULL`이 보장된 상태에서만 진입 가능했다.

### 3) 발견된 실제 위험 — 슬롯 장착/해제 API는 원자적 락이 없다 (범위 밖 결함)

`108_item_identity_custody_model.sql`이 도입한 "표준 불변식 1: 원자적 소유권 이전"
패턴(`SELECT ... FOR UPDATE`)은 `create_user_drop`·`pickup_drop`·`admin_reassign/destroy`
전부에 적용돼 있지만, **`api/itembooks/[id]/slot/route.ts`의 POST(장착)·DELETE(해제)
핸들러만 예외적으로 이 패턴을 쓰지 않는다** — 단일 RPC가 아니라 여러 번의 순차
Supabase REST 호출(조회 → INSERT → UPDATE)로 구성돼 있어 행 잠금이 없다.

**레이스 시나리오**: 같은 유저가 거의 동시에 "슬롯 장착"과 "드랍"을 같은 아이템에 대해
요청하면 —
1. 슬롯 POST가 아이템을 조회(`slotted_in: null` 확인, 통과)
2. 그 사이 `create_user_drop()`이 락을 잡고 `inventory_id = NULL`로 전이·커밋
   (이 시점엔 `slotted_in`이 여전히 NULL이므로 RPC의 방어 체크도 통과)
3. 슬롯 POST가 이어서 `user_item_book_slots` INSERT + `inventory_items.slotted_in = <새 슬롯>`
   UPDATE를 실행 — 이 UPDATE는 현재 `inventory_id` 상태를 재확인하지 않는다.

결과: 아이템은 `inventory_id = NULL`(드랍됨)이면서 `slotted_in`은 non-null(다른 유저의
아이템북 슬롯을 참조)인 모순 상태가 된다. 이후 이 아이템을 다른 유저가 픽업하면
`inventory_id`가 새 소유자로 세팅되고, `deriveItemBadgeStatus()`가 `Slotted`로 표기하지만
실제로는 원래 유저의 슬롯 row가 여전히 이 개체를 가리키는 채로 남아 — 어드민 화면 표기
오류를 넘어 아이템북 완성 판정(`completable.ts`) 로직까지 오염될 수 있다.

**심각도**: 낮음(같은 유저가 두 액션을 밀리초 단위로 동시에 트리거해야 하는 좁은 레이스,
악용 인센티브도 낮음)이나 데이터 정합성 관점에서는 실재하는 결함.

**권장 조치**(이 티켓 스코프 밖, 별도 티켓으로 분리 권장): `slot`/`unslot`을
`create_user_drop()`류와 동일하게 `SELECT ... FOR UPDATE` 기반 단일 RPC로 재작성해
"표준 불변식 1"을 슬롯 장착/해제 경로에도 동일 적용.

## 최종 판단

- `deriveItemBadgeStatus()` 자체를 역참조 검증(예: `slotted_in`이 가리키는 슬롯이 실제로
  이 아이템을 가리키는지)으로 보강하는 것은 **채택하지 않는다** — 현재 발견된 유일한
  실제 위험(§3)은 파생 로직을 방어적으로 만든다고 해결되지 않고(근본 원인은
  `user_item_book_slots` row 자체가 틀린 아이템을 계속 가리키는 것), RPC 레벨에서
  원자성을 확보해야 근본 해결된다. 파생 함수를 건드리는 건 증상만 가리는 대응.
- `admin_reassign_orphaned_item()`의 방어적 `slotted_in = NULL` 처리는 **현재 상태 유지**
  (정상 경로에서 불필요하지만 무해하고, 코드 주석에 근거가 이미 명시돼 있음).
- §3의 슬롯 API 레이스는 사이드 파인딩으로 별도 작업 칩 분리.

## 참고
- [20260829_2150](20260829_2150_Admin_고아-아이템배지-관리-기능.md) — 이 조사를 촉발한 게이트 리뷰 side finding의 출처
- [20260829_2101](20260829_2101_BadgeEngine_아이템배지-개체정체성-드랍픽업-일련번호유지.md) — "표준 불변식 1: 원자적 소유권 이전" 패턴 정의
