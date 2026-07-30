# JAM! 서비스 운영 문서 — 변경분 (2026-07-27 13:20)

> **이 버전의 변경 내용:** POI 배지 타입 신규 추가 — 반복 획득, 어드민 다중 POI 연결, 아이템북 POI 배지 구성 지원 (Phase 16)
> 이전 버전: SERVICE_OPERATIONS_20260727_1155.md

---

## POI 배지 타입 추가 (Phase 16)

**관련 문서:** `PRD/Phase16_01_PRD.md` ~ `PRD/Phase16_04_PROJECT_SPEC.md`

**관련 파일:**
- `supabase/migrations/052_badge_type_poi.sql`, `053_user_poi_badge_earns.sql` (신규 — **DDL, 유저가 Supabase SQL Editor에서 직접 실행**)
- `src/types/database.ts`, `src/lib/badge-engine/index.ts`, `src/lib/strava/sync.ts`, `src/lib/itembook/checker.ts`
- `src/app/(main)/badges/[id]/page.tsx`, `src/app/(main)/itembooks/[id]/page.tsx`
- `src/app/admin/badges/BadgeForm.tsx`, `BadgesFilterBar.tsx`, `page.tsx`, `src/app/admin/poi/Pagination.tsx`
- `src/app/api/admin/badges/route.ts`, `[id]/route.ts`, `[id]/poi-links/route.ts`(신규), `src/app/api/admin/poi/search/route.ts`(신규)
- `jam-web/scripts/test-poi-badge-repeat.js`, `test-itembook-poi-completion.js`(신규, node:assert 유닛테스트)

### 배경
기존에도 `poi.linked_badge_id` + Strava 동기화 시 GPS 경로 매칭(`matchPoisForActivity`)으로 "POI를 지나가면 배지 발급"하는 경로가 있었지만: (1) `badge_type`에 'poi'가 없어 어드민에서 명시적으로 만들 수 없었고, (2) `user_activity_badges`의 `UNIQUE(user_id, badge_id)` 제약 때문에 평생 1회만 발급 가능했고, (3) 아이템북(`item_book_id` 소속)은 `type='item'`만 카운트했음.

### 데이터 모델
- `badge_type` ENUM에 `'poi'` 추가 (기존 `'activity' | 'item'` → 3종).
- 신규 테이블 `user_poi_badge_earns` — **`user_activity_badges`와 완전히 분리**. UNIQUE 제약 없음(반복 획득), 대신 `UNIQUE(user_id, badge_id, poi_id, triggered_by_strava_id)`로 동일 Strava 활동 재처리(웹훅 재전송/수동 재싱크) 시 중복 이력만 방지.
- `poi.linked_badge_id`는 그대로 재사용 — 여러 `poi` 행이 같은 `badge_id`를 가리키면 "배지 1개 : POI 여러 개"가 표현됨(스키마 변경 없음). 판정 반경도 기존 `poi.radius_meters`(기본 50m) 그대로 사용.
- **인벤토리(`inventory_items`)는 쓰지 않음** — 인벤토리는 아이템 배지의 "보유 수량 제한" 전용 개념이라 POI 배지(반복 무제한)와 맞지 않는다는 게 확정된 결정사항.

### 발급 로직 (`strava/sync.ts`)
POI 매칭 루프에서 매칭된 POI의 `linked_badge_id`가 가리키는 배지 타입을 조회해 분기:
- `type='poi'` → `user_poi_badge_earns`에 **매번** insert(보유 여부 체크 없음, `23505`만 무시하고 계속). 같은 POI를 재방문해도, 배지에 연결된 다른 POI를 방문해도 매번 새 이력.
- `type≠'poi'`(레거시 `activity`) → 기존 `user_activity_badges` 1인1회 경로 완전히 그대로.

### 아이템북 연동 (`itembook/checker.ts`)
북 소속 배지를 `type IN ('item','poi')`로 확장. "채움" 판정은 타입별로 다름: `item`은 기존처럼 슬롯팅(인벤토리 소비), `poi`는 `user_poi_badge_earns`에 해당 배지 이력이 1건 이상 있는지(중복 획득해도 카운트는 1)로 판정. 북은 아이템만/POI만/혼합 전부 가능(`required_activity_badge_id`는 Phase 8에서 이미 nullable — 이번에 추가 변경 불필요했음을 재확인).

### 어드민
- `/admin/badges` 배지 등록/수정 폼에 "POI" 타입 추가 — 선택 시 활동 조건 빌더 숨기고 "연결된 POI" 섹션 노출(이름 검색 → 다중 추가/제거). 저장 시 배지 저장 후 `PUT /api/admin/badges/{id}/poi-links`로 `poi.linked_badge_id`를 일괄 갱신.
- `GET /api/admin/poi/search?query=` 신규 — 기존 `naver-search`(외부 신규 장소 검색)와 별개로, 이미 JAM! DB에 등록된 POI를 이름으로 찾는 용도.
- `/admin/badges` 목록에 페이지네이션 추가(페이지당 30개) — 기존 JS 배열 필터링을 DB 쿼리(`.eq/.contains/.range`)로 전환.
- `condition_json.poi_id`(배지 엔진에서 항상 false 반환하던 미완성 죽은 코드) 완전히 제거.

### 검증
- `tsc --noEmit` / `eslint` / `next build` 전부 통과.
- `node:assert` 유닛테스트 2종(반복발급 idempotency 11케이스, 아이템북 혼합구성 완성판정 7케이스) 전부 통과.
- 서비스 롤 키로 실제 DB에 테스트 배지/POI/이력 생성 후 시나리오 검증: 같은 POI를 다른 활동으로 3회 방문 → 3행 생성, 동일 활동 재처리 시도 → `23505`로 정확히 차단 → cleanup까지 확인.
- 어드민 화면 실제 클릭 검증은 Google OAuth 로그인이 필요해 이번에도 하지 못함(코드/데이터 레이어 검증으로 대체).

### DB 반영
DDL 포함이라 서비스 롤 키로 직접 실행 불가 — 유저가 Supabase SQL Editor에서 `052`, `053` 순서대로 직접 실행함(ENUM 값 추가는 Postgres 제약상 다른 DDL과 트랜잭션을 분리해야 해서 파일도 분리).

### 작업 방식 (참고)
`/kkirikkiri` 스킬로 진행 — 이 환경엔 Agent Teams(TeamCreate)가 없어 실시간 팀원 메시징 대신, 메인 세션이 서브에이전트(dev1 데이터/백엔드 → dev2 어드민 UI/API + tester 병렬)를 순차/병렬 실행하고 직접 diff 리뷰·통합검증(타입체크/린트/빌드/실DB 스모크테스트)했음. 공유 메모리는 `.kkirikkiri/TEAM_PLAN.md`, `TEAM_PROGRESS.md`에 기록.
