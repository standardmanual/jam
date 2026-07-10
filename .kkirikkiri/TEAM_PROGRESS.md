# 진행 상황 — Phase 6 + Admin

## 2026-07-09 — jam-lead (Phase 6 Admin 인프라) 완료

### 생성 파일
- [x] `src/app/(admin)/layout.tsx` — ADMIN_SECRET 쿠키 검증 미들웨어 (불일치 시 /admin/login 리다이렉트)
- [x] `src/app/(admin)/admin/login/page.tsx` — 클라이언트 로그인 폼 (POST /api/admin/auth → /admin 리다이렉트)
- [x] `src/app/api/admin/auth/route.ts` — POST: password 검증 후 admin_token 쿠키 세팅 (httpOnly, 7일)
- [x] `src/app/(admin)/admin/page.tsx` — Admin 홈 (배지/POI/드랍/테스트/유저통계 메뉴)
- [x] `supabase/migrations/003_phase6_drops.sql` — drop_events, drop_claims, drop_probability 테이블 + RLS
- [x] `src/types/database.ts` — DropRarity, DropEventRow, DropClaimRow, DropProbabilityRow 추가 + Database 인터페이스 확장
- [x] `.env.local` — `# ADMIN_SECRET=` 주석 항목 추가

### 다음 단계
- jam-admin-content: 배지 CRUD + POI CRUD + 드랍 확률 관리 페이지 구현
- jam-admin-test: 테스트 도구 + 유저 통계 대시보드 구현
- jam-phase6: 드랍/픽업 백엔드 로직 + 유저 UI 구현
- 운영: Supabase 콘솔에서 003_phase6_drops.sql 실행 필요, .env.local ADMIN_SECRET 값 설정 필요

## 2026-07-09 — 메인세션 (Phase 6 + Admin 시작)
- 팀: jam-lead, jam-admin-content, jam-admin-test, jam-phase6

---

# (이전 기록)

## 2026-07-09 — 메인세션
- 상태: Phase 2 팀 초기화
- Phase 1 완료 확인 후 Phase 2 시작
- 팀 구성: jam-lead, jam-poi, jam-map

## 2026-07-09 — jam-lead Task #1 완료

### DB 스키마 업데이트
- [x] `supabase/migrations/002_phase2_poi.sql` 생성
  - `user_activity_badges`에 `triggered_by_poi_id UUID REFERENCES poi(id)` 컬럼 추가
  - `idx_user_activity_badges_poi` 인덱스 추가 (WHERE NOT NULL 부분 인덱스)
- [x] `src/types/database.ts` 업데이트
  - `UserActivityBadgeRow`에 `triggered_by_poi_id: string | null` 추가
  - `PoiRow` 타입 기존에 존재 확인 (추가 불필요)
  - `Database` 제네릭 Insert 타입에도 `triggered_by_poi_id` 반영
- [x] `supabase/seeds/001_sample_poi.sql` 생성
  - 서울/수도권 POI 5개 샘플 (남산, 뚝섬 한강, 북악스카이웨이, 청계산, 광나루 한강)
  - 실제 위경도 사용, radius_meters=50

### 다음 단계 (jam-poi 대기)
- Strava Streams API 연동: GET /activities/{id}/streams?keys=latlng
- Haversine 공식으로 반경 50m 교차 검증
- 매칭 시 UserActivityBadge 발급 + triggered_by_poi_id 기록

## 2026-07-09 — jam-poi Task #2 완료

### 구현 완료
- **`src/lib/strava/api.ts`**: `getActivityStreams(activityId, accessToken)` 추가
  - GET /activities/{id}/streams?keys=latlng&key_by_type=true
  - 404 및 latlng 없는 경우 null 반환 (실내 활동 정상 처리)
  - 기존 `checkRateLimit()` 활용
- **`src/lib/poi/matcher.ts`**: 신규 파일 생성
  - `haversineDistance()`: Haversine 공식, 두 좌표 간 거리(미터)
  - `isRouteNearPoi()`: route의 어느 한 점이라도 POI 반경 내이면 true
  - `matchPoisForActivity()`: poi 테이블 전체 로드 후 필터링, SupabaseClient 인수
- **`src/lib/strava/sync.ts`**: POI 매칭 + 배지 발급 연동
  - rawActivities 루프 → getActivityStreams → matchPoisForActivity → POI 배지 발급
  - `triggered_by='poi_match'`, `triggered_by_poi_id=poi.id` 저장
  - 경로 없는 활동 skip, 중복 발급 방지(maybeSingle 선조회 + 23505 fallback)
  - 반환값 `badges` = 일반배지 + POI배지 합산

### 주의 사항 (jam-lead 참조)
- Streams API 활동당 1회 호출 → 대량 동기화 시 rate limit 소진 가능
- poi 테이블 활성화/마이그레이션은 jam-lead Task #1에서 완료됨을 확인

## 2026-07-09 — jam-map Task #3 완료

### 배지 상세 화면 POI 아웃링크 활성화
- [x] `src/app/(main)/badges/[id]/PoiMapButton.tsx` 생성 (클라이언트 컴포넌트)
  - 카카오맵 딥링크 `kakaomap://look?p={lat},{lng}` 우선 시도
  - 300ms 후 구글맵 웹 `https://maps.google.com/?q={lat},{lng}` 폴백
  - 단일 "지도에서 보기" 버튼 (기존 두 버튼 통합)
- [x] `src/app/(main)/badges/[id]/page.tsx` 업데이트
  - `user_activity_badges` 쿼리에 `poi:triggered_by_poi_id(id, name, latitude, longitude)` join 추가
  - triggered_by_poi_id 우선, 없으면 condition_json.poi_id 폴백
  - 기존 두 `<a>` 버튼 → `<PoiMapButton>` 컴포넌트 교체

### middleware → proxy 리네임 (Next.js 16 deprecated 경고 해결)
- [x] `src/proxy.ts` 생성 (함수명 `middleware` → `proxy` 변경, 내용 동일)
- [x] `src/middleware.ts` 삭제
- Next.js 16 docs 확인: file-conventions/proxy 가 새 컨벤션

## 2026-07-09 — Phase 3 시작 / jam-drop Task 완료

### 아이템 드랍 엔진 (Task: jam-drop)
- [x] `src/lib/drop-engine/index.ts` 신규 생성
  - rarity 추첨: common(40%) / rare(25%) / legendary(10%) / mythic(5%) / 드랍없음(20%)
  - badges 테이블에서 type='item' + 해당 rarity 배지 중 랜덤 1개 선택
  - inventory.used_slots < max_slots 슬롯 체크 (초과 시 조용히 종료)
  - inventory_items INSERT — obtained_by='drop', expires_at=NOW()+30일
  - inventory.used_slots +1 UPDATE
  - 전부 service_role 클라이언트 사용

### 아이템북 완성 체크 (Task: jam-drop)
- [x] `src/lib/itembook/checker.ts` 신규 생성
  - `checkItemBookCompletion(userId)` — 완성된 item_book id 배열 반환
  - required_activity_badge_id → user_activity_badges 보유 여부 확인
  - required_item_badge_ids[] → inventory_items 전체 보유 여부 확인 (AND 조건)

### sync.ts 드랍 엔진 연동 (Task: jam-drop)
- [x] `src/lib/strava/sync.ts`에 `tryItemDrop` import 및 호출 추가
  - 활동 루프(7번 스텝)에서 jamActivityType이 있는 활동마다 tryItemDrop 호출
  - null jamActivityType(지원 외 활동)은 드랍 skip
