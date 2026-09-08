# JAM! 통합 배지 발급 로직 — 액티비티배지 엔진 + 아이템배지 드랍 엔진

> 최종 업데이트: 2026-09-08 (잔여 `pending` 5종 — `distinct_time_bands`·`day_of_month`·
> `activities_within_hours`·`month_over_month_ratio`·`vs_personal_average` — 을 `engine`으로
> 전환. `month_over_month_ratio`·`vs_personal_average`는 거리(km) 지표로 고정 판정. 부수 발견:
> `badgeProgress.ts` 진행률 분류의 「숨은 축」 결함(다축 결합 시 신규 축이 조용히 무시되는 문제)에
> 안전 가드 추가, `personal_record_break_metric` 미충족 4계열(`walking:B3`/`B4`·`running:R3`·
> `cycling:R2`, 32종)이 여전히 짝 필드 없이 막혀 있음을 확인 — 채우는 마이그레이션 별도 작성 —
> 티켓 20260908_1318. 이전: 2026-09-06 (휴식 4종 + `repeat_count` 조합 지원 — 휴식 키 1개까지,
> 전용 술어 `isRestDrivenRepeatCondition` 신설, 진행률 `'repeat'` 축 연결, 어드민 저장 가드도 함께
> 갱신 — 티켓 20260906_2056). 그 이전: v5 스칼라 7종(`max_elevation_m`·`max_speed_kmh`·`single_distance_km`·
> `single_elevation_m`·`avg_heartrate_bpm`·`avg_watts`·`avg_cadence`)·`weekly_streak`를
> `pending`→`engine`으로 전환, `cumulative_duration_hours`·`monthly_count` 신규 필드 추가(둘 다
> `engine`), `rest_after_long`의 짝 필드에 `duration_minutes`를 OR로 추가해 실제 발급 가능해짐,
> 반복 회차 계산에 「기간 단위 회차」(`streak_days`·`weekly_count`·`monthly_count`·`weekly_streak`
> + `repeat_count` 조합) 지원 추가, 케이던스 ×2 정규화(러닝·트레일러닝만, 자전거 제외) —
> 티켓 20260906_0110(CLOSED). 그 이전: `NormalizedActivity` 확장 6필드 수집·백필 경로(§2.1-1) 추가 —
> 티켓 20260905_0029. 그 이전: 배지트리 진행 계산 계층(§2.13) 신설·화면 연결(2b~2d)·계열 진행
> 스냅샷 테이블+정합성 트리거(3차 1단계, 마이그레이션 128)·직전 동기화 비교 배너(3차 2단계,
> 배너 텍스트만) — 티켓 20260904_0631/0921/1058/1156/1425)  
> **배지 운영 문서 4종 체계** — 이 문서(로직) + [`CONDITION_JSON_SPEC.md`](CONDITION_JSON_SPEC.md)(조건 필드 전체 스펙) + `액티비티배지 레시피.md`(액티비티배지 전체 목록) + `아이템북 레시피.xlsx`(아이템배지 전체 목록 + 세계관 인접)  
> DB 시드: `supabase/migrations/033_reseed_activity_badges_v3.sql` (액티비티배지 115종) + `supabase/migrations/118_reapply_walking_badges_v4.sql` (걷기 신규 32종. 076_walking_badges_v4.sql로 2026-08-08 작성됐으나 프로덕션에 한 번도 실행되지 않은 채 방치돼 있던 것을 발견해 118로 재적용, 티켓 20260831_2100)

---

## 1. 전체 구조

Strava 활동 동기화(`src/lib/strava/sync.ts`) 1회가 두 엔진을 모두 호출한다:

```
Strava 싱크
 ├─ ① 액티비티배지 엔진 (badge-engine) — 조건 충족 시 결정론적 발급
 └─ ② 아이템배지 드랍 엔진 (drop-engine) — 확률·서사 기반 드랍
```

| 구분 | ① 액티비티배지 엔진 | ② 아이템배지 드랍 엔진 v2 |
|------|--------------------|--------------------------|
| 대상 | `type='activity'` (147종: 기존 5종목 체계 115종 + 걷기 v4 신규 32종) | `type='item'` (~900종: 10세계관 × 10컬렉션) |
| 성격 | **성취의 증명** — 조건 달성 = 발급 (결정론) | **수집의 재미** — 활동당 최소 1개, 내용은 변동 (확률론) |
| 평가 기준 | 유저 **전체 활동 이력** 누적 평가 | **단일 활동**(이번 싱크 배치) 기준 |
| 저장 | `user_activity_badges` | `inventory_items` (일련번호 무작위) |
| 구현 파일 | `src/lib/badge-engine/index.ts` ✅ 구현 | `src/lib/drop-engine/` ✅ v2 구현 (2026-07-21) |
| 게이미피케이션 역할 | 장기 목표·티어 성장 (mastery) | 세션 보상·세계관 서사·수집 (variable reward) |

**공통 정책 (두 엔진 공유):**
- 첫 싱크 게이트: `users.initial_sync_done=false`인 첫 싱크는 고가치 발급 제한 (액티비티=계열의 첫 칸만 — 등급형은 Common 외 차단·무한레벨형은 Lv.1 외 차단, 아이템=첫 드랍 확정이되 rarity 정책 적용)
- **가입 시점 앵커**(티켓 20260905_0030 §5): 누적 조건이 보는 이력은 `users.created_at` 이후로 잘린다. `getActivityHistory(supabase, userId, sinceDate)`의 3번째 인자를 호출처 4곳(`badge-engine/index.ts` · `missions/checker.ts` · `strava/sync.ts`의 진행 스냅샷 · `badges/tree/page.tsx`)이 전부 넘긴다 — 한 곳이라도 빠지면 화면·미션·발급이 서로 다른 창을 본다. **이번 싱크 배치는 앵커를 거치지 않는다**(첫 싱크의 «마지막 활동 1건 정산»이 성립해야 하므로). 앵커로 `strava_connections.created_at`을 쓰지 않은 이유는 `activity-history.ts`의 `getSignupAnchorDate` 주석 참조
- 섀도우밴: 밴 레벨에 따라 고가치(rarity) 발급 차단 — `src/lib/abusing/`
- 피드 이벤트: 발급 시 `recordFeedEvent` ('badge_earned' / 'item_dropped')
- **새 활동 0건 동기화에서도 ① 배지 평가는 항상 실행된다** *(2026-09-06, 티켓 20260906_1430)*:
  유저가 "동기화" 버튼을 눌러도 새로 받아올 활동이 없으면 `evaluateBadges(userId, [])`를
  빈 배열로 호출한다 — 카탈로그가 확장된 시점부터 그 유저의 다음 새 활동까지 「조건은
  충족인데 미발급」인 창이 열리는 것을 막기 위함(실측 사고: 22일간 미발급). **② 드랍
  (`tryItemDrop`)과 미션 평가는 여전히 새 활동이 1건 이상 있을 때만 실행된다** — 이
  게이트는 그대로 유지. 호출 경로는 `src/lib/strava/sync.ts`의 `processFetchedActivities`
  최상단 이른 반환(`rawActivities.length === 0`)과 `activitiesFiltered.length > 0` 삼항
  게이트 두 곳 — 배지 평가에 한해서만 무조건 호출로 바뀌었다.
- **수동 입력 활동은 현재 걸러지지 않는다** ⚠️ *(2026-09-05 실측 정정)*: 2026-08-10에 Strava `manual=true` 활동을 `getActivities()` 반환 단계에서 제외하는 필터를 넣었으나, 정상 활동까지 누락되는 버그가 나 커밋 `86380c55`("revert: Strava manual 필터 제거")로 되돌려졌다. **`src/lib/strava/{api,sync}.ts`에 `manual` 참조가 0건이며**, 수동 입력 활동은 지금도 두 엔진 평가 대상에 들어오고 `strava_activities`에도 기록된다. 재도입 여부는 미결이다 — v5 카탈로그(티켓 20260905_0035)가 «수동 입력은 걸러진다»를 어뷰징 전제로 삼으면 그대로 어긋난다. `device_name`(기록 기기) 기반의 "조작된 파일 업로드" 필터도 상세 API 추가 호출이 필요해 미구현이다 — [Tickets/20260810_001](../../Tickets/20260810_001_Service_Strava-수동입력-활동-동기화-제외.md) 참고.

---

## 2. 액티비티배지 엔진 (구현됨 — v5)

### 2.1 입력 / 출력

```
입력: userId, activities[] (NormalizedActivity)
출력: { earned: BadgeEarnedInfo[], missed: BadgeMissedInfo[] }
```

#### 2.1-1 `NormalizedActivity` — 확장 6필드 (2026-09-05, 티켓 20260905_0029)

정규화 지점은 `src/lib/strava/sync.ts`의 `normalizeActivity()` **한 곳뿐**이다. 여기서 만든
객체가 그대로 `strava_activities.normalized`(jsonb)에 저장되고 두 엔진의 입력이 된다.

기존 12필드에 더해 **Strava Summary(목록) 응답에 이미 오던 6필드**를 함께 읽는다 —
추가 API 호출이 없다.

| 정규화 필드 | Strava 필드 | 변환 | 대응 조건 키 |
|---|---|---|---|
| `elapsedTimeSec` | `elapsed_time` | 없음(초) | 대응 조건 키 없음. **활동 1건 안의 «정지 시간»**(= `elapsedTimeSec - movingTimeSec`)을 계산할 수 있으나 §2.16의 「휴식」(날 단위 공백)과는 **다른 축**이다 — 한 단어를 두 뜻으로 쓰지 않도록 쓰게 되면 이름부터 다르게 만들 것 |
| `maxSpeedKmh` | `max_speed` | **m/s → km/h** | `max_speed_kmh` |
| `maxElevationM` | `elev_high` | 없음(m) | `max_elevation_m` |
| `avgHeartrateBpm` | `average_heartrate` | 없음(bpm) | `avg_heartrate_bpm` |
| `avgWatts` | `average_watts` | 없음(W) | `avg_watts` |
| `avgCadence` | `average_cadence` | **러닝·트레일러닝만 ×2**(양발 합계 spm으로 정규화). 사이클은 원값 그대로(rpm — 편족 개념이 없어 대상 아님) | `avg_cadence` |

- **케이던스 ×2 정규화** (2026-09-06, 티켓 20260906_0110 ⑤): Strava가 `average_cadence`로 주는
  값은 종목마다 관례가 다르다 — 러닝·트레일러닝은 한쪽 발만 센 spm, 사이클은 rpm(양발 개념
  자체가 없음). `normalizeCadenceForActivityType()`(`src/types/strava.ts`)이 러닝·트레일러닝에만
  ×2를 적용해 «양발 합계 spm»으로 통일하고, 저장 시점(신규 싱크의 `normalizeActivity` + 백필의
  `mergeExtendedFields` 양쪽)에 적용한다 — 조건값(`avg_cadence`)도 이 기준(예: 180)으로 쓴다.
  기존 저장분(러닝 574행·트레일러닝 52행)은 마이그레이션 141로 재정규화했다(자전거는
  `avgCadence` 보유 행 자체가 0건이라 영향 없음)
- **값이 없으면 키 자체를 만들지 않는다** (`null`을 넣지 않는다). 심박계·파워미터가 없는
  유저의 활동이 «데이터 없음 = 카운트 안 함»으로 자연히 동작해야 하고, 화면에
  「심박 데이터가 있는 활동에서만 계산돼요」 같은 안내를 넣지 않기로 확정했다. `0`은 버리지
  않는다 — 「해수면 고도 0m」과 「필드 없음」은 다른 사실이다
- 조건 키(snake_case) ↔ 정규화 필드(camelCase) 대응은 `conditionRegistry.ts`의 `activityField`가
  단일 출처다. 파생물 `CONDITION_ACTIVITY_FIELD`로 꺼내 쓴다
- **`splits_metric`(→ `negative_split`)은 수집하지 않는다.** 상세 엔드포인트에만 있어 활동
  1건당 호출 1회가 들고, 상한을 두면 조건을 채웠는데도 배지가 조용히 안 나온다. `getActivityById`의
  잘못 좁혀진 반환 타입만 `StravaDetailedActivity`로 고쳤다(수집 경로는 만들지 않았다)
- 기존 활동(2026-09-05 실측 873행)은 일반 싱크로 채워지지 않는다 — `getProcessedStravaIds`가
  전부 걸러내기 때문이다. 전용 백필 경로가 `src/lib/strava/backfill.ts` +
  `scripts/backfill-strava-extended-fields.ts`이며 **목록 엔드포인트만 쓰고 배지·드랍·미션·소식을
  일절 호출하지 않는다**(재평가하면 배지 홍수가 난다). 갱신한 행은 `processed_via = 'manual_backfill'`

### 2.2 발급 파이프라인

```
Step 0. 초기 싱크 상태 조회 (users.initial_sync_done)
Step 0.5. [가입 앵커] 이력 조회 창을 users.created_at 이후로 자른다 — 「과거 이력은 아예 배제」
          (티켓 20260905_0030 §5. 이번 동기화 배치는 앵커와 무관하게 합쳐진다)
Step 1. type='activity' 배지 전체 조회 (유효기간 필터)
Step 2. 유저 보유 배지 조회 (오류 시 즉시 종료)
Step 2.5. [보유 컨텍스트] 보유 배지 «정의»를 조회해 세 가지를 만든다 —
          ownedBadgeNames(**등급형 이름만**, §2.15) · highestOwnedTierByName ·
          highestOwnedLevelByFamily · ownedBadgeDefs(계열·등급·종목, 교차 게이트용)
Step 3-A. [등급형] 이름 그룹 단위 평가:
  A. 이미 보유 → 스킵
  B. 보유보다 낮은 tier → 스킵 (성장 티어)
  C-1. evaluateBadgeGates() — ① prerequisite_badge_names OR 매칭 ② 2단 교차 게이트 (§2.15)
  C-2. evaluateConditionDetailed — 전체 이력 기준 AND 평가
  D. eligible 중 최상위 tier 1개만 후보 (나머지 missed)
Step 3-B. [무한레벨형] 계열(family_key) 단위 평가 — 「보유 레벨 + 1」부터 연속:
  A. 보유 레벨 이하 → 스킵 / 프런티어보다 위 → missed('이전 레벨 미획득', 조건 평가 안 함)
  B. evaluateBadgeGates() — 등급형과 같은 규칙
  C. 통과하면 후보로 올리고 다음 레벨을 이어서 검사 (연속 발급, 최상위 1개가 아니다)
  ※ 등급 서열 비교(RARITY_TIER)를 적용하지 않는다 — rarityTier(null)=0이라 0 <= 0으로 매번 탈락한다
Step 3-C. [반복형] 배지 단위 평가 — **보유해도 후보에서 빠지지 않는 유일한 종류** (§2.14):
  A. evaluateBadgeGates() — 등급형과 같은 규칙 (세 경로가 이 함수 하나를 쓴다)
  B. evaluateConditionDetailed — repeat_count 회차 임계값 포함
  C. 미보유 → action='issue' / 보유 + 이번 배치에 새 회차 → action='increment'
  ※ 성장 티어 병합·트랙 병합 모두 적용하지 않는다 — 하위 등급도 계속 카운터를 받아야 한다
  ※ 세 경로의 evaluateConditionDetailed에는 **가입 앵커를 함께 넘긴다** — 휴식 조건이
    앵커를 하한으로 봐야 「데이터 없음」을 「쉬었음」으로 읽지 않는다 (§2.16)
Step 4. [진행 트랙 중복 제거] 단일 조건 배지는 activity_type:조건타입 트랙당 최고 1개
  ※ 무한레벨형·반복형은 트랙 병합 대상이 아니다(progressionKey=null) — 걸리면 발급분이 1개로 접힌다
Step 4.8. [첫 싱크 게이트] 첫 싱크면 계열의 첫 칸(등급형=Common / 레벨형=Lv.1) 외 전부 missed
          ※ action='increment'는 발급이 아니므로 이 게이트의 대상이 아니다
Step 5. [홍수 방지] ❌ **제거됨** — 30일 롤링 캡은 더 이상 없다 (§2.6 참조, 코드에도 캡 없음)
Step 6. [DB 반영] action='issue' → user_activity_badges INSERT (earn_count·earn_history 포함)
                  action='increment' → increment_activity_badge_earn() RPC (회차 카운터만)
Step 7. [부수효과] **DB 반영에 성공한 'issue'만** — earned 배열 · 잼 포인트 · 피드 이벤트 ·
        결산 · 획득 연출. 'increment'는 여기 오지 않는다 (§2.14)
  ※ 계기 활동(`selectTriggerActivity`)은 4분기다 — ① 반복형의 그 회차 ② **휴식의 복귀 활동**
    (§2.16) ③ 종목 지정 배지의 첫 적격 활동 ④ 이력의 첫 활동
Step 8. initial_sync_done 갱신
```

> **Step 6~8을 가른 이유** (2026-09-05, 티켓 20260905_0030 B1): 예전에는 `earned.push`가
> INSERT보다 **먼저**라, 발급이 실제로 실패해도(중복키·FK 위반) 결산·획득 연출·피드에는
> 발급된 것으로 나갔다. 반복형은 「발급 O / 카운터만 O」를 구분해야 하는데 그 상태로는
> 진실 원천이 없다. 이제 `earned`에는 **DB 반영에 성공한 발급만** 담긴다.

### 2.3 조건 평가 필드 (모든 필드 AND)

| 조건 필드 | 평가 방식 |
|-----------|-----------|
| `activity_type` | 활동을 해당 타입으로 필터링 |
| `distance_km` / `elevation_gain_m` | **누적 합계** ≥ 조건값 (기본값). `same_activity: true`가 함께 있으면 예외적으로 **한 활동에서 동시/단독 충족**해야 한다 — 현재 카탈로그에서는 T1 `야생의 첫발`(두 필드 복합)과 T23 `그냥 나갔다 옴`(단독 `distance_km`) 2건이 이 플래그를 쓴다(2026-08-31 복원, 티켓 20260831_2100 및 후속). 자세한 배경은 §2.3-1 참고 |
| `same_activity` (2026-08-31 신규) | 그 자체로는 pass/fail을 만들지 않는 필터 성격 플래그. `distance_km`/`elevation_gain_m`과 함께 있을 때만 의미를 가지며, 이 필드(들)의 평가 방식을 "누적 합계"에서 "한 활동 동시/단독 충족"으로 전환한다. 필드가 하나뿐이어도(T23) 적용 가능 — 필드 조합만으로는 판별 불가하므로 명시적 플래그가 필수다 |
| `total_count` | 필터된 활동 건수 ≥ 조건값 |
| `min_speed_kmh` / `duration_minutes` | **단일 활동 최고값** ≥ 조건값 (min_speed_kmh는 cycling 등 속도 단위) |
| `max_pace_sec_per_km` | **단일 활동 최고 페이스** ≤ 조건값 — 값이 작을수록 빠름(km/h와 부등호 반대). running 등 페이스 단위 종목에 사용 |
| `streak_days` | 최장 연속 활동일 ≥ 조건값 |
| `weekly_count` | 한 주 내 활동 횟수 최대값 — `time_range` 동반 시 **시간대 내 활동만 카운트** (엄격 평가) |
| `weekend_duration_hours` | 주말(토·일) 활동 이동시간 최대값(시간) ≥ 조건값 |
| `month` + `monthly_km` | 월별 누적 거리 최대값 ≥ 조건값 (month 없으면 전체 연-월 그룹 최대) |
| `season` + `season_count` | 해당 계절 활동 횟수 ≥ 조건값 |
| `temperature_min_c` / `temperature_max_c` | Strava average_temp ≥/≤ 조건값 (폭염/혹한) — 날씨 데이터 없으면 fail |
| `time_range` | startDateLocal의 HH:MM이 {start,end} 범위 내 (자정 걸침 지원) |
| `poi_id` | ⚠️ 엔진 내 평가 불가 — GPS 경로 매칭(matchPoisForActivity)으로 별도 발급 |
| `day_of_week` (2026-08-08 신규) | 단일값: `time_range`처럼 AND 필터. 배열+`total_count` 동시 지정 시 "요일별 독립 카운터" 특수모드(배열의 각 요일이 각각 `total_count` 충족 필요) — 현재 T08 전용 |
| `active_days_count` (2026-08-08 신규) | 축1 게이트 통과 활동의 `(startDateLocal ?? startDate).slice(0,10)` 고유 날짜 `Set` 크기 ≥ 조건값 (연속 아님) |
| `season_count_all` (2026-08-08 신규) | 봄/여름/가을/겨울 각 계절 활동 횟수가 전부 조건값 이상 (계절별 독립 카운터, `season`+`season_count`와 별개 필드) |
| `month` (2026-08-08 확장) | 기존 `number`에서 `number | number[]`로 확장 — 배열이면 여러 달을 OR로 묶어 `monthly_km`와 결합(예: 장마철 6~7월) |
| `repeat_count` (2026-09-05 신규) | **기준 조건을 통째로 만족한 활동 건수** ≥ 조건값. `total_count`(필터 통과 건수)와 다르다 — 회차 정의는 `collectRepeatOccurrences()` 한 곳. 활동 1건 단위 축(`PER_ACTIVITY_KEYS`, v5 스칼라 7종 포함)뿐 아니라 **「기간 단위 회차」**(`streak_days`·`weekly_count`·`monthly_count`·`weekly_streak`와 결합 — 예: 「주 3회를 채운 주가 5번」)도 2026-09-06(티켓 20260906_0110 ②)부터 셀 수 있다. §2.14 · CONDITION_JSON_SPEC §2.11 |
| `prerequisite_badge_names` | Step 3 C-1에서 처리 (OR 매칭). **보유한 등급형의 이름만** 대상이다 — v5는 레벨형·반복형이 등급형과 이름을 공유할 수 있어 이름이 배지를 유일하게 식별하지 못한다 (§2.15) |
| `cross_in_axis` / `cross_between_axis` / `gate_mission_badge` (2026-09-05 신규) | Step 3 C-1에서 처리 — **계열(`family_key`) 기준** 2단 교차 게이트. 교차 둘은 서로 OR, 미션 게이트는 AND. §2.15 |
| `rest_after_streak` / `rest_after_long` / `return_gap_days` / `interval_days` (2026-09-05 신규) | **인접한 두 활동 사이의 «닫힌 공백»** 판정. 활동이 0~1건이면 공백을 계산하지 않는다. 판정은 `activityFilters.ts`의 `evaluateRestConditions()` 한 곳. `rest_after_long`의 짝 필드는 `single_distance_km` **또는** `duration_minutes`(OR, 2026-09-06 티켓 20260906_0110 ④ 추가) — 이제 실제로 발급된다. §2.16 |
| `max_elevation_m` / `max_speed_kmh` / `single_distance_km` / `single_elevation_m` / `avg_heartrate_bpm` / `avg_watts` / `avg_cadence` (v5 스칼라 7종) / `weekly_streak` (2026-09-06, 티켓 20260906_0110 ②) | `pending`에서 `engine`으로 전환됨. **활동 1건의 값**을 `CONDITION_ACTIVITY_FIELD`로 정규화 필드에서 꺼내 비교(스칼라 7종), `weekly_streak`는 `calcMaxWeeklyStreak`가 연속 주(월~일) 최장 길이를 계산. 목록과 의미는 [`CONDITION_JSON_SPEC.md`](CONDITION_JSON_SPEC.md) §2.10 |
| `cumulative_duration_hours` / `monthly_count` (2026-09-06 신규, 티켓 20260906_0110 ①) | 레지스트리에 키가 없어 v5 카탈로그 시딩(0035)에서 통째로 빠졌던 5계열 27종(누적 이동시간·월간 활동 횟수)을 복구하기 위한 신규 필드. 둘 다 `engine` — `cumulative_duration_hours`는 누적 이동시간 합계, `monthly_count`는 월별 활동 횟수 최대값(또는 `repeat_count`와 결합 시 그 횟수를 채운 달의 수) |
| `personal_record_break` / `personal_record_break_metric` (2026-09-06, 티켓 20260906_2055) | `pending`에서 `engine`으로 전환됨. 가입 시점 이후 활동을 시간순으로 훑어 `personal_record_break_metric`이 가리키는 지표(콘텐츠가 채워진 3종만 — `single_distance_km`·`duration_minutes`·`max_elevation_m`)가 그때까지의 최고 기록을 **엄격히 초과**한 횟수 ≥ 조건값. 최초의 유효 활동은 항상 1회(직전 기록이 없으므로). 판정은 `activityFilters.ts`의 `countPersonalRecordBreaks()` 한 곳(발급·진행률 공유). 짝 필드 강제 목록(`PAIR_ENFORCED_CONDITION_KEYS`)에 편입돼 `personal_record_break_metric` 없이는 발급되지 않는다 |
| `distinct_time_bands` / `activities_within_hours` / `month_over_month_ratio` / `vs_personal_average` / `day_of_month` (2026-09-08, 티켓 20260908_1318) | `pending`에서 `engine`으로 전환됨. `distinct_time_bands`는 `badgeConditionText.ts`와 같은 시간대 6구간(새벽·아침·점심·오후·저녁·심야) 경계로 서로 다른 시간대 수를 센다(`streak_days`와 결합 시 그 스트릭 창 안에서만). `activities_within_hours`는 `startDate` 기준 슬라이딩 윈도우. `day_of_month`는 `total_count`와 짝을 이루는 필터. `month_over_month_ratio`/`vs_personal_average`는 지표를 **거리(km)로 고정**해 전월 대비·평소 평균 대비 배수를 판정(둘 다 지표 선택 짝 필드가 레지스트리에 없음). 판정은 `activityFilters.ts` 신규 헬퍼, 회차 결합은 `repeatOccurrences.ts`. 목록과 의미는 [`CONDITION_JSON_SPEC.md`](CONDITION_JSON_SPEC.md) §2.10 |
| **잔여 `pending` 2종 + `route`** (3종) | ❌ **평가 미구현 — fail-closed로 막힌다.** `daily_once_count`·`negative_split` + `route`. 목록과 의미는 [`CONDITION_JSON_SPEC.md`](CONDITION_JSON_SPEC.md) §2.10 |

> **조건 필드 선언의 단일 출처는 `src/lib/badge-engine/conditionRegistry.ts`다** (2026-09-05,
> 티켓 20260905_0028). 키·라벨·단위·입력 타입·min/max/step·짝 필드·방향성·**평가 구현 여부**를
> 한 곳에서 선언하고, `ALL_CONDITION_KEYS`·`MEASURABLE_CONDITION_KEYS`·어드민 조건 폼의
> 커버 목록·어드민 목록/상세의 조건 문구가 전부 여기서 파생된다. DB 쪽 2곳(CHECK 제약,
> 계열 정합성 트리거의 `measurable_keys`)은 가장 마지막 마이그레이션(**140**)이 같은 선언을 옮겨 적었고,
> 어긋나면 `condition-registry.test.ts`가 깨진다.

#### 2.3-0 fail-closed — 평가할 수 없는 필드가 있으면 발급하지 않는다 (2026-09-05, 티켓 20260905_0028)

`evaluateConditionDetailed`는 **조건 평가를 시작하기 전에** `condition_json`의 모든 키를
레지스트리와 대조한다. ① 레지스트리에 없는 키(오탈자) ② `evaluation: 'pending'`인 키
③ **짝 필드(`pairedWith`)가 하나도 없어 뜻이 완성되지 않는 키**(2026-09-05 추가, 티켓
20260905_0030 B3)가 하나라도 있으면 즉시 `pass:false`를 돌려주고, 사유는 「평가할 수 없는
조건 필드 — 알 수 없는 필드: … / 평가 구현 대기: … / 짝 필드 없음: …」로 남는다.
판정은 `findBlockingConditionKeys()` → `hasBlockingConditionKeys()` 한 쌍이다.

**짝 필드 강제는 `PAIR_ENFORCED_CONDITION_KEYS`(휴식 4종 + `personal_record_break`, 2026-09-06
티켓 20260906_2055 추가)에만 적용한다.** `rest_after_streak`는 `streak_days`가 없으면 「며칠
연속 뒤인가」가, `rest_after_long`은 `single_distance_km`이 없으면 「무엇이 장거리인가」가,
`personal_record_break`는 `personal_record_break_metric`이 없으면 「어느 지표의 기록인가」가
정의되지 않는데, DB CHECK는 키 이름만 보므로 **짝 없이 저장돼도 통과하고 평가 시점에 조용한
오판정이 된다.** 기존 필드(`same_activity`↔`distance_km` 등)는 카탈로그에 실적이 있어 즉시
강제하면 이미 발급된 배지가 미발급으로 뒤집힐 수 있어 **강제하지 않는다** — 새로 평가가 열리는
필드만 실적 0건인 시점에 못 박는다.

**평가 주체는 셋으로 구분한다** — `boolean` 하나가 세 가지 뜻을 겸하던 것을 풀었다:

| 값 | 뜻 | fail-closed |
|---|---|---|
| `engine` | `evaluateConditionDetailed`가 직접 수치·필터 검사 (43종) | 통과 |
| `external` | **`evaluateConditionDetailed` 밖**에서 처리 — `poi_id`(체크인 파이프라인) · `mission_reward`(미션 보상 경로) · `prerequisite_badge_names`와 교차 게이트 3종(엔진 안의 후보 선별 단계 `evaluateBadgeGates()`) (6종) | 통과 |
| `pending` | 아직 아무도 평가하지 않는다 — `daily_once_count`·`negative_split` + `route` (3종) | **막힘** |

이 방어가 필요한 이유는 `matchesPerActivityCondition()`(`index.ts`)이 **아는 키만 검사하고
마지막에 `return true`** 하기 때문이다. 막지 않으면 미구현 필드가 «발급 안 됨»이 아니라
**«무조건 발급»**이 된다 — §2.7의 084 사고와 같은 유형의, 에러 없이 조용히 뒤집히는 결함이다.

v5 신규 20종 중 **휴식 4종은 2026-09-05(티켓 20260905_0030 B3)에**, **v5 스칼라 7종 +
`weekly_streak`는 2026-09-06(티켓 20260906_0110 ②)에**, **`personal_record_break`·
`personal_record_break_metric`은 2026-09-06(티켓 20260906_2055)에**, **`distinct_time_bands`·
`day_of_month`·`activities_within_hours`·`month_over_month_ratio`·`vs_personal_average`는
2026-09-08(티켓 20260908_1318)에 `engine`으로 뒤집혔다**
(§2.16). 남은 `pending`은 `daily_once_count`·`negative_split`(전부 「이력 패턴」 계열)과 기존
필드 중 `route` 하나뿐이다.

⚠️ **`engine`으로 뒤집혔다고 곧바로 발급되는 것은 아니다.** `month_over_month_ratio`/
`vs_personal_average`를 `personal_record_break`와 함께 쓰는 4계열(`walking:B3`「지난달의
나에게」·`walking:B4`「평균의 배신」·`running:R3`「지난달의 주자」·`cycling:R2`「지난달의
라이더」, 32종)은 짝 필드 `personal_record_break_metric`이 콘텐츠에 채워져 있지 않아
`PAIR_ENFORCED_CONDITION_KEYS` 강제로 여전히 막힌다(`seed_personal_record_break_metric.sql`이
7계열만 채우고 이 4계열은 범위 밖으로 남겼던 결과). 채우는 마이그레이션
(`seed_personal_record_break_metric_month_avg_families.sql`)을 작성해뒀다 — 실행 여부는
별도 확인 필요.

`route`는 타입·스키마·DB CHECK에만 있고
badge-engine에 `condition.route` 참조가 **0건**이라(실측 2026-09-05) `pending`으로 두었다 —
쓰는 배지가 0건이라 회귀 없이 정직하게 표기할 수 있다. 평가 구현 없이 쓰려면 먼저 구현하거나
스키마에서 제거해야 한다(`CONDITION_JSON_SPEC.md` §6).

**미션 평가 경로는 예외 통로가 필요하다.** `missions/checker.ts`가 `MissionCondition`을
`BadgeCondition`으로 캐스팅해 같은 함수에 넘기는데, 미션 어휘에는 배지 조건에 없는 키가 있다
(`count`·`badge_id`). 열어 두지 않으면 fail-closed가 「알 수 없는 필드」로 판정해 **미션이 영구
미달성**이 된다. `evaluateConditionDetailed`의 `extraAllowedKeys` 옵션이 그 통로이며,
**`pending` 판정에는 영향을 주지 않는다** — 평가 구현이 없는 건 미션에서도 마찬가지다.

> 이 통로는 티켓 `20260906_2231`(게이트 미션 40종)에서 `mission_type='engine_condition'`
> 전용으로 한 번 더 확장됐다 — 다만 그쪽은 `evaluateConditionDetailed`를 직접 호출하지 않고
> `src/lib/missions/engineCondition.ts`가 **배지엔진 위임분만 골라 넘긴다**(미션 전용 신규
> 어휘 — 주기 축 「매기간 M회」·부분집합·서로 다른 요일/달 수 — 는 배지엔진이 모르는 필드라
> 그대로 넘기면 fail-closed에 걸린다). 상세는 §2.11 참고.

**진행률도 같은 기준을 쓴다.** `classifyBadgeProgressKind`는 아는 축만 세므로 «기존 축 1개 +
`pending` 필드 1개»인 조건은 대기 필드를 무시한 채 진행률을 그렸다 — 발급은 막히는데 화면에는
달성률이 뜨는 상태다. fail-closed에 걸리는 조건은 `unsupported`로 돌려 표시도 함께 막는다.
**평가가 열린 뒤에도 진행 축이 없는 필드는 같은 처리를 받는다** — `repeat_count`(§2.14)와
휴식 4종(§2.16)이 그렇다. 축이 하나 있다고 그것만 그리면 나머지 요구를 숨긴 채 100%가 뜬다.

#### 2.3-1 복합 조건 배지 — "이력 전반 독립 평가"가 기본, "동시 충족"이 예외 (2026-08-31 복원)

두 개 이상의 수치 필드가 같은 `condition_json`에 있을 때, 기본 평가 방식은 **필드마다 각자
이력 전체에서 최고 기록으로 독립 평가**한다 — 서로 다른 세션에서 각각 달성해도 AND를
만족하면 발급된다. 예를 들어 R7 `스피드 엔듀러`(`max_pace_sec_per_km` + `duration_minutes`)는
어제의 빠른 5km와 오늘의 느린 장거리 러닝을 조합해도 통과한다. 카테고리 2 배지 4종
(R7 스피드 엔듀러, C7 산악 라이더, H7 혹한 장정, T7 알파인 트레일러) 전부 이 방식으로
평가되며, 실제 코드(`relevantPerActivityKeys`의 "이력 전반 독립 평가" 분기)가 이렇게
동작함을 확인했다(`ACTIVITY_BADGES.md` §"카테고리 2 복합 배지 평가 주의" 참고).

`time_range`가 섞인 조합(W5 야간 걷기, W7/W8/T8 새벽·점심 빈도 등)은 예외다 — "그 시간대에
일어난 활동"이라는 결합이 본질적이므로 그 활동 자체가 시간대 조건을 만족해야 하고, 계속
단일 활동 동시 충족으로 평가된다.

**"한 활동에서 동시/단독 충족"이 필요한 배지는 현재 T1 `야생의 첫발`과 T23 `그냥 나갔다 옴`
2건뿐이다.** T1(`distance_km` + `elevation_gain_m`, 문서에 "이력전반" 문구 없음)은 두 필드
복합, T23(단독 `distance_km:0.6`, 문서에 "(단일 활동)" 명시)은 필드 하나뿐이라 필드 조합만으로는
판별 불가 — 둘 다 `condition_json`에 `same_activity: true`를 명시해 표시한다.

⚠️ **회귀 이력**: 커밋 `27163030`(2026-07-31)이 "서로 다른 활동의 필드를 조합해 잘못
통과되던 버그"(다중 필드 복합 조건에서만 실제로 발생)를 고치면서, 단독 `distance_km`/
`elevation_gain_m`(원래 누적 합계여야 함)과 카테고리 2의 "독립 이력" 평가까지 전부 "한
활동 동시 충족"으로 과잉 일반화했다. 2026-08-31(티켓 20260831_2100)에 문서 기준으로
복원하면서, 진짜 버그였던 T1 케이스만 `same_activity` 플래그로 명시적으로 남겼다. 이후 같은
티켓의 후속 작업으로 T23(단독 `distance_km`도 문서상 "단일 활동"이 맞는 예외)에도 동일
플래그를 적용했다(마이그레이션 120).

### 2.4 성장 티어 정책

같은 이름 그룹 내 common → rare → epic → mystic 순서로만 성장. 상위 달성 시 하위를 건너뛰고 **최상위 1개만** 발급.

```
예시: "첫 숨결" 그룹
  - common(3km) 보유 → rare(20km) 달성 시: rare만 발급
  - epic(60km) 달성 시 common·rare 조건도 통과하지만: epic 1개만 발급
```

**무한레벨형(`badges.rarity IS NULL`)에는 적용하지 않는다** (v5, 티켓 20260905_0030). 레벨형은
등급 서열에 속하지 않으므로 `family_key`별로 「보유 레벨 + 1」부터 **연속 순차 발급**한다 —
상위 레벨만 주면 레일에 획득하지 않은 하위 레벨 구멍이 영구히 남기 때문이다(다음 평가에서는
보유 최고 레벨이 이미 그 위라 하위가 다시 후보가 되지 않는다). 폭주는 첫 싱크 게이트(Lv.1만)와
가입 시점 앵커가 함께 막는다. 배지 종류 판정 기준은 **`rarity IS NULL` 하나뿐**이며
(`isLeveledBadge()`), 보유 배지 집계에서도 레벨형은 `highestOwnedTierByName`에 섞지 않는다 —
레벨형이 등급형 계열과 같은 이름을 쓸 수 있어 0이 섞이면 티어 판정이 오염된다.

**반복형(`rarity` + `condition_json.repeat_count`)에도 적용하지 않는다** (v5 B1). 반복형의
등급 사다리는 같은 이름의 4장이 임계값만 1·5·20·50회로 다른 형태라, 성장 티어를 적용하면
Rare를 얻는 순간 Common이 후보에서 빠져 **하위 등급의 회차 카운터가 멈춘다**. 보유 배지 집계
(`highestOwnedTierByName`)에도 넣지 않는다.

### 2.5 진행 트랙 정책

단일 조건 배지는 `activity_type:조건타입` 트랙으로 묶여 동일 트랙 내 최고값 1개만 발급.

```
트랙 키 예시: 'walking:distance_km', 'running:max_pace_sec_per_km', 'cycling:min_speed_kmh', 'cycling:elevation_gain_m'
```

복합 조건 배지(time_range+weekly_count, max_pace_sec_per_km+duration 등)는 트랙 제외 → 각각 독립 발급.

### 2.6 홍수 방지 (flood cap) — 현재 없음 (2026-08-31 정정)

과거엔 30일 롤링 윈도우 / activity_type당 최대 3개 / mystic → epic → rare → common 우선
통과라는 캡이 있었으나 **제거됐다**. 온보딩 첫 싱크에서 common 배지 여러 개가 동시에
발급되며 자기들끼리 캡을 소진해 이후 정당한 발급까지 막는 문제가 있었기 때문이다
(`src/lib/badge-engine/index.ts` 692~698행 주석 참고). 성과·루틴 배지(`type='activity'`)는
전부 명시적 수치 조건으로 검증되므로 조건 충족 시 항상 발급을 보장한다 — 캡을 두지 않는다.
아이템/드랍 배지는 §3의 drop-engine이 자체 확률·섀도우밴·일일 하향 로직으로 별도 어뷰징을
방지한다.

**v5의 홍수 방지는 캡이 아니라 «발급과 카운터의 분리»다** (2026-09-05, 티켓 20260905_0030 §2).
반복형은 매 회차 `earn_count`만 올리고 임계값(예: 1·5·20·50회)에서만 실제로 발급된다.
**회차 증가는 피드 이벤트도 결산도 만들지 않으므로 애초에 홍수 집계에 잡히지 않는다** —
1분에 16개가 쏟아지던 원인(모든 조건 충족이 곧 발급 1건)을 구조에서 제거한 것이다.
회차는 엔진 로그(`sync_result`)의 `counted` 배열에만 남아 사후 추적이 가능하다.

### 2.7 첫 싱크 게이트 + 선행 배지 게이트

- **첫 싱크**: `initial_sync_done=false`면 **계열의 첫 칸만** 발급한다 — 등급형은 Common(Rare+는 missed), 무한레벨형은 Lv.1(Lv.2+는 missed). 종료 후 true 갱신. 목적: 첫 연동 시 수백 km 이력 보유 유저라도 배지 폭발 방지. (v5 이전에는 `rarity !== 'common'` 한 줄이었고, 등급이 없는 배지는 이 판정에서 항상 탈락했다 — 티켓 20260905_0030 §6)
- **선행 배지**: Rare/Epic/Mystic의 condition_json에 `prerequisite_badge_names: ["배지명A", "배지명B"]` (OR). 해당 배지명의 **등급형** 배지 보유 시 통과. 목적: 동일 종목의 다른 속성 배지를 먼저 경험하게 유도. 계열을 정확히 지정하는 v5 게이트는 §2.15.

| 등급 | 첫 싱크 발급 | 선행 배지 |
|------|-------------|-----------|
| Common | ✅ 허용 | 불필요 |
| Rare/Epic/Mystic | ❌ 차단 | 동일 종목 다른 속성 배지 1개+ (OR) |
| Lv.1 (무한레벨형) | ✅ 허용 | 등급형과 같은 규칙 |
| Lv.2+ (무한레벨형) | ❌ 차단 | 등급형과 같은 규칙 |

**미션 보상 배지 제외** (2026-08-25, 티켓 20260825_028): `condition_json.mission_reward = true`인
배지는 **발급 후보 조회 단계(Step 1)에서 아예 제외**한다. 이 배지들은 미션 완료
(`grantMissionRewards`) 경로로만 지급되며, 동기화 평가로 발급되면 위 선행 배지 게이트가 통째로
열린다. 추가로 `evaluateConditionDetailed`에 두 개의 방어 분기를 둔다:

1. `mission_reward === true` → 항상 `pass:false`(사유: "미션 보상 배지 — 미션 완료로만 지급")
2. **수치 검사 필드(`MEASURABLE_CONDITION_KEYS`)가 하나도 없는 조건 → 항상 `pass:false`**
   (사유: "평가 가능한 조건 없음"). 필터 성격 필드(`activity_type`·`day_of_week`)나 엔진이 모르는
   필드만 남은 조건이 함수 마지막 줄의 `pass:true`로 새는 것을 막는다.

> 배경: 마이그레이션 `084_badge_condition_cleanup.sql`(2026-08-13)이 배지 상세 화면 표시용으로
> 미션보상배지 15종에 `{"mission_reward": true}`를 UPDATE하면서, "조건이 비어 있으면 미발급"이라는
> 기존 가드(키 0개일 때만 동작)를 우회하게 됐다. `mission_reward`는 엔진이 모르는 필드라 어떤 검사
> 블록에도 걸리지 않고 마지막 `pass:true`에 도달해, **해당 종목 활동을 한 번만 동기화해도 미션 없이
> 미션보상배지 3개가 발급되고 본 배지 Rare/Epic/Mystic 게이트가 전부 열리는** 상태였다
> (2026-08-25 발견). 잘못 발급된 이력은 `seed_reset_levelup_missions_20260825.sql`로 회수한다.

**데이터 계약 검증 계층** (2026-08-25, 티켓 20260825_031): 위 3중 방어는 084 사고의 *증상*을
막지만, "condition_json에 런타임 데이터 계약이 없다"는 근본 원인은 별도로 다룬다.
`MEASURABLE_CONDITION_KEYS`는 `src/lib/badge-engine/condition-schema.ts`로 이전해 DB
CHECK 제약·어드민 API 검증과 단일 소스를 공유한다(전체 허용 필드 목록·검증 계층 3단은
[`CONDITION_JSON_SPEC.md`](CONDITION_JSON_SPEC.md) 상단 "데이터 계약 검증" 안내, §2~§3 참조).
요약: ① DB CHECK 제약(`badges_condition_json_known_keys`)이 허용 목록 밖의 키가 담긴
`condition_json`의 INSERT/UPDATE를 거부(최후 방어선, 마이그레이션 포함 모든 쓰기 경로 커버) ②
어드민 API(`findUnknownConditionKeyError`)가 저장 전에 한국어 에러로 먼저 안내 ③
`BadgeForm.tsx`가 `mission_reward`를 조건 필드와 시각적으로 구분된 체크박스로 노출해, 폼
라운드트립(로드→그대로 저장) 중 플래그가 조용히 유실되던 회귀도 함께 수정했다.

**소프트 삭제와 보유 이력의 관계** (2026-08-25, 티켓 20260825_021): 배지 정의가 나중에
소프트 삭제(`badges.deleted_at IS NOT NULL`)되어도, 유저가 이미 획득한 이력은 §2.5
진행 트랙 최고 티어 판정과 위 선행 배지 게이트 판정에서 계속 유효하다. `evaluateBadgesDetailed()`는
"유저가 이미 가진 게 무엇인지"를 삭제 필터가 걸린 발급 후보 카탈로그(`allBadges`)가 아니라
유저의 실제 보유 배지(`user_activity_badges`)를 기준으로 별도 조회해 판단한다. 발급 후보
카탈로그 자체의 삭제 필터(신규 발급 대상에서 삭제 배지 제외)는 그대로 유지된다 — "소프트 삭제는
노출·신규지급만 막고 이미 획득한 유저의 이력은 그대로 유지"라는 20260823_004 원칙의 적용
누락을 바로잡은 수정이다(조사: 20260825_020).

### 2.8 알려진 주의사항

| 항목 | 내용 | 위험도 |
|------|------|--------|
| temperature 조건 | Strava가 average_temp를 제공하지 않는 활동은 날씨 배지 미발급 | 데이터 의존 |
| 주말 판정 | UTC 기준 — KST 주말 경계(토 09시 이전 등) 오차 가능 | 낮음 |
| streak 판정 | UTC 기준 — 자정 직후 활동의 날짜 귀속 오차 가능 | 낮음 |
| poi_id | badge-engine 내 항상 fail — GPS 매칭 파이프라인으로만 발급 | 스켈레톤 |

### 2.9 배지 구성 (v5 — 2026-09-05 전면 교체)

5종목 **194계열 · 630종**. 계열은 `family_key`(`{종목}:{계열코드}`)로 식별한다.

| 종목 | 계열 | 종 | 미션 보상 |
|---|---:|---:|---:|
| 걷기 `walking` | 47 | 153 | 8 |
| 러닝 `running` | 40 | 132 | 8 |
| 자전거 `cycling` | 39 | 126 | 8 |
| 트레일 `trail_running` | 36 | 122 | 8 |
| 등산 `hiking` | 32 | 97 | 8 |
| **합계** | **194** | **630** | **40** |

배지 종류는 셋이고 **묶는 축이 다르다**(§2.14):
등급형(`rarity` 있음·`level` 없음) 298 · 레벨형(`rarity` **NULL**·`level` 있음) 193 ·
반복형(`rarity` + `condition_json.repeat_count`) 139.

**v4 162종은 2026-09-05 전량 폐기했다**(`deleted_at`). 그때 레거시 게이트 미션 15개도
함께 지웠다 — 배지가 폐기되면 `visibility.ts`가 게이트 배지를 못 찾아 `OPEN`을 반환해
**잠금이 전부 풀리기 때문이다**(§2.11).

전체 목록·조건값·설명: **`Specs/Content/ACTIVITY_BADGES.md`**.
DB 시드: `jam-web/supabase/migrations/seed_v5_activity_badges.sql`
(생성기 `Specs/Content/v5_seed_build.py` — 손으로 고치지 말 것).

⚠️ **카탈로그가 엔진 능력을 일부 앞선 상태다.** 630종 시딩 시점(0035)에는 엔진이 평가할 수
있는 것이 약 269종(그중 40종은 미션 전용)뿐이었다. 티켓 `20260906_0110`(CLOSED)이 v5 스칼라
7종·`weekly_streak`의 `pending`→`engine` 전환, 「기간 단위 회차」 지원, `rest_after_long`
짝 필드 확장, `cumulative_duration_hours`·`monthly_count` 신규 필드로 이 격차의 상당 부분을
줄였다(부수 효과로 이 필드들을 단독으로 쓰는 기존 23여 계열의 진행률도 함께 열렸다). 티켓
`20260906_2055`(진행 중)가 `personal_record_break`·`personal_record_break_metric`의 평가
구현을 열어 콘텐츠 값이 채워진 7계열(`walking:B1/B2`·`hiking:R1/R2`·`trail_running:R1~R3`)의
발급 경로를 추가로 열었다. 나머지는 조건 필드가 여전히 `pending`이거나(§2.3-0의 잔여 8종)
`repeat_count`를 셀 수 없어 **fail-closed로 막힌다.** 잘못 발급되는 경로는 없다. 티켓
`20260908_1318`이 잔여 `pending` 5종(`distinct_time_bands`·`day_of_month`·
`activities_within_hours`·`month_over_month_ratio`·`vs_personal_average`)을 마저 `engine`으로
전환했다(§2.3-0). **남은 것**:
① `cumulative_duration_hours`·`monthly_count`가 여는 신규 배지 27종 자체의 시딩(정확한
임계값 재산정 포함)은 별도 콘텐츠 작업 ② `personal_record_break_metric`이 비어 있는
`walking:B3/B4`·`running:R3`·`cycling:R2`(32종)는 `personal_record_break`의 짝 필드 강제로
여전히 막혀 있다 — 채우는 마이그레이션(`seed_personal_record_break_metric_month_avg_families.sql`)
작성 완료·실행은 별도 확인 필요 ③ 2단 교차 게이트
(`cross_in_axis`/`cross_between_axis`/`gate_mission_badge`)가 0행인 문제는 티켓
`20260906_1947`(OPEN)로 분리됐다(§2.11).

### 2.10 걷기 배지 — 축1 게이트 + 하루 1회 상한

> ⚠️ **2026-09-05 갱신** — 이 절이 설명하던 「걷기 v4 신규 배지 32종」은 v5 전면 교체로
> 폐기됐다(§2.9). **아래에서 지금도 유효한 것은 「축1 게이트」와 「하루 1회 상한」 두
> 엔진 규칙뿐이고, 배지 목록·조건값은 더 이상 사실이 아니다.**
> 현행 걷기 카탈로그는 47계열 153종이며 `Specs/Content/ACTIVITY_BADGES.md`에 있다.
>
> 배경·튜닝 파라미터 상세: `Service Plan/Tickets/20260808_001_Content_걷기배지체계-v4-전면개편.md`

**축1 게이트** — 걷기(`activity_type='walking'`) 조건 평가 전 사전 필터. `evaluateConditionDetailed`가 `filtered`를 구성하는 시점에 `condition.activity_type==='walking'`인 경우에만 적용되며, 걷기가 아닌 종목에는 영향 없음.

```ts
export const WALKING_GATE_MIN_DISTANCE_KM = 0.5   // 최소 거리(km)
export const WALKING_GATE_MIN_DURATION_MIN = 10    // 최소 이동시간(분)
export const WALKING_GATE_MIN_SPEED_KMH = 2.0      // 평균속도 하한(km/h)
export const WALKING_GATE_MAX_SPEED_KMH = 8.0      // 평균속도 상한(km/h) — 러닝과 구분
export function passesWalkingGate(a: NormalizedActivity): boolean
```

⚠️ 4개 상수는 초안값이며 튜닝 대상. `active_days_count`는 이 게이트를 통과한 `filtered` 목록 기준으로 계산되므로 "게이트 통과일의 고유일수"가 자동 보장된다.

**하루 1회 상한** (`dedupeOnePerDay`, 걷기 전용) — `weekly_count`(W3 소급 적용, 조건값 불변) / `day_of_week`(단일)+`total_count`(T05~T07, T09~T11) / `day_of_week`(배열)+`total_count`(T08, 요일별 서브풀 각각) 에 적용. `streak_days`(W4)는 기존 `calcMaxStreak`가 `uniqueDates`로 이미 압축 계산해 변경 불필요. 순수 `total_count`만 있는 경우(T01~T04, T12~T14, T22, T23)는 상한 미적용(예: T01 "누적 10만 번"에 상한을 걸면 영구 미달성이 되는 설계 모순).

**신규 배지 32종**: D01~D11(누적 활동일수 체크포인트, `active_days_count`) + 트로피 매트릭스 21종(T01~T18, T20, T22, T23 — T19·T21은 제외 확정). 전체 목록: `Specs/Content/ACTIVITY_BADGES.md` 걷기 섹션. 전부 `prerequisite_badge_names` 없는 독립 배지(성장 티어 dedup·진행 트랙 병합 대상 아님).

**버그 수정 2건** (걷기 v4 구현 중 발견, 다른 종목에도 적용됨):

1. **`getProgressionKey` 크로스 배지 충돌**: 기존 로직이 `prerequisite_badge_names` 유무와 무관하게 `activity_type`+조건타입(`distance_km`/`total_count` 등)이 같으면 이름이 다른 배지끼리도 진행 트랙으로 병합해버렸다. T01~T04(전부 `walking:total_count` 트랙 키 충돌)와 T23(`walking:distance_km`가 W1과 충돌)이 이 문제로 조용히 발급 누락될 뻔했음(missed 배열에도 안 잡히고 후보에서 그냥 사라짐). **수정**: `prerequisite_badge_names`가 없거나 빈 배열이면 `getProgressionKey`가 즉시 `null`을 반환해 병합하지 않도록 가드 추가. 기존 W1~W8 및 타 종목 배지는 종목당 bare-metric 트랙이 원래 1개씩만 존재해 영향 없음(확인 완료).
2. **`temperature_min_c`/`max_c` + `total_count` 조합 누수**: 기존 `matchesPerActivityCondition`/`relevantPerActivityKeys`가 온도 조건을 항상 "단일 활동 매칭"으로만 취급해, T12~T14(온도조건+`total_count`, 예: "33도 이상 5회")에서 `total_count`가 온도와 무관하게 채워질 수 있었다(온도 만족 활동 1건 + 나머지는 아무 걷기나 채우면 통과). **수정**: `total_count`와 온도 조건이 함께 있으면 `filtered`를 온도 조건 만족 활동으로 먼저 좁히고 `relevantPerActivityKeys`에서 제외 — `time_range`+`total_count`(T09~T11)가 이미 쓰던 패턴과 동일하게 맞춤.

---

### 2.11 미션 게이팅 — v5는 «축 기반»이다 (2026-09-05 전환)

> ⚠️ **이 절의 아래 내용은 폐기된 v4 방식이다.** 대표 배지 5종 + 미션 보상 배지 15종 +
> 레거시 미션 15개는 2026-09-05에 **전부 삭제**됐다(§2.9). 아래는 그 구조가 무엇이었는지
> 남겨 둔 기록이며, **현행 동작이 아니다.**
>
> **현행(v5)**: 미션 게이팅은 `missions.gated_badge_id`(배지 1개 지목)가 아니라
> **`gate_axis` · `gate_stage` · `visibility_rule_json`**(축·단계·노출 조건)으로 한다
> — 마이그레이션 135, 티켓 `20260905_0033`. 미션 보상 배지는 종목당 8개 × 5종목 = **40종**이고
> 각각 «여는 축»이 지정돼 있다(`Specs/Content/v5_mission_badges.json`).
> 판정은 `resolveMissionVisibility()`(`lib/missions/visibility.ts`)가 하며, 규칙 형태가
> 깨지면 `OPEN`이 아니라 `locked`로 **fail-closed**한다.
>
> **2단 교차 게이트(`cross_in_axis`·`cross_between_axis`·`gate_mission_badge`) 축→계열
> 매핑 — 티켓 `20260906_1947`(CLOSED), 2026-09-06 실행 완료.** 98 Mystic 중 86종(설계상
> 무관문 예외 12종 제외 — 연속·달력 축의 「이미 강도가 충분해 게이트 불필요」·「사계절
> 요약」류)에 게이트가 걸렸고, 그 86종과 같은 계열의 Epic 79종에도 축 내/축 간 교차
> 조건이 매핑됐다(`seed_v5_gate_conditions.sql`, 165행). 레벨형 계열 11건은 `min_level=6`
> (5종목 누적축 사다리 중 가장 짧은 것의 상한 — 콘텐츠 재검토 여지 있음, confidence:
> medium)으로 통일했다. 축→계열 상세 규칙표는 `Specs/Content/v5_gate_mapping.json`.
> 무한레벨형(누적) 계열 자신의 Lv.5+/Lv.8+ 자체 게이트는 이번 매핑 범위 밖 — 별도
> 콘텐츠 작업으로 남았다.
>
> **미션 엔진 조건 어휘 확장 + 게이트 미션 40종 시딩 SQL — 티켓 `20260906_2231`.**
> `v5_mission_axis_groups.json`(걷기 8)·`v5_mission_badges.json`(4종목 32) 40건을 전수
> 대조한 결과 대부분이 기존 `mission_type`/`MissionCondition` 6종(필드 하나씩만 보는 단순
> 타입)으로 표현 불가능했다. 새 `mission_type='engine_condition'`을 추가해 두 갈래로
> 해결한다:
> 1. **배지엔진 어휘 위임** — `repeat_count`·`rest_after_long`·`single_distance_km`·
>    `max_pace_sec_per_km`·`same_activity` 등 이미 배지엔진(`evaluateConditionDetailed`)이
>    아는 필드를 그대로 재사용한다(`missions/checker.ts`가 이미 갖고 있던 캐스팅 통로를
>    확장). 「한 번에 X 이상 / N회」·「다음 날 휴식 + N회」·「한 활동이 두 필드 동시 충족」류가
>    여기 해당한다.
> 2. **미션 전용 신규 어휘**(배지엔진에는 없음, `src/lib/missions/engineCondition.ts`가
>    직접 판정) — 「N주/개월 연속 한 기간에 M회[+부분집합]」(`weekly_streak_min_count`·
>    `monthly_streak`·`monthly_streak_min_count`·`streak_subset`)와 「서로 다른 K개
>    요일/두 달」(`distinct_weekday_count`·`distinct_months_required`+`_metric`+`_threshold`·
>    `time_band_counts`). 650여 종 배지 카탈로그에는 이 조합이 필요한 조건이 없어
>    `BadgeCondition`/배지엔진 레지스트리에는 넣지 않았다 — 기존 배지 판정에 회귀 위험이 없다.
>
> `checkGateMissionConsistency()`(`gateMissions.ts`)의 `axis_stage_gap` 검사가 모든 축의
> `rare_to_epic` 단계를 항상 구멍으로 오탐하던 버그도 함께 고쳤다 — v5 설계상 Rare→Epic은
> 축 교차만으로 충분하고 미션이 필요 없다(0033 설계, v5 게이트 확정 이전 가정이 남아 있었다).
>
> **미션 40종(걷기 8 + 4종목 32, 실제 DB 행은 축 중복으로 53행) 시딩 SQL** —
> `Service Plan/Specs/Content/v5_mission_seed_build.py`가 `v5_gate_build.py`(1947)의
> `MISSION_MAP`·`family_keys_of_axis`를 그대로 재사용해 생성한다
> (`jam-web/supabase/migrations/seed_v5_gate_missions.sql`, **미실행** — 사용자 승인 후
> 오케스트레이터가 처리). 마이그레이션 135가 남긴 "레거시 게이트 미션 15개 폐기 + v5 40개
> 신규 생성"(2026-09-05 사용자 확정, 판단 ②) 방침을 그대로 따라 걷기 8종도 기존 행을
> 재사용하지 않고 새로 만든다 — SQL 파일 상단에 실행 전 확인 SELECT를 남겨 뒀다.
>
> 실행 전까지는 `gate_mission_badge` 요구가 걸린 Mystic은 미션이 없어 그 보상 배지를 얻을
> 방법이 없으므로 계속 막혀 있다(fail-closed 방향이라 잘못 열리지는 않는다).
>
> 폐기된 v4 방식 기록 (티켓 `Tickets/20260813_001_BadgeEngine_종목별-대표배지-레벨업-미션-게이팅-설계.md`):

종목별로 "운동 목표 달성감이 가장 큰" 대표 배지 1종씩(5개 트리) — 걷기 `동네 산책러`, 러닝 `첫 숨결`, 사이클 `언덕의 도전자`, 등산 `첫 고도`, 트레일러닝 `야생의 주자` — 는 Rare 이상에서 기존 크로스게이트(`prerequisite_badge_names`에 같은 종목 다른 속성 배지 2개 OR)를 쓰지 않고, **미션 완료로만 얻는 전용 배지 1개**를 선행조건으로 요구한다. 나머지 142개 배지는 기존 크로스게이트 그대로 유지.

**구조**:
1. 미션보상배지 15종(`badges`, `type='activity'`, `condition_json = {"mission_reward": true}`) — 이름은 `{배지명} 레벨업` / `레벨업 Hard` / `레벨업 Ultra`(Rare/Epic/Mystic 대응). 일반 활동 동기화로는 절대 발급되지 않고, 미션 완료(`grantMissionRewards`)로만 지급된다.
   - ⚠️ 2026-08-13 최초 설계는 `condition_json = NULL`(빈 조건 → 항상 `pass:false`)이었으나, 마이그레이션 084가 `{"mission_reward": true}`를 넣으면서 그 가드가 무력화됐다(§2.7 "미션 보상 배지 제외" 참조). 2026-08-25(티켓 20260825_028)에 **플래그를 유지하되 엔진이 명시적으로 제외**하는 방식으로 바로잡고, 15종 전부 `{"mission_reward": true}`로 통일했다(배지 상세 화면이 이 플래그로 "미션 보상 배지"임을 표시하고 있어 NULL 통일 대신 플래그 유지를 택함).
2. 미션 15종(`missions`) — `mission_type`은 `streak_days`(걷기)/`duration_minutes`(러닝·사이클·등산, 단일 활동 기준)/`elevation_gain_m`(트레일, 참가 시점 이후 누적 합계 기준 — 2026-08-31 티켓 20260831_2100·20260831_2152). `ends_at = NULL`(상시), `status_display_type = 'individual'`(본인 진행상황만 노출, 다른 참가자 비공개), `max_completions = NULL`(선착순 아님), `reward_points = 0`.
3. 대상 배지 5종 × Rare/Epic/Mystic의 `condition_json.prerequisite_badge_names`를 기존 OR 배열 대신 해당 미션보상배지명 1개만 담은 배열로 교체 — 엔진 스펙상 배열 원소가 1개면 사실상 AND(그 이름의 배지를 보유해야만 통과)로 동작한다(`CONDITION_JSON_SPEC.md`).

**미션 엔진 확장**: 기존 미션 엔진(`mission_type`: distance/checkin/activity_count/item_collect — `checkin`은 2026-08-26 이전 `poi_visit`)은 이 정책이 요구하는 연속일수·단일세션 지속시간·등반고도를 계산할 수 없었다. 새 계산 로직을 만드는 대신, `jam-web/src/lib/missions/checker.ts`가 이 3개 신규 타입에 대해 배지엔진의 `evaluateConditionDetailed`를 그대로 호출해 판정한다(§2.3 조건 어휘 재사용 — `activity_type`+`streak_days`/`duration_minutes`/`elevation_gain_m`). "미션 참가 시점 이후" 제약은 `evaluateConditionDetailed` 자체가 아니라 `checkMissions`가 `joinedAt` 기준으로 활동 이력을 미리 필터링해서 넘기는 호출자 책임이다.

**기존 발급 건 처리**: 정책 도입 시점에 5개 트리 Rare 이상을 이미 보유 중이던 유저 3명(5건)이 있었으며, 소급 회수(삭제)하기로 결정 — `jam-web/supabase/seed_revoke_pre_mission_badges_20260813.sql`(사용자 직접 실행).

**미션 노출 규칙** (2026-08-25, 티켓 20260825_028): 레벨업 미션 15종은 서로 선행 관계가 없어 3단계가 동시에 노출·참가되던 문제가 있었다. `missions.gated_badge_id`(이 미션이 여는 본 배지 id, FK → `badges.id`)를 추가하고, 노출 판정을 `jam-web/src/lib/missions/visibility.ts`의 순수 함수 하나로 모아 목록·상세·참가 API(`POST /api/missions/[id]/join`)·오늘카드(`mission_spotlight`)가 같은 규칙을 쓰게 했다.

| 상태 | 판정 | 화면 |
|---|---|---|
| `completed` | `user_mission_completions`에 기록 있음 (완료 판정의 **단일 기준** — "보상배지 보유" 기준은 소프트삭제 스킵 정책(§2.12)과 충돌해 쓰지 않는다) | '완료/지난' 탭으로 이동, 재참가 불가(409) |
| `open` | 게이트 배지 등급 ≤ 유저 보유 등급 + 1 (미보유는 Common 보유로 취급 — 신규 유저에게도 첫 레벨업 미션은 노출) | 정상 노출·참가 가능 |
| `locked` | 게이트 배지 등급 = 유저 보유 등급 + 2 | 회색 잠금 카드(상세 진입·참가 불가, "○○ Rare 배지를 획득하면 열려요") |
| `hidden` | 그보다 위 단계 | 목록에서 완전 제외(URL 직접 진입 시에도 잠금 처리) — **단, 참가 이력(`user_mission_participations`)이 있으면 `locked`로 완화**(아래 참조) |

`gated_badge_id`가 없는 미션(기간형 30종)은 완료 여부만 판정한다. 게이트 배지를 찾을 수 없으면(삭제·오설정) 게이팅 없이 노출한다(fail-open) — 이 경우 `visibility-server.ts`가 배지 id·영향받은 미션 id를 `console.warn`으로 남겨 조기 감지할 수 있게 한다(§2.11 부칙, 2026-08-25 티켓 20260825_029).

**참가 이력 반영** (2026-08-25, 티켓 20260825_029): 게이팅 도입 이전에 상위 단계 미션에 이미 참가해 둔 유저가 있을 경우, `hidden` 판정만으로는 참가 이력을 어디서도 볼 수 없게 되는 문제가 있었다. `MissionVisibilityContext`에 `participatedMissionIds`를 추가해, 게이트 미달로 `hidden`이 될 미션이라도 참가 기록이 있으면 `locked`로 완화한다(잠금 카드로는 계속 보임). `open`/`completed`/`locked` 판정 우선순위와 로직은 변경하지 않았다 — 오직 `hidden` 반환 직전에만 관여한다.

### 2.12 미션 보상 배지 소프트 삭제 지급 정책 (2026-08-25, 티켓 20260825_016)

`grantMissionRewards()`(`jam-web/src/lib/missions/rewards.ts`)가 `mission.reward_badge_ids`로
보상 배지를 조회할 때, 이미 소프트 삭제(`badges.deleted_at IS NOT NULL`)된 배지는 **지급하지
않고 조용히 스킵**한다.

- **근거**: 배지는 (a) 어드민 수동 소프트삭제(오배포·컨텐츠 오류·시즌 종료 등,
  `src/app/api/admin/badges/[id]/route.ts`), (b) 아이템북 비활성화 시 소속 배지 연쇄
  소프트삭제(`src/lib/admin/itembook-deactivation.ts`)로 삭제될 수 있다. 미션 어드민 화면에는
  보상 배지 선택 시 삭제 여부 체크가 없고, 배지 삭제 시에도 미션 보상 연결 경고가 없어 관리자가
  인지 없이 "삭제된 배지가 보상으로 걸린 미션"을 만들 수 있다.
- **범위**: 조회 쿼리(`badges` select)에 `.is('deleted_at', null)` 필터만 추가한다. 이후 지급
  분기(활동배지 insert / 아이템배지 인벤토리 insert / `granted` 플래그)는 조회 결과에 대해서만
  동작하므로 삭제된 배지는 자동으로 지급 루프에서 빠진다.
- **포인트**: 스킵된 배지의 `point_reward`(배지 자체 포인트)도 지급 자체가 일어나지 않으므로
  함께 스킵된다. `mission.reward_points`(미션 자체 포인트)는 배지 지급 여부와 무관하게 별개
  사유(`mission_point_reward`)로 그대로 지급한다 — 영향 없음.
- **채택하지 않은 대안**: 대체 배지 지급, 환산 포인트 지급은 새 규칙 정의가 필요해 범위가
  커지고, 그대로 지급(삭제 배지 무시하고 발급)은 §3.7.1의 "화면마다 다르게 보임" 불일치의
  지급판이 될 위험이 있어 배제.

---

### 2.13 진행 계산 계층 — `computeBadgeProgress()` (2026-09-04, 티켓 20260904_0631)

배지 트리 화면(`/badges/tree`)에 진행률·잔여값·병목 축을 보여주기 위한 **표시 전용 계층**.
`evaluateConditionDetailed`/`checkCondition`(§2.2 발급 파이프라인)은 이 계층이 존재하기 전과
**완전히 동일하게 동작**한다 — 발급 판정에 영향을 주지 않는 별도 함수를 옆에 추가했을 뿐이다.

- **위치**: `src/lib/badge-engine/badgeProgress.ts`(순수 함수 — Supabase·`next/headers` 의존
  없음, 클라이언트 컴포넌트에서도 import 가능). `classifyBadgeProgressKind()`가 분류만,
  `computeUserPeriodMetrics()`가 유저 지표 집계만, `computeBadgeProgress()`가 최종 조립을 맡는다.
- **다섯 유형 분류** — §2.3 조건 필드와 짝을 이룬다. `condition_json` 필드 조합만으로 결정되며
  추측이 아니라 `evaluateConditionDetailed`의 실제 분기를 근거로 한다: **누적형**(`distance_km`/
  `elevation_gain_m`이 `same_activity` 없이 단독, 또는 `total_count`·`streak_days`·
  `active_days_count`), **기록형**(스칼라 축 1개만 — 이력 전체 최댓값), **주기형**(`weekly_count`
  또는 `month`+`monthly_km`), **2축형**(스칼라 축 2개 — `same_activity:true`면 한 활동 동시 충족,
  아니면 독립 평가), **다중카운터형**(`day_of_week` 배열+`total_count`, 또는 `season_count_all`).
  다섯 유형 어디에도 안 걸리면 `{kind:'unsupported'}`를 명시적으로 반환한다 — 억지로 끼워
  맞추지 않는다(카탈로그 실측: 조건이 있는 192개 전부 다섯 유형에 들어가고, `mission_reward`
  배지 15종만 `unsupported`).
- **"이번 주/이번 달"은 발급 판정의 "역대 최고 주기"와 다른, 신규 계산이다.** §2.3의
  `weekly_count`/`monthly_km` 판정은 **이력 전체에서 가장 잘 나온 주/달**을 기준으로 통과
  여부를 가른다(주간 배지 발급 자체는 그대로 이 기준). 반면 화면은 **지금 진행 중인 주(월요일
  시작)·달(달력 1일~말일)** 만 보여줘야 유저가 행동할 수 있다 — 지난주 기록은 더 이상 유저가
  바꿀 수 없어 무의미하다. 두 계산은 서로 다른 질문에 답하므로 값이 다를 수 있는 게 정상이다.
- **게이트**는 새로 판정하지 않는다 — `badgeTree.ts`의 `BadgeTreeLock`을 그대로 매핑한다
  (`fulfilled`→`met`). **라벨**도 이 함수 내부에서 조회하지 않는다 — 호출부가
  `getMetricLabels()`(§5, `metricLabels.ts`)로 한 계열당 1회 배치 조회한 결과를 `labelMap`
  인자로 주입한다.
- **`index.ts` 구조 변경**: `matchesDayOfWeek`·`inTimeRange`·`dedupeOnePerDay`·`getMondayKey`·
  `calcMaxStreak`·`passesWalkingGate`(+ 걷기 게이트 상수 4개)를 `activityFilters.ts`로 이전했다
  (로직 변경 없음 — 순수 이동). `index.ts`는 이 이름들을 다시 `export`해 기존 소비처는 그대로
  동작한다. 계기: `badgeProgress.ts`가 이 헬퍼들을 재사용하려면 클라이언트 세이프해야 하는데,
  `index.ts`가 최상단에서 `@/lib/supabase/server`(→`next/headers`)를 무조건 import해서
  분리 없이는 전이 의존이 생겼다(1차 게이트 리뷰 FAIL로 발견 — 하루 전 티켓 20260903_2329의
  `badgeTreeConditionStatus.ts`/`.server.ts` 분리와 동일 유형 문제).
- **소비처(2c·2d, 티켓 20260904_0921/1058) — 다섯 유형 전부 화면 연결 완료.** 배지 트리
  레일(`BadgeStageRail`)·트로피그리드(`BadgeTrophyGridCard`)에 누적·기록·주기(단일 축,
  170개)를 2c가, 2축형(dual, 20개)을 2d가 신규 MODULAR 패턴 `DualAxisGauge`로 연결했다.
  숫자→한국어 문구 변환은 계산 계층에 섞지 않고 별도 표시 레이어 `src/lib/
  badgeProgressText.ts`가 담당한다(`computeRecordRegretLine()`의 기록형 "아쉬움 줄",
  `formatDualAxisGaugeProps()`의 2축 규칙 문장·병목 안내 포함).
  카탈로그 실측: **2축형 20개는 전부 레일(계열) 소속**(러닝·사이클링·등산·트레일러닝
  5계열×4등급, 16개는 "각각 다른 활동"·4개(야생의 첫발)만 "한 번의 활동에서 동시"),
  **다중카운터형(multi) 2개는 전부 트로피그리드 소속**(단일 등급, 선행 배지 없음) — 그리드는
  kind-무관 공통 포맷("병목 축 current/target 한 줄")이라 별도 컴포넌트 없이 이미 처리됐다.
  프로토타입이 설계했던 "다중 카운터 게이지"(세그먼트 바)는 현재 카탈로그에 쓰일 자리가
  없어 만들지 않았다 — 새 계열이 레일에 다중카운터형으로 추가되면 그때 판단한다.
  `BadgeProgressAxis`에 축 단위 진행비율 `fraction`이 노출돼 있다 — "작을수록 좋음"(페이스)·
  한파(`temperature_max_c`, 비선형 기준점) 축은 `current`/`target` 단순 비율로 재계산하면
  진행 바가 틀리므로 표시 레이어가 이 값을 그대로 써야 한다.
- **3차 1단계 — 진행 스냅샷 저장(티켓 20260904_1156).** 2b~2d는 전부 "지금 이 순간" 값만
  실시간 재계산해 이전 상태와 비교할 방법이 없었다. 신규 테이블 `user_family_progress`
  (`user_id, activity_type, family_name` PK, RLS는 service_role 전용으로 닫아둠 —
  `mission_rank_snapshots`·`poi_views`와 동일 방침)가 계열별 프런티어(첫 미획득 등급)의
  `progress`(0~1)·`current`(`BadgeProgress.axes` 스냅샷)·`prev`(직전 동기화 시점의
  `current`)를 저장해 "직전 동기화 대비 얼마나 나아갔는지"(3b, 레일 채움 막대 꼬리)의
  비교 기준을 만든다. write-hook `updateFamilyProgressSnapshots()`(`src/lib/strava/sync.ts`)가
  `processFetchedActivities()`의 `recordProcessedActivities()` 직후(활동이 이미
  `strava_activities`에 기록된 시점) 유저가 가진 계열 전체(약 72개, 미획득 프런티어가 있는
  것만)를 순회해 기존 `computeUserPeriodMetrics()`/`computeBadgeProgress()`를 그대로 호출한
  결과를 일괄 upsert한다 — **새 계산 없음.** `labelMap`은 빈 Map, `locks`도 빈 배열로
  넘긴다 — `axis.key` 원문 저장, `gate` 미저장이며 둘 다 표시 시점(3b)에 다시 채운다. 이
  훅은 실패해도 싱크 자체(배지 발급·미션 판정)를 막지 않는다(전체 try/catch로 격리).
- **계열 정합성 트리거 `badges_family_consistency`**(`102_condition_json_check_constraint.sql`과
  같은 "DB가 조건 형태를 직접 검증한다" 방침의 연장, `type='activity'`에만 적용) — 어드민이
  `condition_json`을 고쳐 같은 계열(`activity_types`+`name`) 안 형제 배지와
  `MEASURABLE_CONDITION_KEYS` 교집합이 어긋나면 쓰기 자체를 막는다. **비교 범위는
  `MEASURABLE_CONDITION_KEYS`(17개)로 한정** — 전체 `jsonb_object_keys`를 비교하면
  `prerequisite_badge_names`(Common엔 없고 Rare 이상엔 있는 정상 설계) 때문에 다등급 계열
  40/72개가 즉시 위반한다(1차 시도 실측, 사전 점검 재실측에서 위반 0건 확인 후 적용).
  형제 존재 여부로 비교 대상을 찾으므로 이름 오타로 계열이 쪼개지는 시나리오는 막지
  못한다(알려진 한계로 문서화만 하고 별도 대응은 후속 판단).
  **v5 조정(마이그레이션 130, 티켓 20260905_0027)** — 등급형에 대한 보장은 그대로 두고 두 줄만
  더했다: ① `NEW.level IS NOT NULL`(무한레벨형)이면 검사를 건너뛴다 — 레벨마다 조건 필드가
  달라지는 것이 정상 설계다. ② 형제 조회에서 `level IS NOT NULL`인 행을 뺀다 — 같은 이름을 쓰는
  레벨형이 등급형 계열의 «기존 조건 조합»을 오염시키지 않게 한다. 아울러 트리거의 `UPDATE OF`
  목록에 `level`·`rarity`를 추가했다 — 셋(name/activity_types/condition_json)뿐이던 예전 정의는
  레벨형을 등급형으로 되돌리는 UPDATE가 검사를 통째로 건너뛰게 했다. **그룹핑 키는 여전히
  `(activity_types, name)`이다** — `family_key`로 옮길지는 어드민 계열 관리(티켓 20260905_0032)에서
  결정한다.
- **3차 2단계 — "3b"는 배너 텍스트로 절반만 구현됨(티켓 20260904_1425).** `user_family_progress`의
  `current`/`prev`에서 fraction 증가폭이 가장 큰 축 하나를 골라 "직전 동기화보다 {라벨}
  {델타}{단위} 가까워졌어요" 문장을 조립해 `RecentSyncBanner`(DS)에 배선했다 — 재계산 없이
  저장된 스냅샷만 읽는다. **위 3차 1단계 문단이 예고한 "레일 채움 막대 꼬리"(레일 진행바
  자체에 직전 위치를 시각적으로 표시하는 요소)는 이 티켓 범위가 아니다** — 배너 텍스트와
  레일 자체의 시각 표시는 별개 작업으로 갈렸다.

#### 2.13-1 v5 확장 — 진행 유형 8종 · 표시 값의 성격 분리 (2026-09-05, 티켓 20260905_0031)

v5(티켓 20260905_0030)가 만든 네 구조는 전부 진행률에서 `unsupported`였다 — 발급은 판정되는데
화면에는 아무것도 그리지 않는, **의도된** 상태였다(「발급은 막히는데 화면엔 100%가 뜨는 거짓말」을
막기 위해). 이 확장이 각각에 축을 만든다.

**진행 유형은 5종에서 8종이 됐다.**

| kind | 축 | 비고 |
|---|---|---|
| `leveled` | 기반 유형(누적·기록 등)과 **똑같이** 계산하고 `level`을 함께 싣는다 | 판정 기준이 `badges.rarity`라 조건만으로는 알 수 없다 — 호출부가 `badgeKindOf()` 결과를 `options.badgeKind`로 넘긴다. 기반 유형이 `unsupported`면 레벨형도 `unsupported`다 |
| `repeat` | 「현재 회차 / 임계 회차」(`repeat_count`) | 회차는 **발급 판정과 같은 함수**(`collectRepeatOccurrences`)로 센다. 회차 술어가 다루지 못하는 키가 섞이면(발급이 fail-closed로 회차 0) 진행률도 `unsupported` |
| `rest` | 「현재 최대 공백 / 요구 일수」(§2.16) | `evaluateRestConditions`의 fail 결과에 구조로 실린 `bestDays`·`shortfallKey`·`requiredDays`를 그대로 쓴다(문자열 파싱 없음). 「닫힌 공백」만 보므로 `now`가 필요 없다 |

**신규 3종도 「축 하나를 숨긴 100%」를 그리지 않는다.** 기존 5종은 축이 2개를 넘으면
`unsupported`로 떨어뜨려(축 하나만 그리고 나머지를 숨기는 상황을 막아) 이 규칙을 지켜 왔다.
휴식·회차 축은 **자기 술어가 보는 부분만** 그리므로 같은 가드가 필요하다 —
`{ return_gap_days: 5, distance_km: 1000 }`은 휴식만 보면 「5/5일 = 100%」인데 1,000km 축이
화면에서 사라지고 발급은 막혀 있다. 그래서 **술어가 흡수하지 못하는 측정 축이 조건에 남아
있으면 `unsupported`**다. 판단 근거는 각 술어 옆에 한 번만 적혀 있다 — 휴식은
`restConsumedPairKeys()`(짝 필드 `streak_days`·`single_distance_km`), 회차는
`repeatConsumedAxisKeys()`(활동 단위 축 + `same_activity:true`일 때의 `distance_km`/
`elevation_gain_m`), 측정 축 목록은 `conditionAxes.ts`의 `MEASURED_AXIS_KEYS`.

> ⚠️ `repeatConsumedAxisKeys()`는 「회차를 **셀 수 있는가**」(`unconsumedRepeatConditionKeys`)와
> 다른 질문에 답한다. `{ repeat_count: 5, distance_km: 1000 }`은 회차가 정상적으로 세어지고
> 발급도 가능하다(1,000km는 엔진이 누적으로 따로 평가한다) — 그리지 못하는 것은 **진행률**뿐이다.

**표시 값의 성격이 갈린다 — 누적형은 「지금까지 쌓인 값」, 기록형은 「마지막 활동의 값」.**
기록형에 누적/역대 최고를 쓰면 표시가 목표에 붙어 진행률이 사실상 고정되고 「이번에 얼마나
가까웠나」가 사라진다. 다만 **판정(`met`)은 여전히 역대 최고 기준**이다 — 발급 판정은 기록형
필드를 이력 전반에서 보므로, 마지막 활동이 짧다고 「미달」로 그리면 이번엔 반대 방향으로
어긋난다.

**진행 바(`fraction`)는 캡션과 같은 값을 말한다** — `current / target`, 즉 마지막 활동 기준이다.
초안은 `met`이면 `fraction`을 1로 눌렀는데, 그러자 「캡션은 40/45분인데 바는 가득 참」이
실제로 재현됐다(「지구력의 전사」). 한 줄 안에서 숫자와 그림이 다른 말을 하면 안 된다.
`met`·`remaining`은 배지 상태(=발급 판정 기준)를 말하고, `current`·`fraction`은 마지막 활동을
말한다 — 역할이 갈릴 뿐 서로 모순되지 않는다.

- `UserPeriodMetrics`에 축별 최댓값(`maxScalarValues`)·마지막 활동값(`lastActivityValues`)과
  별칭(`maxSingleDistanceKm`·`maxSingleDurationMin`·`maxSpeedKmh`·`maxElevationM`)이 추가됐다.
  배지마다 `metrics.activities`를 재순회하던 계산을 (user, activity_type)당 1회로 접은 것이라
  **값은 이전과 동일**하고, 550종 시딩 후의 2패스 루프 비용이 줄어든다.
- `BadgeProgressAxis.remaining` — **방향이 보정된 「남은 양」.** 페이스·한파 축은
  `current − target`이다(`target − current`가 아니다). 측정값이 없으면 `null`(「남은 양을 말할
  수 없다」 — 0으로 두면 다 채운 것처럼 보인다).
- `BadgeProgress.crossGated` — **교차 게이트가 걸린 배지라 축을 다 채워도 발급되지 않을 수
  있다.** 이 계층은 게이트를 판정하지 않으므로(유저 보유 배지 정의가 필요하다) 「있다」는 사실만
  싣는다. 같은 이유로 `/badges/tree`의 「조건 충족」 집합에서도 제외한다 —
  `checkCondition`(=`evaluateConditionDetailed`)은 교차 게이트를 보지 않고, 그 필드는
  `evaluation: 'external'`이라 fail-closed에도 걸리지 않아 수치만 채우면 라임으로 뜨던 상태였다.

**계열 프런티어 산출이 `badgeKind.ts` 기준으로 바뀌었다.** 등급 순서 배열(`FAMILY_RARITY_ORDER`)만
훑던 `sync.ts`의 `updateFamilyProgressSnapshots`는 레벨형 계열을 통째로 누락했고, 반복형은
「보유하면 프런티어가 지나간다」는 전제가 틀렸다(§2.14 — 반복형은 보유해도 후보에서 빠지지 않는다).
이제 세 종류를 각각 고른다: 등급형=첫 미획득 등급 / 레벨형=`level` 오름차순 첫 미획득 /
반복형=**보유해도 대상**. 레벨형만 `family_key`로 묶는다(이름은 레벨형을 유일하게 식별하지
못한다 — §2.15 ①). `/badges/tree`의 진행 대상 선정도 같은 판정을 쓴다.

> **알려진 한계**: `badgeTree.ts`는 아직 `RARITY_ORDER` 루프로만 계열 눈금(`stages`)을 만들어
> **무한레벨형 배지가 트리 화면에 그려지지 않는다.** 진행 계산과 싱크 스냅샷은 준비됐지만 트리
> 렌더링은 티켓 20260905_0037(트리 리뉴얼)·20260905_0035(카탈로그 시딩)의 몫이다.

**재선언을 없앴다.** `badgeProgress.ts`의 `SCALAR_AXIS_KEYS`가 `index.ts`의 `PER_ACTIVITY_KEYS`
재선언이었다(주석이 스스로 인정하고 있었다). 두 목록이 어긋나면 진행률과 발급이 갈라지므로
`conditionAxes.ts`(축 키)와 `repeatOccurrences.ts`(회차 계산)로 뽑아 **양쪽이 같은 파일을
import한다** — `badgeKind.ts`·`activityFilters.ts`·`crossGate.ts`와 같은 태도다.
회귀 테스트가 소스에 재선언이 다시 생기는 것 자체를 막는다
(`__tests__/progress-layer-v5.test.ts`).

### 2.14 반복 획득 — 「발급」과 「카운터 증가」의 분리 (2026-09-05, 티켓 20260905_0030 B1)

**배지 종류는 셋이다.** 판정은 `src/lib/badge-engine/badgeKind.ts`의 `badgeKindOf()` 한 곳.

| 종류 | 판정 | 묶는 축 | 보유하면 |
|---|---|---|---|
| 등급형 `graded` | 그 외 전부 | 이름 (`badgesByName`) | 후보 제외 |
| 무한레벨형 `leveled` | `rarity IS NULL` | 계열 (`family_key`) | 후보 제외 (다음 레벨로 넘어감) |
| 반복형 `repeatable` | `rarity` 있음 **+** `condition_json.repeat_count` | 배지 하나하나 | **후보로 남는다** |

레벨형과 반복형이 동시에 성립하는 형태(`rarity IS NULL` + `repeat_count`)는 카탈로그 오류이며
레벨형이 우선한다 — 계열 레일에 구멍을 내지 않는 쪽이다.

#### 발급 O / 카운터만 O

반복형 계열은 같은 이름의 배지 여러 장이 `repeat_count`만 다르다(강도 «낮음»이면 1·5·20·50회 —
사다리는 강도에 따라 달라진다, 마스터 20260905_0026). 유저가 회차를 쌓으면:

- **아직 없는 등급 + 임계값 도달** → 실제 발급. `user_activity_badges` INSERT, 피드 이벤트,
  잼 포인트, 결산, 획득 연출. `earn_count`는 그 시점까지 쌓인 회차 수로 시작한다
  (한 건만 심으면 다음 싱크에서 과거 회차가 뒤늦게 더해져 카운터가 흔들린다)
- **이미 보유** → **회차 카운터만 증가.** 피드 이벤트도 결산도 없다. `earned` 배열에 담기지
  않으므로 획득 연출·결산 알림에도 나타나지 않는다

이 분리가 §2.6 홍수 방지의 실체다.

반복형 축은 진행 계산(§2.13-1)에서 `kind: 'repeat'`로 지원된다(티켓 20260905_0031) — 회차는
발급 판정과 같은 함수(`collectRepeatOccurrences`)로 센다. **「기간 단위 회차」**(`streak_days`·
`weekly_count`·`monthly_count`·`weekly_streak` + `repeat_count`)는 2026-09-06(티켓
20260906_0110) 이어받아 마무리 단계에서 발견·수정된 어긋남이 있었다 — `badgeProgress.ts`의
`classifyConditionKind`가 이 네 조합을 `isPeriodDrivenRepeatCondition()`으로 먼저 확인하지
않아 발급은 열렸는데 화면은 `unsupported`(「진행 표시 준비 중」)로 떨어지는 사고였다. 지금은
발급(`repeatOccurrences.ts`)과 진행률(`badgeProgress.ts`)이 같은 판정 함수를 공유해 정합이
맞는다(회귀 테스트 `v5-extension.test.ts`).

#### 멱등 — 조건부 원자 UPDATE

`UNIQUE(user_id, badge_id)`를 유지하기로 확정했으므로(티켓 20260905_0027) 회차는 행이 아니라
`earn_count`/`earn_history` 두 컬럼에 쌓인다. 멱등 조건은 **근거 활동 id가 이미 `earn_history`에
있으면 올리지 않는다**이고, 이건 한 문장으로만 원자적으로 쓸 수 있다:

```sql
UPDATE public.user_activity_badges
   SET earn_count   = earn_count + 1,
       earn_history = earn_history || $entry::jsonb
 WHERE user_id = $1 AND badge_id = $2
   AND NOT (earn_history @> jsonb_build_array(jsonb_build_object('strava_activity_id', $3)))
```

supabase-js 쿼리 빌더에는 jsonb 포함 연산자를 조건절에 싣는 표현이 없어 앱 코드로 쓰면
읽고-고치고-쓰는 왕복이 된다 — 그 순간 동시 싱크에서 회차가 유실되거나 이중 계상된다.
그래서 `increment_activity_badge_earn()` RPC로 뺐다(마이그레이션 132, `SECURITY DEFINER` +
`service_role`만 EXECUTE). 이 조건절이 예전에 `23505`(중복키)로 대신하던 방어를 대체한다.

- `earn_history` 상한은 **200**. `earn_count`가 총계를 들고 있어 정보 손실이 작다
- ⚠️ 상한을 넘겨 밀려난 원소는 이 조건절이 막지 못한다. 다만 싱크는 `getProcessedStravaIds`가
  이미 처리한 활동을 상위에서 걸러내므로 **이중 방어**다
- 나머지 세 곳의 `23505` 처리(`missions/rewards.ts` · `itembook/checker.ts` ·
  `strava/sync.ts`의 POI 경로)는 **그대로 둔다** — 미션 보상·아이템북 보상·체크인 배지는
  반복형이 아니라 「이미 보유면 스킵」이 맞는 의미다

### 2.15 2단 교차 게이트 (2026-09-05, 티켓 20260905_0030 B2)

마스터 티켓 20260905_0026의 게이트 표를 조건 필드 3종으로 옮긴 것.
판정은 `src/lib/badge-engine/crossGate.ts`의 `evaluateCrossGates()` 한 곳이며,
`index.ts`의 `evaluateBadgeGates()`가 선행 배지 게이트 다음에 호출한다.

계열 하나가 요구를 만족하는지의 최소 단위 판정(`familyGateSatisfied()`)은 **엔진과
배지 트리 화면(`src/lib/badgeTree.ts`)이 공유한다**(2026-09-06, 티켓 `20260906_1947` ③).
예전엔 `badgeTree.ts`가 이 규칙을 화면 전용으로 재구현해서, 두 구현이 갈리면 「트리에서는
열려 보이는데 실제 발급은 안 되는 배지」가 생길 수 있었다.

| 관문 | 조건 | 조건 필드 |
|---|---|---|
| Rare → Epic | 축 내 교차 **또는** 축 간 교차 | `cross_in_axis` / `cross_between_axis` |
| Epic → Mystic | 축 간 교차 **+** 미션 보상 배지 | `cross_between_axis` + `gate_mission_badge` |

**값의 형태** (`BadgeGateRequirement`, `src/types/database.ts`):

```json
{ "family_keys": ["running:tempo", "running:interval"],
  "min_rarity": "rare",
  "min_count": 2 }
```

- `family_keys` — 대상 **계열**(`badges.family_key`). 기본 결합은 OR
- `min_rarity` — 생략하면 「그 계열의 배지를 하나라도 보유」. 지정하면 그 등급 이상의
  **등급이 있는** 배지여야 한다(무한레벨형 계열에는 지정하지 않는다 — 등급이 없어 영원히 막힌다)
- `min_level`(2026-09-06, 티켓 `20260906_1947` ④) — **무한레벨형 계열 전용**, `min_rarity`와
  **상호 배타**(둘 다 두면 저장 시 차단된다). 생략하면 「그 계열을 Lv.1이라도 보유」다.
  이 필드가 없던 시절엔 무한레벨형(누적 축)을 보완 축으로 지정해도 "Lv.1 보유"(=첫 주에
  달성)가 곧 「보완 축 Rare 이상」에 준하는 강도를 흉내 낸 관문을 자동 통과시켰다 —
  실측 11건(`v5_catalog_verified.json` 잔여_이슈)
- `min_count` — 생략하면 1. 2 이상이면 그만큼의 계열을 **AND**로 요구한다

**결합 규칙**: 교차 요구 둘(`cross_in_axis`·`cross_between_axis`)은 **서로 OR**,
미션 게이트(`gate_mission_badge`)는 **AND**다. 축 내 교차가 성립하지 않는 축(9축 중 5축)은
`cross_between_axis`만 선언하며, 그때는 OR의 한쪽이 없으므로 그 하나가 필수 요건이 된다.

#### 이름이 아니라 계열로 지정한다

**v5에서 이름은 배지를 유일하게 식별하지 못한다.** 「무한레벨형·반복형이 등급형과 이름을
공유할 수 있다」가 설계 전제이기 때문이다. 그래서:

- 신규 게이트 3종은 **`family_key` 기준**이다
- 기존 `prerequisite_badge_names`(이름 기준)는 그 모호성을 없앨 수 없어 **보유한 등급형의
  이름만** 본다. 레벨형 Lv.1이나 반복형 Common을 보유했다는 이유로 동명 등급형의 게이트가
  열리던 경로를 막은 것이다(카탈로그 시딩 전에 처리 — 티켓 20260905_0035에서 이름이 겹치는
  순간 실제 사고가 된다)

#### 엔진이 기계적으로 막는 것 / 카탈로그가 보장해야 하는 것

교차 대상은 **조건이 겹치지 않는 계열**이어야 한다. 겹치면 같은 활동으로 동시에 달성돼
게이트가 자동 통과된다. 엔진에는 «축» 데이터가 없으므로(`badges`에 축 컬럼이 없다) 다음만
기계적으로 판정한다 — 나머지는 카탈로그(티켓 20260905_0035)의 책임이다.

| 엔진이 막는다 | 카탈로그가 보장한다 |
|---|---|
| 자기 계열을 교차 대상으로 지정 (자동 통과) | 대상 계열이 실제로 조건이 겹치지 않는가 |
| `family_keys` 누락·빈 배열·형태 오류 (fail-closed) | 어떤 계열이 같은 축인가 |
| `min_count`가 대상 계열 수보다 큼 (영원히 미달성) | 축 내 교차가 성립하는 4개 축의 선정 |
| 종목이 다른 계열의 보유 (교차는 종목 경계를 넘지 않는다) | — |
| `gate_mission_badge`가 미션 보상 배지가 아닌 계열을 가리킴 | — |

⚠️ `cross_in_axis`와 `cross_between_axis`의 **판정 규칙은 완전히 같다.** 차이는 선언 의도와
미발급 사유 문자열뿐이다. 축 소속은 엔진이 검증할 수 없다.

⚠️ DB CHECK 제약(마이그레이션 133)은 **키 이름만** 검사한다. 값이 깨진 게이트는 엔진이
fail-closed로 막는다 — 「검사할 게 없으니 통과」로 두면 게이트가 조용히 사라진다.

### 2.16 휴식 조건 — 활동이 «없는» 기간 (2026-09-05, 티켓 20260905_0030 B3)

엔진의 다른 모든 조건은 「활동이 있었는가」를 세지만 휴식은 **「활동이 없었는가」**를 센다.
그래서 **「데이터 없음」을 「쉬었음」으로 읽는 사고**가 구조적으로 가능하다.
판정은 `src/lib/badge-engine/activityFilters.ts`의 `evaluateRestConditions()` **한 곳**이며,
`index.ts`(발급 판정)와 `badgeProgress.ts`(진행 계산)가 같은 파일의 `restConditionKeysIn()`으로
「무엇이 휴식 조건인가」를 공유한다 — 두 곳이 각자 정의하면 진행률과 발급이 어긋난다.

| 필드 | 판정 | 짝 필드 |
|---|---|---|
| `rest_after_streak` | **연속 N일 활동 직후**의 쉰 일수 ≥ 조건값 | `streak_days` (필수) |
| `rest_after_long` | **장거리 활동일 직후**의 쉰 일수 ≥ 조건값 | `single_distance_km` **또는** `duration_minutes` (둘 중 하나 필수, OR — 2026-09-06 티켓 20260906_0110 ④에서 `duration_minutes` 추가) |
| `return_gap_days` | 인접 두 활동 사이의 **쉰 일수** ≥ 조건값 (「겨울잠」) | — |
| `interval_days` | 인접 두 활동의 **날짜 차이** ≥ 조건값 | — |

- **쉰 일수 = 날짜 차이 − 1.** 1일과 3일에 활동했으면 쉰 일수는 1일(2일), 날짜 차이는 2일이다.
  이 한 칸 차이가 `return_gap_days`와 `interval_days`를 가른다
- 필드가 여럿이면 **각각 독립 평가 후 AND** (엔진의 「이력 전반 독립 평가」와 같은 규칙)

#### 「닫힌 공백」만 센다 — 이게 안전장치의 전부다

모든 판정은 **인접한 두 활동일 사이**의 간격으로만 이뤄진다. 양 끝이 전부 실제 활동이므로:

| 위험 | 닫힌 공백이 막는 방식 |
|---|---|
| 활동 0~1건인 신규 유저가 「90일 겨울잠」으로 오판 | 인접 쌍이 없어 「휴식 판정 불가 — 창 안에 인접 활동이 없음」으로 떨어진다 |
| 앵커가 자른 창 밖이 통째로 공백처럼 보임 | 창의 **첫 활동 앞에는 공백이 없다**. 앞쪽 경계는 공백이 아니다 |
| 「마지막 활동 ~ 지금」이 시각에 따라 달라짐 | **현재 시각(`now`)을 보지 않는다** — 화면과 발급이 다른 시각을 볼 여지가 없다 |
| 휴식은 싱크 트리거가 없다 | 공백은 **다음 활동이 들어온 순간에만 닫히므로** 소급 판정이 자연히 성립한다 |

#### 앵커는 하한이다

`evaluateConditionDetailed`의 `options.anchorDate`로 가입 앵커를 받아 **헬퍼가 직접 한 번 더
자른다.** `getActivityHistory`는 `gte(start_date, anchor)`라 「앵커 직전 활동 1건」을 아예 읽지
못하지만, 발급 엔진은 **이번 배치를 앵커와 무관하게 합치므로**(첫 싱크 정산분은 대개 가입 직전
활동) 넘어온 배열에는 앵커 이전 활동이 섞일 수 있다. 그 한 건이 창 밖 공백을 만들어 낸다.

> 앵커 직전 활동을 **별도 조회해 경계 공백을 살리는 안은 채택하지 않았다.** 그건 가입 이전
> 이력을 판정에 되살리는 것이고, 「과거 이력은 아예 배제 — 엄격 유지」(§5 확정)를 약화시킨다.

`/badges/tree`의 조건충족 표시(`computeConditionMetBadgeIds`)도 같은 앵커를 넘겨받는다 —
빠뜨리면 화면이 더 넓은 창에서 공백을 세어 「조건 충족(라임)」인데 엔진은 막는 상태가 된다.

#### 종목 필터는 그대로 적용한다

공백도 `activity_type` + 걷기 축1 게이트를 통과한 활동만으로 센다. 즉 **「그 종목을 하지 않은
기간」이 휴식**이다. 엔진의 다른 모든 블록이 같은 규칙 위에서 판정하므로 여기만 «전 종목»으로
두면 `activity_type`이 조용한 no-op이 되고 「가끔만 틀리는」 비대칭이 생긴다.

#### 역인센티브 차단

- `rest_after_streak`·`rest_after_long`은 **활동이 선행되어야** 성립한다 — 쉬는 것만으로는 안 된다
- 활동 선행 요구가 없는 «순수 공백» 두 종(`return_gap_days`·`interval_days`)에는 그 안전장치가
  없다. §4의 「순수 공백 기반(「겨울잠」)만 쿨다운 90일」은 **카탈로그 설계 지침이며 엔진이
  강제하지 않는다**(2026-09-05 스펙 소유자 확정). 초안은 엔진에서 90일 미만을 막았으나
  ① `conditionRegistry`가 두 필드를 `min: 1, max: 365`로 선언해 **조건 필드 메타의 단일 출처**가
  엔진과 다른 말을 하게 되고 ② 그 경고 로그가 «배지 × 유저 × 싱크»마다 찍혀 오설정 1건이
  로그 폭주가 되어 철회했다. **하한 준수는 티켓 20260905_0035(카탈로그 시딩)의 몫이다.**

#### 회차(`repeat_count`)와의 조합 — 휴식 키 1개까지 지원 (2026-09-06, 티켓 20260906_2056 갱신)

휴식은 **이력 패턴 술어**라 `repeat_count`에 그냥 얹으면 「휴식 조건을 무시한 회차」가 세어진다
(예: `{repeat_count: 5, rest_after_streak: 2}`를 단순 카운트하면 휴식 여부와 무관하게 활동
5번이 세어진다). 이를 막기 위해 전용 술어 `isRestDrivenRepeatCondition`/`collectRestOccurrences`
(`repeatOccurrences.ts`)를 신설했다 — "사건 하나" = `evaluateRestConditions`와 같은
`buildRestIntervals`가 만드는 인접 활동일 사이의 **닫힌 구간** 중 그 휴식 조건(eligible +
threshold)을 만족하는 구간 하나다. 기존 단발 판정(`evaluateRestConditions`)과 완전히 같은
구간 계산을 재사용해 두 판정이 어긋나지 않는다.

**휴식 키가 정확히 1개**(그 짝 필드만 동반)일 때만 지원한다. 휴식 키 2개 이상이 동시에
있으면 "사건 하나"가 두 키를 같은 구간에서 동시에 만족해야 하는지 각자 독립 구간이어도
되는지가 정의돼 있지 않아 **여전히 「회차와 함께 쓸 수 없는 조건」으로 막는다**
(실측 2026-09-06: 프로덕션에 이런 조합 0건 — fail-closed로 막아도 실무 영향 없음).
막힌 조합은 fail-closed 가드가 조용히 회차를 0으로 떨어뜨려 「충족 횟수 부족 / 0회」로만
보이므로, 카탈로그 담당자가 2개 이상 조합을 쓰려면 먼저 스펙 오너 판단을 받아야 한다.

지원 대상(휴식 키 1개 + `repeat_count`)은 진행 계산(§2.13-1)에서도 `'repeat'` 축으로
분류돼 "N/M회" 진행률이 그려진다(기존 `'unsupported'` 고정 해제).

#### 계기 활동은 «복귀 활동»이다

`selectTriggerActivity()`가 휴식 조건일 때 **공백을 닫은 그 활동**을 돌려준다. 없으면 조건과
무관한 활동이 잡히고 그 날짜가 배지 상세의 「계기 활동일」로 유저에게 노출된다.
조건 키가 여럿이면 **각 키가 처음 성립한 구간 중 가장 늦은 것** = 조건 전체가 성립한 시점이다.

휴식 축은 진행 계산(§2.13-1)에서 `kind: 'rest'`로 지원된다(티켓 20260905_0031) —
`classifyBadgeProgressKind()`가 휴식 키만 있고 다른 측정 축을 흡수하지 못하는 조건만
`unsupported`로 떨어뜨린다.

`rest_after_long`은 이제 **실제로 발급된다.** 짝 필드 `single_distance_km` 또는
`duration_minutes` 중 하나만 있으면 되고(위 표), v5 스칼라 7종이 `engine`으로 뒤집히면서
(2026-09-06, 티켓 20260906_0110 ②) `single_distance_km` 짝도 fail-closed에 막히지 않는다.

### 2.17 카탈로그 시딩 후 재평가 절차 (2026-09-06, 티켓 20260906_1431)

발급은 각 유저의 **다음 활동 동기화**를 계기로만 일어난다. 카탈로그에 배지를 새로
시딩해도 기존 유저를 재평가할 자동 경로가 없어, 같은 날 시딩한 배지가 유저마다
며칠씩 흩어져 발급된다(실측: 티켓 20260906_1426, v5 630종 시딩 후 12명 중 1명만 발급).

> ⚠️ 이건 「소급 발급 기능 신설」이 아니다. `evaluateBadgesDetailed`는 매 호출마다
> `getActivityHistory(가입 앵커~)` 전체를 다시 보므로 소급 평가 능력은 원래 있다.
> 없는 것은 **평가를 돌릴 계기**뿐이다.

**채택안 — B안(시딩 후 1회 배치).** 정기 크론(C안)은 비용 문제로 채택하지 않았다
(근거: 티켓 20260906_1142). 대신 카탈로그 변경과 발급을 같은 작업으로 묶는다:

> **카탈로그에 배지를 새로 시딩할 때마다 오케스트레이터/운영자가
> `POST /api/admin/badges/reevaluate-all`을 반드시 함께 실행한다.**
> 자동 트리거가 아니라 시딩 작업과 항상 짝짓는 수동 절차다.

#### 요청/응답

```
POST /api/admin/badges/reevaluate-all
{ "dryRun": true, "userIds": ["..."] }   // userIds 생략 시 전체 유저 대상
```

`dryRun`은 **기본값 true**다 — `false`를 명시해야만 실제로 발급·포인트 지급이 일어난다.
응답은 대상 유저 수(`targetUserCount`)·영향받는 유저 수(`affectedUserCount`)·예상(또는
실제) 발급 건수 합계(`totalBadgesIssued`)·포인트 합계(`totalPointsAwarded`)·반복형 카운터
증가 합계(`totalCounterIncrements`)·유저별 상세(`users[]`)를 담는다. 대상이
`MAX_TARGET_USERS_PER_CALL`(500명)을 넘으면 400으로 거절한다 — `userIds`로 나눠 여러 번
호출한다(멱등이라 안전, 이미 보유한 배지는 재발급되지 않는다).

#### 부수효과 정책 — 피드·알림은 억제, 포인트는 정상 지급

| 부수효과 | 처리 | 근거 |
|---|---|---|
| 피드 기록(`recordFeedEvent`) | 억제 (`silent: true`) | 재평가로 유저당 수십 종이 한 번에 나올 수 있어, 그대로 실으면 「달리지도 않았는데 배지가 쏟아진다」가 피드·알림 폭발이 된다 |
| 포인트 지급(`awardPoints`) | **정상 지급** — `silent`와 무관하게 동작하는 기존 경로를 그대로 둔다 | 재평가로 뒤늦게 발견됐을 뿐 실제 활동 이력으로 정당하게 획득한 배지다. 자연 발급과 동일하게 보상하는 것이 맞다 |
| 가입 앵커(`users.created_at`) 이후 이력만 대상 | 유지 (변경 없음) | `evaluateBadgesDetailed`가 이미 강제한다 — §5 |

#### `triggeredBy` — `strava_sync`와 구분

`user_activity_badges.triggered_by`·`engine_decision_log`에 남는 트리거 값으로
`catalog_reevaluation`(`CATALOG_REEVALUATION_TRIGGER`)을 새로 쓴다. 이 컬럼은 자유
텍스트라(CHECK 제약 없음) DB 마이그레이션 없이 값만 추가하면 된다.

#### `initial_sync_done`은 이 배치가 절대 건드리지 않는다 — `forceFirstSyncGate: false` + `skipInitialSyncFlagUpdate: true`

**게이트 리뷰 FAIL로 발견됐다(최초 구현 재작업, 2026-09-06).** `evaluateBadgesDetailed`를
아무 옵션 없이 호출하면, `initial_sync_done=false`인(=Strava를 한 번도 동기화한 적 없는)
유저가 이 배치에 걸리기만 해도 — **배지를 하나도 못 받아도** — "첫 동기화 완료" 상태로
조용히 전환된다(index.ts의 갱신 가드가 원래 `!userInitialSyncDone`만 봤기 때문). 실측:
프로덕션 12명 중 2명이 이 상태라 즉시 영향받는다. 파급: 그 유저가 나중에 진짜 처음 Strava를
연동하면 (1) 첫 싱크 게이트(신규 유저는 Lv.1/Common만 발급하는 온보딩 보호)가 적용되지
않고 (2) 진짜 첫 동기화 순간에 나가야 할 "첫 배지" 결산(`recordActivityRecap`)도 만들어지지
않는다.

**수정 1차(2026-09-06)**: `reevaluateUsersForCatalog`는 `evaluateBadgesDetailed`를 부를 때
항상 `overrideFirstSync: false`를 명시하고, `evaluateBadgesDetailed` 쪽 가드도
`!overrideFirstSync`(값 기준)에서 `overrideFirstSync === undefined`(호출 의도 기준)로
고쳤다.

**수정 2차(티켓 20260906_1928)**: 위 1차 수정은 여전히 값 하나(`overrideFirstSync`)로
"게이트 강제 여부"와 "`initial_sync_done` 갱신 여부"라는 서로 다른 두 계약을 표현했다 —
타입 선언만 봐서는 이 이중 의미가 드러나지 않아 다음 호출부가 추가되면 같은 함정에
다시 빠질 위험이 있었다. 그래서 파라미터를 이름으로 분리했다:
`forceFirstSyncGate?: boolean`(`isFirstSync = forceFirstSyncGate ?? !userInitialSyncDone`,
게이트 적용 여부만 담당)와 `skipInitialSyncFlagUpdate?: boolean`(`true`면
`initial_sync_done` 갱신 블록 자체를 건너뜀). 갱신 가드는
`!dryRun && !skipInitialSyncFlagUpdate && !userInitialSyncDone`으로 단순해져
"값 기준 vs 호출 의도 기준"이라는 미묘한 판정이 더 이상 필요 없다.
`reevaluateUsersForCatalog`는 **둘 다** 명시한다 — `forceFirstSyncGate: false`가
게이트를 강제 해제하고, `skipInitialSyncFlagUpdate: true`가 상태 갱신을 막는다
(예전엔 `overrideFirstSync: false` 하나가 이 두 효과를 동시에 냈다).

결과: 카탈로그 재평가는 (1) `initial_sync_done`을 절대 갱신하지 않고 (2) 첫 싱크 게이트도
강제로 해제되어 재평가로 나오는 배지가 등급 제한 없이 정상 발급되며 (3)
`recordActivityRecap`(진짜 첫 동기화 전용 "첫 배지" 결산)도 만들지 않는다 — 재평가는
진짜 첫 동기화가 아니므로 (1)(2)(3) 모두 의도한 동작이다. 실제 첫 동기화가 나중에
일어나면 그때(옵션 없이 호출되는 `strava_sync` 경로에서) 정상적으로 한 번 전환·결산된다.
`/api/admin/simulate`는 `firstSync=true`(첫 싱크 강제 시뮬레이션)일 때
`forceFirstSyncGate: true`와 `skipInitialSyncFlagUpdate: true`를 함께 넘긴다 — 게이트는
강제 적용해 테스트하되, `dryRun: false`(실제 적용)로 돌리더라도 유저의 실제 온보딩
상태는 절대 오염시키지 않는다.

#### 알려진 한계 — 반복형 배지의 회차 카운터는 이 경로로 오르지 않는다

`evaluateBadgesDetailed`는 반복형(§2.14)의 "새 회차" 판정을 **이번 호출에 넘긴 배치**
(`activities` 인자) 기준으로 가른다. 재평가는 `activities: []`로 호출하므로(=이미 저장된
이력 전체를 다시 본다) 이미 보유한 반복형 배지는 `newOccurrences`가 항상 비어 카운터가
오르지 않는다 — 미보유 반복형(발급 자체)과 등급형·레벨형은 영향 없다. 이 간극은 유저의
다음 실제 동기화에서 정상적으로 채워진다(회차 자체를 잃지 않는다, 반영 시점만 늦다).

---

## 3. 아이템배지 드랍 엔진 v2 (✅ 구현됨 — 3레이어)

> v1(활동당 80% 확률, 전체 풀 완전 랜덤)을 대체. 2026-07-21 구현 완료 (마이그레이션 034 + `src/lib/drop-engine/`).  
> 구현 파일: `index.ts`(오케스트레이션) / `layers.ts`(순수 함수 추첨) / `context.ts`(맥락 매칭) / `policy.ts`(파라미터) / `constants.ts`(세계관 고정 UUID)  
> 파라미터는 `drop_policy` 싱글톤 테이블 — **어드민 `/admin/drop-policy`에서 배포 없이 편집** 가능. 인접 그래프는 세계관 수정 화면에서 편집.  
> ⚠️ 아래 §3.1 등 이 문서의 파라미터 값은 **초기 설계값**이다. 운영 중 실제 적용값은 어드민 화면에서 확인할 것.  
> 설계 방침: **집중은 보이지 않는 가중치로만** — "활성 세계관 N개 제한" 같은 명시 규칙은 유저가 인지하는 순간 상한·박탈로 읽히므로, 하드캡·세계관 선택 UI 없이 드랍 분포가 자연스럽게 2~3개 세계관에 수렴하게 한다.  
> 아이템배지·컬렉션·세계관·인접 그래프의 단일 진실 원천: **`아이템북 레시피.xlsx`** (배지 목록 시트 + '세계관 인접' 시트).

드랍 결정 3단계: **① 드랍 발생 → ② 세계관 선택 → ③ 컬렉션·배지 선택**

### 3.1 Layer 1 — 드랍 발생: 활동당 최소 1개 확정, 변동성은 희귀도로

> 정책: **활동 1건 = 아이템배지 최소 1개 확정.** 변동보상의 불확실성은 "나오느냐"가 아니라 "무엇이·얼마나 좋은 게·몇 개 나오느냐"에 둔다.

| 장치 | 값(초기) | 근거 |
|------|---------|------|
| 기본 드랍 | **활동당 1개 확정** | 모든 활동이 보상받음. 꽝의 실망 제거 |
| rarity 분포 | common 60 / rare 28 / epic 9 / mystic 3 (%) | 개수 고정 대신 희귀도가 매번의 서스펜스 담당 |
| Rare+ pity | 연속 5회 common → 6번째 rare 이상 확정 | 좋은 것의 가뭄 상한 |
| 보너스 드랍 | 15% 확률로 2개째 (60분+·고고도 활동은 30%) | "오늘은 2개!" 잭팟 + 노력↔보상 비례 |
| 일일 보정 | 당일 4번째 활동부터 확정 드랍 rarity를 common 90%로 하향 | 최소 1개 약속 유지하되 짧은 활동 반복(어뷰징) 기대값 억제 |
| 주간 첫 활동 | rare+ 확률 2배 | 주간 루프 재진입 트리거 |
| 복귀 보너스 | 7일+ 공백 후 복귀 활동은 **rare 이상 확정** | 이탈 위험이 가장 큰 복귀 순간을 보상 순간으로 |

- 첫싱크(온보딩) 드랍 확정은 기존대로 유지 ("10초 첫 보상").
- 섀도우밴은 rarity 상한으로 작동 — 최소 1개 약속과 충돌하지 않음 (common은 허용).
- **인벤토리 슬롯 초과 시 드랍 불가** — "최소 1개"의 유일한 예외. 슬롯 정리를 유도하는 investment 장치.

### 3.2 Layer 2 — 세계관 선택: 서사 모멘텀 (마르코프 가중 추첨)

유저별 `last_drop_world`(직전 드랍 세계관) 기준:

| 버킷 | 확률 | 의미 |
|------|------|------|
| **모멘텀** — 직전 드랍과 같은 세계관 | 50% | "이야기가 이어진다"는 감각의 핵심 |
| **인접** — 인접 그래프의 이웃 세계관 | 25% | 반복 지루함 방지 + 크로스오버 서사 |
| **탐험** — 전체 랜덤 (최근 없던 세계관 우선) | 15% | 신선함 주입. 탐험 드랍이 이어지면 모멘텀이 자연스럽게 이동 |
| **맥락 오버라이드** (조건 충족 시 최우선) | 10% | §3.4 — 활동 맥락과 정합하는 세계관 강제 |

- 드랍의 ~75%가 직전 세계관·이웃에 머물러 **명시적 제한 없이 집중 경험** 형성. 유저 체감은 "요즘 이 세계관 파편이 자주 보이네" 정도가 전부여야 한다.
- 신규 유저 첫 3드랍: **작심삼일 클럽 + 주 활동종목 매핑 세계관** (걷기→숲속의 갱단, 러닝→비트 마에스트로, 사이클→장비병 환자들, 등산/트레일→아스팔트 레인저). 이후 가중 추첨에 자연 합류.
- 컬렉션 완성 시 별도 선택·전환 절차 없음 — 완성은 축하 모먼트일 뿐, 드랍 흐름은 이어진다.
- **미스터리 헌터 예외**: epic·mystic 드랍 시에만 낮은 확률로 어느 유저에게나 등장하는 전역 스파이스 ("도시 괴담" 포지션).
- 인접 그래프: `아이템북 레시피.xlsx` **'세계관 인접' 시트**가 원천 → DB `world_adjacency` 시드.

### 3.3 Layer 3 — 컬렉션·배지 선택: 완성 페이싱

```
컬렉션 가중치 = drop_weight × (1 − completion × 0.7) × (직전 드랍과 같은 북이면 0.5)
  completion = 유저의 해당 컬렉션 수집률 (0.0~1.0)
  완성(100%) 북은 ×0.3으로 풀 잔류 — 중복 드랍 허용
```

- 0% 북 100% / 50% 북 65% / 마지막 1개 남은 북 ~38% → 새 북 진입은 쉽게, 막바지는 귀하게.
- **완성 북 계속 드랍**: 완성이 세계관과의 "이별"이 되지 않게. 중복 배지는 조합·트레이드 등 후속 경제의 재료.
- **마지막 조각 규칙**: 북의 마지막 1개는 감쇠로 자연히 귀해짐(완성의 긴장감) → 단, 그 세계관에서 5드랍 내 미획득 시 다음 드랍 확정 (좌절 상한). 드랍 시 UI에서 "○○ 컬렉션의 마지막 파편!" 강조 = 공유 가능한 milestone moment.
- 배지 선택: 북 내 **미보유 우선**, rarity 일치 배지 없으면 인접 rarity 폴백.

### 3.4 맥락 오버라이드 — 드랍을 '성취의 증거'로

활동 맥락이 세계관과 정합하면 **60% 확률**로 해당 세계관 강제. 보상이 활동의 증거(informational reward)가 되어 외적 보상의 내적 동기 침식(overjustification)을 방어한다.

| 활동 맥락 | 오버라이드 세계관 | 예시 컬렉션 |
|-----------|-----------------|--------------|
| 강수·태풍 / 기온 ≤ -10°C·≥ 33°C | 아스팔트 레인저 | 폭우 속의 질주, 영하 15도의 호흡 |
| 새벽 (05~07시) | 비트 마에스트로 / 셔터 마피아 | 새벽의 Lo-Fi, 새벽 물안개 몽환 |
| 심야 (23~04시) | 낭만 미식가 / 숲속의 갱단 | 편의점 심야 만찬, 은밀한 밤의 무도회 |
| 고고도 상승 | 낭만 미식가 / 비트 마에스트로 | 업힐 끝의 단맛, 업힐의 하드락 |
| **7일+ 공백 복귀** (최우선) | **작심삼일 클럽** | 결계 '섬데이' 돌파 |
| 러너스 하이 (고강도 장시간) | 미스터리 헌터 (rare+ 한정) | 차원의 틈새 |

### 3.5 일련번호 무작위화 + 개체 정체성 모델 (2026-08-29 갱신, 티켓 20260829_2101)

- `inventory_items.serial_number`는 발급 시 **1~999,999 난수 + UNIQUE 충돌 시 재시도**
  (`assign_random_serial()` 트리거). 앰비언트(시스템) 드랍으로 발급된 개체는 50,001~999,999
  범위로 제한된다(`obtained_by='ambient_drop'`로 판별).
- **개체 정체성**: 일련번호는 개체(`InventoryItem`)가 발급되는 순간 1회 확정되고, 그 개체가
  소멸(`destroyed_at`)할 때까지 유지된다. **일련번호가 확정(Minting)되는 시점은 정확히
  둘뿐이다** — ①드랍엔진을 통한 직접 지급(활동 보상 등), ②앰비언트 드랍이 POI에 배치되는
  순간(`src/lib/ambient-drop`가 배치 시점에 선발급/pre-mint한다). **픽업은 둘 중 어디에도
  속하지 않는다** — `poi_drops`는 `source`가 `user`/`system` 무엇이든 항상 이미 발급된
  `inventory_items` row를 `inventory_item_id`로 참조하며, 픽업(`pickup_drop()` RPC)은
  그 개체의 소유자만 옮길 뿐 새 row를 만들지 않는다(일련번호 불변).
- 개체 파괴(조합 소모 `Consume` / 미픽업 만료 `Expire`)는 소프트 삭제로 확정 —
  `inventory_items.destroyed_at`을 세우고, 번호는 `assign_random_serial()`의 유니크 체크
  (`destroyed_at IS NULL` 조건)에서 재사용 가능한 풀로 돌아간다. 같은 번호가 시간이 지나
  다른 개체에 재부여될 수 있으나, `custody_events`(아래 §3.5-1) 이력으로 항상 구분 가능하다.
- 유저 드랍은 기한 개념이 없다 — 회수 액션도, 만료도 없이 픽업될 때까지 무기한 대기한다
  (`poi_drops.expires_at`은 유저 드랍이든 시스템 드랍이든 항상 NULL).

#### 3.5-1 `custody_events` — 점유(custody) 이력 (어드민 조회용, 신규)

`InventoryItem` 한 개체에 점유 변화가 생길 때마다 쌓이는 append-only 이력. 8종 이벤트
(`Minted`/`UserDrop`/`Pickup`/`Expire`/`Slot`/`Unslot`/`Consume`/`Orphan`)가 아래 상태
전이 화살표와 1:1 대응한다. `from_user`/`to_user`/`actor`는 유저명을 스냅샷 값으로
저장한다(계정 탈퇴로 `public.users` row가 하드 삭제돼도 이름은 남아야 하므로, 라이브 FK
조인에만 의존하지 않는다).

```
Minted(발급 — ①직접지급 또는 ②앰비언트 배치 시점, 이때 serial 확정)
  ├─ ①직접지급 ──────────────────────────────▶ Held
  └─ ②앰비언트 배치 ─▶ AtPoi(소유자 없음)
                          ├─ 픽업(소유권 이전, serial 불변) ─▶ Held
                          └─ 기한 만료(미픽업)              ─▶ Destroyed

Held ─▶ Slotted ─▶ Held
Held ─▶ Consumed(조합 재료 소모) ─▶ Destroyed
Held ─▶ Dropped(유저 배치 — 무기한, 회수·만료 없음) ─ 픽업(소유권 이전) ─▶ Held(새 소유자)
Held/Slotted ─▶ Orphaned(소유자 계정 탈퇴 — 유저 비노출, 어드민 전용)
```

계정 탈퇴 시 Orphan 이벤트 기록은 앱 레벨 로직이 아니라 `BEFORE DELETE ON public.users`
DB 트리거(`log_orphan_custody_events()`)로 구현돼 있다 — 이 저장소에 아직 앱 레벨
"탈퇴 처리 로직"이 없어(계정 삭제는 Supabase Admin API/대시보드에서 직접 처리) 삭제 경로에
관계없이 항상 실행되는 트리거가 더 견고하다고 판단했다. 관련 스키마: `supabase/migrations/
108_item_identity_custody_model.sql`. 어드민 조회 화면은 별도 티켓(20260829_2139)에서 구현.

#### 3.5-2 표준 불변식 1: 원자적 소유권 이전 (2026-08-30 갱신, 티켓 20260830_0057)

`InventoryItem`의 점유(custody) 상태를 바꾸는 모든 RPC는 관련 행을
`SELECT ... FOR UPDATE`로 배타 락 건 뒤 상태를 재확인·전이하는 단일 트랜잭션이어야
한다(동시 요청 중 하나만 성공, 두 상태 컬럼이 서로 모순되는 중간 상태가 절대 커밋되지
않아야 함 — 티켓 20260829_2101). 현재 이 불변식을 따르는 RPC:

| RPC | 전이 | 락 순서 |
|---|---|---|
| `create_user_drop()` | Held → Dropped | `inventory` → `inventory_items` |
| `pickup_drop()` | Dropped/AtPoi → Held | `poi_drops` → `inventory_items` → `inventory` |
| `admin_destroy_orphaned_item()` | Orphaned → Destroyed | `inventory_items` |
| `admin_reassign_orphaned_item()` | Orphaned → Held(새 소유자) | `inventory_items` → `inventory` |
| `slot_item_into_book()` | Held → Slotted | `inventory` → `inventory_items` |
| `unslot_item_from_book()` | Slotted → Held | `user_item_book_slots` → `inventory` → `inventory_items` |

`slot_item_into_book()`/`unslot_item_from_book()`(마이그레이션
`111_item_slot_atomic_rpc.sql`)은 이 목록에서 가장 늦게 합류했다 — 기존
`api/itembooks/[id]/slot/route.ts`가 락 없는 순차 REST 호출로 구성돼 있어, 슬롯
장착과 드랍이 같은 아이템을 거의 동시에 대상으로 하면 `inventory_id`(드랍됨)와
`slotted_in`(장착됨)이 동시에 non-null인 모순 상태가 발생할 수 있었다(티켓
20260830_0055에서 발견, 20260830_0057에서 수정). 락 순서는 표에서 보듯 두 방향
모두 `inventory`를 `inventory_items`보다 먼저 잠그도록 다른 RPC들과 통일돼 있다 —
순서가 반대인 RPC 쌍이 있으면 같은 두 테이블을 동시에 노리는 요청끼리 AB-BA
데드락이 발생할 수 있기 때문이다.

### 3.6 데이터 모델

```sql
CREATE TABLE user_drop_state (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  last_drop_world_id text,                          -- 직전 드랍 세계관 (모멘텀 기준)
  last_drop_book_id uuid,                           -- 직전 드랍 컬렉션
  common_streak int NOT NULL DEFAULT 0,             -- 연속 common 카운터 (rare+ pity)
  last_piece_pity jsonb NOT NULL DEFAULT '{}',      -- {book_id: 카운터} 마지막 조각 pity
  daily_drop_count int NOT NULL DEFAULT 0,          -- 당일 드랍 수 (4번째부터 rarity 하향)
  daily_drop_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- worlds(id, name) + world_adjacency(world_id, adjacent_world_id)  ← xlsx '세계관 인접' 시트 시드
-- item_books.world_id 추가 필요 ← xlsx '팩션' 시트의 세계관 열이 원천
```

### 3.7 엔진 의사코드

```
tryItemDrop(userId, activity) → string[]   -- 드랍된 badge_id 목록 (20260823_007)
  state = user_drop_state 조회/초기화
  1. 드랍 개수: 기본 1개 확정 + 보너스 15% (60분+/고고도면 30%)로 2개째
  2. rarity 추첨 (개당):
     복귀(7일+) → rare+ 확정 / common_streak ≥ 5 → rare+ 확정
     / 주간 첫 활동 → rare+ 확률 2배 / 당일 4번째부터 → common 90%
     / 기본 60/28/9/3 → common이면 common_streak++, rare+면 리셋
  3. 섀도우밴 체크 (rarity 상한으로 작동)
  4. 세계관 선택:
     a. 맥락 오버라이드 매칭 → 60% 확률로 해당 세계관 확정
     b. 아니면 모멘텀 50 / 인접 25 / 탐험 15 (미발동 오버라이드분은 모멘텀 흡수)
  5. 컬렉션 선택: 가중치 = drop_weight × (1−completion×0.7) × (직전 북 0.5)
     완성 북은 ×0.3 잔류 / 마지막 조각 pity 도달 북 있으면 그 배지 확정
  6. 배지 선택: 미보유 우선, rarity 폴백 / 일련번호 난수 부여
  7. 인벤토리 삽입(슬롯 체크) + state 갱신 + 피드 이벤트
  8. 드랍된 badge_id 목록 반환 (획득 연출용 — 20260823_007)
```

> **불변식(2026-08-11, 티켓 20260811_009)**: `tryItemDrop`은 호출마다 `user_drop_state`를
> 새로 읽고 다시 저장하므로, 한 번의 싱크 배치에 활동 여러 건을 넘길 때는 반드시
> **시간순(오래된 → 최신)** 으로 처리해야 한다. 역순(최신 → 오래된)으로 처리하면 배치의
> 마지막 호출(=배치 내 가장 오래된 활동) 결과가 최종 저장돼 `last_activity_at`/
> `daily_drop_date`/`last_drop_world_id`가 실제 최신 활동을 반영하지 못한다.
>
> **⚠️ 반환값이 생겼다고 병렬화하면 이 불변식이 깨진다(2026-08-23, 티켓 20260823_007).**
> `tryItemDrop`이 `void`에서 `string[]`으로 바뀌면서 "결과를 모아야 하니 `Promise.all`로
> 한꺼번에" 라는 유혹이 생기지만, 병렬 호출은 각자 같은 `user_drop_state`를 읽고 서로를
> 덮어써 위 불변식을 정면으로 위반한다. **반드시 `for` 루프 안에서 순차 `await`** 해야 하며,
> 이 제약은 `src/lib/strava/sync.ts` 호출부에도 주석으로 남겨두었다.

### 3.7.1 획득 배지 상세 응답 (2026-08-23, 티켓 20260823_007)

배지 획득 연출(3D 캐러셀)을 위해 **엔진 4경로가 발급한 `badge_id`를 수집**하고,
`syncStravaActivities()` 종료 직전에 `badges` 테이블을 **1회** 조회해
`/api/strava/sync` 응답에 `earnedBadges[]`로 실어 보낸다.

| 경로 | 시그니처 변경 |
|---|---|
| 액티비티배지 | `evaluateBadges()` `number` → `string[]` |
| 아이템배지 | `tryItemDrop()` `void` → `string[]` |
| 체크인 배지 | `sync.ts`에서 발급분 수집 |
| 컬렉션·미션 보상 | `ItemBookCompletionResult.rewardBadgeIds` / `MissionCheckResult.awardedBadgeIds` |

응답 형태: `{ id, name, description, imageUrl, rarity, type }[]`
— 소프트 삭제(`deleted_at`) 배지 제외, `image_url` null은 `''`, 0개면 빈 배열.
**PostgREST는 `.in()` 조회 순서를 보장하지 않으므로 수집 순서대로 재정렬**한다(획득 순서 보존).

> **주의 — `badges` 카운터와 `earnedBadges.length`는 서로 다른 집합이다.**
> 기존 `badges` 카운터(`badgesEarned + poiBadgesEarned + rewardBadgesIssued`)에는
> **아이템 드랍 배지와 미션 보상 배지가 포함되지 않는다.** 반면 `earnedBadges`에는 들어간다.
> 반대로 중복 id 제거와 소프트 삭제 제외로 `earnedBadges`가 더 짧아질 수도 있다.
> 두 값을 같은 의미로 쓰면 안 된다.

### 3.8 유지되는 v1 로직

활성 컬렉션 필터(`item_books.is_active`), 유효기간(valid_from/until), `isDroppableForActivity`(monthly_km 등 누적조건 배지 드랍 제외 가드), 인벤토리 슬롯, 섀도우밴, 피드 이벤트.

### 3.9 튜닝 파라미터 (런칭 후 조정 대상)

| 파라미터 | 초기값 | 튜닝 신호 |
|----------|--------|----------|
| 보너스 드랍률 | 15% (고강도 30%) | "2개 잭팟" 체감 빈도 — 잦으면 특별함 소멸 |
| rare+ pity 임계 | 연속 common 5회 | "좋은 게 안 나온다" 불만 시 ↓ |
| 일일 rarity 하향 시작 | 4번째 활동 | 다회 활동 반복으로 rare+ 기대값 상승 시 ↓ |
| 모멘텀/인접/탐험 | 50/25/15(+10) | "같은 것만 나온다" 피드백 시 모멘텀 ↓ |
| 완성 감쇠 계수 | 0.7 | 첫 북 완성까지 기대 드랍 12~18개 목표 |
| 완성 북 잔류 가중치 | 0.3 | 중복 드랍 과다 체감 시 ↓ |
| 마지막 조각 pity | 세계관 내 5드랍 | 완성 직전 이탈률 관찰 |
| 오버라이드 발동률 | 60% | "우연 같은 필연" 체감 유지 |

### 3.10 성공 지표 & 윤리 기준

- **핵심 지표**: D7/D30 리텐션 (v2 코호트 vs v1), 첫 컬렉션 완성 도달률·소요일
- **서사 체감**: 연속 드랍의 동일/인접 세계관 비율 (목표 70%+), 컬렉션 상세 방문율
- **페이싱**: 북 완성 소요 드랍 수 분포 (<8드랍 완성 비율 5% 미만), 마지막 조각 대기 중 이탈률
- **경고 신호**: 짧은 활동 반복 증가(metric gaming), 드랍 없으면 활동 안 하는 비율(motivation crowding) → 맥락 오버라이드 비중 강화로 보상의 정보성 회복
- **윤리**: 미접속 페널티 없음(복귀는 오히려 rare+ 확정) / 인지된 제한 없음(집중은 가중치로만) / 일일 하향이 자연 종료점 제공 / pity·확률 구조는 공개 가능한 수준으로 단순 유지

### 3.11 적용 로드맵

1. **Phase A (스키마)**: `item_books.world_id` + `worlds`/`world_adjacency` 시드(xlsx 원천) + `user_drop_state` + 일련번호 무작위화
2. **Phase B (빈도)**: Layer 1 교체 — 확정 1개 + 보너스 + rare+ pity + 복귀 보너스
3. **Phase C (서사)**: Layer 2·3 — 모멘텀·인접·완성 감쇠·마지막 조각
4. **Phase D (맥락)**: 맥락 오버라이드 — 배지엔진이 이미 쓰는 날씨·시간 데이터 연결

---

### 3.12 앰비언트(시스템) POI 드랍 — 3축(카테고리/등급비율/대상컬렉션) 배치 (재도입 2026-08-26)

> 유저 행동과 무관하게 시스템이 POI에 아이템배지를 직접 배치하는 판정. 2026-08-25에 한 차례
> 전면 제거됐다가([20260825_004](../../Tickets/20260825_004_Feature_앰비언트-드랍-기능-제거.md))
> 2026-08-26에 재설계 재도입됐다([20260826_009](../../Tickets/20260826_009_BadgeEngine_앰비언트-POI-드랍-재도입.md)).
> 코드: `src/lib/ambient-drop/`.

**제거 판단 경위 (오해 방지를 위해 유지)**: 제거 당시 `poi_drops`에 `source='system'` 행이
0건이었던 것은 기능 결함이 아니라 미들웨어가 `/api/cron/*`를 307로 가로채 cron 자체가
실행되지 않았기 때문이었다([20260825_003](../../Tickets/20260825_003_bug_미들웨어가-cron-요청을-차단.md)).
그럼에도 사용자가 관측과 무관하게 쓰지 않기로 결정했었고, 이후 드랍엔진 v2·컨텐츠·POI 체계가
성숙한 만큼 **옛 설계(전역 커버리지 목표치 모델, `ambient_drop_policy`)를 복원하지 않고
배치 실행형으로 새로 설계**했다.

**배치 모델 — 공유 오브젝트, 유저 드랍과 동일 테이블**: `poi_drops`에 `source='system'`,
`dropper_user_id`/`expires_at`은 NULL로 INSERT한다. 여러 유저가 같은 자리를 두고 경쟁하고
먼저 픽업한 사람이 획득하는 것은 유저 드랍과 동일 — `pickup_drop()` RPC를 그대로 재사용한다
(§3.13). **만료 메커니즘 없음** — 상시 존재를 전제로 하며, 특정 배지를 한시적으로만 노출하고
싶으면 `badges.valid_from`/`valid_until`을 쓴다.

**트리거 — 예약 배포 + 즉시 배포, 상호 배제** (2026-09-06 리뉴얼, [20260906_1206](../../Tickets/20260906_1206_BadgeEngine_앰비언트-드랍-배포시각-어드민설정.md)):
- **예약 배포**: 어드민이 정한 시각(`ambient_drop_config.schedule_hour_kst`, **KST 정시 0~23**)에
  매일 1회 자동 배포한다. Vercel의 cron 표현식은 동적일 수 없으므로 `/api/cron/ambient-drop`은
  **매시 정각**(`"0 * * * *"`)에 호출되고, 핸들러가 지금이 설정 시각인지 판정해 아니면 즉시
  no-op으로 반환한다(`src/lib/ambient-drop/schedule.ts`). `auto_enabled`가 꺼져 있어도 no-op이다.
  - 매시 실행이므로 **하루 2회 배포를 원자적으로 막는다** — `last_auto_run_on`(KST 날짜)에 대한
    조건부 UPDATE 한 번(`claimAmbientDropAutoRun`)으로 오늘 몫을 선점한 **뒤에** 배치한다.
    조회 후 갱신 방식은 동시 호출에서 둘 다 통과하므로 쓰지 않는다.
  - 시각 단위는 **정시**다. 분 단위 가짜 정밀도를 만들지 않았다 — 필요해지면 cron 표현식
    (`0,30 * * * *`)과 UI만 바꾸면 된다.
  - 과거에는 18:00 UTC 코드 상수로 고정돼 있었다. 근거였던 "Vercel Hobby 플랜은 일 1회 초과
    cron을 배포 시점에 거부"(인시던트 20260723_004)는 **Pro 플랜 전환으로 더 이상 성립하지
    않는다**. 마이그레이션 137의 `schedule_hour_kst` 기본값 3(KST 03:00)은 그 구 동작
    (18:00 UTC)을 그대로 승계한 값이다.
- **즉시 배포**: 어드민 `/admin/ambient-drop`의 「지금 배포」 버튼(`POST /api/admin/ambient-drop/deploy`).
  저장된 설정값으로 그 자리에서 1회 배포한다.
- 두 갈래는 **같은 설정값**(3축 + `all_random` + `batch_size` + `max_active_per_poi`)을 쓴다.
  설정은 하나이고 실행 시점만 다르다.
- 상호 배제: `auto_enabled=true`일 때, **설정된 배포 시각** 전후 `exclusion_window_minutes`분
  (어드민 설정값) 동안은 즉시 배포를 거부한다(409) — 레이스 컨디션 방지 목적. 이 창 밖에서는
  자유롭게 즉시 배포 가능. 서버(API) 레벨에서 강제하고, 어드민 화면 버튼 비활성화는 UX 편의일 뿐.

**배포 옵션 — 3축, 축별 명시/무작위 + 전체 무작위 메타 옵션** (`ambient_drop_config` 싱글톤):

| 축 | 명시 모드 | 무작위 모드 |
|---|---|---|
| 카테고리 | `poi_categories`(14종, 2026-09-07 재정리 이후) 중 하나, 또는 `category_slug=NULL`로 "전체" | 실행 시점에 카테고리 하나를 무작위로 선택 |
| 등급(rarity) 비율 | `rarity_common/rare/epic/mystic`(합=1)로 가중 추첨 | 실행 시점에 4개 등급 비율 자체를 무작위로 생성해 그 실행 전체에 적용 |
| 대상 컬렉션(`item_books`) | 단독 또는 멀티 선택(`collection_ids`), 빈 배열은 "전체 컬렉션" | 실행 시점에 활성 컬렉션 1개를 무작위로 선택 |

`all_random=true`면 저장된 축별 모드와 무관하게 실행 시점에 3축을 전부 무작위로 취급한다
(비파괴적 오버라이드 — 저장값은 그대로 남는다).

**배치 실행 로직** (`runAmbientDropBatch`, `src/lib/ambient-drop/index.ts`):
1. 3축을 확정한다(카테고리 슬러그, 등급 분포, 대상 컬렉션 id 목록).
2. 대상 카테고리의 POI 전체를 조회하고, `max_active_per_poi` 미만인 POI만 후보로 남긴다.
3. `type='item' AND deleted_at IS NULL AND item_book_id IS NOT NULL`(+ 컬렉션 필터, + 유효기간
   `valid_from/valid_until`)로 후보 배지를 rarity별로 분류한다. **컬렉션 소속이 없는 아이템배지는
   대상에서 제외된다** — 이 축이 "컬렉션 채우기"를 돕는 것이 목적이기 때문.
4. `batch_size`회 반복 — 활성 드랍이 0개인 POI를 우선 골라 분산 배치하고(발견 경험 분산, 구
   엔진과 동일 원칙), 등급 분포로 가중 추첨한 뒤 그 등급에 후보가 없으면
   `common → rare → epic → mystic` 순서로 폴백한다(현재 카탈로그가 common뿐이라 사실상
   발동하지 않음 — 티켓 §5).
5. 결과를 `engine_decision_log`(`engine='drop'`, `event='ambient_batch_result'`)에 남긴다 —
   자동/수동 모두 동일하게 기록되어 어드민 화면에서 최근 실행 이력으로 조회 가능하다.

**스킵 사유(`AmbientDropSkipReason`)**: `auto_disabled`(자동 실행 OFF로 no-op) ·
`no_eligible_poi`(대상 카테고리에 배치 가능한 POI 없음) · `no_candidate_badges`(조건에 맞는
후보 배지 없음) · `insert_failed`(배지는 뽑았으나 `poi_drops` INSERT 자체가 실패) —
`engine_decision_log`에 그대로 기록되어 실행 이력에서 원인을 구분할 수 있다.

**PostgREST 1000행 상한 대응**: POI·배지 전체 스캔이 컬렉션 완성 판정 버그(티켓 20260825_029)와
같은 클래스의 상한 문제에 걸릴 수 있어(POI 수천 건, 배지 수천 건), `fetchAllRows`로
`.range()` 페이지네이션한다 — "전체 카테고리"/"전체 컬렉션" 모드에서 조용히 일부만 조회되는
사고를 방지한다.

**교차채널 자동 밸런싱은 범위 밖**: 유저별 컬렉션 보유 현황·아이템배지 발행 현황 등을 근거로
앰비언트 채널과 액티비티 드랍엔진 채널의 희귀도 분포를 자동 조정하는 시스템은 만들지 않았다.
지금은 어드민이 수동 설정한 축 값을 그대로 실행할 뿐이다(향후 계획).

**살아있는 레거시(변경 없이 재사용)**:
- `poi_drops.source` 컬럼 — `assign_random_serial()` 트리거(044)와 `poi_drops_source_consistency`
  CHECK가 참조한다. 제거 기간(2026-08-25~26)에는 전 행이 `'user'`였다.
- `assign_random_serial()`의 50,001~999,999 분기 — `source='system'`일 때만 발동. 재도입으로
  다시 실제로 발동한다(제거 기간에는 항상 거짓이었음).
- `pickup_drop()` RPC — 이번 재도입에서 한 줄도 수정하지 않았다.

**구 `ambient_drop_policy`(마이그레이션 044 생성, 100에서 DROP)와의 차이**: 구 모델은 "활성 POI
수 × 커버리지 비율 → 부족분 보충"이라는 전역 상시 커버리지 목표치 모델이었다. 신규
`ambient_drop_config`(마이그레이션 104)는 실행마다 3축을 골라 `batch_size`개를 그때그때
배치하는 배치 실행형이며, 커버리지 계산이 없다. 구 모델의 마지막 운영값(common 86% /
rare 12% / epic 2%, 커버리지 0.15, POI당 최대 1개, 보충 배치 30개, 최종 수정 2026-07-23)은
`batch_size`/`max_active_per_poi`의 초기값 후보로만 참고했다.

### 3.13 유저 드랍/픽업 운영 정책 (PRD 04_PROJECT_SPEC.md에서 이관, 2026-08-06)

> 4카테고리 문서 체계 재정리 시, `Specs/PRD/04_PROJECT_SPEC.md`의 "핵심 비즈니스 규칙"에 있던 드랍/픽업 판정 로직 4개 항목을 이 문서로 이관했다.

- **드랍/픽업은 Supabase RPC로 처리**: 원자 트랜잭션 필요 — API Route에서 직접 두 테이블 업데이트 금지.
- **자기 드랍 픽업 허용**: 2026-07-10 정책 변경. `dropper_user_id` = 현재 유저 필터링 로직 제거.
- **T2 POI 드랍 반경**: 500m (T1과 동일). `DROP_RADIUS_METERS` 상수로 관리.
- **일련번호 형식**: `serial_prefix`(4자리 대문자) + `serial_number`(6자리 zero-pad). 예: `ABCD000042`. (§3.5의 일련번호 무작위화는 이 형식 위에서 채번 순서만 난수화하는 것으로, 형식 자체는 유지된다.)
- **배지 소프트 삭제 시 미픽업 드랍 즉시 무효화** (2026-08-26/27, 티켓 20260826_016·20260827_004):
  배지가 소프트 삭제(`badges.deleted_at`)되면, 그 배지를 가리키는 아직 안 주워진(`picked_up_at
  IS NULL`) `poi_drops`를 `is_available=false`로 즉시 무효화한다. 이미 픽업된 드랍은 이력
  보존을 위해 건드리지 않는다. 단일 배지 삭제(`api/admin/badges/[id]/route.ts`)와 컬렉션
  비활성화로 인한 연쇄 삭제(`lib/admin/itembook-deactivation.ts`)가 공유 함수
  (`lib/admin/poi-drops.ts`의 `invalidateUnclaimedDrops`)로 동일하게 동작한다. 다른 경로
  (수동 DB 조작 등)로 소프트 삭제된 경우를 위한 안전망으로 `api/cron/poi-cleanup`이 매일
  00:00 UTC에 같은 조건을 재확인해 소각한다.

### 3.14 체크인 배지 타입(`type='checkin'`) — 실데이터 일괄 생성 (2026-07-27)

> 타입 식별자는 2026-08-26(티켓 20260826_004)에 `'poi'` → `'checkin'`으로 개명됐다.
> 아래 본문의 `type='checkin'`은 개명 후 기준이다. 지점 테이블 `poi`는 그대로다.

Phase 16에서 스키마만 추가됐던 `type='checkin'` 배지에 실제 데이터를 채웠다. `poi_categories`의 `transit`(대중교통, 973개), `mountain`(산, 847개) 카테고리 POI 전체(총 1,820개)에 대해 **POI 1개 = 배지 1개**로 1:1 생성했다.

> 2026-08-24 기준 현황: `train_subway`(기차/지하철) 929개, `mountain`(산) 847개는 POI와 배지가
> 1:1로 완전히 일치한다. `transit`(대중교통)에 남은 69개는 출구·노선별 중복·정류장이라 22개만
> 배지가 연결돼 있다.
>
> **2026-09-07([[20260907_1243]]) `transit` 카테고리 자체가 삭제됨** — 그 시점 실측상
> 활성 POI는 16개로 더 줄어 있었고(자동수집 산출은 거의 없이 대부분 방치성 중복이었음),
> 삭제 전 `user_checkin_badge_earns`·드랍·차단·조회 이력을 전수 조회해 연결된 유저 활동이
> 0건임을 확인한 뒤 진행했다. 위에서 이 22개(또는 그 이후 변동분)에 연결됐던 체크인 배지는
> `poi.linked_badge_id` 쪽 트리거 지점이 사라져 이제 실물 체크인으로는 획득할 수 없다 —
> 배지 레코드 자체(`badges` 테이블)는 삭제되지 않았으므로 필요하면 어드민에서 다른 POI에
> 재연결 가능. 삭제 전 스냅샷은 `poi_backup_144`(마이그레이션 144, DB 테이블)에 보관돼 있다.

- **이름**: 배지 이름 = POI 이름 그대로 사용 (동명 POI가 46그룹 존재 — 위치가 다르므로 각각 별도 배지로 생성, 이름 중복 허용).
- **설명**: 자동 생성. mountain → `"{POI명}을(를) 올랐습니다"`, transit → `"{POI명}을(를) 지나갔습니다"` (한글 받침 유무로 을/를 자동 판별).
- **아이콘**: 1,820개 전부 동일 아이콘 사용 — `public/badges/poi/anyway_star.png` (별 모양 "ANYWAY" 로고, 사용자 제공).
- **등급**: 전부 `rarity='common'`.
- **연결**: `poi.linked_badge_id`에 신규 생성된 배지 id를 1:1로 세팅 (다대일 연결 UI는 어드민 `/admin/badges/[id]/poi-links`에서 계속 지원되며, 이번 일괄 생성과는 별개로 이후 개별 POI를 재연결할 수도 있음).
- **반복 획득**: 기존 설계대로 `user_checkin_badge_earns`에 매 통과마다 새 행 적재 (평생 1회 제약 없음).
  **[[20260826_001]]부터 반복 획득(2회차 이상)도 피드·알림에 노출된다** (기존에는 최초 획득만
  피드에 기록되고 반복 획득은 알림에만 고정 문구로 떴다). 문구는 [[20260826_004]]에서
  피드 `'체크인 했어요'` / `'{N}번째 체크인 했어요'`, 알림 `'{지점}에서 {N}번째 체크인 했어요'`로 통일됐다.
  상세 문구·N 산정 기준(badge_id 단위)·묶음 알림 합성 규칙은 `Specs/PRD/Notification/PRD.md` §3 참조.
- **재현용 SQL**: `supabase/seed_poi_badges_20260727.sql` (INSERT/UPDATE 전량 기록, service_role 키로 직접 실행됨).

**POI 매칭 반경 — 카테고리별 기준값 (2026-08-24 기준)**

`src/lib/poi/radius-policy.ts`의 `EXACT_MATCH_RADIUS_BY_CATEGORY`가 최종값을 강제한다
(호출부가 다른 값을 넘겨도 덮어쓴다).

| 카테고리 | 기본 반경 |
|---|---|
| `mountain` (산) | **150m** ← 2026-08-11 50m에서 상향 |
| `train_subway` (기차/지하철) | **50m** ← 2026-08-24 `transit`에서 분리, 같은 값 유지 |
| 기타 카테고리 | POI별 개별 설정 (기본 500m) |

> `transit`(대중교통) 행은 2026-09-07([[20260907_1243]]) 카테고리 자체가 삭제되며 함께
> 제거됨(`radius-policy.ts`의 해당 항목도 코드에서 삭제) — 더 이상 존재하지 않는다.

> **분리 배경(2026-08-24, [[20260824_023]])**: `transit`에 지하철·기차역과 버스정류장·출구·
> 자전거대여소가 섞여 있어, 역에만 JAM METRO 디자인 배지를 적용하기 위해 이름이 '역'으로
> 끝나는 929개를 `train_subway`로 분리했다(tier 1 = 역 929개 / tier 2 = 그 외 69개로 경계가
> 정확히 일치). **새 카테고리를 만들 때 이 표에 반경을 등록하지 않으면 기본값 500m가 적용되어
> 2026-08-11 오탐 인시던트가 재발한다.**

> **상향 배경**: 산 정상부는 GPS drift가 크고 단일 좌표(정상)로만 표현되어 루트가 정상 인근을 지나도 50m 반경 안에 들어오지 않는 경우가 많았음. 2026-08-11에 `mountain` 카테고리 847개 POI(`radius_meters=50`)를 150m로 일괄 업데이트. 나머지 6개(이미 500m)는 그대로 유지.

### 3.15 종목별 드랍 가중치 — 걷기 계수 0.4 (2026-08-08)

> 배경: 걷기는 다른 종목 대비 MET(운동강도)가 낮아 활동당 아이템 드랍 기대값을 낮출 필요가 있어 도입. 상세: `Service Plan/Tickets/20260808_001_Content_걷기배지체계-v4-전면개편.md`.

`jam-web/src/lib/drop-engine/constants.ts`에 `ACTIVITY_TYPE_DROP_WEIGHT`(walking: 0.4) + `DEFAULT_ACTIVITY_DROP_WEIGHT`(그 외 1.0) 추가. `getActivityDropWeight(act)`는 걷기이면서 축1 게이트(§2.10)를 통과한 활동에만 0.4를 반환.

- **확정 1개 드랍(§3.1)에는 가중치 미적용** — "활동 1건 = 최소 1개 확정" 원칙은 걷기에도 그대로 유지. 가중치는 `rollBonusDrop(policy, intense, rand, activityWeight=1.0)`의 4번째 파라미터로만 적용되어 **보너스(2번째) 드랍 확률**만 낮춘다. `dropCount = 1 + (rollBonusDrop(...) ? 1 : 0)`에서 `1`은 가중치 무관.
- `activityWeight` 기본값 1.0으로 기존 호출부(걷기 외 종목) 하위호환 유지.
- **DB 스키마 변경 수반**: `user_drop_state.common_streak`(rare+ pity 카운터, §3.6)가 걷기 활동으로 인해 0.4 같은 소수 단위로 증가하게 되어, 기존 INTEGER 컬럼에서는 매 upsert마다 반올림(0.4→0)되어 걷기의 pity 기여가 사라지는 문제가 있었다. `076_walking_badges_v4.sql`과 별도로 `077_common_streak_numeric.sql`에서 `NUMERIC(8,2)`로 확장(TS 타입 `number`는 변경 불필요).

### 3.16 아이템북 완성 판정 — 완성 기준선(분모)은 소프트 삭제와 무관하게 고정 (2026-08-25, 티켓 20260825_025)

> 20260825_024(조사) → 025(결정·구현). 사용자 승인 방향 (a) 채택.

- **정책**: 아이템북 완성 판정의 **분모(북 소속 배지 수)는 소속 배지의 소프트 삭제(`deleted_at`) 여부와
  무관하게 고정된다.** `jam-web/src/lib/itembook/checker.ts`(`badgeCountByBook`)와
  `completable.ts`(`badgeIdsByBook`/`poiBadgeIds`)는 북 소속 배지를 조회할 때 `deleted_at` 필터를
  적용하지 않는다 — `item_book_id` in + `type in ('item','poi')`만으로 집계한다.
- **의미**: 완성 기준선(threshold)은 관리자의 배지 삭제 행위와 무관하게 불변이다. 그 결과 북 소속
  배지 중 일부가 삭제되고 그 배지를 아직 갖지 못한 유저는 해당 북을 **영구히 완성할 수 없다**
  (신규 발급이 막힌 배지이므로) — 이는 이 정책이 감수하는 의도된 트레이드오프다.
- **§2.8/§3.7.1의 "이력 유지" 원칙(20260823_004)과는 구분되는 별도 정책**이다. 004는 유저 개별
  이력(이미 보유한 것)을 삭제 필터로 재해석해 유실시키지 않는다는 원칙이고, 이번 정책은 유저별
  이력이 아니라 **컬렉션 완성 기준선 자체**를 고정하는 것이다.
- **분자·분모 집합 일치**: `checker.ts`의 분자(`slotCountByBook`, `user_item_book_slots` raw row
  count)는 원래 배지의 삭제 여부를 보지 않았다. 분모도 이제 동일하게 삭제 여부를 무시하므로,
  분자·분모가 항상 "북 소속 배지 전체(삭제 포함)"라는 같은 집합을 기준으로 계산된다 — 삭제로 인해
  분모만 줄어 완성으로 오판정되고 보상 배지가 잘못 지급되던 버그(20260825_024에서 발견)도 함께 해소.

### 3.17 POI 활성화 상태(`poi.is_active`)와 판정 로직 연동 (2026-08-30, 티켓 20260830_1620)

> `poi.is_active`는 20260830_1619에서 어드민 전용 노출 토글로 먼저 추가됐고, 이 티켓에서
> 실제 드랍·체크인·매칭 로직에 연동됐다.

- **`false`로 꺼진(운영 종료) POI는 "앞으로의" 신규 판정에서만 제외된다** — 이미 발급된 배지,
  이미 놓인 드랍(유저 드랍·앰비언트 드랍 모두)에는 소급 적용하지 않는다.
- **필터가 적용되는 지점**:
  - `src/lib/poi/matcher.ts`(`matchPoisForActivity`) — 체크인 배지 판정의 유일한 매칭 경로
    (§3.14). 스트라바 싱크는 신규 활동만 재처리하므로 과거 이력에는 영향 없음.
  - `src/app/api/drops/route.ts` GET — 지도·목록 T1 POI 노출, POST — 드랍 생성 시 서버측
    재검증(캐시된 poi_id로 요청해도 `poi_not_found`로 거부).
  - `src/app/api/checkin-badges/route.ts` — 지도의 체크인 배지 마커 노출.
  - `src/lib/ambient-drop/index.ts`(`runAmbientDropBatch`) — 시스템이 새로 배치할 후보 POI.
- **필터를 적용하지 않은 지점(의도적)**:
  - `src/app/api/drops/[dropId]/pickup/route.ts` — **이미 놓인 드랍의 픽업은 "신규 판정"이
    아니라 기존 거래를 완결하는 행위**라 그대로 허용한다. POI가 나중에 비활성화돼도 그 전에
    놓인 드랍이 영구히 못 줍는 상태로 묶이지 않게 하기 위함.
  - `src/lib/notifications/batch/dropSpot.ts`(#18 드랍 지점 알림) — 기존 활성 드랍(`is_available`)
    을 대상으로 하는 열람 알림이라 픽업 정책과 동일하게 유지.
  - `src/app/(main)/badges/page.tsx` 체크인 탭 — 유저가 **이미 획득한** 체크인 배지만 표시하는
    이력 화면이라 무관.
  - `src/app/(main)/badges/[id]/page.tsx`의 **획득 이력**(`earned.poi`/`checkinEarns[i].poi`)도
    이력이라 무관. 단, 같은 파일에서 **미획득** 체크인 배지의 "여기로 가보세요" 안내(`PoiMapButton`)용
    `linked_badge_id` 조회는 필터를 적용한다(운영 종료 지점을 안내하면 안 되므로).
- **유저 노출 정책(지도/목록)**: 완전히 숨김으로 결정. "운영 종료" 배지 표시 등 대안은 채택하지
  않았다 — 스펙 미정 상태에서 가장 단순하고 사고 위험이 적은 기본안을 택함(추후 변경 가능).

## 4. 두 엔진의 게이미피케이션 역할 분담

```
          장기 (mastery)                    단기 (session reward)
  ┌─────────────────────────┐      ┌─────────────────────────────┐
  │ 액티비티배지              │      │ 아이템배지                    │
  │ - 조건 공개, 목표 지향     │      │ - 무엇이 나올지 모름, 서프라이즈 │
  │ - 티어 성장 = 실력 성장    │      │ - 세계관 서사 몰입 + 수집       │
  │ - 발급 = 성취의 인증       │      │ - 컬렉션 완성 = 중기 목표      │
  └─────────────────────────┘      └─────────────────────────────┘
         "내가 해냈다"                     "오늘은 뭐가 나왔지?"
```

- 액티비티배지의 홍수 방지·첫싱크 게이트 = **성취 인플레이션 방지**.
- 아이템배지의 확정 1개 + 변동 희귀도 = **모든 활동에 대한 인정 + 기대감**.
- 두 엔진 모두 활동 자체의 내적 가치를 침식하지 않도록 설계 (informational reward 원칙).

---

## 5. 운영 문서·코드 맵

```
[운영 문서 — 단일 진실 원천]
Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md ← 이 문서. 발급·드랍 로직 전체
Specs/Content/ACTIVITY_BADGES.md          액티비티배지 115종 전체 목록·조건·설명
Specs/Content/ITEMBOOKS.xlsx              아이템배지 ~900종 목록 + '세계관 인접' 시트
Specs/Content/COMBINE_RECIPES.md          조합 레시피 목록
Specs/Content/FACTIONS.md                 세계관 10종 개요·컬렉션 매핑·인접 그래프
Specs/Content/POI.md                      지점(POI) 컨텐츠 (스텁)

[코드]
src/lib/badge-engine/index.ts             액티비티배지 엔진 (구현)
src/lib/badge-engine/activityFilters.ts   요일·시간대·주경계 등 순수 필터 헬퍼 — §2.13
                                          + 휴식(활동 공백) 판정 evaluateRestConditions() — §2.16
src/lib/badge-engine/badgeKind.ts         배지 종류 3분기(등급형·레벨형·반복형) — §2.14
src/lib/badge-engine/crossGate.ts         2단 교차 게이트 판정 — §2.15
src/lib/badge-engine/conditionRegistry.ts 조건 필드 메타 단일 출처 + fail-closed — §2.3-0
src/lib/badge-engine/repeatOccurrences.ts 회차 계산(CONSUMED_REPEAT_KEYS) + 기간 단위 회차
                                          판정(isPeriodDrivenRepeatCondition) — §2.14
src/lib/badge-engine/conditionAxes.ts     조건 축 분류(PER_ACTIVITY_KEYS 등) 단일 출처 — §2.13-1
src/lib/badge-engine/badgeProgress.ts     진행 계산 계층(표시 전용, 발급 판정과 분리) — §2.13
src/lib/badge-engine/metricLabels.ts      배지 지표 라벨·단위 배치 조회 — §2.13
src/lib/badge-engine/reevaluateCatalog.ts 카탈로그 시딩 후 일괄 재평가 조립 — §2.17
src/app/api/admin/badges/reevaluate-all/route.ts  위 재평가 어드민 라우트 — §2.17
src/lib/drop-engine/index.ts              드랍 엔진 (v1 구현 — v2는 §3 설계)
src/lib/ambient-drop/                     앰비언트(시스템) POI 드랍 엔진 — §3.12
src/lib/strava/sync.ts                    싱크 파이프라인 (두 엔진 호출) — updateFamilyProgressSnapshots §2.13
src/lib/abusing/                          섀도우밴 정책 (공용)
supabase/migrations/033_reseed_activity_badges_v3.sql   액티비티배지 시드
supabase/migrations/044_ambient_poi_drop.sql            앰비언트 드랍 최초 스키마 — §3.12
supabase/migrations/100_remove_ambient_drop.sql         앰비언트 드랍 제거(2026-08-25) — §3.12
supabase/migrations/104_ambient_drop_reintroduce.sql    앰비언트 드랍 재도입(2026-08-26) — §3.12
supabase/migrations/137_ambient_drop_schedule_hour.sql  예약 배포 시각 어드민 설정(2026-09-06) — §3.12
supabase/migrations/137_ambient_drop_schedule_hour.sql  예약 배포 시각(KST) 어드민 설정 — §3.12
supabase/migrations/076_walking_badges_v4.sql           걷기 신규 배지 32종 — §2.10
supabase/migrations/077_common_streak_numeric.sql       common_streak NUMERIC 확장 — §3.15
supabase/migrations/128_user_family_progress_consistency_trigger.sql   진행 스냅샷 테이블 + 계열 정합성 트리거 — §2.13
supabase/migrations/140_condition_keys_v5_extension.sql  조건 키 3종 CHECK 개방(누적 이동시간·월간 횟수·개인기록 지표) — §2.3
supabase/migrations/141_backfill_cadence_normalization.sql  케이던스 ×2 재정규화 백필(러닝·트레일러닝) — §2.1-1
```
