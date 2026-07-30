# JAM! Phase 16 구현 단계 — POI 배지 타입 추가

> 작성일: 2026-07-27

---

## Step A: 데이터 모델

- `supabase/migrations/0XX_badge_type_poi.sql`: Phase16_02 §1 그대로. 유저가 Supabase SQL Editor에서 직접 실행(DDL).
- `supabase/migrations/0XX_user_poi_badge_earns.sql`: Phase16_02 §2 그대로. 유저가 직접 실행.
- `src/types/database.ts`: `BadgeType`에 `'poi'` 추가, `UserPoiBadgeEarnRow` 타입 신설, `BadgeCondition`에서 `poi_id` 필드 제거.

**완료 기준**: 마이그레이션 적용 확인(`badge_type` enum에 `poi` 존재, `user_poi_badge_earns` 테이블 존재), `tsc` 통과.

## Step B: 배지 엔진 정리 + Strava 동기화 확장

- `src/lib/badge-engine/index.ts`: `evaluateConditionDetailed`의 `condition.poi_id` 분기 제거.
- `src/lib/strava/sync.ts`: 기존 POI 매칭 루프를 Phase16_02 §4대로 확장 — 매칭된 POI의 `linked_badge_id`가 가리키는 배지를 사전 조회(`badgeById` 맵)해서 `type==='poi'`면 `user_poi_badge_earns`에 insert(반복 허용, `23505`만 무시), 그 외(레거시 `activity`)는 기존 `user_activity_badges` 경로 그대로.

**완료 기준**: 시뮬레이터(`/admin/simulator`)로 POI 반경을 통과하는 가상 활동을 넣었을 때 `poi` 타입 배지가 매번 새로 발급되는지 확인(같은 POI 2번 통과 시나리오 포함).

## Step C: 어드민 — 배지 폼에 POI 타입 + 다중 연결 UI

- `src/app/api/admin/poi/search/route.ts`(신규) — DB `poi` 테이블을 이름으로 검색하는 어드민 API(`naver-search`와 다름 — 이미 등록된 POI 대상). `GET ?query=` → `poi` 테이블 `ILIKE` 검색, 최대 20건.
- `src/app/admin/badges/BadgeForm.tsx`:
  - `BADGE_TYPES`에 `'poi'` 추가.
  - `type === 'poi'`일 때 활동 조건 빌더 섹션 숨김, 대신 "연결된 POI" 섹션 노출 — 검색창 + 결과 목록(클릭해서 추가) + 이미 추가된 POI 리스트(이름 + 반경 인라인 수정 + 제거 버튼).
  - `condPoiId` state 및 관련 UI 제거.
  - 저장 시: 배지 자체는 기존 `/api/admin/badges` POST/PUT 그대로 두고, 연결된 POI 목록 변경분(추가/제거)은 별도로 `poi.linked_badge_id`를 업데이트하는 신규 API 호출(`PATCH /api/admin/poi/link-badge` 또는 배지 저장 API 응답의 badge id를 받은 후 순차 호출 — Step 진행하며 확정).
- `src/app/api/admin/badges/route.ts`, `[id]/route.ts`: `poi` 타입 저장 시 `condition_json`을 강제로 `null` 처리(활동 조건과 섞이지 않게).

**완료 기준**: 어드민에서 POI 타입 배지를 만들고 POI 2개 이상을 검색해 연결/해제할 수 있음. DB에서 해당 POI들의 `linked_badge_id`가 정확히 반영됨.

## Step D: 어드민 — 배지 목록 페이지네이션

- `src/app/admin/poi/Pagination.tsx`를 범용 위치로 옮기거나(`src/app/admin/_shared/Pagination.tsx`) 그대로 복제해서 `src/app/admin/badges/page.tsx`에 적용.
- 쿼리 파라미터(`page`) 기반, 페이지당 30개, 기존 POI 목록과 동일한 UX.

**완료 기준**: 배지가 30개 넘을 때 페이지네이션이 동작하고 숫자 클릭으로 이동됨(현재 시드 배지 수가 30개 넘는지 먼저 확인 — 안 넘으면 임시로 페이지 크기를 낮춰 로컬 검증 후 원복).

## Step E: 서비스 — 배지 상세 획득 이력 + 아이템북 완성 확장

- `src/app/(main)/badges/[id]/page.tsx`: `badge.type === 'poi'`분기 추가 — `user_poi_badge_earns`를 `poi_id(name)` 조인 + `earned_at desc`로 전체 조회해서 리스트 렌더링(기존 단건 조회는 `type !== 'poi'`일 때만 유지).
- `src/lib/itembook/checker.ts`: Phase16_02 §5대로 `type IN ('item','poi')` 확장 + poi 배지는 `user_poi_badge_earns` distinct 존재 여부로 카운트.
- 유저용 아이템북 상세 화면(`src/app/(main)/itembooks/[id]/page.tsx`): `poi` 타입 소속 배지는 슬롯팅 액션 없이 획득 여부 배지만 표시.

**완료 기준**: POI 배지를 여러 번 획득한 테스트 계정으로 상세 화면 진입 시 이력이 최신순으로 여러 건 보임. POI 배지만으로 구성한 테스트 아이템북이 실제로 완성 처리됨(§Step F에서 시드 데이터로 검증).

## Step F: 검증 시나리오 + 회귀 확인

- 시뮬레이터로 다음 조합 검증: (1) POI 배지 최초 발급 (2) 같은 POI 재방문 시 반복 발급 (3) 다른 POI(같은 배지에 연결된)에서도 발급 (4) `activity`/`item` 타입 배지는 기존과 동일하게 1인1회만 발급되는지(회귀 확인).
- 아이템북: 아이템 배지만/POI 배지만/혼합 3가지 케이스로 완성 처리 확인.
- 기존 POI 어드민 화면(`/admin/poi`)에서 "연결 배지" 컬럼이 여전히 정상 표시되는지 확인(다대일 관계 변경 없음 — 회귀 없어야 함).

**완료 기준**: 위 4+3가지 시나리오 전부 통과.

## Step G: 문서 + 배포

- `npx tsc --noEmit` 0 에러.
- `PRD/SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 신규 생성.
- 마이그레이션 직접 실행(유저) 확인 + `vercel inspect`로 배포 확인 + commit/push.

---

## 확장 후보 (이번 범위 아님)

| 기능 | 시점 |
|------|------|
| POI 배지 전용 어드민 메뉴 분리 | 배지 종류가 늘어나 목록이 붐빌 때 |
| POI 배지 발급 알림/공유 카드 | 유저 요청 시 |
| 아이템북 배지 구성에 `activity` 타입 포함(유저가 언급한 향후 계획) | 별도 Phase — `required_activity_badge_id` 외에 다건 활동 배지 지원 구조 설계 필요 |
