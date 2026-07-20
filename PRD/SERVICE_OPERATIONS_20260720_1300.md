# JAM! 서비스 운영 로직 전체 정리

> **이 버전의 변경 내용:** 배지 엔진 미구현 조건 3개 구현 — temperature_min/max_c(Strava 날씨), time_range(시간대), poi_id(스켈레톤 명확화)  
> 이전 버전: SERVICE_OPERATIONS_20260720_1200.md

---

## 변경된 섹션

### 4. 배지 발급 엔진 (badge-engine/index.ts)

#### 신규 구현: temperature_min_c / temperature_max_c

```
[구현] temperature 조건 평가

  파일: src/lib/badge-engine/index.ts, src/lib/strava/sync.ts, src/types/strava.ts

  배경: Strava API는 활동에 average_temp(섭씨 정수) 필드를 제공.
        이전에는 항상 pass:false를 반환하여 날씨 배지 40개가 영구 미발급 상태였음.

  변경:
    StravaSummaryActivity에 average_temp?: number | null 추가
    NormalizedActivity에 weatherTempC?: number | null 추가
    normalizeActivity()에서 activity.average_temp → weatherTempC 매핑

  조건 평가 로직:
    temperature_min_c (폭염 배지):
      filtered 활동 중 weatherTempC 있는 것의 최대값 ≥ temperature_min_c → pass
      날씨 데이터 없으면 → fail (Strava 미제공)

    temperature_max_c (한파 배지):
      filtered 활동 중 weatherTempC 있는 것의 최소값 ≤ temperature_max_c → pass
      날씨 데이터 없으면 → fail (Strava 미제공)

  주의:
    Strava가 average_temp를 제공하지 않는 활동(실내 활동, 일부 기기)은
    날씨 배지 발급이 불가능하며, 이는 정상 동작임 (데이터 부재 = 조건 미충족)
```

#### 신규 구현: time_range

```
[구현] time_range 조건 평가

  파일: src/lib/badge-engine/index.ts, src/types/database.ts, src/types/strava.ts

  배경: DB의 time_range 조건({start:"HH:MM", end:"HH:MM"})이 엔진에서 무시되어
        거리 조건만 충족하면 새벽/야간 배지가 오발급될 수 있었음.

  변경:
    BadgeCondition에 time_range?: { start: string; end: string } 타입 추가
    StravaSummaryActivity.start_date_local → NormalizedActivity.startDateLocal 매핑 추가
    PROGRESSION_MODIFIERS에 'time_range' 추가 (트랙 중복 제거 대상에서 제외)

  조건 평가 로직:
    startDateLocal(없으면 startDate) 에서 "HH:MM" 추출
    start <= end: actMin >= startMin && actMin <= endMin
    start > end (자정 걸침): actMin >= startMin || actMin <= endMin
    filtered 활동 중 하나라도 범위 내이면 → pass

  예시:
    새벽 파수꾼(04:00~07:00): 05:30 활동 → pass
    야간 배회(22:00~02:00): 23:30 활동 → pass (자정 걸침 처리)
```

#### 명확화: poi_id

```
[명확화] poi_id 조건 스켈레톤 이유 설명

  파일: src/lib/badge-engine/index.ts

  배경: POI 배지 발급은 sync.ts의 matchPoisForActivity()를 통해 GPS 경로 매칭으로 이미 처리.
        condition_json의 poi_id 필드를 badge engine에서 평가하는 경로는 별도 인프라 필요.

  변경:
    기존: "POI 미매칭" 반환
    변경: "POI 조건은 GPS 경로 매칭으로만 발급됩니다" — 개발자에게 명확한 이유 전달
    상태: 여전히 항상 pass:false (badge engine 내 poi 평가 불가)
```

### 5. 타입 변경

```
파일: src/types/strava.ts
  - StravaSummaryActivity.average_temp?: number | null 추가
  - NormalizedActivity.startDateLocal?: string 추가
  - NormalizedActivity.weatherTempC?: number | null 추가

파일: src/types/database.ts
  - BadgeCondition.time_range?: { start: string; end: string } 추가
  - temperature_min_c/temperature_max_c 주석 업데이트 (미구현 → 구현됨)
```

### 6. 테스트

```
파일: src/lib/badge-engine/__tests__/conditions.test.ts (신규)

  temperature_min_c: 충족/경계/미달/복수활동/데이터없음 (5케이스)
  temperature_max_c: 충족/경계/미달/복수활동/데이터없음 (5케이스)
  time_range: 정상/경계/미달/자정걸침×2/startDateLocal폴백/복수활동 (7케이스)
  poi_id: 항상false (1케이스)

  총 18개 유닛 테스트
```

### 마이그레이션 현황

```
변경 없음 — DB 스키마 변경 없음 (코드 레벨 변경만)
```

### 미해결 주의사항 (업데이트)

```
[해결됨]
  ✅ temperature_min/max_c: Strava average_temp 연동으로 구현
  ✅ time_range: startDateLocal 기반 시간대 필터 구현

[잔존]
  W-1: poi_id(condition_json) — badge engine 내 평가 불가. GPS 경로 매칭 경로만 지원.
  W-3: 주말 배지 — startDateLocal 미사용 (UTC 기준 판단)
  W-5: streak 날짜 — UTC 기준 (KST 자정 경계 오차)

[새로운 주의]
  W-6: Strava average_temp 미제공 활동(실내, 일부 기기) — 날씨 배지 발급 불가
       이는 데이터 부재로 인한 정상 동작이며 외부 날씨 API 연동 시 개선 가능
```
