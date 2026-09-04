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

## 잔여 이슈
- splits를 v5 1차에 넣을지 판단 필요. `negative_split`은 러닝 1계열뿐이라
  rate limit 부담 대비 가치를 저울질할 수 있다
