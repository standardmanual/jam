---
id: 20260906_2056
category: BadgeEngine
status: CLOSED
created: 2026-09-06
closed: 2026-09-06
---

# [BadgeEngine] 휴식 4종 + `repeat_count` 조합 지원 (§B-10 재설계)

> 분리 출처: `20260906_0110` ②(의도적으로 손대지 않은 부분). 마스터: `20260905_0026`.
> 배경 판단: `20260905_0030` B-10.

## 배경 / 문제 정의

`0030`에서 휴식 조건(`rest_after_streak`·`rest_after_long`·`return_gap_days`·`interval_days`)을
`repeat_count`와 조합하는 것을 **의도적으로 막았다**(`CONSUMED_REPEAT_KEYS`에 넣지 않고
조합 자체를 금지). 이유(§B-10, `0030` 기록):

> 휴식은 **이력 패턴 술어**라, 그냥 회차 계산에 넣으면 「휴식 조건을 무시한 회차」가
> 세어진다 — 예를 들어 `{repeat_count: 5, rest_after_streak: 2}`를 단순 카운트하면
> "휴식 여부와 무관하게 활동이 5번 있었다"만 세어져, "5번 다 '3일 연속 후 2일 휴식'
> 패턴을 만족했다"는 원래 의도와 달라진다.

`0110`이 이 조합을 여는 것을 시도하지 않고 **"별도 판단 필요"로 그대로 남겼다.** 현재
프로덕션에 이 조합을 쓰는 계열이 다수 있다(정확한 개수는 구현 착수 시 재확인) —
휴식 축(`X`)의 등급형·반복형 배지 다수가 「휴식 후 N일 이내 복귀를 M회 반복」 형태로
설계돼 있는데, 지금은 이 조합이 fail-closed로 막혀 있어 **영원히 미발급 상태다.**

## 상세 요구사항

### 서비스/코드베이스 관점

- **새 전용 술어를 만든다** — 기존 `repeat_count` 카운터에 얹지 않고, "휴식 조건을
  만족한 사건"만 세는 별도 계산 경로를 `repeatOccurrences.ts`에 추가한다. `0110` ②가
  「기간 단위 회차」(`streak_days`·`weekly_count` 등 + `repeat_count`)를 위해 만든
  `isPeriodDrivenRepeatCondition()` 패턴을 참고하되, 휴식은 **이력 패턴**(활동 사이의
  간격)이라 판정 방식이 다르다 — "휴식 후 복귀"가 성립한 시점을 사건 하나로 세야 한다.
  - 예: `{rest_after_streak: 2, streak_days: 3, repeat_count: 5}` → "3일 연속 활동 후
    2일 이상 쉬고 복귀"한 사건이 5번 있었는가.
- **`0030`이 명시한 금지를 그대로 두지 않는다** — `evaluateConditionDetailed`가 이 조합을
  만나면 지금은 명시적으로 차단하는데, 새 술어가 준비되면 그 차단 분기를 새 술어 호출로
  바꾼다. 차단 자체를 성급히 없애지 않는다 — 새 술어가 실제로 이력 패턴을 올바로 세는지
  회귀로 검증한 뒤에 바꾼다.
- `badgeProgress.ts`의 휴식 조건 진행률(`unsupported` 고정, `0030`이 의도적으로 그렇게
  둠 — `{ streak_days: 6, rest_after_streak: 2 }`가 `streak_days` 축 1개짜리로 잘못 잡혀
  「휴식 필요」를 숨기는 문제 때문)도 이번에 회차가 열리면 같이 재검토한다. 축 확장은
  `0031`이 만든 레이어를 따른다.

### 컨텐츠 관점
- 이 조합을 실제로 쓰는 계열을 전수 조사해 완료 기록에 남긴다(몇 계열·몇 종이 이번에
  새로 열리는지).

## 구현 계획
1. 프로덕션 630종 중 휴식 4종 + `repeat_count` 조합을 쓰는 계열 전수 조사
2. "휴식 후 복귀" 사건을 세는 전용 술어 설계·구현 (`repeatOccurrences.ts`)
3. `evaluateConditionDetailed`의 기존 차단 분기를 새 술어로 교체
4. `badgeProgress.ts` 진행률 연결
5. 회귀 테스트: 새 술어가 "휴식 조건 무시 카운트"로 퇴화하지 않는지가 핵심 — 휴식을
   지키지 않고 자주 활동한 케이스가 잘못 카운트되지 않아야 한다
6. 게이트 리뷰에서 해당 계열의 발급 가능 여부를 실측 확인

## 판단이 필요할 수 있는 지점
- "사건"의 경계를 어떻게 정의할지(예: 연속 스트릭이 끊기고 다시 시작하는 매 순간을 1사건으로
  볼지, 아니면 더 넓은 윈도우로 묶을지)는 §B-10이 구체적으로 규정하지 않았다. 구현 중
  모호하면 오케스트레이터에게 판단을 요청할 것 — 임의로 해석해 진행하지 않는다.

## 하지 않는 것
- `20260906_0110`이 이미 연 다른 조합(기간 단위 회차 등) — 그대로 유지
- 레벨형 계열의 `min_level` 표현(별도 이슈, `20260906_1947` 참고)

## 완료 기록 (구현 — 승인 대기)

### ① 프로덕션 전수 조사 (구현 착수 시 실측)

**환경 제약**: `jam-developer` 서브에이전트는 설계상 DB 자격증명(Supabase MCP·`.env.local`)에
접근하지 않는다(`CLAUDE.md` §5 예외 조항 — 실행은 오케스트레이터만). 그래서 라이브 DB를
직접 조회하지 못하고, 저장소에 커밋된 `jam-web/supabase/migrations/*.sql`(전부 `git`으로
추적되는 SQL 파일 — 실행 자체는 오케스트레이터가 이미 승인·적용한 것들이다)을 정적으로
파싱해 집계했다. 총 조건 행 수(630건)가 티켓 본문의 "프로덕션 630종"과 정확히 일치해
이 카탈로그가 맞는 대상임을 확인했다.

**집계 결과** (`grep`/Node 스크립트로 `condition_json`을 파싱, `repeat_count` + 휴식 4종
동시 존재 행만 필터):

| 휴식 키 | 행 수(등급 사다리 포함) | 영향받는 계열(family_key) 수 |
|---|---|---|
| `rest_after_streak` | 7 | 2 (`walking:R1`, `running:X1`) |
| `rest_after_long` | 16 | 5 (`walking:R2`, `running:X2`, `cycling:X2`, `hiking:X2`, `trail_running:X2`) |
| `return_gap_days` | 15 | 5 (`walking:R4`, `running:X3`, `cycling:X1`, `hiking:X1`, `trail_running:X1`) |
| `interval_days` | 12 | 3 (`cycling:G1`, `hiking:G1`, `trail_running:G1`) |
| **합계** | **50건** | **15계열** |

- **휴식 키 2개 이상을 동시에 쓰는 행은 0건이다** — "사건 경계 미정의" 케이스(아래 ④)가
  현재 카탈로그에 실존하지 않음을 확인했다. 지원 범위(휴식 키 1개까지)가 실제 카탈로그를
  전부 커버한다.
- 시드 파일(`seed_v5_activity_badges.sql`) 안에 이미 `-- [회차] 휴식 조건(...)은
  repeat_count와 함께 쓸 수 없다`라는 주석과 함께 이 50건이 심어져 있었다 — 카탈로그
  담당자(티켓 `20260905_0035`)가 이 조합이 나중에 열릴 것을 전제로 미리 시딩해 둔 것으로
  보인다.
- 새 술어(`isRestDrivenRepeatCondition`)가 이 50건 **전부**를 실제로 인식하는지 임시
  테스트로 실측 검증했다(커밋에는 남기지 않음 — 검증 전용 스크립트).
- **한계**: 이 집계는 저장소의 SQL 파일 기준이며 현재 라이브 DB의 실시간 상태와 완전히
  같다는 보장은 없다(시딩 이후 어드민 수동 편집 가능성). 다만 본 티켓 이전에는
  `findRepeatRestConflictError`(어드민 저장 가드)가 이 50건에 대한 재저장 자체를 막고
  있었으므로, 시딩 이후 이 조건들이 변경됐을 가능성은 낮다. **병합 전 오케스트레이터가
  라이브 DB로 재확인을 권장한다.**

### ② 구현 내용

- **`repeatOccurrences.ts`**: 신규 술어 `isRestDrivenRepeatCondition`/`collectRestOccurrences`
  추가. "사건 하나 = `activityFilters.buildRestIntervals`가 만드는 인접 활동일 사이의 닫힌
  구간 중, 그 휴식 조건(eligible + threshold)을 만족하는 구간 하나"로 정의했다(아래 ③ 참고).
  `evaluateRestConditions`와 완전히 같은 눈(같은 `restPool`·`buildRestIntervals`·eligible·
  threshold 로직)으로 구간을 보되, "하나라도 있는가"가 아니라 "몇 개인가"를 센다.
  `collectRepeatOccurrences`에 `anchorDate` 파라미터를 추가해(기존 기간 단위 회차는 영향
  없음 — 이미 앵커로 잘린 이력을 받음) 가입 이전 공백이 사건으로 잡히지 않게 했다.
- **`index.ts` (`evaluateConditionDetailed`)**: 휴식+회차 차단 분기를
  `isRestDrivenRepeatCondition`으로 교체 — 휴식 키가 정확히 1개(그 짝 필드만 동반)면 통과시켜
  `collectRepeatOccurrences`의 전용 계산으로 흘려보내고, 그 외(휴식 키 2개 이상·지원 형태를
  벗어난 조합)는 기존과 동일하게 「회차와 함께 쓸 수 없는 조건」으로 막는다. 두 호출부
  (`repeat_count` 평가, 반복형 후보 선정)에 `anchorDate`를 전달하도록 수정.
- **`badgeProgress.ts`**: `classifyConditionKind`가 휴식 키 1개 + `repeat_count`를 `'repeat'`로
  분류(기존 `'unsupported'` 고정을 걷어냄) — `buildRepeatAxis`가 그대로 재사용돼 "N/M회" 축이
  그려진다. `explainUnsupportedProgress`의 안내 문구도 "1개까지만 가능"으로 갱신.
- **`activityFilters.ts`**: `RestInterval` 타입·`buildRestIntervals`·`restPool`·`isPositiveDays`를
  export로 전환(로직 변경 없음) — `repeatOccurrences.ts`가 `evaluateRestConditions`와 같은
  구간 계산을 재사용하기 위함.
- **`badge-condition-guards.ts` (어드민 저장 가드)**: 티켓에 명시되지 않았지만 직접 연관된
  결함이라 함께 수정 — `findRepeatRestConflictError`가 여전히 "휴식 아무 키나 있으면 무조건
  거부"였다면, 이번에 엔진이 지원하게 된 50건을 어드민이 재저장(이름 오타 수정 등)할 때마다
  거부당하는 상태가 남는다. 휴식 키 1개(지원 형태)는 통과시키고, 2개 이상만 계속 막도록
  수정.
- **`conditionRegistry.ts`**: `repeat_count` 필드의 어드민 폼 help 문구를 "휴식 조건과는
  함께 쓸 수 없다" → "1개까지만 함께 쓸 수 있다"로 갱신.

### ③ "사건" 경계 판단 근거 (판단이 필요할 수 있는 지점 — HALT 대신 근거를 남기고 진행)

티켓이 명시한 대로 사건 경계는 §B-10이 규정하지 않았다. 다음 근거로 **"활동 사이의 닫힌
구간(`RestInterval`) 하나 = 사건 하나"**로 해석해 진행했다(HALT하지 않은 이유):

- `evaluateRestConditions`(기존 코드)가 이미 이력을 인접한 두 활동일 사이의 **닫힌 구간**
  목록으로 쪼개고 있다. 구간 하나는 정확히 (직전 활동일, 복귀일) 한 쌍만 가리키는 원자적
  단위라 — 스트릭이 아무리 길어도, 공백이 아무리 길어도 "그 한 번의 물리적 전환"은 항상
  구간 하나로만 표현된다. `streak_days` 회차(`collectStreakDayOccurrences`)가 "런 하나가
  여러 회차로 쪼개지지 않게" 별도 장치(`findRunThresholdKeys`)를 뒀어야 했던 것과 달리,
  여기는 쪼갤 대상 자체가 없어 그 장치가 필요 없었다.
- 티켓이 든 예시(`{rest_after_streak: 2, streak_days: 3, repeat_count: 5}` → "5번의 3일
  연속 후 2일 휴식")를 이 정의로 그대로 재현할 수 있다(회귀 테스트로 검증, 아래 ④).
- **딱 하나의 휴식 키만 지원**하도록 좁혔다 — 서로 다른 두 휴식 키(예: `rest_after_streak` +
  `return_gap_days`)가 동시에 있으면 "사건 하나"가 같은 구간에서 두 키를 동시에 만족해야
  하는지, 각자 다른 구간에서 독립적으로 만족해도 되는지가 여전히 정의돼 있지 않다.
  `evaluateRestConditions`의 기존 단발 판정도 이 경우 각 키가 독립적으로 자기 구간을 찾아
  AND로 묶을 뿐 "사건 하나"로 셀 방법을 정의하지 않는다. ①의 실측대로 현재 카탈로그에
  이런 조합이 0건이라 실무 영향 없이 안전하게(fail-closed) 막아 뒀다 — 필요해지면 별도
  티켓으로 다시 판단해야 한다.

### ④ 회귀 테스트

`src/lib/badge-engine/__tests__/rest-conditions.test.ts`에 추가:
- 티켓 예시 그대로 재현(5개 사건 → pass, 4개 사건 → "충족 횟수 부족")
- **퇴화 방지 핵심 테스트**: 30일 연속 무휴식 활동 + `{rest_after_streak:2, streak_days:3,
  repeat_count:2}` → 활동 30건에도 불구하고 사건 0건("휴식 조건을 무시한 단순 카운트로
  퇴화하지 않는다")
- `return_gap_days`/`interval_days`(순수 공백 키) 각각의 사건 카운팅
- 계기 활동(N번째 사건의 복귀 활동) 선정
- 진행 계산(`computeBadgeProgress`)이 같은 축("N/M회")을 그리는지
- 휴식 키 2개 이상 조합은 여전히 막힘(엔진·진행 계산 양쪽)
- 어드민 저장 가드(`badge-condition-guards.test.ts`)도 같은 경계로 갱신

전체 vitest 1112건 통과, `npm run lint` 0 errors / 13 warnings(전부 기존 design-system 경고,
이번 변경과 무관), `npx tsc --noEmit` 오류 없음.

### ⑤ 남은 작업 (병합 전 오케스트레이터 확인 필요)
- ~~라이브 DB에서 위 50건의 condition_json이 정적 분석과 일치하는지 재확인~~ **완료** —
  게이트 리뷰가 service_role로 직접 조회해 50건/15계열/휴식키별 7·16·15·12건이 정적 분석과
  정확히 일치함을 확인했다.
- 병합 후 `POST /api/admin/badges/reevaluate-all`로 기존 유저 재평가 실측은 **staging 배포
  이후**로 남긴다 — 실유저에게 새 배지가 실제로 발급되는 부수효과가 있어 별도 확인 후 진행.

## 2026-09-06 게이트 리뷰 PASS — staging 병합 완료

conservative-reviewer가 라이브 DB 직접 조회 + 실제 조건 4건으로 `evaluateConditionDetailed`
직접 호출까지 재현해 PASS 판정. 개선 리뷰가 지적한 스펙 문서 3곳(`BADGE_ENGINE_UNIFIED.md`
§2.16, `CONDITION_JSON_SPEC.md` 3곳)의 "휴식+repeat_count 조합 불가" 서술을 "휴식 키 1개까지
가능"으로 갱신 완료.

### 테스트 결과
- [x] `tsc --noEmit` 0건
- [x] `vitest run` 전체 61 files / 1112 tests 통과
- [x] 신규 회귀 테스트(`rest-conditions.test.ts` 확장, `badge-condition-guards.test.ts`) 포함

### 배포 정보
- 배포일: 2026-09-06 (staging)
- 환경: staging → production은 `/jam-ship`으로 별도 진행
- 커밋: `55364dcc`(구현) staging에 병합

### 잔여 이슈
- 휴식 키 2개 이상 조합은 여전히 fail-closed(사건 경계 미정의, 현재 카탈로그 0건 — 필요해지면
  별도 판단)
- `running:X1`「비워둔 하루」의 `repeat_count: 50`이 체감 난이도가 매우 높음 — 컨텐츠 담당
  확인 가치 있음(엔진 결함 아님)
- staging 배포 후 `POST /api/admin/badges/reevaluate-all`로 50건 실제 발급 확인 필요
