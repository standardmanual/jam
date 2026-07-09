# 진행 상황 — Phase 2

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
