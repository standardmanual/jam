# JAM! 배지 시스템 로직

## 1. 두 가지 배지 엔진

JAM!의 배지는 **발급 방식이 다른 두 엔진**으로 처리된다.

| 구분 | 배지 엔진 (badge-engine) | 드랍 엔진 (drop-engine) |
|------|--------------------------|------------------------|
| 대상 배지 타입 | `activity` | `item` |
| 트리거 | Strava 활동 동기화 | Strava 활동 동기화 |
| 발급 기준 | 조건 충족 여부 (결정론적) | 확률 기반 추첨 (확률론적) |
| 저장 테이블 | `user_activity_badges` | `inventory_items` |
| 파일 | `src/lib/badge-engine/index.ts` | `src/lib/drop-engine/index.ts` |

---

## 2. 배지 발급 엔진 (badge-engine)

### 입력 / 출력

```
입력: userId, activities[] (NormalizedActivity)
출력: { earned: BadgeEarnedInfo[], missed: BadgeMissedInfo[] }
```

### 흐름

```
1. DB에서 type='activity' 배지 전체 조회 (유효기간 필터 포함)
2. DB에서 유저의 보유 배지 목록 조회 (badge_id, earned_at)
   ↳ 오류 시 즉시 종료 → { earned:[], missed:[] }

3. [이름별 그룹 처리] 배지 이름(=그룹) 단위로 반복
   A. 이미 보유한 배지 → 건너뜀
   B. 보유 배지보다 낮은 tier → 건너뜀 (성장 티어 정책)
   C. 조건 평가 (evaluateConditionDetailed)
      - 통과 → eligible 목록에 추가
      - 실패 → missed 목록에 추가
   D. eligible에서 최상위 tier 1개만 후보로 선정 (나머지는 missed)

4. [진행 트랙 중복 제거]
   - 조건이 순수 거리 또는 횟수만 있는 배지 → 같은 activity_type + 조건 타입 중 최고값 1개만 통과
   - 복합 조건(고도, 속도 등 포함) 배지 → 트랙 독립, 중복 허용

5. [배지 홍수 방지 (flood cap)]
   - 30일 롤링 윈도우 내 activity_type당 최대 3개
   - mythic 우선 순으로 정렬 후 순서대로 상한 체크
   - 상한 초과 시 missed 추가

6. [발급] dryRun=false인 경우만 DB 저장
   - user_activity_badges INSERT
   - 피드 이벤트 기록 (recordFeedEvent: 'badge_earned')
```

### 조건 평가 (evaluateConditionDetailed)

조건 필드는 **AND 조합**이다. 모든 필드를 통과해야 pass:true.

| 조건 필드 | 평가 방식 | 구현 상태 |
|-----------|-----------|----------|
| `activity_type` | 활동을 해당 타입으로 필터링 (단독으로는 통과) | ✅ |
| `distance_km` | 필터된 활동의 누적 거리 합계 ≥ 조건값 | ✅ |
| `total_count` | 필터된 활동 건수 ≥ 조건값 | ✅ |
| `elevation_gain_m` | 필터된 활동의 누적 고도 상승 합계 ≥ 조건값 | ✅ |
| `min_speed_kmh` | 필터된 활동 중 최대 평균속도 ≥ 조건값 | ✅ |
| `streak_days` | 연속 활동일 최장 스트릭 ≥ 조건값 | ✅ |
| `duration_minutes` | 단일 활동 이동 시간 최대값(분) ≥ 조건값 | ✅ |
| `weekend_duration_hours` | 주말 활동 이동 시간 최대값(시간) ≥ 조건값 | ✅ |
| `weekly_count` | 한 주 내 활동 횟수 최대값 ≥ 조건값 | ✅ |
| `month` | 해당 월 활동 존재 여부 (monthly_km와 함께 사용) | ✅ |
| `monthly_km` | 월별 누적 거리 최대값 ≥ 조건값 | ✅ |
| `season` + `season_count` | 해당 계절 활동 횟수 ≥ 조건값 | ✅ |
| `temperature_min_c` | **미구현** → 항상 pass:false | ⚠️ |
| `temperature_max_c` | **미구현** → 항상 pass:false | ⚠️ |
| `poi_id` | **미구현** → 항상 pass:false | ⚠️ |
| `time_range` | **미구현** → 조건 필드 자체를 엔진이 무시 (거리만 평가됨) | ⚠️ |

> **time_range 주의**: 엔진이 `time_range` 필드를 명시적으로 처리하지 않음. 해당 배지들은 `distance_km`만 있으면 통과될 수 있어 의도치 않은 발급 가능성 있음.

### 성장 티어 정책

같은 이름의 배지는 common → rare → legendary → mythic 순서로 성장한다.

```
예시: "첫 숨결" 그룹
  - common(3km) 보유 상태에서 rare(9km) 달성 시
    → common은 건너뜀, rare만 발급
  - legendary(21km) 달성 시 common·rare를 동시에 통과해도
    → legendary 1개만 발급
```

### 진행 트랙 정책

**진행 트랙(progression track)**: 조건이 거리 또는 횟수 하나만 있는 배지 그룹은 같은 트랙으로 묶임.

```
트랙 키 = activity_type + ':' + 조건타입
예: 'road_running:distance_km'

같은 트랙 내에서 최고값 1개만 발급됨
```

복합 조건(고도, 속도, 주말, 계절 등 포함) 배지는 트랙에서 제외 → 각각 독립 발급 가능.

### 홍수 방지 (flood cap)

```
- 롤링 윈도우: 30일
- 상한: activity_type당 3개
- 우선순위: mythic → legendary → rare → common
- 체크 대상: 기존 보유 + 이번에 발급 예정인 배지 합산
```

---

## 3. 드랍 엔진 (drop-engine)

### 입력 / 출력

```
입력: userId, activityType, activities[] (NormalizedActivity)
출력: void (DB에 직접 저장)
```

### 흐름

```
1. 레어리티 추첨 (rollRarity)
   - 40%: common
   - 25%: rare  (누적 65%)
   - 10%: legendary (누적 75%)
   - 5%:  mythic   (누적 80%)
   - 20%: 드랍 없음 → 종료

2. 섀도우밴 체크
   - getUserBanLevel(userId) + getAbusingPolicy()
   - 밴 레벨이 높을수록 고가치(high rarity) 드랍 차단

3. 활성 아이템북 조회
   - item_books.is_active = true 인 것만 풀에 포함
   - 활성 아이템북이 없으면 → 종료

4. 드랍 풀 구성
   - type='item', rarity=추첨된 rarity
   - item_book_id IN (활성 아이템북)
   - valid_from ≤ 현재시각 ≤ valid_until (null 허용)

5. condition_json 필터
   - 조건이 없는 배지: 모두 드랍 가능
   - 조건이 있는 배지: checkCondition(cond, activities) 통과 시에만 포함

6. drop_weight 기반 가중 랜덤 선택 (weightedPick)
   - 각 배지의 drop_weight 합산 후 비례 확률로 선택

7. 인벤토리 슬롯 확인
   - inventory.used_slots >= inventory.max_slots → 드랍 취소

8. inventory_items INSERT
   - obtained_by: 'drop'
   - expires_at: 배지의 valid_until (없으면 null)

9. inventory.used_slots +1

10. 피드 이벤트 기록 (recordFeedEvent: 'item_dropped')
```

### 레어리티 확률표

| 레어리티 | 확률 | 누적 확률 |
|---------|------|----------|
| common | 40% | 40% |
| rare | 25% | 65% |
| legendary | 10% | 75% |
| mythic | 5% | 80% |
| **드랍 없음** | **20%** | **100%** |

### 드랍 엔진 조건 평가 주의

드랍 엔진도 `checkCondition`을 사용하지만, **배지 발급 엔진과 달리 단일 활동 기준**으로 평가한다.
아이템 배지의 `condition_json`은 "이 배지를 드랍 풀에 포함할 조건"이다.

---

## 4. 관련 파일 위치

```
src/lib/badge-engine/index.ts     배지 발급 엔진
src/lib/drop-engine/index.ts      드랍 엔진
src/lib/strava/sync.ts            Strava 동기화 (두 엔진 모두 호출)
src/types/strava.ts               STRAVA_TYPE_TO_JAM, getJamActivityType()
src/types/database.ts             ActivityType, BadgeCondition 타입 정의
supabase/migrations/029_*.sql     배지 전체 시드 데이터
```

---

## 5. 알려진 미구현 사항 (경고)

| 항목 | 영향 | 우선순위 |
|------|------|---------|
| `temperature_min/max_c` 조건 미구현 | 날씨 배지 40개 영구 미발급 | 중 (날씨 API 연동 필요) |
| `time_range` 조건 미구현 | 새벽/야간 배지 오발급 가능성 | 높 (엔진 로직 추가 필요) |
| `poi_id` 조건 미구현 | POI 연계 배지 미발급 | 낮 (POI 기능 미완성) |
| 주말 여부 판단 시 UTC 기준 | KST 주말 경계 오차 | 낮 |
| streak 판단 시 UTC 기준 | 자정 직후 활동 날짜 오차 | 낮 |
