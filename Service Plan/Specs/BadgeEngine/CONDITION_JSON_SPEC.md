# 배지 발급 조건 필드 전체 스펙 (`condition_json`)

> 최초 생성: 2026-08-07  
> 관련 문서: [BADGE_ENGINE_UNIFIED.md](BADGE_ENGINE_UNIFIED.md) (엔진 평가 로직), [../Content/ACTIVITY_BADGES.md](ACTIVITY_BADGES.md) (배지 전체 목록)  
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
| `day_of_week` | `DayOfWeek \| DayOfWeek[]` | 활동 시작 요일(로컬 기준, `startDateLocal`) 필터. **단일값**: `time_range`처럼 다른 필드와 AND 결합되는 필터 (예: `day_of_week:"sunday"` + `total_count:1000`). **배열 + `total_count` 동시 지정**: "요일별 독립 카운터" 모드로 전환 — 배열의 각 요일이 각각 독립적으로 `total_count`를 만족해야 발급 (예: 평일 5일 각각 300회 — W08 "평일의 성실함") |
| `route` | `string` | 특정 루트 이름 필터용으로 스키마(`condition-schema.ts`의 `FILTER_ONLY_CONDITION_KEYS`)에 정의돼 있으나 **badge-engine 평가 로직에 실제 구현이 없다** — `src/lib/badge-engine/index.ts` 전체에 참조가 없어 조건에 넣어도 필터링 효과가 없다(무시됨). 어드민 폼에는 입력 UI가 없지만, 값이 있는 배지를 폼에서 저장해도 유실되지는 않는다(티켓 20260825_032에서 보존 로직 적용 완료). §6 참조 |

### 2.2 누적 통계 필드 (전체 이력 합산)

| 필드 | 타입 | 단위 | 평가 방식 |
|------|------|------|-----------|
| `distance_km` | `number` | km | `activity_type` 필터 후 **전체 누적 거리** ≥ 조건값. `same_activity: true`가 함께 있으면 예외(§2.2-1) |
| `elevation_gain_m` | `number` | m | `activity_type` 필터 후 **전체 누적 고도** ≥ 조건값. `same_activity: true`가 함께 있으면 예외(§2.2-1) |
| `total_count` | `number` | 회 | 필터된 활동 **건수** ≥ 조건값 |
| `cumulative_duration_hours` (2026-09-06 신규, 티켓 20260906_0110 ①) | `number` | 시간 | `activity_type` 필터 후 **전체 누적 이동시간** ≥ 조건값. `duration_minutes`(§2.3, 단일 활동 전용)와 달리 이력 전체 합산이다. 레지스트리에 키가 없어 v5 카탈로그 시딩(0035)에서 빠졌던 `walking:K2`·`running:K2`·`hiking:K2`(3계열)를 복구하기 위해 추가됨 — `evaluation: 'engine'` |
| `monthly_count` (2026-09-06 신규, 티켓 20260906_0110 ①) | `number` | 회 | 월별(연-월 그룹) 활동 횟수 최대값 ≥ 조건값. `monthly_km`(거리)·`weekly_count`(주 단위)와 구분되는 «월 단위 활동 횟수» 필드. `repeat_count`와 결합하면 「그 횟수를 채운 달의 수」를 센다(§2.11). `cycling:G2`·`hiking:C2`(2계열)를 복구하기 위해 추가됨 — `evaluation: 'engine'` |

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
| `weekly_count` | `number` | 회 | 한 주(월–일) 내 활동 횟수 최대값 ≥ 조건값. `time_range` 동반 시 해당 시간대 활동만 카운트 |
| `weekend_duration_hours` | `number` | 시간 | 토·일 활동 이동시간(시간) 최대값 ≥ 조건값 |
| `active_days_count` | `number` | 일 | 걷기(축1 게이트 통과) 활동의 누적 **고유** 활동일수 ≥ 조건값 — `COUNT(DISTINCT date)`. `streak_days`(연속 일수)와 달리 연속일 필요 없음 |

### 2.5 월·계절 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `month` | `number` (1–12) 또는 `number[]` | 특정 달(들) 지정. `monthly_km`과 함께 사용. 배열이면 각 달을 OR로 묶는다(예: 장마철 6~7월) |
| `monthly_km` | `number` | 월별 누적 거리 최대값 ≥ 조건값. `month` 없으면 전체 연-월 그룹 최대. `repeat_count`와 결합하면(2026-09-08, 티켓 20260908_1536) 「그 임계값을 채운 연-월의 수」를 센다 — `month`가 배열이면 **각 달을 독립적으로** 카운트한다(`walking:W4` 실측: Epic 1개월·Mystic 2개월 = `month:[6,7]` 중 한 달/두 달). 판정은 `repeatOccurrences.ts`의 `collectMonthlyKmOccurrences()`, 단발 판정(`index.ts`)과 같은 연-월 그룹핑 규칙 공유 |
| `season` | `"spring"` \| `"summer"` \| `"autumn"` \| `"winter"` | 해당 계절 지정 |
| `season_count` | `number` | 해당 계절 활동 횟수 ≥ 조건값 |
| `season_count_all` | `number` | 사계절(봄/여름/가을/겨울) **각각 독립 카운터**로 활동 횟수 ≥ 조건값이어야 함 — 4개 계절 모두 충족해야 통과(T15 "사계절의 발걸음"). `season_count`(지정 계절 1개만 검사)와 달리 `season` 필드 지정이 불필요. **어드민 폼에 입력 UI가 없다** — 값이 있는 배지를 폼에서 저장해도 유실되지는 않지만(티켓 20260825_032 보존 로직), 폼에서 직접 편집은 불가하다(DB 직접 수정 필요) |

### 2.6 환경 조건 필드

| 필드 | 타입 | 단위 | 평가 방식 | 주의 |
|------|------|------|-----------|------|
| `temperature_min_c` | `number` | °C | Strava `average_temp` ≥ 조건값 (폭염) | 날씨 데이터 없는 활동 → 무조건 fail |
| `temperature_max_c` | `number` | °C | Strava `average_temp` ≤ 조건값 (한파) | 동일 |

### 2.7 시간대 필드

| 필드 | 타입 | 형식 | 평가 방식 |
|------|------|------|-----------|
| `time_range` | `{ start: "HH:MM", end: "HH:MM" }` | 24시간 | `startDateLocal`의 HH:MM이 범위 내인 활동만 카운트. 자정 걸침 지원 (예: `{start:"22:00", end:"06:00"}`) |

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
| `distinct_time_bands` ✅ (2026-09-08, 티켓 20260908_1318) | `number` | 개 | 서로 다른 시간대의 수. `badgeConditionText.ts`와 같은 시간대 6구간(새벽·아침·점심·오후·저녁·심야) 경계로 판정. `streak_days`와 결합하면 그 스트릭 창 **안에서만** 시간대 수를 센다(`repeatOccurrences.ts`) | — |
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

**회차의 정의** — `collectRepeatOccurrences()`(`src/lib/badge-engine/index.ts`) 한 곳에만 있다.
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
| `mission_reward` | `boolean` | 미션 완료(`grantMissionRewards`)로만 지급되는 배지 표시용 플래그 | badge-engine 내 **항상 fail**(사유: "미션 보상 배지 — 미션 완료로만 지급") + 발급 후보 조회 단계에서 아예 제외. 배지 상세화면이 이 플래그로 "미션 보상 배지" 안내를 표시 |
| `follower_count` | `number` | [JAM! 카테고리] 팔로워 수 ≥ 조건값 | badge-engine 내 **항상 fail**(measurable 필드가 없어 "평가 가능한 조건 없음") — `src/lib/badge-engine/usageBadges.ts`의 `evaluateUsageBadges()`가 `POST /api/follows` 성공 직후 별도 판정·발급 |
| `following_count` | `number` | [JAM! 카테고리] 팔로잉 수 ≥ 조건값 | 위와 동일 — `evaluateUsageBadges()`가 `POST /api/follows` 성공 직후 판정 |
| `daily_sync_count` | `number` | [JAM! 카테고리] 그날(KST) 누적 동기화 성공 횟수 ≥ 조건값 | 위와 동일 — `evaluateUsageBadges()`가 `syncStravaActivities()`에서 `synced > 0`일 때만 판정(카운터는 `user_daily_sync_counts` + `increment_daily_sync_count()` RPC) |

> ⚠️ 배경(티켓 20260825_028): 마이그레이션 `084_badge_condition_cleanup.sql`이 배지 상세화면
> 표시용으로 미션보상배지 15종에 `{"mission_reward": true}`를 넣었는데, 당시 badge-engine은
> "알려진 조건 필드 없음 → 검사 스킵 → pass:true"로 처리해 미션 완료 없이 미션보상배지가
> 발급되고 레벨업 게이팅이 12일간 무력화됐다. 지금은 `mission_reward`가 §2의 조건 필드와
> 명시적으로 분리돼 있고, 이 필드만 있는 조건은 위 방어 분기로 항상 fail 처리된다. 어드민
> `BadgeForm.tsx`도 이 필드를 조건 필드와 시각적으로 구분된 체크박스로 노출한다(티켓 20260825_031).

> **JAM! 카테고리 — 서비스 사용량 지표 3종** (2026-09-10, 티켓 20260910_1557): `mission_reward`와
> 같은 자리(`role: 'meta'` + `evaluation: 'external'`)이지만 성격은 조금 다르다 — `mission_reward`는
> 그 자체로 pass/fail을 만들지 않는 순수 플래그인 반면, 이 3종은 **실제로 수치 임계값이 발급
> 여부를 결정한다**. 다만 그 판정이 badge-engine(`evaluateConditionDetailed`, Strava 활동 이력
> 기반) 밖에서 일어나므로 §2가 아니라 여기 분류된다 — `MEASURABLE_CONDITION_KEYS`에 없어
> `evaluateConditionDetailed`는 이 필드들이 있으면 (다른 measurable 필드가 없는 한) 항상
> fail 처리하고, `role: 'meta'`라 진행률(`badgeProgress.ts`)도 그리지 않는다.
>
> `badge_type` enum에는 손대지 않고 `type='activity'` + `activity_types=[]`로 저장하는 것이
> 설계 전제다 — `activity_types[0]`이 없으면 `/badges/tree`(배지 트리)에는 노출되지 않고,
> `/badges` 일반 목록·프로필은 `type==='activity'`만 보므로 정상 노출된다. 발급 규칙(등급형
> 성장 티어·레벨형 연속 발급)은 BADGE_ENGINE_UNIFIED.md §2.2(Step 3-A/3-B)와 같은 정책을
> `usageBadges.ts`가 최소 재구현한다. 섀도우밴은 rarity가 있는(등급형) 배지만 차단 대상이다.

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
- `repeat_count`(§2.11)는 fail-closed 대상이 **아니다** — 평가가 구현돼 있다. 활동 1건 단위
  축(v5 스칼라 7종 포함)뿐 아니라 「기간 단위 회차」(`streak_days`·`weekly_count`·
  `monthly_count`·`weekly_streak` 결합, 2026-09-06 티켓 20260906_0110 ②)도 셀 수 있다. 다만
  회차 술어로 같이 쓰려는 필드가 여전히 `pending`이면 그 필드 때문에 조건 전체가 막힌다
- 휴식 4종(§2.13)은 **`repeat_count`와 휴식 키 1개까지 조합 가능하다**(2026-09-06, 티켓
  20260906_2056) — 전용 술어가 "휴식 조건을 만족한 복귀 사건"만 센다. 휴식 키 2개 이상은
  사건 경계가 정의되지 않아 여전히 「회차와 함께 쓸 수 없는 조건」으로 막힌다
- **사용량 지표 3종(§3 — `follower_count`·`following_count`·`daily_sync_count`)은
  `repeat_count`와 함께 쓸 수 없다**(2026-09-10, 티켓 20260910_1719) — `usageBadges.ts`의
  발급 경로는 등급형(이름 그룹 내 최상위 tier 1개만)·레벨형(family_key 연속 발급)만
  구현돼 있다. `badgeKindOf()`가 아니라 `isLeveledBadge()`(rarity==null 이진 판정)로만
  갈라 반복형(세 번째 종류)을 구분하지 못하므로, 등급형 경로로 흘러가 회차가 조용히
  무시된다 — 저장 시점에 `findUsageMetricRepeatConflictError`(`badge-condition-guards.ts`)가
  막는다
- 교차 게이트 3종(§2.12)도 fail-closed 대상이 **아니다** — 다만 값의 형태가 깨지면
  **그 게이트 때문에 발급이 막힌다**(통과가 아니다). 게이트는 조건 평가가 아니라 후보
  선별 단계에서 판정되므로, 수치 조건이 하나도 없는 배지는 여전히 「평가 가능한 조건 없음」이다

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
| 스칼라 7종·`weekly_streak`의 **평가** | ✅ 구현됨 (2026-09-06, 티켓 20260906_0110 ②) — 원천 데이터는 그 전에(티켓 20260905_0029) `normalizeActivity`가 Strava Summary 응답에서 심박·파워·케이던스·최고속도·최고도달고도·경과시간을 읽어 `normalized`에 저장해 둔 상태였다. 조건 키 ↔ 정규화 필드 대응은 `CONDITION_ACTIVITY_FIELD`. 기존 활동은 `scripts/backfill-strava-extended-fields.ts`로 채운다 |
| 케이던스 단위 | ✅ 러닝·트레일러닝만 ×2 정규화(양발 합계 spm), 사이클은 rpm 그대로 — 저장 시점(신규 싱크+백필)에 적용(티켓 20260906_0110 ⑤). 기존 저장분은 마이그레이션 141로 재정규화 완료 |
| `negative_split` (`splits_metric`) | ❌ **v5 1차 범위 밖** (티켓 20260905_0029 확정) — 상세 엔드포인트에만 있어 활동 1건당 호출 1회가 든다(백필 697회). 상한을 두면 배지가 비결정적이 되므로 별도 티켓으로 분리했다. `StravaDetailedActivity` 타입은 신설됐지만 **수집하지 않는다** |
| `poi_id` badge-engine 평가 | ❌ 항상 fail — GPS 파이프라인 전용 |
| `mission_reward` badge-engine 평가 | ❌ 항상 fail — 미션 완료(`grantMissionRewards`)로만 지급, §3 참조 |
| `temperature_*` (날씨 데이터 없는 활동) | ⚠️ fail — Strava average_temp 의존 |
| UTC vs KST 경계 | ⚠️ `streak_days`·`weekly_count`·`time_range`는 UTC 기준 — KST 자정 경계 오차 가능 |
