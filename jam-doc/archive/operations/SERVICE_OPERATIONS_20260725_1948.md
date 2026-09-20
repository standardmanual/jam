# JAM! 서비스 운영 문서 — 변경분 (2026-07-25 19:48)

> **이 버전의 변경 내용:** POI 픽업 시 `cannot_pickup_own_drop` 오류 재발 수정 — `pickup_drop()` RPC에서 본인 드랍 픽업 제한 재제거.
> 이전 버전: SERVICE_OPERATIONS_20260725_1912.md

---

## 버그 수정: 본인 드랍 픽업 시 `cannot_pickup_own_drop` 오류

**관련 파일:** `supabase/migrations/047_reallow_pickup_own_drop.sql`(신규)

- **경위**:
  1. `007_pickup_own_drop.sql`에서 "본인이 드랍한 아이템도 본인이 픽업 가능"하도록 `pickup_drop()` RPC의 `dropper_user_id = p_picker_id` 체크를 의도적으로 제거.
  2. `044_ambient_poi_drop.sql`(앰비언트 드랍 도입, drop_id 미기록 버그 수정)에서 `pickup_drop()`을 `CREATE OR REPLACE`로 다시 정의하는 과정에 해당 체크가 재도입되어, 007의 정책 변경이 의도치 않게 회귀됨.
  3. 결과적으로 유저가 본인이 드랍한 아이템을 픽업하려 하면 `cannot_pickup_own_drop`(403) 오류가 발생하고 있었음.
- **수정**: `047_reallow_pickup_own_drop.sql`에서 `pickup_drop()`을 다시 `CREATE OR REPLACE` — 044의 `drop_id` 기록 로직(일련번호 트리거용)은 그대로 유지하고, `cannot_pickup_own_drop` 체크만 제거.
- **DB 반영 필요**: 이 저장소는 로컬에서 Supabase 서비스 롤 키에 접근할 수 없어(Sensitive 설정) 마이그레이션 SQL을 실제 DB에 적용하는 작업은 관리자가 Supabase SQL Editor에서 직접 실행해야 함(기존 046 마이그레이션과 동일한 방식).
