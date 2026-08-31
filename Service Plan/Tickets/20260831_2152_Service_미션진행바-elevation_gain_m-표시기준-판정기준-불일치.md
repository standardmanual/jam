---
id: 20260831_2152
category: Service
status: OPEN
created: 2026-08-31
closed:
---

# [Service] 미션 진행바 elevation_gain_m 표시 기준이 배지엔진 판정 기준과 어긋남

## 배경 / 문제 정의

티켓 `20260831_2100`(CLOSED, staging 병합됨)에서 배지엔진 `evaluateConditionDetailed`의
`elevation_gain_m` 판정 기준을 "단일 활동 최고값"에서 "전체 이력 누적 합계"로 복원했다
(`src/lib/badge-engine/index.ts`의 `PER_ACTIVITY_KEYS`에서 `elevation_gain_m` 제거).

`src/lib/missions/checker.ts`의 `ENGINE_DELEGATED_MISSION_TYPES`(`streak_days`,
`duration_minutes`, `elevation_gain_m`)는 이 `evaluateConditionDetailed`를 그대로 재사용해
**완료 판정**을 내리므로 판정 기준은 이미 "참가 시점 이후 누적 합계"로 바뀌었다.

반면 같은 파일의 `calculateProgress` 함수(진행바 **표시** 값 계산)의 `elevation_gain_m`
케이스(444~487행 부근)는 여전히 다음과 같이 단일 활동 최고값을 쓴다:

```ts
case 'elevation_gain_m': {
  const gated = condition.activity_type === 'walking' ? filtered.filter(passesWalkingGate) : filtered
  return gated.length > 0 ? Math.max(...gated.map((a) => a.elevationGainM)) : 0
}
```

**표시 기준(단일 최고값) ≠ 완료 판정 기준(누적 합계)** — 여러 활동을 통해 누적으로 조건을
채운 유저는 진행바가 실제보다 훨씬 낮게 보이다가 어느 순간 갑자기 "완료"로 튀거나(진행바가
아직 50%인데 완료 처리), 반대로 한 활동에서 큰 고도를 찍었지만 참가 시점 이후 다른 활동으로
고도가 상쇄되지 않는 이상 진행바 계산 방식 자체가 사용자에게 잘못된 기대를 준다.

**최초 조사 시 "elevation_gain_m 타입 미션 0건이라 영향 없음"으로 판단했으나, 재확인 결과
프로덕션 DB에 실제로 3건이 존재하고 전부 상시 활성 상태다:**

```
야생의 주자 레벨업        trail_running, elevation_gain_m=600m,  starts_at=2026-08-13, ends_at=null, 참가자 0
야생의 주자 레벨업 Hard    trail_running, elevation_gain_m=1500m, starts_at=2026-08-13, ends_at=null, 참가자 0
야생의 주자 레벨업 Ultra   trail_running, elevation_gain_m=3000m, starts_at=2026-08-13, ends_at=null, 참가자 0
```

현재 참가자가 0명이라 겉으로 드러난 증상은 없지만, 언제든 참가자가 생기는 순간 진행바-완료
판정 불일치가 재현되는 **활성 버그**다.

`duration_minutes`는 배지엔진에서 여전히 `PER_ACTIVITY_KEYS`에 남아 단일 활동 최고값으로
평가되므로 `calculateProgress`의 `Math.max` 방식과 일치 — 이번 건 대상 아님. `streak_days`는
양쪽 다 `calcMaxStreak`를 공유해 재사용하므로 이미 일치 — 대상 아님.

## 상세 요구사항

### 서비스/코드베이스 관점
- `src/lib/missions/checker.ts`의 `calculateProgress` 중 `elevation_gain_m` 케이스를
  "참가 시점 이후 활동 누적 합계"로 변경해 `evaluateConditionDetailed`의 판정 기준과 일치시킨다.
  - `filtered`(activity_type 필터링 결과)를 `reduce`로 합산하는 방식이 `distance` 케이스와
    동일한 패턴 — 걷기 축1 게이트(`passesWalkingGate`)는 기존처럼 유지.
  - `Math.max` → `reduce((sum, a) => sum + a.elevationGainM, 0)` 형태로 교체 검토.
- 변경이 `evaluateConditionDetailed`가 실제로 계산하는 값(누적 합계의 정확한 정의 —
  same_activity 플래그·게이트 필터링 포함 여부)과 **완전히 동일한 로직**인지 대조.
  다르게 계산되면 표시값과 판정값이 또 어긋난다.
- 회귀 테스트: 여러 활동에 걸쳐 누적으로 조건을 채우는 케이스에서 진행바 표시값과 `achieved`
  판정이 같은 시점에 목표치에 도달하는지 확인.

## 구현 계획
1. **이 워크트리 브랜치는 origin/staging보다 뒤처져 있어 티켓 2100의 배지엔진 변경분이 없다.**
   구현 브랜치는 반드시 최신 `origin/staging` 기준으로 새로 딴다.
2. `calculateProgress`의 `elevation_gain_m` 케이스 수정
3. `evaluateConditionDetailed`(누적 계산 경로)와 나란히 놓고 계산 결과가 동일한지 대조
4. 회귀 테스트 추가 (`checker-logic.test.ts` 등 기존 테스트 파일 위치 확인 후 추가)
5. `npm test`, `tsc --noEmit`

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`calculateProgress`의 `elevation_gain_m` 케이스를 `Math.max(...)` 단일 최고값에서
`reduce((sum, a) => sum + a.elevationGainM, 0)` 누적 합계로 교체했다. `filtered`(activity_type
필터) → `gated`(걷기면 축1 게이트 추가 필터) 순서는 기존 그대로 유지했고, 이 `gated` 배열이
`evaluateConditionDetailed`의 `elevation_gain_m` 누적 블록이 쓰는 `filtered` 배열(활동 타입 필터
+ 걷기 게이트, `same_activity`가 아닌 경로)과 정확히 같은 필터링 결과를 갖는지 대조했다.
`MissionCondition.elevation_gain_m` 타입 미션은 `same_activity`·`day_of_week`·`time_range`·
`temperature_min_c/max_c` 필드를 갖지 않으므로(스키마 자체에 그 필드들이 없음) 두 함수의
"기본 누적 합계" 경로가 완전히 같은 입력 집합을 합산한다는 것을 코드 대조로 확인했다.

회귀 테스트로 직접 대조 케이스(`evaluateMission`의 `progressValue` ↔ `evaluateConditionDetailed`의
`actual` 문자열)를 추가해, 두 값이 같은 누적합에서 나오는지 검증했다.

`duration_minutes`(배지엔진 `PER_ACTIVITY_KEYS`에 남아 단일 활동 최고값 유지)와 `streak_days`
(`calcMaxStreak` 공유로 이미 일치)는 손대지 않았다.

부수적으로 `src/types/database.ts`의 `MissionCondition.elevation_gain_m` 필드 주석이 여전히
"단일 활동 최소 고도 상승"으로 남아 있어(티켓 20260831_2100 당시 갱신 누락) 이번 변경 의미와
정면으로 모순됐다 — 혼선 방지를 위해 "참가 시점 이후 누적 최소 고도 상승"으로 함께 정정했다.

### 변경된 파일
```
jam-web/src/lib/missions/checker.ts
jam-web/src/lib/missions/__tests__/checker-logic.test.ts
jam-web/src/types/database.ts
```

### 테스트 결과
- [x] `npx tsx src/lib/missions/__tests__/checker-logic.test.ts` — 22/22 통과 (신규 5건 포함:
  누적 달성/미달성, 축1 게이트 통과분만 합산, calculateProgress ↔ evaluateConditionDetailed
  교차 대조)
- [x] `npm run test:node` — 전체 통과 (missions/today 순수 로직 테스트, 실데이터 대조 48/48 포함)
- [x] `npx tsc --noEmit` — 오류 없음
- [x] `npm test` (vitest run) — 66/68 파일 통과, 실패 2건은 이번 변경과 무관한 기존 결함
  (`sync-drop-order.test.ts`: 로컬 `SUPABASE_SERVICE_ROLE_KEY` 미설정으로 인한 환경 문제,
  `BadgeRevealCarousel.stories.tsx`: Storybook 접근성 케이스가 다른 스토리 상태를 참조하는
  flaky 케이스) — `git stash`로 변경분을 제외한 상태에서도 동일하게 재현되는 것을 확인
- [x] `npm run lint` — 0 errors, 26 warnings (전부 이번 변경 파일과 무관한 기존 경고)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
사용자 노출 텍스트 변경 없음 — 해당 없음 (진행바 계산 로직만 변경)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- `filtered`(activity_type 필터만) vs `gated`(걷기면 축1 게이트 추가)를 나누는 기존 구조를
  그대로 유지하고 `Math.max` → `reduce` 한 줄만 교체하는 최소 변경으로 처리했다. `distance`
  케이스와 동일한 리듀스 패턴이라 스타일 일관성도 맞는다.
- `MissionCondition.elevation_gain_m` 필드 주석 정정은 이번 티켓 범위(진행바 계산 로직)를
  벗어난 문서성 수정이지만, 방치 시 이번 버그와 동일한 종류의 오독을 반복 유발할 수 있는
  1줄 주석이라 함께 고쳤다(로직 변경 없음).

### 잔여 이슈
- 없음
