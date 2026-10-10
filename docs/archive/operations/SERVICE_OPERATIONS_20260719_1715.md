# JAM! 서비스 운영 로직 전체 정리

> **이 버전의 변경 내용:** 유저 초기화 API FK 순서 버그 수정 + 아이템배지 faction_id 누락 마이그레이션 추가  
> 이전 버전: SERVICE_OPERATIONS_20260718_1200.md

---

## 변경된 섹션

### 11. 어드민 — 유저 초기화 API (버그 수정)

```
파일: src/app/api/admin/users/[id]/reset/route.ts

[버그] 증상:
  - 어드민에서 유저 초기화 실행 시
    "update or delete on table 'poi_drops' violates foreign key constraint
     'inventory_items_drop_id_fkey' on table 'inventory_items'" 오류 발생

[원인]
  - drops/route.ts에서 유저가 POI에 아이템을 드랍할 때
    inventory_items.drop_id = poi_drops.id (FK) 를 설정함
  - 기존 초기화 로직: poi_drops 삭제 → inventory_items 삭제 순서
  - inventory_items.drop_id가 poi_drops.id를 참조 중인 상태에서
    poi_drops를 먼저 삭제하면 FK 위반 발생

[수정] 삭제 순서 재조정:
  1단계 (선행): inventory_items 삭제 + used_slots 리셋
  2단계 (병렬): poi_drops 삭제 + user_activity_badges, user_activity_feed,
               user_mission_completions, user_mission_participations,
               user_follows 삭제

[추가 수정] poi_drops 픽업 초기화 시 is_available = true 도 함께 복구
  - 기존: picked_up_by = null, picked_up_at = null 만 초기화
  - 수정: is_available = true 추가 → 해당 드랍을 다시 픽업 가능 상태로 복구

유지 항목: users, strava_connections (계정·연동 정보 보존)
```

### 12. DB 마이그레이션 — 아이템배지 faction_id 누락 보정 (신규)

```
파일: supabase/migrations/026_fix_badge_faction_id.sql

[배경]
  - 019_seed_worldview.sql에서 900개 아이템배지 INSERT 시
    컬럼 목록: (name, description, type, rarity, item_book_id, drop_weight)
    faction_id 누락 → 모든 신규 아이템배지의 faction_id = NULL 상태

[수정 SQL]
  UPDATE public.badges b
  SET faction_id = ib.faction_id
  FROM public.item_books ib
  WHERE b.item_book_id = ib.id
    AND b.faction_id IS NULL
    AND b.type = 'item';

[적용 방법] Supabase SQL Editor에서 직접 실행 필요
[영향 범위] item_book_id가 설정된 모든 item 타입 배지 (최대 900개)

검증 쿼리:
  SELECT COUNT(*) FROM badges
  WHERE type = 'item' AND item_book_id IS NOT NULL AND faction_id IS NULL;
  → 0이면 정상
```

---

## 누적 서비스 상태 요약 (전체)

> 이전 버전 내용 포함 전체 누적 요약입니다.

### 1. 인증 / 온보딩

- 구글 OAuth 로그인 → Supabase Auth
- 회원가입 시 users 테이블 자동 생성 (trigger)
- 온보딩: username 설정 필수 (미설정 시 서비스 진입 차단)
- Strava 연동: OAuth2 → strava_connections 저장 (토큰 AES-256 암호화)

### 2. Strava 동기화 (sync.ts)

```
syncStravaActivities(userId) 순서:
  1. strava_connections 조회 + 토큰 유효성 확인 (만료 시 자동 갱신)
  2. last_synced_at 이후 활동만 조회
  3. NormalizedActivity 변환
  4. POI 매칭 (GPS Streams API → 반경 50m 교차)
  5. 차량 속도 필터 (기본 60km/h, abusing_policy에서 설정)
  6. 아이템 드랍 시도 (speed-filtered 활동 기준)
  7. 배지 엔진 호출 (evaluateBadges)
  8. 아이템북 완성 체크
  9. 다이나믹 미션 달성 체크
  10. last_synced_at 업데이트
```

### 3. 아이템 드랍 엔진 (drop-engine/index.ts)

```
tryItemDrop(userId, activityType, activities) 순서:
  1. rarity 추첨 (common 40% / rare 25% / legendary 10% / mythic 5% / 없음 20%)
  2. 섀도우밴 레벨 확인 → 고가치 드랍 차단 가능
  3. badges 조회: type='item', rarity 일치, valid_from/valid_until 필터
  4. condition_json 필터 (checkCondition으로 평가)
  5. drop_weight 기반 가중 랜덤 선택
  6. 인벤토리 슬롯 확인 (초과 시 드랍 취소)
  7. inventory_items INSERT (obtained_by='drop', expires_at=badge.valid_until)
  8. used_slots +1
  9. 피드 이벤트 기록 (item_dropped)
```

### 4. 배지 발급 엔진 (badge-engine/index.ts)

```
evaluateBadges(userId, activities) 순서:
  1. type='activity' 배지 전체 조회 (valid_from/valid_until 필터)
  2. 보유 배지 조회 → 성장 티어(이름별 최고 rarity) 파악
  3. 조건 평가 (checkCondition): 빈 condition_json 또는 {} → 자동 제외
  4. 이름당 최상위 rarity 1개만 발급
  5. user_activity_badges INSERT
  6. 피드 이벤트 기록 (badge_earned)

[빈 조건 방어] condition_json이 null 또는 {} → 발급 제외 (보안)

checkCondition() 지원 조건 타입:
  distance_km, total_count, elevation_gain_m, min_speed_kmh,
  streak_days, duration_minutes, weekend_duration_hours,
  weekly_count, month+monthly_km, season+season_count
  미구현: temperature_*, poi_id (false 반환)
```

### 5. POI 시스템

```
- POI 반경 50m 내 활동 GPS 경로 교차 시 POI 배지 자동 발급
- linked_badge_id 설정된 POI만 배지 발급 대상
- 중복 발급 방지: user_activity_badges 기존 보유 확인
- 유저 드랍/픽업: poi_drops 테이블 관리
  · 드랍: inventory_items.dropped_at + drop_id = poi_drops.id 설정
  · 픽업: pickup_drop RPC (원자 트랜잭션), obtained_by='pickup'
  · GPS 조작 감지: 이전 위치와 이동 속도 계산 → 임계값 초과 시 soft ban + POI 블록
```

### 6. 아이템북 / 세계관 (Phase 8)

```
구조: factions(세계관) → item_books(아이템북) → badges(아이템배지)

- 10개 세계관 + Public (019_seed_worldview.sql)
- 각 세계관 10개 아이템북, 아이템북당 최대 9개 배지 슬롯
- badges.faction_id: 소속 세계관 (026 마이그레이션으로 보정 완료 예정)
- badges.item_book_id: 소속 아이템북 (1배지:1아이템북 전속)
- 슬로팅: inventory_items.slotted_in → user_item_book_slots 참조
- 완성: user_item_book_completions (최초 1회만 기록)
```

### 7. 어뷰징 방어

```
- 차량 속도 필터: abusing_policy.vehicle_speed_filter_kmh (기본 60)
- 섀도우밴: getUserBanLevel() → shouldAllowDrop()으로 드랍 차단
- GPS 조작 감지: 연속 위치 간 이동속도 계산 → 임계값 초과 시 soft ban
- POI 블록: GPS 조작 감지 후 해당 POI 일시 접근 차단
```

### 8. 유효기간 시스템

```
- badges.valid_from / valid_until (025 마이그레이션)
- 드랍 엔진: valid_from ≤ now ≤ valid_until 인 배지만 드랍 풀에 포함
- 배지 엔진: 동일 조건 필터 적용
- inventory_items.expires_at = badge.valid_until (배지 만료일 상속)
```

### 9. 피드 / 소셜

```
- user_activity_feed: item_dropped, badge_earned, item_picked_up 이벤트
- user_follows: 팔로우/팔로잉 관계
- 피드 필터: 전체 / 팔로잉 / 배지 탭
```

### 10. 어드민

```
주요 기능:
- 배지 CRUD (activity/item, condition_json, valid_from/valid_until, faction_id)
- 아이템북 관리 (faction_id, story_text, is_active, 배지 슬롯 관리)
- 세계관(faction) 관리
- 유저 관리 + 초기화 (배지·아이템·미션·피드·POI드랍·팔로우 삭제)
- 어뷰징 관리 (섀도우밴, GPS 조작 로그, POI 블록)
- 드랍 시뮬레이터
```

### 11. 어드민 — 유저 초기화 API

```
POST /api/admin/users/[id]/reset

삭제 순서 (FK 의존성 고려):
  1단계 (선행): inventory_items 삭제 + used_slots 리셋
  2단계 (병렬): user_activity_badges, user_activity_feed, poi_drops(dropper),
               poi_drops 픽업 초기화(is_available=true 복구),
               user_mission_completions, user_mission_participations,
               user_follows

유지: users, strava_connections
```
