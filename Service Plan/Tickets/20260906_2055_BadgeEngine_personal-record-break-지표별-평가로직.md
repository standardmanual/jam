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
