---
type: engine-spec
description: "배지 조건(`condition_json`)에 쓸 수 있는 모든 필드의 타입, 의미, 평가 방식을 정의한 단일 출처 문서다."
tags: [배지]
code:
  - "jam-web/src/lib/badge-engine/conditionRegistry.ts"
  - "jam-web/src/lib/badge-engine/condition-schema.ts"
---

# 배지 발급 조건 필드 전체 스펙 (`condition_json`)

> 최초 생성: 2026-08-07  
> 관련 문서: [BADGE_ENGINE_UNIFIED.md](BADGE_ENGINE_UNIFIED.md) (엔진 평가 로직), [../Content/ACTIVITY_BADGES.md](../content/ACTIVITY_BADGES.md) (배지 전체 목록)  
> DB 컬럼: `badges.condition_json` (JSONB)

이 문서는 `condition_json`에 들어올 수 있는 **모든 필드의 타입·의미·평가 방식**을 정의하는 단일 출처(source of truth)이다.  
엔진 구현의 평가 로직은 BADGE_ENGINE_UNIFIED.md를 참조하고, 이 문서는 "어떤 필드를 쓸 수 있는가"를 명세한다.

> **데이터 계약 검증** (2026-08-25, 티켓 20260825_031): 아래 필드 목록은 코드에서
> `ALL_CONDITION_KEYS`가 단일 소스다. **2026-09-05(티켓 20260905_0028)부터 실제 선언 위치는
> `src/lib/badge-engine/conditionRegistry.ts`이며**(`condition-schema.ts`는 그 파생 목록을
> 다시 내보내는 얇은 층으로만 남았다), 키뿐 아니라 라벨·단위·입력 타입·min/max/step·짝 필드·
> 방향성·**평가 구현 여부**까지 한 곳에서 선언한다.
> `badges.condition_json`에 이 목록 밖의 키가 들어오면 DB CHECK 제약
> (`badges_condition_json_known_keys`, `supabase/migrations/102_condition_json_check_constraint.sql`)이
> INSERT/UPDATE 자체를 거부하고, 어드민 API(`src/lib/admin/badge-validation.ts`의
> `findUnknownConditionKeyError`)가 저장 전에 한국어 에러로 먼저 막는다. 마이그레이션
> `084_badge_condition_cleanup.sql`이 이 문서에 없던 `mission_reward` 필드를 검증 없이 넣으면서
> 미션 없이 미션보상배지가 발급되는 사고(티켓 20260825_028)로 이어진 것이 이 검증 계층의 도입
> 배경이다. 새 필드를 추가할 때는 이 문서 + `condition-schema.ts` + CHECK 제약 배열을 함께 갱신할 것.

---

## 1. 배지 타입별 적용 범위

| 배지 타입 (`badges.type`) | `condition_json` 사용 여부 | 평가 주체 |
|---------------------------|---------------------------|-----------|
| `activity` | ✅ 사용 | 액티비티배지 엔진 (`src/lib/badge-engine/index.ts`) |
| `item` | ❌ 미사용 — 드랍 엔진이 별도 확률 로직으로 결정 | 드랍 엔진 (`src/lib/drop-engine/`) |
| `poi` | ⚠️ `poi_id` 필드 존재 — GPS 매칭 파이프라인이 처리 | `matchPoisForActivity` |

---

## 2. 조건 필드 (발급 판정에 관여)

아래 필드들은 badge-engine의 `evaluateConditionDetailed`가 실제로 검사에 사용한다 — 즉 이 필드들의
값이 배지 발급 여부(pass/fail)를 직접 좌우한다. §3의 메타데이터 필드와 구분된다.

### 2.1 활동 필터 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `activity_type` | `string` | Strava 활동 타입. 유효값: `"walking"` `"running"` `"cycling"` `"hiking"` `"trail_running"` |
| `day_of_week` | `DayOfWeek \| DayOfWeek[]` | 활동 시작 요일(**한국 시각 KST 기준**, UTC `startDate`를 변환 — 티켓 20261018_1815) 필터. **단일값**: `time_range`처럼 다른 필드와 AND 결합되는 필터 (예: `day_of_week:"sunday"` + `total_count:1000`). **배열 + `total_count` 동시 지정**: "요일별 독립 카운터" 모드로 전환 — 배열의 각 요일이 각각 독립적으로 `total_count`를 만족해야 발급 (예: 평일 5일 각각 300회 — W08 "평일의 성실함"). 각 요일의 횟수는 «그 요일에 활동한 날의 수»다 |
| `route` | `string` | 특정 루트 이름 필터용으로 스키마(`condition-schema.ts`의 `FILTER_ONLY_CONDITION_KEYS`)에 정의돼 있으나 **badge-engine 평가 로직에 실제 구현이 없다** — `src/lib/badge-engine/index.ts` 전체에 참조가 없어 조건에 넣어도 필터링 효과가 없다(무시됨). 어드민 폼에는 입력 UI가 없지만, 값이 있는 배지를 폼에서 저장해도 유실되지는 않는다(티켓 20260825_032에서 보존 로직 적용 완료). §6 참조 |

### 2.2 누적 통계 필드 (전체 이력 합산)

| 필드 | 타입 | 단위 | 평가 방식 |
|------|------|------|-----------|
| `distance_km` | `number` | km | `activity_type` 필터 후 **전체 누적 거리** ≥ 조건값. `same_activity: true`가 함께 있으면 예외(§2.2-1) |
| `elevation_gain_m` | `number` | m | `activity_type` 필터 후 **전체 누적 고도** ≥ 조건값. `same_activity: true`가 함께 있으면 예외(§2.2-1) |
| `total_count` | `number` | 회 | 필터된 활동의 **활동한 날의 수**(KST 날짜 기준, 같은 날 여러 건은 1회) ≥ 조건값. 이미 받은 배지에는 소급하지 않는다(티켓 20261018_1815) |
| `cumulative_duration_hours` (2026-09-06 신규, 티켓 20260906_0110 ①) | `number` | 시간 | `activity_type` 필터 후 **전체 누적 이동시간** ≥ 조건값. `duration_minutes`(§2.3, 단일 활동 전용)와 달리 이력 전체 합산이다. 레지스트리에 키가 없어 v5 카탈로그 시딩(0035)에서 빠졌던 `walking:K2`·`running:K2`·`hiking:K2`(3계열)를 복구하기 위해 추가됨 — `evaluation: 'engine'` |
| `monthly_count` (2026-09-06 신규, 티켓 20260906_0110 ①) | `number` | 회 | 월별(KST 연-월 그룹) **활동한 날의 수** 최대값 ≥ 조건값. `monthly_km`(거리)·`weekly_count`(주 단위)와 구분되는 «월 단위 활동 횟수» 필드. `repeat_count`와 결합하면 「그 횟수를 채운 달의 수」를 센다(§2.11). `cycling:G2`·`hiking:C2`(2계열)를 복구하기 위해 추가됨 — `evaluation: 'engine'` |

#### 2.2-1 `same_activity` — "동시 충족" 예외 플래그 (2026-08-31 신규)

| 필드 | 타입 | 설명 | 평가 방식 |
|------|------|------|-----------|
| `same_activity` | `boolean` | `distance_km`/`elevation_gain_m`을 "누적 합계"가 아니라 "한 활동에서 동시/단독 충족"으로 평가하도록 전환하는 플래그 | 이 값이 `true`이면, `distance_km`·`elevation_gain_m` 중 그 배지에 있는 필드(들)를 모두 만족하는 활동이 1건 이상 있어야 발급된다. 필드가 하나뿐이어도(T23) 적용 가능 — 그 경우 "그 필드 하나를 단일 활동에서 충족"으로 평가된다. `false`/미지정(기본값)이면 각각 전체 이력 누적 합계로 독립 평가된다 |

그 자체만으로는 pass/fail을 만들지 않는 **필터 전용 필드**(`condition-schema.ts`의
`FILTER_ONLY_CONDITION_KEYS`)로 분류된다 — `activity_type`과 같은 성격이다. 현재 카탈로그에서는
`야생의 첫발`(T1, `distance_km` + `elevation_gain_m` 복합 AND)과 `그냥 나갔다 옴`(T23, 단독
`distance_km:0.6`) 2건이 이 플래그를 쓴다.

> 배경(티켓 20260831_2100): 커밋 `27163030`(2026-07-31)이 "서로 다른 활동의 필드를 조합해
> 잘못 통과되던 버그"를 고치면서 단독 `distance_km`/`elevation_gain_m`(원래 누적이어야 함)까지
> "한 활동 동시 충족"으로 과잉 일반화했다. 2026-08-31에 문서(`ACTIVITY_BADGES.md`) 기준으로
> 복원하면서, 진짜 "동시 충족"이 맞는 T1만 이 플래그로 명시했다(마이그레이션 117). 같은
> 티켓의 후속 작업으로, 문서에 "(단일 활동)"으로 명시된 T23(단독 필드라 필드 조합만으로는
> 판별 불가)에도 동일 플래그를 적용했다(마이그레이션 120). 어드민 `BadgeForm.tsx`에는
> 전용 입력 UI가 없고, `route`·`poi_id`·`day_of_week`·`active_days_count`·`season_count_all`과
> 동일하게 폼 저장 시 원본 값이 그대로 보존된다(`FORM_UNSUPPORTED_CONDITION_KEYS`).

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
| `weekly_count` | `number` | 회 | 한 주(월–일, KST) 내 **활동한 날의 수** 최대값 ≥ 조건값. `time_range` 동반 시 해당 시간대 활동만 카운트 |
| `weekend_duration_hours` | `number` | 시간 | 토·일 활동 이동시간(시간) 최대값 ≥ 조건값 |
| `active_days_count` | `number` | 일 | 걷기(축1 게이트 통과) 활동의 누적 **고유** 활동일수 ≥ 조건값 — `COUNT(DISTINCT date)`. `streak_days`(연속 일수)와 달리 연속일 필요 없음 |

### 2.5 월·계절 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `month` | `number` (1–12) 또는 `number[]` | 특정 달(들) 지정. `monthly_km`과 함께 사용. 배열이면 각 달을 OR로 묶는다(예: 장마철 6~7월) |
| `monthly_km` | `number` | 월별 누적 거리 최대값 ≥ 조건값. `month` 없으면 전체 연-월 그룹 최대. `repeat_count`와 결합하면(2026-09-08, 티켓 20260908_1536) 「그 임계값을 채운 연-월의 수」를 센다 — `month`가 배열이면 **각 달을 독립적으로** 카운트한다(`walking:W4` 실측: Epic 1개월·Mystic 2개월 = `month:[6,7]` 중 한 달/두 달). 판정은 `repeatOccurrences.ts`의 `collectMonthlyKmOccurrences()`, 단발 판정(`index.ts`)과 같은 연-월 그룹핑 규칙 공유 |
| `season` | `"spring"` \| `"summer"` \| `"autumn"` \| `"winter"` | 해당 계절 지정 |
| `season_count` | `number` | 해당 계절(KST 월 기준) **활동한 날의 수** ≥ 조건값 |
| `season_count_all` | `number` | 사계절(봄/여름/가을/겨울) **각각 독립 카운터**로 활동한 날의 수 ≥ 조건값이어야 함 — 4개 계절 모두 충족해야 통과(T15 "사계절의 발걸음"). `season_count`(지정 계절 1개만 검사)와 달리 `season` 필드 지정이 불필요. **어드민 폼에 입력 UI가 없다** — 값이 있는 배지를 폼에서 저장해도 유실되지는 않지만(티켓 20260825_032 보존 로직), 폼에서 직접 편집은 불가하다(DB 직접 수정 필요) |

### 2.6 환경 조건 필드

| 필드 | 타입 | 단위 | 평가 방식 | 주의 |
|------|------|------|-----------|------|
| `temperature_min_c` | `number` | °C | Strava `average_temp` ≥ 조건값 (폭염) | 날씨 데이터 없는 활동 → 무조건 fail |
| `temperature_max_c` | `number` | °C | Strava `average_temp` ≤ 조건값 (한파) | 동일 |

### 2.7 시간대 필드

| 필드 | 타입 | 형식 | 평가 방식 |
|------|------|------|-----------|
| `time_range` | `{ start: "HH:MM", end: "HH:MM" }` | 24시간 | UTC `startDate`를 **한국 시각(KST)** 으로 바꾼 HH:MM이 범위 내인 활동만 카운트(해외 활동도 한국 시각, `startDateLocal`은 보지 않는다 — 티켓 20261018_1815). 자정 걸침 지원 (예: `{start:"22:00", end:"06:00"}`) |

### 2.8 선행 배지 필드

| 필드 | 타입 | 평가 방식 |
|------|------|-----------|
| `prerequisite_badge_names` | `string[]` | **OR 매칭** — 유저가 나열된 배지명의 **등급형** 배지를 하나 이상 보유 시 통과. Rare/Epic/Mystic 전용 (Common은 불필요) |

⚠️ **이름은 배지를 유일하게 식별하지 못한다** (2026-09-05, 티켓 20260905_0030 B2). v5는
「무한레벨형·반복형이 등급형과 이름을 공유할 수 있다」가 설계 전제라, 레벨형 Lv.1이나
반복형 Common을 보유한 것만으로 동명 등급형의 게이트가 열리던 경로가 있었다. 그래서 이
게이트는 **보유한 등급형의 이름만** 본다. 계열을 정확히 지정하려면 §2.12를 쓴다.

### 2.9 POI 필드 (badge-engine 외 처리)

| 필드 | 타입 | 평가 주체 |
|------|------|-----------|
| `poi_id` | `string` (UUID) | badge-engine 내 **항상 fail** — `matchPoisForActivity` GPS 경로 매칭 파이프라인이 별도 발급. `checkin` 타입 배지는 조건 빌더 자체를 건너뛰고 저장 시 `condition_json`을 항상 `null`로 처리하므로 이 티켓 범위 밖(폼 유실 문제와 무관) |

### 2.10 v5 신규 조건 필드 20종 — 12종 평가 구현됨 · 8종은 여전히 **선언만** (2026-09-05 선언, 2026-09-06 갱신)

`conditionRegistry.ts`에 선언된 v5 신규 20종 중 **12종은 `evaluation: 'engine'`으로 평가가
구현됐고, 나머지 8종은 여전히 `evaluation: 'pending'`**이다. `pending`인 필드가 하나라도 든
조건은 `evaluateConditionDetailed`가 fail-closed로 막으므로 «발급되지 않는 것»이 기본값이다
(§4 참조).

> **휴식 4종**(`rest_after_streak`·`rest_after_long`·`return_gap_days`·`interval_days`)은
> **2026-09-05**(티켓 20260905_0030 B3)에, **v5 스칼라 7종**(`max_elevation_m`·`max_speed_kmh`·
> `single_distance_km`·`single_elevation_m`·`avg_heartrate_bpm`·`avg_watts`·`avg_cadence`)과
> **`weekly_streak`**는 **2026-09-06**(티켓 20260906_0110 ②)에 각각 평가가 구현돼
> `evaluation: 'engine'`으로 뒤집혔다. 아래 표에 그대로 두되 판정 규칙은 **§2.13**(휴식)·
> 본문 §2.11(회차)·BADGE_ENGINE_UNIFIED.md §2.13-1(진행률)에 있다.

**활동 1건의 스칼라 값** — `PER_ACTIVITY_KEYS` 경로로 **평가 구현됨** (2026-09-06, 티켓 20260906_0110 ②)

`정규화 필드`는 `NormalizedActivity`(`src/types/strava.ts`)에서 **같은 단위로 그대로 비교되는**
필드다. 조건 키는 snake_case, 정규화 필드는 camelCase라 이름이 규칙적으로 대응하지 않으므로
`conditionRegistry.ts`의 `activityField`가 단일 출처이고 파생물 `CONDITION_ACTIVITY_FIELD`로
꺼내 쓴다(티켓 20260905_0029). 이름이 어긋나면 `condition-registry.test.ts`가 깨진다.

| 필드 | 타입 | 단위 | 정규화 필드 | 의미 |
|------|------|------|------|------|
| `max_elevation_m` ✅ | `number` | m | `maxElevationM` | 활동 1건의 최고 도달 고도(해발) |
| `max_speed_kmh` ✅ | `number` | km/h | `maxSpeedKmh` | 활동 1건의 최고 속도 |
| `single_distance_km` ✅ | `number` | km | `distanceKm` | 활동 1건의 이동 거리 — 누적 합계인 `distance_km`과 구분된다 |
| `single_elevation_m` ✅ | `number` | m | `elevationGainM` | 활동 1건의 고도 상승 — 누적 합계인 `elevation_gain_m`과 구분된다 |
| `avg_heartrate_bpm` ✅ | `number` | bpm | `avgHeartrateBpm` | 활동 1건의 평균 심박수 |
| `avg_watts` ✅ | `number` | W | `avgWatts` | 활동 1건의 평균 파워 |
| `avg_cadence` ✅ | `number` | — | `avgCadence` | 활동 1건의 평균 케이던스. 단위가 종목마다 다르다(러닝 spm · 자전거 rpm)라 지표 라벨의 단위는 비워 뒀다. **저장 시점에 러닝·트레일러닝만 ×2 정규화**된다(`normalizeCadenceForActivityType()`, 양발 합계 spm — 사이클은 rpm 그대로, 2026-09-06 티켓 20260906_0110 ⑤) — 조건값도 이 기준으로 쓴다(예: 180) |

> **측정값이 없는 활동에는 정규화 필드의 키 자체가 없다**(`null`이 아니다). 심박계·파워미터가
> 없는 유저의 활동이 «데이터 없음 = 카운트 안 함»으로 자연히 동작하게 하기 위한 확정 사항이다
> (마스터 20260905_0026). 평가 구현은 `undefined` 하나만 보면 된다.

**이력 패턴** — 신규 독립 평가 블록이 필요하다

| 필드 | 타입 | 단위 | 의미 | 짝 필드 |
|------|------|------|------|---------|
| `rest_after_streak` ✅ | `number` | 일 | 연속 활동 뒤에 쉰 일수 | `streak_days` (**필수**) |
| `rest_after_long` ✅ | `number` | 일 | 장거리 활동 뒤에 쉰 일수 | `single_distance_km` (**필수**) |
| `return_gap_days` ✅ | `number` | 일 | 복귀 직전에 쉰 일수 | — |
| `interval_days` ✅ | `number` | 일 | 활동과 활동 사이 간격 | — |
| `daily_once_count` | `number` | 일 | 하루에 1회만 활동한 날의 수 | — |
| `negative_split` | `boolean` | — | 후반 구간이 전반보다 빠른 활동으로 한정하는 **필터**. Strava `splits_metric`이 필요한데 Summary 응답엔 없다 — **티켓 20260905_0029에서 v5 1차 범위 밖으로 확정**됐다(활동 1건당 상세 호출 1회 × 백필 697회). `evaluation: 'pending'` 그대로이고 별도 티켓으로 분리됐다 | `total_count` |
| `weekly_streak` ✅ (2026-09-06, 티켓 20260906_0110 ②) | `number` | 주 | 연속한 주(월~일)의 수. 단독으로 쓰면 `calcMaxWeeklyStreak`가 최장 길이를 계산, `repeat_count`와 결합하면 그 길이 이상인 «주 스트릭»이 몇 번 끊겼다 다시 만들어졌는지를 센다 | — |
| `distinct_time_bands` ✅ (2026-09-08, 티켓 20260908_1318) | `number` | 개 | 서로 다른 시간대의 수. 시간대 6구간은 `timeBands.ts`가 단일 출처다 — 새벽 5~7, 오전 7~11, 점심 11~14, 오후 14~18, 저녁 18~22, 밤 22~5시(시작 포함·끝 미포함, KST). 조건 문구(`badgeConditionText.ts`)와 드랍 엔진(`drop-engine/context.ts`)도 같은 상수를 읽는다. `streak_days`와 결합하면 그 스트릭 창 **안에서만** 시간대 수를 센다(`repeatOccurrences.ts`) | — |
| `day_of_month` ✅ (2026-09-08, 티켓 20260908_1318) | `number` (1–31) | — | 매달 지정일 **필터**. `day_of_week`와 같은 성격 — `filtered`를 좁히고 걷기 하루 1회 상한도 동일 적용 | `total_count` |
| `activities_within_hours` ✅ (2026-09-08, 티켓 20260908_1318) | `{ hours: number; count: number }` | 회 | 지정한 시간 창 안에 활동이 `count`회 이상. `startDate` 기준 슬라이딩 윈도우로 판정(`maxActivitiesWithinHours`), 걷기 하루 1회 상한은 **의도적으로 적용하지 않음**(하루 여러 번이 핵심 의도). `repeat_count`와 결합하면 창을 채울 때마다 리셋하는 전용 회차 계산(`repeatOccurrences.ts`) | — |
| `personal_record_break` ✅ (2026-09-06, 티켓 20260906_2055) | `number` | 회 | 개인 기록 갱신 횟수. **가입 이후 활동만으로 직접 계산한다** — Strava `pr_count`는 계정 전체 이력 기준이라 v5의 «가입 시점 카운트»와 충돌해 쓰지 않는다. 판정은 `activityFilters.ts`의 `countPersonalRecordBreaks()` — 지표 값이 그때까지의 최고 기록을 엄격히 초과할 때마다 1회(최초 활동은 항상 1회) | `personal_record_break_metric` (**필수**) |
| `personal_record_break_metric` ✅ (2026-09-06, 티켓 20260906_2055 · 2026-09-08, 티켓 20260908_1438에서 페이스 지표 추가) | `string` (select) | — | 어느 지표의 개인 기록인지 지정하는 **필터**(role: filter). `personal_record_break`만으로는 자동 상승형 계열끼리(예: `walking:B1`↔`B2`) 조건 값이 글자 그대로 같아져 구분이 안 되는 문제를 스키마 차원에서 막는다. **콘텐츠가 채워진 지표는 4종**(`single_distance_km`·`duration_minutes`·`max_elevation_m`·`max_pace_sec_per_km`, `activityFilters.ts`의 `SUPPORTED_PERSONAL_RECORD_METRICS`) — `PersonalRecordMetric` 타입엔 그 밖에도 더 있지만 값이 없는 나머지는 평가 시점에 「개인 기록 지표 평가 미구현」으로 막힌다. **지표마다 갱신 방향이 다르다**(`PERSONAL_RECORD_METRIC_DIRECTION`) — 앞 3종은 `higher`(값이 클수록 갱신), `max_pace_sec_per_km`(페이스)는 `lower`(값이 작을수록=빠를수록 갱신)다 | `personal_record_break` |
| `month_over_month_ratio` ✅ (2026-09-08, 티켓 20260908_1318) | `number` | 배 | 전월 대비 비율. 지표를 **거리(km)로 고정**해 판정(지표 선택 짝 필드가 레지스트리에 없음) — 전월 실적 0(분모 0)·비교할 이전 활동 없음(최초 활동)은 판정에서 제외(자동 통과 아님) | — |
| `vs_personal_average` ✅ (2026-09-08, 티켓 20260908_1318) | `number` | 배 | 평소 평균 대비 비율. 지표를 **거리(km)로 고정**해 판정. 분모 0·이력 부족 시 판정 제외는 `month_over_month_ratio`와 동일 | — |

✅ = 평가 구현됨(휴식 4종은 §2.13, 스칼라 7종·`weekly_streak`는 `CONDITION_ACTIVITY_FIELD`·
`calcMaxWeeklyStreak`, `personal_record_break`는 `countPersonalRecordBreaks`, 잔여 5종은
`activityFilters.ts` 신규 헬퍼 — 판정 상세는 BADGE_ENGINE_UNIFIED.md §2.3). **v5 신규 20종 중
18종**(휴식 4종 + 스칼라 7종 + `weekly_streak` + `personal_record_break` + 잔여 5종
`distinct_time_bands`·`day_of_month`·`activities_within_hours`·`month_over_month_ratio`·
`vs_personal_average`)이 `engine`이고, 나머지 **2종**(`daily_once_count`·`negative_split`)만
`pending`이다.

⚠️ **`engine`이라고 곧바로 발급되는 것은 아니다** — `month_over_month_ratio`/
`vs_personal_average`를 `personal_record_break`와 함께 쓰는 4계열(`walking:B3/B4`·
`running:R3`·`cycling:R2`, 32종)은 짝 필드 `personal_record_break_metric`이 콘텐츠에 비어
있어 `PAIR_ENFORCED_CONDITION_KEYS` 강제로 여전히 unpaired 상태다. 상세는
BADGE_ENGINE_UNIFIED.md §2.3-0 참조.

`personal_record_break_metric`은 이 20종과 별개로 2026-09-06에 추가된 21번째 필드이며
`personal_record_break`와 같은 날 `engine`으로 전환됐다. 분류상 `negative_split`·
`day_of_month`·`personal_record_break_metric`만 «필터 전용»이고 나머지는 «수치 검사» 필드다
(계열 정합성 트리거의 `measurable_keys`는 `personal_record_break_metric`을 제외한 수치 검사
필드만 포함한다 — 마이그레이션 140).

### 2.11 `repeat_count` — 반복 획득 (2026-09-05, 티켓 20260905_0030 B1) ✅ **평가 구현됨**

| 필드 | 타입 | 단위 | 평가 방식 |
|------|------|------|-----------|
| `repeat_count` | `number` (≥1) | 회 | **기준 조건을 통째로 만족한 활동**이 조건값 이상이면 통과 |

`total_count`와 다르다. 이 구분이 필드를 하나 더 만든 이유다.

| 조건 | 뜻 |
|---|---|
| `{ duration_minutes: 60, total_count: 5 }` | 「60분 이상 활동이 **1건 있고**, 활동이 총 5회」 (수치 필드는 이력 전반에서 독립 평가되므로) |
| `{ duration_minutes: 60, repeat_count: 5 }` | 「60분 이상 활동이 **5건**」 |

**회차의 정의** — `collectRepeatOccurrences()`(`src/lib/badge-engine/repeatOccurrences.ts`) 한 곳에만 있다.
조건 평가와 카운터 증가가 **같은 함수를 공유해야** 「발급은 됐는데 카운터는 안 오른다」가 생기지 않는다.

1. `activity_type` 필터 + 걷기 축1 게이트
2. `day_of_week` 단일값 필터
3. 활동 1건이 `PER_ACTIVITY_KEYS`(`duration_minutes`·`min_speed_kmh`·`max_pace_sec_per_km`·
   `temperature_min_c`·`temperature_max_c`·`weekend_duration_hours` + v5 스칼라 7종
   `max_elevation_m`·`max_speed_kmh`·`single_distance_km`·`single_elevation_m`·
   `avg_heartrate_bpm`·`avg_watts`·`avg_cadence`, 2026-09-06 티켓 20260906_0110 ②에 추가)를
   **전부** 만족. `same_activity: true`면 `distance_km`·`elevation_gain_m`도 합류하고,
   `time_range`는 `weekly_count`가 없을 때 합류한다
4. **기간 단위 회차** (2026-09-06 신규, 티켓 20260906_0110 ②): `streak_days`·`weekly_count`·
   `monthly_count`·`weekly_streak` 중 하나가 `repeat_count`와 결합하면 위의 «활동 1건 단위»
   경로 대신 **기간이 임계값을 채운 횟수**를 센다 — 예를 들어 `{ weekly_count: 3, repeat_count: 5 }`는
   「주 3회를 채운 주가 5번(연속 아니어도 됨)」, `{ streak_days: 7, repeat_count: 3 }`은
   「7일 연속 스트릭이 3번 만들어짐(끊겼다 다시 생겨도 셈)」을 뜻한다. 판정은
   `repeatOccurrences.ts`의 `isPeriodDrivenRepeatCondition()`/`detectPeriodOccurrenceDriver()`/
   `collectPeriodStreakOccurrences()` 한 곳. `total_count`로 치환하지 않는다 —
   「기준 조건을 무시한 전체 활동 수」가 세어져 조용히 후하게 발급되기 때문이다(위 6~13종과 같은 이유)
5. 걷기는 하루 1회 상한(`dedupeOnePerDay`) 적용 — 걷기 배지 v4 정책과 같다

⚠️ **회차 술어가 읽는 키만 회차와 함께 쓸 수 있다**(fail-closed, 티켓 20261021_1426로 저장 경고 추가). 위 1~3의
키(`repeat_count`·`activity_type`·`day_of_week`·`same_activity`·`time_range`·`PER_ACTIVITY_KEYS`·`distance_km`·
`elevation_gain_m`)와 게이트 키(`prerequisite_badge_names`·교차 게이트 3종) 밖의 키가 조건에 있으면(예:
`{ season: 'winter', duration_minutes: 60, repeat_count: 5 }`의 `season`, `total_count`) 회차를 **0으로 처리**한다 —
모르는 키를 건너뛴 채 세면 회차가 실제보다 많이 잡히기 때문이다. 이 키 목록은 `unconsumedRepeatConditionKeys()`
(`repeatOccurrences.ts`) 한 곳이고, 위 4의 기간 단위 회차와 §2.13의 휴식 회차는 이 판정보다 먼저 전용 계산으로
간다. 이런 조건은 **저장은 되지만 발급되지 않는다.** 어드민 저장 가드 `findConditionShapeSaveWarning()`
(`badge-condition-guards.ts`)이 같은 함수로 가려내 저장을 막지 않고 응답의 `warning`과 조건 폼의 경고로 알린다.
엔진이 회차를 세기 전에 다른 사유로 끝내는 조건(알 수 없는 필드·평가 대기·짝 없는 필드·`mission_reward`·`poi_id`·
형태가 틀린 `repeat_count`), 저장 자체가 막히는 조합, 활동 엔진이 평가하지 않는 배지(활동 배지가 아니거나 JAM!
카테고리)에는 경고하지 않는다.

**배지 종류 판정** — `rarity`가 있고 `repeat_count`가 있으면 **반복형**이다(세 번째 종류).
`rarity IS NULL`이면 레벨형이 우선한다. 판정은 `badgeKind.ts`의 `badgeKindOf()` 한 곳.

⚠️ **휴식 4종(§2.13)은 `repeat_count`와 휴식 키 1개까지만 조합 가능하다**(2026-09-06,
티켓 20260906_2056) — 전용 술어(`isRestDrivenRepeatCondition`)가 "휴식 조건을 만족한 복귀
사건"만 센다. 휴식 키가 2개 이상이면 사건 경계가 정의되지 않아 여전히 막는다. 그 외 남은 `pending` 필드
(`daily_once_count`·`negative_split`)는 여전히 fail-closed가 통째로 막는다(§4).
`personal_record_break`는 2026-09-06(티켓 20260906_2055)부터, `distinct_time_bands`·
`day_of_month`·`activities_within_hours`·`month_over_month_ratio`·`vs_personal_average`는
2026-09-08(티켓 20260908_1318)부터 `engine`이다 — §2.10 참조.

### 2.12 2단 교차 게이트 3종 (2026-09-05, 티켓 20260905_0030 B2) ✅ **평가 구현됨**

| 필드 | 타입 | 평가 방식 |
|------|------|-----------|
| `cross_in_axis` | `BadgeGateRequirement` | **축 내 교차** — 같은 축의 다른 계열을 먼저 경험했는가 |
| `cross_between_axis` | `BadgeGateRequirement` | **축 간 교차** — 보완 축의 계열을 일정 등급 이상 보유했는가 |
| `gate_mission_badge` | `BadgeGateRequirement` | **미션 보상 배지** — 해당 계열의 미션 보상 배지를 보유했는가 |

```ts
interface BadgeGateRequirement {
  family_keys: string[]        // 대상 계열(badges.family_key). 기본 결합 OR
  min_rarity?: BadgeRarity     // 생략 시 「그 계열 보유」. 무한레벨형 계열엔 지정하지 않는다
  min_count?: number           // 생략 시 1. 2 이상이면 그만큼의 계열을 AND로 요구
}
```

**결합 규칙** — 교차 요구 둘은 **서로 OR**, 미션 게이트는 **AND**다.

| 관문 | 선언 | 뜻 |
|---|---|---|
| Rare → Epic | `cross_in_axis` + `cross_between_axis` | 둘 중 하나만 충족해도 통과 |
| Rare → Epic (축 내 교차 미성립 축) | `cross_between_axis`만 | 그 하나가 필수 요건 |
| Epic → Mystic | `cross_between_axis` + `gate_mission_badge` | 둘 다 충족해야 통과 |

**대상은 이름이 아니라 계열(`family_key`)이다** — `prerequisite_badge_names`의 이름 모호성
(§2.8)을 구조적으로 피한다.

**엔진이 fail-closed로 막는 형태** (통과가 아니라 차단이다):

| 형태 | 사유 |
|---|---|
| `family_keys` 누락·빈 배열·문자열 아닌 원소 | 「교차 게이트 설정 오류」 |
| 교차 대상이 **자기 계열뿐** | 같은 활동으로 동시 달성돼 게이트가 자동 통과된다 |
| `min_rarity` 값이 등급 4종이 아님 / `min_count`가 정수 1 이상이 아님 | 형태 오류 |
| `min_count`가 대상 계열 수보다 큼 | 영원히 달성 불가 — 카탈로그 오류 |

**교차로 인정하지 않는 보유**:
- 종목이 다른 계열 (「축은 같은 종목 안에서만 공유한다 — 교차도 미션도 종목 경계를 넘지 않는다」)
- `min_rarity`가 지정됐는데 등급이 없는 배지(무한레벨형) — 등급 서열에 속하지 않는다
- `gate_mission_badge`가 가리킨 계열의 보유 배지가 미션 보상 배지가 아닌 경우

⚠️ `cross_in_axis`와 `cross_between_axis`의 **판정 규칙은 완전히 같다.** `badges`에 축 컬럼이
없어 엔진은 축 소속을 검증할 수 없다 — 차이는 선언 의도와 미발급 사유 문자열뿐이고,
「어떤 계열이 같은 축인가」·「대상 계열의 조건이 겹치지 않는가」는 카탈로그가 보장한다.

⚠️ DB CHECK 제약(마이그레이션 133)은 **키 이름만** 검사한다. 값 스키마 검증은 엔진의
`crossGate.ts`에만 있다.

---

### 2.13 휴식 4종 — 활동이 «없는» 기간 (2026-09-05, 티켓 20260905_0030 B3) ✅ **평가 구현됨**

| 필드 | 판정 방식 |
|------|-----------|
| `rest_after_streak` | **연속 `streak_days`일 활동 직후**의 쉰 일수 ≥ 조건값 |
| `rest_after_long` | **`single_distance_km` 또는 `duration_minutes` 이상 활동일 직후**의 쉰 일수 ≥ 조건값(짝 필드는 OR, 2026-09-06 티켓 20260906_0110 ④에서 `duration_minutes` 추가) |
| `return_gap_days` | 인접 두 활동 사이의 **쉰 일수** ≥ 조건값 (「겨울잠」) |
| `interval_days` | 인접 두 활동의 **날짜 차이** ≥ 조건값 |

- **쉰 일수 = 날짜 차이 − 1.** 1일·3일에 활동했으면 쉰 일수 1일, 날짜 차이 2일이다
- 판정은 `activityFilters.ts`의 `evaluateRestConditions()` 한 곳. 상세 규칙과 안전장치는
  BADGE_ENGINE_UNIFIED.md §2.16

**세 가지 제약**이 다른 필드와 다르다:

1. **짝 필드가 강제된다** — `rest_after_streak`엔 `streak_days`, `rest_after_long`엔
   `single_distance_km` **또는** `duration_minutes` 중 하나가 없으면 fail-closed가
   「짝 필드 없음」으로 막는다(§4)
2. **순수 공백 두 종(`return_gap_days`·`interval_days`)의 90일 하한은 카탈로그 설계
   지침일 뿐 엔진이 강제하지 않는다** — 초안은 엔진에서 90일 미만을 막았으나 조건 필드
   메타(`min: 1`)와 다른 말을 하게 되고 오설정 1건이 로그 폭주가 되어 철회했다(2026-09-05
   스펙 소유자 확정). 하한 준수는 카탈로그 시딩 담당(티켓 20260905_0035)의 몫이다
3. **`repeat_count`와는 휴식 키 1개까지만 조합 가능하다**(2026-09-06, 티켓 20260906_2056) —
   2개 이상이면 여전히 「회차와 함께 쓸 수 없는 조건」으로 막힌다

`rest_after_long`은 짝 필드 중 하나(`single_distance_km` 또는 `duration_minutes`)만 있으면
되고, v5 스칼라 7종이 `engine`으로 뒤집히면서(2026-09-06, 티켓 20260906_0110 ②) `single_distance_km`
짝도 fail-closed에 막히지 않는다 — **이제 실제로 발급된다.**

---

## 3. 메타데이터 필드 (발급 판정에 관여하지 않음)

아래 필드는 §2의 조건 필드와 성격이 다르다 — badge-engine의 수치 검사 로직에 전혀 관여하지
않고, 표시·안내 목적으로만 쓰인다. `src/lib/badge-engine/condition-schema.ts`의
`CONDITION_META_KEYS`로 분류된다.

| 필드 | 타입 | 설명 | 평가 방식 |
|------|------|------|-----------|
| `mission_reward` | `boolean` | 미션 완료(`grantMissionRewards`)로만 지급되는 배지 표시용 플래그 | badge-engine 내 **항상 fail**(사유: "미션 보상 배지 — 미션 완료로만 지급") + 발급 후보 조회 단계에서 아예 제외. 배지 상세화면이 이 플래그로 "미션 보상 배지" 안내를 표시. 온보딩 완료 배지(마이그레이션 196이 '퀘스트 클리어'로 넣었고, 마이그레이션 256이 이름을 「JAM!」으로 바꾼다. 적용은 6-2 2회와 함께, 티켓 20261021_1248)도 이 플래그를 쓴다 — 지급 경로는 온보딩 완료 판정이다(티켓 20260927_2130 T7b) |
| `follower_count` | `number` | [JAM! 카테고리] 팔로워 수 ≥ 조건값 | badge-engine 내 **항상 fail**(measurable 필드가 없어 "평가 가능한 조건 없음") — `src/lib/badge-engine/usageBadges.ts`의 `evaluateUsageBadges()`가 `POST /api/follows` 성공 직후 별도 판정·발급 |
| `following_count` | `number` | [JAM! 카테고리] 팔로잉 수 ≥ 조건값 | 위와 동일 — `evaluateUsageBadges()`가 `POST /api/follows` 성공 직후 판정 |
| `daily_sync_count` | `number` | [JAM! 카테고리] 그날(KST) 누적 동기화 성공 횟수 ≥ 조건값 | 위와 동일 — `evaluateUsageBadges()`가 `syncStravaActivities()`에서 `synced > 0`일 때만 판정(카운터는 `user_daily_sync_counts` + `increment_daily_sync_count()` RPC) |
| `daily_sync_streak_days` | `number` | [JAM! 카테고리] 오늘 기준 «현재» 연속 동기화 일수 ≥ 조건값. **역대 최장이 아니다** — 하루라도 거르면 0으로 리셋된다 | 위와 동일 — `evaluateUsageBadges()`가 `daily_sync_count`와 같은 시점(`increment_daily_sync_count()` RPC 직후)에 `dailySyncStreak.ts`의 `fetchCurrentSyncStreakDays()`로 계산해 판정 |
| `checkin_category_count` | `{ category: string; count: number }` | [JAM! 카테고리] 지정된 체크인 카테고리(effective category — `badges.category` 우선, 없으면 연결된 `poi.category` 폴백) 내에서 유저가 보유한(distinct) 체크인 배지 개수 ≥ `count` | badge-engine 내 **항상 fail** — `usageBadges.ts`의 `evaluateCheckinUsageBadges()`가 체크인 배지(`user_checkin_badge_earns`) insert 성공 직후 별도 판정·발급. 후보 배지마다 카테고리가 달라 팔로워 수 등 4종처럼 "호출부가 미리 계산한 값 하나"로 판정할 수 없다 |
| `checkin_badge_count` | `{ checkin_badge_names: string[]; count: number }` | [JAM! 카테고리] 지정한 체크인 배지 이름(CSV로 입력, `type='checkin'`으로 한정 해석) 목록 중 유저가 보유한 이름 개수 ≥ `count` | 위와 동일 — 저장 시점에 `findCheckinBadgeNamesNotFoundError`가 목록의 모든 이름이 실제 `type='checkin'` 배지 이름인지 검증한다(존재하지 않는 이름은 저장 자체를 거부). 평가 시점에도 카탈로그에 없는 이름은 무시하고 나머지로 판정하는 안전망이 있다 |
| `combine_attempt_count` | `number`(정수 ≥1) | [JAM! 카테고리] 믹스 시도 횟수 ≥ 조건값. **성공 기록 수 + `no_recipe_match` 실패 수**(재료가 소각된 시도만 센다 — `invalid_count`·`items_not_found`·`recipe_not_found`처럼 소각 전에 끝난 실패는 제외) | badge-engine 내 **항상 fail** — `src/lib/badge-engine/jamActionBadges.ts`의 `evaluateJamActionBadges()`가 `POST /api/combine` 결과 직후 별도 판정·발급. 성공 기록은 마이그레이션 200 이후부터 쌓인다 |
| `combine_success_count` | `number`(정수 ≥1) | [JAM! 카테고리] 믹스 성공 횟수 ≥ 조건값. `user_combine_success_logs` 행 수(보상이 전부 비어 재료만 소각된 빈손 성공도 1건) | 위와 동일 |
| `combine_fail_count` | `number`(정수 ≥1) | [JAM! 카테고리] 믹스 실패 횟수 ≥ 조건값. `user_combine_fail_logs` 중 `fail_reason='no_recipe_match'` 수 | 위와 동일. 실패 로그는 2026-09-10(마이그레이션 153)부터 있어 그 이전 실패는 세지 않는다 |
| `recipe_first_success` | `{ recipe_id: string }` | [JAM! 카테고리] 지정한 믹스 레시피를 **전체 유저 중 가장 먼저 성공한 1명**에게만 발급. `user_combine_success_logs`에서 그 레시피의 `is_recipe_first = true` 행이 내 것인지로 판정한다(상태 기반) | 위와 동일 — 저장 시점에 `findRecipeFirstSuccessNotFoundError`가 `recipe_id`의 UUID 형식과 `combination_recipes` 존재를 검증한다(없는 레시피는 저장 자체를 거부). 배지를 붙이기 전에 이미 성공한 사람이 있는 레시피에는 쓰지 않는 것을 운영 규칙으로만 다룬다 |
| `drop_item_count` | `number`(정수 ≥1) | [JAM! 카테고리] 드랍한 아이템 수 ≥ 조건값. 내가 놓은 **서로 다른 아이템 개체** 수(같은 개체를 몇 번 놓아도 1). 원천은 `poi_drops`(`dropper_user_id`), `inventory_item_id`가 없는 2026-08-29 이전 행은 세지 않는다 | badge-engine 내 **항상 fail** — `src/lib/badge-engine/jamActionBadges.ts`의 `evaluateJamActionBadges()`가 `POST /api/drops` 성공 뒤 `after()`로 별도 판정·발급 |
| `pickup_item_count` | `number`(정수 ≥1) | [JAM! 카테고리] 픽업한 아이템 수 ≥ 조건값. 내가 주운 서로 다른 개체 수 — **내가 드랍한 것은 뺀다**. 시스템 드랍·놓은 사람이 탈퇴한 드랍은 포함한다 | 위와 동일 — `POST /api/drops/[dropId]/pickup` 성공 뒤 `after()`로 줍는 사람을 판정 |
| `pickup_from_user_count` | `number`(정수 ≥1) | [JAM! 카테고리] 내가 픽업한 드랍을 놓은 **서로 다른 유저** 수 ≥ 조건값(함께 줍기). 자기·시스템·탈퇴 유저는 뺀다 | 위와 동일 — 줍는 사람 판정 |
| `picked_up_by_user_count` | `number`(정수 ≥1) | [JAM! 카테고리] 내가 드랍한 아이템을 픽업한 **서로 다른 유저** 수 ≥ 조건값(나눔가). 자기·탈퇴 유저(`picked_up_by` NULL)는 뺀다 | 위와 동일 — 같은 픽업 성공 뒤 **놓은 사람**을 판정해 발급·알림한다 |
| `mission_complete_count` | `number`(정수 ≥1) | [JAM! 카테고리] 완료한 미션 수 ≥ 조건값. 내가 완료한 **서로 다른 미션** 수(`user_mission_completions` 행 수, `UNIQUE(user_id, mission_id)`). 전체 기록이라 가입 이전 완료도 센다 | badge-engine 내 **항상 fail** — `jamActionBadges.ts`의 `evaluateJamActionBadges()`가 새 활동이 있는 동기화가 끝날 때(`sync.ts`) 판정 |
| `collection_complete_count` | `number`(정수 ≥1) | [JAM! 카테고리] 완성한 컬렉션 수 ≥ 조건값. 내가 완성한 **서로 다른 컬렉션** 수(옛 완성 표 `user_item_book_completions`와 등급 완성 표 `user_item_book_tier_completions`의 컬렉션 id를 합쳐 센다. 등급 하나라도 완성하면 센다, 컬렉션당 최대 1). 전체 기록이며 장착 해제·교체는 완성 기록을 지우지 않는다 | 위와 동일 — 동기화 끝과 컬렉션 장착 `POST /api/itembooks/[id]/slot` 성공 뒤 `after()`에서 판정 |
| `days_since_signup` | `number`(정수 1~3650) | [JAM! 카테고리] 가입 경과일 ≥ 조건값. 가입한 날(KST)부터 오늘(KST)까지의 **날짜 차**(가입한 날이 0) | 위와 동일 — 동기화 끝에서 판정. 새 활동이 없는 동기화에서도 판정한다 |
| `signup_recent_active_days` | `number`(정수 1~30) | [JAM! 카테고리] `days_since_signup`의 **보조 키**(선택). 오늘(KST)을 포함한 최근 30일 가운데 활동한 날 수 ≥ 조건값. 있으면 가입 일수와 이 조건을 둘 다 채워야 발급한다 | 지표가 아니라 `days_since_signup` 배지를 거르는 조건이다 — 단독으로 저장할 수 없다(짝 필드 `days_since_signup`) |
| `weekly_active_days` | `number`(정수 1~7) | [JAM! 카테고리] 주간 활동일 ≥ 조건값. 월~일(KST) 한 주 안의 활동한 날 수의 **역대 최고 주** 값. 가입한 날부터 센다 | 위와 동일 — 동기화 끝에서 판정 |
| `same_spot_checkin_days` | `number`(정수 ≥1) | [JAM! 카테고리] 같은 지점 체크인 일수 ≥ 조건값. 지점(`poi_id`)별 체크인한 서로 다른 날(KST) 수의 **최댓값**(합이 아니다). 가입한 날부터 센다 | 위와 동일 — 동기화 끝에서 판정 |
| `capsule_open_count` | `number`(정수 ≥1) | [JAM! 카테고리] 캡슐을 연 횟수 ≥ 조건값. `capsule_opens` 행 수(열 때마다 한 줄) | badge-engine 내 **항상 fail** — `jamActionBadges.ts`의 `evaluateJamActionBadges()`가 `POST /api/capsule/open` 성공 뒤 `after()`로 판정(티켓 20261018_1815) |
| `locked_item_open_count` | `number`(정수 ≥1) | [JAM! 카테고리] 잠긴 아이템 배지를 연 횟수 ≥ 조건값. 개체 이력 `inventory_item_events`의 `unlocked` 행 수. 한 번 연 개체는 다시 잠기지 않는다 | 위와 동일 — `POST /api/inventory/items/[itemId]/open` 성공 뒤 `after()`에서 판정 |
| `locked_item_pickup_count` | `number`(정수 ≥1) | [JAM! 카테고리] 픽업 **당시 잠겨 있던 서로 다른 개체** 수 ≥ 조건값. 자기 드랍은 세지 않고 같은 개체는 몇 번 주워도 1이다. 픽업 당시 잠김은 개체의 현재 잠김과 `unlocked_at`·픽업 시각(`poi_drops.picked_up_at`)으로 가린다 | 위와 동일 — `POST /api/drops/[dropId]/pickup` 성공 뒤 줍는 사람을 판정 |
| `other_tribe_item_kinds_count` | `number`(정수 ≥1) | [JAM! 카테고리] 지금 가진 개체(`inventory_id`가 내 인벤토리, `destroyed_at` 없음) 가운데 내 소속(`users.tribe_id`)과 다른 트라이브 배지의 **서로 다른 종류**(`badge_id`) 수 ≥ 조건값. 잠긴 개체도 센다. 내 소속이나 배지의 트라이브가 없으면 세지 않는다 | 위와 동일 — 캡슐 열기·픽업·믹스 성공 뒤 판정 |
| `cross_tribe_combine_success_count` | `number`(정수 ≥1) | [JAM! 카테고리] 믹스 성공 기록(`user_combine_success_logs`) 중 재료(`ingredient_badge_ids`)가 `badges.tribe_id` 기준 **2개 이상 트라이브**에 걸친 행 수 ≥ 조건값. 트라이브가 없는 재료는 트라이브로 세지 않는다 | 위와 동일 — `POST /api/combine` 성공 뒤 판정 |
| `jam_total_earned` | `number`(정수 ≥1) | [JAM! 카테고리] 지금까지 **모은** 잼 ≥ 조건값. `jam_wallets.total_earned`(가진 양 `balance`이 아니라 쓴 잼이 줄이지 않는다). 지갑이 없으면 0 | 위와 동일 — 잼 정산이 있는 동기화 끝(`JAM_SYNC_TRIGGERS`)에서 판정 |
| `jam_weekly_earned` | `number`(정수 ≥1) | [JAM! 카테고리] 월~일(KST) 한 주에 모은 잼의 **역대 최고 주** 값 ≥ 조건값. `jam_daily_earned`(활동한 날(KST)별 모은 양)를 주별로 합산한다 | 위와 동일 — 동기화 끝에서 판정 |
| `chapter_reached` | `number`(정수 ≥1) | [JAM! 카테고리] 도달한 챕터 번호 ≥ 조건값. `user_chapters.chapter_no`(행이 없거나 퀘스트 전 NULL이면 0) | 위와 동일 + 챕터 오름 직후 — 챕터가 오르면 오름 처리(`lib/chapter/rise.ts`, 티켓 20261019_1316)가 이 지표만 바로 판정한다. 점수 호출(`chapter_add_score`, 티켓 20261019_1315)과 챕터 1 시작(`chapter_start`, 퀘스트 완료 처리가 부름)이 오름 처리를 부르고, 동기화 안의 잼 정산에서 난 오름만 동기화 끝 판정이 이어서 읽어 오름 직후 판정을 건너뛴다. 챕터 조건 배지는 «배지 받기» 챕터 점수에서 뺀다 |
| `active_week_streak` | `number`(정수 ≥1) | [JAM! 카테고리] 한 주(월~일, KST)에 활동한 날이 `active_week_min_days`(없으면 1) 이상인 주가 이어진 **최장 주 수** ≥ 조건값. 활동은 인정된 활동(`filter_reason IS NULL`, 가입한 날 이후, JAM! 종목·걷기 게이트 통과)이고 체크인만 한 날은 세지 않는다 | badge-engine 내 **항상 fail** — `jamActionBadges.ts`의 `evaluateJamActionBadges()`가 동기화 끝(`JAM_SYNC_TRIGGERS`)에서 판정(티켓 20261019_0542) |
| `active_week_min_days` | `number`(정수 1~7) | [JAM! 카테고리] `active_week_streak`의 **보조 키**(선택). «채운 주»로 치는 한 주의 최소 활동일. 없으면 1 | 지표가 아니라 `active_week_streak` 배지의 기준이다 — 단독으로 저장할 수 없다(짝 필드 `active_week_streak`) |
| `return_streak_weeks` | `number`(정수 ≥1) | [JAM! 카테고리] 7일 이상 쉬었다가(두 활동일 사이에 활동 없는 날 ≥ 7, 코드 상수 `RETURN_REST_DAYS`) 돌아온 뒤, **돌아온 날이 속한 주를 1주로** 바로 다음 주들에 활동이 이어진 연속 주 수의 최댓값 ≥ 조건값. 첫 활동은 복귀가 아니다 | 위와 동일 — 동기화 끝에서 판정 |
| `full_week_count` | `number`(정수 ≥1) | [JAM! 카테고리] 월~일 7일을 모두 활동한 주의 수 ≥ 조건값. 같은 날 여러 활동은 1일이다 | 위와 동일 |
| `full_season_year_count` | `number`(정수 ≥1) | [JAM! 카테고리] 달력 연도(KST) 안에 봄(3~5월)·여름(6~8월)·가을(9~11월)·겨울(12·1·2월)에 모두 활동한 해의 수 ≥ 조건값. 1·2월과 12월은 모두 겨울이라 2025년 12월은 2026년의 겨울을 채우지 않는다 | 위와 동일 |
| `distinct_activity_type_count` | `number`(정수 ≥1) | [JAM! 카테고리] 인정된 활동의 서로 다른 종목 수 ≥ 조건값 | 위와 동일 |
| `new_checkin_badge_count` | `number`(정수 ≥1) | [JAM! 카테고리] 새로 받은 체크인 배지의 서로 다른 종류 수 ≥ 조건값. `user_checkin_badge_earns`의 서로 다른 `badge_id`라 같은 배지를 다시 받아도 1종류다 | badge-engine 내 **항상 fail** — `evaluateJamActionBadges()`가 동기화 끝(`JAM_SYNC_TRIGGERS`)에서 판정(티켓 20261019_0542 2회) |
| `checkin_season_year_count` | `number`(정수 ≥1) | [JAM! 카테고리] 달력 연도(KST) 안에 봄(3~5월)·여름(6~8월)·가을(9~11월)·겨울(12·1·2월) 네 계절 모두에서 **새 체크인 배지**(배지별 처음 받은 줄)를 받은 해의 수 ≥ 조건값. 1·2월과 12월은 모두 겨울이라 2025년 12월은 2026년의 겨울을 채우지 않는다 | 위와 동일 — 동기화 끝에서 판정 |
| `dropped_item_picked_up_count` | `number`(정수 ≥1) | [JAM! 카테고리] 내가 드랍한 **서로 다른 아이템**(`poi_drops.inventory_item_id`) 가운데 다른 유저가 픽업한 수 ≥ 조건값. 같은 아이템이 왕복해도 1이고 내가 주운 것은 뺀다 | 위와 동일 — 다른 유저가 픽업한 직후 놓은 사람에게 판정(`jamTriggersForPickup`) |
| `jam_week_count` | `number`(정수 ≥1) | [JAM! 카테고리] 월~일(KST) 한 주에 모은 잼이 `jam_week_min_earned`(없으면 1) 이상인 주의 수 ≥ 조건값. `jam_daily_earned`를 주별로 합산한다. 연속하지 않아도 된다 | 위와 동일 — 동기화 끝에서 판정 |
| `jam_week_streak` | `number`(정수 ≥1) | [JAM! 카테고리] 한 주에 `jam_week_min_earned` 이상 잼을 모은 주가 이어진 **최장 주 수** ≥ 조건값. 잼을 못 모은 주가 끼면 끊긴다 | 위와 동일 |
| `jam_week_min_earned` | `number`(정수 ≥1) | [JAM! 카테고리] `jam_week_count`·`jam_week_streak`의 **보조 키**(선택). «채운 주»로 치는 한 주의 최소 모은 잼. 없으면 1 | 지표가 아니라 두 배지의 기준이다 — 단독으로 저장할 수 없다(짝 필드 `jam_week_count` 또는 `jam_week_streak`) |

> ⚠️ 배경(티켓 20260825_028): 마이그레이션 `084_badge_condition_cleanup.sql`이 배지 상세화면
> 표시용으로 미션보상배지 15종에 `{"mission_reward": true}`를 넣었는데, 당시 badge-engine은
> "알려진 조건 필드 없음 → 검사 스킵 → pass:true"로 처리해 미션 완료 없이 미션보상배지가
> 발급되고 레벨업 게이팅이 12일간 무력화됐다. 지금은 `mission_reward`가 §2의 조건 필드와
> 명시적으로 분리돼 있고, 이 필드만 있는 조건은 위 방어 분기로 항상 fail 처리된다. 어드민
> `BadgeForm.tsx`도 이 필드를 조건 필드와 시각적으로 구분된 체크박스로 노출한다(티켓 20260825_031).

> **JAM! 카테고리 — 서비스 사용량 지표 3종** (2026-09-10, 티켓 20260910_1557) **+ 연속 동기화
> 일수 1종** (2026-09-11, 티켓 20260911_2304): `mission_reward`와 같은 자리(`role: 'meta'` +
> `evaluation: 'external'`)이지만 성격은 조금 다르다 — `mission_reward`는 그 자체로 pass/fail을
> 만들지 않는 순수 플래그인 반면, 이 4종은 **실제로 수치 임계값이 발급 여부를 결정한다**. 다만
> 그 판정이 badge-engine(`evaluateConditionDetailed`, Strava 활동 이력 기반) 밖에서 일어나므로
> §2가 아니라 여기 분류된다 — `MEASURABLE_CONDITION_KEYS`에 없어 `evaluateConditionDetailed`는
> 이 필드들이 있으면 (다른 measurable 필드가 없는 한) 항상 fail 처리하고, `role: 'meta'`라
> 진행률(`badgeProgress.ts`)도 그리지 않는다.
>
> `daily_sync_streak_days`는 `daily_sync_count`(하루 누적 횟수)와 판정 기준이 다르다 —
> "오늘까지 하루라도 거르지 않고 이어진 연속"만 보는 진행 중 스트릭이고, 활동배지의
> `streak_days`(Strava 활동 기반 **역대 최장**)와도 다른 별개 지표다. 계산은
> `src/lib/badge-engine/dailySyncStreak.ts`의 `calcCurrentSyncStreakDays()`(순수 함수) +
> `fetchCurrentSyncStreakDays()`(DB 조회)가 전담한다.
>
> `badge_type` enum에는 손대지 않고 `type='activity'` + `activity_types=[]`로 저장하는 것이
> 설계 전제다 — `activity_types[0]`이 없으면 (제거 전) `/badges/tree` 배지 트리 화면에는 노출되지 않았다(이 화면은
> 티켓 20261018_1817에서 제거했다). `/badges` 일반 목록·프로필은 `type==='activity'`만 보므로 정상 노출된다. 발급 규칙(등급형
> 성장 티어·레벨형 연속 발급)은 BADGE_ENGINE_UNIFIED.md §2.2(Step 3-A/3-B)와 같은 정책을
> `usageBadges.ts`가 최소 재구현한다. 섀도우밴 차단은 없앴다(티켓 20261017_1426, 코드는 6-4 2회 티켓 20261021_1250에서 지움).
>
> **체크인 배지 보유 조건 2종** (2026-09-14, 티켓 20260914_1725): `checkin_category_count`·
> `checkin_badge_count`도 같은 자리(`role: 'meta'` + `evaluation: 'external'`)이지만 값이
> **object**다(`activities_within_hours`와 같은 선례) — 카테고리·배지 목록이 배지마다 달라
> "유저당 미리 계산한 숫자 하나"로 판정할 수 없다. `usageBadges.ts`의
> `evaluateCheckinUsageBadges()`가 후보 배지마다 자기 `condition_json`을 참조해 현재값을
> 계산한다(카테고리 지표 = `user_checkin_badge_earns` × effective category distinct count,
> 목록 지표 = 지정 이름 중 보유한 이름 개수). `sync.ts`의 체크인 배지 insert 성공 직후 호출된다.
>
> **믹스 행동 지표 4종** (2026-10-01, 티켓 20261001_0631): 같은 자리(`role: 'meta'` +
> `evaluation: 'external'`)다. 앞의 셋은 「유저 단위로 한 번 계산한 숫자」를 후보마다 비교하는
> 수치형이고, `recipe_first_success`는 값이 object라 후보마다 자기 레시피를 가리킨다.
> `jamActionBadges.ts`의 `evaluateJamActionBadges()`가 요청한 지표를 가진 후보만 골라 계산하고
> (후보가 없으면 계산하지 않는다), 계산 함수(`jamActionMetrics.ts`)가 DB 오류를 던지면 그
> 지표만 건너뛴다(fail-closed). 발급 정책은 `usageBadges.ts`의 `issueQualifyingBadges()`를
> 공유한다. 이후 행동 지표는 레지스트리 `field()` 1개·`JAM_ACTION_CONDITION_KEYS`와
> `METRIC_COMPUTERS`의 키·계산 함수·CHECK 키 확장 마이그레이션 1개를 더해 이어 붙인다.
>
> **드랍·픽업 행동 지표 4종** (2026-10-01, 티켓 20261001_0632): 위 틀에 키 4개와 계산 함수
> (`jamActionDropMetrics.ts`)만 더한 수치형이다(CHECK 키 확장은 마이그레이션 201). 4개 모두
> **행 수가 아니라 서로 다른 개체·유저 수**로 센다 — 두 유저가 같은 아이템을 번갈아 놓고
> 주워도 값이 부풀지 않는다. 자기 드랍을 자기가 주운 것은 드랍 수에는 세고 나머지에는 세지
> 않는다. 시스템 드랍과 놓은 사람이 탈퇴한 드랍은 픽업 수에 세고 「픽업한 드랍의 드랍 유저 수」에는
> 세지 않으며, 줍는 사람이 탈퇴한 행은 「내 드랍을 픽업한 유저 수」에 세지 않는다. 계산이 읽는
> 행이 30,000개를 넘으면 그 지표만 건너뛴다(fail-closed). 세부 규칙과 호출 지점은
> [BADGE_ENGINE_UNIFIED.md](BADGE_ENGINE_UNIFIED.md) ③ JAM! 카테고리의 드랍·픽업 절에 있다.
>
> **미션·컬렉션·가입 경과일·활동일·체크인 일수 지표 6키** (2026-10-01, 티켓 20261001_0633): 같은 틀에
> 키와 계산 모듈(`jamActionCompletionMetrics.ts`·`jamActionDayMetrics.ts`)을 더한 정수형이다(CHECK 키 확장은
> 마이그레이션 203). 「활동한 날」은 하나의 정의를 쓴다 — **가입한 날(KST) 이후, JAM! 종목이 있고 걷기 게이트·차량
> 속도 필터를 통과한 활동의 시작 날짜(KST) ∪ 체크인한 날**(체크인을 만든 활동의 날짜, 날짜가 없는 체크인은 세지
> 않는다). 동기화만 한 날은 세지 않는다. 주 경계는 KST(월~일)다.
>
> `signup_recent_active_days`는 **보조 키**다. `days_since_signup`과 함께 저장해야 하고(짝 필드, 단독 저장은
> 거부), 사용량 지표가 아니라서 아래 §4의 「사용량 지표는 한 배지에 하나」 가드에 걸리지 않는다
> (`USAGE_METRIC_CONDITION_KEYS`에서 뺀다). 예) `{ "days_since_signup": 100, "signup_recent_active_days": 4 }`는
> 「가입 100일 이상 + 최근 30일 중 4일 이상 활동」이다. 세부 규칙·호출 지점·한계(수동 입력 활동을 가를 수 없다)는
> [BADGE_ENGINE_UNIFIED.md](BADGE_ENGINE_UNIFIED.md) ③ JAM! 카테고리의 해당 절에 있다.
>
> **새 JAM 조건 5종과 잼·챕터 3종** (2026-10-18, 티켓 20261018_1815, JAM 2.0 운영 로직 10.2절): 같은 틀에 키 8개와
> 계산 모듈(`jamActionItemMetrics.ts`·`jamActionJamMetrics.ts`)을 더한 정수형이다. 허용 키는 마이그레이션 242가 DB CHECK에
> 넓혔다(72 → 80, 기존 `condition_json`은 바뀌지 않는다). 값의 정의는 위 표와 두 계산 파일의 머리 주석이 단일 원천이다.
> 새 SQL 없이 supabase-js 읽기만 쓴다.
>
> **활동 기반 새 지표 6종** (2026-10-19, 티켓 20261019_0542 1회): 같은 틀에 키 6개(주 키 5개 + 보조 키 `active_week_min_days`)와 계산 모듈
> `jamActionActivityMetrics.ts`를 더한 정수형이다. 허용 키는 마이그레이션 246이 DB CHECK에 넓혔다(80 → 86, 기존 `condition_json`은 바뀌지 않는다).
> 값의 정의는 위 표와 계산 파일의 머리 주석이 단일 원천이다. 새 SQL 없이 supabase-js 읽기만 쓴다.
>
> **체크인·드랍·잼 새 지표 6종** (2026-10-19, 티켓 20261019_0542 2회): 같은 틀에 키 6개(주 키 5개 + 보조 키 `jam_week_min_earned`)와 계산 모듈
> `jamActionCheckinMetrics.ts`를 더한 정수형이다(드랍은 `jamActionDropMetrics.ts`, 잼은 `jamActionJamMetrics.ts`에 계산 함수를 더했다). 허용 키는
> 마이그레이션 247이 DB CHECK에 넓혔다(86 → 92, 기존 `condition_json`은 바뀌지 않는다). 값의 정의는 위 표와 계산 파일의 머리 주석이 단일 원천이다.
> 새 SQL 없이 supabase-js 읽기만 쓴다.

---

## 4. 필드 조합 규칙

- 같은 `condition_json` 내 모든 필드는 **AND** 조건 (모두 충족 시 발급)
- 단일 조건(필드 1개)과 복합 조건(필드 2개+)은 "진행 트랙 중복 제거" 정책이 다르게 적용됨 → BADGE_ENGINE_UNIFIED.md § 2.5 참조
- 복합 조건(필드 2개+)의 기본 평가는 **필드마다 이력 전반에서 독립** — 서로 다른 활동에서 각각
  달성해도 통과한다. `time_range`가 섞인 조합이나 `same_activity: true`가 있는 조합만 예외적으로
  "한 활동 동시 충족"을 요구한다 → BADGE_ENGINE_UNIFIED.md § 2.3-1 참조 (2026-08-31 복원, 티켓 20260831_2100)
- `poi_id`는 다른 조건 필드와 혼합 불가 (엔진 미지원)
- `mission_reward`(§3)는 조건 필드와 함께 있어도 항상 §3의 규칙이 우선한다(무조건 fail)
- **fail-closed** (2026-09-05, 티켓 20260905_0028): 조건에 «엔진이 평가하지 않는 키»가 하나라도
  있으면 나머지 필드를 충족해도 **발급되지 않는다**. 대상은 ① `evaluation: 'pending'`인 잔여
  2종(`daily_once_count`·`negative_split`) + `route`(§2.10) — `personal_record_break`·
  `personal_record_break_metric`은 2026-09-06(티켓 20260906_2055)부터, `distinct_time_bands`·
  `day_of_month`·`activities_within_hours`·`month_over_month_ratio`·`vs_personal_average`는
  2026-09-08(티켓 20260908_1318)부터 `engine`이다(단, 콘텐츠 값이 없는 계열은 §2.10의
  「미지원 지표」 방어·짝 필드 강제로 계속 막힐 수 있음) ② 레지스트리에 아예 없는
  키(오탈자) ③ **짝 필드가 하나도 없는 휴식 4종**(2026-09-05 추가, §2.13 —
  `PAIR_ENFORCED_CONDITION_KEYS`, `rest_after_long`은 `single_distance_km`·`duration_minutes`
  중 하나면 됨). 사유는 「평가할 수 없는 조건 필드 — …」로 남는다. 이 규칙이 없으면
  `matchesPerActivityCondition()`이 모르는 키를 조용히 건너뛰고 마지막에 `return true` 하므로,
  미구현 필드가 «발급 안 됨»이 아니라 **«무조건 발급»**으로 뒤집힌다
- **막힌 조건 3종**(`route`·`daily_once_count`·`negative_split`)은 `pending`을 유지한다(2026-10-18, 티켓
  20261018_1815 3회, 사용자 결정 4). 이번에 풀지 않았고 레지스트리 항목에 «막힘» 주석을 달았다. 풀려면
  활동 상세(스트림) 데이터가 필요해 별도 티켓이다 → BADGE_ENGINE_UNIFIED.md § 2.18
- `repeat_count`(§2.11)는 fail-closed 대상이 **아니다** — 평가가 구현돼 있다. 활동 1건 단위
  축(v5 스칼라 7종 포함)뿐 아니라 「기간 단위 회차」(`streak_days`·`weekly_count`·
  `monthly_count`·`weekly_streak` 결합, 2026-09-06 티켓 20260906_0110 ②)도 셀 수 있다. 다만
  회차 술어로 같이 쓰려는 필드가 여전히 `pending`이면 그 필드 때문에 조건 전체가 막힌다. 회차 술어가 읽지
  않는 키(`season`·`total_count` 등)가 끼면 평가는 시작되지만 회차가 0이라 발급되지 않는다(§2.11) —
  저장 때 응답 `warning`으로 알린다
- 휴식 4종(§2.13)은 **`repeat_count`와 휴식 키 1개까지 조합 가능하다**(2026-09-06, 티켓
  20260906_2056) — 전용 술어가 "휴식 조건을 만족한 복귀 사건"만 센다. 휴식 키 2개 이상은
  사건 경계가 정의되지 않아 여전히 「회차와 함께 쓸 수 없는 조건」으로 막힌다
- **사용량 지표 37종(§3 — `follower_count`·`following_count`·`daily_sync_count`·
  `daily_sync_streak_days`·`checkin_category_count`·`checkin_badge_count`·
  `combine_attempt_count`·`combine_success_count`·`combine_fail_count`·`recipe_first_success`·
  `drop_item_count`·`pickup_item_count`·`pickup_from_user_count`·`picked_up_by_user_count`·
  `mission_complete_count`·`collection_complete_count`·`days_since_signup`·`weekly_active_days`·
  `same_spot_checkin_days`·`capsule_open_count`·`locked_item_open_count`·`locked_item_pickup_count`·
  `other_tribe_item_kinds_count`·`cross_tribe_combine_success_count`·`jam_total_earned`·`jam_weekly_earned`·
  `chapter_reached`·`active_week_streak`·`return_streak_weeks`·`full_week_count`·`full_season_year_count`·
  `distinct_activity_type_count`·`new_checkin_badge_count`·`checkin_season_year_count`·`dropped_item_picked_up_count`·
  `jam_week_count`·`jam_week_streak`. 단일 출처는 `conditionRegistry.ts`의 `USAGE_METRIC_CONDITION_KEYS` —
  메타 키에서 `mission_reward`와 보조 키 `signup_recent_active_days`·`active_week_min_days`·`jam_week_min_earned`를 뺀 목록이라 지표를 더하면 이 규칙이
  자동으로 붙는다. 보조 키는 사용량 지표가 아니다)은 `repeat_count`와
  함께 쓸 수 없다**(2026-09-10, 티켓 20260910_1719; 20260911_2304에서 4번째 키로 확장;
  20260914_1725에서 체크인 배지 보유 2종 추가; 20261001_0631에서 믹스 행동 지표 4종 추가;
  20261001_0632에서 드랍·픽업 행동 지표 4종 추가; 20261001_0633에서 미션·컬렉션·가입 경과일·활동일·체크인 일수
  지표 5종 추가; 20261018_1815에서 새 JAM 조건 5종과 잼·챕터 3종 추가, 마이그레이션 242;
  20261019_0542에서 활동 기반 5종 추가, 마이그레이션 246; 같은 티켓 2회에서 체크인·드랍·잼 5종 추가, 마이그레이션 247) —
  `usageBadges.ts`·`jamActionBadges.ts`의
  발급 경로는 등급형(계열 그룹 내 최상위 tier 1개만, `family_key`가 없으면 이름 그룹)·레벨형(family_key 연속 발급)만
  구현돼 있다. `badgeKindOf()`가 아니라 `isLeveledBadge()`(rarity==null 이진 판정)로만
  갈라 반복형(세 번째 종류)을 구분하지 못하므로, 등급형 경로로 흘러가 회차가 조용히
  무시된다 — 저장 시점에 `findUsageMetricRepeatConflictError`(`badge-condition-guards.ts`)가
  막는다. 같은 함수(`findUsageMetricOtherMeasurableConflictError`)가 이 19종과 다른
  measurable 필드(예: `distance_km`)의 조합도 막는다
- **사용량 지표 19종은 한 배지에 하나만 쓸 수 있다**(2026-10-01, 티켓 20261001_0712; 저장 가드
  `findMultipleUsageMetricsError`, `badge-condition-guards.ts`). 지표마다 따로 판정돼 둘 이상을
  넣으면 AND(모두 충족)가 아니라 먼저 채운 지표 하나로 발급되기 때문이다 — AND 판정은
  구현하지 않고 저장 때 막는다. 보조 키 `signup_recent_active_days`는 지표가 아니라 `days_since_signup`의
  짝이므로 `days_since_signup` + 보조 키 조합은 통과한다(티켓 20261001_0633). 보조 키만 저장하는 것은
  짝 필드 가드(`findUnpairedConditionError`, `PAIR_ENFORCED_CONDITION_KEYS`)가 막는다
- 교차 게이트 3종(§2.12)도 fail-closed 대상이 **아니다** — 다만 값의 형태가 깨지면
  **그 게이트 때문에 발급이 막힌다**(통과가 아니다). 게이트는 조건 평가가 아니라 후보
  선별 단계에서 판정되므로, 수치 조건이 하나도 없는 배지는 여전히 「평가 가능한 조건 없음」이다
- **어드민 양식의 정수 칸은 정수가 아닌 글자를 저장 전에 막는다** (티켓 20261023_1748). 양식이 정수로 읽는 칸(`form.integerFields`,
  월 목록 `month`는 `form.integerListFields`)에 «2.5»·«1e3»·«1,000»처럼 `+`·`-` 부호가 붙을 수 있는 숫자가 아닌 글자를 쓰면 저장하지 않고
  «○○에는 정수만 쓸 수 있어요. 소수나 e가 든 값은 정수로 고쳐 주세요. (입력한 값: 2.5)»로 알린다. 반올림하거나 잘라서 저장하지 않는다.
  읽기 함수(`int()`)는 예전 그대로 «2.5»를 2로, «1e3»을 1로 읽기 때문에, 이 검사는 읽기 전의 입력 글자에 한다. 배지 양식과 미션 양식이
  같은 함수(`findNonIntegerFormInputs`)와 같은 문구를 쓴다. 체크인 배지는 조건 칸이 보이지 않으므로 검사하지 않고, 미션 양식은 그 미션 타입이
  읽지 않는 칸에 남은 글자를 검사하지 않는다. 정수 칸은 숫자 키패드(`inputMode="numeric"`)를 연다. 소수를 받는 칸(거리·속도 등)은 그대로 `decimal`이다.

---

## 5. 예시

```jsonc
// 단순 누적 거리 (걷기 100km)
{ "activity_type": "walking", "distance_km": 100 }

// 복합: 페이스 + 지속 시간 (이력 전반 독립 평가 — 빠른 세션과 긴 세션이 달라도 통과. R7 스피드 엔듀러)
{ "activity_type": "running", "max_pace_sec_per_km": 320, "duration_minutes": 60 }

// 복합: 거리 + 고도 (same_activity:true — 한 활동에서 동시 충족 필요. T1 야생의 첫발 패턴)
{ "activity_type": "trail_running", "distance_km": 15, "elevation_gain_m": 300, "same_activity": true }

// 단독 필드 + same_activity:true — 필드가 하나뿐이어도 "단일 활동 충족"으로 전환 가능. T23 그냥 나갔다 옴 패턴
{ "activity_type": "walking", "distance_km": 0.6, "same_activity": true }

// 야간 활동 (22시~06시 사이 걷기, 주 3회)
{ "activity_type": "walking", "time_range": { "start": "22:00", "end": "06:00" }, "weekly_count": 3 }

// 선행 배지 (Rare 이상 필수)
{ "activity_type": "cycling", "distance_km": 500, "prerequisite_badge_names": ["라이딩 입문자"] }

// 사계절 각각 독립 카운터 (사계절 모두 각 10회 이상 걷기 — T15 "사계절의 발걸음")
{ "activity_type": "walking", "season_count_all": 10 }

// 요일별 독립 카운터 (평일 5일 각각 300회 — W08 "평일의 성실함")
{ "activity_type": "walking", "day_of_week": ["monday", "tuesday", "wednesday", "thursday", "friday"], "total_count": 300 }

// 체크인 배지 (GPS 매칭)
{ "poi_id": "uuid-here" }

// 미션 보상 배지 (메타데이터 필드, §3 — 미션 완료로만 지급, badge-engine은 항상 fail 처리)
{ "mission_reward": true }
```

---

## 6. 미구현·제한 사항

| 항목 | 상태 |
|------|------|
| `route` 필드 | ❌ 미구현 — 타입(`BadgeCondition`)·레지스트리엔 존재하나 badge-engine 평가 로직이 없다 (2026-08-25 조사, 티켓 20260825_034; badge-engine의 `condition.route` 참조 0건을 2026-09-05 재실측). **2026-09-05부터 `evaluation: 'pending'`이라 fail-closed가 막는다** — 조건에 `route`가 있으면 그 배지는 발급되지 않는다. 쓰는 배지가 0건이라 회귀 없이 전환했다. 쓰려면 먼저 평가를 구현하고 `engine`으로 뒤집거나, 스키마에서 제거한다 |
| v5 신규 20종 — 잔여 2종 | ❌ 평가 미구현 — `daily_once_count`·`negative_split`. fail-closed로 막히므로 발급되지 않는다. 나머지 18종(휴식 4종·스칼라 7종·`weekly_streak`·`personal_record_break`·잔여 5종)은 평가가 구현됐다(티켓 20260905_0030 B3, 20260906_0110 ②, 20260906_2055, 20260908_1318) |
| `personal_record_break`·`personal_record_break_metric` | ✅ 평가 구현됨 (2026-09-06, 티켓 20260906_2055 · 2026-09-08, 티켓 20260908_1438에서 페이스 방향 지원 추가) — `activityFilters.ts`의 `countPersonalRecordBreaks()`가 가입 시점 이후 활동에서 지표별 역대 최고 기록 갱신을 판정한다. **콘텐츠 값이 채워진 지표는 4종**(`single_distance_km`·`duration_minutes`·`max_elevation_m`·`max_pace_sec_per_km`) — 나머지 지표나 `personal_record_break_metric` 자체가 비어 있는 계열은 짝 필드 강제(`unpaired`) 또는 「미지원 지표」 가드로 계속 막힌다. `walking:B3/B4`·`running:R3`·`cycling:R2`(32종)는 티켓 20260908_1318에서, `cycling:R1`·`running:R1`·`running:R2`(24종, `running:R2`는 페이스 지표)는 티켓 20260908_1438에서 짝 필드를 채웠다 |
| `distinct_time_bands`·`day_of_month`·`activities_within_hours`·`month_over_month_ratio`·`vs_personal_average` | ✅ 평가 구현됨 (2026-09-08, 티켓 20260908_1318) — §2.10 참조. `month_over_month_ratio`/`vs_personal_average`는 지표를 거리(km)로 고정 |
| 스칼라 7종·`weekly_streak`의 **평가** | ✅ 구현됨 (2026-09-06, 티켓 20260906_0110 ②) — 원천 데이터는 그 전에(티켓 20260905_0029) `normalizeActivity`가 Strava Summary 응답에서 심박·파워·케이던스·최고속도·최고도달고도·경과시간을 읽어 `normalized`에 저장해 둔 상태였다. 조건 키 ↔ 정규화 필드 대응은 `CONDITION_ACTIVITY_FIELD`. 기존 활동은 `jam-web/scripts/backfill-strava-extended-fields.ts`로 채운다 |
| 케이던스 단위 | ✅ 러닝·트레일러닝만 ×2 정규화(양발 합계 spm), 사이클은 rpm 그대로 — 저장 시점(신규 싱크+백필)에 적용(티켓 20260906_0110 ⑤). 기존 저장분은 마이그레이션 141로 재정규화 완료 |
| `negative_split` (`splits_metric`) | ❌ **v5 1차 범위 밖** (티켓 20260905_0029 확정) — 상세 엔드포인트에만 있어 활동 1건당 호출 1회가 든다(백필 697회). 상한을 두면 배지가 비결정적이 되므로 별도 티켓으로 분리했다. `StravaDetailedActivity` 타입은 신설됐지만 **수집하지 않는다** |
| `poi_id` badge-engine 평가 | ❌ 항상 fail — GPS 파이프라인 전용 |
| `mission_reward` badge-engine 평가 | ❌ 항상 fail — 미션 완료(`grantMissionRewards`)로만 지급, §3 참조. 온보딩 퀘스트 완료 배지도 이 플래그를 쓴다(지급 경로는 온보딩 완료 판정, 티켓 20260927_2130 T7b) |
| `temperature_*` (날씨 데이터 없는 활동) | ⚠️ fail — Strava average_temp 의존. 미션 조건으로는 쓰지 않는다(저장 거절, §7.2) |
| UTC vs KST 경계 | ✅ 시간대(`time_range`·`distinct_time_bands`)·요일·월·계절·`day_of_month`와 횟수 5종(`total_count`·`weekly_count`·`monthly_count`·`season_count`·`season_count_all`)은 KST 날짜 기준이다(티켓 20261018_1815 1회). 연속(`streak_days`·`weekly_streak`)·휴식 4종(공백 일수)·활동일(`active_days_count`)·전월 대비 배수(`month_over_month_ratio`)와 회차 계산(`repeat_count`)의 일·주 키, 미션 복합 조건의 주·달·요일 개수도 같은 KST 날짜를 쓴다(티켓 20261019_1312 2회). 해외 활동도 한국 시각의 날로 세고 `startDateLocal`은 날 기준에 쓰지 않는다. 랭킹 `total_count`는 활동 건수를 세므로 이 기준과 단위가 다르다(티켓 20261018_2303) |

---

## 7. 미션 조건으로 쓰는 키 (JAM 2.0, 티켓 20261019_1312)

미션(`missions.condition_json`)은 이 문서의 배지 조건 어휘 가운데 **활동 기록만으로 판정되는 키**와, **참가한 뒤 기간 안의 DB 기록으로 판정되는 키**(§7.1의 «DB 기록» 행, 티켓 20261019_1445)를 `mission_type='engine_condition'`에서 쓴다.
미션 쪽 정본은 `jam-web/src/lib/missions/condition-keys.ts`다 — 위임 키 목록(`ENGINE_DELEGATED_CONDITION_KEY_LIST`), 판정 가능 키 집합(`ENGINE_CONDITION_JUDGED_KEYS`),
저장 검증(`checkMissionCondition`)이 거기 있다. 판정 함수는 `engineCondition.ts`의 `evaluateEngineMissionCondition`이다(배지 엔진 `evaluateConditionDetailed`에 위임하는 부분과 미션 전용 부분을 AND로 결합).

### 7.1 판정 가능 키

| 구분 | 키 | 판정 |
|---|---|---|
| 배지 엔진 위임 (26개) | 기존 14개: `activity_type`, `distance_km`, `elevation_gain_m`(참가 뒤 누적 합계), `single_distance_km`, `single_elevation_m`, `max_elevation_m`, `max_pace_sec_per_km`, `min_speed_kmh`, `duration_minutes`(활동 1건), `same_activity`, `repeat_count`, `rest_after_long`, `streak_days`, `weekly_streak` | 이 문서 §2의 같은 키와 같은 이름·의미 |
| | 시간대: `time_range`, `distinct_time_bands` | `time_range`는 §2.7, `distinct_time_bands`는 §2.10 — KST 시각 기준 |
| | 요일: `day_of_week` | §2.1 — KST 요일 기준. 단일 값은 거르는 조건이다. 배열은 `weekly_streak`와 함께 쓸 때만 반영된다(`total_count`는 미션에 없다) |
| | 계절: `season`, `season_count`, `season_count_all` | §2.5 — KST 월 기준, 활동한 날의 수. `season_count`는 `season`과 함께 쓴다 |
| | 운동 속성: `max_speed_kmh`, `avg_heartrate_bpm`, `avg_watts`, `avg_cadence`, `cumulative_duration_hours`, `weekend_duration_hours` | `cumulative_duration_hours`는 §2.2(전체 이력 합계), `weekend_duration_hours`는 §2.4(주말 활동 1건), 나머지 넷은 §2.10(활동 1건의 값) |
| DB 기록 (19개) | 믹스: `combine_attempt_count`, `combine_success_count`, `combine_fail_count`, `recipe_first_success` / 드랍·픽업: `drop_item_count`, `pickup_item_count`, `pickup_from_user_count`, `picked_up_by_user_count` / 완료 수: `mission_complete_count`, `collection_complete_count` / 새 조건: `capsule_open_count`, `locked_item_open_count`, `locked_item_pickup_count`, `cross_tribe_combine_success_count` / 날짜·체크인(2회): `weekly_active_days`, `same_spot_checkin_days`, `new_checkin_badge_count`, `checkin_category_count`, `checkin_badge_count` | 배지 엔진에 위임하지 않는다. `lib/missions/dbMetrics.ts`의 `loadMissionDbMetrics`가 **참가한 뒤 미션 기간 안**의 값으로 읽고(§7.4), `evaluateEngineMissionCondition`이 값 ≥ 조건 값으로 비교해 활동 기록 조건과 AND로 묶는다(`recipe_first_success`는 기간 안에 그 레시피를 처음 성공했으면 1). 객체 값을 가진 `checkin_category_count`(`{category, count}`)·`checkin_badge_count`(`{checkin_badge_names, count}`)는 읽은 배지 수(그 장소 종류에 든 배지 수, 지정한 이름 중 받은 이름 수)를 `count`와 비교하고, 값 모양이 틀리면 충족하지 못한다(배지 발급과 같은 비교). 의미는 이 문서의 같은 키와 같다. 다만 «기간 안»의 뜻이 키마다 다르다(§7.4). 키 목록 정본은 `ENGINE_DELEGATED_DB_CONDITION_KEY_LIST` |
| 미션 전용 (9개) | `weekly_streak_min_count`, `monthly_streak`, `monthly_streak_min_count`, `streak_subset`, `distinct_weekday_count`, `distinct_months_required`, `distinct_months_metric`, `distinct_months_threshold`, `time_band_counts` | `engineCondition.ts`가 직접 판정. 주(월~일)·달·요일 개수는 KST 날짜 기준이다(해외 활동도 한국 시각의 날, 티켓 20261019_1312 2회) |
| 미션 전용 DB 기록 (1개, 3-A회) | `jam_period_earned` — 참가한 뒤 미션 기간 안에 모은 잼 ≥ 조건 값 | **배지 레지스트리에 없는 미션 전용 키**다. 위 «DB 기록 (19개)»와 똑같이 `loadMissionDbMetrics`가 읽고 `evaluateEngineMissionCondition`이 값 ≥ 조건 값으로 비교해 AND로 묶는다. 다만 읽기 목록이 따로다 — `MISSION_ONLY_CONDITION_KEY_LIST`(미션 전용 어휘)와 `MISSION_ONLY_DB_CONDITION_KEY_LIST`(읽는 방식)에 있고, 로더·판정이 쓰는 합집합이 `MISSION_DB_CONDITION_KEY_LIST`(20개)다. `ENGINE_DELEGATED_DB_CONDITION_KEY_LIST`(19개)에는 넣지 않는다 — 그 목록은 «전부 배지 조건 레지스트리의 키»임을 컴파일로 지킨다(`AssertDbKeysAreInRegistry`). 기준 시각은 §7.4 |

`day_of_week`·`season`은 «거르는 조건»(`role: 'filter'`)이라 혼자서는 판정할 값이 없다. 거리·`season_count` 같은 판정할 값과 함께 써야 하고, 미션 전용 키하고만 짝지으면 배지 엔진이 「평가 가능한 조건 없음」으로 막는다(영구 미달성, 필터를 조용히 무시하지 않는다).

**어드민 미션 양식의 입력 칸**(티켓 20261021_1114 1회): 위 «배지 엔진 위임 (26개)» 전부에 입력 칸이 있다. 라벨·단위·허용 범위는 배지 조건 레지스트리(`conditionRegistry.ts`)의 정의를 그대로 쓰고, 시간대 `time_range`는 시작·끝을 한 줄로 묶어 둘 다 채워야 만들어진다. 레지스트리에 입력 칸 정의가 없는 `day_of_week`만 미션 쪽(`missionConditionFields.ts`)에서 정했다 — 월~일 칩을 체크해 고르고, 한 요일은 문자열(`"sunday"`), 두 요일 이상은 배열(`["saturday","sunday"]`)로 저장한다. 열어서 저장해도 값의 모양은 바뀌지 않는다(배열로 저장된 미션은 한 요일만 남아도 배열). 수치 키 9개(`season_count`·`season_count_all`·`distinct_time_bands`·`weekend_duration_hours`·`cumulative_duration_hours`·`max_speed_kmh`·`avg_heartrate_bpm`·`avg_watts`·`avg_cadence`)는 레지스트리 범위(`min`~`max`) 밖이면 폼이 저장 전에 알리고 막는다. 서버 저장 검사는 이 키들의 범위를 보지 않는다. `time_band_counts`는 입력 칸이 없고 열어서 저장해도 보존된다.

**어드민 미션 양식의 «기록으로 세는 조건»**(티켓 20261021_1114 2회): 복합 조건(`engine_condition`) 양식에 DB 기록 키 20개의 입력 칸이 한 구역으로 있고, 한 줄 설명은 «참가한 뒤 미션 기간 안의 기록만 세요.»다. 소제목 6개로 나뉜다: 믹스 5(시도·성공·실패 횟수, 레시피 최초 성공, 트라이브를 넘는 믹스 성공 횟수), 드랍·픽업 4, 완료 수 2, 캡슐·잠긴 아이템 배지 3, 날짜·체크인 5, 잼 1. 배지 쪽 19개는 라벨·단위·허용 범위를 레지스트리 정의 그대로 쓴다(수치 16개는 정수 한 칸, 대부분 1~1,000,000, `weekly_active_days` 1~7, `same_spot_checkin_days` 1~3650, `new_checkin_badge_count` 1~100000). `recipe_first_success`는 레시피 ID 글자 칸, `checkin_category_count`는 장소 카테고리 선택과 개수, `checkin_badge_count`는 배지 이름(쉼표 구분)과 개수다. 레지스트리에 범위가 없는 객체형 두 키의 안쪽 `count`는 이 폼이 1~1,000,000으로 정했다. 미션 전용 `jam_period_earned`는 레지스트리에 없어 미션 쪽에서 정했다: 라벨 «기간 동안 모은 잼», 단위 «잼», 1 이상 1,000,000 이하 정수. 도움말 가운데 «발급»·«가입한 날부터 센다»처럼 배지 기준으로 적힌 몇 개(`recipe_first_success`, `weekly_active_days`, `same_spot_checkin_days`와 체크인 두 키의 개수 칸)는 미션 문구로 바꿔 보인다. 서버 저장 검사는 기준 값이 1 이상의 정수인지만 보고 위쪽 한계는 보지 않아서, 폼이 위의 범위 밖 값과 소수를 저장 전에 알리고 막는다. 기간을 걸 수 없는 키 5개(`jam_total_earned`·`chapter_reached`·`days_since_signup`·`other_tribe_item_kinds_count`·`signup_recent_active_days`)는 입력 칸이 없다(서버도 저장 단계에서 거절한다). 미션 타입을 복합 조건이 아닌 것으로 바꾸면 이 구역은 사라지고, 입력된 기록 조건이 있을 때만 «이 미션 타입에서는 기록으로 세는 조건이 저장되지 않아요…» 경고가 뜬다. 입력 값은 지우지 않아서 타입을 되돌리면 그대로 돌아오고, 복합 조건이 아닌 타입으로 저장하면 이 조건은 저장되지 않는다.

### 7.2 쓰지 않는 키와 판정하지 않는 키

| 구분 | 키 | 저장 | 이유 |
|---|---|---|---|
| 쓰지 않음 | `temperature_min_c`, `temperature_max_c` | **거절(error)** — 모든 미션 타입 | 날씨와 기온은 배지와 미션의 조건으로 쓰지 않는다(운영 로직 13.2절). 위임하지 않으므로 저장하면 기온이 조용히 무시되어 미션이 더 쉬워진다 |
| 기간을 걸 수 없음 | `jam_total_earned`(지갑 평생 누계), `chapter_reached`(지금 챕터 하나), `days_since_signup`(가입 후 경과일), `other_tribe_item_kinds_count`(지금 가진 개체의 스냅샷), `signup_recent_active_days`(오늘 기준 최근 30일 창) | **거절(error)** — 모든 미션 타입 | 값이 «지금 상태»이거나 평생 누계라서 참가한 뒤 기간 안의 값으로 나눌 수 없다. 지금 값을 그대로 쓰면 참가 전에 쌓은 값이 섞여 참가 즉시 완료되는 미션이 생기므로 경고가 아니라 거절한다(티켓 20261019_1445, 오류 문구는 기온 키와 따로 현상·원인·해결책 순서) |
| 판정하지 않음 | 위 표에 없는 나머지 배지 조건 키 — 아직 판정하지 않는 `external` 키(범위 밖 키 9개)와 `total_count` 같은 비위임 키, 다른 미션 타입의 목표 값(`count`, `badge_id`) | **허용 + 경고(warning)** — `engine_condition`만 | 판정이 없어 달성 판정에 쓰이지 않는다. 판정하는 다른 조건이 없으면 미션이 완료되지 않을 수 있고, 있으면 이 조건 없이 완료된다. 5-2b 1~3회가 DB 기록 키 20개를 판정 가능하게 만들며 경고 대상에서 뺐다. 앞으로 키를 판정 가능하게 만들 때도 판정 구현과 같은 변경에서 판정 가능 집합에 옮긴다 — 판정 구현 없이 키만 옮기면 그 키만 든 미션이 참가 즉시 완료된다 |
| DB 기록 키의 기준 값 | `engine_condition`의 DB 기록 키 20개(`MISSION_DB_CONDITION_KEY_LIST`). `recipe_first_success`는 기준 값이 없어 제외, `checkin_category_count`·`checkin_badge_count`는 안의 `count`를 본다 | **거절(error)** — 기준 값이 1 이상의 정수가 아니면 | 모두 횟수나 개수, 잼의 양이라 1 이상의 정수여야 한다. 0 이하면 참가하자마자 완료되고 진행률의 목표도 0이 된다. 소수나 숫자가 아닌 값은 비교할 수 없어 달성되지 않는다. 문제가 있는 키를 한 번에 모두 알리고 문구는 현상·원인·해결책 순서다(티켓 20261019_1445 4회, `checkMissionConditionValue`). PATCH는 `condition_json`이 본문에 있을 때만 검사한다 — 이미 저장된 미션의 값은 다시 검사하지 않는다 |
| DB 기록 키를 다른 타입에 | `engine_condition`이 아닌 미션 타입(`distance`, `activity_count`, `streak_days` 등)에 든 DB 기록 키 20개 | **허용 + 경고(warning)** | 그 타입은 DB 기록을 읽지 않아 키가 판정에 쓰이지 않는다. 효과를 기대하기 쉬운 순위 기준 `jam_period_earned`가 특히 그렇다. 경고에서 복합 조건으로 바꾸도록 안내한다(`checkMissionCondition`, 티켓 20261019_1445 4회). 판정 준비가 안 된 필드와 함께 있으면 두 경고를 모두 싣고, 엔진 위임 타입이 판정 준비가 안 된 필드로 거절되는 경우는 오류가 우선한다 |
| 아직 평가 구현이 없음 | `evaluation: 'pending'` 키 | **거절(error)** — 엔진 위임 타입 / 그 밖의 타입은 경고 | 기존 동작 그대로 (§6 참조) |

경고는 어드민 API의 저장 응답(POST·PATCH)에 `warning`으로 담긴다(저장된 행과 함께, 행에는 저장하지 않는다). 경고할 것이 없으면 응답 모양은 그대로다.
복합 조건에 판정 가능한 키가 하나도 없으면(`activity_type`만 있거나 `count`·`badge_id`만 있는 경우 포함) 그 미션은 완료되지 않는다(fail-closed). 판정 가능 키 집합(`ENGINE_CONDITION_JUDGED_KEYS`)을 저장 경고와 이 판정이 함께 쓴다.

### 7.3 순위형 금지

미션의 틀(`status_display_type`)이 `ranking`이면 아래 조건을 저장하지 못한다(오류 문구는 현상·원인·해결책 순서). 달성형·개인형은 저장된다.

- 밤 조건: `time_range`, `time_band_counts`의 구간, 주기 안 부분집합의 시간대(`streak_subset.time_range`)가 22:00~05:00(KST)과 겹치는 것. 시각은 배지 엔진 `inTimeRange`와 같은 함수(`timeBands.ts`의 `isMinuteInTimeRange`)로 읽는다 — `HH:MM` 외에 `HH:MM:SS`·`24:00`도 받고, 양 끝을 포함하며, 끝이 시작보다 이르면 자정을 넘기는 구간이다(티켓 20261019_1312 2회). 그래서 22:00에 시작한 활동을 세는 `18:00~22:00`과 `20:00~24:00`, `22:00:00~05:00:00`은 밤 조건이고, 밤 시각을 하나도 건드리지 않는 `18:00~21:59`, `05:00~08:00`은 밤이 아니다. `distinct_time_bands`는 서로 다른 시간대의 수만 세므로 밤 조건이 아니다.
- 캡슐 연 횟수: `capsule_open_count`.
- 모은 잼은 순위 기준으로 쓸 수 있다(운영 로직 13.2절). `jam_period_earned`는 순위형을 포함한 어느 틀로든 저장된다(3-A회, `rankingConditionError`는 바꾸지 않았다).
  순위형에서는 목표를 먼저 채운 순서가 앞서고, 못 채운 사람은 모은 양 순이다(`compareMissionRank` 그대로).
- 홈 투데이 랭킹 보드와 랭킹 모드(3-B회): `jam_period_earned`가 든 미션은 랭킹 모드(`ranking_modes`)에 연결하지 못한다. 순위의 값이 모은 잼의 양이라, 홈 보드에 올리면 양이 홈을 보는 모두에게 드러나기 때문이다.
  읽는 쪽은 `computeMissionParticipantsResult`가 이 키가 든 미션의 순위를 빈 결과로 돌려준다(`hasPeriodEarnedKey`: 미션 타입은 따지지 않고 조건에 키가 있으면 가린다. 화면은 「아직 랭킹이 없어요」). 어드민 미리보기도 같은 함수라 비어 보인다.
  쓰는 쪽은 랭킹 모드 생성·수정(POST·PATCH)이 연결할 미션의 조건을 읽어 400으로 거절한다(현상·원인·해결책 순서, 읽지 못하면 500으로 저장을 멈춘다). 본문에 미션 id가 있으면 그 미션을 본다.
  PATCH는 본문에 미션 칸이 아예 없어도(직접 API 호출) 수정 뒤에도 남는 **기존 연결**을 본다 — 기존 모드의 대상 방식이 미션 참가자 순위(본문이 바꾸지 않았다면)이고 연결된 미션이 이 키를 가지면 거절한다.
  본문이 미션을 비우거나 대상 방식을 유저 직접 지정으로 바꾸는 수정, 대상 미션을 다른 미션으로 바꾸는 수정은 통과한다(복구 경로). 생성 화면의 미션 선택 목록에서는 이 미션을 빼고,
  수정 화면에서는 지금 연결된 이 미션만 제목 뒤에 «(연결할 수 없는 미션)»을 붙여 남긴다(빼면 선택 칸이 비어 보이는데 저장은 거절되기 때문이다. 표시일 뿐 저장은 위와 같이 거절된다).
  이미 저장된 랭킹 모드의 미션 조건이 나중에 바뀐 경우는 어드민 랭킹 모드 목록의 경고 칩(`mission_period_earned_hidden`)이 이유를 알린다.
- 틀을 비워 만들면 DB 기본값이 순위형(마이그레이션 046 `DEFAULT 'ranking'`)이라 같은 값으로 검사한다. PATCH는 조건이나 틀 하나만 바뀌어도 기존 행과 합친 «갱신 후 상태»로 검사한다(틀만 바뀔 때는 순위형 금지만 본다).

### 7.4 기간 경계

미션 판정에 넘기는 활동은 **참가 시각(`joined_at`)과 미션 시작(`starts_at`) 가운데 늦은 시각 이후**, **종료(`ends_at`, 없으면 상한 없음) 이전**의 것이다. 시각으로 비교하며(`Z`와 `+00:00` 표기가 달라도 같은 시각) 경계 시각은 포함한다. 선택은 `jam-web/src/lib/missions/window.ts`의 `activitiesWithinMissionWindow` 한 곳이 맡고, `checkMissions`가 거리·활동 횟수·엔진 위임 타입(`streak_days`, `duration_minutes`, `elevation_gain_m`, `engine_condition`)에 적용한다. 체크인·아이템 수집처럼 보유 현황으로 판정하는 유형은 활동 배열을 쓰지 않는다.

**DB 기록 키(§7.1)도 같은 경계를 쓴다.** `window.ts`의 `missionWindowIsoBounds`가 활동 선택과 같은 계산으로 하한·상한을 ISO 시각으로 돌려주고(둘 다 포함), 지표 읽기 함수(`jamActionMetrics.ts`·`jamActionDropMetrics.ts`·`jamActionCompletionMetrics.ts`·`jamActionItemMetrics.ts`)가 선택 인자 `window`로 받아 DB가 시각으로 거른다. 인자를 주지 않으면 평생값이라 배지 엔진 호출처는 그대로다(날짜·체크인 키의 읽기 함수 `jamActionDayMetrics.ts`·`jamActionCheckinMetrics.ts`도 같다). 기준 시각은 키마다 다르다.

| 키 | 기준 시각 |
|---|---|
| 믹스 4가지, `cross_tribe_combine_success_count` | 믹스 기록의 `attempted_at` |
| `drop_item_count` | 놓은 때 `poi_drops.dropped_at` |
| `pickup_item_count`, `pickup_from_user_count`, `locked_item_pickup_count` | 주운 때 `poi_drops.picked_up_at` |
| `picked_up_by_user_count` | 놓은 때가 아니라 **주워진 때** `poi_drops.picked_up_at` (참가 전에 놓은 아이템도 참가 뒤에 주워 가면 센다) |
| `mission_complete_count`, `collection_complete_count` | 완료·완성한 때 `completed_at` |
| `capsule_open_count` | `capsule_opens.opened_at` |
| `jam_period_earned` | 잼이 정산된 활동의 **시작 시각** `strava_activities.start_date`. 잼 원장의 정산(동기화) 시각 `jam_transactions.created_at`이 아니다 — 아래 «모은 잼» |
| `locked_item_open_count` | 개체 이력 `inventory_item_events.created_at` |
| `weekly_active_days` | 활동의 시작 시각 `strava_activities.start_date`와 체크인을 만든 활동의 시각 `user_checkin_badge_earns.triggered_by_activity_date`로 정한 «활동한 날»(KST) |
| `same_spot_checkin_days` | 체크인을 만든 활동의 시각 `triggered_by_activity_date` (이 값이 없는 체크인은 세지 않는다) |
| `new_checkin_badge_count`, `checkin_category_count`, `checkin_badge_count` | 배지별 **처음 받은 시각**(아래 «처음 받은» 규칙) |

**날짜 키(2회)**: 기간 밖의 활동·체크인은 «활동한 날»에 넣지 않는다. 하한은 «가입한 날(KST) 0시»와 미션 기간 하한 가운데 늦은 쪽이다. 기간 경계에 걸친 주(월~일)는 **잘린 대로** 센다.
`weekly_active_days`는 «기간 안의 활동한 날(활동 ∪ 체크인한 날)이 가장 많은 한 주(월~일, KST)의 날 수»이고 이어진 주를 합치지 않는다(배지의 «역대 최고 주»를 기간 안으로 한정한 값). 활동은 종목이 있고 걷기 게이트·차량 속도 필터를 통과한 것만 센다(위 배지 조건 표의 `weekly_active_days` 행과 같은 «활동한 날» 정의).
`same_spot_checkin_days`는 «기간 안의 체크인만 보고 지점(`poi_id`)별 서로 다른 날(KST) 수의 최댓값»이다(지점을 합치지 않는다).

**모은 잼(`jam_period_earned`, 3-A회)**: ① `strava_activities`에서 시작 시각이 기간 안(하한·상한 포함)인 활동 id를 끝까지 읽고(`selectAllPages`, 30,000행을 넘으면 던진다), ② `jam_transactions`에서 `reason='activity_settlement'`이고 `source_activity_id`가 그 id(200개씩 나눠)인 줄의 `amount`를 더한다(`readJamEarnedWithin`, `lib/badge-engine/jamActionJamMetrics.ts`). 정산 시각이 아니라 활동 시각을 따라가므로 참가 전에 한 활동을 늦게 동기화해도 세지 않는다. 채움(`capsule_fill`·`locked_item_badge_fill`, 음수)과 운영자 지급·회수(`admin_grant`·`admin_deduct`)는 `reason`이 달라 합계에 들지 않고, 정산되지 않은 활동은 줄이 없어 0이다. 읽지 못하면 던지고 그 미션만 건너뛴다. 이 읽기 함수는 기간 인자가 필수이고 배지 엔진은 부르지 않는다.
진행값과 목표: `evaluateMission`이 `jam_period_earned`가 든 `engine_condition` 미션에서만 `progressValue`를 모은 잼, `target`을 조건의 값으로 돌려준다. 완료는 조건 전체의 AND 판정(`achieved`)이다(잼을 채워도 다른 조건이 모자라면 완료되지 않는다). 이 키가 없는 `engine_condition`은 예전처럼 0/1·target 1이다. `getTarget`과 `MISSION_PROGRESS_UNIT.engine_condition`(`''`)은 바꾸지 않았다 — 마일스톤(50%·80%)·마감 임박 소식이 이 둘로 양을 만들기 때문에, 채우면 모은 잼이 소식 문구로 나간다. 활동 피드(`mission_completed`)의 `final_progress_value`는 `engine_condition`이면 달성 여부(1/0)만 기록하고 `target_value`는 0이라 양이 나가지 않는다. 미션 상세 화면의 «달성» 표시는 완료 기록(`isCompleted`)으로만 판정한다(3-B회) — 진행값이 모은 잼의 양이라 `progressValue >= 1`로 보면 1잼만 모아도 달성으로 그려진다.

**«처음 받은» 규칙(사용자 결정 3)**: 체크인 키 3가지는 행부터 기간으로 거르지 않는다. ① 방문 기록 **전체 이력**으로 배지마다 처음 받은 시각을 정한다(체크인을 만든 활동의 시각 `triggered_by_activity_date`을 우선하고, 없으면 기록한 시각 `earned_at`; 한 배지의 여러 줄 가운데 가장 이른 시각). ② 그 시각이 기간 안(하한·상한 포함)인 배지만 «기간 안에 새로 받은 배지»로 센다. 그래서 기간 전에 받은 배지를 기간 안에 다시 받아도 새 배지로 세지 않고, 참가 전에 한 활동을 기간 안에 늦게 동기화해도 활동 시각이 기간 전이면 세지 않는다. 처음 받은 시각을 읽을 수 없는 배지(두 시각이 모두 없거나 깨진 배지)는 뺀다. `checkin_category_count`·`checkin_badge_count`는 이렇게 좁힌 배지 집합에 배지 발급과 같은 계산(`lib/badge-engine/checkinHoldings.ts`의 순수 함수)을 적용한다 — 장소 종류는 `badges.category` 우선·없으면 연결 지점의 카테고리, 이름은 `type='checkin'` 배지로만 풀고 카탈로그에 없는 이름은 무시한다.

`checkMissions`는 DB 기록 키가 든 `engine_condition` 미션에만, 그 미션의 기간으로 **미션마다** 읽는다(루프 앞에서 한꺼번에 읽지 않는다 — 기간이 미션마다 다르고, 같은 동기화에서 먼저 완료된 미션이 뒤 미션의 `mission_complete_count`에 잡혀야 한다). 읽기에서 오류가 나거나 기간의 하한을 정할 수 없으면 던지고, 그 미션만 건너뛴다(0으로 폴백하지 않는다). 다만 **같은 원천을 읽는 키·미션은 한 번만 읽는다**(4회, `dbMetrics.ts`의 `DbReadMemo`): 체크인 키 3개가 쓰는 방문 기록 전체(유저 기준이라 미션이 달라도 같다)와 `pickup_item_count`·`pickup_from_user_count`가 쓰는 기간 안 픽업 행(유저·기간 기준)만 `checkMissions` 한 번 호출 안에서 나눠 쓰고, 호출이 끝나면 버린다. `mission_complete_count`처럼 같은 루프 안에서 값이 바뀌는 읽기와 키마다 표가 다른 읽기는 나누지 않는다. 읽기가 실패하면 나눠 쓰는 기록에서 지워 다음 미션이 다시 시도한다. 값은 나눠 쓰든 아니든 같고 읽는 횟수만 다르다. **판정 시점은 활동 동기화 때뿐이다** — `checkMissions` 호출처가 `strava/sync.ts` 한 곳이고 믹스·캡슐 열기·드랍·픽업 API는 배지만 판정하므로, 이 키들로 만든 미션은 그 행동을 한 순간이 아니라 다음 동기화 때 완료된다. 어드민 양식에는 이 키 20개의 입력 칸이 있다(티켓 20261021_1114 2회, 아래 «어드민 미션 양식의 입력 칸»). 폼에 입력 칸이 없는 DB 기록 키가 생기면 열어서 저장해도 값이 사라지지 않게 원본을 보존한다(`MISSION_ENGINE_DB_PRESERVED_KEYS` = 합집합에서 폼 목록을 뺀 나머지, 지금은 비어 있다). 판정 시뮬레이션은 이 키를 평가하지 못해 응답의 `missionDbKeysPresent`로 알린다.
