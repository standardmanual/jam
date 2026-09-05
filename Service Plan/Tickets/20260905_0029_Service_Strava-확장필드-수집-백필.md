---
id: 20260905_0029
category: Service
status: OPEN
created: 2026-09-05
---

# [Service] Strava 확장 필드 수집 · 기존 활동 백필

> 마스터: `20260905_0026`. 선행: `20260905_0028`(조건 필드).

## 배경 / 문제 정의

**심박·파워·케이던스·최고속도·최고도달고도는 이미 Strava 응답에 오고 타입에도 선언돼 있는데
`normalizeActivity`가 읽지 않아 버려지고 있다.**

현재 `normalized` jsonb에 저장하는 건 10개 필드뿐이다(`src/types/strava.ts:192-205`) —
`stravaId · name · distanceKm · movingTimeSec · elevationGainM · jamActivityType ·
startDate · startDateLocal · averageSpeedKmh · startLatLng · endLatLng · weatherTempC`.

반면 `StravaSummaryActivity`(`src/types/strava.ts:53-109`)에는 아래가 **이미 선언돼 있다**.

| Strava 필드 | 줄 | v5 대응 |
|---|---|---|
| `max_speed` (m/s) | 86 | `max_speed_kmh` |
| `elev_high` / `elev_low` | 98-99 | `max_elevation_m` |
| `average_heartrate` / `max_heartrate` | 94-95 | `avg_heartrate_bpm` |
| `average_watts` / `weighted_average_watts` | 88-90 | `avg_watts` |
| `average_cadence` | 87 | `avg_cadence` |
| `elapsed_time` | 59 | 휴식 시간 계산 |

**정규화 지점이 `src/lib/strava/sync.ts:214-233` 한 곳뿐이라 확장 포인트가 명확하다.**

### 별도 문제 — `splits_metric`
`negative_split` 조건에 필요한데 Summary 응답에 없다.
`src/lib/strava/api.ts:75-91` `getActivityById()`가 Detailed 엔드포인트를 호출하지만
**반환 타입이 `StravaSummaryActivity`로 잘못 좁혀져 있어** splits가 타입에 없다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `NormalizedActivity` 확장 — 위 6개 필드
- `normalizeActivity()`(`sync.ts:214-233`)에서 읽어 저장. 단위 변환: `max_speed` m/s → km/h
- **없는 값은 저장하지 않는다** — 심박계 없는 유저의 활동에 `null`을 넣지 말고 키 자체를 생략.
  조건 평가가 «데이터 없음 = 카운트 안 함»으로 자연히 동작하도록
- `StravaDetailedActivity` 타입 신설 + `getActivityById` 반환 타입 교체
- splits 수집은 **활동당 1회 추가 호출**이라 rate limit 상한 필요.
  선례: `MAX_POI_MATCH_ACTIVITIES_PER_SYNC = 10`(`sync.ts:43`)

### 백필
기존 `strava_activities` **872행**에는 확장 필드가 없다.
- Strava에서 활동을 다시 가져와 `normalized`를 갱신하는 백필 경로 필요
- ⚠️ `getProcessedStravaIds`(`sync.ts:236`)가 이미 처리한 활동을 전부 걸러내므로
  **일반 싱크로는 백필되지 않는다**. 전용 스크립트 또는 어드민 액션이 필요
- `processed_via: 'manual_backfill'` 타입은 이미 있으나 **구현 코드가 없다**

## 구현 계획
1. `NormalizedActivity` 확장 + `normalizeActivity()` 수정 — **함수 하나**로 신규 수집 시작
2. 시뮬레이터(`admin/simulate`)도 같은 필드를 받도록 확장 — 안 하면 신규 조건 배지를 **검증할 수 없다**
3. `StravaDetailedActivity` + splits 수집(상한 적용)
4. 백필 스크립트 — 872행 대상, rate limit 고려한 배치

## 판단 (2026-09-05 확정)

### ① splits는 v5 1차에서 뺀다 — 타입 버그만 고친다

**결정**: `StravaDetailedActivity` 타입을 신설하고 `getActivityById`의 잘못 좁혀진 반환 타입을
교체하는 것까지만 한다. **`splits_metric`을 실제로 수집·저장하지는 않는다.**
`negative_split`은 `evaluation: 'pending'`으로 남아 fail-closed가 계속 막는다(무해).

**근거** — 티켓이 두 가지를 섞어 놓았는데, 실측해 보니 비용이 전혀 다르다:

| 대상 | 출처 | 백필 비용 |
|---|---|---|
| 확장 6필드(심박·파워·케이던스·최고속도·최고도달고도·경과시간) | **Summary 응답** — 목록 엔드포인트가 이미 준다 | 유저당 5회 남짓, 총 50회 안팎 |
| `splits_metric` | **Detailed 응답** — 활동 1건당 1회 | **697회**(러닝만) |

즉 6필드 수집은 거의 공짜고, splits만 별개의 호출 경로·레이트리밋 관리·백필 배치를 요구한다.
`negative_split`은 164계열 중 **1계열**이다.

**미채택: 러닝만 상한을 두고 포함** — 상한을 두면 배지가 비결정적이 된다. 오래만에 동기화한
유저의 활동이 상한을 넘으면 후반 구간 페이스를 잘 지켰는데도 배지가 **조용히 안 나온다**.
일상 싱크(하루 0~3건)에서는 상한이 거의 걸리지 않지만, 걸리는 순간의 실패 양상이
이번 v5가 계속 없애 온 «에러 없이 조용히 틀리는» 종류다.

→ splits 수집은 별도 티켓. **티켓 0035는 `negative_split` 계열을 시딩하지 않는다.**

### ② 기존 873행 백필은 지금 실행한다

**결정**: Summary 6필드 백필을 이번 티켓에서 만들고 **실제로 돌린다**.

**근거**: 티켓 0039가 유저를 전원 삭제하면 이 데이터는 사라지지만, 그전까지 **0030(발급 엔진)과
0035(카탈로그)를 검증할 실데이터가 필요하다** — 심박·파워 조건 배지를 데이터 없이 검증할 수 없다.
백필 경로(`processed_via: 'manual_backfill'`) 자체는 0039 이후에도 계속 쓰인다.

실측 기준선(2026-09-05): `strava_activities` **873행** · 러닝 697행(80%) · 유저 10명 ·
`avgHeartrateBpm`·`maxSpeedKmh` 저장분 **0건** · 활동 기간 2023-09-12 ~ 2026-09-04.

## 잔여 이슈
- splits 수집(→ `negative_split` 평가)은 별도 티켓으로 분리했다. 착수 시 러닝 한정 여부와
  상한 비결정성 문제를 함께 다뤄야 한다

---

## 구현 기록 (2026-09-05)

### 1. `NormalizedActivity` 확장 6필드 + `normalizeActivity()` 수정

`src/types/strava.ts`에 6필드를 **전부 옵셔널**로 추가했다 —
`elapsedTimeSec` · `maxSpeedKmh` · `maxElevationM` · `avgHeartrateBpm` · `avgWatts` · `avgCadence`.

| 정규화 필드 | Strava 필드 | 변환 |
|---|---|---|
| `elapsedTimeSec` | `elapsed_time` | 없음(초) |
| `maxSpeedKmh` | `max_speed` | **m/s → km/h** (`metersPerSecToKmH`, 평균 속도와 같은 반올림) |
| `maxElevationM` | `elev_high` | 없음(m) — 누적 상승량 `total_elevation_gain`과 다른 값 |
| `avgHeartrateBpm` | `average_heartrate` | 없음 |
| `avgWatts` | `average_watts` | 없음 |
| `avgCadence` | `average_cadence` | 없음 |

**«없는 값은 키 자체를 생략»을 함수로 강제했다.** `extractExtendedActivityFields()`
(`src/types/strava.ts`)가 유한한 숫자일 때만 키를 만든다. `0`은 버리지 않는다 — 「해수면
고도 0m」과 「필드 없음」은 다른 사실이라 조건 평가가 둘을 구분할 수 있어야 한다.

이 함수를 **싱크와 백필이 공유**한다. 두 경로가 갈라지면 백필된 활동과 신규 활동의 형태가
달라지고, 그 차이는 조건 평가에서 조용한 오판정이 된다.

`normalizeActivity`는 테스트가 직접 봐야 해서 `export`로 바꿨다(그 외 시그니처 무변경).

### 2. 조건 키 ↔ 정규화 필드 대응 — `activityField` (레지스트리)

조건 키는 snake_case(`avg_heartrate_bpm`), 정규화 필드는 camelCase(`avgHeartrateBpm`)인데
**규칙적으로 대응하지 않는다** — `single_distance_km` → `distanceKm`,
`single_elevation_m` → `elevationGainM`처럼 이름이 아예 어긋나는 쌍이 있다. 0030이 이 대응을
손으로 다시 적으면 오타가 조용히 «조건 통과»로 흘러간다(`matchesPerActivityCondition()`이
아는 키만 검사하고 마지막에 `return true`).

→ `ConditionFieldMeta`에 `activityField`를 추가하고 v5 스칼라 7종에 선언했다. 파생물
`CONDITION_ACTIVITY_FIELD`(조건키 → 정규화 필드 맵)를 0030이 그대로 쓰면 된다.

**단위 변환·누적 집계가 필요한 필드에는 달지 않았다** — `duration_minutes`(분 vs 초) ·
`max_pace_sec_per_km`(페이스 vs 속도) · `distance_km`/`elevation_gain_m`(기본이 누적 합계) ·
`min_speed_kmh`. 담으면 「이름을 그대로 읽어 비교하면 된다」는 선언의 뜻이 깨진다.
테스트가 이 경계를 양방향으로 고정한다.

### 3. 시뮬레이터 확장 (`api/admin/simulate` + `admin/simulator`)

- 라우트가 확장 6필드를 받는다. `readExtendedFields()`가 **싱크와 같은 규칙**을 지킨다 —
  빈 값이면 키를 만들지 않는다. 어드민 폼이라 문자열로 올 수 있어 숫자 변환도 흡수한다
- 응답 `parsed.extended`에 **실제로 평가에 실린 값만** 되돌려준다. 입력이 무시됐는지
  화면에서 바로 보인다
- 화면에 「확장 필드」 입력 6칸(전부 비어 있음이 기본)과 결과 패널의 확인 블록을 추가했다.
  안내 문구: 「비워 두면 «데이터 없음»으로 처리돼요. 심박계가 없는 활동을 그대로 재현할 수 있어요.」

### 4. `StravaDetailedActivity` 신설 + `getActivityById` 반환 타입 교체

`getActivityById`가 상세 엔드포인트를 호출하면서도 반환 타입이 `StravaSummaryActivity`로
잘못 좁혀져 있었다. `StravaDetailedActivity`(+ `StravaSplit`)를 신설해 교체했다.

**`splits_metric`은 타입에 선언만 하고 수집하지 않는다** — 확정 사항 ①. 활동당 상세 호출
경로도 만들지 않았다. `negative_split`은 `evaluation: 'pending'` 그대로다.
유일한 호출처(`api/badges/[id]/share-data`)는 Summary 필드만 읽으므로 영향 없다.

### 5. 백필 경로 (873행 대상) — **작성만, 미실행**

- `src/lib/strava/backfill.ts` — 순수 병합 함수 `mergeExtendedFields()` + 유저별/전체 실행기
- `scripts/backfill-strava-extended-fields.ts` — CLI 러너. **기본이 미리보기**이고 `--apply`가
  있어야 쓴다

지킨 제약:

| 제약 | 방법 |
|---|---|
| 목록 엔드포인트만 쓴다 | `getActivities(token, undefined, page)` — `page` 파라미터를 추가해 전체 이력을 페이지로 훑는다. 활동당 상세 호출 없음. 유저당 `ceil(활동수/200)`회 |
| 배지·드랍·미션·소식·피드를 트리거하지 않는다 | 그 모듈들을 **import조차 하지 않는다.** 테스트가 소스를 스캔해 금지 의존을 고정한다 |
| `last_synced_at`을 건드리지 않는다 | 싱크의 토큰 갱신 구간을 공유하지 않고 백필 전용 `resolveAccessToken()`을 따로 뒀다(잠금 선점·「Strava 끊김」 소식이 백필에 있어선 안 된다). 테스트가 소스에 `last_synced_at`이 없음을 고정한다 |
| `normalized`의 확장 필드만 갱신한다 | `mergeExtendedFields`가 확장 6키 외에는 읽지도 쓰지도 않는다. Strava가 안 주는 값은 기존 값을 **지우지도 않는다** |
| rate limit | 요청 총량 예산(기본 90 — Strava 15분당 100회 아래) + 요청 간격(기본 1.5초). 예산이 바닥나면 깨끗이 멈추고 보고한다. **멱등이라 그대로 다시 돌리면 이어진다** |

갱신한 행은 `processed_via = 'manual_backfill'`로 표시한다(타입에만 있고 구현이 없던 값).

**실행 방법**
```
cd jam-web
npx tsx scripts/backfill-strava-extended-fields.ts            # 미리보기 — DB에 쓰지 않는다
npx tsx scripts/backfill-strava-extended-fields.ts --apply    # 실제 반영
```
옵션: `--user <uuid>`(반복 가능) · `--budget <n>` · `--delay <ms>`.
필요 환경변수: `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `ENCRYPTION_KEY` ·
`STRAVA_CLIENT_ID` · `STRAVA_CLIENT_SECRET` (`.env.local`에서 읽는다).

> ⚠️ 미리보기 모드에서도 **만료된 access_token은 갱신·저장된다.** Strava를 호출하려면 유효한
> 토큰이 필요하고, Strava가 refresh_token을 회전시키므로 저장하지 않으면 그 유저의 연동이
> 다음 싱크에서 끊긴다. `strava_activities`는 `--apply` 없이는 쓰지 않는다.

### 6. 회귀 테스트

- `src/lib/strava/__tests__/normalize-activity.test.ts` (**16건 신규**) — 티켓의 완료 조건 4가지를
  그대로 고정한다. ① 값이 있으면 저장 ② 값이 없으면 **키 자체가 없다**(`'key' in obj`로 확인 —
  `toBeUndefined()`는 「키는 있고 값이 undefined」도 통과한다) + JSON 직렬화(= jsonb 저장 형태)
  에서도 키가 없다 ③ 단위 변환 ④ 기존 12필드 값·키 집합 무변경
- `src/lib/strava/__tests__/backfill-extended-fields.test.ts` (**12건 신규**) — 병합 규칙 +
  「배지 홍수를 일으킬 경로가 없다」 소스 스캔(금지 import · `last_synced_at` 부재 ·
  `getActivityById` 부재 · 쓰기 대상 컬럼 2개)
- `condition-registry.test.ts`에 **6건 추가** — `activityField` 대응이 실제 필드명과 일치하는지,
  선언한 이름으로 값이 실제로 잡히는지, 단위 변환 필드에는 달리지 않았는지

### 검증
- `npx tsc --noEmit` 0건
- `npm run lint` **에러 0 · 경고 13** (전부 기존 design-system 경고 — 티켓 0027·0028과 동일)
- vitest **666 통과 / 45파일** (기존 632 + 신규 34). `walking-badges-v4.test.ts` 31건 포함 무회귀
- `npm run test:node` 13건 통과

### 이번 티켓에서 하지 않은 것
- `splits_metric` 수집 · `negative_split` 평가 (별도 티켓 — 확정 사항 ①)
- v5 신규 20종의 **평가 로직** (티켓 20260905_0030). 수집만 했고 `evaluation`은 전부 `pending` 그대로다
- 백필 **실행** (사용자 승인 후 오케스트레이터가 처리)
- 어드민 조건 빌더의 신규 필드 입력 UI (티켓 20260905_0032)

### DB 변경
**없다.** `normalized`가 jsonb라 스키마 변경이 필요 없고, `processed_via`도 CHECK 없는 TEXT라
`'manual_backfill'`을 그대로 쓸 수 있다. 마이그레이션 파일을 만들지 않았다(132는 미사용).

## 리뷰 반영 (커밋 `9dd6a560`)

백필 실행 직전이 「지금 안 하면 873행을 다시 훑어야 하는」 것들의 마지막으로 싼 시점이라,
그 부류만 골라 먼저 처리했다.

**① 같은 Summary 응답의 3필드를 함께 담는다 — 확장 6필드 → 9필드.**
`max_heartrate` · `weighted_average_watts` · `device_watts`. 추가 API 호출이 0회라 지금 담는
비용이 없는데, 나중에 필요해지면 873행 재백필이 필요하다. 특히 **`device_watts`가 중요하다** —
Strava는 파워미터가 없는 활동에도 `average_watts`를 **추정값으로 채워 준다.** 이 구분자가
없으면 「실측 파워만 인정」 정책을 아예 세울 수 없다. `false`도 값이므로 키를 만든다.

**② `processed_via`를 덮어쓰지 않는다.** 그 값은 «이 행이 어떤 경로로 들어왔는가»
(`sync` / `reconcile`)이지 «나중에 무엇으로 채워졌는가»가 아니다. 백필은 행을 만든 게 아니라
채운 것이다. 실측 결과 `reconcile` **16행**이 그 유입 이력을 들고 있어 덮어쓰면 되돌릴 수 없다.
대신 `normalized.extendedBackfilledAt` 마커를 남긴다. 쓰기 컬럼이 `normalized` 하나로 줄어든
것을 회귀 테스트로 고정했다.

**③ 문서-코드 불일치 정정** — `BADGE_ENGINE_UNIFIED.md`가 「Strava `manual=true` 활동은
`getActivities()` 반환 단계에서 완전히 걸러낸다」고 단정하는데, 그 필터는 정상 활동 누락
버그로 커밋 `86380c55`에서 되돌려졌고 `src/lib/strava/{api,sync}.ts`에 `manual` 참조가
**0건**이다. `Specs/`는 «지금 사실»만 담아야 하므로 현행 동작으로 고쳤다 — **v5 카탈로그
(티켓 0035)가 이 문장을 어뷰징 전제로 삼으면 그대로 어긋난다.**

덤으로 티켓 0028의 `boolean` → enum 전환 때 남은 낡은 주석 2곳을 고쳤다.

## ⛔ 백필 실행 — 막힘 (2026-09-05)

**결정은 「지금 실행」이었으나 이 머신에서 돌릴 수 없다.**

`strava_connections.access_token`·`refresh_token`이 `ENCRYPTION_KEY`로 암호화돼 있는데
(`src/lib/utils.ts:77`), 그 키가 **로컬 `jam-web/.env.local`에 없다.** Vercel에는 있지만
**Secret 타입이라 `vercel env pull`로 내려받을 수 없다** — 실제로 시도했고
「21 Secret values cannot be pulled」와 함께 `[SENSITIVE]` 플레이스홀더만 받았다
(받은 파일은 즉시 삭제했다).

해소 경로는 둘이다:

| 경로 | 내용 |
|---|---|
| A | 사용자가 `jam-web/.env.local`에 `ENCRYPTION_KEY`를 추가한다. 그러면 스크립트를 그대로 돌릴 수 있다. 아이클라우드 `JAM-secrets`에 두는 기존 구조와도 맞는다 |
| B | 어드민 API 라우트로 만들어 Vercel에서 돌린다. 서버에는 키가 있다. 다만 어드민은 staging에서 검증할 수 없어 프로덕션 배포 후에야 확인 가능하다 |

**실행 전까지 티켓 0030·0035는 「확장 필드 실데이터가 있다」를 전제할 수 없다.**
그래서 이 티켓은 코드가 머지된 뒤에도 `status: OPEN`으로 둔다.

### 실행하면 곧바로 재야 할 것 (0039가 유저를 지우면 사라지는 근거다)

```sql
-- 종목별 커버리지 + 분포. 0035 임계값 설계의 유일한 실측 근거다.
SELECT normalized->>'jamActivityType' AS sport, count(*) AS n,
       count(*) FILTER (WHERE normalized ? 'avgHeartrateBpm') AS hr,
       count(*) FILTER (WHERE normalized ? 'avgWatts')        AS watts,
       count(*) FILTER (WHERE normalized ? 'avgCadence')      AS cadence,
       count(*) FILTER (WHERE (normalized->>'deviceWatts')::boolean IS TRUE) AS watts_measured,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (normalized->>'avgCadence')::numeric)  AS cadence_p50,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY (normalized->>'avgHeartrateBpm')::numeric) AS hr_p90,
       max((normalized->>'maxSpeedKmh')::numeric) AS max_speed_max
  FROM public.strava_activities GROUP BY 1 ORDER BY 2 DESC;
```

이 한 번의 쿼리가 아래 미결 3건을 동시에 판정한다:
- **`avgCadence` 러닝 원값 단위** — 90대면 한쪽 발 기준, 180대면 spm. 컨텐츠에 이미
  「180 황금 케이던스」 계열이 있어 잘못 잡으면 **영원히 안 나오는 배지**가 된다
- **심박·파워 조건 배지가 유저 몇 %에게 열리는가**
- **`maxSpeedKmh`에 차량 구간·GPS 스파이크가 남는가**
