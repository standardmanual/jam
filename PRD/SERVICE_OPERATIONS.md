# JAM! 서비스 운영 로직 전체 정리

> 현재 운영 중인 코드 기준으로 작성된 기술 운영 문서.  
> 최종 업데이트: 2026-07-20

---

## 목차

1. [서비스 개요](#1-서비스-개요)
2. [유저 인증 및 온보딩](#2-유저-인증-및-온보딩)
3. [Strava 연동](#3-strava-연동)
4. [뱃지 발급 엔진](#4-뱃지-발급-엔진)
5. [드랍 엔진](#5-드랍-엔진)
6. [POI 드랍 · 픽업](#6-poi-드랍--픽업)
7. [인벤토리 · 아이템북](#7-인벤토리--아이템북)
8. [조합(Combine) 시스템](#8-조합combine-시스템)
9. [미션 시스템](#9-미션-시스템)
10. [팔로우 · 소셜](#10-팔로우--소셜)
11. [피드 시스템](#11-피드-시스템)
12. [어뷰징 방어 시스템](#12-어뷰징-방어-시스템)
13. [떠돌이 신화 아이템](#13-떠돌이-신화-아이템)
14. [Cron 작업](#14-cron-작업)
15. [API 라우트 전체 목록](#15-api-라우트-전체-목록)
16. [DB 테이블 전체 목록](#16-db-테이블-전체-목록)
17. [Strava 활동 타입 매핑](#17-strava-활동-타입-매핑)

---

## 1. 서비스 개요

JAM!은 **피지털(Physical + Digital) 게이미피케이션 플랫폼**이다.  
실제 운동 활동(Strava 기반)을 트리거로 디지털 뱃지·아이템을 획득하고, 이를 조합·교환하며 콜렉션(아이템북)을 완성하는 서비스다.

**핵심 루프:**

```
Strava 활동 완료
     ↓
JAM! 자동 동기화 (Strava API)
     ↓
① 뱃지 평가 → 조건 달성 시 뱃지 발급
② 드랍 추첨 → 확률적으로 아이템 드랍
③ POI 매칭 → 활동 경로 내 POI 배지 발급
④ 미션 달성 체크
⑤ 아이템북 완성 체크
```

---

## 2. 유저 인증 및 온보딩

### 2-1. 인증 방식

- Supabase Auth 사용 (Google OAuth, 이메일/패스워드 등)
- 인증 콜백: `GET /auth/callback` → Supabase `exchangeCodeForSession` → 온보딩 미완료 유저는 `/onboarding`으로 리다이렉트

### 2-2. 유저 생성 트리거

`auth.users` INSERT 시 Supabase DB 트리거(`handle_new_user`) 자동 실행:

```sql
-- public.users 레코드 자동 생성
INSERT INTO public.users (id, email, username)
VALUES (NEW.id, NEW.email, NULL);

-- inventory 자동 생성
INSERT INTO public.inventory (user_id, max_slots, used_slots)
VALUES (NEW.id, 50, 0);
```

- `username`은 초기에 NULL → 온보딩에서 설정
- `max_slots` 기본값: **50슬롯**

### 2-3. 온보딩 흐름

1. `/onboarding` 페이지 접근
2. 유저네임 입력 → `GET /api/username/check` 중복 확인
   - 규칙: 소문자 영문·숫자·언더스코어, 3~20자, UNIQUE
3. 프로필 이미지 업로드(선택) → `POST /api/profile/avatar` → Supabase Storage `avatars` 버킷
4. `POST /api/onboarding/complete` → `users.username` 업데이트, `users.onboarding_completed_at` 기록

---

## 3. Strava 연동

**관련 파일:** `src/lib/strava/sync.ts`, `src/app/api/strava/`

### 3-1. OAuth 연동 흐름

```
사용자 → GET /api/strava/auth
           ↓
      state=userId 파라미터 포함
      Strava OAuth 인가 URL로 리다이렉트
      scope: read, activity:read_all
           ↓
사용자가 Strava에서 승인
           ↓
GET /api/strava/callback?code=...&state={userId}
           ↓
Strava 토큰 교환 (POST strava.com/oauth/token)
           ↓
access_token, refresh_token → AES-256 암호화
           ↓
strava_connections UPSERT
(onConflict: strava_athlete_id)
           ↓
즉시 syncStravaActivities(userId) 호출
```

- 토큰은 `encrypt()` 함수로 암호화하여 DB 저장
- 소급 동기화는 없음: 연동 이후 활동만 처리

### 3-2. 동기화 흐름 (syncStravaActivities)

동기화는 아래 10단계로 진행된다.

```
1. strava_connections 조회
   → access_token, refresh_token 복호화

2. 토큰 만료 임박 확인
   → 만료 1분 전부터 refreshStravaToken 호출
   → 새 토큰 암호화 후 DB 업데이트

3. last_synced_at 이후 활동 조회
   → Strava Activities API (per_page=200)
   → NormalizedActivity로 변환 (STRAVA_TYPE_TO_JAM 매핑)

4. 차량 속도 필터 적용
   → abusing_policy.vehicle_speed_filter_kmh (기본 60km/h) 초과 활동 제외

5. Strava Streams API로 GPS 경로 조회
   → 각 활동의 latlng 경로 데이터 획득

6. POI 매칭
   → matchPoisForActivity: 활동 경로 ↔ POI 반경 교차 체크
   → 매칭된 POI의 linked_badge_id → user_activity_badges INSERT
   → triggered_by: 'poi_match', triggered_by_poi_id: poi.id

7. 아이템 드랍 추첨
   → jamActivityType이 있는 활동에만 tryItemDrop 호출
   → 결과에 따라 inventory_items INSERT

8. 뱃지 엔진 실행
   → evaluateBadges: 조건 달성 배지 발급

9. 아이템북 완성 체크
   → checkItemBookCompletion 호출

10. 미션 달성 체크
    → checkMissions 호출

11. strava_connections.last_synced_at 업데이트
```

### 3-3. 수동 동기화

```
POST /api/strava/sync
→ 인증된 유저에 한해 즉시 syncStravaActivities 실행
→ SyncButton 컴포넌트에서 호출
```

### 3-4. 토큰 갱신

```
if (expires_at - 60초 < now) {
  POST strava.com/oauth/token
  { grant_type: 'refresh_token', refresh_token }
  → 새 토큰 암호화 → DB 업데이트
}
```

---

## 4. 뱃지 발급 엔진

**관련 파일:** `src/lib/badge-engine/index.ts`

### 4-1. 뱃지 타입

| type | 설명 | 발급 트리거 |
|------|------|-------------|
| `activity` | 활동 누적 달성 배지 | Strava 동기화 후 자동 평가 |
| `item` | 인벤토리 아이템 (드랍) | 드랍 엔진에서 발급 |

### 4-2. 활동 배지 발급 전체 흐름 (evaluateBadgesDetailed)

```
0. users.initial_sync_done 조회
   → false이면 isFirstSync = true (첫 싱크 게이트 활성화)

1. badges WHERE type='activity' 전체 조회 (유효기간 필터 포함)

2. user_activity_badges WHERE user_id=유저 조회
   → 보유 배지 ID Set 및 보유 배지 이름 Set 구성 (선행 배지 체크용)

[Step 1: 이름별 후보 선정]
3. 배지를 이름(그룹) 단위로 묶어 반복:
   A. 이미 보유한 배지 → 건너뜀
   B. 보유 티어보다 낮거나 같은 티어 → 건너뜀 (성장 티어 정책)
   C. prerequisite_badge_names 체크:
      condition_json.prerequisite_badge_names 존재 시
      → 나열된 배지 이름 중 하나라도 보유 Set에 포함되어야 통과
      → 미보유 시 missed 처리 (reason: '선행 배지 미보유')
   D. condition_json 조건 평가 (evaluateConditionDetailed)
      → 통과: eligible 후보 추가
      → 실패: missed 추가
   E. eligible 중 최상위 티어 1개만 후보(candidate)로 선정

[Step 2: 진행 트랙 중복 제거]
4. 순수 거리/횟수 조건만 있는 배지 → 동일 트랙 내 최고값 1개만 통과
   (고도·속도·연속일·시간대·계절 등 PROGRESSION_MODIFIERS 포함 시 트랙 독립)

[Step 2.5: 배지 홍수 방지]
5. 30일 롤링 윈도우 내 activity_type당 최대 3개
   (mythic → common 우선순위로 처리, 초과 시 missed)

[Step 2.8: 첫 싱크 게이트]
6. isFirstSync = true인 경우:
   → finalIssueList에서 Common 이외 배지 모두 제외
   → 제외된 배지: missed (reason: '첫 싱크 게이트 — Common 등급만 발급')

[Step 3: 발급]
7. gatedIssueList 배지 발급:
   user_activity_badges INSERT {
     user_id, badge_id,
     triggered_by, triggered_by_strava_id,
     triggered_by_activity_name, triggered_by_distance_km, triggered_by_activity_date
   }
   → UNIQUE(user_id, badge_id) 위반(23505) → skip

8. recordFeedEvent 호출 (silent=false인 경우)
   → event_type: 'badge_earned'

9. 첫 싱크 플래그 세팅 (dryRun=false이고 overrideFirstSync=undefined인 경우만):
   users.initial_sync_done = true UPDATE
```

### 4-3. 첫 싱크 게이트 (initial_sync_done)

신규 유저의 첫 Strava 동기화 시 아무리 누적 스탯이 높아도 **Common 등급 배지만 발급**한다.

```
users.initial_sync_done
  DEFAULT: false
  → 첫 싱크 완료 후: true로 갱신 (이후 싱크부터 정상 평가)

어드민 유저 리셋(POST /api/admin/users/[id]/reset) 시:
  initial_sync_done = false로 초기화
  → 다음 싱크가 재첫싱크로 동작
```

### 4-4. 크로스-어트리뷰트 선행 배지 게이트 (prerequisite_badge_names)

Rare 이상 배지에 `condition_json.prerequisite_badge_names: string[]`를 설정하면,  
나열된 배지 이름 중 하나를 보유하고 있어야만 해당 배지가 발급 가능하다.

```
용도: 같은 종목의 다른 속성(거리 → 속도, 거리 → 연속일 등) 배지를 먼저 획득해야
      상위 배지로 진행할 수 있게 하는 크로스-어트리뷰트 진행 설계

예시:
  "카본 앨리 Rare" condition_json:
    { activity_type: 'cycling', distance_km: 200,
      prerequisite_badge_names: ['카본 앨리 Common', '첫 페달'] }
  → 자전거 Common 배지 중 하나를 보유해야 Rare 평가 대상에 포함
```

어드민 배지 폼에서 "선행 배지 이름 (쉼표 구분)" 필드로 관리.

### 4-5. 조건 평가 (evaluateConditionDetailed)

조건 필드는 **AND 방식**이며 모두 통과해야 `pass: true`.  
`prerequisite_badge_names`는 이 함수가 아닌 엔진 Step 1에서 처리된다.

| 조건 필드 | 평가 방식 |
|-----------|-----------|
| `activity_type` | 해당 종목으로 활동 필터링 |
| `distance_km` | 필터 활동의 누적 거리 합계 ≥ 조건값 |
| `total_count` | 필터 활동 건수 ≥ 조건값 |
| `elevation_gain_m` | 누적 고도 상승(m) ≥ 조건값 |
| `min_speed_kmh` | 단일 활동 최대 평균속도 ≥ 조건값 |
| `streak_days` | 날짜별 최장 연속 스트릭 ≥ 조건값 |
| `duration_minutes` | 단일 활동 이동 시간 최대값(분) ≥ 조건값 |
| `weekend_duration_hours` | 주말 활동 이동 시간 최대값(시간) ≥ 조건값 |
| `weekly_count` | 한 주 내 활동 횟수 최대값 ≥ 조건값 |
| `month` + `monthly_km` | 해당 월 누적 거리 최대값 ≥ 조건값 |
| `season` + `season_count` | 해당 계절 활동 횟수 ≥ 조건값 |
| `temperature_min_c` | 활동 중 기온 ≥ 조건값 (폭염 배지, Strava 온도 의존) |
| `temperature_max_c` | 활동 중 기온 ≤ 조건값 (한파 배지, Strava 온도 의존) |
| `time_range` | startDateLocal의 HH:MM이 {start, end} 범위 내 (자정 경계 지원) |
| `poi_id` | 항상 false — GPS 경로 매칭(sync.ts)으로만 발급 |
| `prerequisite_badge_names` | 엔진 Step 1에서 처리 (이 함수에서는 무시) |

### 4-6. 성장 티어 · 진행 트랙 · 홍수 방지 정책

**성장 티어:** 같은 이름 그룹에서 이미 보유한 티어보다 낮거나 같은 배지는 평가 대상 제외.  
Common 보유 시 → Rare부터 평가. Legendary 이미 보유 시 → Mythic만 평가.

**진행 트랙:** 순수 거리 또는 횟수 조건만 있는 배지는 `actType:distance_km` 또는 `actType:total_count` 키로 묶여 최고값 1개만 발급.  
PROGRESSION_MODIFIERS(`elevation_gain_m`, `min_speed_kmh`, `streak_days`, `duration_minutes`, `weekend_duration_hours`, `monthly_km`, `weekly_count`, `season_count`, `month`, `season`, `temperature_min/max_c`, `poi_id`, `time_range`) 중 하나라도 있으면 트랙 독립.

**홍수 방지:** 30일 롤링 윈도우 내 동일 `activity_type`당 최대 **3개** 발급.  
초과 시 mythic 우선 통과, 나머지 missed 처리.

### 4-7. POI 통과 배지 발급

```
matchPoisForActivity(latlngPath, pois):
  각 POI에 대해:
  → 활동 경로의 GPS 좌표 중 POI 반경 내 진입 여부 체크
  → 매칭 시 poi.linked_badge_id → user_activity_badges INSERT
     triggered_by: 'poi_match'
     triggered_by_poi_id: poi.id
```

### 4-8. 아이템북 완성 보상 배지

```
아이템북 완성 시 → item_books.reward_badge_id 존재하면
→ user_activity_badges INSERT {
    triggered_by: 'itembook_complete:{bookId}'
  }
  (인벤토리 아이템이 아닌 activity badge로 발급)
```

### 4-9. Rarity 등급

| rarity | 의미 | 첫 싱크 발급 |
|--------|------|-------------|
| `common` | 일반 | ✅ 허용 |
| `rare` | 레어 | ❌ 차단 (initial_sync_done 후 해제) |
| `legendary` | 레전더리 | ❌ 차단 |
| `mythic` | 신화 | ❌ 차단 |

---

## 5. 드랍 엔진

**관련 파일:** `src/lib/drop-engine/index.ts`

### 5-1. 드랍 발생 시점

- Strava 동기화 중 각 활동마다 `tryItemDrop` 1회 호출
- `jamActivityType`이 null인 활동(기타 종목)은 드랍 제외

### 5-2. 드랍 흐름

```
tryItemDrop(userId, activityId):

1. Rarity 추첨 (rollRarity):
   Random 값 → rarity 결정
   0.00 ~ 0.40: common   (40%)
   0.40 ~ 0.65: rare     (25%)
   0.65 ~ 0.75: legendary(10%)
   0.75 ~ 0.80: mythic   ( 5%)
   0.80 ~ 1.00: null     (20%, 드랍 없음)

2. 섀도우밴 적용 (shouldAllowDrop):
   soft 밴 → legendary, mythic 드랍률 0%로 강제
   hard 밴 → rare, legendary, mythic 드랍률 0%로 강제
              (common만 통과)
   null rarity → 바로 종료 (드랍 없음)

3. 배지 후보 조회:
   badges WHERE type='item' AND rarity=추첨rarity

4. 가중 랜덤 선택 (weightedPick):
   badges.drop_weight 기반 가중 확률 적용

5. 인벤토리 슬롯 확인:
   inventory.used_slots >= max_slots → 드랍 취소

6. inventory_items INSERT:
   { badge_id, obtained_by: 'drop', expires_at: now + 30일 }

7. inventory.used_slots += 1

8. recordFeedEvent: 'item_dropped' 기록
```

### 5-3. 드랍 확률 요약

| 등급 | 기본 확률 | 드랍 없음 확률 |
|------|----------|---------------|
| common | 40% | — |
| rare | 25% | — |
| legendary | 10% | — |
| mythic | 5% | — |
| 드랍 없음 | — | 20% |

섀도우밴 시 legendary/mythic 또는 rare까지 차단되어 실질 드랍률 감소.

---

## 6. POI 드랍 · 픽업

**관련 파일:** `src/lib/drop/pickup.ts`, `src/app/api/drops/`

### 6-1. POI 드랍 이벤트 (drop_events)

```
사용자가 직접 POI에 드랍:
1. 인벤토리에서 아이템 선택
2. API 호출 → inventory_items.dropped_at = now, drop_id = poi_drop.id
3. poi_drops INSERT { dropper_user_id, badge_id, poi_id, is_available: true }
4. inventory.used_slots -= 1
5. recordFeedEvent: 'item_dropped'
```

### 6-2. POI 픽업 흐름

```
POST /api/drops/[dropId]/pickup → pickup_drop RPC (DB 원자 트랜잭션):

사전 검증:
  ① 유저 현재 위치 → POI 반경 50m 이내 확인 (isUserNearPoi)
  ② poi_blocks 체크: 해당 POI에 해당 유저 블록 없음
  ③ GPS 조작 감지 (checkAndUpdateLocation):
     이전 위치 대비 이동속도 > gps_max_speed_kmh (기본 300km/h) → 거부
  ④ poi_drops.is_available = true
  ⑤ poi_drops.dropper_user_id ≠ 현재 유저 (본인 드랍 픽업 불가)
  ⑥ inventory.used_slots < max_slots (슬롯 여유 확인)

처리:
  poi_drops.picked_up_by = 유저, picked_up_at = now, is_available = false
  inventory_items INSERT { obtained_by: 'poi_pickup', expires_at: now + 30일 }
  inventory.used_slots += 1
  recordFeedEvent: 'item_picked_up'
```

### 6-3. 드랍 이벤트 픽업 (drop_events 기반)

```
Strava 활동 후 자동 처리:
  활동 경로(latlng) ↔ 활성 drop_events 교차 검증
  → isRouteNearPoi: 활동 경로가 POI 반경 내 진입 여부
  → drop_events.claimed_quantity < total_quantity
  → drop_claims INSERT (UNIQUE: drop_event_id + user_id → 유저당 1회)
  → drop_events.claimed_quantity += 1
  → 소진 시 is_active = false
  → inventory_items INSERT (obtained_by: 'drop_event', 만료 30일)
```

---

## 7. 인벤토리 · 아이템북

**관련 파일:** `src/app/api/itembooks/[id]/slot/route.ts`, `src/lib/itembook/checker.ts`

### 7-1. 인벤토리 구조

```
inventory (유저당 1개, 신규 유저 생성 시 트리거로 자동 생성)
  max_slots: 50 (기본값)
  used_slots: 0 ~ max_slots

inventory_items (슬롯당 1개)
  badge_id: 아이템 배지 참조
  obtained_by: 'drop' | 'poi_pickup' | 'drop_event' | 'system_event'
  expires_at: 획득일 + 30일 (만료)
  dropped_at: POI 드랍 시 설정
  slotted_in: user_item_book_slots.id 참조 (장착 시)
```

### 7-2. 아이템북 슬롯 장착

```
POST /api/itembooks/[id]/slot

검증:
  ① inventory_items.slotted_in IS NULL (미장착 상태)
  ② badges.item_book_id === 요청한 itemBookId (해당 북 소속 배지)
  ③ 소유자: inventory.user_id === 현재 유저

처리:
  user_item_book_slots INSERT { user_id, item_book_id, badge_id, inventory_item_id }
  inventory_items.slotted_in = slot.id
  완성 체크: 해당 북의 전체 badge 수 === 현재 슬롯 수 → 완성
    → user_item_book_completions UPSERT
    → reward_badge_id 있으면 activity badge 발급
```

### 7-3. 슬롯 해제

```
DELETE /api/itembooks/[id]/slot

  inventory_items.slotted_in = NULL
  user_item_book_slots DELETE

  ※ 완성 기록(user_item_book_completions)은 유지됨.
     해제해도 완성 취소 없음.
```

### 7-4. 아이템북 완성 보정 체크 (Strava 동기화 후)

```
checkItemBookCompletion(userId, activities):
  item_books WHERE is_active=true 전체 조회
  각 북에 대해:
    총 badge 수 = badges WHERE item_book_id AND type='item' COUNT
    유저 슬롯 수 = user_item_book_slots WHERE user_id AND item_book_id COUNT
    슬롯 수 >= 총 badge 수 AND 미완성 상태 → 완성 판정
    → user_item_book_completions UPSERT (ignore duplicates)
    → reward_badge_id 있으면 activity badge 발급
```

---

## 8. 조합(Combine) 시스템

**관련 파일:** `src/lib/combine/index.ts`, `src/app/api/combine/route.ts`

### 8-1. 조합 흐름

```
POST /api/combine { item_ids: string[] }  (2~3개 아이템)

1. inventory_items WHERE id IN(itemIds) AND inventory_id=유저인벤 조회
   → 개수 불일치 → items_not_found 에러

2. 재료 배지 ID 정렬(sort()) → combination_recipes 순차 비교
   (ingredient_badge_ids 정렬 후 비교 → 순서 무관 매칭)

3. 매칭 레시피 없음 → no_recipe 에러

4. 원본 아이템 소각:
   inventory_items DELETE WHERE id IN(itemIds)
   inventory.used_slots -= itemIds.length
   ※ 성공 실패 여부 무관하게 소각 먼저 실행

5. 성공 확률 판정:
   Math.random() > recipe.success_rate → chance_fail 반환
   (아이템 이미 소각, 복구 없음)

6. 성공 시:
   inventory_items INSERT {
     badge_id: result_badge_id,
     obtained_by: 'system_event',
     expires_at: now + 30일
   }
   inventory.used_slots += 1

7. 결과 배지명 반환
```

**주의:** 소각은 성공 판정 전에 실행된다. 확률 실패 시 원본 아이템은 복구되지 않는다.

### 8-2. 레시피 구조

```sql
combination_recipes {
  ingredient_badge_ids: UUID[] (정렬 불필요, 코드에서 sort)
  result_badge_id: UUID
  success_rate: 0.0 ~ 1.0
}
```

---

## 9. 미션 시스템

**관련 파일:** `src/lib/missions/checker.ts`, `src/app/api/missions/`

### 9-1. 미션 참가

```
POST /api/missions/[id]/join

조건:
  ① 해당 미션 존재 (missions 테이블)
  ② missions.ends_at > now (진행 중)
  ③ 중복 참가: UNIQUE 위반(23505) → 409 반환

처리:
  user_mission_participations INSERT
  recordFeedEvent: 'mission_joined'
```

### 9-2. 미션 취소

```
DELETE /api/missions/[id]/join

조건:
  user_mission_completions에 완료 기록 없는 경우만 취소 가능

처리:
  user_mission_participations DELETE
  recordFeedEvent: 'mission_cancelled'
```

### 9-3. 미션 달성 체크 (Strava 동기화 후 자동 실행)

```
checkMissions(userId, newActivities):

1. 진행 중 미션 조회 (starts_at <= now <= ends_at)
2. 이미 완료한 미션 제외
3. 유저가 참가 중인 미션만 평가

progress 계산 (calculateProgress):
  mission_type = 'distance':
    condition_json.activity_type 필터 후 누적 distanceKm
  mission_type = 'activity_count':
    해당 종목 활동 횟수
  mission_type = 'poi_visit': 미구현 (0 반환)
  mission_type = 'item_collect': 미구현 (0 반환)

달성 판정:
  progress >= target 값:
    distance: condition_json.distance_km
    count: condition_json.count

선착순 미션:
  missions.max_completions IS NOT NULL →
  현재 완료자 수 >= max_completions → skip

달성 시:
  user_mission_completions INSERT
  recordFeedEvent: 'mission_completed'
```

### 9-4. 미션 타입

| mission_type | 조건 | 구현 상태 |
|---|---|---|
| `distance` | 누적 이동 거리(km) | ✅ 운영 중 |
| `activity_count` | 활동 횟수 | ✅ 운영 중 |
| `poi_visit` | POI 방문 횟수 | ❌ 미구현 |
| `item_collect` | 아이템 수집 | ❌ 미구현 |

---

## 10. 팔로우 · 소셜

**관련 파일:** `src/app/api/follows/`

### 10-1. 팔로우

```
POST /api/follows { target_user_id }

자기 자신 팔로우: 코드 레벨 + DB CHECK 제약으로 방지
승인 없이 즉시 팔로우 (트위터/X 방식)

user_follows INSERT { follower_id: 현재유저, following_id: target }
중복(23505) → { ok: true, already: true } (에러 아님)
```

### 10-2. 언팔로우

```
DELETE /api/follows/[userId]
(userId = 언팔 대상)

user_follows DELETE WHERE
  follower_id = 현재유저 AND following_id = userId
```

### 10-3. RLS 정책 (021_follows.sql)

| 작업 | 정책 |
|------|------|
| SELECT | 전체 공개 (`USING (true)`) |
| INSERT | 본인만 (`WITH CHECK (auth.uid() = follower_id)`) |
| DELETE | 본인만 (`USING (auth.uid() = follower_id)`) |

### 10-4. 제약 조건

```sql
UNIQUE(follower_id, following_id)  -- 중복 팔로우 방지
CHECK(follower_id <> following_id)  -- 자기 자신 팔로우 방지
```

---

## 11. 피드 시스템

**관련 파일:** `src/lib/activity-feed/index.ts`

### 11-1. 테이블 구조

```sql
user_activity_feed {
  id: UUID
  user_id: UUID (FK → users)
  event_type: ENUM
  event_at: TIMESTAMPTZ
  metadata: JSONB
  INDEX: (user_id, event_at DESC)
}
```

### 11-2. 이벤트 타입 · metadata 스키마

| event_type | metadata 필드 |
|---|---|
| `badge_earned` | badge_id, badge_name, badge_image_url, rarity |
| `item_dropped` | badge_id, badge_name, badge_image_url, rarity, poi_name |
| `item_picked_up` | badge_id, badge_name, badge_image_url, rarity, poi_name, dropper_user_id |
| `mission_joined` | mission_id, mission_title |
| `mission_completed` | mission_id, mission_title, reward_type, reward_points |
| `mission_cancelled` | mission_id, mission_title |

### 11-3. 피드 기록 규칙

- 모두 service_role 클라이언트로 INSERT (RLS 우회)
- try-catch로 감싸져 있어 실패해도 메인 로직에 영향 없음
- RLS: 본인 피드만 읽기 가능 (`auth.uid() = user_id`)

### 11-4. 피드 조회 방식

`GET /{username}` 페이지 서버 컴포넌트에서:

1. `user_activity_feed` 최근 150건 조회
2. legacy 데이터 보정:
   - `user_activity_badges`: feed에 없는 배지 획득 기록
   - `inventory_items`: feed에 없는 드랍 기록
   - `poi_drops`: POI 드랍 기록
   - `user_mission_completions/participations`: 미션 기록
3. 합산 후 `event_at` 기준 내림차순 정렬 → 200건 노출

---

## 12. 어뷰징 방어 시스템

**관련 파일:** `src/lib/abusing/`

### 12-1. 차량 속도 필터

```
abusing_policy.vehicle_speed_filter_kmh (기본값: 60km/h)

Strava 동기화 시:
  activity.average_speed_kmh > vehicle_speed_filter_kmh
  → 해당 활동을 뱃지 엔진 평가에서 제외
  (드랍은 별도 판단)
```

### 12-2. GPS 조작 감지

```
src/lib/abusing/gps-detector.ts

checkAndUpdateLocation(userId, lat, lng):
  users.last_location_(lat/lng/at) 조회
  이동 거리(Haversine) / 경과 시간 → 속도 계산
  > gps_max_speed_kmh (기본 300km/h) → GPS 조작 판정 → 픽업 거부
  정상 → users.last_location 업데이트
```

### 12-3. 섀도우밴

```
user_shadow_bans { user_id, ban_level: 'soft'|'hard', reason, expires_at }

soft 밴:
  legendary, mythic 드랍 → 0% (차단)
  rare, common 정상 유지

hard 밴:
  rare, legendary, mythic 드랍 → 0% (차단)
  common만 정상 유지
```

### 12-4. POI 블록

```
poi_blocks { user_id, poi_id, blocked_until }

픽업 시도 시 poi_blocks 체크:
  해당 (user_id, poi_id)에 유효한 블록 있음 → 픽업 거부
  기본 블록 기간: 72시간
```

### 12-5. 어뷰징 정책 싱글톤 (abusing_policy)

```sql
abusing_policy {
  id: 1 (항상 단 1건)
  vehicle_speed_filter_kmh: 60      -- 차량 속도 기준
  gps_max_speed_kmh: 300            -- GPS 조작 감지 기준
  soft_ban_legendary_rate: 0.0      -- soft밴 시 legendary 드랍률
  soft_ban_mythic_rate: 0.0         -- soft밴 시 mythic 드랍률
  hard_ban_rare_rate: 0.0           -- hard밴 시 rare 드랍률
  hard_ban_legendary_rate: 0.0      -- hard밴 시 legendary 드랍률
  hard_ban_mythic_rate: 0.0         -- hard밴 시 mythic 드랍률
}
```

어드민 패널에서 `PATCH /api/admin/abusing/policy`로 수정 가능.

---

## 13. 떠돌이 신화 아이템

**관련 파일:** `supabase/migrations/011_phases_15_18.sql`, `src/app/api/cron/wandering/`

### 13-1. 개요

- 특별 뱃지 `badges.is_wandering = true`로 표시
- `wandering_mythic_state` 테이블로 현재 POI 위치 추적
- 유저가 해당 POI 방문(Strava 경로 매칭) 시 획득

### 13-2. 이동 로직 (매시간 Cron)

```
GET /api/cron/wandering (Authorization: Bearer CRON_SECRET)

1. wandering_mythic_state WHERE expires_at <= now 조회
2. 만료된 상태:
   - 보유 유저 있음 → inventory_items 소각 (expires_at 초과)
   - 소각 후 랜덤 POI 선택 → wandering_mythic_state 업데이트
3. expires_at 갱신 (이동 주기)
```

---

## 14. Cron 작업

모든 Cron은 `Authorization: Bearer {CRON_SECRET}` 헤더 필요.

| 경로 | 실행 주기 | 기능 |
|------|----------|------|
| `GET /api/cron/sync` | 정기 (외부 스케줄러 설정) | 전체 `strava_connections` 유저 순차 동기화. Strava Rate Limit 대응. |
| `GET /api/cron/wandering` | 매시간 | 떠돌이 신화 아이템 POI 이동 처리 |
| `GET /api/cron/poi-cleanup` | 정기 | 만료된 POI 드랍 정리 |

---

## 15. API 라우트 전체 목록

### 유저 앱용

| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | `/auth/callback` | Supabase Auth 콜백 |
| GET | `/api/strava/auth` | Strava OAuth 시작 |
| GET | `/api/strava/callback` | Strava OAuth 콜백 (토큰 저장 + 첫 동기화) |
| POST | `/api/strava/sync` | 수동 Strava 동기화 |
| GET, PATCH | `/api/profile` | 프로필 조회/수정 |
| POST | `/api/profile/avatar` | 아바타 업로드 |
| GET | `/api/username/check` | 유저네임 중복 확인 |
| POST | `/api/onboarding/complete` | 온보딩 완료 처리 |
| POST | `/api/follows` | 팔로우 |
| DELETE | `/api/follows/[userId]` | 언팔로우 |
| GET | `/api/users/[username]/followers` | 팔로워 목록 |
| GET | `/api/users/[username]/following` | 팔로잉 목록 |
| GET | `/api/users/[username]/itembooks` | 유저 아이템북 목록 |
| GET | `/api/users/[username]/stats` | 유저 통계 |
| POST | `/api/missions/[id]/join` | 미션 참가 |
| DELETE | `/api/missions/[id]/join` | 미션 취소 |
| POST | `/api/combine` | 아이템 조합 |
| GET, POST | `/api/itembooks` | 아이템북 목록/생성 |
| GET | `/api/itembooks/[id]` | 아이템북 상세 |
| POST | `/api/itembooks/[id]/slot` | 슬롯 장착 |
| DELETE | `/api/itembooks/[id]/slot` | 슬롯 해제 |
| GET | `/api/inventory/items` | 드랍 가능 아이템 목록 |
| GET | `/api/drops` | 드랍 이벤트 목록 |
| GET | `/api/drops/[dropId]` | 드랍 상세 |
| POST | `/api/drops/[dropId]/pickup` | POI 드랍 픽업 |
| GET | `/api/drops/poi/[poiId]` | POI별 드랍 목록 |
| GET | `/api/share-card/generate` | 공유 카드 이미지 생성 |

### Cron

| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | `/api/cron/sync` | 전체 유저 Strava 정기 동기화 |
| GET | `/api/cron/wandering` | 떠돌이 신화 아이템 POI 이동 |
| GET | `/api/cron/poi-cleanup` | 만료 POI 드랍 정리 |

### 어드민

| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | `/api/admin/auth` | 어드민 인증 |
| GET, POST | `/api/admin/badges` | 배지 목록/생성 |
| GET, PATCH, DELETE | `/api/admin/badges/[id]` | 배지 수정/삭제 |
| PATCH | `/api/admin/badges/[id]/assign` | 배지 item_book_id 할당 |
| GET, POST | `/api/admin/factions` | 팩션 목록/생성 |
| GET, PATCH, DELETE | `/api/admin/factions/[id]` | 팩션 수정 |
| GET, POST | `/api/admin/itembooks` | 아이템북 목록/생성 |
| GET, PATCH, DELETE | `/api/admin/itembooks/[id]` | 아이템북 수정/삭제 |
| GET, POST | `/api/admin/missions` | 미션 목록/생성 |
| GET, PATCH, DELETE | `/api/admin/missions/[id]` | 미션 수정/삭제 |
| GET, POST | `/api/admin/poi` | POI 목록/생성 |
| GET, PATCH, DELETE | `/api/admin/poi/[id]` | POI 수정/삭제 |
| GET, POST | `/api/admin/recipes` | 조합 레시피 목록/생성 |
| PATCH, DELETE | `/api/admin/recipes/[id]` | 레시피 수정/삭제 |
| GET | `/api/admin/users` | 유저 목록 |
| POST | `/api/admin/users/[id]/reset` | 유저 데이터 리셋 |
| POST | `/api/admin/simulate` | 드랍/배지 시뮬레이션 |
| GET, PATCH | `/api/admin/abusing/policy` | 어뷰징 정책 조회/수정 |
| GET, POST | `/api/admin/abusing/bans` | 섀도우밴 목록/부여 |
| GET, POST, DELETE | `/api/admin/abusing/poi-blocks` | POI 블록 관리 |

---

## 16. DB 테이블 전체 목록

| 테이블 | 설명 | 생성 마이그레이션 |
|--------|------|------------------|
| `users` | 유저 기본 정보 (id, email, username, avatar_url, last_location, **initial_sync_done**) | 001, 032 |
| `strava_connections` | Strava OAuth 토큰 + 동기화 상태 | 001 |
| `badges` | 배지 정의 (type, rarity, condition_json, drop_weight, is_wandering) | 001 |
| `user_activity_badges` | 유저 획득 배지 기록 (triggered_by, strava 메타) | 001 |
| `inventory` | 유저 인벤토리 (max_slots, used_slots) | 001 |
| `inventory_items` | 인벤토리 아이템 개별 레코드 (expires_at, slotted_in) | 001 |
| `item_books` | 아이템북 정의 (faction_id, reward_badge_id, is_active) | 001 |
| `poi` | 관심 지점 (위치, 반경, linked_badge_id, osm_id) | 001 |
| `factions` | 팩션(세력) 정의 | 014 |
| `combination_recipes` | 조합 레시피 (ingredient_badge_ids, result_badge_id, success_rate) | 011 |
| `missions` | 미션 정의 (type, condition_json, starts/ends_at, max_completions) | 011 |
| `user_mission_participations` | 미션 참가 기록 | 012 |
| `user_mission_completions` | 미션 완료 기록 | 011 |
| `user_activity_feed` | 활동 피드 (event_type, metadata JSONB) | 013 |
| `user_item_book_slots` | 아이템북 슬롯 장착 현황 | 017 |
| `user_item_book_completions` | 아이템북 완성 기록 | 017 |
| `user_follows` | 팔로우 관계 (follower_id, following_id) | 021 |
| `poi_drops` | 유저 주도 POI 드랍 기록 | 004 |
| `drop_events` | 이벤트성 드랍 (total/claimed_quantity) | 003 |
| `drop_claims` | 드랍 이벤트 수령 기록 | 003 |
| `abusing_policy` | 어뷰징 방어 정책 싱글톤 (id=1) | 010 |
| `user_shadow_bans` | 섀도우밴 기록 (ban_level, expires_at) | 010 |
| `poi_blocks` | POI별 유저 블록 기록 (blocked_until) | 010 |
| `abusing_logs` | 어뷰징 감지 로그 | 010 |
| `wandering_mythic_state` | 떠돌이 신화 아이템 현재 위치 상태 | 011 |

---

## 17. Strava 활동 타입 매핑

**파일:** `src/types/strava.ts` — `STRAVA_TYPE_TO_JAM`

| Strava 타입 | JAM 분류 | 뱃지/드랍 대상 |
|---|---|---|
| Ride, EBikeRide, VirtualRide, GravelRide, MountainBikeRide, Velomobile | `cycling` | ✅ |
| Run, VirtualRun, TrailRun | `running` | ✅ |
| Hike | `hiking` | ✅ |
| Walk | `walking` | ✅ |
| Swim, Yoga, Workout, WeightTraining, Elliptical, CrossFit, HIIT 등 기타 | `null` | ❌ 드랍/뱃지 평가 제외 |

JAM 분류가 `null`인 활동은 **드랍 추첨에서 제외**, 하지만 해당 활동으로 POI를 통과한 경우 POI 배지는 발급될 수 있다 (GPS 경로 매칭은 별개 처리).

---

*이 문서는 코드베이스 직접 분석 기반이며, 코드 변경 시 함께 업데이트 필요.*
