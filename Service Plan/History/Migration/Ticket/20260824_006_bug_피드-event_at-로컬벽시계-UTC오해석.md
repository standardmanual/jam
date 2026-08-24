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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증
- [ ] 시각 표기 규칙 (`Service Plan/Specs/UX_WRITING_GUIDELINE.md`)


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

### 잔여 이슈
-
