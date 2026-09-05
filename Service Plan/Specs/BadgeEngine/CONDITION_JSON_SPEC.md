# 배지 발급 조건 필드 전체 스펙 (`condition_json`)

> 최초 생성: 2026-08-07  
> 관련 문서: [BADGE_ENGINE_UNIFIED.md](BADGE_ENGINE_UNIFIED.md) (엔진 평가 로직), [../Content/ACTIVITY_BADGES.md](../Content/ACTIVITY_BADGES.md) (배지 전체 목록)  
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
| `month` | `number` (1–12) | 특정 달 지정. `monthly_km`과 함께 사용 |
| `monthly_km` | `number` | 월별 누적 거리 최대값 ≥ 조건값. `month` 없으면 전체 연-월 그룹 최대 |
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
| `prerequisite_badge_names` | `string[]` | **OR 매칭** — 유저가 나열된 배지명 중 하나 이상 보유 시 통과. Rare/Epic/Mystic 전용 (Common은 불필요) |

### 2.9 POI 필드 (badge-engine 외 처리)

| 필드 | 타입 | 평가 주체 |
|------|------|-----------|
| `poi_id` | `string` (UUID) | badge-engine 내 **항상 fail** — `matchPoisForActivity` GPS 경로 매칭 파이프라인이 별도 발급. `checkin` 타입 배지는 조건 빌더 자체를 건너뛰고 저장 시 `condition_json`을 항상 `null`로 처리하므로 이 티켓 범위 밖(폼 유실 문제와 무관) |

### 2.10 v5 신규 조건 필드 20종 — **선언만, 평가 미구현** (2026-09-05, 티켓 20260905_0028)

`conditionRegistry.ts`에 `evaluation: 'pending'`으로 선언돼 있고 DB CHECK 제약도 허용하지만,
**badge-engine은 아직 이 필드들을 평가하지 않는다**(구현은 티켓 20260905_0030).
이 필드가 하나라도 든 조건은 `evaluateConditionDetailed`가 fail-closed로 막으므로
«발급되지 않는 것»이 기본값이다(§4 참조).

**활동 1건의 스칼라 값** — `PER_ACTIVITY_KEYS` 경로로 구현 예정

`정규화 필드`는 `NormalizedActivity`(`src/types/strava.ts`)에서 **같은 단위로 그대로 비교되는**
필드다. 조건 키는 snake_case, 정규화 필드는 camelCase라 이름이 규칙적으로 대응하지 않으므로
`conditionRegistry.ts`의 `activityField`가 단일 출처이고 파생물 `CONDITION_ACTIVITY_FIELD`로
꺼내 쓴다(티켓 20260905_0029). 이름이 어긋나면 `condition-registry.test.ts`가 깨진다.

| 필드 | 타입 | 단위 | 정규화 필드 | 의미 |
|------|------|------|------|------|
| `max_elevation_m` | `number` | m | `maxElevationM` | 활동 1건의 최고 도달 고도(해발) |
| `max_speed_kmh` | `number` | km/h | `maxSpeedKmh` | 활동 1건의 최고 속도 |
| `single_distance_km` | `number` | km | `distanceKm` | 활동 1건의 이동 거리 — 누적 합계인 `distance_km`과 구분된다 |
| `single_elevation_m` | `number` | m | `elevationGainM` | 활동 1건의 고도 상승 — 누적 합계인 `elevation_gain_m`과 구분된다 |
| `avg_heartrate_bpm` | `number` | bpm | `avgHeartrateBpm` | 활동 1건의 평균 심박수 |
| `avg_watts` | `number` | W | `avgWatts` | 활동 1건의 평균 파워 |
| `avg_cadence` | `number` | — | `avgCadence` | 활동 1건의 평균 케이던스. 단위가 종목마다 다르다(러닝 spm · 자전거 rpm)라 지표 라벨의 단위는 비워 뒀다 |

> **측정값이 없는 활동에는 정규화 필드의 키 자체가 없다**(`null`이 아니다). 심박계·파워미터가
> 없는 유저의 활동이 «데이터 없음 = 카운트 안 함»으로 자연히 동작하게 하기 위한 확정 사항이다
> (마스터 20260905_0026). 평가 구현은 `undefined` 하나만 보면 된다.

**이력 패턴** — 신규 독립 평가 블록이 필요하다

| 필드 | 타입 | 단위 | 의미 | 짝 필드 |
|------|------|------|------|---------|
| `rest_after_streak` | `number` | 일 | 연속 활동 뒤에 쉰 일수 | `streak_days` |
| `rest_after_long` | `number` | 일 | 장거리 활동 뒤에 쉰 일수 | `single_distance_km` |
| `return_gap_days` | `number` | 일 | 복귀 직전에 쉰 일수 | — |
| `interval_days` | `number` | 일 | 활동과 활동 사이 간격 | — |
| `daily_once_count` | `number` | 일 | 하루에 1회만 활동한 날의 수 | — |
| `negative_split` | `boolean` | — | 후반 구간이 전반보다 빠른 활동으로 한정하는 **필터**. Strava `splits_metric`이 필요한데 Summary 응답엔 없다 — **티켓 20260905_0029에서 v5 1차 범위 밖으로 확정**됐다(활동 1건당 상세 호출 1회 × 백필 697회). `evaluation: 'pending'` 그대로이고 별도 티켓으로 분리됐다 | `total_count` |
| `weekly_streak` | `number` | 주 | 연속한 주(월~일)의 수 | — |
| `distinct_time_bands` | `number` | 개 | 서로 다른 시간대의 수 | — |
| `day_of_month` | `number` (1–31) | — | 매달 지정일 **필터**. `day_of_week`와 같은 성격 | `total_count` |
| `activities_within_hours` | `{ hours: number; count: number }` | 회 | 지정한 시간 창 안에 활동이 `count`회 이상 | — |
| `personal_record_break` | `number` | 회 | 개인 기록 갱신 횟수. **가입 이후 활동만으로 직접 계산한다** — Strava `pr_count`는 계정 전체 이력 기준이라 v5의 «가입 시점 카운트»와 충돌해 쓰지 않는다 | — |
| `month_over_month_ratio` | `number` | 배 | 전월 대비 비율 | — |
| `vs_personal_average` | `number` | 배 | 평소 평균 대비 비율 | — |

분류상 `negative_split`·`day_of_month`만 «필터 전용»이고 나머지 18종은 «수치 검사» 필드다
(계열 정합성 트리거의 `measurable_keys`도 그 18종을 포함한다 — 마이그레이션 131).

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
   `temperature_min_c`·`temperature_max_c`·`weekend_duration_hours`)를 **전부** 만족.
   `same_activity: true`면 `distance_km`·`elevation_gain_m`도 합류하고,
   `time_range`는 `weekly_count`가 없을 때 합류한다
4. 걷기는 하루 1회 상한(`dedupeOnePerDay`) 적용 — 걷기 배지 v4 정책과 같다

**배지 종류 판정** — `rarity`가 있고 `repeat_count`가 있으면 **반복형**이다(세 번째 종류).
`rarity IS NULL`이면 레벨형이 우선한다. 판정은 `badgeKind.ts`의 `badgeKindOf()` 한 곳.

⚠️ **현재 회차 술어로 쓸 수 있는 필드는 위 6종 + `same_activity` 조합뿐이다.**
`single_distance_km`처럼 회차 표현에 더 자연스러운 v5 스칼라 7종은 아직 `evaluation: 'pending'`이라
조건에 넣으면 fail-closed가 통째로 막는다(§4). 「20km 이상 러닝 5회」는 지금
`{ activity_type: 'running', same_activity: true, distance_km: 20, repeat_count: 5 }`로 쓴다.

---

## 3. 메타데이터 필드 (발급 판정에 관여하지 않음)

아래 필드는 §2의 조건 필드와 성격이 다르다 — badge-engine의 수치 검사 로직에 전혀 관여하지
않고, 표시·안내 목적으로만 쓰인다. `src/lib/badge-engine/condition-schema.ts`의
`CONDITION_META_KEYS`로 분류된다.

| 필드 | 타입 | 설명 | 평가 방식 |
|------|------|------|-----------|
| `mission_reward` | `boolean` | 미션 완료(`grantMissionRewards`)로만 지급되는 배지 표시용 플래그 | badge-engine 내 **항상 fail**(사유: "미션 보상 배지 — 미션 완료로만 지급") + 발급 후보 조회 단계에서 아예 제외. 배지 상세화면이 이 플래그로 "미션 보상 배지" 안내를 표시 |

> ⚠️ 배경(티켓 20260825_028): 마이그레이션 `084_badge_condition_cleanup.sql`이 배지 상세화면
> 표시용으로 미션보상배지 15종에 `{"mission_reward": true}`를 넣었는데, 당시 badge-engine은
> "알려진 조건 필드 없음 → 검사 스킵 → pass:true"로 처리해 미션 완료 없이 미션보상배지가
> 발급되고 레벨업 게이팅이 12일간 무력화됐다. 지금은 `mission_reward`가 §2의 조건 필드와
> 명시적으로 분리돼 있고, 이 필드만 있는 조건은 위 방어 분기로 항상 fail 처리된다. 어드민
> `BadgeForm.tsx`도 이 필드를 조건 필드와 시각적으로 구분된 체크박스로 노출한다(티켓 20260825_031).

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
  있으면 나머지 필드를 충족해도 **발급되지 않는다**. 대상은 ① `evaluation: 'pending'`인 v5 신규 20종
  (§2.10) ② 레지스트리에 아예 없는 키(오탈자). 사유는 「평가할 수 없는 조건 필드 — …」로 남는다.
  이 규칙이 없으면 `matchesPerActivityCondition()`이 모르는 키를 조용히 건너뛰고 마지막에
  `return true` 하므로, 미구현 필드가 «발급 안 됨»이 아니라 **«무조건 발급»**으로 뒤집힌다
- `repeat_count`(§2.11)는 fail-closed 대상이 **아니다** — 평가가 구현돼 있다. 다만 회차 술어로
  같이 쓰려는 필드가 `pending`이면 그 필드 때문에 조건 전체가 막힌다

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
| v5 신규 20종 | ❌ 평가 미구현 — 선언·DB CHECK·지표 라벨까지만 반영됐다(티켓 20260905_0028). fail-closed로 막히므로 발급되지 않는다. 평가 구현은 티켓 20260905_0030 |
| 스칼라 7종의 **원천 데이터** | ✅ 수집됨 (티켓 20260905_0029) — `normalizeActivity`가 Strava Summary 응답에서 심박·파워·케이던스·최고속도·최고도달고도·경과시간을 읽어 `normalized`에 저장한다. 조건 키 ↔ 정규화 필드 대응은 `CONDITION_ACTIVITY_FIELD`. 기존 활동은 `scripts/backfill-strava-extended-fields.ts`로 채운다 |
| `negative_split` (`splits_metric`) | ❌ **v5 1차 범위 밖** (티켓 20260905_0029 확정) — 상세 엔드포인트에만 있어 활동 1건당 호출 1회가 든다(백필 697회). 상한을 두면 배지가 비결정적이 되므로 별도 티켓으로 분리했다. `StravaDetailedActivity` 타입은 신설됐지만 **수집하지 않는다** |
| `poi_id` badge-engine 평가 | ❌ 항상 fail — GPS 파이프라인 전용 |
| `mission_reward` badge-engine 평가 | ❌ 항상 fail — 미션 완료(`grantMissionRewards`)로만 지급, §3 참조 |
| `temperature_*` (날씨 데이터 없는 활동) | ⚠️ fail — Strava average_temp 의존 |
| UTC vs KST 경계 | ⚠️ `streak_days`·`weekly_count`·`time_range`는 UTC 기준 — KST 자정 경계 오차 가능 |
