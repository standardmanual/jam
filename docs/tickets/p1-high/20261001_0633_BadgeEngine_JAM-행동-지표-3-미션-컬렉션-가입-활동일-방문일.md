---
id: "20261001_0633"
category: BadgeEngine
priority: P1
status: IN_PROGRESS
created: 2026-10-01
closed:
parent: "20260930_1456"
---

# [BadgeEngine] JAM! 행동 지표 ③ 미션·컬렉션·가입 경과일·주간 활동일·같은 지점 방문일

> 상위: 20260930_1456 · 하위 순서 ③ · 선행 ①(20261001_0631)

## 핵심 요약

- 요구사항: 미션 완료, 컬렉션 완성, 가입 경과일, 주간 활동일, 같은 지점 방문일 지표를 만든다. 주간 활동일은 활동 기록이 있는 날과 체크인한 날로 센다(Q2, KST 주 경계). 같은 지점 방문일은 지점별 서로 다른 방문일 중 최댓값이다. 동기화 끝과 컬렉션 장착 경로에서 판정한다.
- 구현 계획: 아래 「구현 계획」(파일 단위, 혜린 초안·카리나 확정 2026-10-01, 사용자 결정 R1~R6 반영)을 따른다. 주 경계는 KST로 명시 계산한다(`activityFilters.ts:78-84`의 `getMondayKey`는 서버 로컬 시간대라 그대로 쓰지 않는다).
- 관련 파일: `jam-web/src/lib/strava/sync.ts`(동기화 끝, 1039·1058·1084줄 근처), `jam-web/src/app/api/itembooks/[id]/slot/route.ts:74`, `user_mission_completions`, `user_item_book_completions`, `user_checkin_badge_earns`, `strava_activities`

## 시작 절차

상위 티켓 20260930_1456의 「주요 의사결정」(혜린 시작 검토, 사용자 결정 Q1~Q3, 가정 A1~A20, 포인트 추천표)이 이 티켓의 전제다. 혜린 검토는 1456에서 끝났으므로 다시 하지 않는다.
그 결정과 다르게 가야 하면 멈추고 사용자에게 확인한다. 마이그레이션은 사용자 승인 뒤 메인 세션이 실행한다.

- 확인할 것(민지, 티켓 20261001_0632 게이트): `jamActionBadges.ts` 머리 주석(19줄)과 `jamActionRoute.ts` 머리 주석(5줄)은 동기화(`sync.ts`)가 `evaluateJamActionBadges`를 직접 부른다고 적는다.
  지금은 호출이 없다(①의 계획이 ③을 내다보고 쓴 주석). ③에서 동기화를 연결한 뒤 두 주석이 사실과 맞는지 확인한다.

## 구현 계획

파일 단위 계획이다(혜린 초안, 카리나 확정 2026-10-01, 사용자 결정 R1~R6 반영). 기준을 넘는 크기라 이 계획으로 계획 반환을 면제한다. **①이 staging에 깔아 둔 공용 틀 위에 키를 더한다**
(`jam-web/src/lib/badge-engine/jamActionBadges.ts` 머리 주석의 「지표를 더하는 법」). 0632가 4키를 얹었으므로 이 티켓 뒤 JAM! 행동 지표는 13개(보조 키 1개 별도)다. 줄 번호는 2026-10-01 staging 기준이라 착수 때 이름으로 다시 찾는다.

### 사용자 결정 (2026-10-01, 착수 때)

- **R1 가입 이전 기록**: 주간 활동일·같은 지점 체크인 일수·최근 활동일은 가입한 날(KST) 이후 기록만 센다. 미션·컬렉션은 Q1대로 전체 기록을 센다.
- **R2 활동한 날의 범위**: JAM! 종목(`normalized.jamActivityType`이 있는 활동)만 센다. 걷기는 축1 게이트(`activityFilters.ts`의 `passesWalkingGate`: 0.5km·10분 이상, 평균 시속 2~8km)를 통과해야 하고,
  모든 종목은 차량 속도 필터(평균 시속 ≤ `abusing_policy.vehicle_speed_filter_kmh`, 비정상 값이면 `DEFAULT_POLICY` 60으로 폴백, `sync.ts:937-952`와 같은 규칙)를 통과해야 한다.
- **R3 가입 경과일의 최근 활동 조건**: 보조 키 `signup_recent_active_days`(선택)를 둔다. 값이 있으면 「판정하는 날(KST)을 포함한 최근 30일 가운데 활동한 날이 n일 이상」도 채워야 발급한다. 비우면 가입 일수만 본다.
- **R4 가입 경과일 판정 시점**: 새 활동이 없는 동기화에서도 가입 경과일을 판정한다(카리나 가정 제시, 사용자 이의 없음). 오래 쉰 계정은 R3의 보조 키가 막는다.
- **R5 체크인한 날**: 체크인을 만든 활동의 날짜(`triggered_by_activity_date`, KST)로 센다. 이 값이 없는 행은 세지 않는다(카리나 가정). 체크인한 날에는 R2 필터를 적용하지 않는다(Q2가 체크인한 날을 따로 센다고 정했다).
- **R6 컬렉션 장착 판정**: 장착 POST가 성공할 때마다 판정한다(카리나 가정). 장착 RPC가 완성 여부를 돌려주지 않고, 완성이 아닌 장착이면 값이 그대로라 잘못 발급되지 않는다.
- 「활동한 날」은 이 티켓 전체에서 하나의 정의를 쓴다: **가입한 날(KST) 이후, R2를 통과한 활동의 시작 날짜(KST) ∪ R5의 체크인한 날.** 주간 활동일과 R3의 최근 활동일이 이 정의를 공유한다.

### 라이브 확인 (카리나, 2026-10-01)

- 행 수: `user_mission_completions` 2, `user_item_book_completions` 3, `strava_activities` 587(유저당 최대 243, 가입 후 78), `user_checkin_badge_earns` 71(활동 연결 64, 연결 없음 7).
- 인덱스: `idx_user_mission_completions_user (user_id)`, `user_item_book_completions_pkey (user_id, item_book_id)`, `idx_strava_activities_user_start (user_id, start_date DESC)`,
  `idx_user_checkin_badge_earns_user_badge (user_id, badge_id)`. 네 테이블 모두 `user_id` 선두 인덱스가 있어 새 인덱스는 만들지 않는다.
- `strava_activities`에는 현지 시각 열이 없고 `start_date`(timestamptz)만 있다. `processed_via`는 `sync`·`reconcile`·`manual_backfill`이다.
- 활동 기록의 87%(509/587)가 가입 전이다. 가입 후 78건 가운데 종목 없음 23건(거리 0km, 평균 13분), 걷기 게이트 탈락 1건, 차량 속도 탈락 0건(상한 60)이다.
- 체크인 71행 가운데 45행은 `earned_at`(동기화 시각)의 KST 날짜가 활동 날짜와 다르다. 활동과 연결된 64행의 날짜는 모두 같은 날 활동 기록과 겹친다.
  `triggered_by_activity_date`가 없는 7행은 모두 `00000000…` 시험 계정의 행이고 같은 시각에 묶음으로 들어갔다(2026-09-11·17 KST).
- 아래 1번 기준값 SQL(실행 확인함) 결과, 시험 계정을 뺀 유저 4명: 가입 경과일 22~25, 최근 30일 활동일 10~11, 주간 활동일 3~5, 같은 지점 체크인 일수 3~6, 미션 완료 0~1, 컬렉션 완성 0~3.

### 키 이름과 정의 (③)

| 키 | 값 | 세는 것 | 근거 |
|---|---|---|---|
| `mission_complete_count` | 정수 ≥1 | 내가 완료한 서로 다른 미션 수. 전체 기록 | A9, Q1 |
| `collection_complete_count` | 정수 ≥1 | 내가 완성한 서로 다른 컬렉션 수. 전체 기록 | A10, Q1 |
| `days_since_signup` | 정수 1~3650 | 가입한 날(KST)부터 오늘(KST)까지의 날짜 차. 가입한 날이 0 | A11, R4 |
| `signup_recent_active_days` | 정수 1~30, 선택 | `days_since_signup`의 보조 키. 오늘(KST)을 포함한 최근 30일 가운데 활동한 날 수 | R3 |
| `weekly_active_days` | 정수 1~7 | 월~일(KST) 한 주 안의 활동한 날 수. 역대 최고 주의 값 | A12, Q2, R1, R2 |
| `same_spot_checkin_days` | 정수 ≥1 | 지점(`poi_id`)별 체크인한 서로 다른 날(KST) 수의 최댓값. 합이 아니다 | A13, R1, R5 |

- 키 이름에 「checkin」을 쓰는 이유: `docs/specs/UX_WRITING_GUIDELINE.md:70`이 「방문」을 금지어로 두고 「체크인」을 고정 용어로 정한다. 어드민·유저 문구도 전부 「체크인」이다.
- 6개 모두 `role: 'meta'`, `evaluation: 'external'`이다. 보조 키는 `pairedWith: ['days_since_signup']`이고 **`USAGE_METRIC_CONDITION_KEYS`(`conditionRegistry.ts:2065-2067`)에서 뺀다**(`mission_reward`처럼).
  그래야 0712의 「한 배지에 사용량 지표 하나」 가드가 `days_since_signup` + 보조 키 조합을 막지 않는다.
- 기존 키 재사용 검토(혜린): 재사용할 키가 없다. `active_days_count`(560줄)는 누적이고 메인 엔진이 평가해 체크인을 합칠 수 없다. `weekly_count`(690줄)는 활동 횟수를 세고 `getMondayKey`를 쓴다.
  `checkin_category_count`·`checkin_badge_count`는 보유 배지 수, `poi_id`는 필터다.

### 원천과 계산

| 키 | 원천 | 계산 |
|---|---|---|
| `mission_complete_count` | `user_mission_completions`(`011_phases_15_18.sql:28-34`, `UNIQUE(user_id, mission_id)`) | `select('id', { count: 'exact', head: true }).eq('user_id', userId)`. UNIQUE라 행 수가 서로 다른 미션 수다 |
| `collection_complete_count` | `user_item_book_completions`(`017_item_book_slots.sql:19-24`, PK(user_id, item_book_id)) | 같은 head count. 해제·교체는 기록을 지우지 않는다(혜린 grep) |
| `days_since_signup` | `users.created_at`, 단일 출처 `getSignupAnchorDate`(`jam-web/src/lib/strava/activity-history.ts:47-62`) | `kstDateString`(`jam-web/src/lib/notifications/kst.ts:51`)으로 두 KST 날짜를 얻어 `Date.UTC`로 차를 센다. 가입 시각이 `undefined`면 **던진다** |
| `signup_recent_active_days` | 「활동한 날」 | 오늘(KST) 포함 최근 30일(오늘-29일 ~ 오늘)에 든 날 수 |
| `weekly_active_days` | 「활동한 날」 | 날마다 그 주 월요일 키(KST)를 구해 묶고 최대 크기 |
| `same_spot_checkin_days` | `user_checkin_badge_earns`(`poi_id`, `triggered_by_activity_date`) | 가입 후·날짜 있는 행만, `poi_id`별 서로 다른 KST 날짜 수의 최댓값 |

- 「활동한 날」의 원천: ① `strava_activities`의 `start_date, normalized`(가입한 날 KST 0시 이후, R2 판정은 `normalized`의 `jamActivityType`·`distanceKm`·`movingTimeSec`·`averageSpeedKmh`로 한다)
  ② `user_checkin_badge_earns`의 `triggered_by_activity_date`(NULL 제외, 가입 후). `normalized`가 없거나 필드가 비면 그 활동은 세지 않는다.
- 수동 입력 활동은 저장된 정보로 구분할 수 없다(`normalizeActivity`, `sync.ts:292-318`이 `manual`을 옮기지 않는다). 잔여 위험은 임계값·포인트를 작게 두어 줄이고 문서에 한계로 적는다.
- 모든 계산 함수는 DB 오류를 던지고, 못 센 지표만 건너뛴다(`evaluateJamActionBadges`의 기존 fail-closed).

1. **마이그레이션 203: CHECK 키 확장(6키)** `jam-web/supabase/migrations/203_condition_json_progress_keys.sql`(새 파일). `db-migration-rules.md`를 먼저 읽는다.
   `201_condition_json_drop_pickup_keys.sql`을 복사해 시작한다(머리, `BEGIN`, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, `COMMIT`, 검증 주석, 되돌림).
   허용 키는 201의 66개에 `'mission_complete_count', 'collection_complete_count', 'days_since_signup', 'signup_recent_active_days', 'weekly_active_days', 'same_spot_checkin_days'`를 더해 **72개**.
   마지막 주석 `-- 메타데이터 필드 — 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표 (203, 티켓 20261001_0633)`. `measurable_keys`에는 넣지 않는다.
   `condition-registry.test.ts`가 `ADD CONSTRAINT badges_condition_json_known_keys`가 든 가장 큰 번호 파일을 최신 CHECK로 자동 탐지하므로 이 문자열과 작은따옴표 리터럴 형식을 그대로 쓴다.
   되돌림은 201의 66개 배열로, 사전 조회 `SELECT count(*) FROM public.badges WHERE condition_json ?| ARRAY[…6키…];`가 0일 때만. **번호는 착수 때 원격 staging 기준으로 다시 확인한다.**
   검증 주석에 6지표 기준값 쿼리(읽기 전용, 카리나가 2026-10-01 라이브에서 실행 확인)를 둔다:
   ```
   WITH su AS (SELECT id, (created_at AT TIME ZONE 'Asia/Seoul')::date AS sd FROM users),
   pol AS (
     SELECT CASE WHEN (to_jsonb(p)->>'vehicle_speed_filter_kmh')::numeric > 0 THEN (to_jsonb(p)->>'vehicle_speed_filter_kmh')::numeric ELSE 60 END AS vmax
     FROM abusing_policy p WHERE p.id = 1
   ),
   act_days AS (
     SELECT a.user_id, (a.start_date AT TIME ZONE 'Asia/Seoul')::date AS d
     FROM strava_activities a JOIN su ON su.id = a.user_id
     WHERE (a.start_date AT TIME ZONE 'Asia/Seoul')::date >= su.sd
       AND a.normalized->>'jamActivityType' IS NOT NULL
       AND (a.normalized->>'averageSpeedKmh')::numeric <= (SELECT vmax FROM pol)
       AND (a.normalized->>'jamActivityType' <> 'walking'
            OR ((a.normalized->>'distanceKm')::numeric >= 0.5
                AND (a.normalized->>'movingTimeSec')::numeric / 60 >= 10
                AND (a.normalized->>'averageSpeedKmh')::numeric BETWEEN 2 AND 8))
   ),
   chk AS (
     SELECT e.user_id, e.poi_id, (e.triggered_by_activity_date AT TIME ZONE 'Asia/Seoul')::date AS d
     FROM user_checkin_badge_earns e JOIN su ON su.id = e.user_id
     WHERE e.triggered_by_activity_date IS NOT NULL
       AND (e.triggered_by_activity_date AT TIME ZONE 'Asia/Seoul')::date >= su.sd
   ),
   days AS (SELECT user_id, d FROM act_days UNION SELECT user_id, d FROM chk),
   wk AS (SELECT user_id, date_trunc('week', d)::date AS w, count(*) AS n FROM days GROUP BY 1, 2),
   spot AS (SELECT user_id, poi_id, count(DISTINCT d) AS n FROM chk GROUP BY 1, 2)
   SELECT su.id,
     (SELECT count(*) FROM user_mission_completions m WHERE m.user_id = su.id) AS mission_complete_count,
     (SELECT count(*) FROM user_item_book_completions c WHERE c.user_id = su.id) AS collection_complete_count,
     (now() AT TIME ZONE 'Asia/Seoul')::date - su.sd AS days_since_signup,
     (SELECT count(*) FROM days WHERE days.user_id = su.id AND days.d > (now() AT TIME ZONE 'Asia/Seoul')::date - 30) AS signup_recent_active_days,
     COALESCE((SELECT max(n) FROM wk WHERE wk.user_id = su.id), 0) AS weekly_active_days,
     COALESCE((SELECT max(n) FROM spot WHERE spot.user_id = su.id), 0) AS same_spot_checkin_days
   FROM su;
   ```
   (`date_trunc('week', …)`는 월요일 시작이라 월~일 규칙과 같다.) 인덱스 마이그레이션은 만들지 않는다(위 라이브 확인).
2. **레지스트리·타입·폼·유저 문구·저장 검증**
   - `jam-web/src/lib/badge-engine/conditionRegistry.ts`: 드랍·픽업 블록 뒤, `] as const` 앞에 「JAM! 카테고리 — 미션·컬렉션·가입 경과일·활동일·체크인 일수 지표(티켓 20261001_0633)」 블록.
     `drop_item_count` 모양을 복사한다(`role: 'meta'`, `evaluation: 'external'`, `direction: 'higher'`, `input: 'integer'`, `step: 1`).

     | 키 | label | unit | min / max | chip | detail | form state / placeholder / help |
     |---|---|---|---|---|---|---|
     | `mission_complete_count` | 완료한 미션 수 | 개 | 1 / 1000000 | `미션 완료 ${n}개↑` | `완료한 서로 다른 미션 ${n}개 이상` | `missionCompleteCount` / 3 / 「서로 다른 미션만 세요. 같은 미션은 다시 참가해도 1개예요.」 |
     | `collection_complete_count` | 완성한 컬렉션 수 | 개 | 1 / 1000000 | `컬렉션 완성 ${n}개↑` | `완성한 컬렉션 ${n}개 이상` | `collectionCompleteCount` / 2 / 「컬렉션의 모든 배지를 장착해 완성한 컬렉션만 세요. 장착을 해제해도 완성 기록은 남아요.」 |
     | `days_since_signup` | 가입 경과일 | 일 | 1 / 3650 | `가입 ${n}일↑` | `가입 후 ${n}일 이상 경과(한국 날짜 기준)` | `daysSinceSignup` / 100 / 「가입한 날을 0일로 세는 한국 날짜 차이예요. 동기화할 때 확인해요. 최근 활동 조건을 함께 걸 수 있어요.」 |
     | `signup_recent_active_days` | 최근 30일 활동일 | 일 | 1 / 30 | `최근 30일 ${n}일↑` | `최근 30일 동안 활동한 날 ${n}일 이상` | `signupRecentActiveDays` / 4 / 「가입 경과일과 함께 써요. 판정하는 날을 포함한 최근 30일 동안 활동한 날이 이 일수 이상이어야 받아요. 비워 두면 가입 일수만 봐요.」 |
     | `weekly_active_days` | 주간 활동일 | 일 | 1 / 7 | `주 활동 ${n}일↑` | `한 주(월~일, 한국 시간)에 활동한 날 ${n}일 이상` | `weeklyActiveDays` / 3 / 「걷기·러닝·트레일 러닝·자전거 활동이 있는 날과 체크인한 날을 세요. 걷기는 0.5km·10분 이상만, 차량 속도로 이동한 기록은 빼요. 가입한 날부터 세고, 가장 많이 활동한 한 주(월~일)로 판정해요.」 |
     | `same_spot_checkin_days` | 같은 지점 체크인 일수 | 일 | 1 / 3650 | `같은 지점 ${n}일↑` | `같은 지점에 서로 다른 ${n}일 이상 체크인` | `sameSpotCheckinDays` / 10 / 「지점마다 체크인한 날짜를 세고, 가장 많은 지점의 일수로 판정해요. 같은 날 여러 번 체크인해도 1일이에요. 가입한 날부터 세요.」 |

     보조 키에 `pairedWith: ['days_since_signup']`. `USAGE_METRIC_CONDITION_KEYS`의 filter에 `k !== 'signup_recent_active_days'`를 더한다(주석에 이유). `weekly_active_days`의 `max: 7`은 저장 검증에도 걸리는지 착수 때 확인한다.
   - `jam-web/src/types/database.ts`: `BadgeCondition`의 `picked_up_by_user_count` 다음에 6필드(`/** [JAM!] … */` 설명).
   - `jam-web/src/app/admin/badges/conditionFormFields.ts`: `ConditionFormFields`와 `emptyConditionFormFields`에 6필드.
   - `jam-web/src/lib/badgeConditionText.ts`: `USER_PHRASE`의 `picked_up_by_user_count` 다음에 여섯 줄. 모두 명사구로 끝나 「… 조건을 채우면 획득할 수 있어요.」와 이어진다(조각은 ` · `로 이어진다, 340줄).

     | 키 | 유저 조건 문구 |
     |---|---|
     | `mission_complete_count` | `완료한 미션 ${n}개 이상` |
     | `collection_complete_count` | `완성한 컬렉션 ${n}개 이상` |
     | `days_since_signup` | `가입 후 ${n}일 이상` |
     | `signup_recent_active_days` | `최근 30일 동안 ${n}일 이상 활동` |
     | `weekly_active_days` | `한 주(월~일)에 ${n}일 이상 활동` |
     | `same_spot_checkin_days` | `같은 지점에 ${n}일 이상 체크인` |

     예: 「가입 후 100일 이상 · 최근 30일 동안 4일 이상 활동 조건을 채우면 획득할 수 있어요.」 「주」에는 (월~일)을 붙인다(`badgeConditionText.ts:22`).
     쓰지 않는 말: 방문, POI·장소·위치, 충족·달성, 아이템북·슬롯, 놓·수집·회수·배치, `SLOP_DICTIONARY.md`의 금칙어. 0632 help의 「놓아」·「놓은」은 0718의 몫이다.
   - `jam-web/src/lib/admin/badge-validation.ts`: 보조 키가 `days_since_signup` 없이 오면 거부한다(오류 문구는 기존 짝 필드 오류 문구 형식). `badge-condition-guards.ts`·`usageBadges.ts`는 고치지 않는다.
3. **공용 페이징 이동** `jam-web/src/lib/badge-engine/jamActionPaging.ts`(새 파일): `jamActionDropMetrics.ts`의 비공개 `PAGE_SIZE`·`MAX_PAGES`·`PageResult`·`selectAllPages`를 옮겨 export한다.
   오류 메시지 접두어(`[jamActionDropMetrics]`)는 `tag` 인자로 받아 유지한다(`jam-action-drop-metrics.test.ts`의 `/30페이지/`·`/DB 장애/` 단언이 그대로 통과). `jamActionDropMetrics.ts`는 import로 바꾼다(동작 불변, 드랍 테스트 수정 없음).
4. **차량 속도 상한 해석 한 곳으로** `jam-web/src/lib/abusing/policy.ts`: 순수 함수 `effectiveVehicleSpeedFilterKmh(policy): number`(유한하고 0보다 크면 그 값, 아니면 `DEFAULT_POLICY.vehicle_speed_filter_kmh`).
   `sync.ts:937-951`은 이 함수를 쓰되 비정상 값 로그와 동작은 그대로다(`sync-vehicle-speed-filter.test.ts` 통과).
5. **계산 모듈 둘** (①의 규약: `(supabase, userId)`, DB 오류는 던진다)
   - `jam-web/src/lib/badge-engine/jamActionCompletionMetrics.ts`(새 파일): `countMissionCompletions`, `countCollectionCompletions`(head count).
   - `jam-web/src/lib/badge-engine/jamActionDayMetrics.ts`(새 파일). 머리 주석에 「활동한 날」 정의(R1·R2·R5), SQL 등가식(1번), `getMondayKey`를 쓰지 않는 이유, 날짜 열 선택 이유, 수동 입력을 가를 수 없다는 한계.
     - 순수 함수: `isCountableActivity(a, vehicleMaxKmh)`(`jamActivityType` 있음 && `passesWalkingGate(a)` && `averageSpeedKmh <= vehicleMaxKmh`, 필드가 숫자가 아니면 false), `kstWeekStartKey(dayKey)`,
       `bestWeekActiveDays(dayKeys)`, `recentActiveDays(dayKeys, todayKey, 30)`, `maxSpotCheckinDays(rows)`, `daysBetweenKstDays(fromDay, toDay)`.
     - 조회: `fetchActivityDayKeys(supabase, userId, signupDay)` = `strava_activities`에서 `select('start_date, normalized')`, `.eq('user_id')`, `.gte('start_date', 가입한 날 KST 0시의 toISOString())`, `.order('id')`로 읽어
       `getAbusingPolicy(supabase)` + `effectiveVehicleSpeedFilterKmh`로 거른 뒤 KST 날짜 집합과 체크인한 날 집합의 합집합을 돌려준다.
       `fetchCheckinRows`(`select('poi_id, triggered_by_activity_date')`, `.eq('user_id')`, `.not('triggered_by_activity_date','is',null)`, `.gte('triggered_by_activity_date', 같은 값)`, `.order('id')`).
       둘 다 공용 `selectAllPages`, 30페이지를 넘으면 오류.
     - 계산 함수: `countDaysSinceSignup(supabase, userId, now = new Date())`, `countRecentActiveDays(supabase, userId, now = new Date())`, `countWeeklyActiveDays`, `countSameSpotCheckinDays`.
       가입 시각은 `getSignupAnchorDate`로 읽고 없으면 던진다. `user_daily_sync_counts`는 읽지 않는다(Q2를 코드 구조로 보장).
6. **판정 틀에 연결** `jamActionBadges.ts`
   - `JAM_ACTION_CONDITION_KEYS`에 주 키 5개. 보조 키는 트리거가 아니므로 넣지 않고, 「보조 키」 상수 `JAM_ACTION_MODIFIER_KEYS = ['signup_recent_active_days']`를 따로 둔다(레지스트리 대응 주석).
   - `JamActionMetric`에서 `'days_since_signup'`도 뺀다(`recipe_first_success`처럼 전용 분기). `METRIC_COMPUTERS`에 4줄(미션·컬렉션·주간 활동일·같은 지점).
   - `evaluateJamActionBadges`에 `days_since_signup` 전용 분기를 더한다: 후보는 `days_since_signup`이 숫자인 배지. 가입 경과일을 한 번 계산하고, 후보 중 보조 키가 숫자인 배지가 있을 때만 최근 활동일을 한 번 계산한다.
     `issueQualifyingBadges`의 `currentValueOf`는 `(b) => (보조 키 없음 || 최근 활동일 >= 보조 키) ? 가입 경과일 : 0`, `triggered_by`는 `jam_action:days_since_signup`. 어느 계산이든 던지면 이 분기 전체를 건너뛴다(fail-closed).
   - **머리 주석 정정**(시작 절차의 확인 항목): 「지표를 더하는 법」 5번을 호출 위치 이름으로 고친다(「동기화는 `sync.ts`의 `evaluateJamActionSafely`가 새 활동이 있을 때 5키, 없을 때 가입 경과일을 판정하고 결산에 합친다」, 라우트에 ③의 장착 `after()` 추가).
     순환 방지 문장을 「`sync.ts`가 이 파일을 import하므로 `@/lib/strava/sync`도, `sync.ts`를 import하는 `jamActionRoute.ts`도 import하지 않는다」로 쓴다. `jamActionRoute.ts` 머리 주석에 장착 라우트와 `evaluateJamActionSafely` 위치를 더한다.
7. **트리거 규칙** `jam-web/src/lib/badge-engine/jamActionProgressTriggers.ts`(새 파일, 순수): `JAM_SYNC_TRIGGERS`(주 키 5개), `JAM_EMPTY_SYNC_TRIGGERS`(`['days_since_signup']`), `jamTriggersForSlot()`(`['collection_complete_count']`).
   `@/lib/strava/sync`를 import하지 않고 `jamActionBadges`는 type만 import한다.
8. **동기화 끝** `jam-web/src/lib/strava/sync.ts`
   - import에 `evaluateJamActionBadges`와 두 트리거 상수. 비공개 도우미 `evaluateJamActionSafely(supabase, userId, triggers): Promise<UsageBadgeEarned[]>`를 `notifyActivityBadgesEarned` 아래에 둔다.
     `try/catch`로 던지면 `console.error` 후 `[]`. **주입된 `supabase`를 그대로 넘긴다**(기존 테스트가 `createServiceClient`를 던지게 해 두었다).
   - 새 활동이 있는 동기화: `recordDailySyncAndEvaluate` try/catch(1082-1088줄) 바로 뒤, `notifyActivityBadgesEarned`(1094-1099줄) 앞에서 `jamEarned = await evaluateJamActionSafely(supabase, userId, JAM_SYNC_TRIGGERS)`,
     `earnedBadgeIds.push(...jamEarned.map((b) => b.id))`, 결산 알림 목록에 `...jamEarned.map((b) => b.id)`를 더한다(결산은 한 행). 반환의 `badges` 수에는 넣지 않는다(사용량 배지와 같다).
   - 새 활동이 없는 동기화(이른 반환, 661-669줄): `evaluateBadges` 뒤에 `evaluateJamActionSafely(…, JAM_EMPTY_SYNC_TRIGGERS)`를 불러 `earnedBadgeIds`와 알림 목록에 합친다(R4).
   - 1039·1058줄에서 따로 부르지 않는 이유: 활동 기록(`recordProcessedActivities`, 1066줄)이 뒤에 일어나 주간 활동일이 이번 배치를 못 보고, 호출이 세 번이면 배지 읽기도 세 번이다. 미션 완료·컬렉션 보정은 끝 시점에 이미 DB에 있다.
     체크인 루프(824-855줄) 안에서도 부르지 않는다. 주석(643줄 「획득 순서」, 1090-1093줄 결산 설명)에 JAM! 행동 지표 합류를 한 줄 더한다.
9. **컬렉션 장착 뒤** `jam-web/src/app/api/itembooks/[id]/slot/route.ts`: import에 `after`, `runJamActionEvaluation`(`@/lib/badge-engine/jamActionRoute`), `jamTriggersForSlot`.
   POST 성공 분기 끝 `return NextResponse.json({ slot: result.slot }, { status: 201 })` 바로 앞에 `after(() => runJamActionEvaluation(user.id, jamTriggersForSlot()))`(`drops/route.ts`와 같은 형태, R6).
   DELETE·PATCH에는 넣지 않는다. 응답·상태·문구는 그대로다.
10. **테스트** (vitest. 새 테이블 모킹은 `eq`·`not`·`gte`·`order`·`range`와 head count를 지원하는 빌더를 새 테스트에 따로 둔다. ①·②의 테스트는 고치지 않는다)
    - 새 `jam-web/src/lib/badge-engine/__tests__/jam-action-completion-metrics.test.ts`: 내 행만 센다, 0건이면 0, 쿼리 고정(테이블·`user_id`·head count), 조회 오류는 던진다.
    - 새 `jam-action-day-metrics.test.ts`
      - 월요일 키: 월~일이 같은 키, 연말·연초(2026-12-28 월 ~ 2027-01-03 일).
      - **KST 경계**: 일요일 23:00 KST(14:00Z)는 지난 주, 월요일 00:00 KST(일요일 15:00Z)는 새 주. 일요일 23:00·월요일 00:00·화·수 12:00 KST → 최고 주 3(UTC로 묶으면 2).
      - **시간대 독립**: `process.env.TZ`를 UTC·Asia/Seoul·America/Los_Angeles로 바꿔도 같은 값(`afterEach` 복원).
      - 월·수·금 활동 → 3, 같은 날 여러 활동 → 1, 두 주 중 높은 주, 활동 없는 날의 체크인 → 센다, 활동과 체크인이 같은 날 → 1.
      - **R1**: 가입한 날 이전 활동·체크인은 세지 않는다(가입한 날 당일은 센다).
      - **R2**: 종목 없는 활동(0km·13분) 제외, 9분 걷기·0.4km 걷기·평균 시속 9km 걷기 제외, 평균 시속 61km 러닝 제외(정책 60), 정책 값이 0·NaN이면 60으로 판정, `normalized` 없음 제외. 체크인한 날에는 필터를 적용하지 않는다.
      - **R5**: `triggered_by_activity_date`가 없는 체크인은 세지 않고, 사흘 뒤에 동기화한 체크인(`earned_at`이 사흘 뒤)도 활동 날짜로 센다.
      - **최근 30일**: 오늘(KST) 포함, 29일 전은 포함·30일 전은 제외. KST 자정 경계.
      - 같은 지점: 같은 날 여러 번 → 1, 지점별로 세서 최댓값(합 아님), 23:30 KST와 00:30 KST는 다른 날.
      - 가입 경과일: 가입한 날 0, 가입 23:00 KST와 다음 날 00:30 KST는 1, 가입 시각을 못 읽으면 던진다.
      - 조회: 읽는 열·필터 고정, 다른 유저 행 분리, 2,500행 3페이지, 31페이지 오류, 조회 오류는 던진다, `user_daily_sync_counts`를 읽지 않는다.
    - 새 `jam-action-progress-badges.test.ts`(`evaluateJamActionBadges` 끝까지)
      - 5지표 각각 임계 발급/미발급, `triggered_by` `jam_action:<키>`.
      - **월·수·금 활동 + 일요일 동기화 → 활동일 3**: `strava_activities`에 월·수·금 3행, `user_daily_sync_counts`에 일요일 행. 임계 3 발급, 4 미발급.
      - **같은 날 같은 지점 여러 번 → 1**: 임계 1 발급, 2 미발급.
      - **R3 보조 키**: 가입 100일·보조 4인 배지는 최근 활동일 3이면 미발급, 4면 발급. 보조 키 없는 배지는 가입 일수만 본다. 보조 키 있는 후보가 없으면 최근 활동일을 계산하지 않는다. 최근 활동일 계산이 던지면 가입 경과일 분기 전체를 건너뛴다.
      - 요청한 지표만 조회, 후보 없으면 조회 0회, 한 지표의 오류는 그 지표만 건너뜀, 레벨형(가입 30·100)과 등급형.
    - 새 `jam-action-progress-triggers.test.ts`: 세 규칙, `jamActionBadges.ts` 소스에 `@/lib/strava/sync`와 `./jamActionRoute` import가 없다(소스 텍스트 검사).
    - 새 `jam-web/src/lib/strava/__tests__/sync-jam-action-hook.test.ts`(`sync-usage-badge-hook.test.ts` 모양): 새 활동 ≥1이면 1회·인자(userId, 주 키 5개, 주입된 supabase), **호출 순서**(활동 upsert → `recordDailySyncAndEvaluate` → JAM! 판정 → 결산),
      획득 id 합류(결산은 활동·사용량·JAM! id를 한 번에, `badges` 수에는 없음), 판정이 던져도 동기화 정상 완료, 체크인 여러 건이어도 1회, 새 활동 0건이면 `['days_since_signup']`만.
    - 새 `jam-web/src/app/api/itembooks/[id]/slot/__tests__/route.test.ts`(`drops/__tests__/route.test.ts` 모양): POST 성공 → `after` 1회·콜백 `runJamActionEvaluation(user.id, ['collection_complete_count'])`·응답 201 `{ slot }` 그대로,
      401·400·RPC 오류·`ok:false` 매핑 → 미예약, 판정 거부에도 응답 그대로, DELETE·PATCH 미예약.
    - 새(또는 기존에 추가) `effectiveVehicleSpeedFilterKmh` 테스트: 정상값·0·음수·NaN.
    - 수정: `condition-registry.test.ts`(키 66 → 72, `external` 목록과 measurable 제외 배열에 6키, 새 문구에 금지어 없음, `USAGE_METRIC_CONDITION_KEYS`에 보조 키 없음),
      `conditionFormFields.test.ts`(6키 왕복), `jam-web/src/lib/admin/__tests__/badge-validation.test.ts`(주 키 5개 단독 통과·`repeat_count`와 함께면 거부, `days_since_signup` + 보조 키 통과, 보조 키 단독 거부, `days_since_signup` + 보조 키 + 다른 사용량 지표 거부),
      `badgeConditionText.test.ts`(6문구, 조합 문장 예시, 금지어). 동기화 테스트 9개(`processFetchedActivities`를 직접 부르는 파일)에 `vi.mock('@/lib/badge-engine/jamActionBadges', …)` 한 줄씩.
11. **문서**(현재 상태 덮어쓰기)
    - `docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md`: 머리말과 ③ JAM! 서두에 6키, 드랍·픽업 절 뒤에 새 절(키 표, 「활동한 날」 정의와 R1·R2·R5, 보조 키 R3, KST 주 계산과 `getMondayKey`를 쓰지 않는 이유,
      호출 지점 표(동기화 끝·빈 동기화·장착 `after()`), 체크인과 미션 완료가 동기화 안에서만 일어난다는 사실, 순환 방지, 알려진 한계(수동 입력)), 동기화 경로 문단, 트리거·조건·평가·원천 표(「행동 8종」 → 「13종」),
      0634가 `JAM_ACTION_CONDITION_KEYS` 전체를 넘기면 된다는 한 줄. 머리말의 「마이그레이션 199~202 실행 전」 표기를 실행됨으로 정정한다.
    - `docs/specs/badge-engine/CONDITION_JSON_SPEC.md`: §3 표 6행, 드랍·픽업 단락 뒤 단락(보조 키 짝 규칙 포함), §4 「사용량 지표 14종」 → 「19종」(보조 키는 사용량 지표가 아님을 명시).
    - `docs/specs/prd/02_DATA_MODEL.md`: `users`·`strava_activities`·`user_checkin_badge_earns`·`user_item_book_completions`·`user_mission_completions` 절에 「JAM! 행동 지표의 원천」 한 줄씩.

### 커밋 단계
게이트가 단계별로 볼 수 있게 ① 선언·마이그레이션 ② 계산(페이징 이동·정책 함수 포함) ③ 판정 틀·연결(동기화·장착) ④ 문서로 나눠 커밋한다.

### 관련 티켓과의 경계
- **0635**(장착으로 완성하면 보상 배지 미지급): 겹치는 곳은 `slot/route.ts` POST 성공 분기 하나다. 0633은 보상 배지 발급, 장착 RPC, `itembook/checker.ts`의 완성 처리, 완성 알림을 고치지 않는다. 나중에 머지하는 쪽이 한 줄 충돌만 푼다.
  0635가 RPC 반환에 완성 여부를 더하면 R6의 무조건 판정을 그때 좁힌다.
- **0716**(요청마다 배지 전체 읽기): `evaluateJamActionBadges`의 배지 조회는 고치지 않고 호출처만 는다(장착 POST 1회, 동기화 1회, 빈 동기화 1회). 머지 뒤 0716에 증가분을 메모한다.
- **0634**(재평가 배치): 0633이 선행 조건이다. 소급 발급 규모는 ④의 dry-run이 본다.
- **0718**: 0632 help의 「놓」 문구는 0718이 고친다.

### 규모 (③)
마이그레이션 1개(약 170줄), 새 소스 5개(약 560줄), 수정 소스 11개(약 380줄, 이동분 포함), 새 테스트 7개(약 1,650줄), 수정 테스트 13개(약 230줄), 문서 3개(약 140줄). **합계 약 40개 파일, 약 3,100줄.**
`database.generated.ts`는 바뀌지 않는다(새 테이블·함수 없음). 0632(24파일, 약 1,900줄)보다 크지만 키 목록·마이그레이션·폼·문서를 함께 쓰므로 쪼개지 않는다(쪼개면 CHECK 마이그레이션과 문서 갱신이 두 번 생긴다).

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- 마이그레이션 203에 `-- 되돌림 SQL` 블록이 있다(`deploy-gate check` 통과). CHECK를 72키로 넓히고 기존 행을 바꾸지 않는다.
- 5개 지표 각각을 조건으로 한 배지가 조건을 채우면 발급된다(테스트).
- **월·수·금에 활동하고 일요일에 한 번 동기화한 유저의 그 주 활동일이 3이다.** 동기화만 한 날은 세지 않고, 활동 없이 체크인만 한 날은 센다(테스트).
- **같은 날 같은 지점을 여러 번 찾아도 체크인 일수는 1이다.** 지점마다 따로 세서 최댓값을 쓴다(테스트).
- 주 경계가 KST다. 일요일 23시(KST)는 지난 주, 월요일 0시(KST)는 새 주이고, 서버 시간대를 바꿔도 같은 값이다(테스트).
- R1: 가입한 날(KST) 이전의 활동·체크인은 주간 활동일·같은 지점 체크인 일수·최근 활동일에 세지 않는다(테스트).
- R2: JAM! 종목이 없는 활동, 걷기 축1 게이트 탈락 활동, 차량 속도 상한을 넘는 활동은 활동한 날에 세지 않는다. 정책 값이 비정상이면 기본값 60으로 판정한다(테스트).
- R3: 보조 키가 있는 가입 경과일 배지는 최근 30일 활동일이 기준에 못 미치면 발급되지 않고, 채우면 발급된다. 보조 키 단독 저장은 거부되고, 주 키와 함께면 사용량 지표 단일 가드에 걸리지 않는다(테스트).
- R5: 체크인한 날은 활동 날짜로 세고, 활동 날짜가 없는 체크인은 세지 않는다(테스트).
- 미션·컬렉션은 서로 다른 개수다. 가입 경과일은 KST 날짜 차다(테스트).
- 읽는 행이 30페이지를 넘거나 조회가 실패하면 그 지표만 건너뛴다(fail-closed, 테스트).
- 동기화 끝에서 주 키 5개를 한 번에 판정하고 획득 id를 기존 결산에 합친다. 활동 기록 저장 뒤에 호출한다. 판정이 던져도 동기화는 정상 완료된다. 새 활동이 없는 동기화는 가입 경과일만 판정한다(R4, 테스트).
- 컬렉션 장착 POST 성공 뒤에만 `after()`로 판정하고 실패·해제·교체에서는 예약하지 않는다. 응답·상태·문구는 변경 전과 같다(테스트).
- 레지스트리가 72키를 선언하고 최신 CHECK 마이그레이션의 키 집합과 같다(자동 탐지 테스트). 주 키 5개는 단독 저장되고 `repeat_count`나 다른 사용량 지표와 함께면 거부된다. 어드민 폼 왕복(테스트).
- 차량 속도 상한 해석이 한 함수로 모였고 동기화의 기존 동작·로그가 같다(기존 테스트 통과).
- 유저 조건 문구는 고정 용어만 쓰고 금지어(방문·POI·충족·달성 등)가 없다(UX Writing 검증 기록).
- `jamActionBadges.ts`·`jamActionRoute.ts` 머리 주석이 연결된 사실과 맞고, `jamActionBadges.ts`가 `@/lib/strava/sync`·`./jamActionRoute`를 import하지 않는다(테스트).
- 기존 JAM! 지표·믹스·드랍·픽업 경로와 기존 동기화 테스트가 전부 통과한다.
- 문서 3종(`BADGE_ENGINE_UNIFIED.md`, `CONDITION_JSON_SPEC.md`, `02_DATA_MODEL.md`)을 갱신한다.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)
- 사용자 승인을 받아 203을 실행한다(코드 배포보다 먼저). 실행 뒤 DO 블록 롤백 스모크로 새 키 INSERT가 CHECK를 통과하는지 본다. `database.generated.ts`는 바뀌지 않는다.
- 1번 기준값 SQL을 다시 뽑아 티켓에 남기고 코드 계산과 대조한다(가입 전 기록이 많은 유저, 종목 없는 활동이 많은 유저 `cbecda65…`를 특히 본다).
- 0716에 호출처 증가분을 메모하고, 0635 머지 뒤 `slot/route.ts`의 무조건 판정을 좁힐지 본다.
- 새 배지를 열기 전에 받을 유저 수와 포인트 합계를 ④(0634)의 dry-run으로 본다(Q1).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

- 착수(2026-10-01): 혜린이 파일 단위 계획 초안과 결정 질문 7개를 냈고, 카리나가 라이브 DB로 대조해 사용자에게 물었다. 사용자 결정은 「구현 계획」의 R1~R6이다.
  - 혜린 추천과 다르게 정해진 것: R2(혜린은 활동 기록이 있으면 모두 세자고 추천, 사용자는 걷기 게이트·차량 속도 필터 적용과 JAM! 종목만 세기를 골랐다),
    R3(혜린 질문은 빈 동기화에서 판정할지였고, 사용자는 가입 경과일 배지에 「최근 30일 중 n일 이상 활동」 보조 조건을 더하기로 했다).
  - 카리나가 혜린 초안에서 바꾼 것: 체크인 날짜가 없는 행을 `earned_at`으로 대신 세던 안을 「세지 않는다」로 바꿨다(R5). 라이브의 그 7행은 모두 시험 계정이고 활동과 연결되지 않았다.
  - 선택하지 않은 안: 티켓을 ③-a(미션·컬렉션·가입 경과일)와 ③-b(활동일·체크인 일수)로 쪼개는 안. CHECK 마이그레이션과 문서 갱신이 두 번 생기고, 「활동한 날」 정의를 두 티켓이 함께 쓴다.
    보조 키를 `days_since_signup`의 객체 값(`{ days, recent_active_days }`)으로 담는 안. 레지스트리의 정수 입력·폼·문구 조립을 모두 새 형태로 바꿔야 해서 기존 `pairedWith` 짝 필드 방식을 골랐다.

### 잔여 이슈
-
