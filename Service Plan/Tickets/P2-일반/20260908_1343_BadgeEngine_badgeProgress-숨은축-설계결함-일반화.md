---
id: 20260908_1343
category: BadgeEngine
priority: P2
status: CLOSED
created: 2026-09-08
closed: 2026-09-08
---

# [BadgeEngine] badgeProgress.ts 「숨은 축」 설계 결함의 일반적 해소

## 배경 / 문제 정의
> 분리 출처: `20260908_1318`(v5 잔여 5종 조건 필드 평가엔진 구현) 게이트 리뷰 sideFindings.

`badgeProgress.ts`의 `classifyConditionKind`는 조건에 여러 축이 결합돼 있을 때, 그중 진행률
계산 로직이 아직 모르는 축이 섞여 있으면 그 축을 **조용히 무시하고** 나머지 축만으로
`cumulative`/`periodic` 등으로 분류하는 설계 결함이 있다. 이러면 실제로는 판정에 반영되는
조건이 진행바 화면에는 반영되지 않아 「진행률은 채워졌다고 나오는데 실제로는 발급 안 되는
배지」로 보일 수 있다.

`20260908_1318`에서 `{distance_km, month_over_month_ratio}` 조합이 `month_over_month_ratio`
축을 숨긴 채 `cumulative`로 잘못 분류되는 것을 실측으로 확인했고, 그 조합에 한해 안전하게
`unsupported`(「진행 표시 준비 중」)로 떨어뜨리는 가드만 추가했다. **근본 원인(신규 축 추가 시
`classifyConditionKind`가 미지의 축을 기본적으로 무시하는 구조)은 해소되지 않았다** — 이후
새 조건 필드를 추가할 때마다 같은 유형의 버그가 재발할 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `badgeProgress.ts`의 `classifyConditionKind`를 감사해, "아는 축들의 조합"으로만 분류를
  확정하고 **미지의 축이 하나라도 남으면 fail-safe로 `unsupported`를 반환**하는 구조로
  일반화할 수 있는지 검토한다(화이트리스트 방식 전환).
- 가능하면 회귀 테스트로 "신규 조건 필드를 추가했는데 `classifyConditionKind`가 그 축을
  놓치면 테스트가 실패한다"는 안전망을 만든다(예: `conditionRegistry.ts`에 등록된 전체
  measurable 키 목록과 `classifyConditionKind`가 다루는 축 목록을 대조하는 테스트).
- `20260908_1318`에서 추가한 개별 가드(`NO_PROGRESS_AXIS_YET` 등)가 이 일반화로 대체
  가능한지, 아니면 그대로 남겨도 되는지 확인한다.

## 구현 계획
> 진행률 계산 오분류가 사용자에게 잘못된 「거의 다 채웠어요」 신호를 줄 수 있는 리스크이므로,
> 화이트리스트 전환의 영향 범위(기존에 정상 분류되던 조합이 갑자기 unsupported로 떨어지지
> 않는지)를 먼저 실측한 뒤 진행한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`classifyConditionKind`(badgeProgress.ts)의 개별 가드 `NO_PROGRESS_AXIS_YET`(4개 키 수동
나열)를 화이트리스트 구조로 일반화했다.

- `KNOWN_MEASURABLE_AXIS_KEYS` = `MEASURED_AXIS_KEYS`(conditionAxes.ts, 수치 축) ∪
  `KNOWN_NON_AXIS_MEASURABLE_KEYS`(`month`·`time_range`·휴식 4종·`repeat_count` — 이 함수의
  다른 분기가 이미 명시적으로 처리하는 measurable 필드)
- `unknownMeasurableAxisKeys()` — 조건에 남은 키 중 `role: 'measurable'`이면서 위 화이트리스트
  밖에 있는 키가 하나라도 있으면 `unsupported`로 fail-safe
- 이 검사를 `hasRepeat` 분기 직후·`isMulti` 판정 **이전**으로 옮겼다 — 기존
  `NO_PROGRESS_AXIS_YET`은 `isMulti` 판정 뒤에 있어 `season_count_all` + 미지의 측정 축
  조합을 보호하지 못했다(실측으로 확인, 아래 테스트가 회귀 소재로 남긴다).

**영향 범위 실측**: `conditionRegistry.ts`의 `role: 'measurable' && evaluation: 'engine'`
키 전체(34종)를 화이트리스트와 대조했다. 4종(`distinct_time_bands`·
`activities_within_hours`·`month_over_month_ratio`·`vs_personal_average`)만 여전히
축이 없고(티켓 20260908_1318이 후속으로 미룬 것과 동일 — 회귀 아님), 나머지 30종은 전부
화이트리스트에 있어 기존 정상 분류가 그대로 유지된다. `evaluation: 'pending'`인 키
(`daily_once_count` 등)는 `findBlockingConditionKeys`가 이 함수보다 먼저 막아 화이트리스트가
필요 없다.

### 변경된 파일
```
jam-web/src/lib/badge-engine/badgeProgress.ts
jam-web/src/lib/badge-engine/__tests__/condition-registry-axis-coverage.test.ts (신규)
```

### 테스트 결과
- [x] `npx vitest run src/lib/badge-engine/__tests__/condition-registry-axis-coverage.test.ts` — 8/8 통과
- [x] `npx vitest run src/lib/badge-engine` — 407/407 통과 (기존 축 분류 회귀 없음)
- [x] `npx vitest run` (전체) — 1212/1212 통과
- [x] `npx tsc --noEmit` — 오류 없음
- [x] `npm run lint` (전체) — 0 에러 / 13 경고(전부 design-system 기존 경고, 이 작업과 무관)

### 배포 정보
- 배포일: staging은 이 커밋으로 즉시 반영. 프로덕션은 `/jam-ship`으로 별도 승인 후 진행 예정
- 환경: staging (production 미배포)
- 커밋: `42f5ab30` (최종 머지 커밋)

### 주요 의사결정 / 핵심 메모
- `NO_PROGRESS_AXIS_YET`은 전량 대체·삭제했다 — 화이트리스트가 기존 4개 케이스를 그대로
  포함하면서 새 measurable 필드 추가 시에도 자동으로 fail-safe가 작동한다.
- 회귀 테스트는 "전체 measurable 키가 화이트리스트에 있어야 한다"는 과도한 단언 대신,
  "measurable+`engine` 키만" 대조하고 `EXPECTED_AXIS_GAP`(현재 알려진 4개 공백)을 명시적으로
  분리했다 — `evaluation: 'pending'` 필드까지 포함하면 아직 축이 없는 게 당연한 필드까지
  실패로 잡혀 테스트가 신호를 못 낸다.
- `rest_after_streak`류 4종·`repeat_count`는 `MEASURED_AXIS_KEYS`에는 없지만 이 함수의
  앞선 분기(`restKeys.length > 0`/`hasRepeat`)가 이미 가로채므로 화이트리스트 검사 지점에
  도달할 때는 항상 부재 상태다 — `KNOWN_NON_AXIS_MEASURABLE_KEYS`에 넣어 자기 문서화했다.

### 잔여 이슈
- `distinct_time_bands`·`activities_within_hours`·`month_over_month_ratio`·
  `vs_personal_average` 4종의 진행 축 지원은 여전히 미해결(후속 티켓 몫, 20260908_1318과 동일 결정).
