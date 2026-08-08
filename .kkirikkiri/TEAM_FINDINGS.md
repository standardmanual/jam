# 발견 사항 & 공유 자료 (walking-badges-v4)

## 2026-08-08 — 메인세션(팀장): 사전 조사 요약
- badge-engine 조건 평가는 jam-web/src/lib/badge-engine/index.ts, 조건 필드는 전부 AND 결합
- 기존 마이그레이션 022/029/030/032/033이 walking 배지(W1~W8) 관련 — 033이 최신 시드
- 드랍엔진은 jam-web/src/lib/drop-engine/{index,layers,context,policy,constants}.ts, activity_type 가중치 없음(이번에 추가 필요)
- badges.condition_json은 jsonb라 신규 조건 필드 추가에 DB 스키마 변경 불필요, 엔진 코드 쪽 조건 평가 로직만 확장하면 됨

---

## 2026-08-08 — dev-core: 구현 완료, tester/docs-writer가 알아야 할 것

### 변경 파일
- `jam-web/src/types/database.ts` — `BadgeCondition`에 `day_of_week`, `active_days_count`, `season_count_all` 추가. `month`를 `number | number[]`로 확장. `DayOfWeek` 타입 신규 export.
- `jam-web/src/lib/badge-engine/index.ts` — 축1 게이트 상수·함수, day_of_week/active_days_count/season_count_all 평가 로직, 하루 1회 상한, `getProgressionKey` 버그 수정(아래 참고).
- `jam-web/src/lib/drop-engine/constants.ts` — `ACTIVITY_TYPE_DROP_WEIGHT`(walking:0.4), `DEFAULT_ACTIVITY_DROP_WEIGHT`.
- `jam-web/src/lib/drop-engine/layers.ts` — `rollBonusDrop(policy, intense, rand, activityWeight=1.0)` 4번째 파라미터 추가.
- `jam-web/src/lib/drop-engine/index.ts` — `getActivityDropWeight()` 신규 export, `tryItemDrop`에서 보너스드랍/common_streak에 가중치 적용.
- `jam-web/supabase/migrations/076_walking_badges_v4.sql` — D01~D11 + 트로피매트릭스 32개 INSERT (아래 "카운트 불일치" 참고).
- `jam-web/supabase/migrations/077_common_streak_numeric.sql` — `user_drop_state.common_streak` INTEGER→NUMERIC(8,2) (아래 참고).

### 신규 조건 필드 타입 시그니처 (BadgeCondition, jam-web/src/types/database.ts)
```ts
export type DayOfWeek = 'sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'
day_of_week?: DayOfWeek | DayOfWeek[]
active_days_count?: number
season_count_all?: number
month?: number | number[]   // 기존 number에서 확장
```

### 축1 게이트 (badge-engine/index.ts 상단, export됨)
```ts
export const WALKING_GATE_MIN_DISTANCE_KM = 0.5
export const WALKING_GATE_MIN_DURATION_MIN = 10
export const WALKING_GATE_MIN_SPEED_KMH = 2.0
export const WALKING_GATE_MAX_SPEED_KMH = 8.0
export function passesWalkingGate(a: NormalizedActivity): boolean
```
걷기가 아니면 항상 true. `evaluateConditionDetailed`의 `filtered` 계산 시점에 `condition.activity_type==='walking'`인 경우에만 적용됨 — 다른 종목 영향 없음 확인됨.

### day_of_week 두 가지 모드 (테스트 시 반드시 구분해서 커버)
1. **단일값** (T05~T07, T09~T11): `time_range`와 동일하게 AND 필터로 `filtered`를 좁힘. `total_count`와 결합 시 걷기는 하루 1회 상한 dedupe 적용.
2. **배열 + total_count 동시 지정** (T08만 해당): "요일별 독립 카운터" 모드. `evaluateConditionDetailed` 안에서 별도 분기 처리 — 배열의 각 요일이 각각 독립적으로 `total_count`를 만족해야 함(5개 카운터 전부 충족). 이 모드에서는 뒤쪽의 일반 `total_count` 블록이 `totalCountHandledByDayOfWeek` 플래그로 스킵됨.

### season_count_all (T15 전용, 신규 필드)
기존 `season`+`season_count`는 단일 계절만 표현 가능해서 "4계절 각각 독립 카운터"를 표현할 방법이 없었음. 배열 구조(`all_of`류) 대신 **새 필드 `season_count_all: number`**를 추가해 "봄/여름/가을/겨울 각각 이 값 이상"으로 해석하도록 절충함 — day_of_week 배열 모드와 대칭되는 설계. condition_json: `{"activity_type":"walking","season_count_all":10}`.

### active_days_count 구현 방식
`filtered`(활동유형+축1게이트 필터링 후)에서 `(startDateLocal ?? startDate).slice(0,10)`으로 날짜키를 만들어 `Set` 크기로 계산. 축1 게이트가 이미 `filtered` 계산 단계에서 적용되므로 "게이트 통과일의 고유일수"가 자동으로 보장됨.

### 하루 1회 상한 적용 범위 (중요 — 전부 걷기 전용)
- `weekly_count`: `weeklyPool`에 `dedupeOnePerDay` 적용 (W3에도 소급 적용됨, 조건값은 안 바꿈).
- `day_of_week`(단일) + `total_count`: `filtered`에 `dedupeOnePerDay` 적용 (T05~T07,T09~T11).
- `day_of_week`(배열) + `total_count`: 요일별 서브풀 각각에 `dedupeOnePerDay` 적용 (T08).
- `streak_days`: **변경 안 함** — 기존 `calcMaxStreak`가 이미 `uniqueDates`로 날짜를 압축해서 계산하므로 원래부터 "하루 1회" 의미가 내재돼 있었음 (W4에 새로 뭔가 적용할 필요 없었음).
- 순수 `total_count`만 있고 `day_of_week`가 없는 경우(T01~T04, T12~T14, T22, T23)는 하루 상한 **미적용** — 스펙상 명시적으로 제외된 케이스(예: T01 "누적 10만 번"은 상한 걸면 사실상 영원히 달성 불가).

### ⚠️ 버그 발견 및 수정 — getProgressionKey 크로스 배지 충돌 (반드시 알아야 함)
기존 `getProgressionKey`(같은 트랙 내 최고값 1개만 발급하는 "진행 트랙" 병합 로직)는 `prerequisite_badge_names` 유무와 무관하게, `activity_type`+`distance_km`(또는 `total_count`) 조합이 같으면 **이름이 다른 배지끼리도 병합**해버렸다.
- T01~T04(전부 `activity_type:walking, total_count`만 사용, 서로 다른 이름)를 그대로 넣으면 넷 다 같은 트랙 키(`walking:total_count`)로 묶여서 값이 낮은 3개가 **조용히 발급 누락**됨 (missed 배열에도 안 잡힘 — 그냥 후보에서 사라짐).
- T23("그냥 나갔다 옴", `distance_km:0.6`)도 W1("동네 산책러", `distance_km` 5~300)과 같은 트랙 키(`walking:distance_km`)로 충돌해서 **항상 묻힘**.
- **수정**: `getProgressionKey`가 `condition.prerequisite_badge_names`가 없거나 빈 배열이면 즉시 `null`(=독립 배지, 병합 안 함) 반환하도록 가드 추가. 트랙 병합은 원래 prerequisite 체인으로 명시 연결된 배지 가족(예: W1 rare~mythic 티어)을 위한 장치였다는 관찰에 기반. 이 수정으로 기존 W1~W8 및 다른 종목 배지들의 실제 동작은 변하지 않음(각 activity_type당 bare-metric 트랙이 원래 1개씩만 존재해서 충돌이 없었음 — 확인 완료).
- 신규 배지(D01~D11, T01~T18/T20/T22/T23) 전부 `prerequisite_badge_names` 없음 → 전부 독립 배지로 동작 확인.
- tester는 이 회귀(T01~T04, T23이 실제로 모두 개별 발급되는지)를 반드시 유닛테스트로 커버해야 함.

### ⚠️ 두 번째 버그 발견 및 수정 — temperature_min_c/max_c + total_count
기존 `matchesPerActivityCondition`/`relevantPerActivityKeys` 로직은 `temperature_min_c`/`temperature_max_c`가 있으면 무조건 "단일 활동 1건이 그 온도를 만족하면 통과"로 취급했다. T12~T14는 온도조건+`total_count`(예: "33도 이상 5회")인데, 이 로직을 그대로 두면 `total_count`가 온도와 무관한 전체 걷기 횟수로 잘못 평가되어 사실상 온도 조건이 유명무실해진다(온도 조건 만족 활동이 1건만 있어도 나머지는 아무 걷기나 채우면 통과).
- **수정**: `condition.total_count`가 있고 `temperature_min_c`/`max_c`가 있으면, `filtered`를 그 온도 조건을 만족하는 활동으로 먼저 좁히고(→ 카운팅 대상 자체를 온도조건으로 필터), `relevantPerActivityKeys`에서는 제외해서 "단일 활동 매칭" 경로로 새지 않도록 분리했다. `time_range`+`total_count`(T09~T11)도 동일 패턴으로 이미 처리돼 있었음(이번에 temperature도 동일하게 맞춤).
- tester는 T12("폭염 속의 걸음", 33도 이상 5회)를 "33도 이상 4회 + 20도 1회"로 구성한 활동 세트로 테스트해서 **실패**하는지(=온도 미달 활동이 total_count를 채우면 안 됨) 반드시 확인.

### 마이그레이션 076 — 카운트 불일치 메모
원 기획 프롬프트는 "D01~D11(11) + 트로피매트릭스(20) = 총 31개"라 했으나, 실제 확정 목록을 세어보면 트로피매트릭스는 T01~T18(18개)+T20+T22+T23(3개)=21개로 합계 32개다. 목록 자체(이름·등급·조건)는 전부 명시돼 있어 그대로 다 반영했다 — "20개"라는 숫자 표기가 오타/오산으로 보임. 마이그레이션 파일 076_walking_badges_v4.sql에는 32개 INSERT가 들어있다. docs-writer는 문서에 "31개"가 아니라 실제 반영된 32개 기준으로 기술할 것.

### image_url placeholder
032~100.png 중 python random(seed 43)으로 뽑은 번호를 하드코딩(`ORDER BY random()` 서브쿼리 대신 — badges 테이블에 image_url 있는 기존 행이 몇 개인지 불확실해서 안전하게 하드코딩 방식 선택). 전부 진짜 자리채움용 placeholder이므로 추후 실제 이미지 교체 필요.

### 드랍엔진 걷기 계수 0.4 — DB 스키마 변경 수반
`common_streak`(rare+ pity 카운터)가 기존 INTEGER였는데, 걷기 활동은 이제 0.4 같은 소수 단위로 증가한다. INTEGER 컬럼에 그대로 넣으면 매 upsert마다 반올림되어(0.4→0) 걷기의 pity 기여가 세션 간 누적되지 못하고 사라지는 문제가 있어 `077_common_streak_numeric.sql`로 `NUMERIC(8,2)`로 넓혔다. `UserDropStateRow.common_streak`의 TS 타입은 원래 `number`라 타입 변경은 불필요.
- 확정 1개 드랍에는 가중치 미적용 — `dropCount = 1 + (rollBonusDrop(...) ? 1 : 0)`에서 `1`은 그대로, `rollBonusDrop`에만 가중치 곱함.
- 가중치는 `getActivityDropWeight(act)`로 계산 — 걷기이면서 `passesWalkingGate(act)`를 통과한 경우만 0.4, 그 외(걷기 아님 또는 게이트 미통과)는 1.0.
- tester는 `rollBonusDrop(policy, intense, rand, 0.4)`가 실제로 낮은 확률을 내는지, `activityWeight=1.0`(기본값) 하위호환이 유지되는지 확인.

---

## 2026-08-08 — docs-writer: PRD/ 경로가 이미 Service Plan/으로 이동되어 있음 (코드-문서 불일치 아님, 지시 문서가 stale)

작업 지시(CLAUDE.md, kkirikkiri 프롬프트)는 `PRD/SERVICE_OPERATIONS.md`, `PRD/badge/` 경로를 전제로 했으나, 실제로는 2026-07-30 커밋 `b936641`(refactor: PRD 폴더를 Service Plan/ 하위로 이동)에서 이미 4카테고리 체계로 재편되어 있었다. 현재 `PRD/` 디렉토리는 git에도 디스크에도 존재하지 않는다(`git ls-files | grep ^PRD` 결과 0건).

**실제 대응 경로**:
- `PRD/SERVICE_OPERATIONS.md` (+ 버전 파일들) → `Service Plan/History/Operations/SERVICE_OPERATIONS.md` — 신규 버전 파일은 이 폴더에 diff 스타일로 계속 쌓는 방식(기존 관례 확인 완료, 최신 파일이 `SERVICE_OPERATIONS_20260801_1153.md`였음). 이번에 `SERVICE_OPERATIONS_20260808_1500.md` 추가.
- `PRD/badge/` (정책·레시피 문서) → 별도 폴더 없이 `Service Plan/Specs/Content/ACTIVITY_BADGES.md`(액티비티배지 전체 목록, 직접 수정 방식) + `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md`(엔진 로직, 직접 수정 방식)로 통합돼 있었음. 두 파일 다 "최종 업데이트" 날짜를 갱신하며 직접 수정하는 관례(신규 파일 추가 방식이 아님) — 이번 작업도 그 관례를 따라 직접 수정.
- 티켓 문서는 `Service Plan/History/Migration/Ticket/`에 계속 쌓는 방식 그대로 유지되고 있었음 — `20260808_001_Content_...` 신규 생성.

세션 시작 시 받은 gitStatus 스냅샷에는 `PRD/badge/BADGE_POLICY_V3.md` 등이 untracked로 표시돼 있었으나, 이는 세션 시작 이전 어느 시점에 로컬에만 존재하던 임시 파일이었고 최신 커밋(`f5f5466`, "Reference 샘플 디자인 자료 및 임시 문서 삭제")과는 무관하게 현재는 디스크에서 사라진 상태 — 참고용으로만 기록.

**팀장/향후 세션에 제안**: `CLAUDE.md`의 "문서 자동 업데이트 규칙"이 `PRD/SERVICE_OPERATIONS.md` 경로를 여전히 참조하고 있어 stale함. `Service Plan/History/Operations/SERVICE_OPERATIONS.md` 경로로 갱신 권장.

---

---

## 2026-08-08 — tester: 회귀 테스트 커버 확인

`jam-web/src/lib/badge-engine/__tests__/walking-badges-v4.test.ts` 작성·실행 완료. dev-core가 위에서 기록한 두 버그 수정 모두 회귀 테스트로 재현·검증됨 — 현재 코드 기준 둘 다 통과(수정이 정상 동작함을 확인, 새로운 버그 아님):
- T01~T04류(activity_type+total_count만 같고 이름 다른 독립 배지 4개)를 evaluateBadgesDetailed로 평가 → 4개 전부 개별 발급, missed에 조용히 사라지지 않음 확인.
- T23/W1류(activity_type+distance_km 트랙 충돌, 서로 무관한 독립 배지) → 둘 다 개별 발급 확인.
- T12류(temperature_min_c+total_count, 온도 미달 활동 1건 포함) → 정확히 fail 확인(온도 미달 활동이 total_count를 채우지 않음).

추가로 발견된 새 버그는 없음. dev-assist가 남긴 "BadgesTable.tsx conditionSummary()가 day_of_week/active_days_count/season_count_all을 칩으로 표시 안 함" 이슈는 UI 표시 문제라 badge-engine 로직 테스트 범위 밖 — 별도 티켓 권장에 동의.

---

# DEAD_ENDS (시도했으나 실패한 접근)

- season_count_all을 `all_of: BadgeCondition[]` 같은 범용 배열 구조로 만들려다가, 기존 season_count/season 필드와 완전히 별개 필드로 병렬 운용하는 게 기존 구조를 덜 건드리고 명확해서 단일 필드(`season_count_all: number`)로 절충함. day_of_week는 반대로 (배열 안의 값이 "요일"이라는 열거형이라 "OR 목록"과 "독립 카운터" 두 모드를 같은 필드에서 구분 가능해서) 배열 오버로드 방식을 그대로 채택함 — 두 필드가 서로 다른 확장 방식을 쓰는 이유.

## 2026-08-08 — dev-assist: docs-writer 참고 사항

- 배지 상세 페이지(`badges/[id]/page.tsx`)의 신규 조건 텍스트 문구(한글):
  - `active_days_count`: "{활동}로 누적 N일 이상 활동"
  - `day_of_week`(단일): "매주 {요일}에 {활동} 활동" (total_count 있으면 별도 문장으로 이어붙음, 예: T05 "매주 일요일에 걷기 활동, 걷기 1000회 이상 완료")
  - `day_of_week`(배열+total_count, T08 전용): "월~금 각 요일마다 {활동} N회씩 완료" (요일배열이 정확히 월~금일 때만 "월~금"으로 축약, 아니면 개별 요일 나열)
  - `season_count_all`: "봄·여름·가을·겨울 각 계절 {활동} N회 이상 완료"
- 어드민 배지 테이블(`BadgesTable.tsx`)의 `conditionSummary()`는 아직 day_of_week/active_days_count/season_count_all을 칩으로 노출하지 않음 — 렌더링은 깨지지 않지만 어드민에서 조건을 한눈에 확인하기 어려움. 후속 작업으로 칩 추가 권장(스코프 밖이라 이번엔 미수정).
