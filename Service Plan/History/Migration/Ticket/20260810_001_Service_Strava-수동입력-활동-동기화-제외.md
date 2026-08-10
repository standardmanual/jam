---
id: 20260810_001
category: Service
status: CLOSED
created: 2026-08-10
closed: 2026-08-10
---

# [Service] Strava 수동 입력(manual) 활동 동기화 제외

## 배경 / 문제 정의
Strava는 GPS/기기 기록 없이 유저가 거리·시간을 직접 타이핑해서 등록하는 "수동 입력(manual)" 활동을 허용한다. 지금까지 JAM! 동기화 로직은 이런 활동도 그대로 받아들여 배지 발급·아이템 드랍 평가 대상에 포함시키고 있었다. 실제 운동 없이 숫자만 입력해 배지를 획득할 수 있는 어뷰징 경로였다.

## 상세 요구사항

### 서비스/코드베이스 관점
- Strava API가 활동마다 내려주는 `manual` 불리언 필드를 이용해 `manual=true`인 활동을 동기화 단계에서 완전히 제외한다.
- `strava_activities`(멱등 처리 기준 테이블)에도 기록하지 않는다 — 애초에 배지·드랍 엔진 평가 대상에서 배제.
- 정기 동기화(`syncStravaActivities`)와 정합성 점검(`reconcileStravaActivities`) 양쪽 모두에 동일하게 적용되어야 한다.

## 구현 계획
`getActivities()`(`src/lib/strava/api.ts`)는 두 동기화 경로(`sync.ts`, `reconcile.ts`)가 공유하는 유일한 Strava 목록 조회 함수다. 이 함수 반환 직전에 `manual=true` 활동을 필터링하면, 이후 모든 처리 단계(멱등 체크, 배지 평가, 드랍, POI 매칭, `strava_activities` 기록)에 자동으로 반영된다.

**검토했으나 채택하지 않은 대안 — `device_name` 기반 추가 필터링:**
GPX/FIT 파일을 직접 업로드해 조작된 기록을 만드는 경우까지 잡으려면 `device_name`(어떤 기기가 기록했는지) 필드가 필요하다. 그런데 이 필드는 Strava의 목록 조회 API(`athlete/activities`)에는 포함되지 않고, 상세 조회 API(`/activities/{id}`)에서만 내려온다. 활동 1건마다 추가 API 호출이 필요해지는데, Strava rate limit(15분당 200회, 일 2000회)이 빡빡한 상황(전체 유저 자동 동기화 크론이 매일 순차적으로 모든 유저를 처리 중)에서 한도 초과 위험이 커진다. 또한 Garmin Connect 등 정상적인 파트너 자동 연동도 내부적으로 파일 업로드 방식을 쓰기 때문에 `upload_id` 유무만으로는 "정상 기기 연동"과 "유저가 조작한 파일 업로드"를 구분할 수 없다. → 이번 작업에서는 API 비용 없이 목록 조회만으로 판별 가능한 `manual=true`만 제외하기로 결정. `device_name` 기반 필터는 향후 필요성이 확인되면 별도 검토.

---
## 완료 기록

### 구현 내용 요약
`getActivities()`가 Strava 목록 API 응답에서 `manual=true`인 활동을 반환 직전에 걸러내도록 수정. 추가 API 호출 없이 기존 응답 데이터만으로 판별하므로 rate limit 영향 없음.

### 변경된 파일
```
jam-web/src/lib/strava/api.ts   — getActivities()에 manual 필터 추가
```

### 테스트 결과
- [x] `npx tsc --noEmit` 통과 (영향 파일: api.ts, sync.ts, reconcile.ts 오류 없음)
- [ ] 실제 Strava 계정에서 수동 입력 활동으로 필터링 동작 확인 — 실 계정 테스트 필요

### 배포 정보
- 배포일: 2026-08-10
- 환경: production
- 커밋: (git push 시 기록)

### 주요 의사결정 / 핵심 메모
- 제외 대상은 `manual=true`만 — `device_name` 기반 파일 업로드 판별은 상세 API 추가 호출 비용 때문에 이번엔 채택하지 않음(위 "검토했으나 채택하지 않은 대안" 참고)
- 제외된 활동은 `strava_activities`에 아예 기록하지 않음(완전 배제) — 유저 화면에도 노출되지 않고, 이후 정합성 점검(reconcile)에서도 "누락"으로 재처리 시도하지 않음(Strava API가 매번 manual 활동도 함께 내려주지만 매번 필터링되어 무시됨)

### 잔여 이슈
- `device_name` 없는 파일 업로드(유저가 직접 GPX/FIT 파일을 조작해 업로드하는 경우)는 여전히 필터링되지 않음 — 향후 어뷰징 사례가 실제 확인되면 상세 API 호출 기반 필터 추가 검토
