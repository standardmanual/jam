---
id: 20260908_1512
category: BadgeEngine
priority: P1
status: CLOSED
created: 2026-09-08
closed: 2026-09-08
---

# [BadgeEngine] running:R2 발급 로직이 스펙과 다르게 동작 + 진행률 표시 unsupported

## 배경 / 문제 정의
> 분리 출처: `20260908_1438`(반복형+게이트결합 회차0 및 personal_record_break_metric 누락 수정)
> 게이트 리뷰 alerts. 최초에는 진행률 표시 문제로만 접수됐으나, 착수 중 **더 근본적인 발급
> 로직 스펙 불일치**를 발견해 범위를 확장한다(2026-09-08, 사용자 확정: 코드를 스펙에 맞춘다).

### 원인 ① (신규 발견, 우선 해결) — 발급 로직이 컨텐츠 스펙과 다르게 동작한다

`Specs/Content/ACTIVITY_BADGES.md`(572행)는 `running:R2`("더 빠르게")를
**"5km 이상 활동의 가장 빠른 페이스 갱신"**으로 정의한다. 실제 조건은
`{ activity_type: "running", single_distance_km: 5, personal_record_break: N,
personal_record_break_metric: 'max_pace_sec_per_km' }`.

`index.ts`의 실제 동작(오케스트레이터가 origin/staging 코드로 직접 확인, 개발자·게이트
리뷰어도 독립적으로 재확인):

1. `single_distance_km: 5`는 "이력 전반 독립 평가" 경로([index.ts:609-620](jam-web/src/lib/badge-engine/index.ts:609))를 타서
   `filtered.some(a => matchesPerActivityCondition({single_distance_km:5}, a))`로 **"5km 이상
   활동이 하나라도 있는가"만 확인**하고, **`filtered` 변수 자체는 갱신하지 않는다.**
2. 뒤이은 `personal_record_break` 평가 블록([index.ts:805-828](jam-web/src/lib/badge-engine/index.ts:805))은 이 안 좁혀진
   `filtered`(활동 종목 필터만 걸린 러닝 전체 이력)를 그대로 `countPersonalRecordBreaks`에
   넘긴다.

결과: 실제 발급 조건은 「① 러닝 이력에 5km 이상 활동이 최소 1번 있어야 함」 + 「② **거리와
무관하게** 러닝 전체 이력에서 페이스 신기록을 N번 세움」이라는, 스펙 의도와 다른 두 조건의
AND다. 200m 전력질주로 페이스 신기록을 세워도 카운트되는 등 스펙과 어긋난다.

**사용자 영향**: `running:R2`의 `personal_record_break_metric`이 이번 세션(`20260908_1438`)에서
막 채워져 오늘까지 fail-closed로 막혀 있었고 아직 프로덕션에 반영되지 않았다 — **실제 발급
이력 0건**이라 지금 고쳐도 회귀 위험이 없다.

### 원인 ② — 진행률 표시가 unsupported로 뜬다

원인 ①이 고쳐지지 않은 현재 상태 기준으로, `single_distance_km`이 `conditionAxes.ts`의
`SCALAR_AXIS_KEYS`(측정 축)에도 속해 있는데 `personal_record_break`(`COUNTER_AXIS_KEYS`)와
함께 있으면 `classifyConditionKind`의 `axisCount` 계산이 축을 2개로 세면서
`scalarKeys.length`도 기대와 어긋나 `unsupported`로 떨어진다(`badgeProgress.ts` 518~634행
부근). `cycling:R1`·`running:R1`은 이 필터(`single_distance_km`)가 조건에 없어 정상적으로
`cumulative`로 분류되므로 영향받지 않는다 — `running:R2`에만 해당하는 문제다.

## 상세 요구사항

### 서비스/코드베이스 관점

**원인 ① 수정 — `index.ts`를 스펙에 맞춘다**

`single_distance_km`(및 `PER_ACTIVITY_KEYS` 중 함께 오는 필드)이 `personal_record_break`와
결합할 때는 "존재 여부 확인용 필터"가 아니라 **"그 필터를 통과한 활동만 개인기록 후보로
좁히는 필터"** 로 동작해야 한다 — `countPersonalRecordBreaks`에 넘기는 `filtered`를 실제로
좁힌다. 다른 종류의 `personal_record_break` 조합(필터 없는 단독 계열)에는 영향이 없어야
한다. `evaluateRestConditions`/`repeatConsumedAxisKeys`가 이미 "이 필드는 술어가 실제로
읽어서 흡수한다"는 같은 패턴을 구현해뒀으니 참고할 것.

**원인 ② 수정 — `badgeProgress.ts`의 `classifyConditionKind`**

원인 ①의 최종 흡수 방식과 **정확히 일치하는** 흡수 목록으로 진행률 축 계산을 맞춘다 —
발급 판정과 진행률 계산이 다른 기준을 쓰면 "화면은 진행 중인데 발급은 다른 기준" 어긋남이
재발한다. `repeat_count` 분기(561~579행)가 `repeatConsumedAxisKeys()`로 구현한 것과 같은
패턴을 참고한다.

- 예외 처리가 다른 계열(다른 `personal_record_break` + 필터 조합)에 영향을 주는지 전수 확인
  (오케스트레이터가 이미 DB 전수 확인함 — `single_distance_km`이 `personal_record_break`와
  함께 있는 건 `running:R2`뿐)
- 회귀 테스트: (a) `running:R2` 조건에서 5km 미만 활동의 페이스 신기록은 카운트되지 않고
  5km 이상 활동만 카운트되는지(원인①), (b) 진행률이 `unsupported`가 아닌 적절한 kind로
  분류되는지(원인②), (c) 기존 `personal_record_break` 단독 계열(필터 없는 것들)의 발급·
  진행률 분류가 이번 변경으로 바뀌지 않는지

### 컨텐츠 관점

원인 ①을 코드로 해결하기로 확정했으므로 `Specs/Content/ACTIVITY_BADGES.md` 문구는 그대로
둔다(코드가 스펙을 따라간다).

## 구현 계획
- DB 마이그레이션 불필요 — 이미 `20260908_1438`에서 `personal_record_break_metric` 시딩
  완료. 아직 프로덕션 미배포라 회귀 위험 없음(실제 발급 이력 0건).
- 원인① → 원인② 순서로 구현하고, 최종적으로 두 로직이 "무엇을 필터로 흡수하는가"에 대해
  같은 답을 내는지 반드시 대조한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
원인①·②를 「흡수 목록 단일 출처」 패턴으로 함께 해결했다. `repeatOccurrences.ts`에
`personalRecordBreakConsumedAxisKeys(condition)`(personal_record_break가 흡수하는
PER_ACTIVITY_KEYS 필터 키 목록)와 `personalRecordBreakPool(condition, activities)`
(그 흡수 키로 실제로 좁힌 활동 풀 — 흡수할 필터가 없으면 원본 그대로 반환)를 신설해
발급 판정(`index.ts`)과 진행 계산(`badgeProgress.ts`)이 **같은 함수**를 보게 했다
(`repeatConsumedAxisKeys`가 회차에 대해 이미 구현한 것과 동일한 패턴).

- **원인①(index.ts)**: `personal_record_break` 블록이 `countPersonalRecordBreaks`에
  넘기던 `filtered`(안 좁혀진 러닝 전체 이력)를 `personalRecordBreakPool(condition, filtered)`
  로 교체 — `single_distance_km:5` 같은 필터가 있으면 그 필터를 통과한 활동만 개인기록
  후보로 좁힌다. 필터가 없는 단독 계열(cycling:R1·running:R1·hiking:R1/R2·
  trail_running:R1/R2/R3·walking:B1/B2)은 `personalRecordBreakPool`이 빈 흡수 목록에
  대해 원본을 그대로 반환하므로 기존 동작이 완전히 보존된다.
- **원인②(badgeProgress.ts)**: `classifyConditionKind`의 `scalarKeys` 계산에서
  `personalRecordBreakConsumedAxisKeys(condition)`로 흡수되는 축(예: `single_distance_km`)을
  제외해 `axisCount`가 2가 아닌 1로 계산되게 했다 — `isCounterAlone`만 남아 `cumulative`로
  분류된다. 부수적으로 `buildCumulativeAxis`의 `personal_record_break` 블록도 동일한
  버그(안 좁혀진 `metrics.activities`를 그대로 씀)를 갖고 있어(코드 탐색 중 추가 발견)
  같은 `personalRecordBreakPool`로 함께 고쳤다 — 그렇지 않으면 발급은 옳게 세도
  화면 진행률 숫자가 다시 어긋난다.

### 변경된 파일
```
jam-web/src/lib/badge-engine/repeatOccurrences.ts     — personalRecordBreakConsumedAxisKeys·personalRecordBreakPool 신설
jam-web/src/lib/badge-engine/index.ts                  — personal_record_break 블록이 좁힌 풀 사용(원인①)
jam-web/src/lib/badge-engine/badgeProgress.ts           — classifyConditionKind scalarKeys 흡수 제외(원인②) + buildCumulativeAxis도 좁힌 풀 사용
jam-web/src/lib/badge-engine/__tests__/personal-record-break.test.ts — 기존 "unsupported가 맞다"로 박제된 테스트를 정정 + 5km 미만 활동 배제 회귀 테스트 3건 추가
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 에러 0건
- [x] `npx vitest run` — 69 files / 1198 tests 전부 통과 (기존 personal-record-break.test.ts의
      "실콘텐츠 형태는 axisCount 충돌로 unsupported다 — 회귀 아님" 테스트 1건이 이번 수정으로
      기대값이 바뀌어 실패했으나, 그 테스트 자체가 이번 티켓이 고치는 버그를 "범위 밖"이라고
      박제해둔 것이었으므로 기대값을 `cumulative`로 정정하고 신규 회귀 테스트 3건 추가)
- [x] `npm run lint` — 0 error, 13 warning(전부 design-system 기존 경고, 이번 변경 파일과 무관)

### 배포 정보
- 배포일: 2026-09-08 (staging)
- 환경: staging → production은 `/jam-ship`으로 별도 진행
- 커밋: `ef32ecd7` staging에 fast-forward 병합

### 게이트 리뷰 PASS — staging 병합·문서 동기화 완료 (2026-09-08)

conservative-reviewer가 격리 워크트리에서 재검증(`vitest` 전체 69파일 1198건, `tsc --noEmit`
0건, `lint` 0 errors + 5km 미만 활동 배제 회귀 테스트 직접 실행)해 PASS 판정. DB 마이그레이션
불필요(순수 로직 수정), 아직 프로덕션 미배포라 회귀 위험 없음.

`BADGE_ENGINE_UNIFIED.md`에 "`PER_ACTIVITY_KEYS` 필터가 `personal_record_break`와 결합되면
후보 풀을 좁히는 필터로 흡수된다"는 단일 출처 규칙(`personalRecordBreakConsumedAxisKeys`/
`personalRecordBreakPool`)을 반영했다.

### 주요 의사결정 / 핵심 메모
- `matchesPerActivityCondition({[key]: condition[key]}, a)`를 키 단위로 순회하며 `every`로
  좁히는 방식을 택했다 — 기존 "이력 전반 독립 평가" 블록(index.ts 618~623행)이 같은 패턴으로
  존재 여부를 확인하던 것과 동일한 어휘를 써서, 두 블록이 "무엇을 필터로 보는가"에 대해
  다른 답을 내지 않게 했다.
- 기존 "존재 여부 확인" 블록(relevantPerActivityKeys의 이력 전반 독립 평가)은 건드리지 않았다
  — personal_record_break 블록만 별도로 좁힌 풀을 계산해 썼다. 두 블록을 통합하는 리팩터링은
  스펙 범위 밖이라 하지 않았다(원인① 요구사항은 "countPersonalRecordBreaks에 넘기는 filtered를
  실제로 좁혀라"에 한정).

### 잔여 이슈
- 없음
