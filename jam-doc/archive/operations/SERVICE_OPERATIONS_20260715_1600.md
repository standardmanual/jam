# JAM! 서비스 운영 로직 전체 정리

> **이 버전의 변경 내용:** 배지 엔진 성장 티어 정책 적용 — 배지 이름당 최상위 레어리티 1개만 발급, 미구현 조건 false 처리, 신규 조건 타입 구현  
> 이전 버전: SERVICE_OPERATIONS_20260715_1530.md

---

## 변경된 섹션

### 4. 뱃지 발급 엔진 (변경)

#### 4-1. 성장 티어 정책 (신규)

```
배지는 이름(name)이 같고 레어리티(rarity)만 다른 4단계 성장 티어로 구성:
  Common → Rare → Legendary → Mythic

발급 원칙:
  - 단일 평가 사이클에서 배지 이름당 최상위 레어리티 1개만 발급
  - 이미 보유한 레어리티 이하는 발급 안 함
  - 예: Mythic 조건 달성 시 Common/Rare/Legendary 생략하고 Mythic만 발급
  - 예: Rare 보유 중 Mythic 조건 달성 시 Mythic만 추가 발급

관련 파일: src/lib/badge-engine/index.ts
```

#### 4-2. 구현된 조건 타입

```
조건 타입별 평가 로직:

distance_km        → 활동 누적 거리 합계 (km)
total_count        → 활동 횟수
elevation_gain_m   → 누적 고도 상승 합계 (m)
min_speed_kmh      → 단일 활동 중 최대 평균 속도
streak_days        → 최대 연속 활동 일수
duration_minutes   → 단일 활동 이동 시간 최대값 (분)
weekend_duration_hours → 주말(토/일) 활동 이동 시간 최대값 (시간)
weekly_count       → 같은 주(월~일) 내 최대 활동 횟수
month + monthly_km → 지정 월(1-12) 내 누적 거리 최대값

미구현 (조건 있으면 항상 false):
season_count       → condition_json에 season 필드 없어 평가 불가
temperature_min_c  → 날씨 데이터 없음
temperature_max_c  → 날씨 데이터 없음
poi_id             → poi_match 경로에서 별도 처리
```

#### 4-3. 배지 이름당 발급 알고리즘

```
evaluateBadges(userId, activities):
  1. 전체 activity 배지 조회
  2. 유저 보유 배지 조회 → 이름별 최고 보유 티어 산출
  3. 배지를 이름(name)으로 그룹핑
  4. 각 이름 그룹에 대해:
     a. 미보유 + 현재 보유 티어 초과 배지만 조건 평가
     b. 조건 통과 배지 중 최상위 레어리티 1개 선택
     c. 해당 배지만 INSERT + 피드 이벤트 기록
```
