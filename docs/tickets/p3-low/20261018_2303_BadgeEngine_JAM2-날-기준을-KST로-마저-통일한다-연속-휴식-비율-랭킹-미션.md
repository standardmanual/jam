---
id: "20261018_2303"
category: BadgeEngine
priority: P3
status: OPEN
created: 2026-10-18
parent: "20261018_1815"
specs:
  - "docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md"
  - "docs/service/badge-engine/CONDITION_JSON_SPEC.md"
---

# [BadgeEngine] JAM2 날 기준을 KST로 마저 통일한다 (연속·휴식·비율·랭킹·미션)

## 핵심 요약

- 진행 메모 (2026-10-19 사용자 결정): 묶음 5의 5-2(티켓 `20261019_1312`)에서 랭킹 `total_count`의 단위를 뺀 나머지를 함께 처리한다. 랭킹 `total_count` 단위(활동 건수 대 활동일 수)는 랭킹이 2.0에서 어떻게 쓰이는지 확인한 뒤 정해야 하므로 이 티켓은 5-2가 끝나도 OPEN으로 둔다.
- 진행 기록 (2026-10-19, 5-2 2회): 아래 목록 가운데 `activityFilters.ts`(연속·연속 주·휴식 공백·전월 대비 배수), `index.ts`·`badgeProgress.ts`(활동일 `active_days_count`), `repeatOccurrences.ts`(회차의 일·주 키), `missions/engineCondition.ts`(주·달·요일 개수)를 KST 날짜로 바꿨고 해외 활동 경계 시험과 한국 활동 회귀 시험을 더했다. 랭킹의 활동일(`active_days_count`)과 연속(`streak_days`)도 같은 KST 날짜를 쓴다(`lib/ranking/metricValues.ts`의 활동일 키 한 줄). **남은 일: 랭킹 `total_count`(`metricValues.ts`의 `computeActivityMetricValue`, 활동 건수)의 단위 하나뿐이다.** 명세의 날 기준 ⚠️ 표기는 지웠다.
- 요구사항: 4-4 1회가 시간대·요일·월·계절·횟수 5종을 한국 시각(KST) 날로 바꿨지만, 아래는 아직 활동 지역의 현지 날(`startDateLocal`)을 쓴다. 해외에서 한 활동에서만 같은 활동이 어떤 조건에서는 KST 날, 어떤 조건에서는 현지 날로 갈린다. 스펙은 «시간대와 날짜는 한국 시각으로 판정한다. 해외에서 한 활동도 한국 시각으로 본다»이다.
- 구현 계획: 아래 목록을 `timeBands.ts`의 KST 헬퍼로 바꾸고 시험의 시각 입력을 맞춘다. 마이그레이션은 없다.
- 관련 파일(2026-10-18 4-4 1회 게이트 지적): `jam-web/src/lib/badge-engine/activityFilters.ts` 148·159·193·399·724·725줄 근처(`calcMaxStreak`, `getMondayKey`, 휴식·연속·`active_days_count`, `monthKeyOf`), `lib/badge-engine/repeatOccurrences.ts` 196줄 근처(`weekKeyOf`), `lib/ranking/metricValues.ts` 87줄(랭킹 `total_count`가 활동 건수를 세는데 배지 `total_count`는 이제 활동일 수라 어긋남), `lib/missions/engineCondition.ts`(`countDistinctWeekdays`·`monthOrdinal`·`weekOrdinal`이 현지 기준이라 한 미션 안에서 시간대·요일만 KST).

## 배경 / 문제 정의

4-4 1회는 사용자 결정 1·2(시간대 상수 하나와 KST, 횟수 5종을 날 수로)만 구현했다. 연속·휴식·활동일 계열과 미션·랭킹은 범위 밖이라 두었고 명세(CONDITION_JSON_SPEC)에 ⚠️로 표기했다. 한국에서 한 활동은 어긋나지 않고 해외 활동에서만 생긴다.

## 완료 조건

- 위 목록이 KST 날 기준이다. 랭킹 `total_count`는 배지와 같은 단위(활동일 수)를 쓰거나, 쓰지 않기로 하면 그 근거를 주석에 적는다(랭킹이 2.0에서 어떻게 쓰일지 먼저 확인한다).
- 해외 활동(현지 날과 KST 날이 갈리는 시각) 경계 시험이 있다. 명세의 ⚠️ 표기를 지운다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
