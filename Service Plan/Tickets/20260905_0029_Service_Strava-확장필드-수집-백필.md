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
