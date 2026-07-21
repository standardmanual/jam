# JAM! 통합 배지 발급 로직 — 액티비티배지 엔진 + 아이템배지 드랍 엔진

> 통합 원본: `BADGE_POLICY_V3.md` (액티비티배지, **구현됨**) + `ITEM_DROP_GAMIFICATION_V2.md` (아이템배지 드랍 v2, **설계안**)  
> 작성일: 2026-07-21  
> DB 단일 진실 원천: `supabase/migrations/033_reseed_activity_badges_v3.sql` (액티비티배지 115종) / `아이템북 레시피.xlsx` (아이템배지 ~900종 + 세계관 인접)

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
| 대상 | `type='activity'` (115종: 5종목 체계) | `type='item'` (~900종: 10세계관 × 10아이템북) |
| 성격 | **성취의 증명** — 조건 달성 = 발급 (결정론) | **수집의 재미** — 활동당 최소 1개, 내용은 변동 (확률론) |
| 평가 기준 | 유저 **전체 활동 이력** 누적 평가 | **단일 활동**(이번 싱크 배치) 기준 |
| 저장 | `user_activity_badges` | `inventory_items` (일련번호 무작위) |
| 구현 파일 | `src/lib/badge-engine/index.ts` ✅ 구현 | `src/lib/drop-engine/index.ts` ⚠️ v1 구현 / v2 설계 |
| 게이미피케이션 역할 | 장기 목표·티어 성장 (mastery) | 세션 보상·세계관 서사·수집 (variable reward) |

**공통 정책 (두 엔진 공유):**
- 첫 싱크 게이트: `users.initial_sync_done=false`인 첫 싱크는 고가치 발급 제한 (액티비티=Rare+ 차단, 아이템=첫 드랍 확정이되 rarity 정책 적용)
- 섀도우밴: 밴 레벨에 따라 고가치(rarity) 발급 차단 — `src/lib/abusing/`
- 피드 이벤트: 발급 시 `recordFeedEvent` ('badge_earned' / 'item_dropped')

---

## 2. 액티비티배지 엔진 (구현됨 — v3)

### 2.1 발급 파이프라인

```
Step 0. 초기 싱크 상태 조회 (initial_sync_done)
Step 1. type='activity' 배지 전체 조회 (유효기간 필터)
Step 2. 유저 보유 배지 조회
Step 2.8. [첫 싱크 게이트] 첫 싱크면 Common 외 전부 missed
Step 3. 이름 그룹 단위 평가:
  A. 이미 보유 → 스킵
  B. 보유보다 낮은 tier → 스킵 (성장 티어)
  C-1. prerequisite_badge_names OR 매칭 — 없으면 missed
  C-2. evaluateConditionDetailed — 전체 이력 기준 AND 평가
  D. eligible 중 최상위 tier 1개만 후보
Step 4. [진행 트랙 중복 제거] 단일 조건 배지는 activity_type:조건타입 트랙당 최고 1개
Step 5. [홍수 방지] 30일 롤링 윈도우, activity_type당 최대 3개 (mythic→common 우선)
Step 6. 발급: user_activity_badges INSERT + 피드 + initial_sync_done 갱신
```

### 2.2 조건 평가 필드 (모든 필드 AND)

| 조건 필드 | 평가 방식 |
|-----------|-----------|
| `activity_type` | 활동 필터 |
| `distance_km` / `elevation_gain_m` | **누적 합계** ≥ 조건값 |
| `total_count` | 필터된 활동 건수 |
| `min_speed_kmh` / `duration_minutes` | **단일 활동 최고값** |
| `streak_days` | 최장 연속 활동일 |
| `weekly_count` | 한 주 내 활동 횟수 최대값 — `time_range` 동반 시 **시간대 내 활동만 카운트** (엄격 평가) |
| `weekend_duration_hours` | 주말 활동 이동시간 최대값 |
| `month`+`monthly_km` / `season`+`season_count` | 월별 누적 거리 / 계절 내 횟수 |
| `temperature_min_c` / `temperature_max_c` | Strava average_temp 기준 (없으면 fail) |
| `time_range` | startDateLocal HH:MM 범위 (자정 걸침 지원) |
| `poi_id` | ⚠️ GPS 경로 매칭으로 별도 발급 (엔진 내 평가 불가) |
| `prerequisite_badge_names` | Step 3 C-1에서 OR 매칭 |

### 2.3 핵심 정책 4종

1. **성장 티어**: 같은 이름 그룹 내 common→rare→legendary→mythic 순 성장. 상위 달성 시 하위 건너뛰고 최상위 1개만 발급.
2. **진행 트랙**: 단일 조건 배지는 `activity_type:조건타입` 트랙당 최고값 1개. 복합 조건 배지는 트랙 제외(독립 발급).
3. **홍수 방지**: 30일 롤링 / activity_type당 3개 상한 / 높은 등급 우선.
4. **첫 싱크 게이트 + 선행 배지**: 첫 싱크는 Common만. Rare+는 동일 종목 다른 속성 배지 1개 이상(OR) 선행 보유 필요 — 과거 데이터 소급 폭발 방지 + 종목 내 다양한 속성 경험 유도.

### 2.4 배지 구성

5종목(걷기·로드러닝·사이클·등산·트레일) × 속성별 그룹 × 4등급 = 115종 (v3.1). 전체 목록: `액티비티배지 레시피.md`, 시드: `033_reseed_activity_badges_v3.sql`.

---

## 3. 아이템배지 드랍 엔진 v2 (설계안 — 3레이어)

> 현행 v1(활동당 80% 확률, 900개 풀 완전 랜덤)을 대체하는 설계. 상세 근거·심리학적 배경은 `ITEM_DROP_GAMIFICATION_V2.md` 참조. 설계 방침: **집중은 보이지 않는 가중치로만** — 유저에게 상한·강제 선택을 노출하지 않는다.

### Layer 1 — 드랍 발생: 활동당 최소 1개 확정, 변동성은 희귀도로

| 장치 | 값(초기) |
|------|---------|
| 기본 드랍 | **활동당 1개 확정** (꽝 없음) |
| rarity 분포 | common 60 / rare 28 / legendary 9 / mythic 3 (%) |
| Rare+ pity | 연속 5회 common → 6번째 rare 이상 확정 |
| 보너스 드랍 | 15% 확률로 2개째 (60분+·고고도 활동은 30%) |
| 일일 보정 | 당일 4번째 활동부터 확정 드랍 rarity를 common 90%로 하향 (드랍 자체는 유지) |
| 주간 첫 활동 | rare+ 확률 2배 |
| 복귀 보너스 | 7일+ 공백 후 복귀 활동은 **rare 이상 확정** |

예외: 인벤토리 슬롯 초과 시 드랍 불가(현행 유지 — 유일한 "최소 1개" 예외). 섀도우밴은 rarity 상한으로 작동.

### Layer 2 — 세계관 선택: 서사 모멘텀 (마르코프 가중 추첨)

| 버킷 | 확률 |
|------|------|
| 모멘텀 — 직전 드랍과 같은 세계관 | 50% |
| 인접 — 인접 그래프의 이웃 세계관 | 25% |
| 탐험 — 전체 랜덤 (최근 없던 세계관 우선) | 15% |
| 맥락 오버라이드 (조건 충족 시 최우선) | 10% |

- 드랍의 ~75%가 직전 세계관·이웃에 머물러 **명시적 제한 없이 집중 경험** 형성. 하드캡·세계관 선택 UI 없음.
- 신규 유저 첫 3드랍: 작심삼일 클럽 + 주 활동종목 매핑 세계관 (걷기→숲속의 갱단, 러닝→비트 마에스트로, 사이클→장비병 환자들, 등산/트레일→아스팔트 레인저).
- 미스터리 헌터는 예외 — legendary·mythic에서만 낮은 확률로 등장하는 전역 스파이스.
- 인접 그래프 원천: `아이템북 레시피.xlsx` '세계관 인접' 시트 → DB `world_adjacency` 시드.

### Layer 3 — 아이템북·배지 선택: 완성 페이싱

```
아이템북 가중치 = drop_weight × (1 − completion × 0.7) × (직전 북이면 0.5)
완성(100%) 북은 ×0.3으로 풀 잔류 — 중복 드랍 허용 (조합·트레이드 재료)
```

- 마지막 조각 규칙: 북의 마지막 1개는 감쇠로 귀해짐 → 세계관 내 5드랍 내 미획득 시 확정 (pity). UI에서 "마지막 파편!" 강조 = milestone moment.
- 배지 선택: 북 내 미보유 우선, rarity 일치 없으면 인접 rarity 폴백.

### 맥락 오버라이드 — 드랍을 '성취의 증거'로

활동 맥락이 세계관과 정합하면 60% 확률로 해당 세계관 강제 (overjustification 방어의 핵심):

| 맥락 | 세계관 |
|------|--------|
| 강수·태풍 / 극한 기온 | 아스팔트 레인저 |
| 새벽(05~07시) | 비트 마에스트로 / 셔터 마피아 |
| 심야(23~04시) | 낭만 미식가 / 숲속의 갱단 |
| 고고도 상승 | 낭만 미식가 / 비트 마에스트로 |
| **7일+ 공백 복귀** (최우선) | **작심삼일 클럽** ("결계 섬데이 돌파") |
| 러너스 하이 (고강도 장시간) | 미스터리 헌터 (rare+ 한정) |

### 일련번호 무작위화

`inventory_items.serial_number`를 SERIAL(순차)에서 **1~999,999 난수 + UNIQUE 충돌 재시도**로 변경. 순차 번호의 서열 노출·발급량 역산 방지. 기존 발급분 번호는 유지.

### 유지되는 v1 로직

활성 아이템북 필터(`is_active`), 유효기간(valid_from/until), `isDroppableForActivity`(누적조건 배지 드랍 제외 가드), 인벤토리 슬롯, 섀도우밴, 피드 이벤트.

---

## 4. 두 엔진의 게이미피케이션 역할 분담

```
          장기 (mastery)                    단기 (session reward)
  ┌─────────────────────────┐      ┌─────────────────────────────┐
  │ 액티비티배지              │      │ 아이템배지                    │
  │ - 조건 공개, 목표 지향     │      │ - 무엇이 나올지 모름, 서프라이즈 │
  │ - 티어 성장 = 실력 성장    │      │ - 세계관 서사 몰입 + 수집       │
  │ - 발급 = 성취의 인증       │      │ - 아이템북 완성 = 중기 목표      │
  └─────────────────────────┘      └─────────────────────────────┘
         "내가 해냈다"                     "오늘은 뭐가 나왔지?"
```

- 액티비티배지의 홍수 방지·첫싱크 게이트는 **성취 인플레이션 방지** 장치.
- 아이템배지의 확정 1개+변동 희귀도는 **모든 활동에 대한 인정 + 기대감** 장치.
- 두 엔진 모두 "활동 자체의 내적 가치"를 침식하지 않도록 설계 (informational reward 원칙).

---

## 5. 데이터 모델 요약

| 테이블/컬럼 | 용도 | 상태 |
|-------------|------|------|
| `badges` (type, rarity, condition_json, drop_weight, item_book_id, valid_*) | 배지 마스터 (양 엔진 공용) | ✅ |
| `user_activity_badges` | 액티비티배지 보유 | ✅ |
| `inventory` / `inventory_items` | 아이템배지 인벤토리 (serial_number 무작위화 예정) | ✅ / ⚠️ 일련번호 변경 필요 |
| `item_books` (+`world_id` 추가 예정) | 아이템북 마스터 | ⚠️ world_id 필요 |
| `worlds` + `world_adjacency` (신규) | 세계관 마스터 + 인접 그래프 | 🆕 설계 |
| `user_drop_state` (신규) | 모멘텀·pity·일일 카운터 | 🆕 설계 |

`user_drop_state` 스키마·엔진 의사코드 전문: `ITEM_DROP_GAMIFICATION_V2.md` §5.
