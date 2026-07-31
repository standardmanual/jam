# JAM! 서비스 운영 문서 — 변경분 (2026-07-31 03:00)

> **이 버전의 변경 내용:** 어드민 "유저 컨텐츠 초기화" API에서 발생하던 `poi_drops` FK 위반 버그 수정, 초기화 범위에서 팔로잉/팔로워 관계 제외.
> 이전 버전: SERVICE_OPERATIONS_20260731_0241.md

---

## [버그 수정] 어드민 유저 초기화 시 poi_drops FK 위반

**증상**: 어드민 페이지에서 유저 계정 초기화 실행 시 다음 오류로 실패하는 경우가 있었음.
```
update or delete on table "poi_drops" violates foreign key constraint "inventory_items_drop_id_fkey" on table "inventory_items"
```

**원인**: 초기화 로직은 대상 유저 "자신의" 인벤토리에 속한 `inventory_items`만 선삭제한 뒤 `poi_drops`(이 유저가 드랍한 행)를 삭제했다. 하지만 그 드랍을 **다른 유저**가 이미 픽업해 자기 인벤토리에 `drop_id`로 참조 중인 경우가 정리 대상에서 빠져 있었다. `inventory_items.drop_id → poi_drops.id` FK는 `ON DELETE` 정책이 없어(기본값 `NO ACTION`) 참조가 남아있으면 삭제가 막힌다.

**수정**: `poi_drops` 삭제 전에, 대상 유저가 드랍한 POI id 목록을 조회해 그 id를 참조하는 `inventory_items`(타인 소유 포함)를 먼저 삭제하는 단계를 추가.

**관련 파일**: `src/app/api/admin/users/[id]/reset/route.ts`

---

## [정책 변경] 어드민 유저 초기화 시 팔로잉/팔로워 관계는 유지

**배경**: 기존 초기화 로직은 대상 유저의 `user_follows` 관계(팔로우한 것/팔로우받은 것 모두)를 삭제했으나, 반복 테스트 목적의 초기화에서 소셜 그래프까지 매번 끊어지는 것은 의도와 맞지 않음.

**변경**: 초기화 시 `user_follows` 삭제 코드를 제거. 팔로잉/팔로워 관계는 계정과 함께 그대로 유지됨.

**관련 파일**: `src/app/api/admin/users/[id]/reset/route.ts`

**유지 항목 갱신**: 어드민 유저 초기화 시 유지되는 항목 = 계정 정보, Strava 연동(토큰), **팔로잉/팔로워 관계**. 삭제되는 항목 = 액티비티 배지, 인벤토리 아이템, 미션 기록, 활동 피드, POI 드랍, 드랍엔진 상태, 아이템북 완성 기록.
