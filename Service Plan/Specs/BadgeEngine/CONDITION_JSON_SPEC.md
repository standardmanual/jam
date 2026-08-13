# 배지 발급 조건 필드 전체 스펙 (`condition_json`)

> 최초 생성: 2026-08-07  
> 관련 문서: [BADGE_ENGINE_UNIFIED.md](BADGE_ENGINE_UNIFIED.md) (엔진 평가 로직), [../Content/ACTIVITY_BADGES.md](../Content/ACTIVITY_BADGES.md) (배지 전체 목록)  
> DB 컬럼: `badges.condition_json` (JSONB)

이 문서는 `condition_json`에 들어올 수 있는 **모든 필드의 타입·의미·평가 방식**을 정의하는 단일 출처(source of truth)이다.  
엔진 구현의 평가 로직은 BADGE_ENGINE_UNIFIED.md를 참조하고, 이 문서는 "어떤 필드를 쓸 수 있는가"를 명세한다.

---

## 1. 배지 타입별 적용 범위

| 배지 타입 (`badges.type`) | `condition_json` 사용 여부 | 평가 주체 |
|---------------------------|---------------------------|-----------|
| `activity` | ✅ 사용 | 액티비티배지 엔진 (`src/lib/badge-engine/index.ts`) |
| `item` | ❌ 미사용 — 드랍 엔진이 별도 확률 로직으로 결정 | 드랍 엔진 (`src/lib/drop-engine/`) |
| `poi` | ⚠️ `poi_id` 필드 존재 — GPS 매칭 파이프라인이 처리 | `matchPoisForActivity` |

---

## 2. 전체 필드 목록

### 2.1 활동 필터 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `activity_type` | `string` | Strava 활동 타입. 유효값: `"walking"` `"running"` `"cycling"` `"hiking"` `"trail_running"` |

### 2.2 누적 통계 필드 (전체 이력 합산)

| 필드 | 타입 | 단위 | 평가 방식 |
|------|------|------|-----------|
| `distance_km` | `number` | km | `activity_type` 필터 후 **전체 누적 거리** ≥ 조건값 |
| `elevation_gain_m` | `number` | m | `activity_type` 필터 후 **전체 누적 고도** ≥ 조건값 |
| `total_count` | `number` | 회 | 필터된 활동 **건수** ≥ 조건값 |

### 2.3 단일 활동 최고값 필드

| 필드 | 타입 | 단위 | 평가 방식 |
|------|------|------|-----------|
| `min_speed_kmh` | `number` | km/h | 단일 활동 중 최고 평균 속도 ≥ 조건값. 주로 `cycling` 사용 |
| `max_pace_sec_per_km` | `number` | 초/km | 단일 활동 중 최고 페이스 ≤ 조건값 (값 작을수록 빠름). `min_speed_kmh`와 부등호 방향 반대. 주로 `running` 사용 |
| `duration_minutes` | `number` | 분 | 단일 활동 중 최대 이동 시간 ≥ 조건값 |

### 2.4 연속·패턴 필드

| 필드 | 타입 | 단위 | 평가 방식 |
|------|------|------|-----------|
| `streak_days` | `number` | 일 | 전체 이력 기준 최장 연속 활동일 수 ≥ 조건값 |
| `weekly_count` | `number` | 회 | 한 주(월–일) 내 활동 횟수 최대값 ≥ 조건값. `time_range` 동반 시 해당 시간대 활동만 카운트 |
| `weekend_duration_hours` | `number` | 시간 | 토·일 활동 이동시간(시간) 최대값 ≥ 조건값 |

### 2.5 월·계절 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `month` | `number` (1–12) | 특정 달 지정. `monthly_km`과 함께 사용 |
| `monthly_km` | `number` | 월별 누적 거리 최대값 ≥ 조건값. `month` 없으면 전체 연-월 그룹 최대 |
| `season` | `"spring"` \| `"summer"` \| `"autumn"` \| `"winter"` | 해당 계절 지정 |
| `season_count` | `number` | 해당 계절 활동 횟수 ≥ 조건값 |

### 2.6 환경 조건 필드

| 필드 | 타입 | 단위 | 평가 방식 | 주의 |
|------|------|------|-----------|------|
| `temperature_min_c` | `number` | °C | Strava `average_temp` ≤ 조건값 (혹한) | 날씨 데이터 없는 활동 → 무조건 fail |
| `temperature_max_c` | `number` | °C | Strava `average_temp` ≥ 조건값 (폭염) | 동일 |

### 2.7 시간대 필드

| 필드 | 타입 | 형식 | 평가 방식 |
|------|------|------|-----------|
| `time_range` | `{ start: "HH:MM", end: "HH:MM" }` | 24시간 | `startDateLocal`의 HH:MM이 범위 내인 활동만 카운트. 자정 걸침 지원 (예: `{start:"22:00", end:"06:00"}`) |

### 2.8 선행 배지 필드

| 필드 | 타입 | 평가 방식 |
|------|------|-----------|
| `prerequisite_badge_names` | `string[]` | **OR 매칭** — 유저가 나열된 배지명 중 하나 이상 보유 시 통과. Rare/Legend/Mythic 전용 (Common은 불필요) |

### 2.9 POI 필드 (badge-engine 외 처리)

| 필드 | 타입 | 평가 주체 |
|------|------|-----------|
| `poi_id` | `string` (UUID) | badge-engine 내 **항상 fail** — `matchPoisForActivity` GPS 경로 매칭 파이프라인이 별도 발급 |

---

## 3. 필드 조합 규칙

- 같은 `condition_json` 내 모든 필드는 **AND** 조건 (모두 충족 시 발급)
- 단일 조건(필드 1개)과 복합 조건(필드 2개+)은 "진행 트랙 중복 제거" 정책이 다르게 적용됨 → BADGE_ENGINE_UNIFIED.md § 2.5 참조
- `poi_id`는 다른 조건 필드와 혼합 불가 (엔진 미지원)

---

## 4. 예시

```jsonc
// 단순 누적 거리 (걷기 100km)
{ "activity_type": "walking", "distance_km": 100 }

// 복합: 페이스 + 지속 시간 (빠른 러닝 장거리)
{ "activity_type": "running", "max_pace_sec_per_km": 320, "duration_minutes": 60 }

// 야간 활동 (22시~06시 사이 걷기, 주 3회)
{ "activity_type": "walking", "time_range": { "start": "22:00", "end": "06:00" }, "weekly_count": 3 }

// 선행 배지 (Rare 이상 필수)
{ "activity_type": "cycling", "distance_km": 500, "prerequisite_badge_names": ["라이딩 입문자"] }

// POI 배지 (GPS 매칭)
{ "poi_id": "uuid-here" }
```

---

## 5. 미구현·제한 사항

| 항목 | 상태 |
|------|------|
| `poi_id` badge-engine 평가 | ❌ 항상 fail — GPS 파이프라인 전용 |
| `temperature_*` (날씨 데이터 없는 활동) | ⚠️ fail — Strava average_temp 의존 |
| UTC vs KST 경계 | ⚠️ `streak_days`·`weekly_count`·`time_range`는 UTC 기준 — KST 자정 경계 오차 가능 |
