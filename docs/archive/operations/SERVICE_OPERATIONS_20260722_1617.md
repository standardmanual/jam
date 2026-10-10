# JAM! 서비스 운영 문서 — 변경분 (2026-07-22 16:17)

> **이 버전의 변경 내용:** 활동 종류 `road_running` → `running`으로 개명 (죽은 값 `running`은 흡수 통합). 표시 라벨 "로드러닝" → "러닝"으로 변경. 기존 배지/유저 데이터도 마이그레이션으로 함께 변경.  
> 이전 버전: SERVICE_OPERATIONS_20260722_1543.md

---

## [변경] 활동 종류 `road_running` → `running` 리네임

**배경:** `ActivityType`에 과거부터 `'running'`(세분화 이전 값)과 `'road_running'`(러닝을 로드/트레일로 세분화한 이후 값)이 공존했다. 확인 결과 `'running'`은 Strava 동기화 매핑, 배지 조건, 시드 데이터 어디에도 실제로 쓰이지 않는 완전한 죽은 값이었다 — road_running 도입 이후 남은 잔재. 이번에 `road_running`을 `running`으로 개명해 하나로 정리했다(트레일 러닝은 `trail_running`으로 계속 구분).

**코드 변경:**
- `src/types/database.ts`: `ActivityType` = `'cycling' | 'running' | 'trail_running' | 'hiking' | 'walking'` (5종, road_running 제거)
- `src/types/strava.ts`: `STRAVA_TYPE_TO_JAM`/`STRAVA_SPORT_TYPE_TO_JAM`의 `Run`/`VirtualRun` 매핑값을 `road_running` → `running`으로 변경
- 어드민 배지 등록 폼(`BadgeForm.tsx`), 배지 필터 드롭다운(`BadgesFilterBar.tsx`, 라벨 "로드러닝"→"러닝"), 시뮬레이터(`admin/simulator/page.tsx`)의 활동 종류 목록 갱신
- 라벨 맵 2곳(`src/lib/utils.ts`의 `ACTIVITY_TYPE_LABELS`, `badges/[id]/page.tsx`의 `ACTIVITY_LABELS`) — `road_running: '로드러닝'` 항목 제거, `running`의 라벨을 `'러닝'`으로 통일(기존 `lib/utils.ts`는 `running: '달리기'`였던 걸 `'러닝'`으로 수정)
- `src/lib/drop-engine/constants.ts`의 `ONBOARDING_FACTION_BY_ACTIVITY` — `running`/`road_running`이 이미 같은 세계관 UUID를 가리키고 있어 중복 항목만 제거

**데이터 마이그레이션 (041):** 배지 엔진은 `activity_type`을 단순 문자열 비교로만 다뤄 특별 처리 로직 변경은 불필요했지만, 이미 프로덕션에 적용된 배지 시드(029/033)가 `road_running`이 박힌 채로 들어가 있어(약 486곳) 신규 마이그레이션으로 기존 데이터를 직접 변경했다:
- `badges.activity_types` 배열: `array_replace(..., 'road_running', 'running')`
- `badges.condition_json->>'activity_type'`: `jsonb_set`으로 `"running"`으로 교체
- `users.activity_types` 배열도 동일 처리
- 컬럼 코멘트도 허용값 목록 갱신

**영향 없는 것:** 배지 엔진(`badge-engine/index.ts`)의 조건 평가·홍수 방지·진행도 트랙 로직은 `activity_type` 값을 범용 문자열로만 다뤄 코드 변경이 필요 없었음. 배지 이름(name)이나 `prerequisite_badge_names`에는 "로드러닝" 문자열이 없어 영향 없음.

**문서:** `PRD/badge/액티비티배지 레시피.md`, `PRD/badge/BADGE_ENGINE_UNIFIED.md`의 `road_running`/"로드러닝" 언급을 `running`/"러닝"으로 갱신.

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260722_1543.md)과 동일. §17 Strava 활동 타입 매핑 표의 `road_running` 값을 `running`으로 갱신 필요.
