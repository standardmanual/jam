# 발견 사항 & 공유 자료

## 2026-07-20 — 메인세션: 핵심 파일 위치 (사전 확인)
- 배지엔진: jam-web/src/lib/badge-engine/index.ts
- 드랍엔진: jam-web/src/lib/drop-engine/index.ts
- 어드민 lib: jam-web/src/lib/admin/ (내부 파일 탐색 필요)
- API: jam-web/src/app/api/ — admin/, strava/, drops/, badges/ 등 확인 필요
- 유저 UI: jam-web/src/app/(main)/ 하위 탐색 필요
- 배지 레시피 신규 조건 타입 (엔진 지원 여부 확인 대상):
  - monthly_km (기존 지원: month+monthly_km)
  - weekend_duration_hours (기존 지원)
  - season + season_count (기존 지원)
  - time_range + weekly_count (복합 — NEW 패턴, 기존엔 time_range+duration만)
  - min_speed_kmh + duration_minutes (복합 AND — 이력 전반 독립 평가)
  - min_speed_kmh + elevation_gain_m (복합 AND — 이력 전반 독립 평가)
  - temperature_max_c + duration_minutes (복합 AND — 이력 전반 독립 평가)
  - elevation_gain_m + temperature_max_c (복합 AND — 이력 전반 독립 평가)

---

## 2026-07-20 — dev-admin: 어드민 배지 파일 위치 & 현황

### 어드민 배지 파일
- 생성/수정 폼: `jam-web/src/app/admin/badges/BadgeForm.tsx` (client, 구조화된 필드 빌더)
- 목록 페이지: `jam-web/src/app/admin/badges/page.tsx`
- 신규 페이지: `jam-web/src/app/admin/badges/new/page.tsx`
- 수정 페이지: `jam-web/src/app/admin/badges/[id]/page.tsx`
- API 생성/목록: `jam-web/src/app/api/admin/badges/route.ts` (GET, POST)
- API 수정/삭제: `jam-web/src/app/api/admin/badges/[id]/route.ts` (PUT, DELETE)
- 타입 정의: `jam-web/src/types/database.ts` (BadgeCondition, L315-358)

### condition_json 입력 방식
- **구조화된 필드 빌더** (raw JSON 입력 아님). 각 필드별 input + JSON 미리보기 표시.
- 타입(BadgeCondition)은 이미 모든 v3.1 필드 지원 (temperature_min_c/max_c, time_range, monthly_km 단독 등)
- monthly_km 단독 / time_range+weekly_count 조합은 폼에서 이미 가능(각 필드 독립 optional)

### 발견한 GAP / 버그
1. BadgeForm.tsx: `temperature_min_c`, `temperature_max_c`, `time_range`(start/end) 입력 UI 없음 → 타입은 지원하나 폼에서 수집 불가. 카테고리 2(temp복합)·3(time_range) 배지 생성 불가.
2. **버그**: `api/admin/badges/route.ts` POST가 `item_book_id`를 destructure/insert 하지 않음 → 배지 신규 생성 시 아이템북 소속이 항상 유실됨(PUT은 정상).
3. condition_json 유효성 검사 없음(season↔season_count 짝, time_range HH:MM 형식 미검증).
4. 목록 페이지에 카테고리 표시 없음.

### 변경 완료 (dev-admin)
- `BadgeForm.tsx`
  - state 추가: condTempMinC / condTempMaxC / condTimeStart / condTimeEnd
  - `buildConditionJson()`에 temperature_min_c·temperature_max_c·time_range 조립 추가 (start·end 둘 다 있을 때만 time_range 세팅)
  - `validateCondition()` 신규 + handleSubmit 진입부에서 실행: season↔season_count 짝, time_range start/end 필수 & HH:MM(`/^([01]\d|2[0-3]):[0-5]\d$/`) 검증
  - 조건 빌더 그리드에 온도(min/max) input + 시간대(start/end, `type="time"`) input + 자정넘김 안내문 추가
- `admin/badges/page.tsx`
  - `deriveBadgeCategory()` 추가(condition_json→기본/고난이도/복합속성/리텐션) + '카테고리' 컬럼 렌더, empty colSpan 8→9
  - 판별 우선순위: 리텐션(time_range+weekly_count | weekend_duration_hours | season+season_count) → 고난이도(monthly_km) → 복합속성(난이도속성 speed·distance·elev·duration·temp 중 2개+) → 기본
- `api/admin/badges/route.ts` POST: `item_book_id` destructure + insert 추가 (GAP#2 버그 수정)
- 검증: `npx tsc --noEmit` 에러 0. (브라우저 시각검증은 admin 인증+DB 필요로 미실행)
- 참고: page.tsx는 다른 팀원이 conditionSummary 헬퍼를 동시 추가 중 — 카테고리 컬럼과 공존, 충돌 없음.

---

## 2026-07-20 — 팀장: 아키텍처 리뷰 결과 (엔진/타입/드랍 = 이미 지원)

### 배지엔진 (`badge-engine/index.ts`) — 신규 조건 전부 구현 완료
- monthly_km: L119-138 (연-월 그룹핑 후 max) ✓
- weekend_duration_hours: L95-105 (토=6·일=0 필터, movingTime/3600 max) ✓
- season + season_count: L140-157 (SEASON_MONTHS 필터, count) ✓
- time_range: L181-203 (자정 넘김 처리 포함, `.some()`) ✓
- temperature_max_c: L170-179 (활동 중 최저기온 ≤ 조건) ✓
- min_speed_kmh·elevation_gain_m·duration_minutes·weekly_count·streak_days ✓
- 복합 AND(R7·C7·H7·T7): 각 필드가 독립 if 블록 → filtered 전체에서 독립 평가 = 레시피 "이력 전반 독립 평가"와 정확히 일치. 세션 동시충족 아님.

### 타입 (`types/database.ts` BadgeCondition, L315-358) — 전 필드 존재. 변경 불필요.

### 진행 트랙 미세 불일치 (저우선, 실무상 무해)
- `getProgressionKey`(L522)는 monthly_km·weekend_duration_hours·season 등 modifier가 있으면 null(standalone) 반환 → 레시피 "엔진 연동 규칙" 표는 이들을 ✅트랙으로 표기. 다만 각 지표는 activity_type당 배지 이름이 1개뿐이라 크로스-이름 트랙 중복제거가 애초에 발생 안 함 → 발급 결과 동일. 엄격 정합성 원하면 getProgressionKey에 케이스 추가.

### 드랍엔진 (`drop-engine/index.ts`) — 변경 불필요
- item 배지에 대해서만 `checkCondition`(L113) 호출. 신규 조건도 공유 엔진으로 정상 평가. skip 처리 불필요.

### 어드민 폼 (`BadgeForm.tsx`) — 실제 GAP
- 보유 input: distance_km·total_count·elevation_gain_m·min_speed_kmh·streak_days·activity_type·poi_id·duration_minutes·weekend_duration_hours·weekly_count·month·monthly_km·season_count·season·prerequisite_badge_names
- **누락: `time_range`(start/end), `temperature_max_c`, `temperature_min_c`** → W5/W7/W8/T8(time_range), H5/H7/T5/T7(temperature) UI 생성 불가.
- `buildConditionJson()`(L69)에도 해당 3필드 조립 로직 추가 필요.

### 어드민 API (`api/admin/badges/route.ts`)
- condition_json을 통째로 pass-through(필드 검증 없음) → 신규 필드 자동 수용, API 변경 불필요.
- (참고, 범위 외) POST 구조분해(L20)에 `item_book_id` 누락 — 폼은 전송하나 API가 안 받음. 기존 버그 가능성, 별도 확인 권장.

### 유저 배지 상세 (`(main)/badges/[id]/page.tsx` formatConditionText, L33) — 실제 GAP
- time_range·temperature_max_c·temperature_min_c 문구 없음 → 온도-단일 배지(H5 등)는 parts 비어 "관리자에 의해 특별 발급되는 배지입니다" 폴백으로 오표기. 문구 추가 필요.

### 테스트 (`badge-engine/__tests__/conditions.test.ts`)
- 커버됨: temperature_min_c·temperature_max_c·time_range·poi_id·prerequisite
- **미커버(추가 대상): monthly_km, weekend_duration_hours, weekly_count, season+season_count, 복합 AND 독립평가, time_range+weekly_count 조합**

---

## 2026-07-20 — dev-engine: 엔진 점검 결과 + 변경 사항

### 배지엔진 — 코드 변경 없음 (lead 리뷰와 동일 결론)
- 신규 조건 8종 전부 정상 동작 재확인. monthly_km 단독은 L119 `month !== undefined || monthly_km !== undefined` 분기가 처리(month 없으면 monthFiltered=filtered 전체 → 연-월 그룹 max). time_range+weekly_count는 독립 if 블록 AND = 레시피 "이력 전반 독립 평가" 일치.

### 드랍엔진 — 방어 가드 추가 (옵션 A 채택)
- **lead는 "변경 불필요"로 판단했으나**, dev-engine 지시서의 권장(옵션 A)에 따라 누적/기간 조건 배지를 드랍 풀에서 명시적 제외하는 가드를 추가함.
- 근거: 드랍엔진의 `checkCondition(cond, activities)`에서 `activities`는 sync.ts L164의 `activitiesFiltered`(이번 싱크 배치)뿐 — 유저 전체 이력이 아님. 따라서 item 배지에 monthly_km/season_count 같은 누적 조건이 붙으면 부분 데이터로 오판정(예: 단일 60km 활동이 monthly_km:50을 통과)될 수 있음. 현재 그런 item 배지는 없지만(무해) 향후 오발급 방지용 방어 코드.
- 추가한 export (순수 함수, Supabase 비의존 → 테스트 가능):
  - `hasCumulativeCondition(cond)` — monthly_km·season_count·weekly_count·streak_days·total_count 중 하나라도 있으면 true
  - `isDroppableForActivity(cond, activities)` — 조건없음→true, 누적조건→false, 그 외→checkCondition
- filter(L110)를 `isDroppableForActivity`로 교체. 기존 단일활동 조건(distance_km·duration_minutes·time_range 등) 동작은 그대로.

### 타입 — 변경 없음 (BadgeCondition 전 필드 존재)

### 테스트 (신규 2파일)
- `badge-engine/__tests__/new-conditions.test.ts` — monthly_km 단독, time_range+weekly_count 독립 AND, weekend_duration_hours, season+season_count
- `drop-engine/__tests__/droppable.test.ts` — 누적조건 드랍불가(monthly_km·season_count·weekly_count·streak_days·total_count), 단일활동조건 정상, hasCumulativeCondition
- 주의: 프로젝트에 test runner(jest/vitest) 미설치 — 기존 conditions.test.ts도 현재 실행 불가 상태. 테스트는 기존 파일과 동일 컨벤션(describe/it/expect) 준수. `tsc --noEmit` 전체 0 에러 확인.

---

# DEAD_ENDS (시도했으나 실패한 접근)

(아직 없음)
