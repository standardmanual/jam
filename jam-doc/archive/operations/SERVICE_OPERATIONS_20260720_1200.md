# JAM! 서비스 운영 로직 전체 정리

> **이 버전의 변경 내용:** 배지 엔진 earned_at 버그 수정 + Strava 타입 매핑 개선(road_running/trail_running 분기) + trail_running 액티비티 카테고리 신규 추가
> 이전 버전: SERVICE_OPERATIONS_20260719_1820.md

---

## 변경된 섹션

### 4. 배지 발급 엔진 (badge-engine/index.ts)

이전 버전과 동일하되 아래 사항 수정:

```
[버그 수정 — C-1: earned_at]
  기존: user_activity_badges에서 .select('badge_id, created_at') 조회
        → DB 컬럼명은 earned_at이므로 PostgREST 42703 오류 → 모든 배지 발급 실패
  수정: .select('badge_id, earned_at') + Pick<..., 'earned_at'> + owned.earned_at

  영향:
  - 정상 배지 발급 복원
  - flood cap 30일 윈도우 (owned.earned_at >= cutoff30d) 정상 동작 복원

[배지 홍수 방지 — flood cap]
  30일 롤링 윈도우, activity_type당 최대 3개 상한
  Mythic-first 정렬 후 순차 적용 (finalIssueList 사용)
  → earned_at 수정으로 실제 동작 시작 (기존에는 undefined 비교라 무력화 상태였음)
```

### 5. Strava 동기화 (types/strava.ts, lib/strava/sync.ts)

```
파일: src/types/strava.ts, src/lib/strava/sync.ts

[버그 수정 — C-3: 활동 타입 매핑]
  기존:
    STRAVA_TYPE_TO_JAM: { Run → 'running', ... }
    → badge-engine 조건 road_running/trail_running과 불일치 → 러닝 배지 120개 전량 발급 불가

  수정:
    STRAVA_TYPE_TO_JAM: { Run → 'road_running', VirtualRun → 'road_running', ... }
    STRAVA_SPORT_TYPE_TO_JAM 신규 추가:
      { TrailRun → 'trail_running', TrailRunning → 'trail_running',
        Run → 'road_running', VirtualRun → 'road_running', ... }

    getJamActivityType(activity) 헬퍼 함수 신규 추가:
      - sport_type을 먼저 확인 → STRAVA_SPORT_TYPE_TO_JAM 조회
      - 매핑 없으면 type → STRAVA_TYPE_TO_JAM 폴백
      - normalizeActivity에서 이 함수 사용하도록 교체

  매핑 결과:
    Strava sport_type='TrailRun'  → jam 'trail_running'
    Strava sport_type='Run' / type='Run'  → jam 'road_running'
    Strava type='Ride/EBikeRide/VirtualRide'  → jam 'cycling'
    Strava type='Walk'  → jam 'walking'
    Strava type='Hike'  → jam 'hiking'

[normalizeActivity 변환]
  metersToKm(distance)  → distance_km
  total_elevation_gain  → elevationGainM
  moving_time(초)        → movingTimeSec
  average_speed(m/s)    → speedKmh (×3.6)
  start_date(UTC)       → startDate  ※ start_date_local 미사용 (KST 경계 오차 잠재)
  jamActivityType       → getJamActivityType() 헬퍼 사용
```

### 6. 액티비티 카테고리 (신규: trail_running)

```
파일: src/types/database.ts, src/lib/utils.ts,
      src/app/(main)/badges/[id]/page.tsx,
      src/app/admin/badges/BadgeForm.tsx,
      src/app/admin/simulator/page.tsx,
      src/lib/drop-engine/index.ts

[신규 카테고리 추가]
  ActivityType 유니온:
    기존: 'cycling' | 'running' | 'hiking' | 'walking'
    추가: 'road_running' | 'trail_running'  (running은 하위호환 유지)

  ACTIVITY_TYPE_LABELS (utils.ts):
    road_running → '로드러닝'
    trail_running → '트레일러닝'

  노출 화면:
    - 배지 상세 ACTIVITY_LABELS (badges/[id]/page.tsx)
    - 어드민 배지 생성/수정 드롭다운 (admin/badges/BadgeForm.tsx)
    - 어드민 활동 시뮬레이터 선택지 (admin/simulator/page.tsx)

[DB 메모]
  activity_types 컬럼: TEXT[] (enum/check constraint 없음)
  trail_running 배지 데이터: migration 029에서 이미 시드 완료 (60개×4레어리티)
  migration 031: 컬럼 COMMENT로 허용값 문서화만 (데이터 변경 없음)
```

### 마이그레이션 현황

```
029_reseed_activity_badges_v2.sql
  - 600개 액티비티 배지 전체 재시드
  - road_running/trail_running/walking/cycling/hiking × 15그룹 × 4레어리티

030_fix_badge_fk_safe_reseed.sql
  - item_books의 nullable badge FK(reward_badge_id, required_activity_badge_id)를
    ON DELETE SET NULL로 강화 (DO block으로 컬럼 존재 여부 방어 처리)
  - 029 성공 환경에서 no-op

031_add_trail_running_category.sql
  - users.activity_types, badges.activity_types 컬럼 COMMENT 갱신
  - 데이터 변경 없음

[미해결 WARNING]
  W-1: time_range(새벽/밤 배지 40개) — 엔진에 시간대 체크 로직 없어 distance만으로 발급
  W-2: cold/hot(온도 배지 40개) — 날씨 데이터 미연동, 영구 미발급
  W-3: 주말 배지 — 주말 필터 없어 평일 활동으로도 발급 가능
  W-5: start_date_local 미사용 — UTC 기준 날짜 계산 (KST 경계 오차 잠재)
  C-4 (제외): 배지 이미지 029가 placeholder로 덮어씀 — 이번 범위 밖
```
