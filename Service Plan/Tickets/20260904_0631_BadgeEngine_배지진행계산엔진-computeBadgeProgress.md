---
id: 20260904_0631
category: BadgeEngine
status: CLOSED
created: 2026-09-04
closed: 2026-09-04
---

# [BadgeEngine] 배지 진행 계산 엔진 — `computeBadgeProgress()`

## 배경 / 문제 정의

티켓 20260903_2329(배지 트리 리뉴얼 1차)는 **진행률·잔여값·병목 축을 전부 화면에서
제외**했다 — 지금 배지 엔진(`evaluateConditionDetailed`/`checkCondition`)은 **통과/탈락만**
판정하고, "몇 % 남았는지" "어느 축이 부족한지"는 계산도 저장도 하지 않는다
(프로토타입 §08 A). 2차(진행 수치 표시)의 첫 단계로 이 계산 모듈부터 만든다 —
화면(2c, 후속 티켓)이 이 함수 없이는 숫자를 하나도 못 그린다.

**선행 티켓 20260904_0430(배지 지표 라벨 테이블)이 이미 끝났다** — 이 티켓은 그 위에
쌓는다. 라벨을 채우는 배치 조회 함수 `getMetricLabels()`(`src/lib/badge-engine/
metricLabels.ts`)가 이미 있다.

**이번 범위에서 절대 건드리지 않는 것**: `evaluateConditionDetailed`·`checkCondition`
(발급 판정 로직, `src/lib/badge-engine/index.ts`)의 판정 결과(pass/fail)는 그대로 둔다.
이 티켓은 그 옆에 **완전히 새로운, 발급에 영향을 주지 않는 순수 계산 함수**를 추가하는
것이다 (2026-08-25 `mission_reward` 사고, 2026-08-31 `same_activity` 회귀 — 모두 "판정
로직에 표시용 관심사가 섞여 들어가서" 난 사고였다는 것이 이 경계의 근거).

## 상세 요구사항 (서비스/코드베이스 관점)

### 위치 및 원칙

- 신규 파일: `src/lib/badge-engine/badgeProgress.ts` (순수 함수 — Supabase/DB import
  금지. `next/headers`를 물지 않으므로 클라이언트에서도 import 가능해야 하고, 그래야
  단위 테스트가 목킹 없이 돈다)
- **재사용 우선 — 같은 필터 규칙을 복제하지 않는다.** `index.ts`의 아래 헬퍼들은
  현재 모듈 프라이빗인데, 이 티켓의 계산이 정확히 같은 규칙(같은 요일 판정, 같은
  걷기 게이트)을 따라야 하는 경우 **로직을 다시 구현하지 말고 `export`만 붙여
  재사용**한다 (동작 변경 없음 — 가시성만 확장):
  - `calcMaxStreak()`(`index.ts:932`) — 이미 export되어 있다. `streak_days` 축에
    그대로 재사용.
  - `matchesDayOfWeek()`(`index.ts:48`, 현재 private) — 요일 판정에 필요하면 export.
  - `passesWalkingGate()`(`index.ts:33`) — 이미 export. 걷기 활동 집계 시 반드시
    먼저 적용(걷기 배지는 이 게이트를 통과한 활동만 대상 — 안 거치면 `active_days_count`
    등의 실측값이 발급 판정의 "실제 통과 대상"과 어긋난다).
  - `index.ts`를 조금이라도 건드리면(`export` 키워드 추가라도) **기존 테스트 5종
    (`src/lib/badge-engine/__tests__/*.test.ts`)이 그대로 통과하는지 반드시 확인**한다.

### B — 유저 지표 집계 (`computeUserPeriodMetrics`)

배지 192개마다 활동 이력을 재순회하지 않도록, (user, activity_type) 하나당 **한 번만**
계산해서 A에 넘기는 중간 집계값. 어떤 필드가 필요한지는 아래 "다섯 유형 분류"에서
각 축이 요구하는 값을 역산해서 정하되(추측하지 말고 `evaluateConditionDetailed`가
실제로 읽는 필드 — `condition-schema.ts`의 `MEASURABLE_CONDITION_KEYS` 17개 — 를
전수 확인), 특히 아래 두 값은 **엔진에 전례가 없는 완전 신규 계산**이라 정확히
명세한다:

- **"이번 주" 카운트 — `weekly_count` 조건의 실측값과 다르다.**
  `index.ts:531-536`의 `weekly_count` 판정은 **이력 전체에서 가장 잘 나온 주
  (`maxWeek`, Monday-key 그룹화 후 최댓값)** 를 기준으로 통과/탈락을 가른다 — "역대
  최고 주"이지 "지금 진행 중인 주"가 아니다. 화면은 반대를 원한다(프로토타입 §05
  "이번 주 4/5회 · 3일 남음" — 지난주 기록은 유저가 더 이상 행동할 수 없어 의미가
  없다). **오늘이 포함된 주(월요일 시작 — `index.ts`의 Monday-key 규칙과 동일 기준)
  하나만 골라 카운트한다.** 미획득 배지는 정의상 "역대 최고 주"도 아직 임계값
  미달이므로, 이번 주 카운트는 그보다 같거나 작다 — 항상 안전한 쪽(과대평가 없음).
- **"이번 달" 누적 거리 — `monthly_km`도 동일하게 "역대 최고 달"이 아니라
  "이번 달(달력 기준 1일~말일)" 로 다시 계산한다.** (`index.ts:552-559` 참고, 같은
  이유로 최댓값이 아니라 현재 달만.)
- `periodEndsAt`(주기형 리셋 시각)은 이 "이번 주/이번 달" 계산과 반드시 같은 경계
  정의를 써야 한다 — 카운트는 월요일 시작 주인데 리셋 시각은 다른 기준으로 계산하면
  "3일 남음"이라고 해놓고 실제로는 5일 남은 것처럼 어긋난다.

그 외 나머지 값(누적 거리·고도, `active_days_count`, 요일별/계절별 카운트 등)은
기존 판정 블록이 이미 계산하는 값과 같은 규칙으로 다시 계산하면 된다 — 다만
**"역대 최고" 냐 "현재" 냐를 축마다 반드시 확인**한다(위 두 사례와 같은 함정이
다른 필드에도 있을 수 있다).

### A — 진행 계산 (`computeBadgeProgress`)

```ts
export type BadgeProgressAxis = {
  key: string                 // 'distance_km' | 'friday' | 'winter' … (badge_metric_labels.metric_key와 동일 네임스페이스)
  label: string                // getMetricLabels() 결과로 채움 — 없으면 key 원문 노출(2a 설계 그대로)
  unit: string | null
  current: number
  target: number
  met: boolean
}

export type BadgeProgress =
  | {
      kind: 'cumulative' | 'record' | 'periodic' | 'dual' | 'multi'
      axes: BadgeProgressAxis[]
      progress: number                 // 0~1 — 축이 여럿이면 평균이 아니라 최솟값
      bottleneck: string                // 가장 뒤처진 축의 key
      sameActivity: boolean             // 축들을 한 활동에서 동시에 채워야 하는가
      periodEndsAt: string | null       // 주기형만 — ISO 문자열, 리셋 시각
      gate: { kind: 'badge' | 'mission'; name: string; href: string; met: boolean } | null
    }
  | { kind: 'unsupported'; conditionKeys: string[] }   // §H, 아래 참고
```

- `gate`는 **1차가 이미 계산한 `BadgeTreeLock`(`badgeTree.ts:100`)을 그대로 매핑**한다
  (`fulfilled` → `met`) — 게이트 판정을 여기서 다시 만들지 않는다. 호출부가
  `BadgeTreeLock[]`을 인자로 넘긴다.
- **라벨 채우기는 이 함수 안에서 하지 않는다.** `computeBadgeProgress` 자체는
  동기·순수 함수로 남기고(그래야 활동 데이터만으로 목킹 없이 단위 테스트 가능),
  `labelMap: Map<string, {label: string; unit: string | null}>` 을 인자로 받아
  채운다. 이 맵은 **호출부(비동기 wrapper)가 한 계열(family)에 필요한 axis key를
  전부 모아 `getMetricLabels()`를 계열당 1회 호출**해서 만든다 — 등급마다,
  배지마다 개별 호출하지 않는다(2a가 이미 배치 조회로 설계해둔 이유와 동일).

#### 다섯 유형 분류 — `condition_json` 필드 조합에서 결정된다 (추측 금지, 아래 근거로 판정)

`evaluateConditionDetailed`(`index.ts:277-593`) 자체 분기를 그대로 근거로 삼는다.
이 함수를 전체 정독한 뒤 아래 매핑이 실제 분기와 일치하는지 검증하고 구현한다:

| 유형 | 판정 근거(코드 위치) | 축 개수 |
|---|---|---|
| **cumulative** | `distance_km`/`elevation_gain_m`이 `same_activity !== true`(기본) — `index.ts:407-424` 누적 합산 블록. 또는 `total_count`·`streak_days`·`active_days_count`·`season_count` 단독 | 1 |
| **record** | `PER_ACTIVITY_KEYS`(`index.ts:115-118`) 중 **정확히 하나**만 있고 `same_activity`·복수 필드 동시 조건 없음 — "이력 전반 최댓값 하나"(`Math.max`) | 1 |
| **periodic** | `weekly_count` 또는 (`month`+`monthly_km`) 존재 — 단, 진행값은 위 B의 "이번 주/이번 달" 신규 계산을 쓴다 | 1 |
| **dual (2축형)** | `relevantPerActivityKeys.length > 1`인 경우(`index.ts:442-446`) — `same_activity:true`(예: 야생의 첫발, 한 활동 동시 충족 → `sameActivity: true`) 또는 서로 다른 두 축이 독립 평가(예: 산악 라이더 = 누적고도 + 최고속도, `requiresSameActivity === false` 분기 → `sameActivity: false`) | 2 |
| **multi (다중 카운터형)** | `Array.isArray(day_of_week) && total_count`(`index.ts:347-372`, 요일별) 또는 `season_count_all`(`index.ts:375-391`, 계절별) | 4~5 |

- **§H — 미지원 조건은 `'unsupported'`를 명시적으로 반환한다.** 위 다섯 분류
  어디에도 안 걸리는 `condition_json` 조합이면 `{kind:'unsupported', conditionKeys:
  Object.keys(condition)}` 을 반환한다 — 억지로 다섯 유형 중 하나에 끼워 맞추지
  않는다(끼워 맞추기가 실패로 이어진 전례: 티켓 20260831_2100). 현재 카탈로그
  192개는 전부 다섯 유형에 들어가야 정상이다 — 만약 정독 결과 안 걸리는 배지가
  있다면 **작업 요약의 `alerts`에 구체적으로 보고**한다(추측으로 넘어가지 않는다).
- **분류 함수는 하나로 통일한다.** 이 분류 로직은 `computeBadgeProgress` 내부에
  묻지 말고 별도로 이름을 가진 함수(예: `classifyBadgeProgressKind(condition):
  BadgeProgress['kind'] | 'unsupported'`)로 분리한다 — 후속 티켓(어드민 `BadgeForm.tsx`
  저장 전 경고, 프로토타입 §08 H)이 발급 로직 없이 이 분류 함수만 재사용해야 하기
  때문이다. 이 티켓에서 그 어드민 경고 UI 자체를 만들지는 않는다 — 분류 함수를
  나중에 그대로 가져다 쓸 수 있는 형태로만 분리해둔다.

## 참고 자료

- 프로토타입: `Service Plan/Assets/20260903_badge-tree-rail-prototype.html` §05(다섯
  유형별 화면 표현 예시 — 천일의 방랑자=누적형, 밤의 보행자=기록형, 이달의
  산책왕=주기형, 산악 라이더=2축형(각각), 야생의 첫발=2축형(동시), 평일의
  성실함=다중카운터), §08 A·B·H
- 선행 티켓: 20260903_2329(1차 구조), 20260904_0430(라벨 테이블, 이 티켓의 직접 선행)
- 발급 판정 원본: `jam-web/src/lib/badge-engine/index.ts`(특히 277-593행), 조건 필드
  계약: `jam-web/src/lib/badge-engine/condition-schema.ts`
- 게이트 타입: `jam-web/src/lib/badgeTree.ts:100`(`BadgeTreeLock`)
- 라벨 조회: `jam-web/src/lib/badge-engine/metricLabels.ts`(`getMetricLabels`, 2a 산출물)
- `BADGE_ENGINE_UNIFIED.md`(`Service Plan/Specs/BadgeEngine/`) — 이 티켓이 추가하는
  순수 계산 계층을 발급 판정 문서와 어떻게 구분해 기술할지 대조(엔진 유형 필수 절차)

## 구현 계획

1. `evaluateConditionDetailed` 전체 정독 — 위 "다섯 유형 분류" 표를 실제 분기와
   대조 검증(불일치 발견 시 표가 아니라 코드가 정답 — alerts에 보고)
2. `computeUserPeriodMetrics()` 작성 — B, "이번 주/이번 달" 신규 계산 포함
3. `classifyBadgeProgressKind()` + `computeBadgeProgress()` 작성 — A, 유형별 axes 계산
4. 단위 테스트 — 다섯 유형 각각 최소 1건 + `'unsupported'` 케이스. 프로토타입 §05가
   제시한 예시(천일의 방랑자·밤의 보행자·이달의 산책왕·산악 라이더·야생의
   첫발·평일의 성실함)를 픽스처로 재사용하면 설계 의도와 테스트가 어긋나지 않는다
5. 기존 배지 엔진 테스트 5종 그대로 통과 확인(`index.ts`를 조금이라도 건드렸다면 필수)

---
## 완료 기록

### 구현 내용 요약
- `src/lib/badge-engine/badgeProgress.ts`(신규) — 순수 함수 3종: `computeUserPeriodMetrics()`
  (B, "이번 주/이번 달" 신규 집계), `classifyBadgeProgressKind()`(다섯 유형 분류, 단독 재사용
  가능하도록 분리), `computeBadgeProgress()`(A, 최종 조립 — 라벨은 `labelMap` 인자로만 주입).
- 단위 테스트 40건(다섯 유형 각 1건 이상 + unsupported + classify 단독 16건) — 기존 5종(92건)과
  합쳐 132건 전부 통과.
- **실제 프로덕션 카탈로그로 분류 정확성 실측**: `condition_json`이 있는 배지 207건 중 192건이
  정확히 다섯 유형(주기 54·누적 70·기록 46·다중 2·2축 20)으로 분류되고, 나머지 15건
  (`mission_reward` 배지)만 의도대로 `unsupported`로 분리됨을 게이트 리뷰가 직접 조회해 확인.
- 발급 판정(`evaluateConditionDetailed`/`checkCondition`)은 한 줄도 수정하지 않음.

### 1차 시도 FAIL → 재시도
게이트 리뷰 1차 시도에서 **FAIL**. `badgeProgress.ts`가 `index.ts`의 프라이빗 헬퍼(`matchesDayOfWeek`
등)를 export만 붙여 재사용했는데, `index.ts`가 최상단에서 `@/lib/supabase/server`(→
`next/headers`)를 무조건 import해서 `badgeProgress.ts`가 그 의존을 전이받았다 — 클라이언트
컴포넌트에서 import하면 `next build`가 100% 실패하는, 티켓 자체의 "클라이언트에서도 import
가능해야" 요구와 정면 충돌. 게이트 리뷰어가 `'use client'` 프로브 페이지 + `npm run build`로
실패를 직접 재현해 확인했다. **원인은 티켓 작성 단계의 판단 누락**(index.ts의 top-level import를
읽고도 두 요구사항의 충돌을 못 짚음)이었다.

재시도에서 `matchesDayOfWeek`·`inTimeRange`·`dedupeOnePerDay`·`getMondayKey`·`calcMaxStreak`·
`passesWalkingGate`(+걷기 게이트 상수 4개)를 `index.ts`에서 완전히 빼내 의존성 0인 신규 파일
`activityFilters.ts`로 옮기고, `index.ts`는 그 이름들을 재export하는 방식으로 수정. 게이트
리뷰어가 (a) 되돌린 상태로 동일 실패를 재현, (b) 현재 상태로 `next build` 성공을 재현, (c) 이동된
함수 본문을 바이트 단위로 원본과 대조하는 3단계 검증 후 **PASS**. 이 실패 유형은 하루 전 티켓
20260903_2329의 `badgeTreeConditionStatus.ts`/`.server.ts` 분리와 동일 패턴이었다.

### 게이트 PASS 후 반영한 수정
개선 리뷰가 `buildRecordAxis`의 필드 탐지 배열이 `SCALAR_AXIS_KEYS`를 손으로 다시 나열한
부분집합이라 향후 축 추가 시 두 목록이 어긋날 수 있다고 지적 — 머지 전 `SCALAR_AXIS_KEYS.filter()`
로 파생하도록 수정(커밋 `e150f0fe`). 로직 변경 없음, 132건 테스트 재확인.

### 변경된 파일
```
jam-web/src/lib/badge-engine/badgeProgress.ts (신규)
jam-web/src/lib/badge-engine/activityFilters.ts (신규)
jam-web/src/lib/badge-engine/__tests__/badgeProgress.test.ts (신규)
jam-web/src/lib/badge-engine/index.ts (수정 — 헬퍼 6개+상수 4개를 activityFilters.ts로 이전 후 재export)
```

### 테스트 결과
- [x] `npx vitest run src/lib/badge-engine/__tests__/` — 132/132 통과
- [x] `npm test`(전체) — 561/561 통과 (design-system 스토리 파일 40건의 "No test suite found"는
      이번 변경과 무관한 사전 존재 리포팅 이슈, 아래 잔여 이슈 참고)
- [x] `npx tsc --noEmit` — 오류 0건
- [x] `npm run lint`(전체) — 0 errors, 13 warnings(전부 무관 기존 파일)
- [x] 클라이언트 경계 실증: `'use client'` 프로브 페이지 + `npm run build` → exit 0 (실패 상태로
      되돌려 동일 에러 재현도 확인)
- [x] 실 프로덕션 카탈로그 207건 대조 — 192건 다섯 유형 정확 분류, 15건만 unsupported

### 배포 정보
- staging 병합: 2026-09-04, 커밋 `e150f0fe`(fast-forward)
- DB 변경 없음 — 순수 계산 로직만 추가
- 코드 배포: staging 병합 시점에 Vercel 재빌드. 이 계층을 실제로 호출하는 화면은 아직 없음(2c 대기)

### 주요 의사결정 / 핵심 메모
- **다섯 유형 분류 구현 방식이 티켓의 코드 인용과 다르다.** 티켓은 2축형 근거로
  `relevantPerActivityKeys.length > 1`(index.ts:442-446)을 들었으나, 게이트 리뷰가 확인한 바
  `elevation_gain_m`은 `same_activity` 없이는 그 배열에 전혀 들어가지 않는다(별도의 무조건
  누적 블록에서 처리됨) — 산악 라이더류는 실제로는 "누적 블록 + 독립기록 블록" 조합이다.
  개발자가 `relevantPerActivityKeys`를 재현하지 않고 필드 조합을 직접 검사하는 `classifyBadgeProgressKind`
  로 구현해 결과적으로 올바르게 분류했고, 카탈로그 192개 전수 대조로 검증됨. 티켓 인용이
  부정확했을 뿐 구현은 정확하다.
- **T23("그냥 나갔다 옴", `distance_km` 단독+`same_activity:true`)는 티켓의 cumulative/record
  정의 문자 그대로는 안 걸림** — 엔진의 실제 동작(단일 활동 최댓값 비교)을 근거로 'record'로
  분류. 단위 테스트로 검증.
- **월 제한 주기형**(`month:1` 등)의 "이번 달이 대상 아닐 때" 표시는 티켓에 명시 없어 직접
  정함 — current=0, `periodEndsAt`은 항상 "다음 달 1일". 2c에서 이 배지들의 표시 방식(주기형
  프레이밍 유지 여부) 기획 확인 필요.
- **`gate`는 `BadgeTreeLock[]`(복수)을 단일 객체로 축약** — 하나라도 충족했으면 그 락을, 전부
  미충족이면 첫 번째를 대표로 노출. 2c가 이미지 등 원본 배열 정보가 필요하면 `BadgeTreeLock[]`을
  별도로 계속 참조해야 함(gate에는 `imageUrl` 없음).
- **`temperature_max_c` 기록형 축의 progress 계산에 코스메틱 상수(`COLD_PROGRESS_BASELINE_C=35`)
  도입** — 음수 임계값 때문에 단순 비율식이 안 돼서 만든 진행률 바 채움 비율 전용 기준점.
  `met`/`current`/`target`(발급 판정과 동일 기준)에는 무관.

### 잔여 이슈 (2c 착수 전 참고)
- 배지별 try/catch 방어막 — `computeBadgeProgress`의 내부 `throw`가 호출부에서 안 걸리면
  배지 하나의 조건 이상이 레일 전체를 죽일 수 있음.
- 실유저 데이터로 "진행률 vs 실제 발급 여부" 교차 확인 — 지금은 합성 픽스처로만 검증됨.
- `getMondayKey`(기존 코드) 타임존 버그, `today-calendar.test.ts` 미실행 문제 — 범위 밖
  발견물로 별도 작업 분리(오케스트레이터가 이 완료 기록 직후 처리).
