---
id: "20261018_0657"
category: Service
priority: P2
status: OPEN
created: 2026-10-18
parent: "20261018_0050"
---

# [Service] 잠긴 개체의 유저 드랍을 DB가 막지 못한다: create_user_drop을 보강하고 드랍 사전 확인 순서를 고친다

## 핵심 요약

- 요구사항: 티켓 20261018_0051 1회 게이트가 짚었다. 마이그레이션 231의 «잠긴 개체 보호» 트리거는 `inventory_items.dropped_at` 갱신만 막는데, 유저 드랍 함수 `create_user_drop`(마이그레이션 108·109·181)은 `inventory_id`만 비우고 `dropped_at`을 갱신하지 않는다. 그래서 잠긴 개체의 유저 드랍을 막는 방어선이 `/api/drops` 사전 확인 하나뿐이다. 드랍 경로의 DB 쪽 방어선을 만든다. 또 `/api/drops`가 소유권 확인보다 먼저 잠김을 조회해 남의 개체 id로 잠김 여부를 알아낼 수 있다(개체 id가 uuid라 위험은 낮다). 순서를 고친다.
- 구현 계획: 묶음 4(장소·드랍·픽업)가 드랍 경로를 다시 쓰기 전에, 이 티켓을 3-3 뒤 또는 묶음 4 시작에 함께 처리한다. 새 마이그레이션으로 `create_user_drop`에 잠긴 개체 거부를 더한다(옛 함수 교체가 아니라 같은 이름의 `CREATE OR REPLACE`가 옛 프로덕션 코드에도 영향을 주므로, 새 함수를 만들고 새 코드만 그것을 부르거나, 옛 함수에 «잠긴 개체만 거부»를 더하는 방식을 시작 전에 사용자에게 묻는다).
- 관련 파일: `jam-web/supabase/migrations/108_*.sql`·`109_*.sql`·`181_function_search_path_hardening.sql`(`create_user_drop`), `jam-web/supabase/migrations/231_locked_item_badges.sql`(트리거 `trg_inventory_items_reject_locked`), `jam-web/src/app/api/drops/route.ts`(사전 확인 351·354줄 근처).

## 완료 조건

- 잠긴 개체의 유저 드랍이 DB 함수에서도 거부된다(시험 포함).
- `/api/drops`가 소유권을 먼저 확인하고 잠김을 확인한다.
