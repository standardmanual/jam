# JAM! Phase 7 — 구현 Phase 분리 계획

> 생성일: 2026-07-10

---

## Phase 7-A: 백엔드 기반 (DB + API)

**목표**: 드랍/픽업 데이터 레이어 완성. UI 없이도 데이터 흐름 검증 가능.

**작업 목록**:

1. **DB 마이그레이션** (`004_phase7_user_drops.sql`)
   - `poi_drops` 테이블 생성
   - `inventory_items`에 `dropped_at`, `drop_id` 컬럼 추가
   - RLS 정책 적용
   - `pickup` 트랜잭션 RPC 함수 작성

2. **타입 업데이트** (`src/types/database.ts`)
   - `PoiDropRow` 인터페이스 추가
   - `ItemObtainedBy`에 `'pickup'` 추가

3. **API Routes**
   - `POST /api/drops` — 드랍 실행 (위치 검증 + poi_drops INSERT + inventory_items 논리 삭제)
   - `GET /api/drops/nearby?lat=&lng=` — 반경 50m POI + 드랍 현황 조회
   - `POST /api/drops/[dropId]/pickup` — 픽업 실행 (위치 검증 + RPC 호출)

4. **위치 검증 유틸** (`src/lib/poi/proximity.ts`)
   - 기존 `matcher.ts`의 haversineDistance 재활용
   - `isUserNearPoi(userLat, userLng, poi): boolean` 함수

**완료 기준**: Postman/curl로 드랍 → 픽업 전체 플로우 검증

---

## Phase 7-B: 지도 UI

**목표**: 인앱 구글맵으로 드랍/픽업 인터랙션 완성.

**작업 목록**:

1. **Google Maps 설정**
   - `@googlemaps/js-api-loader` 패키지 설치
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 환경변수 추가
   - Maps API 키 HTTP Referer 제한 설정 (Google Cloud Console)

2. **MapView 컴포넌트** (`src/components/map/MapView.tsx`)
   - 지도 초기화 (현재 위치 중심)
   - 현재 위치 마커 (파란 점)
   - POI 마커 (아이템 있음/없음 구분)
   - 50m 반경 Circle 표시

3. **드랍 화면** (`src/app/(main)/drops/page.tsx`)
   - 위치 권한 요청 플로우
   - 근처 POI + 드랍 현황 로드
   - POI 선택 → 인벤토리 아이템 목록 바텀시트
   - 드랍 확인 → API 호출 → 성공 토스트

4. **픽업 화면** (`src/app/(main)/drops/pickup/page.tsx`)
   - 근처 드랍 가능 POI 표시
   - POI 선택 → 아이템 목록 바텀시트 (드랍한 유저, rarity, 드랍 시각)
   - 픽업 확인 → API 호출 → 인벤토리 업데이트

5. **탭바 연동** (`src/app/(main)/TabBar.tsx`)
   - 드랍/픽업 진입점 추가 (아이콘 버튼)

**완료 기준**: 실제 기기에서 위치 잡고 드랍 → 다른 계정으로 픽업 E2E 성공

---

## Phase 7-C: 폴리싱

**목표**: 엣지 케이스 처리 + UX 개선.

**작업 목록**:

1. **드랍 이력 페이지** (선택사항)
   - 내가 드랍한 아이템 현황 (픽업됐는지 확인)
   - 내가 픽업한 아이템 이력

2. **만료 정책 결정 후 구현** [NEEDS CLARIFICATION]
   - 만료된 드랍 자동 회수 (cron job 또는 Edge Function)

3. **어드민 연동**
   - 어드민 패널에서 poi_drops 현황 조회
   - 문제 드랍 강제 회수 기능

4. **성능 최적화**
   - POI 쿼리 캐싱 (SWR 또는 React Query)
   - 지도 마커 클러스터링 (POI 많을 때)

**완료 기준**: 베타 유저 10명에게 배포 후 1주일 운영

---

## 각 Phase 완료 기준 (진짜 제품 체크리스트)

### Phase 7-A 체크리스트
- [ ] Supabase 대시보드에서 `poi_drops` 테이블 확인
- [ ] `POST /api/drops` → `poi_drops` 레코드 생성 확인
- [ ] `POST /api/drops/[id]/pickup` → `inventory_items` 생성 확인
- [ ] 동시 픽업 시 선착순 처리 확인 (race condition 없음)
- [ ] 인벤토리 슬롯 초과 시 픽업 차단 확인

### Phase 7-B 체크리스트
- [ ] 실제 기기(아이폰/안드로이드)에서 위치 권한 취득
- [ ] 실제 POI 50m 이내에서 드랍 버튼 활성화 확인
- [ ] 드랍 후 같은 POI에서 다른 계정으로 픽업 성공
- [ ] 본인 드랍 아이템은 본인 픽업 불가 확인
- [ ] 인벤토리 페이지에서 드랍된 아이템 미표시 확인
- [ ] 구글맵 로드 3초 이내 확인
