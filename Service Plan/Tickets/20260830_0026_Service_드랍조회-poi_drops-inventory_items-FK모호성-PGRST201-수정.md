---
id: 20260830_0026
category: Service
status: CLOSED
created: 2026-08-30
closed: 2026-08-30
---

# [Service] 드랍 페이지 POI 선택 시 드랍 목록 조회 실패 (PGRST201 FK 모호성) 수정

## 배경 / 문제 정의

드랍 페이지에서 POI를 선택하면 "드랍된 아이템을 불러오지 못했어요. 잠시 후 다시 시도해 주세요"
토스트가 뜨고 드랍 목록이 로드되지 않는다.

원인: `poi_drops`와 `inventory_items` 사이에 FK 관계가 두 개 존재한다.

- 레거시: `inventory_items.drop_id → poi_drops.id` (픽업 이력 컬럼, 004_phase7_user_drops.sql)
- 신규: `poi_drops.inventory_item_id → inventory_items.id` (개체정체성 모델,
  108_item_identity_custody_model.sql, 티켓 20260829_2101)

`GET /api/drops/poi/[poiId]`([route.ts](../../jam-web/src/app/api/drops/poi/[poiId]/route.ts))가
20260829_2101에서 `inventory_items ( serial_prefix, serial_number )` 임베드를 추가하면서, 관계명을
명시하지 않아 PostgREST가 두 FK 중 어느 것을 쓸지 판단하지 못하고 `PGRST201 Could not embed
because more than one relationship was found`를 던진다. 라우트는 이를 그대로 500 +
`drops_load_failed`로 응답하고, 클라이언트([PoiCarouselModal.tsx](../../jam-web/src/components/PoiCarouselModal.tsx))가
이를 받아 토스트를 띄운다.

실제 Supabase REST 엔드포인트에 동일 쿼리를 재현해 오류를 확인했다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `route.ts`의 `inventory_items` 임베드에 의도한 FK(`poi_drops_inventory_item_id_fkey`)를
  명시적으로 지정해 PGRST201을 제거한다.
- 회귀 확인: 드랍이 있는 POI를 선택했을 때 정상적으로 드랍 목록(일련번호 포함)이 로드되는지.

## 구현 계획

`inventory_items ( serial_prefix, serial_number )` → `inventory_items!poi_drops_inventory_item_id_fkey
( serial_prefix, serial_number )`로 관계명만 명시. 로직·응답 형태 변경 없음.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`route.ts`의 `inventory_items` 임베드에 관계명 `poi_drops_inventory_item_id_fkey`를 명시해
PGRST201(관계 모호성)을 제거했다. 마이그레이션 파일 검증 결과 두 FK 모두 `ALTER TABLE ADD
COLUMN ... REFERENCES` 형태로 생성돼 명시적 `CONSTRAINT` 이름 없이 Postgres 기본 명명 규칙
(`<테이블>_<컬럼>_fkey`)을 따른다:
- 신규(사용): `poi_drops.inventory_item_id → inventory_items.id`
  (108_item_identity_custody_model.sql) → 기본 제약명 `poi_drops_inventory_item_id_fkey`
- 레거시(미사용): `inventory_items.drop_id → poi_drops.id` (004_phase7_user_drops.sql)
  → 기본 제약명 `inventory_items_drop_id_fkey`

코드가 지정한 관계명이 의도한 FK(개체정체성 모델의 현재 드랍→개체 연결)와 정확히 일치함을
확인했다. 로직·응답 형태·에러 메시지는 변경 없음 — 관계명 한 줄만 명시.

### 변경된 파일
```
jam-web/src/app/api/drops/poi/[poiId]/route.ts
```

### 테스트 결과
- [x] 실제 Supabase REST 엔드포인트에 동일 select 쿼리로 재현 → 수정 전 PGRST201, 수정 후
      200 응답 + 드랍 목록에 `serial`(일련번호) 정상 포함 확인 (오케스트레이터 사전 확인)
- [x] `cd jam-web && npm run lint` 전체 실행 — 총 27건(에러 1건, 경고 26건) 중 이번 변경
      파일(`route.ts`)에서 발생한 항목은 0건. 에러 1건은 워킹트리에 동시에 존재하던 별개
      진행 중 티켓(20260829_2150, `_orphaned-actions/UserSearchCombobox.tsx`)의 미완료
      코드에서 발생한 것으로 이 티켓 범위 밖이라 손대지 않음.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 — 에러 메시지 문구 변경 없음, 발생 자체를 막는 수정.

### 배포 정보
- 배포일: 2026-08-30
- 환경: staging
- 커밋: f38aaf5c (구현), staging 머지 완료 — 프로덕션 미배포, `/jam-ship`으로 별도 진행 필요

### 주요 의사결정 / 핵심 메모
- 워킹트리에 이 티켓과 무관한 다른 진행 중 티켓(20260829_2150 고아 아이템배지 관리 기능)의
  변경사항이 함께 존재했다. 이번 커밋에는 `route.ts`와 이 티켓 문서만 포함하고, 무관한
  파일(`item-badge-status.ts`, `database.ts`, `SerialListTable.tsx`, `_orphaned-actions/`,
  `api/admin/item-badges/`, `migrations/110_*.sql`, 티켓 20260829_2150 문서)은 건드리지
  않았다.

### 잔여 이슈
- 없음
