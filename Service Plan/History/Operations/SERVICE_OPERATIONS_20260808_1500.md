# JAM! 서비스 운영 문서 — 변경분 (2026-08-08 15:00)

> **이 버전의 변경 내용:** 걷기 배지 체계 v4 — 축1 게이트(진짜 걷기 판정) 신규 도입, 빈도 조건 하루 1회 상한, 걷기 신규 배지 32종(D01~D11 누적일수 + 트로피 매트릭스 21종) 추가, `day_of_week`/`active_days_count`/`season_count_all` 조건 필드 신규, 드랍엔진 종목별 가중치(걷기 0.4) 도입, 기존 배지 엔진 버그 2건 발견·수정.
> 이전 버전: SERVICE_OPERATIONS_20260801_1153.md

---

## [배경] 걷기 배지 어뷰징 방어 + 진성 유저 대우 문제

기존 걷기 배지(W1~W8, `033_reseed_activity_badges_v3.sql`)는 조건이 거리·시간·빈도 등 순수 누적치라 GPS 스푸핑이나 정지 상태로도 채워질 수 있는 여지가 있었고, 오래 걸어온 진성 유저를 위한 초장기 목표(연 단위 누적일수 등)나 특이 조건(요일·날씨·계절 조합) 배지가 없었다. 이번 작업은 (1) 걷기 활동 판정 자체에 게이트를 씌우고 (2) 그 위에 장기·특이 조건 배지 32종을 신규 추가하는 것으로 대응했다.

## [엔진] 축1 게이트 — "진짜 걷기" 판정

**`jam-web/src/lib/badge-engine/index.ts`**에 걷기 전용 사전 필터를 추가했다. 걷기(`activity_type='walking'`) 조건을 평가하기 전에 아래 기준을 통과한 활동만 대상으로 삼는다. 걷기가 아닌 종목에는 영향 없음(항상 통과).

```ts
export const WALKING_GATE_MIN_DISTANCE_KM = 0.5   // 최소 거리
export const WALKING_GATE_MIN_DURATION_MIN = 10    // 최소 이동시간(분)
export const WALKING_GATE_MIN_SPEED_KMH = 2.0      // 평균속도 하한
export const WALKING_GATE_MAX_SPEED_KMH = 8.0      // 평균속도 상한(러닝과 구분)
export function passesWalkingGate(a: NormalizedActivity): boolean
```

`evaluateConditionDetailed`가 `filtered`(조건 평가 대상 활동 목록)를 만드는 시점에 `condition.activity_type==='walking'`인 경우에만 적용된다. 미통과 활동은 걷기 배지 평가에서 완전히 배제되며, `active_days_count`(아래 참고)도 이 필터링된 목록 기준으로 계산되므로 "게이트 통과일의 고유일수"가 자동 보장된다.

> ⚠️ 위 4개 상수값은 초안이며 튜닝 대상이다. 실제 유저 데이터 관측 후 조정 필요 (하단 "튜닝 필요 파라미터" 참고).

## [엔진] 빈도 조건 하루 1회 상한

걷기 전용으로, `weekly_count`/`day_of_week`+`total_count` 조합에 "하루 최대 1회만 카운트"를 적용했다(`dedupeOnePerDay`).

- `weekly_count`: `weeklyPool`에 적용 → 기존 W3에도 소급 적용(조건값 자체는 변경 없음).
- `day_of_week`(단일값) + `total_count`: `filtered`에 적용 (T05~T07, T09~T11).
- `day_of_week`(배열) + `total_count`: 요일별 서브풀 각각에 적용 (T08).
- `streak_days`(W4)는 기존 `calcMaxStreak`가 이미 `uniqueDates`로 압축 계산해서 원래부터 "하루 1회" 의미가 내재돼 있었으므로 변경 없음.
- 순수 `total_count`만 있고 `day_of_week`가 없는 경우(T01~T04, T12~T14, T22, T23)는 하루 상한 **미적용**(예: T01 "누적 10만 번"에 상한을 걸면 사실상 영원히 달성 불가능해지는 설계 모순이 생김).

## [DB/타입] 신규 조건 필드 3종 + `month` 확장

`badges.condition_json`은 `jsonb`라 스키마 변경 없이 신규 필드를 그대로 저장 가능. 엔진 쪽 타입(`jam-web/src/types/database.ts`)과 평가 로직만 확장했다.

```ts
export type DayOfWeek = 'sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'
day_of_week?: DayOfWeek | DayOfWeek[]   // 단일값=AND필터, 배열+total_count=요일별 독립 카운터 모드
active_days_count?: number              // 축1 게이트 통과일의 누적 고유일수(연속 아님)
season_count_all?: number               // 4계절 각각 이 값 이상(계절별 독립 카운터)
month?: number | number[]               // 기존 number에서 배열도 허용하도록 확장(예: 장마철 6~7월)
```

- `day_of_week` 배열 모드는 T08("평일의 성실함") 전용 — 5개 요일 각각 독립적으로 `total_count`를 만족해야 발급. 일반 `total_count` 평가 블록은 `totalCountHandledByDayOfWeek` 플래그로 스킵됨.
- `season_count_all`은 T15("사계절의 발걸음") 전용. 기존 `season`+`season_count`는 단일 계절만 표현 가능해서 "4계절 각각 독립"을 표현할 새 필드를 별도로 추가(범용 배열 구조 대신 절충 — 상세 이유는 팀 `.kkirikkiri/TEAM_FINDINGS.md`).

## [신규 배지] 걷기 D01~D11 + 트로피 매트릭스 21종 (총 32개)

**마이그레이션**: `jam-web/supabase/migrations/076_walking_badges_v4.sql`

- **D01~D11** (11개, 독립 배지): `active_days_count` 3/7/14/30/60/100/180/365/500/700/1000일 체크포인트. 등급은 common(D01~D04)→rare(D05~D07)→legendary(D08~D09)→mythic(D10~D11).
- **트로피 매트릭스** (21개, 독립 배지): `total_count`(누적 걷기 횟수) 기본형(T01~T04), 요일 조건(T05~T08), 요일+시간대 복합(T09~T11), 온도 조건(T12~T14), 계절 조건(T15~T17), 월별 거리(T18, T20), 단일 활동 조건(T22 지속시간, T23 거리).
  - T19·T21은 설계 단계에서 정합성 문제로 제외 확정(만들지 않음).
- 전부 `prerequisite_badge_names` 없음 → 독립 배지로 동작(성장 티어 dedup·진행 트랙 병합 대상 아님). 기존 W1~W8은 이 마이그레이션에서 이름·설명·조건값 변경 없음 — 축1 게이트 + 하루 1회 상한만 새로 적용됨.
- **카운트 표기 정정**: 원 기획 문서상 "D11+트로피20=31개"로 표기됐으나 실제 확정 목록을 세면 트로피 매트릭스는 T01~T18(18개)+T20+T22+T23(3개)=21개로 합계 32개. 마이그레이션 076에는 실제 확정 목록 기준 32개 INSERT가 들어있다.
- `image_url`은 기존 `jam-web/public/badges/*.png`(100개) 중 랜덤 선정 값을 하드코딩한 placeholder — 추후 실제 이미지로 교체 필요.

## [엔진] 드랍엔진(아이템배지) 걷기 계수 0.4

**변경 파일**: `jam-web/src/lib/drop-engine/constants.ts`, `layers.ts`, `index.ts`

- `ACTIVITY_TYPE_DROP_WEIGHT`(walking: 0.4) + `DEFAULT_ACTIVITY_DROP_WEIGHT` 신규 export. `getActivityDropWeight(act)`가 걷기이면서 축1 게이트를 통과한 활동에만 0.4를 반환, 그 외는 1.0.
- `rollBonusDrop(policy, intense, rand, activityWeight=1.0)` — 4번째 파라미터로 가중치 추가(기본값 1.0으로 하위호환 유지).
- **확정 1개 드랍에는 가중치를 적용하지 않는다** — `dropCount = 1 + (rollBonusDrop(...) ? 1 : 0)`에서 `1`(확정분)은 그대로, `rollBonusDrop`(보너스 2번째 드랍 확률)에만 가중치를 곱함. "활동 1건 = 최소 1개 확정" 원칙(`Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` §3.1)은 걷기에도 그대로 유지된다.

### DB 스키마 변경 수반 — `common_streak` INTEGER → NUMERIC(8,2)

**마이그레이션**: `jam-web/supabase/migrations/077_common_streak_numeric.sql`

`user_drop_state.common_streak`(rare+ pity 카운터)가 기존 INTEGER였는데, 걷기 활동은 이제 0.4 같은 소수 단위로 증가한다. INTEGER 컬럼에 그대로 넣으면 매 upsert마다 반올림되어(0.4→0) 걷기의 pity 기여가 세션 간 누적되지 못하고 사라지므로 `NUMERIC(8,2)`로 컬럼 타입을 넓혔다. `UserDropStateRow.common_streak`의 TS 타입은 원래 `number`라 타입 변경 불필요.

## [버그 수정] getProgressionKey 크로스 배지 충돌

기존 `getProgressionKey`(같은 트랙 내 최고값 1개만 발급하는 "진행 트랙 병합" 로직)는 `prerequisite_badge_names` 유무와 무관하게, `activity_type`+`distance_km`(또는 `total_count`) 조합이 같으면 이름이 다른 배지끼리도 병합해버렸다.

- T01~T04(전부 `activity_type:walking, total_count`만 사용, 서로 다른 이름)를 그대로 넣으면 넷 다 같은 트랙 키(`walking:total_count`)로 묶여서 값이 낮은 3개가 조용히 발급 누락됨(missed 배열에도 안 잡힘 — 후보에서 그냥 사라짐).
- T23("그냥 나갔다 옴", `distance_km:0.6`)도 W1("동네 산책러", `distance_km` 5~300)과 같은 트랙 키(`walking:distance_km`)로 충돌해서 항상 묻힘.

**수정**: `getProgressionKey`가 `condition.prerequisite_badge_names`가 없거나 빈 배열이면 즉시 `null`(=독립 배지, 병합 안 함)을 반환하도록 가드를 추가했다. 트랙 병합은 원래 prerequisite 체인으로 명시 연결된 배지 가족(예: W1 rare~mythic 티어)을 위한 장치였다는 관찰에 기반한 수정. 기존 W1~W8 및 다른 종목 배지들의 실제 동작은 변하지 않는다(각 activity_type당 bare-metric 트랙이 원래 1개씩만 존재해서 충돌이 없었음 — 확인 완료).

## [버그 수정] temperature_min_c/max_c + total_count 조합 누수

기존 `matchesPerActivityCondition`/`relevantPerActivityKeys` 로직은 `temperature_min_c`/`temperature_max_c`가 있으면 무조건 "단일 활동 1건이 그 온도를 만족하면 통과"로 취급했다. T12~T14는 온도조건+`total_count`(예: "33도 이상 5회")인데, 이 로직을 그대로 두면 `total_count`가 온도와 무관한 전체 걷기 횟수로 잘못 평가되어 온도 조건이 유명무실해진다(온도 조건 만족 활동이 1건만 있어도 나머지는 아무 걷기나 채우면 통과됨).

**수정**: `condition.total_count`가 있고 `temperature_min_c`/`max_c`가 있으면, `filtered`를 그 온도 조건을 만족하는 활동으로 먼저 좁히고(카운팅 대상 자체를 온도조건으로 필터), `relevantPerActivityKeys`에서는 제외해서 "단일 활동 매칭" 경로로 새지 않도록 분리했다. `time_range`+`total_count`(T09~T11)도 동일 패턴을 이미 쓰고 있었음(이번에 temperature도 동일하게 맞춤).

## 튜닝 필요 파라미터 (런칭 후 조정 대상)

| 파라미터 | 초기값 | 튜닝 신호 |
|----------|--------|----------|
| 축1 게이트 최소 거리 | 0.5km | 너무 낮으면 정지·짧은 이동도 통과, 너무 높으면 진성 짧은 산책 배제 |
| 축1 게이트 최소 이동시간 | 10분 | 위와 동일 |
| 축1 게이트 평균속도 하한/상한 | 2.0~8.0km/h | 상한을 넘으면 러닝으로 오인 배제될 위험, 하한 미달이면 정지/GPS 노이즈 |
| 드랍엔진 걷기 계수 | 0.4 | 걷기 유저 체감 드랍률이 지나치게 낮아지면 상향 검토 |

## 범위 밖으로 남긴 것 (향후 별도 작업)

- 축1 게이트 상수 4개는 초안값 — 실 유저 GPS/속도 데이터 관측 후 조정 필요.
- 걷기 배지 32종의 `image_url`은 전부 placeholder(랜덤 선정) — 추후 실제 이미지 교체 필요.
- 어드민 배지 목록·`badges/[id]` 상세 화면의 `day_of_week`/`active_days_count`/`season_count_all` 조건 텍스트 포맷터 대응(dev-assist 담당, 별도 확인 필요).

**관련 파일**: `jam-web/src/lib/badge-engine/index.ts`, `jam-web/src/types/database.ts`, `jam-web/src/lib/drop-engine/constants.ts`, `jam-web/src/lib/drop-engine/layers.ts`, `jam-web/src/lib/drop-engine/index.ts`, `jam-web/supabase/migrations/076_walking_badges_v4.sql`(신규), `jam-web/supabase/migrations/077_common_streak_numeric.sql`(신규).
