---
id: "20261018_0657"
category: Service
priority: P2
status: CLOSED
created: 2026-10-18
parent: "20261018_0050"
---

# [Service] 잠긴 개체의 유저 드랍을 DB가 막지 못한다: create_user_drop을 보강하고 드랍 사전 확인 순서를 고친다

## 핵심 요약

- 요구사항: 티켓 20261018_0051 1회 게이트가 짚었다. 마이그레이션 231의 «잠긴 개체 보호» 트리거는 `inventory_items.dropped_at` 갱신만 막는데, 유저 드랍 함수 `create_user_drop`(마이그레이션 108·109·181)은 `inventory_id`만 비우고 `dropped_at`을 갱신하지 않는다. 그래서 잠긴 개체의 유저 드랍을 막는 방어선이 `/api/drops` 사전 확인 하나뿐이다. 드랍 경로의 DB 쪽 방어선을 만든다. 또 `/api/drops`가 소유권 확인보다 먼저 잠김을 조회해 남의 개체 id로 잠김 여부를 알아낼 수 있다(개체 id가 uuid라 위험은 낮다). 순서를 고친다.
- 구현 계획: 묶음 4(장소·드랍·픽업)가 드랍 경로를 다시 쓰기 전에, 이 티켓을 3-3 뒤 또는 묶음 4 시작에 함께 처리한다. 새 마이그레이션으로 `create_user_drop`에 잠긴 개체 거부를 더한다(옛 함수 교체가 아니라 같은 이름의 `CREATE OR REPLACE`가 옛 프로덕션 코드에도 영향을 주므로, 새 함수를 만들고 새 코드만 그것을 부르거나, 옛 함수에 «잠긴 개체만 거부»를 더하는 방식을 시작 전에 사용자에게 묻는다).
- 관련 파일: `jam-web/supabase/migrations/108_*.sql`·`109_*.sql`·`181_function_search_path_hardening.sql`(`create_user_drop`), `jam-web/supabase/migrations/231_locked_item_badges.sql`(트리거 `trg_inventory_items_reject_locked`), `jam-web/src/app/api/drops/route.ts`(사전 확인 351·354줄 근처).

## 사용자 결정과 진행 (2026-10-18)

- 결정: **기존 `create_user_drop`에 잠긴 개체 거부 한 단계만 더한다**(새 함수를 만들지 않는다). 잠긴 개체는 새 코드만 만들므로 옛 프로덕션 코드의 열린 개체 드랍 동작은 그대로다.
- DB(마이그레이션 238) 적용 완료: 소유권·장착 확인을 지난 뒤 `v_item.locked`이면 `{ok:false, error:'locked_item'}`을 돌려준다. 롤백 실측 13건 통과(열린 개체 드랍·드랍 기록·이력, 잠긴 개체 거부와 소유·칸 수·드랍 기록·이력 그대로, 남의 개체·파괴된 개체, 이미 드랍함, 연 개체 드랍, 인벤토리 없음, 권한). 적용 뒤 확인: 함수 SECURITY DEFINER, 잠김 확인 포함, `authenticated` 실행 권한 없음, 오버로드 1개.
- 남은 일(앱): `jam-web/src/app/api/drops/route.ts`의 사전 확인(`findLockedItemIds`)이 소유권 확인보다 먼저라 남의 개체 id로 잠김 여부를 알아낼 수 있다. DB가 소유권을 먼저 확인하고 잠김을 거부하므로 이 사전 확인을 없애고 RPC 응답 `error: 'locked_item'`을 409 `locked_item_not_allowed`(문구 `d.lockedItem.drop`)로 매핑한다. 남의 개체는 `item_not_found`로 돌아가 정보가 새지 않는다. 시험(`app/api/drops/__tests__/route.test.ts`)을 이에 맞게 바꾸고 DB 거절 응답 시험을 더한다.

## 완료 조건

- 잠긴 개체의 유저 드랍이 DB 함수에서도 거부된다(시험 포함).
- `/api/drops`가 소유권을 먼저 확인하고 잠김을 확인한다.

---
## 완료 기록

**완료(2026-10-18, 카리나·아현).**
- DB: 마이그레이션 238(`create_user_drop`에 «잠긴 개체면 `locked_item`으로 거절» 한 단계, 사용자 승인 뒤 롤백 실측 13건 통과, 공용 DB 적용). 서명·반환 형식·권한은 그대로다.
- 앱: 브랜치 `claude/jamwork-20261018_0657-locked-drop-app`(게이트 PASS, staging 로컬 머지). `app/api/drops/route.ts`의 소유권 확인보다 앞선 잠김 사전 조회를 없애고 RPC 응답 `locked_item`을 409 `locked_item_not_allowed`로 매핑했다. 남의 개체는 DB가 `item_not_found`(404)로 돌려줘 잠김 여부가 새지 않는다. 시험 갱신(DB 거절 응답 → 409·판정 예약 없음, 남의 개체 404, `inventory_items` 읽기 0회). `docs/service/prd/02_DATA_MODEL.md` 정정.
- 검증: `scripts/verify.sh` 전항목 통과, CI verify 성공(커밋 `e96b16df2`, run 39113405141, 민지가 실제 성공 확인).
- 실행 지표: 아현·게이트 2에이전트 89,185토큰 13분 26초 도구 36(출력 8,823 / 3,775).

### 잔여 이슈
- 저장소에는 DB 함수 자체의 자동 시험이 없다. 묶음 4가 `create_user_drop`을 다시 고칠 때 `locked_item` 거절을 롤백 실측으로 함께 확인해야 한다.
- `lib/inventory/lockedItem.ts` 머리 주석의 «각 경로는 호출 전에 `findLockedItemIds`로 먼저 거르고»는 드랍 경로에는 이제 맞지 않는다(같은 주석에 드랍은 사전 조회가 없다고 이미 적혀 있어 오해 소지는 작다).
