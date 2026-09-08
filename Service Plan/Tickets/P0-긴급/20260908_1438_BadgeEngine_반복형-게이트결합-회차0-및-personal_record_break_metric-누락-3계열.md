---
id: 20260908_1438
category: BadgeEngine
priority: P0
status: OPEN
created: 2026-09-08
---

# [BadgeEngine] 반복형+게이트 결합 시 회차 영원히 0 (26계열 49종) + personal_record_break_metric 누락 (3계열 24종)

## 배경 / 문제 정의

사용자 요청으로 현재 시딩된 액티비티 배지 633종을 실제 엔진 함수(`conditionRegistry.ts`·
`repeatOccurrences.ts`·`activityFilters.ts`·`crossGate.ts`의 실제 export)로 전수 판정한 결과,
**73개 조건 인스턴스(29계열)가 fail-closed로 영원히 발급되지 않는 상태**임을 확인했다
(2026-09-08 전수 감사). 원인은 서로 다른 두 가지이며 둘 다 **새로 발견된 문제**다(기존
`pending` 필드·존재하지 않는 계열 참조 등 이미 알려진 항목이 아니다).

## 원인 ① — `personal_record_break` + 게이트/기간 필드 결합 시 회차 영원히 0 (26계열 49종)

`repeat_count`가 `streak_days`(기간 단위, `detectPeriodOccurrenceDriver`) 또는 휴식 키
(간격 단위, `detectRestOccurrenceDriver`)와 결합할 때, `repeatOccurrences.ts`의 두 함수가
**"동반 키는 `repeat_count`·`activity_type`·`day_of_week`뿐"** 이라는 `ALLOWED_COMPANIONS`를
엄격히 강제한다(`detectPeriodOccurrenceDriver` 348행, `detectRestOccurrenceDriver` 432행).
그런데 이 목록에 게이트 필드(`cross_in_axis`/`cross_between_axis`/`gate_mission_badge`,
`GATE_CONDITION_KEYS`)가 빠져 있다.

반면 활동 1건 단위 회차 경로(`CONSUMED_REPEAT_KEYS`, 102행)는 `GATE_CONDITION_KEYS`를 이미
포함한다 — **이 비대칭이 원인**이다. 결과적으로 게이트가 걸리는 조건에서 `streak_days`나
휴식 키가 함께 있으면 `detectPeriodOccurrenceDriver`/`detectRestOccurrenceDriver`가
`undefined`를 반환해 기간·휴식 전용 계산으로 넘어가지 못하고, `unconsumedRepeatConditionKeys`가
`streak_days`(또는 휴식 키)를 "회차 술어가 못 다루는 키"로 판정해 **회차가 항상 0으로
fail-closed 처리된다.**

### 실측 재현 (`cycling:N1` "사흘의 바퀴")

```
common(1)/rare(5): { streak_days:3, repeat_count:N }                              → 정상 발급
epic(20):  { streak_days:3, repeat_count:20, cross_between_axis:{...} }           → 회차 0, 막힘
mystic(50):{ streak_days:3, repeat_count:50, cross_between_axis:{...}, gate_mission_badge:{...} } → 막힘
```

같은 계열 안에서 낮은 등급은 정상 발급되고, **게이트가 붙는 상위 등급(주로 Epic·Mystic)만
막히는 패턴**이다 — 도달하기 가장 어려운 상징적 배지들이 이 버그에 걸린다.

### 영향 계열 (26개, 49종)

`cycling:C2/G1/N1/N3/X1`, `hiking:G1/N1/N3/X1`, `running:C2/N1/N3/X1`,
`trail_running:G1/N1/X1`, `walking:A3/A4/A5/P2/R1/R2/R3/S1/S2/W4`

## 원인 ② — `personal_record_break`에 짝 필드 누락 (3계열 24종)

`cycling:R1`(바퀴의 한계)·`running:R1`(발끝의 한계)·`running:R2`(더 빠르게)가
`personal_record_break`만 쓰고 `personal_record_break_metric`이 전혀 없다(DB 실측 확인).
`PAIR_ENFORCED_CONDITION_KEYS` 강제로 각 계열 8레벨(Lv.1~8) 전부 unpaired로 막혀 있다.

```
running:R1 Lv.1~8: { activity_type: "running", personal_record_break: N }  ← metric 없음
running:R2 Lv.1~8: { activity_type: "running", single_distance_km: 5, personal_record_break: N }
cycling:R1 Lv.1~8: { activity_type: "cycling", personal_record_break: N }
```

지난 티켓(`20260908_1318`)에서 채운 4계열(`walking:B3/B4`·`running:R3`·`cycling:R2`)과는
**다른 계열**이라 그때는 범위 밖이었다. `seed_personal_record_break_metric.sql`(티켓
`20260906_2055`)·`seed_personal_record_break_metric_month_avg_families.sql`(티켓
`20260908_1318`) 둘 다 이 3계열을 다루지 않았다.

## 상세 요구사항

### 서비스/코드베이스 관점

**원인 ① 수정 — `repeatOccurrences.ts`**

`detectPeriodOccurrenceDriver`의 `ALLOWED_COMPANIONS`(348행)와 `detectRestOccurrenceDriver`의
`REST_OCCURRENCE_ALLOWED_COMPANIONS`(432행)에 `GATE_CONDITION_KEYS`를 포함하도록 수정한다.
게이트 필드는 "보유 여부"만 확인하는 필터 성격이라 회차 계산 자체에는 관여하지 않으므로
(파일 95행 주석 "게이트는 「보유 여부」라 회차와 층이 다르다"), 회차 드라이버가 게이트 키를
동반 키로 허용해도 회차 집계 의미가 바뀌지 않는다 — `CONSUMED_REPEAT_KEYS`가 이미 같은
전제로 게이트 키를 포함하고 있다.

- `badgeProgress.ts`의 `classifyConditionKind`도 같은 판정 함수(`isPeriodDrivenRepeatCondition`/
  `isRestDrivenRepeatCondition`)를 공유하므로 발급과 진행률이 함께 열리는지 확인
- 회귀 테스트: `{streak_days, repeat_count, cross_between_axis}` / `{streak_days, repeat_count,
  gate_mission_badge}` / 휴식 키 + `repeat_count` + 게이트 조합이 정상적으로 회차를 세는지
- 영향 26계열 49종이 실제로 회차 0에서 벗어나는지 실측 확인(전수 감사 스크립트 재실행 권장)

**원인 ② 수정 — 콘텐츠 마이그레이션**

`cycling:R1`·`running:R1`·`running:R2`(각 8레벨, 24종)에 `personal_record_break_metric`을
채우는 SQL 마이그레이션을 작성한다. 지표 선택 근거는 배지 설명(seed 주석)을 확인해 판단하고,
애매하면 진행을 멈추고 HALT로 보고한다 — `running:R2`는 조건에 `single_distance_km: 5`가
이미 있어 "5km 기록"류로 보이므로 `single_distance_km` 지표가 유력해 보이나, 배지명·설명을
직접 확인해 근거를 남길 것. `cycling:R1`·`running:R1`은 `personal_record_break_metric`
전용 짝 필드 없이 범용 "한계 갱신"류로 보이므로 지난 사례(`walking:B1` 등, 티켓
`20260906_2055`)와 같은 지표 선택 원칙을 따른다.

**SQL 파일은 작성만 하고 실행하지 않는다** — 실행은 4단계(승인 후 오케스트레이터)에서 처리.

## 구현 계획

1. `repeatOccurrences.ts`의 두 `ALLOWED_COMPANIONS` 목록에 `GATE_CONDITION_KEYS` 추가
2. 회귀 테스트 추가(게이트+기간/휴식+반복 조합)
3. `personal_record_break_metric` 시딩 마이그레이션 작성(3계열 24종)
4. `tsc --noEmit`·`vitest run` 전체 통과 확인
5. 가능하면 이전 세션에서 쓴 전수 감사 방식(실제 export 함수 직접 호출)으로 26계열+3계열이
   실제로 막힘에서 벗어났는지 재검증

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

**원인 ①**: `repeatOccurrences.ts`의 `detectPeriodOccurrenceDriver`(`ALLOWED_COMPANIONS`)와
`detectRestOccurrenceDriver`(`REST_OCCURRENCE_ALLOWED_COMPANIONS`)에 `GATE_CONDITION_KEYS`를
동반 키로 추가했다. 게이트 필드는 「보유 여부」만 확인하는 별도 판정(`evaluateBadgeGates`)이라
회차 집계 의미를 바꾸지 않는다. `badgeProgress.ts`의 `classifyConditionKind`는 같은 판정 함수
(`isPeriodDrivenRepeatCondition`/`isRestDrivenRepeatCondition`)를 그대로 공유하므로 별도 수정 없이
발급·진행률이 함께 열린다.

**원인 ②**: `cycling:R1`·`running:R1`(각 「가장 긴 거리 갱신」, walking:B1·trail_running:R1과
문자 그대로 동일한 설명)에 `personal_record_break_metric: 'single_distance_km'`을 채우는 SQL
마이그레이션을 작성했다(실행은 하지 않음). `running:R2`(「5km 이상 활동의 가장 빠른 페이스
갱신」)는 1차 라운드에서 **제외**했었다 — 엔진의 `SUPPORTED_PERSONAL_RECORD_METRICS`(당시
single_distance_km·duration_minutes·max_elevation_m 3종)가 전부 "값이 클수록 갱신"
(`countPersonalRecordBreaks`가 `value > best`만 봄) 방향인데, running:R2가 원하는 건
"페이스가 빠를수록(값이 작을수록) 갱신"이라 방향이 반대여서 표현할 수 없었다.

**2차 라운드 — running:R2 HALT 해소**: `activityFilters.ts`의 `countPersonalRecordBreaks`가
지표별 방향(`PERSONAL_RECORD_METRIC_DIRECTION`, `conditionRegistry.ts`의 `ConditionDirection`
(`'higher'|'lower'`) 관례를 그대로 재사용)을 지원하도록 확장했다 — `higher` 지표는
기존과 동일하게 `best = -Infinity` / `value > best`, `lower` 지표(페이스)는
`best = +Infinity` / `value < best`로 비교한다. `SUPPORTED_PERSONAL_RECORD_METRICS`에
`max_pace_sec_per_km`(방향 `lower`)를 추가하고, `personalRecordMetricValue`에
`kmhToPaceSecPerKm(a.averageSpeedKmh)`(`@/types/strava`, 기존 `repeatOccurrences.ts`·
`index.ts`·`badgeProgress.ts`가 이미 쓰는 것과 같은 변환) 케이스를 추가했다. 기존 3개
지표(`single_distance_km`·`duration_minutes`·`max_elevation_m`, 전부 `higher`)는 분기 로직만
`direction` 변수로 일반화됐을 뿐 비교 방향·초기값이 전과 동일해 회귀가 없다(회귀 테스트로
재확인). `badgeProgress.ts`의 personal_record_break 진행률 계산(약 913행)은 같은
`countPersonalRecordBreaks` 함수를 그대로 호출하므로 별도 수정 없이 방향이 함께 반영된다 —
다만 실측 중 이와는 **무관한 기존 진행률 표시 제약**을 하나 발견했다(아래 alerts 참고).

`running:R2`에 `personal_record_break_metric: 'max_pace_sec_per_km'`을 채우는 SQL을
기존 마이그레이션 파일(`cycling:R1`·`running:R1` 2계열)에 합쳐 3계열 24종 전부를 다루도록
갱신했다(idempotent, 실행은 하지 않음). 조건에 이미 있는 `single_distance_km:5`는 활동 1건
단위 필터("5km 이상만 포함")이고 `personal_record_break_metric`은 그 필터를 통과한 활동들
사이에서 무엇을 기록으로 볼지 지정하는 별도 축이라 서로 충돌하지 않는다(발급 판정 기준).

### 변경된 파일
```
jam-web/src/lib/badge-engine/repeatOccurrences.ts
jam-web/src/lib/badge-engine/activityFilters.ts
jam-web/src/lib/badge-engine/badgeProgress.ts (주석만 — 지원 지표 갱신 반영)
jam-web/src/lib/badge-engine/index.ts (주석·사용자 노출 문구만 — 지원 지표 갱신 반영)
jam-web/src/lib/badge-engine/conditionRegistry.ts (주석만 — 지원 지표 갱신 반영)
jam-web/src/lib/badge-engine/__tests__/repeat-gate-companion.test.ts (신규, 1차 라운드)
jam-web/src/lib/badge-engine/__tests__/personal-record-break.test.ts (회귀 테스트 추가, 2차 라운드)
jam-web/supabase/migrations/seed_personal_record_break_metric_r1_families.sql (2차 라운드에서
  running:R2 포함하도록 갱신, 미실행)
```

### 테스트 결과
- [x] `npx vitest run` 전체 — 69 파일 1195 테스트 통과(1차 라운드 신규 5건 + 2차 라운드 신규 5건)
- [x] `npx tsc --noEmit` — 오류 없음
- [x] `npm run lint` 전체 — 0 errors, 13 warnings(모두 기존 design-system 경고, 이번 변경과 무관)

### 배포 정보
- 배포일: (미배포 — review 브랜치 push까지만)
- 환경: -
- 커밋: (아래 push 브랜치 참고)

### 주요 의사결정 / 핵심 메모
- 원인 ①은 게이트 키를 "활동 1건 단위 회차"(`CONSUMED_REPEAT_KEYS`)와 동일한 원칙으로
  "기간 단위·휴식 단위 회차"에도 동반 키로 허용해 비대칭을 없앴다 — 판정 함수를 공유하는
  `badgeProgress.ts`도 자동으로 함께 열린다.
- 원인 ②는 3계열 전부(24종) 처리 완료됐다. `running:R2`는 1차 라운드 HALT 이후, 엔진에
  지표 방향(higher/lower) 개념을 추가하는 코드 변경으로 해소했다 — `conditionRegistry.ts`에
  이미 있던 `ConditionDirection` 관례를 그대로 재사용해 새 추상화를 만들지 않았다.

### 잔여 이슈
- 없음(원인 ①·② 모두 해결). 진행률 표시 관련 별도 발견 사항은 아래 alerts 참고.
