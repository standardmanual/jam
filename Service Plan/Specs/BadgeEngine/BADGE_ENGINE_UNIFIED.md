# JAM! 통합 배지 발급 로직 — 액티비티배지 엔진 + 아이템배지 드랍 엔진

> 최종 업데이트: 2026-08-10 (Strava 수동 입력(manual) 활동 동기화 제외 — §1 공통 정책 참고)  
> **배지 운영 문서 4종 체계** — 이 문서(로직) + [`CONDITION_JSON_SPEC.md`](CONDITION_JSON_SPEC.md)(조건 필드 전체 스펙) + `액티비티배지 레시피.md`(액티비티배지 전체 목록) + `아이템북 레시피.xlsx`(아이템배지 전체 목록 + 세계관 인접)  
> DB 시드: `supabase/migrations/033_reseed_activity_badges_v3.sql` (액티비티배지 115종) + `supabase/migrations/076_walking_badges_v4.sql` (걷기 신규 32종, 2026-08-08)

---

## 1. 전체 구조

Strava 활동 동기화(`src/lib/strava/sync.ts`) 1회가 두 엔진을 모두 호출한다:

```
Strava 싱크
 ├─ ① 액티비티배지 엔진 (badge-engine) — 조건 충족 시 결정론적 발급
 └─ ② 아이템배지 드랍 엔진 (drop-engine) — 확률·서사 기반 드랍
```

| 구분 | ① 액티비티배지 엔진 | ② 아이템배지 드랍 엔진 v2 |
|------|--------------------|--------------------------|
| 대상 | `type='activity'` (147종: 기존 5종목 체계 115종 + 걷기 v4 신규 32종) | `type='item'` (~900종: 10세계관 × 10컬렉션) |
| 성격 | **성취의 증명** — 조건 달성 = 발급 (결정론) | **수집의 재미** — 활동당 최소 1개, 내용은 변동 (확률론) |
| 평가 기준 | 유저 **전체 활동 이력** 누적 평가 | **단일 활동**(이번 싱크 배치) 기준 |
| 저장 | `user_activity_badges` | `inventory_items` (일련번호 무작위) |
| 구현 파일 | `src/lib/badge-engine/index.ts` ✅ 구현 | `src/lib/drop-engine/` ✅ v2 구현 (2026-07-21) |
| 게이미피케이션 역할 | 장기 목표·티어 성장 (mastery) | 세션 보상·세계관 서사·수집 (variable reward) |

**공통 정책 (두 엔진 공유):**
- 첫 싱크 게이트: `users.initial_sync_done=false`인 첫 싱크는 고가치 발급 제한 (액티비티=Rare+ 차단, 아이템=첫 드랍 확정이되 rarity 정책 적용)
- 섀도우밴: 밴 레벨에 따라 고가치(rarity) 발급 차단 — `src/lib/abusing/`
- 피드 이벤트: 발급 시 `recordFeedEvent` ('badge_earned' / 'item_dropped')
- **수동 입력 활동 제외 (2026-08-10 추가)**: Strava `manual=true`(GPS/파일 없이 유저가 거리·시간을 직접 타이핑한 기록)인 활동은 `getActivities()`(`src/lib/strava/api.ts`) 반환 단계에서 완전히 걸러낸다 — 두 엔진 평가 대상에 아예 들어오지 않으며 `strava_activities`에도 기록되지 않는다. `device_name`(기록 기기) 기반의 "조작된 파일 업로드" 필터는 상세 API 추가 호출이 필요해(목록 API 미포함) 현재는 미구현 — [Tickets/20260810_001](../../Tickets/20260810_001_Service_Strava-수동입력-활동-동기화-제외.md) 참고.

---

## 2. 액티비티배지 엔진 (구현됨 — v3)

### 2.1 입력 / 출력

```
입력: userId, activities[] (NormalizedActivity)
출력: { earned: BadgeEarnedInfo[], missed: BadgeMissedInfo[] }
```

### 2.2 발급 파이프라인

```
Step 0. 초기 싱크 상태 조회 (users.initial_sync_done)
Step 1. type='activity' 배지 전체 조회 (유효기간 필터)
Step 2. 유저 보유 배지 조회 (오류 시 즉시 종료)
Step 2.8. [첫 싱크 게이트] 첫 싱크면 Common 외 전부 missed
Step 3. 이름 그룹 단위 평가:
  A. 이미 보유 → 스킵
  B. 보유보다 낮은 tier → 스킵 (성장 티어)
  C-1. prerequisite_badge_names OR 매칭 — 하나도 없으면 missed
  C-2. evaluateConditionDetailed — 전체 이력 기준 AND 평가
  D. eligible 중 최상위 tier 1개만 후보 (나머지 missed)
Step 4. [진행 트랙 중복 제거] 단일 조건 배지는 activity_type:조건타입 트랙당 최고 1개
Step 5. [홍수 방지] 30일 롤링 윈도우, activity_type당 최대 3개 (mystic→common 우선)
Step 6. 발급: user_activity_badges INSERT + 피드 이벤트 + initial_sync_done 갱신
```

### 2.3 조건 평가 필드 (모든 필드 AND)

| 조건 필드 | 평가 방식 |
|-----------|-----------|
| `activity_type` | 활동을 해당 타입으로 필터링 |
| `distance_km` / `elevation_gain_m` | **누적 합계** ≥ 조건값 |
| `total_count` | 필터된 활동 건수 ≥ 조건값 |
| `min_speed_kmh` / `duration_minutes` | **단일 활동 최고값** ≥ 조건값 (min_speed_kmh는 cycling 등 속도 단위) |
| `max_pace_sec_per_km` | **단일 활동 최고 페이스** ≤ 조건값 — 값이 작을수록 빠름(km/h와 부등호 반대). running 등 페이스 단위 종목에 사용 |
| `streak_days` | 최장 연속 활동일 ≥ 조건값 |
| `weekly_count` | 한 주 내 활동 횟수 최대값 — `time_range` 동반 시 **시간대 내 활동만 카운트** (엄격 평가) |
| `weekend_duration_hours` | 주말(토·일) 활동 이동시간 최대값(시간) ≥ 조건값 |
| `month` + `monthly_km` | 월별 누적 거리 최대값 ≥ 조건값 (month 없으면 전체 연-월 그룹 최대) |
| `season` + `season_count` | 해당 계절 활동 횟수 ≥ 조건값 |
| `temperature_min_c` / `temperature_max_c` | Strava average_temp ≥/≤ 조건값 (폭염/혹한) — 날씨 데이터 없으면 fail |
| `time_range` | startDateLocal의 HH:MM이 {start,end} 범위 내 (자정 걸침 지원) |
| `poi_id` | ⚠️ 엔진 내 평가 불가 — GPS 경로 매칭(matchPoisForActivity)으로 별도 발급 |
| `day_of_week` (2026-08-08 신규) | 단일값: `time_range`처럼 AND 필터. 배열+`total_count` 동시 지정 시 "요일별 독립 카운터" 특수모드(배열의 각 요일이 각각 `total_count` 충족 필요) — 현재 T08 전용 |
| `active_days_count` (2026-08-08 신규) | 축1 게이트 통과 활동의 `(startDateLocal ?? startDate).slice(0,10)` 고유 날짜 `Set` 크기 ≥ 조건값 (연속 아님) |
| `season_count_all` (2026-08-08 신규) | 봄/여름/가을/겨울 각 계절 활동 횟수가 전부 조건값 이상 (계절별 독립 카운터, `season`+`season_count`와 별개 필드) |
| `month` (2026-08-08 확장) | 기존 `number`에서 `number | number[]`로 확장 — 배열이면 여러 달을 OR로 묶어 `monthly_km`와 결합(예: 장마철 6~7월) |
| `prerequisite_badge_names` | Step 3 C-1에서 처리 (OR 매칭) |

### 2.4 성장 티어 정책

같은 이름 그룹 내 common → rare → epic → mystic 순서로만 성장. 상위 달성 시 하위를 건너뛰고 **최상위 1개만** 발급.

```
예시: "첫 숨결" 그룹
  - common(3km) 보유 → rare(20km) 달성 시: rare만 발급
  - epic(60km) 달성 시 common·rare 조건도 통과하지만: epic 1개만 발급
```

### 2.5 진행 트랙 정책

단일 조건 배지는 `activity_type:조건타입` 트랙으로 묶여 동일 트랙 내 최고값 1개만 발급.

```
트랙 키 예시: 'walking:distance_km', 'running:max_pace_sec_per_km', 'cycling:min_speed_kmh', 'cycling:elevation_gain_m'
```

복합 조건 배지(time_range+weekly_count, max_pace_sec_per_km+duration 등)는 트랙 제외 → 각각 독립 발급.

### 2.6 홍수 방지 (flood cap)

30일 롤링 윈도우 / activity_type당 최대 3개 / mystic → epic → rare → common 우선 통과. 기존 보유 + 이번 발급 예정 합산으로 체크, 초과분 missed.

### 2.7 첫 싱크 게이트 + 선행 배지 게이트

- **첫 싱크**: `initial_sync_done=false`면 Common만 발급 (Rare+는 missed). 종료 후 true 갱신. 목적: 첫 연동 시 수백 km 이력 보유 유저라도 배지 폭발 방지.
- **선행 배지**: Rare/Epic/Mystic의 condition_json에 `prerequisite_badge_names: ["배지명A", "배지명B"]` (OR). 어떤 등급이든 해당 배지명 보유 시 통과. 목적: 동일 종목의 다른 속성 배지를 먼저 경험하게 유도.

| 등급 | 첫 싱크 발급 | 선행 배지 |
|------|-------------|-----------|
| Common | ✅ 허용 | 불필요 |
| Rare/Epic/Mystic | ❌ 차단 | 동일 종목 다른 속성 배지 1개+ (OR) |

**미션 보상 배지 제외** (2026-08-25, 티켓 20260825_028): `condition_json.mission_reward = true`인
배지는 **발급 후보 조회 단계(Step 1)에서 아예 제외**한다. 이 배지들은 미션 완료
(`grantMissionRewards`) 경로로만 지급되며, 동기화 평가로 발급되면 위 선행 배지 게이트가 통째로
열린다. 추가로 `evaluateConditionDetailed`에 두 개의 방어 분기를 둔다:

1. `mission_reward === true` → 항상 `pass:false`(사유: "미션 보상 배지 — 미션 완료로만 지급")
2. **수치 검사 필드(`MEASURABLE_CONDITION_KEYS`)가 하나도 없는 조건 → 항상 `pass:false`**
   (사유: "평가 가능한 조건 없음"). 필터 성격 필드(`activity_type`·`day_of_week`)나 엔진이 모르는
   필드만 남은 조건이 함수 마지막 줄의 `pass:true`로 새는 것을 막는다.

> 배경: 마이그레이션 `084_badge_condition_cleanup.sql`(2026-08-13)이 배지 상세 화면 표시용으로
> 미션보상배지 15종에 `{"mission_reward": true}`를 UPDATE하면서, "조건이 비어 있으면 미발급"이라는
> 기존 가드(키 0개일 때만 동작)를 우회하게 됐다. `mission_reward`는 엔진이 모르는 필드라 어떤 검사
> 블록에도 걸리지 않고 마지막 `pass:true`에 도달해, **해당 종목 활동을 한 번만 동기화해도 미션 없이
> 미션보상배지 3개가 발급되고 본 배지 Rare/Epic/Mystic 게이트가 전부 열리는** 상태였다
> (2026-08-25 발견). 잘못 발급된 이력은 `seed_reset_levelup_missions_20260825.sql`로 회수한다.

**데이터 계약 검증 계층** (2026-08-25, 티켓 20260825_031): 위 3중 방어는 084 사고의 *증상*을
막지만, "condition_json에 런타임 데이터 계약이 없다"는 근본 원인은 별도로 다룬다.
`MEASURABLE_CONDITION_KEYS`는 `src/lib/badge-engine/condition-schema.ts`로 이전해 DB
CHECK 제약·어드민 API 검증과 단일 소스를 공유한다(전체 허용 필드 목록·검증 계층 3단은
[`CONDITION_JSON_SPEC.md`](CONDITION_JSON_SPEC.md) 상단 "데이터 계약 검증" 안내, §2~§3 참조).
요약: ① DB CHECK 제약(`badges_condition_json_known_keys`)이 허용 목록 밖의 키가 담긴
`condition_json`의 INSERT/UPDATE를 거부(최후 방어선, 마이그레이션 포함 모든 쓰기 경로 커버) ②
어드민 API(`findUnknownConditionKeyError`)가 저장 전에 한국어 에러로 먼저 안내 ③
`BadgeForm.tsx`가 `mission_reward`를 조건 필드와 시각적으로 구분된 체크박스로 노출해, 폼
라운드트립(로드→그대로 저장) 중 플래그가 조용히 유실되던 회귀도 함께 수정했다.

**소프트 삭제와 보유 이력의 관계** (2026-08-25, 티켓 20260825_021): 배지 정의가 나중에
소프트 삭제(`badges.deleted_at IS NOT NULL`)되어도, 유저가 이미 획득한 이력은 §2.5
진행 트랙 최고 티어 판정과 위 선행 배지 게이트 판정에서 계속 유효하다. `evaluateBadgesDetailed()`는
"유저가 이미 가진 게 무엇인지"를 삭제 필터가 걸린 발급 후보 카탈로그(`allBadges`)가 아니라
유저의 실제 보유 배지(`user_activity_badges`)를 기준으로 별도 조회해 판단한다. 발급 후보
카탈로그 자체의 삭제 필터(신규 발급 대상에서 삭제 배지 제외)는 그대로 유지된다 — "소프트 삭제는
노출·신규지급만 막고 이미 획득한 유저의 이력은 그대로 유지"라는 20260823_004 원칙의 적용
누락을 바로잡은 수정이다(조사: 20260825_020).

### 2.8 알려진 주의사항

| 항목 | 내용 | 위험도 |
|------|------|--------|
| temperature 조건 | Strava가 average_temp를 제공하지 않는 활동은 날씨 배지 미발급 | 데이터 의존 |
| 주말 판정 | UTC 기준 — KST 주말 경계(토 09시 이전 등) 오차 가능 | 낮음 |
| streak 판정 | UTC 기준 — 자정 직후 활동의 날짜 귀속 오차 가능 | 낮음 |
| poi_id | badge-engine 내 항상 fail — GPS 매칭 파이프라인으로만 발급 | 스켈레톤 |

### 2.9 배지 구성

5종목(걷기·러닝·사이클·등산·트레일) × 속성 그룹 × 4등급 = 115종 (v3.1) + 걷기 신규 32종(v4, §2.10) = **총 147종**.  
전체 목록·조건값·설명: **`액티비티배지 레시피.md`(`Specs/Content/ACTIVITY_BADGES.md`)** (단일 진실 원천). DB 시드: `033_reseed_activity_badges_v3.sql` + `076_walking_badges_v4.sql`.

### 2.10 걷기 배지 v4 — 축1 게이트 + 하루 1회 상한 + 신규 배지 32종 (2026-08-08)

> 배경·튜닝 파라미터 상세: `Service Plan/Tickets/20260808_001_Content_걷기배지체계-v4-전면개편.md`

**축1 게이트** — 걷기(`activity_type='walking'`) 조건 평가 전 사전 필터. `evaluateConditionDetailed`가 `filtered`를 구성하는 시점에 `condition.activity_type==='walking'`인 경우에만 적용되며, 걷기가 아닌 종목에는 영향 없음.

```ts
export const WALKING_GATE_MIN_DISTANCE_KM = 0.5   // 최소 거리(km)
export const WALKING_GATE_MIN_DURATION_MIN = 10    // 최소 이동시간(분)
export const WALKING_GATE_MIN_SPEED_KMH = 2.0      // 평균속도 하한(km/h)
export const WALKING_GATE_MAX_SPEED_KMH = 8.0      // 평균속도 상한(km/h) — 러닝과 구분
export function passesWalkingGate(a: NormalizedActivity): boolean
```

⚠️ 4개 상수는 초안값이며 튜닝 대상. `active_days_count`는 이 게이트를 통과한 `filtered` 목록 기준으로 계산되므로 "게이트 통과일의 고유일수"가 자동 보장된다.

**하루 1회 상한** (`dedupeOnePerDay`, 걷기 전용) — `weekly_count`(W3 소급 적용, 조건값 불변) / `day_of_week`(단일)+`total_count`(T05~T07, T09~T11) / `day_of_week`(배열)+`total_count`(T08, 요일별 서브풀 각각) 에 적용. `streak_days`(W4)는 기존 `calcMaxStreak`가 `uniqueDates`로 이미 압축 계산해 변경 불필요. 순수 `total_count`만 있는 경우(T01~T04, T12~T14, T22, T23)는 상한 미적용(예: T01 "누적 10만 번"에 상한을 걸면 영구 미달성이 되는 설계 모순).

**신규 배지 32종**: D01~D11(누적 활동일수 체크포인트, `active_days_count`) + 트로피 매트릭스 21종(T01~T18, T20, T22, T23 — T19·T21은 제외 확정). 전체 목록: `Specs/Content/ACTIVITY_BADGES.md` 걷기 섹션. 전부 `prerequisite_badge_names` 없는 독립 배지(성장 티어 dedup·진행 트랙 병합 대상 아님).

**버그 수정 2건** (걷기 v4 구현 중 발견, 다른 종목에도 적용됨):

1. **`getProgressionKey` 크로스 배지 충돌**: 기존 로직이 `prerequisite_badge_names` 유무와 무관하게 `activity_type`+조건타입(`distance_km`/`total_count` 등)이 같으면 이름이 다른 배지끼리도 진행 트랙으로 병합해버렸다. T01~T04(전부 `walking:total_count` 트랙 키 충돌)와 T23(`walking:distance_km`가 W1과 충돌)이 이 문제로 조용히 발급 누락될 뻔했음(missed 배열에도 안 잡히고 후보에서 그냥 사라짐). **수정**: `prerequisite_badge_names`가 없거나 빈 배열이면 `getProgressionKey`가 즉시 `null`을 반환해 병합하지 않도록 가드 추가. 기존 W1~W8 및 타 종목 배지는 종목당 bare-metric 트랙이 원래 1개씩만 존재해 영향 없음(확인 완료).
2. **`temperature_min_c`/`max_c` + `total_count` 조합 누수**: 기존 `matchesPerActivityCondition`/`relevantPerActivityKeys`가 온도 조건을 항상 "단일 활동 매칭"으로만 취급해, T12~T14(온도조건+`total_count`, 예: "33도 이상 5회")에서 `total_count`가 온도와 무관하게 채워질 수 있었다(온도 만족 활동 1건 + 나머지는 아무 걷기나 채우면 통과). **수정**: `total_count`와 온도 조건이 함께 있으면 `filtered`를 온도 조건 만족 활동으로 먼저 좁히고 `relevantPerActivityKeys`에서 제외 — `time_range`+`total_count`(T09~T11)가 이미 쓰던 패턴과 동일하게 맞춤.

---

### 2.11 종목별 대표 배지 미션 게이팅 (✅ 구현됨 — 2026-08-13)

> 티켓: `Tickets/20260813_001_BadgeEngine_종목별-대표배지-레벨업-미션-게이팅-설계.md`

종목별로 "운동 목표 달성감이 가장 큰" 대표 배지 1종씩(5개 트리) — 걷기 `동네 산책러`, 러닝 `첫 숨결`, 사이클 `언덕의 도전자`, 등산 `첫 고도`, 트레일러닝 `야생의 주자` — 는 Rare 이상에서 기존 크로스게이트(`prerequisite_badge_names`에 같은 종목 다른 속성 배지 2개 OR)를 쓰지 않고, **미션 완료로만 얻는 전용 배지 1개**를 선행조건으로 요구한다. 나머지 142개 배지는 기존 크로스게이트 그대로 유지.

**구조**:
1. 미션보상배지 15종(`badges`, `type='activity'`, `condition_json = {"mission_reward": true}`) — 이름은 `{배지명} 레벨업` / `레벨업 Hard` / `레벨업 Ultra`(Rare/Epic/Mystic 대응). 일반 활동 동기화로는 절대 발급되지 않고, 미션 완료(`grantMissionRewards`)로만 지급된다.
   - ⚠️ 2026-08-13 최초 설계는 `condition_json = NULL`(빈 조건 → 항상 `pass:false`)이었으나, 마이그레이션 084가 `{"mission_reward": true}`를 넣으면서 그 가드가 무력화됐다(§2.7 "미션 보상 배지 제외" 참조). 2026-08-25(티켓 20260825_028)에 **플래그를 유지하되 엔진이 명시적으로 제외**하는 방식으로 바로잡고, 15종 전부 `{"mission_reward": true}`로 통일했다(배지 상세 화면이 이 플래그로 "미션 보상 배지"임을 표시하고 있어 NULL 통일 대신 플래그 유지를 택함).
2. 미션 15종(`missions`) — `mission_type`은 `streak_days`(걷기)/`duration_minutes`(러닝·사이클·등산, 단일 활동 기준)/`elevation_gain_m`(트레일, 단일 활동 기준). `ends_at = NULL`(상시), `status_display_type = 'individual'`(본인 진행상황만 노출, 다른 참가자 비공개), `max_completions = NULL`(선착순 아님), `reward_points = 0`.
3. 대상 배지 5종 × Rare/Epic/Mystic의 `condition_json.prerequisite_badge_names`를 기존 OR 배열 대신 해당 미션보상배지명 1개만 담은 배열로 교체 — 엔진 스펙상 배열 원소가 1개면 사실상 AND(그 이름의 배지를 보유해야만 통과)로 동작한다(`CONDITION_JSON_SPEC.md`).

**미션 엔진 확장**: 기존 미션 엔진(`mission_type`: distance/checkin/activity_count/item_collect — `checkin`은 2026-08-26 이전 `poi_visit`)은 이 정책이 요구하는 연속일수·단일세션 지속시간·등반고도를 계산할 수 없었다. 새 계산 로직을 만드는 대신, `jam-web/src/lib/missions/checker.ts`가 이 3개 신규 타입에 대해 배지엔진의 `evaluateConditionDetailed`를 그대로 호출해 판정한다(§2.3 조건 어휘 재사용 — `activity_type`+`streak_days`/`duration_minutes`/`elevation_gain_m`). "미션 참가 시점 이후" 제약은 `evaluateConditionDetailed` 자체가 아니라 `checkMissions`가 `joinedAt` 기준으로 활동 이력을 미리 필터링해서 넘기는 호출자 책임이다.

**기존 발급 건 처리**: 정책 도입 시점에 5개 트리 Rare 이상을 이미 보유 중이던 유저 3명(5건)이 있었으며, 소급 회수(삭제)하기로 결정 — `jam-web/supabase/seed_revoke_pre_mission_badges_20260813.sql`(사용자 직접 실행).

**미션 노출 규칙** (2026-08-25, 티켓 20260825_028): 레벨업 미션 15종은 서로 선행 관계가 없어 3단계가 동시에 노출·참가되던 문제가 있었다. `missions.gated_badge_id`(이 미션이 여는 본 배지 id, FK → `badges.id`)를 추가하고, 노출 판정을 `jam-web/src/lib/missions/visibility.ts`의 순수 함수 하나로 모아 목록·상세·참가 API(`POST /api/missions/[id]/join`)·오늘카드(`mission_spotlight`)가 같은 규칙을 쓰게 했다.

| 상태 | 판정 | 화면 |
|---|---|---|
| `completed` | `user_mission_completions`에 기록 있음 (완료 판정의 **단일 기준** — "보상배지 보유" 기준은 소프트삭제 스킵 정책(§2.12)과 충돌해 쓰지 않는다) | '완료/지난' 탭으로 이동, 재참가 불가(409) |
| `open` | 게이트 배지 등급 ≤ 유저 보유 등급 + 1 (미보유는 Common 보유로 취급 — 신규 유저에게도 첫 레벨업 미션은 노출) | 정상 노출·참가 가능 |
| `locked` | 게이트 배지 등급 = 유저 보유 등급 + 2 | 회색 잠금 카드(상세 진입·참가 불가, "○○ Rare 배지를 획득하면 열려요") |
| `hidden` | 그보다 위 단계 | 목록에서 완전 제외(URL 직접 진입 시에도 잠금 처리) — **단, 참가 이력(`user_mission_participations`)이 있으면 `locked`로 완화**(아래 참조) |

`gated_badge_id`가 없는 미션(기간형 30종)은 완료 여부만 판정한다. 게이트 배지를 찾을 수 없으면(삭제·오설정) 게이팅 없이 노출한다(fail-open) — 이 경우 `visibility-server.ts`가 배지 id·영향받은 미션 id를 `console.warn`으로 남겨 조기 감지할 수 있게 한다(§2.11 부칙, 2026-08-25 티켓 20260825_029).

**참가 이력 반영** (2026-08-25, 티켓 20260825_029): 게이팅 도입 이전에 상위 단계 미션에 이미 참가해 둔 유저가 있을 경우, `hidden` 판정만으로는 참가 이력을 어디서도 볼 수 없게 되는 문제가 있었다. `MissionVisibilityContext`에 `participatedMissionIds`를 추가해, 게이트 미달로 `hidden`이 될 미션이라도 참가 기록이 있으면 `locked`로 완화한다(잠금 카드로는 계속 보임). `open`/`completed`/`locked` 판정 우선순위와 로직은 변경하지 않았다 — 오직 `hidden` 반환 직전에만 관여한다.

### 2.12 미션 보상 배지 소프트 삭제 지급 정책 (2026-08-25, 티켓 20260825_016)

`grantMissionRewards()`(`jam-web/src/lib/missions/rewards.ts`)가 `mission.reward_badge_ids`로
보상 배지를 조회할 때, 이미 소프트 삭제(`badges.deleted_at IS NOT NULL`)된 배지는 **지급하지
않고 조용히 스킵**한다.

- **근거**: 배지는 (a) 어드민 수동 소프트삭제(오배포·컨텐츠 오류·시즌 종료 등,
  `src/app/api/admin/badges/[id]/route.ts`), (b) 아이템북 비활성화 시 소속 배지 연쇄
  소프트삭제(`src/lib/admin/itembook-deactivation.ts`)로 삭제될 수 있다. 미션 어드민 화면에는
  보상 배지 선택 시 삭제 여부 체크가 없고, 배지 삭제 시에도 미션 보상 연결 경고가 없어 관리자가
  인지 없이 "삭제된 배지가 보상으로 걸린 미션"을 만들 수 있다.
- **범위**: 조회 쿼리(`badges` select)에 `.is('deleted_at', null)` 필터만 추가한다. 이후 지급
  분기(활동배지 insert / 아이템배지 인벤토리 insert / `granted` 플래그)는 조회 결과에 대해서만
  동작하므로 삭제된 배지는 자동으로 지급 루프에서 빠진다.
- **포인트**: 스킵된 배지의 `point_reward`(배지 자체 포인트)도 지급 자체가 일어나지 않으므로
  함께 스킵된다. `mission.reward_points`(미션 자체 포인트)는 배지 지급 여부와 무관하게 별개
  사유(`mission_point_reward`)로 그대로 지급한다 — 영향 없음.
- **채택하지 않은 대안**: 대체 배지 지급, 환산 포인트 지급은 새 규칙 정의가 필요해 범위가
  커지고, 그대로 지급(삭제 배지 무시하고 발급)은 §3.7.1의 "화면마다 다르게 보임" 불일치의
  지급판이 될 위험이 있어 배제.

---

## 3. 아이템배지 드랍 엔진 v2 (✅ 구현됨 — 3레이어)

> v1(활동당 80% 확률, 전체 풀 완전 랜덤)을 대체. 2026-07-21 구현 완료 (마이그레이션 034 + `src/lib/drop-engine/`).  
> 구현 파일: `index.ts`(오케스트레이션) / `layers.ts`(순수 함수 추첨) / `context.ts`(맥락 매칭) / `policy.ts`(파라미터) / `constants.ts`(세계관 고정 UUID)  
> 파라미터는 `drop_policy` 싱글톤 테이블 — **어드민 `/admin/drop-policy`에서 배포 없이 편집** 가능. 인접 그래프는 세계관 수정 화면에서 편집.  
> ⚠️ 아래 §3.1 등 이 문서의 파라미터 값은 **초기 설계값**이다. 운영 중 실제 적용값은 어드민 화면에서 확인할 것.  
> 설계 방침: **집중은 보이지 않는 가중치로만** — "활성 세계관 N개 제한" 같은 명시 규칙은 유저가 인지하는 순간 상한·박탈로 읽히므로, 하드캡·세계관 선택 UI 없이 드랍 분포가 자연스럽게 2~3개 세계관에 수렴하게 한다.  
> 아이템배지·컬렉션·세계관·인접 그래프의 단일 진실 원천: **`아이템북 레시피.xlsx`** (배지 목록 시트 + '세계관 인접' 시트).

드랍 결정 3단계: **① 드랍 발생 → ② 세계관 선택 → ③ 컬렉션·배지 선택**

### 3.1 Layer 1 — 드랍 발생: 활동당 최소 1개 확정, 변동성은 희귀도로

> 정책: **활동 1건 = 아이템배지 최소 1개 확정.** 변동보상의 불확실성은 "나오느냐"가 아니라 "무엇이·얼마나 좋은 게·몇 개 나오느냐"에 둔다.

| 장치 | 값(초기) | 근거 |
|------|---------|------|
| 기본 드랍 | **활동당 1개 확정** | 모든 활동이 보상받음. 꽝의 실망 제거 |
| rarity 분포 | common 60 / rare 28 / epic 9 / mystic 3 (%) | 개수 고정 대신 희귀도가 매번의 서스펜스 담당 |
| Rare+ pity | 연속 5회 common → 6번째 rare 이상 확정 | 좋은 것의 가뭄 상한 |
| 보너스 드랍 | 15% 확률로 2개째 (60분+·고고도 활동은 30%) | "오늘은 2개!" 잭팟 + 노력↔보상 비례 |
| 일일 보정 | 당일 4번째 활동부터 확정 드랍 rarity를 common 90%로 하향 | 최소 1개 약속 유지하되 짧은 활동 반복(어뷰징) 기대값 억제 |
| 주간 첫 활동 | rare+ 확률 2배 | 주간 루프 재진입 트리거 |
| 복귀 보너스 | 7일+ 공백 후 복귀 활동은 **rare 이상 확정** | 이탈 위험이 가장 큰 복귀 순간을 보상 순간으로 |

- 첫싱크(온보딩) 드랍 확정은 기존대로 유지 ("10초 첫 보상").
- 섀도우밴은 rarity 상한으로 작동 — 최소 1개 약속과 충돌하지 않음 (common은 허용).
- **인벤토리 슬롯 초과 시 드랍 불가** — "최소 1개"의 유일한 예외. 슬롯 정리를 유도하는 investment 장치.

### 3.2 Layer 2 — 세계관 선택: 서사 모멘텀 (마르코프 가중 추첨)

유저별 `last_drop_world`(직전 드랍 세계관) 기준:

| 버킷 | 확률 | 의미 |
|------|------|------|
| **모멘텀** — 직전 드랍과 같은 세계관 | 50% | "이야기가 이어진다"는 감각의 핵심 |
| **인접** — 인접 그래프의 이웃 세계관 | 25% | 반복 지루함 방지 + 크로스오버 서사 |
| **탐험** — 전체 랜덤 (최근 없던 세계관 우선) | 15% | 신선함 주입. 탐험 드랍이 이어지면 모멘텀이 자연스럽게 이동 |
| **맥락 오버라이드** (조건 충족 시 최우선) | 10% | §3.4 — 활동 맥락과 정합하는 세계관 강제 |

- 드랍의 ~75%가 직전 세계관·이웃에 머물러 **명시적 제한 없이 집중 경험** 형성. 유저 체감은 "요즘 이 세계관 파편이 자주 보이네" 정도가 전부여야 한다.
- 신규 유저 첫 3드랍: **작심삼일 클럽 + 주 활동종목 매핑 세계관** (걷기→숲속의 갱단, 러닝→비트 마에스트로, 사이클→장비병 환자들, 등산/트레일→아스팔트 레인저). 이후 가중 추첨에 자연 합류.
- 컬렉션 완성 시 별도 선택·전환 절차 없음 — 완성은 축하 모먼트일 뿐, 드랍 흐름은 이어진다.
- **미스터리 헌터 예외**: epic·mystic 드랍 시에만 낮은 확률로 어느 유저에게나 등장하는 전역 스파이스 ("도시 괴담" 포지션).
- 인접 그래프: `아이템북 레시피.xlsx` **'세계관 인접' 시트**가 원천 → DB `world_adjacency` 시드.

### 3.3 Layer 3 — 컬렉션·배지 선택: 완성 페이싱

```
컬렉션 가중치 = drop_weight × (1 − completion × 0.7) × (직전 드랍과 같은 북이면 0.5)
  completion = 유저의 해당 컬렉션 수집률 (0.0~1.0)
  완성(100%) 북은 ×0.3으로 풀 잔류 — 중복 드랍 허용
```

- 0% 북 100% / 50% 북 65% / 마지막 1개 남은 북 ~38% → 새 북 진입은 쉽게, 막바지는 귀하게.
- **완성 북 계속 드랍**: 완성이 세계관과의 "이별"이 되지 않게. 중복 배지는 조합·트레이드 등 후속 경제의 재료.
- **마지막 조각 규칙**: 북의 마지막 1개는 감쇠로 자연히 귀해짐(완성의 긴장감) → 단, 그 세계관에서 5드랍 내 미획득 시 다음 드랍 확정 (좌절 상한). 드랍 시 UI에서 "○○ 컬렉션의 마지막 파편!" 강조 = 공유 가능한 milestone moment.
- 배지 선택: 북 내 **미보유 우선**, rarity 일치 배지 없으면 인접 rarity 폴백.

### 3.4 맥락 오버라이드 — 드랍을 '성취의 증거'로

활동 맥락이 세계관과 정합하면 **60% 확률**로 해당 세계관 강제. 보상이 활동의 증거(informational reward)가 되어 외적 보상의 내적 동기 침식(overjustification)을 방어한다.

| 활동 맥락 | 오버라이드 세계관 | 예시 컬렉션 |
|-----------|-----------------|--------------|
| 강수·태풍 / 기온 ≤ -10°C·≥ 33°C | 아스팔트 레인저 | 폭우 속의 질주, 영하 15도의 호흡 |
| 새벽 (05~07시) | 비트 마에스트로 / 셔터 마피아 | 새벽의 Lo-Fi, 새벽 물안개 몽환 |
| 심야 (23~04시) | 낭만 미식가 / 숲속의 갱단 | 편의점 심야 만찬, 은밀한 밤의 무도회 |
| 고고도 상승 | 낭만 미식가 / 비트 마에스트로 | 업힐 끝의 단맛, 업힐의 하드락 |
| **7일+ 공백 복귀** (최우선) | **작심삼일 클럽** | 결계 '섬데이' 돌파 |
| 러너스 하이 (고강도 장시간) | 미스터리 헌터 (rare+ 한정) | 차원의 틈새 |

### 3.5 일련번호 무작위화 + 개체 정체성 모델 (2026-08-29 갱신, 티켓 20260829_2101)

- `inventory_items.serial_number`는 발급 시 **1~999,999 난수 + UNIQUE 충돌 시 재시도**
  (`assign_random_serial()` 트리거). 앰비언트(시스템) 드랍으로 발급된 개체는 50,001~999,999
  범위로 제한된다(`obtained_by='ambient_drop'`로 판별).
- **개체 정체성**: 일련번호는 개체(`InventoryItem`)가 발급되는 순간 1회 확정되고, 그 개체가
  소멸(`destroyed_at`)할 때까지 유지된다. **일련번호가 확정(Minting)되는 시점은 정확히
  둘뿐이다** — ①드랍엔진을 통한 직접 지급(활동 보상 등), ②앰비언트 드랍이 POI에 배치되는
  순간(`src/lib/ambient-drop`가 배치 시점에 선발급/pre-mint한다). **픽업은 둘 중 어디에도
  속하지 않는다** — `poi_drops`는 `source`가 `user`/`system` 무엇이든 항상 이미 발급된
  `inventory_items` row를 `inventory_item_id`로 참조하며, 픽업(`pickup_drop()` RPC)은
  그 개체의 소유자만 옮길 뿐 새 row를 만들지 않는다(일련번호 불변).
- 개체 파괴(조합 소모 `Consume` / 미픽업 만료 `Expire`)는 소프트 삭제로 확정 —
  `inventory_items.destroyed_at`을 세우고, 번호는 `assign_random_serial()`의 유니크 체크
  (`destroyed_at IS NULL` 조건)에서 재사용 가능한 풀로 돌아간다. 같은 번호가 시간이 지나
  다른 개체에 재부여될 수 있으나, `custody_events`(아래 §3.5-1) 이력으로 항상 구분 가능하다.
- 유저 드랍은 기한 개념이 없다 — 회수 액션도, 만료도 없이 픽업될 때까지 무기한 대기한다
  (`poi_drops.expires_at`은 유저 드랍이든 시스템 드랍이든 항상 NULL).

#### 3.5-1 `custody_events` — 점유(custody) 이력 (어드민 조회용, 신규)

`InventoryItem` 한 개체에 점유 변화가 생길 때마다 쌓이는 append-only 이력. 8종 이벤트
(`Minted`/`UserDrop`/`Pickup`/`Expire`/`Slot`/`Unslot`/`Consume`/`Orphan`)가 아래 상태
전이 화살표와 1:1 대응한다. `from_user`/`to_user`/`actor`는 유저명을 스냅샷 값으로
저장한다(계정 탈퇴로 `public.users` row가 하드 삭제돼도 이름은 남아야 하므로, 라이브 FK
조인에만 의존하지 않는다).

```
Minted(발급 — ①직접지급 또는 ②앰비언트 배치 시점, 이때 serial 확정)
  ├─ ①직접지급 ──────────────────────────────▶ Held
  └─ ②앰비언트 배치 ─▶ AtPoi(소유자 없음)
                          ├─ 픽업(소유권 이전, serial 불변) ─▶ Held
                          └─ 기한 만료(미픽업)              ─▶ Destroyed

Held ─▶ Slotted ─▶ Held
Held ─▶ Consumed(조합 재료 소모) ─▶ Destroyed
Held ─▶ Dropped(유저 배치 — 무기한, 회수·만료 없음) ─ 픽업(소유권 이전) ─▶ Held(새 소유자)
Held/Slotted ─▶ Orphaned(소유자 계정 탈퇴 — 유저 비노출, 어드민 전용)
```

계정 탈퇴 시 Orphan 이벤트 기록은 앱 레벨 로직이 아니라 `BEFORE DELETE ON public.users`
DB 트리거(`log_orphan_custody_events()`)로 구현돼 있다 — 이 저장소에 아직 앱 레벨
"탈퇴 처리 로직"이 없어(계정 삭제는 Supabase Admin API/대시보드에서 직접 처리) 삭제 경로에
관계없이 항상 실행되는 트리거가 더 견고하다고 판단했다. 관련 스키마: `supabase/migrations/
108_item_identity_custody_model.sql`. 어드민 조회 화면은 별도 티켓(20260829_2139)에서 구현.

#### 3.5-2 표준 불변식 1: 원자적 소유권 이전 (2026-08-30 갱신, 티켓 20260830_0057)

`InventoryItem`의 점유(custody) 상태를 바꾸는 모든 RPC는 관련 행을
`SELECT ... FOR UPDATE`로 배타 락 건 뒤 상태를 재확인·전이하는 단일 트랜잭션이어야
한다(동시 요청 중 하나만 성공, 두 상태 컬럼이 서로 모순되는 중간 상태가 절대 커밋되지
않아야 함 — 티켓 20260829_2101). 현재 이 불변식을 따르는 RPC:

| RPC | 전이 | 락 순서 |
|---|---|---|
| `create_user_drop()` | Held → Dropped | `inventory` → `inventory_items` |
| `pickup_drop()` | Dropped/AtPoi → Held | `poi_drops` → `inventory_items` → `inventory` |
| `admin_destroy_orphaned_item()` | Orphaned → Destroyed | `inventory_items` |
| `admin_reassign_orphaned_item()` | Orphaned → Held(새 소유자) | `inventory_items` → `inventory` |
| `slot_item_into_book()` | Held → Slotted | `inventory` → `inventory_items` |
| `unslot_item_from_book()` | Slotted → Held | `user_item_book_slots` → `inventory` → `inventory_items` |

`slot_item_into_book()`/`unslot_item_from_book()`(마이그레이션
`111_item_slot_atomic_rpc.sql`)은 이 목록에서 가장 늦게 합류했다 — 기존
`api/itembooks/[id]/slot/route.ts`가 락 없는 순차 REST 호출로 구성돼 있어, 슬롯
장착과 드랍이 같은 아이템을 거의 동시에 대상으로 하면 `inventory_id`(드랍됨)와
`slotted_in`(장착됨)이 동시에 non-null인 모순 상태가 발생할 수 있었다(티켓
20260830_0055에서 발견, 20260830_0057에서 수정). 락 순서는 표에서 보듯 두 방향
모두 `inventory`를 `inventory_items`보다 먼저 잠그도록 다른 RPC들과 통일돼 있다 —
순서가 반대인 RPC 쌍이 있으면 같은 두 테이블을 동시에 노리는 요청끼리 AB-BA
데드락이 발생할 수 있기 때문이다.

### 3.6 데이터 모델

```sql
CREATE TABLE user_drop_state (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  last_drop_world_id text,                          -- 직전 드랍 세계관 (모멘텀 기준)
  last_drop_book_id uuid,                           -- 직전 드랍 컬렉션
  common_streak int NOT NULL DEFAULT 0,             -- 연속 common 카운터 (rare+ pity)
  last_piece_pity jsonb NOT NULL DEFAULT '{}',      -- {book_id: 카운터} 마지막 조각 pity
  daily_drop_count int NOT NULL DEFAULT 0,          -- 당일 드랍 수 (4번째부터 rarity 하향)
  daily_drop_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- worlds(id, name) + world_adjacency(world_id, adjacent_world_id)  ← xlsx '세계관 인접' 시트 시드
-- item_books.world_id 추가 필요 ← xlsx '팩션' 시트의 세계관 열이 원천
```

### 3.7 엔진 의사코드

```
tryItemDrop(userId, activity) → string[]   -- 드랍된 badge_id 목록 (20260823_007)
  state = user_drop_state 조회/초기화
  1. 드랍 개수: 기본 1개 확정 + 보너스 15% (60분+/고고도면 30%)로 2개째
  2. rarity 추첨 (개당):
     복귀(7일+) → rare+ 확정 / common_streak ≥ 5 → rare+ 확정
     / 주간 첫 활동 → rare+ 확률 2배 / 당일 4번째부터 → common 90%
     / 기본 60/28/9/3 → common이면 common_streak++, rare+면 리셋
  3. 섀도우밴 체크 (rarity 상한으로 작동)
  4. 세계관 선택:
     a. 맥락 오버라이드 매칭 → 60% 확률로 해당 세계관 확정
     b. 아니면 모멘텀 50 / 인접 25 / 탐험 15 (미발동 오버라이드분은 모멘텀 흡수)
  5. 컬렉션 선택: 가중치 = drop_weight × (1−completion×0.7) × (직전 북 0.5)
     완성 북은 ×0.3 잔류 / 마지막 조각 pity 도달 북 있으면 그 배지 확정
  6. 배지 선택: 미보유 우선, rarity 폴백 / 일련번호 난수 부여
  7. 인벤토리 삽입(슬롯 체크) + state 갱신 + 피드 이벤트
  8. 드랍된 badge_id 목록 반환 (획득 연출용 — 20260823_007)
```

> **불변식(2026-08-11, 티켓 20260811_009)**: `tryItemDrop`은 호출마다 `user_drop_state`를
> 새로 읽고 다시 저장하므로, 한 번의 싱크 배치에 활동 여러 건을 넘길 때는 반드시
> **시간순(오래된 → 최신)** 으로 처리해야 한다. 역순(최신 → 오래된)으로 처리하면 배치의
> 마지막 호출(=배치 내 가장 오래된 활동) 결과가 최종 저장돼 `last_activity_at`/
> `daily_drop_date`/`last_drop_world_id`가 실제 최신 활동을 반영하지 못한다.
>
> **⚠️ 반환값이 생겼다고 병렬화하면 이 불변식이 깨진다(2026-08-23, 티켓 20260823_007).**
> `tryItemDrop`이 `void`에서 `string[]`으로 바뀌면서 "결과를 모아야 하니 `Promise.all`로
> 한꺼번에" 라는 유혹이 생기지만, 병렬 호출은 각자 같은 `user_drop_state`를 읽고 서로를
> 덮어써 위 불변식을 정면으로 위반한다. **반드시 `for` 루프 안에서 순차 `await`** 해야 하며,
> 이 제약은 `src/lib/strava/sync.ts` 호출부에도 주석으로 남겨두었다.

### 3.7.1 획득 배지 상세 응답 (2026-08-23, 티켓 20260823_007)

배지 획득 연출(3D 캐러셀)을 위해 **엔진 4경로가 발급한 `badge_id`를 수집**하고,
`syncStravaActivities()` 종료 직전에 `badges` 테이블을 **1회** 조회해
`/api/strava/sync` 응답에 `earnedBadges[]`로 실어 보낸다.

| 경로 | 시그니처 변경 |
|---|---|
| 액티비티배지 | `evaluateBadges()` `number` → `string[]` |
| 아이템배지 | `tryItemDrop()` `void` → `string[]` |
| 체크인 배지 | `sync.ts`에서 발급분 수집 |
| 컬렉션·미션 보상 | `ItemBookCompletionResult.rewardBadgeIds` / `MissionCheckResult.awardedBadgeIds` |

응답 형태: `{ id, name, description, imageUrl, rarity, type }[]`
— 소프트 삭제(`deleted_at`) 배지 제외, `image_url` null은 `''`, 0개면 빈 배열.
**PostgREST는 `.in()` 조회 순서를 보장하지 않으므로 수집 순서대로 재정렬**한다(획득 순서 보존).

> **주의 — `badges` 카운터와 `earnedBadges.length`는 서로 다른 집합이다.**
> 기존 `badges` 카운터(`badgesEarned + poiBadgesEarned + rewardBadgesIssued`)에는
> **아이템 드랍 배지와 미션 보상 배지가 포함되지 않는다.** 반면 `earnedBadges`에는 들어간다.
> 반대로 중복 id 제거와 소프트 삭제 제외로 `earnedBadges`가 더 짧아질 수도 있다.
> 두 값을 같은 의미로 쓰면 안 된다.

### 3.8 유지되는 v1 로직

활성 컬렉션 필터(`item_books.is_active`), 유효기간(valid_from/until), `isDroppableForActivity`(monthly_km 등 누적조건 배지 드랍 제외 가드), 인벤토리 슬롯, 섀도우밴, 피드 이벤트.

### 3.9 튜닝 파라미터 (런칭 후 조정 대상)

| 파라미터 | 초기값 | 튜닝 신호 |
|----------|--------|----------|
| 보너스 드랍률 | 15% (고강도 30%) | "2개 잭팟" 체감 빈도 — 잦으면 특별함 소멸 |
| rare+ pity 임계 | 연속 common 5회 | "좋은 게 안 나온다" 불만 시 ↓ |
| 일일 rarity 하향 시작 | 4번째 활동 | 다회 활동 반복으로 rare+ 기대값 상승 시 ↓ |
| 모멘텀/인접/탐험 | 50/25/15(+10) | "같은 것만 나온다" 피드백 시 모멘텀 ↓ |
| 완성 감쇠 계수 | 0.7 | 첫 북 완성까지 기대 드랍 12~18개 목표 |
| 완성 북 잔류 가중치 | 0.3 | 중복 드랍 과다 체감 시 ↓ |
| 마지막 조각 pity | 세계관 내 5드랍 | 완성 직전 이탈률 관찰 |
| 오버라이드 발동률 | 60% | "우연 같은 필연" 체감 유지 |

### 3.10 성공 지표 & 윤리 기준

- **핵심 지표**: D7/D30 리텐션 (v2 코호트 vs v1), 첫 컬렉션 완성 도달률·소요일
- **서사 체감**: 연속 드랍의 동일/인접 세계관 비율 (목표 70%+), 컬렉션 상세 방문율
- **페이싱**: 북 완성 소요 드랍 수 분포 (<8드랍 완성 비율 5% 미만), 마지막 조각 대기 중 이탈률
- **경고 신호**: 짧은 활동 반복 증가(metric gaming), 드랍 없으면 활동 안 하는 비율(motivation crowding) → 맥락 오버라이드 비중 강화로 보상의 정보성 회복
- **윤리**: 미접속 페널티 없음(복귀는 오히려 rare+ 확정) / 인지된 제한 없음(집중은 가중치로만) / 일일 하향이 자연 종료점 제공 / pity·확률 구조는 공개 가능한 수준으로 단순 유지

### 3.11 적용 로드맵

1. **Phase A (스키마)**: `item_books.world_id` + `worlds`/`world_adjacency` 시드(xlsx 원천) + `user_drop_state` + 일련번호 무작위화
2. **Phase B (빈도)**: Layer 1 교체 — 확정 1개 + 보너스 + rare+ pity + 복귀 보너스
3. **Phase C (서사)**: Layer 2·3 — 모멘텀·인접·완성 감쇠·마지막 조각
4. **Phase D (맥락)**: 맥락 오버라이드 — 배지엔진이 이미 쓰는 날씨·시간 데이터 연결

---

### 3.12 앰비언트(시스템) POI 드랍 — 3축(카테고리/등급비율/대상컬렉션) 배치 (재도입 2026-08-26)

> 유저 행동과 무관하게 시스템이 POI에 아이템배지를 직접 배치하는 판정. 2026-08-25에 한 차례
> 전면 제거됐다가([20260825_004](../../Tickets/20260825_004_Feature_앰비언트-드랍-기능-제거.md))
> 2026-08-26에 재설계 재도입됐다([20260826_009](../../Tickets/20260826_009_BadgeEngine_앰비언트-POI-드랍-재도입.md)).
> 코드: `src/lib/ambient-drop/`.

**제거 판단 경위 (오해 방지를 위해 유지)**: 제거 당시 `poi_drops`에 `source='system'` 행이
0건이었던 것은 기능 결함이 아니라 미들웨어가 `/api/cron/*`를 307로 가로채 cron 자체가
실행되지 않았기 때문이었다([20260825_003](../../Tickets/20260825_003_bug_미들웨어가-cron-요청을-차단.md)).
그럼에도 사용자가 관측과 무관하게 쓰지 않기로 결정했었고, 이후 드랍엔진 v2·컨텐츠·POI 체계가
성숙한 만큼 **옛 설계(전역 커버리지 목표치 모델, `ambient_drop_policy`)를 복원하지 않고
배치 실행형으로 새로 설계**했다.

**배치 모델 — 공유 오브젝트, 유저 드랍과 동일 테이블**: `poi_drops`에 `source='system'`,
`dropper_user_id`/`expires_at`은 NULL로 INSERT한다. 여러 유저가 같은 자리를 두고 경쟁하고
먼저 픽업한 사람이 획득하는 것은 유저 드랍과 동일 — `pickup_drop()` RPC를 그대로 재사용한다
(§3.13). **만료 메커니즘 없음** — 상시 존재를 전제로 하며, 특정 배지를 한시적으로만 노출하고
싶으면 `badges.valid_from`/`valid_until`을 쓴다.

**트리거 — 자동(cron) + 수동(어드민), 상호 배제**:
- 자동: `/api/cron/ambient-drop`이 매일 18:00 UTC에 실행되나(Vercel Hobby 플랜 일 1회 cron
  제약으로 시각 고정, `src/lib/ambient-drop/schedule.ts`), `ambient_drop_config.auto_enabled`가
  꺼져 있으면 그 실행은 no-op이다.
- 수동: 어드민 `/admin/ambient-drop`의 "지금 배포" 버튼(`POST /api/admin/ambient-drop/deploy`).
- 상호 배제: `auto_enabled=true`일 때, 고정 스케줄 시각 전후 `exclusion_window_minutes`분
  (어드민 설정값) 동안은 수동 배포를 거부한다(409) — 레이스 컨디션 방지 목적. 이 창 밖에서는
  자유롭게 수동 배포 가능. 서버(API) 레벨에서 강제하고, 어드민 화면 버튼 비활성화는 UX 편의일 뿐.

**배포 옵션 — 3축, 축별 명시/무작위 + 전체 무작위 메타 옵션** (`ambient_drop_config` 싱글톤):

| 축 | 명시 모드 | 무작위 모드 |
|---|---|---|
| 카테고리 | `poi_categories`(13종) 중 하나, 또는 `category_slug=NULL`로 "전체" | 실행 시점에 카테고리 하나를 무작위로 선택 |
| 등급(rarity) 비율 | `rarity_common/rare/epic/mystic`(합=1)로 가중 추첨 | 실행 시점에 4개 등급 비율 자체를 무작위로 생성해 그 실행 전체에 적용 |
| 대상 컬렉션(`item_books`) | 단독 또는 멀티 선택(`collection_ids`), 빈 배열은 "전체 컬렉션" | 실행 시점에 활성 컬렉션 1개를 무작위로 선택 |

`all_random=true`면 저장된 축별 모드와 무관하게 실행 시점에 3축을 전부 무작위로 취급한다
(비파괴적 오버라이드 — 저장값은 그대로 남는다).

**배치 실행 로직** (`runAmbientDropBatch`, `src/lib/ambient-drop/index.ts`):
1. 3축을 확정한다(카테고리 슬러그, 등급 분포, 대상 컬렉션 id 목록).
2. 대상 카테고리의 POI 전체를 조회하고, `max_active_per_poi` 미만인 POI만 후보로 남긴다.
3. `type='item' AND deleted_at IS NULL AND item_book_id IS NOT NULL`(+ 컬렉션 필터, + 유효기간
   `valid_from/valid_until`)로 후보 배지를 rarity별로 분류한다. **컬렉션 소속이 없는 아이템배지는
   대상에서 제외된다** — 이 축이 "컬렉션 채우기"를 돕는 것이 목적이기 때문.
4. `batch_size`회 반복 — 활성 드랍이 0개인 POI를 우선 골라 분산 배치하고(발견 경험 분산, 구
   엔진과 동일 원칙), 등급 분포로 가중 추첨한 뒤 그 등급에 후보가 없으면
   `common → rare → epic → mystic` 순서로 폴백한다(현재 카탈로그가 common뿐이라 사실상
   발동하지 않음 — 티켓 §5).
5. 결과를 `engine_decision_log`(`engine='drop'`, `event='ambient_batch_result'`)에 남긴다 —
   자동/수동 모두 동일하게 기록되어 어드민 화면에서 최근 실행 이력으로 조회 가능하다.

**스킵 사유(`AmbientDropSkipReason`)**: `auto_disabled`(자동 실행 OFF로 no-op) ·
`no_eligible_poi`(대상 카테고리에 배치 가능한 POI 없음) · `no_candidate_badges`(조건에 맞는
후보 배지 없음) · `insert_failed`(배지는 뽑았으나 `poi_drops` INSERT 자체가 실패) —
`engine_decision_log`에 그대로 기록되어 실행 이력에서 원인을 구분할 수 있다.

**PostgREST 1000행 상한 대응**: POI·배지 전체 스캔이 컬렉션 완성 판정 버그(티켓 20260825_029)와
같은 클래스의 상한 문제에 걸릴 수 있어(POI 수천 건, 배지 수천 건), `fetchAllRows`로
`.range()` 페이지네이션한다 — "전체 카테고리"/"전체 컬렉션" 모드에서 조용히 일부만 조회되는
사고를 방지한다.

**교차채널 자동 밸런싱은 범위 밖**: 유저별 컬렉션 보유 현황·아이템배지 발행 현황 등을 근거로
앰비언트 채널과 액티비티 드랍엔진 채널의 희귀도 분포를 자동 조정하는 시스템은 만들지 않았다.
지금은 어드민이 수동 설정한 축 값을 그대로 실행할 뿐이다(향후 계획).

**살아있는 레거시(변경 없이 재사용)**:
- `poi_drops.source` 컬럼 — `assign_random_serial()` 트리거(044)와 `poi_drops_source_consistency`
  CHECK가 참조한다. 제거 기간(2026-08-25~26)에는 전 행이 `'user'`였다.
- `assign_random_serial()`의 50,001~999,999 분기 — `source='system'`일 때만 발동. 재도입으로
  다시 실제로 발동한다(제거 기간에는 항상 거짓이었음).
- `pickup_drop()` RPC — 이번 재도입에서 한 줄도 수정하지 않았다.

**구 `ambient_drop_policy`(마이그레이션 044 생성, 100에서 DROP)와의 차이**: 구 모델은 "활성 POI
수 × 커버리지 비율 → 부족분 보충"이라는 전역 상시 커버리지 목표치 모델이었다. 신규
`ambient_drop_config`(마이그레이션 104)는 실행마다 3축을 골라 `batch_size`개를 그때그때
배치하는 배치 실행형이며, 커버리지 계산이 없다. 구 모델의 마지막 운영값(common 86% /
rare 12% / epic 2%, 커버리지 0.15, POI당 최대 1개, 보충 배치 30개, 최종 수정 2026-07-23)은
`batch_size`/`max_active_per_poi`의 초기값 후보로만 참고했다.

### 3.13 유저 드랍/픽업 운영 정책 (PRD 04_PROJECT_SPEC.md에서 이관, 2026-08-06)

> 4카테고리 문서 체계 재정리 시, `Specs/PRD/04_PROJECT_SPEC.md`의 "핵심 비즈니스 규칙"에 있던 드랍/픽업 판정 로직 4개 항목을 이 문서로 이관했다.

- **드랍/픽업은 Supabase RPC로 처리**: 원자 트랜잭션 필요 — API Route에서 직접 두 테이블 업데이트 금지.
- **자기 드랍 픽업 허용**: 2026-07-10 정책 변경. `dropper_user_id` = 현재 유저 필터링 로직 제거.
- **T2 POI 드랍 반경**: 500m (T1과 동일). `DROP_RADIUS_METERS` 상수로 관리.
- **일련번호 형식**: `serial_prefix`(4자리 대문자) + `serial_number`(6자리 zero-pad). 예: `ABCD000042`. (§3.5의 일련번호 무작위화는 이 형식 위에서 채번 순서만 난수화하는 것으로, 형식 자체는 유지된다.)
- **배지 소프트 삭제 시 미픽업 드랍 즉시 무효화** (2026-08-26/27, 티켓 20260826_016·20260827_004):
  배지가 소프트 삭제(`badges.deleted_at`)되면, 그 배지를 가리키는 아직 안 주워진(`picked_up_at
  IS NULL`) `poi_drops`를 `is_available=false`로 즉시 무효화한다. 이미 픽업된 드랍은 이력
  보존을 위해 건드리지 않는다. 단일 배지 삭제(`api/admin/badges/[id]/route.ts`)와 컬렉션
  비활성화로 인한 연쇄 삭제(`lib/admin/itembook-deactivation.ts`)가 공유 함수
  (`lib/admin/poi-drops.ts`의 `invalidateUnclaimedDrops`)로 동일하게 동작한다. 다른 경로
  (수동 DB 조작 등)로 소프트 삭제된 경우를 위한 안전망으로 `api/cron/poi-cleanup`이 매일
  00:00 UTC에 같은 조건을 재확인해 소각한다.

### 3.14 체크인 배지 타입(`type='checkin'`) — 실데이터 일괄 생성 (2026-07-27)

> 타입 식별자는 2026-08-26(티켓 20260826_004)에 `'poi'` → `'checkin'`으로 개명됐다.
> 아래 본문의 `type='checkin'`은 개명 후 기준이다. 지점 테이블 `poi`는 그대로다.

Phase 16에서 스키마만 추가됐던 `type='checkin'` 배지에 실제 데이터를 채웠다. `poi_categories`의 `transit`(대중교통, 973개), `mountain`(산, 847개) 카테고리 POI 전체(총 1,820개)에 대해 **POI 1개 = 배지 1개**로 1:1 생성했다.

> 2026-08-24 기준 현황: `train_subway`(기차/지하철) 929개, `mountain`(산) 847개는 POI와 배지가
> 1:1로 완전히 일치한다. `transit`(대중교통)에 남은 69개는 출구·노선별 중복·정류장이라 22개만
> 배지가 연결돼 있다.

- **이름**: 배지 이름 = POI 이름 그대로 사용 (동명 POI가 46그룹 존재 — 위치가 다르므로 각각 별도 배지로 생성, 이름 중복 허용).
- **설명**: 자동 생성. mountain → `"{POI명}을(를) 올랐습니다"`, transit → `"{POI명}을(를) 지나갔습니다"` (한글 받침 유무로 을/를 자동 판별).
- **아이콘**: 1,820개 전부 동일 아이콘 사용 — `public/badges/poi/anyway_star.png` (별 모양 "ANYWAY" 로고, 사용자 제공).
- **등급**: 전부 `rarity='common'`.
- **연결**: `poi.linked_badge_id`에 신규 생성된 배지 id를 1:1로 세팅 (다대일 연결 UI는 어드민 `/admin/badges/[id]/poi-links`에서 계속 지원되며, 이번 일괄 생성과는 별개로 이후 개별 POI를 재연결할 수도 있음).
- **반복 획득**: 기존 설계대로 `user_checkin_badge_earns`에 매 통과마다 새 행 적재 (평생 1회 제약 없음).
  **[[20260826_001]]부터 반복 획득(2회차 이상)도 피드·알림에 노출된다** (기존에는 최초 획득만
  피드에 기록되고 반복 획득은 알림에만 고정 문구로 떴다). 문구는 [[20260826_004]]에서
  피드 `'체크인 했어요'` / `'{N}번째 체크인 했어요'`, 알림 `'{지점}에서 {N}번째 체크인 했어요'`로 통일됐다.
  상세 문구·N 산정 기준(badge_id 단위)·묶음 알림 합성 규칙은 `Specs/PRD/Notification/PRD.md` §3 참조.
- **재현용 SQL**: `supabase/seed_poi_badges_20260727.sql` (INSERT/UPDATE 전량 기록, service_role 키로 직접 실행됨).

**POI 매칭 반경 — 카테고리별 기준값 (2026-08-24 기준)**

`src/lib/poi/radius-policy.ts`의 `EXACT_MATCH_RADIUS_BY_CATEGORY`가 최종값을 강제한다
(호출부가 다른 값을 넘겨도 덮어쓴다).

| 카테고리 | 기본 반경 |
|---|---|
| `mountain` (산) | **150m** ← 2026-08-11 50m에서 상향 |
| `train_subway` (기차/지하철) | **50m** ← 2026-08-24 `transit`에서 분리, 같은 값 유지 |
| `transit` (대중교통) | **50m** |
| 기타 카테고리 | POI별 개별 설정 (기본 500m) |

> **분리 배경(2026-08-24, [[20260824_023]])**: `transit`에 지하철·기차역과 버스정류장·출구·
> 자전거대여소가 섞여 있어, 역에만 JAM METRO 디자인 배지를 적용하기 위해 이름이 '역'으로
> 끝나는 929개를 `train_subway`로 분리했다(tier 1 = 역 929개 / tier 2 = 그 외 69개로 경계가
> 정확히 일치). **새 카테고리를 만들 때 이 표에 반경을 등록하지 않으면 기본값 500m가 적용되어
> 2026-08-11 오탐 인시던트가 재발한다.**

> **상향 배경**: 산 정상부는 GPS drift가 크고 단일 좌표(정상)로만 표현되어 루트가 정상 인근을 지나도 50m 반경 안에 들어오지 않는 경우가 많았음. 2026-08-11에 `mountain` 카테고리 847개 POI(`radius_meters=50`)를 150m로 일괄 업데이트. 나머지 6개(이미 500m)는 그대로 유지.

### 3.15 종목별 드랍 가중치 — 걷기 계수 0.4 (2026-08-08)

> 배경: 걷기는 다른 종목 대비 MET(운동강도)가 낮아 활동당 아이템 드랍 기대값을 낮출 필요가 있어 도입. 상세: `Service Plan/Tickets/20260808_001_Content_걷기배지체계-v4-전면개편.md`.

`jam-web/src/lib/drop-engine/constants.ts`에 `ACTIVITY_TYPE_DROP_WEIGHT`(walking: 0.4) + `DEFAULT_ACTIVITY_DROP_WEIGHT`(그 외 1.0) 추가. `getActivityDropWeight(act)`는 걷기이면서 축1 게이트(§2.10)를 통과한 활동에만 0.4를 반환.

- **확정 1개 드랍(§3.1)에는 가중치 미적용** — "활동 1건 = 최소 1개 확정" 원칙은 걷기에도 그대로 유지. 가중치는 `rollBonusDrop(policy, intense, rand, activityWeight=1.0)`의 4번째 파라미터로만 적용되어 **보너스(2번째) 드랍 확률**만 낮춘다. `dropCount = 1 + (rollBonusDrop(...) ? 1 : 0)`에서 `1`은 가중치 무관.
- `activityWeight` 기본값 1.0으로 기존 호출부(걷기 외 종목) 하위호환 유지.
- **DB 스키마 변경 수반**: `user_drop_state.common_streak`(rare+ pity 카운터, §3.6)가 걷기 활동으로 인해 0.4 같은 소수 단위로 증가하게 되어, 기존 INTEGER 컬럼에서는 매 upsert마다 반올림(0.4→0)되어 걷기의 pity 기여가 사라지는 문제가 있었다. `076_walking_badges_v4.sql`과 별도로 `077_common_streak_numeric.sql`에서 `NUMERIC(8,2)`로 확장(TS 타입 `number`는 변경 불필요).

### 3.16 아이템북 완성 판정 — 완성 기준선(분모)은 소프트 삭제와 무관하게 고정 (2026-08-25, 티켓 20260825_025)

> 20260825_024(조사) → 025(결정·구현). 사용자 승인 방향 (a) 채택.

- **정책**: 아이템북 완성 판정의 **분모(북 소속 배지 수)는 소속 배지의 소프트 삭제(`deleted_at`) 여부와
  무관하게 고정된다.** `jam-web/src/lib/itembook/checker.ts`(`badgeCountByBook`)와
  `completable.ts`(`badgeIdsByBook`/`poiBadgeIds`)는 북 소속 배지를 조회할 때 `deleted_at` 필터를
  적용하지 않는다 — `item_book_id` in + `type in ('item','poi')`만으로 집계한다.
- **의미**: 완성 기준선(threshold)은 관리자의 배지 삭제 행위와 무관하게 불변이다. 그 결과 북 소속
  배지 중 일부가 삭제되고 그 배지를 아직 갖지 못한 유저는 해당 북을 **영구히 완성할 수 없다**
  (신규 발급이 막힌 배지이므로) — 이는 이 정책이 감수하는 의도된 트레이드오프다.
- **§2.8/§3.7.1의 "이력 유지" 원칙(20260823_004)과는 구분되는 별도 정책**이다. 004는 유저 개별
  이력(이미 보유한 것)을 삭제 필터로 재해석해 유실시키지 않는다는 원칙이고, 이번 정책은 유저별
  이력이 아니라 **컬렉션 완성 기준선 자체**를 고정하는 것이다.
- **분자·분모 집합 일치**: `checker.ts`의 분자(`slotCountByBook`, `user_item_book_slots` raw row
  count)는 원래 배지의 삭제 여부를 보지 않았다. 분모도 이제 동일하게 삭제 여부를 무시하므로,
  분자·분모가 항상 "북 소속 배지 전체(삭제 포함)"라는 같은 집합을 기준으로 계산된다 — 삭제로 인해
  분모만 줄어 완성으로 오판정되고 보상 배지가 잘못 지급되던 버그(20260825_024에서 발견)도 함께 해소.

### 3.17 POI 활성화 상태(`poi.is_active`)와 판정 로직 연동 (2026-08-30, 티켓 20260830_1620)

> `poi.is_active`는 20260830_1619에서 어드민 전용 노출 토글로 먼저 추가됐고, 이 티켓에서
> 실제 드랍·체크인·매칭 로직에 연동됐다.

- **`false`로 꺼진(운영 종료) POI는 "앞으로의" 신규 판정에서만 제외된다** — 이미 발급된 배지,
  이미 놓인 드랍(유저 드랍·앰비언트 드랍 모두)에는 소급 적용하지 않는다.
- **필터가 적용되는 지점**:
  - `src/lib/poi/matcher.ts`(`matchPoisForActivity`) — 체크인 배지 판정의 유일한 매칭 경로
    (§3.14). 스트라바 싱크는 신규 활동만 재처리하므로 과거 이력에는 영향 없음.
  - `src/app/api/drops/route.ts` GET — 지도·목록 T1 POI 노출, POST — 드랍 생성 시 서버측
    재검증(캐시된 poi_id로 요청해도 `poi_not_found`로 거부).
  - `src/app/api/checkin-badges/route.ts` — 지도의 체크인 배지 마커 노출.
  - `src/lib/ambient-drop/index.ts`(`runAmbientDropBatch`) — 시스템이 새로 배치할 후보 POI.
- **필터를 적용하지 않은 지점(의도적)**:
  - `src/app/api/drops/[dropId]/pickup/route.ts` — **이미 놓인 드랍의 픽업은 "신규 판정"이
    아니라 기존 거래를 완결하는 행위**라 그대로 허용한다. POI가 나중에 비활성화돼도 그 전에
    놓인 드랍이 영구히 못 줍는 상태로 묶이지 않게 하기 위함.
  - `src/lib/notifications/batch/dropSpot.ts`(#18 드랍 지점 알림) — 기존 활성 드랍(`is_available`)
    을 대상으로 하는 열람 알림이라 픽업 정책과 동일하게 유지.
  - `src/app/(main)/badges/page.tsx` 체크인 탭 — 유저가 **이미 획득한** 체크인 배지만 표시하는
    이력 화면이라 무관.
  - `src/app/(main)/badges/[id]/page.tsx`의 **획득 이력**(`earned.poi`/`checkinEarns[i].poi`)도
    이력이라 무관. 단, 같은 파일에서 **미획득** 체크인 배지의 "여기로 가보세요" 안내(`PoiMapButton`)용
    `linked_badge_id` 조회는 필터를 적용한다(운영 종료 지점을 안내하면 안 되므로).
- **유저 노출 정책(지도/목록)**: 완전히 숨김으로 결정. "운영 종료" 배지 표시 등 대안은 채택하지
  않았다 — 스펙 미정 상태에서 가장 단순하고 사고 위험이 적은 기본안을 택함(추후 변경 가능).

## 4. 두 엔진의 게이미피케이션 역할 분담

```
          장기 (mastery)                    단기 (session reward)
  ┌─────────────────────────┐      ┌─────────────────────────────┐
  │ 액티비티배지              │      │ 아이템배지                    │
  │ - 조건 공개, 목표 지향     │      │ - 무엇이 나올지 모름, 서프라이즈 │
  │ - 티어 성장 = 실력 성장    │      │ - 세계관 서사 몰입 + 수집       │
  │ - 발급 = 성취의 인증       │      │ - 컬렉션 완성 = 중기 목표      │
  └─────────────────────────┘      └─────────────────────────────┘
         "내가 해냈다"                     "오늘은 뭐가 나왔지?"
```

- 액티비티배지의 홍수 방지·첫싱크 게이트 = **성취 인플레이션 방지**.
- 아이템배지의 확정 1개 + 변동 희귀도 = **모든 활동에 대한 인정 + 기대감**.
- 두 엔진 모두 활동 자체의 내적 가치를 침식하지 않도록 설계 (informational reward 원칙).

---

## 5. 운영 문서·코드 맵

```
[운영 문서 — 단일 진실 원천]
Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md ← 이 문서. 발급·드랍 로직 전체
Specs/Content/ACTIVITY_BADGES.md          액티비티배지 115종 전체 목록·조건·설명
Specs/Content/ITEMBOOKS.xlsx              아이템배지 ~900종 목록 + '세계관 인접' 시트
Specs/Content/COMBINE_RECIPES.md          조합 레시피 목록
Specs/Content/FACTIONS.md                 세계관 10종 개요·컬렉션 매핑·인접 그래프
Specs/Content/POI.md                      지점(POI) 컨텐츠 (스텁)

[코드]
src/lib/badge-engine/index.ts             액티비티배지 엔진 (구현)
src/lib/drop-engine/index.ts              드랍 엔진 (v1 구현 — v2는 §3 설계)
src/lib/ambient-drop/                     앰비언트(시스템) POI 드랍 엔진 — §3.12
src/lib/strava/sync.ts                    싱크 파이프라인 (두 엔진 호출)
src/lib/abusing/                          섀도우밴 정책 (공용)
supabase/migrations/033_reseed_activity_badges_v3.sql   액티비티배지 시드
supabase/migrations/044_ambient_poi_drop.sql            앰비언트 드랍 최초 스키마 — §3.12
supabase/migrations/100_remove_ambient_drop.sql         앰비언트 드랍 제거(2026-08-25) — §3.12
supabase/migrations/104_ambient_drop_reintroduce.sql    앰비언트 드랍 재도입(2026-08-26) — §3.12
supabase/migrations/076_walking_badges_v4.sql           걷기 신규 배지 32종 — §2.10
supabase/migrations/077_common_streak_numeric.sql       common_streak NUMERIC 확장 — §3.15
```
