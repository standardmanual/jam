# JAM! 서비스 운영 문서 — 변경분 (2026-07-21 21:59)

> **이 버전의 변경 내용:** 피드 중복 표시 잔여 데이터 보정 마이그레이션 추가 — 코드 수정(59e71a8) 이전에 기록된 피드 행은 여전히 중복 표시되던 문제 해결  
> 이전 버전: SERVICE_OPERATIONS_20260721_2152.md

---

## [보정] 035_backfill_feed_inventory_item_id.sql

### 배경

커밋 `59e71a8`에서 드랍/픽업 피드 중복 표시 버그(중복 제거 키 `inventory_item_id`/`poi_drop_id`가 실제로 기록된 적 없던 결함)를 수정했다. 그러나 이 수정은 **코드 배포 이후 새로 기록되는 피드 행**에만 적용되고, 그 이전에 이미 `user_activity_feed`에 저장된 행은 여전히 해당 필드가 비어 있어 홈/프로필의 "레거시 드랍 합성" 로직이 계속 중복을 만들어냈다. (실사례: sihyunrr@gmail.com 계정에서 "얼어버린 바나나" 배지가 피드에 2번 표시)

### 내용

`user_activity_feed`의 `item_dropped`/`item_picked_up` 행 중 신규 식별자 필드가 비어있는 것을, 같은 (user_id, badge_id) 안에서 시간순으로 대응되는 `inventory_items`/`poi_drops` 행과 1:1로 짝지어 `metadata`에 소급 채운다.

- `item_dropped` → `inventory_items.id`를 `metadata.inventory_item_id`로
- `item_picked_up` → `poi_drops.id`를 `metadata.poi_drop_id`로

### 적용 방법

033·034와 동일하게 Supabase Dashboard SQL Editor에서 `jam-web/supabase/migrations/035_backfill_feed_inventory_item_id.sql` 실행. 적용 후 검증:

```sql
SELECT count(*) FROM user_activity_feed
  WHERE event_type = 'item_dropped' AND metadata->>'inventory_item_id' IS NULL;
```

0에 가까울수록 정상 (조합·트레이드 등으로 이미 소모된 극소수 아이템은 매칭 대상이 없어 남을 수 있음 — 무해).

### 운영 유의사항

- 이 보정은 **1회성**이며 멱등(idempotent)하다 — 이미 채워진 행은 조건에서 제외되므로 여러 번 실행해도 안전.
- 앞으로의 모든 신규 드랍/픽업은 59e71a8의 코드 수정으로 처음부터 올바르게 기록되므로 이 보정이 재필요할 일은 없다.

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260721_2152.md)과 동일.
