---
id: 20260906_2055
category: BadgeEngine
status: OPEN
created: 2026-09-06
---

# [BadgeEngine] `personal_record_break` 지표별 평가 로직 구현

> 분리 출처: `20260906_0110` ③(스키마만 열고 평가는 범위 밖으로 남김). 마스터: `20260905_0026`.
> 선행: `20260906_0110`(`personal_record_break_metric` 필드 신설, 마이그레이션 140로 CHECK 반영 완료).

## 배경 / 문제 정의

`0110`이 「어느 지표의 기록인가」를 담는 `personal_record_break_metric` 필드를 스키마에
추가했지만, `personal_record_break` 조건 자체의 **평가 로직은 여전히 `evaluation: 'pending'`**
이다. 그 결과:

- **자동 상승형 14계열이 전부 미발급 상태다.** 조건이 `{personal_record_break: N}` 하나로만
  표현되던 시절의 잔재로, 필드가 생겨도 엔진이 읽지 않으면 배지는 나오지 않는다.
- **지표를 구분하지 못하면 조건이 글자 그대로 같아지는 짝이 7건 있다** —
  `walking:B1`(최장 거리)↔`B2`(최장 시간) · `hiking:R1`↔`R2` · `trail_running:R1`↔`R2`↔`R3` 등.
  `personal_record_break_metric`이 이 짝을 가른다(예: `distance_km` vs `duration_minutes`).

## 상세 요구사항

### 서비스/코드베이스 관점

- `evaluateConditionDetailed`(`badge-engine/index.ts`)에 `personal_record_break` 평가 분기를
  추가한다. 개념: 유저의 **가입 시점 이후** 활동 이력에서 `personal_record_break_metric`이
  가리키는 지표(예: `distance_km`·`duration_minutes`·`elevation_gain_m`·`avg_speed_kmh` 등,
  실제 사용되는 지표 종류는 14계열의 `personal_record_break_metric` 값을 전수 조사해 확정한다)의
  **역대 최고 기록을 이번 활동이 갱신했는가**를 판정한다.
  - 마스터 티켓(`0026`)이 「가입 시점부터 카운트 — 과거 이력 배제」를 원칙으로 못박았다.
    `pr_count`(Strava 전체 이력 기준)를 쓰지 않고 **가입 이후 활동만으로 직접 계산**하는 이유가
    여기 있다 — 이 원칙을 그대로 지킨다.
  - 레벨형(자동 상승) 배지라 「보유 레벨 + 1」 조건을 찾는 기존 엔진 관례(B-1 해소 로직,
    `badge-engine/index.ts`)와 맞물린다 — 매번 새 기록을 세울 때마다 다음 레벨이 열려야 한다.
- **회차 계산과의 상호작용**: `20260906_0110`이 `personal_record_break`를
  `CONSUMED_REPEAT_KEYS`에 넣지 않았다(범위 밖). `repeat_count`와 조합되는 계열이 있는지
  먼저 확인하고, 있다면 이 티켓에서 함께 연다(단, `total_count`로의 무단 치환 금지 원칙은
  계속 지킨다).
- `badgeProgress.ts`의 `classifyConditionKind`도 함께 연다 — `0110`이 "발급이 열리면
  진행률도 같은 뿌리에서 함께 확인해야 한다"고 반복 지적한 패턴이다. 발급만 열고 진행률을
  `unsupported`로 남기면 같은 종류의 어긋남이 재발한다.
- 7건의 동일-조건 짝(`walking:B1`↔`B2` 등)이 `personal_record_break_metric` 값으로 실제로
  갈리는지 DB 조회로 확인하고, 갈리지 않으면(값이 비어있거나 같으면) HALT로 보고한다 —
  콘텐츠 쪽 데이터 보정이 먼저 필요할 수 있다.

### 컨텐츠 관점
- 해당 없음(엔진 로직만). 콘텐츠 쪽 조건값 자체는 이미 시딩돼 있다.

## 구현 계획
1. 14계열의 `condition_json`을 조회해 실제 사용되는 `personal_record_break_metric` 지표
   종류를 전수 확정
2. `evaluateConditionDetailed`에 지표별 최고 기록 판정 로직 추가 (가입 시점 이후 활동만)
3. `badgeProgress.ts`에 대응 진행률 분류 추가
4. 회귀 테스트: 신규 기록 갱신 시 발급되는지, 갱신 아닌 활동은 발급 안 되는지, 지표가 다른
   동일-조건 짝(B1/B2 등)이 서로 간섭하지 않는지
5. 게이트 리뷰 시 프로덕션 14계열의 발급 가능 여부를 실측으로 확인

## 하지 않는 것
- `20260906_0110`의 다른 4개 확장 항목 — 이미 구현·머지 완료
- 27종 신규 배지 행 시딩 — 별도 콘텐츠 작업

---

## 2026-09-06 착수 — HALT (코드 미착수)

구현 계획 1단계(14계열 전수 조사)에서 티켓이 명시한 HALT 조건에 정확히 해당함을 확인해
`evaluateConditionDetailed`/`badgeProgress.ts` 구현에 착수하지 않았다. 게이트 리뷰가 이
판단 자체를 PASS로 검증했다(DB 직접 재조회로 독립 확인).

**실측**: 시딩된 14계열(`walking:B1~B4`·`running:R1~R3`·`cycling:R1~R2`·`hiking:R1~R2`·
`trail_running:R1~R3`) 전부 `personal_record_break_metric`이 **비어 있다.** 마이그레이션
140이 스키마만 열고 콘텐츠 쪽 값 채우기가 함께 이뤄지지 않았다. 그 결과 7쌍의 `condition_json`이
**문자 그대로 완전히 동일**하다 — `walking:B1`↔`B2` · `hiking:R1`↔`R2` ·
`trail_running:R1`↔`R2`↔`R3`. `repeat_count`와의 조합은 0건(§B-10류 우려는 해당 없음).

**선행 조건 — 콘텐츠 작업**: 14계열 각 행에 `personal_record_break_metric` 값을 채우는
UPDATE가 먼저 필요하다. 개선 리뷰가 `Specs/Content/ACTIVITY_BADGES.md`의 배지 설명 문구에서
초안을 뽑아뒀다:

| 계열 | 설명 문구가 암시하는 지표 |
|---|---|
| `walking:B1` | 가장 긴 거리 → `distance_km` 계열 |
| `walking:B2` | 가장 긴 이동시간 → `duration_minutes` 계열 |
| `hiking:R1` | 가장 높은 도달 고도 → `elevation_gain_m` 계열 |
| `hiking:R2` | 가장 긴 이동시간 → `duration_minutes` 계열 |
| `trail_running:R1` | 가장 긴 거리 → `distance_km` 계열 |
| `trail_running:R2` | 가장 높은 도달 고도 → `elevation_gain_m` 계열 |
| `trail_running:R3` | 가장 긴 이동시간 → `duration_minutes` 계열 |

⚠️ **"거리"가 단회 활동(`single_distance_km`) 기준인지 누적(`distance_km`) 기준인지는
문구만으로 확정되지 않는다** — 최종 값은 콘텐츠 담당(사용자) 확인이 필요하다. `walking:B3`·
`B4`·`running:R2`·`R3`·`cycling:R2`(나머지 7계열)는 다른 필드로 이미 형제와 구분되지만
`personal_record_break_metric` 자체는 이들도 비어 있다.

**재개 순서**: ① 위 표를 근거로 사용자가 지표 확정(특히 단회/누적 구분) → ② 14계열
`condition_json`에 `personal_record_break_metric` 값을 채우는 콘텐츠 마이그레이션 →
③ 이 엔진 티켓 재개(`evaluateConditionDetailed`·`badgeProgress.ts`·`conditionRegistry.ts`의
`evaluation: 'pending'→'engine'` 전환).

이 티켓은 재개 대기 상태로 `OPEN` 유지한다(CLOSED 아님 — 작업이 끝난 게 아니라 막힌 것).

## 2026-09-06 선행 조건 해소 — 콘텐츠 값 확정·반영 완료

사용자가 "가장 긴 거리" 계열을 **단회 활동 기준**(`single_distance_km`)으로 확정했다.
`jam-web/supabase/migrations/seed_personal_record_break_metric.sql`로 7계열 56종에 값을 반영:

| 계열 | metric |
|---|---|
| `walking:B1` · `trail_running:R1` | `single_distance_km` |
| `walking:B2` · `hiking:R2` · `trail_running:R3` | `duration_minutes` |
| `hiking:R1` · `trail_running:R2` | `max_elevation_m` (해발고도 — "높은 도달 고도"는 상승량이 아니라 해발고도 개념) |

프로덕션 반영 완료·검증(각 계열 8행 전부 정확한 값). 나머지 7계열(`walking:B3/B4`·
`running:R2/R3`·`cycling:R2`)은 이미 다른 필드로 형제와 구분돼 있어 이번 블로킹 대상이
아니었다 — `personal_record_break_metric` 채움은 재개 시 필요하면 함께 판단한다.

**재개 조건 충족 — 엔진 구현 재착수 가능.**
