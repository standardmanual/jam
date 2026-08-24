---
id: 20260824_006
category: Service
status: CLOSED
created: 2026-08-24
closed: 2026-08-24
---

# [bug] 피드 `event_at`에 Strava 로컬 벽시계가 UTC로 저장돼 시각이 미래로 찍힌다

> 티켓 20260823_008·20260824_003 게이트 리뷰에서 발견. 003은 연출 판정을 `created_at`으로
> 분리해 목적을 달성했지만, **표시·정렬 버그는 그대로 남아 있다.**


> # ✅ 결정 완료 (2026-08-24)
>
> 1. **피드에 보이는 시각은 앞으로 `created_at`(배지를 받은 시각) 기준으로 바꾼다.**
>    표시뿐 아니라 **정렬도 `created_at` 기준으로 맞춘다** — 표시값과 정렬 순서가
>    다른 필드를 쓰면 화면에 보이는 순서와 상대시간이 서로 모순될 수 있다.
> 2. **`event_at`(활동 시각) 자체도 계속 정확하게 유지한다.** 표시에는 안 쓰더라도
>    원본 데이터로서 의미가 있고, 다른 기능이 참조할 수 있다. → 아래 A절(신규 기록
>    정상화)은 그대로 진행한다.
> 3. **과거 데이터 보정은 `strava_activities` 조인을 시도했으나 불가능했다** — 조사
>    결과 `user_activity_feed.metadata`에 원본 활동을 가리키는 키(activity_id 등)가
>    전혀 없어 **정확한 조인 대상이 없다.** 대안으로 **동일 `user_id` 내에서 가장
>    가까운 시각의 `strava_activities.start_date`를 근사 매칭**하는 방식을 쓴다
>    (정확한 보정이 아니라 근사치임을 명시). 상세는 B절 참조.

## 배경 / 문제 정의

`recordFeedEvent()`의 4번째 인자로 활동 시작 시각이 들어가는데, 그 값이
`startDateLocal ?? startDate`다.

**`startDateLocal`은 Strava가 로컬 벽시계에 `Z` 접미를 붙여 주는 값이다.**
KST 사용자가 09:00에 뛰면 `2026-08-24T09:00:00Z`로 오는데, 이걸 `timestamptz`에 넣으면
Postgres가 UTC로 해석해 **실제보다 9시간 미래**가 된다.

관련 코드:
- `jam-web/src/lib/badge-engine/index.ts` — `triggerActivity?.startDateLocal ?? triggerActivity?.startDate`
- `jam-web/src/lib/drop-engine/index.ts` — `activityStartDate`
- `jam-web/src/lib/strava/sync.ts` — `rawActivity.start_date`

### 프로덕션 실측 (2026-08-24, 조회 전용)

`item_dropped` 피드를 `inventory_items.obtained_at`(= 실제 삽입 시각, `DEFAULT now()`)과
조인해 대조:

| 항목 | 값 |
|---|---|
| 대조 가능한 행 | 97건 |
| **`event_at`이 실제 삽입 시각보다 미래인 행** | **70건 (72%)** |
| 최대 미래 편차 | **+7.84시간** |
| 최대 과거 편차 | -458시간 (백필 활동) |

**활동 시작 시각이 기록 시각보다 미래일 수는 없다.** 70건이 그렇다는 건 타임존
오해석 외에 설명이 안 된다. 최대 편차 +7.84h는 KST(+9) 가설과 정합한다
(활동 시작 후 동기화까지의 시간만큼 상쇄되므로 9h보다 조금 작게 나온다).

### 영향

`event_at`은 **홈·프로필 피드의 정렬 키이자 "획득 시각" 표시값**이다.

- 피드에 **미래 시각**이 표시된다 ("3시간 후에 획득" 같은 상대시간 표기가 나올 수 있음)
- 정렬 순서가 실제 획득 순서와 어긋난다
- `startDate`(UTC 정상값)로 기록된 이벤트와 `startDateLocal`로 기록된 이벤트가 섞여 있어
  **일관된 정렬 자체가 불가능하다**

## 상세 요구사항

### A. 신규 기록 정상화

`startDateLocal ?? startDate` → **`startDate`(UTC)를 쓰도록 뒤집는다.** 세 파일 전부.

⚠️ 이건 한 줄씩이지만 **회귀 범위가 UI 전반**이다. 피드 정렬·시각 표시가 전부 바뀐다.
표시 로직이 `event_at`을 어떻게 쓰는지 먼저 전수 확인할 것.

### B. 기존 데이터 판단 — 근사 매칭으로 보정

**정확한 조인은 불가능하다.** `user_activity_feed.metadata`에 원본 `strava_activities` 행을
가리키는 키가 없다(badge_id·inventory_item_id·poi_name 등은 있지만 activity_id류는 없음,
2026-08-24 전수 확인).

대안 — **동일 `user_id` + 가장 가까운 시각으로 근사 매칭**:

```sql
-- 개념 스케치. 실행 전 반드시 SELECT로 매칭 결과·거리 분포를 먼저 확인할 것.
UPDATE user_activity_feed f
SET event_at = sa.start_date
FROM LATERAL (
  SELECT start_date
  FROM strava_activities sa
  WHERE sa.user_id = f.user_id
  ORDER BY abs(EXTRACT(EPOCH FROM (sa.start_date - f.event_at)))
  LIMIT 1
) sa
WHERE ... -- 매칭 거리 상한(예: 12시간) 안일 때만 적용. 상한 밖이면 그대로 둔다(안전한 미보정)
```

- **매칭 거리에 상한을 둔다.** 상한 밖이면 근사가 신뢰할 수 없다는 뜻이므로 원래 값을 보존한다
  (오보정이 무보정보다 나쁘다)
- 적용 전 **몇 건이 매칭되는지, 매칭 거리 분포가 어떤지 먼저 조회**해 규모를 파악할 것
- 표시가 `created_at` 기준으로 바뀌므로, 이 보정은 **화면에 즉시 영향을 주지 않는다** —
  원본 데이터 정확성을 위한 별도 작업이다. 실패해도 표시 버그와는 무관하다

### C. 표시 검증

수정 후 피드에 미래 시각이 남아 있지 않은지, 정렬이 실제 순서와 맞는지 실측할 것.

## 구현 계획

1. `event_at`을 읽는 지점 전수 조사 (정렬·표시·필터) — 특히
   `src/app/(main)/FeedSection.tsx`(표시), `src/app/(main)/[username]/page.tsx`(정렬·조회)
2. 피드 표시·정렬을 `created_at` 기준으로 전환
3. `badge-engine`·`drop-engine`·`strava/sync.ts` 세 곳의 `startDateLocal ?? startDate`를
   `startDate`로 뒤집는다 (신규 기록 정상화, A절)
4. 근사 매칭 백필 — 적용 전 매칭 규모·거리 분포를 조회해 사용자에게 보고, 승인 후 실행
   (프로덕션 DB 쓰기이므로 이 프로젝트 규칙상 사용자 승인 필요)
5. 실측 검증 — 피드에 미래 시각이 없는지, 표시·정렬이 실제 획득 순서와 맞는지

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

**A. 신규 기록 정상화 — `startDateLocal ?? startDate` → `startDate`**

사용자 결정 3가지를 그대로 반영했다.

- `badge-engine/index.ts` — `triggered_by_activity_date`(user_activity_badges, 배지 상세
  화면 "계기 활동일"로 노출) + `recordFeedEvent`의 event_at 인자, 두 곳 모두 `triggerActivity?.startDate`로 고정.
- `drop-engine/index.ts` — `tryItemDrop`의 `activityStartDate`를 소스(단일 정의)에서
  `act?.startDate`로 고정. 이 변수가 daily_drop_date·comeback·weeklyFirst·last_activity_at·
  event_at까지 전부 공급하므로 소스 한 곳만 고치면 하위 전부 정상화된다.
- `strava/sync.ts` — `user_poi_badge_earns.triggered_by_activity_date`(POI 배지 상세
  PoiEarnHistory에 방문일로 노출)를 `rawActivity.start_date`로 고정. 같은 파일의
  `processFetchedActivities` 순서 검증 가드(`expectedLastActivityAt`)도 drop-engine이
  이제 저장하는 값(진짜 UTC)에 맞춰 함께 고쳤다 — 안 고치면 정상 동작인데도 매 싱크마다
  "last_activity_at 불일치" 경고가 계속 찍힌다.
- `recordFeedEvent(...badge_earned...)`가 POI 경로(sync.ts:325, `rawActivity.start_date`)에서는
  이미 올바르게 기록되고 있었다 — 그대로 뒀다.

> `triggered_by_activity_date` 2곳(badge-engine·sync.ts)은 티켓이 명시한 "event_at" 그 자체는
> 아니지만, 같은 3개 파일 안에 있는 **완전히 동일한 버그 패턴**(Strava 로컬 벽시계를
> timestamptz에 그대로 저장)이고, 실제로 배지 상세 화면에 날짜로 노출되는 걸 확인해서 함께
> 고쳤다. day_of_week/time_range 등 배지 **조건 판정**에 쓰이는 `startDateLocal ?? startDate`
> (badge-engine 14곳, drop-engine/context.ts 1곳)는 로컬 시각을 의도적으로 쓰는 코드라
> **건드리지 않았다** (예: "새벽 활동" 컨텍스트 오버라이드, 요일 조건).

**B. 표시·정렬 — `created_at` 기준으로 전환**

- `[username]/page.tsx` — `user_activity_feed` 조회 정렬을 `event_at` → `created_at`으로,
  레거시 항목(다른 테이블에서 합성한 행)까지 합친 뒤의 최종 정렬(`allItems.sort`)도
  `created_at` 기준으로 통일. 레거시 합성 행(`makeFeedItem`)에 넘어오는 `event_at` 인자는
  각 원본 테이블 자신의 기록 컬럼(`earned_at`/`obtained_at`/`dropped_at`/`picked_up_at`/
  `completed_at`/`joined_at`)이라 애초에 DB 기록 시각이므로 buggy하지 않다 — `created_at`에도
  동일 값을 채우는 기존 로직 그대로 둬도 정확하다.
- `FeedSection.tsx` — 상세 시트의 전체 날짜(`formatFullDate`)와 카드의 상대 시각
  (`formatRelativeTime`) 둘 다 `item.event_at` → `item.created_at`으로 변경.
- `database.ts`의 `ActivityFeedRow` 타입 주석을 갱신해 `event_at`은 더 이상 정렬·표시에
  쓰이지 않고 "원본 데이터"로만 남는다는 것과, `created_at`이 정렬·표시의 단일 기준이 됐다는
  것을 명시했다.

**C. 과거 데이터 — event_at 근사 백필 SQL (미실행)**

`strava_activities`와 `metadata`로 정확한 조인이 불가능함을 재확인(연결 키 없음 — 티켓의
전제와 동일). 동일 `user_id` 안에서 `event_at`과 가장 가까운 시각의
`strava_activities.start_date`를 최근접 매칭하는 방식으로 `094_backfill_feed_event_at_approx.sql`을
**작성만** 했다(STEP 1 진단 읽기 전용 쿼리 + STEP 2 백필, 매칭 거리 상한 12시간 — 알려진 최대
편차 +7.84h에 여유를 둔 값).

🔴 **STEP 1 진단(매칭 규모·거리 분포 조회)조차 실행하지 못했다** — jam-developer 서브에이전트에는
DB 조회 도구가 전혀 없다(Supabase MCP 미포함, 절대 규칙 3). STEP 1을 먼저 실행해 분포를
검토한 뒤 STEP 2를 실행하는 건 오케스트레이터·사용자 승인 몫이다.

대상은 `event_type IN ('badge_earned', 'item_dropped')`뿐이다(recordFeedEvent의 eventAt
인자가 실제로 쓰이는 두 타입 — 마이그레이션 013 확인). `created_at`은 백필 대상에 넣지
않았다 — "행이 DB에 기록된 시각"이라는 별개 의미이고, 사용자 결정 2번(event_at을 원본
데이터로 유지)의 대상은 명시적으로 `event_at`이었다.

### 변경된 파일
```
jam-web/src/lib/badge-engine/index.ts
jam-web/src/lib/drop-engine/index.ts
jam-web/src/lib/strava/sync.ts
jam-web/src/lib/strava/__tests__/sync-drop-order.test.ts   (테스트를 새 동작에 맞춰 갱신)
jam-web/src/app/(main)/[username]/page.tsx
jam-web/src/app/(main)/FeedSection.tsx
jam-web/src/types/database.ts
jam-web/supabase/migrations/094_backfill_feed_event_at_approx.sql   (신규, 미실행)
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 오류 0건
- [x] `npx eslint`(변경 파일 전부) — 오류 0건, 사전 존재하던 무관한 warning 1건(FeedSection.tsx
      `ChevronRightIcon` 미사용)만 남음 — 이번 변경으로 생긴 게 아님을 diff로 확인
- [x] `npx vitest run` — 44개 파일 348개 테스트 전부 통과 (drop-engine·badge-engine·
      missions·strava 스위트 포함, 회귀 없음). `sync-drop-order.test.ts`는 새 동작
      (`activity.startDate` 기준 `last_activity_at`)에 맞춰 갱신 후 통과.
- [ ] **실제 화면(피드 미래 시각 소멸·정렬 정합) 실측 미완료** — 이 리뷰 브랜치는 아직
      staging에 병합되지 않아 `jam-stage.vercel.app`에 반영되지 않았다. staging 병합 후
      실제 Strava 동기화 1회로 event_at이 미래로 찍히지 않는지, 피드 표시·정렬이 실제
      획득 순서와 맞는지 확인이 필요하다.
- [ ] STEP 1 진단 쿼리(매칭 규모·거리 분포) 미실행 — DB 조회 도구 없음(위 구현 내용 요약 C 참고)

### UX Writing 검증
- [x] 시각 표기 규칙 (`Service Plan/Specs/UX_WRITING_GUIDELINE.md`) — 노출 문구 변경 없음.
      `formatFullDate`/`formatRelativeTime`/`LocalDate` 등 기존 포맷 함수는 그대로이고,
      이 함수들에 넘기는 **데이터 소스**(어느 컬럼 값을 넘기는지)만 바뀌었다.


### 게이트·개선 리뷰 이후 오케스트레이터 확인 (머지 전)

- 개선 리뷰가 `[username]/page.tsx:76`의 DB 쿼리 레벨 정렬이 `created_at`으로 실제
  전환됐는지 재확인을 요청했다 — 브랜치를 직접 열어 확인한 결과 `.order('created_at', ...)`로
  정확히 반영돼 있었다 (당시 개선 리뷰는 도구 제약으로 `staging` 브랜치만 볼 수 있어 코드
  구조 추론에 의존했다 — 리뷰 자체는 유효한 우려였고, 실제로 확인이 필요한 지점이었다).
- `event_at` 전체 참조를 브랜치에서 재검색해 표시·정렬에 남은 참조가 없음을 확인했다.
  남은 참조는 전부 (a) DB 컬럼 자체(계속 정확하게 유지하기로 한 값) (b) 레거시 피드 합성
  함수(`makeFeedItem`)의 파라미터명 — 이 함수는 `user_activity_feed`가 아니라 각 원본
  테이블(`earned_at`/`obtained_at` 등, 이미 정확한 값)에서 합성하므로 버그와 무관 (c) 주석.
- **094 STEP1(진단, 읽기 전용) 실행 완료** — 대상 311건 전부 매칭 후보 있음. 분포가 KST
  +9시간 가설과 정확히 일치(6~9시간 버킷이 119건으로 최다). 12시간 상한 적용 시 282건
  보정, 29건(9.3%)은 상한 밖이라 원본 보존. 24시간 이내 매칭이 전부 있으나(over_24h=0)
  상한을 늘리지 않고 **12시간 유지를 권장** — 오보정 방지가 우선.
- **STEP2(실제 백필)는 아직 실행하지 않았다.** 사용자 승인 대기.

### 배포 정보
- 배포일: 2026-08-24
- 환경: staging (`jam-stage.vercel.app`) — 프로덕션 승격은 사용자 확인 후 `/jam-ship`
- 커밋: `b757731` — 브랜치 `claude/jamwork-20260824_006-feed-event-at-utc`에서 staging 머지
- **참고**: 코드 배포와 094 STEP2(백필)는 독립적이다. 백필 미실행 상태로도 신규 기록은
  이미 정상화됨(A절) — 표시·정렬도 created_at 기준이라 배포 직후부터 정확하다.
  STEP2는 093 이전 과거 데이터의 정확도만 개선한다.

### 주요 의사결정 / 핵심 메모

- **`triggered_by_activity_date` 2곳(badge-engine·sync.ts)까지 함께 고친 근거**: 티켓 본문이
  명시한 파일·"3곳"과 정확히 일치하고("badge-engine·drop-engine·strava/sync.ts 세 곳"), 코드
  확인 결과 이 필드가 배지 상세/POI 상세 화면에 **실제로 날짜 표시에 쓰인다**
  (`badges/[id]/page.tsx`의 `d.badges.triggerDate`, `PoiEarnHistory.tsx`) — "어드민
  전용"이 아니었다. 같은 파일·같은 버그 패턴이라 판단해 포함했고, 배지 조건 판정용
  `startDateLocal ?? startDate`(day_of_week/time_range 등, 14곳)는 의도적 로컬 시각
  사용이라 손대지 않았다.
- **drop-engine의 `activityStartDate`는 소스 1곳만 고쳤다**: 이 변수가 event_at뿐 아니라
  일일 카운터 리셋(`daily_drop_date`)·복귀 판정(comeback/weeklyFirst)·`last_activity_at`
  영속화까지 겸하고 있어, 소스를 나누지 않고 한 곳에서 고쳤다. 마침 일일 카운터 리셋 코드
  주석이 원래 "UTC 기준"이라고 명시하고 있었는데 실제로는 로컬 벽시계로 동작하고 있었다 —
  이번 수정으로 주석과 실제 동작이 일치하게 됐다(부수 효과, 별도 요청 없었음).
- **`created_at`은 완전한 해결책이 아니다(중요, 리뷰어 확인 필요)**: 마이그레이션 093은
  기존 행의 `created_at`을 `LEAST(event_at, NOW() - INTERVAL '1 hour')`로 백필했는데, 실측
  시점 기준 미래인 `event_at`이 0건이라 이 상한은 no-op였고 **093 이전 행의 `created_at`은
  당시의 (버그가 있던) `event_at`과 정확히 같은 값**이다. 즉 이번 티켓으로 표시·정렬 기준을
  `created_at`으로 바꿔도, **093 이전에 기록된 행은 여전히 부정확한 값을 보여줄 수 있다**
  (094 백필은 `event_at`만 갱신하고 `created_at`은 건드리지 않는다 — "구현 내용 요약 C"
  참고). 신규 기록(A 적용 이후)과 093 이후 기록은 `created_at`이 항상 정확하므로 문제없다.
  이 잔차를 어떻게 할지는 사용자 판단이 필요해 별도 후속 티켓감으로 남긴다.
- **094 백필을 `triggered_by_activity_date`까지 확장하지 않았다**: 사용자 결정 3번은
  "event_at" 근사 백필을 명시했고, `triggered_by_activity_date`(user_activity_badges/
  user_poi_badge_earns) 과거 데이터 보정은 범위 밖으로 남겨뒀다. 필요하면 094와 동일한
  최근접 매칭 방식을 그대로 적용할 수 있다.

### 잔여 이슈
- **094 SQL 미실행** — STEP 1 진단(매칭 규모·거리 분포)부터 사용자 승인 후 오케스트레이터가
  실행해야 한다. 결과를 보고 STEP 2(백필) 실행 여부·거리 상한(기본 12시간)을 확정한다.
- **093 이전 `user_activity_feed` 행의 `created_at`은 여전히 부정확할 수 있다** — 위 "주요
  의사결정" 참고. 이번 티켓 범위에서는 해결하지 않았다(사용자 판단 필요).
- **`triggered_by_activity_date`(user_activity_badges/user_poi_badge_earns) 과거 데이터**는
  이번 백필 대상에 포함하지 않았다 — 배지 상세·POI 상세 화면에 과거 오검출 날짜가 남을 수 있다.
- **staging 병합 후 실측 필요** — 실제 Strava 동기화로 신규 피드 이벤트를 만들어 event_at이
  미래로 찍히지 않는지, 표시·정렬이 실제 순서와 일치하는지 확인이 남아 있다.
