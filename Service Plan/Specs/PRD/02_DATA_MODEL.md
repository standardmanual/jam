# JAM! 유저 모바일 웹 — 데이터 모델

> 이 문서는 앱에서 다루는 핵심 데이터의 구조를 정의합니다.
> 개발자가 아니어도 이해할 수 있는 "개념적 ERD"입니다.
>
> **2026-08-06 갱신**: `jam-web/supabase/migrations/` 001~074 전수 대조로 현재 DB 상태 기준
> 재작성. 원안(2026-07-09) 대비 세계관·조합·미션·포인트·팔로우·어뷰징·드랍엔진v2·CMS 등
> 12개 도메인이 신규 추가됐고, 기존 12개 테이블 중 다수가 구조적으로 변경됨.

---

## 전체 구조 (도메인별)

```
[유저/인증]     users ─1:1─ strava_connections
                 └─1:N─ strava_activities (동기화 원본 활동 기록)

[배지]          badges (activity/item/poi) ──faction_id──> factions
                 ├─1:N─ user_activity_badges   (활동/아이템 배지, 평생 1회)
                 └─1:N─ user_poi_badge_earns   (POI 배지, 반복 획득 가능)

[인벤토리]      users ─1:1─ inventory ─1:N─ inventory_items ──badge_id──> badges
                                              └─ slotted_in ──> item_books (슬롯 장착)

[아이템북]      item_books ──faction_id──> factions
                 ├─1:N─ user_item_book_slots        (슬롯별 장착 현황)
                 └─1:N─ user_item_book_completions   (완성 기록)

[세계관]        factions ─N:M(인접)─ factions (faction_adjacency, 드랍 모멘텀용)

[POI/드랍]      poi ──category──> poi_categories
                 ├─1:N─ poi_drops (source: user | system)
                 └─연결─ badges (linked_badge_id)
                users ─1:1─ user_drop_state (드랍 모멘텀/피티 상태)
                drop_policy / ambient_drop_policy (싱글톤 파라미터)

[조합]          combination_recipes (재료 2~10개 → 결과 배지)
                combine_policy (싱글톤) / user_combine_state (유저별 피티)

[미션]          missions ─1:N─ user_mission_participations (참가+진행도)
                          └─1:N─ user_mission_completions   (완료 기록)

[포인트]        users ─1:1─ point_wallets ─1:N─ point_transactions (append-only 원장)
                point_treasury (전체 발행/회수 싱글톤 장부)

[소셜]          users ─N:M(팔로우)─ users (user_follows)
                user_activity_feed (배지/드랍/미션 이벤트 통합 피드)

[어뷰징]        abusing_policy(싱글톤) / user_shadow_bans / poi_blocks / abusing_logs

[CMS/기타]      today_cards (홈 에디토리얼) / theme_presets (어드민 컬러 테마)
                wandering_mythic_state (떠돌이 신화 아이템)
                engine_decision_log (배지·드랍 엔진 판정 로그)
```

---

## 1. 유저 / 인증

### users
Strava를 쓰는 활동가. 구글 로그인으로 가입, 이후 온보딩에서 username 설정.

| 필드 | 설명 |
|------|------|
| id | Supabase auth.users FK |
| email | 구글 계정 이메일 |
| username | 고유 닉네임 (`^[a-z0-9._]+$`, nullable — 온보딩 완료 전 null) |
| avatar_url | 프로필 이미지 |
| region | 활동 지역 |
| activity_types[] | 활동 종목 복수 선택 |
| last_location_lat/lng/at | 최근 위치 (GPS 조작 감지용) |
| initial_sync_done | 첫 Strava 동기화 시 common 등급만 발급하는 게이트 완료 여부 |

> 원안의 `display_name`은 `username`으로 rename됨.

### strava_connections
원안과 거의 동일. `access_token`/`refresh_token` 암호화 저장, `backfill_completed` 유지.

### strava_activities (신규)
동기화 원본 활동 기록. `strava_id`, `jam_activity_type`, `distance_km`, `normalized`(정규화된 활동 JSON), `processed_via`(sync/reconcile/manual_backfill). UNIQUE(user_id, strava_id)로 중복 동기화 방지 — 이기종 데이터 중복 이슈의 실제 해결책.

---

## 2. 배지

### badges
| 필드 | 설명 |
|------|------|
| type | `activity` / `item` / **`poi`**(신규 — POI 통과 시 반복 발급) |
| rarity | common / rare / legendary / mythic |
| faction_id | 소속 세계관 (아이템 배지) |
| item_book_id | 소속 아이템북 (구조 역전 — 아이템북이 배지 목록을 갖는 게 아니라 배지가 소속 아이템북을 가짐) |
| drop_weight / drop_condition_json | 드랍엔진 판정용 |
| is_wandering | 떠돌이 신화 아이템 여부 |
| valid_from / valid_until | 노출 기간 |
| point_reward | 발급 시 지급 포인트 |
| deleted_at | 소프트 삭제 |

### user_activity_badges
활동/아이템 배지 발급 기록. 평생 1회(UNIQUE user_id+badge_id). POI/Strava 트리거 메타(`triggered_by_*`) + 어드민 조회용 `condition_snapshot`(발급 당시 실측값) 포함.

### user_poi_badge_earns (신규)
POI 배지는 반복 획득 가능하므로 별도 테이블. UNIQUE(user_id, badge_id, poi_id, strava_id)로 동일 통과분 중복 방지.

---

## 3. 인벤토리

### inventory / inventory_items
원안 구조 유지(50슬롯). `inventory_items`에 추가된 것:
- `serial_number`: SERIAL(순차) → **BEFORE INSERT 트리거로 1~999,999 난수 부여**로 변경(발급 순서 역산 방지). 앰비언트 드랍 픽업분은 50,001~999,999 별도 범위.
- `slotted_in`: 아이템북 슬롯에 장착된 경우 참조 (장착 중엔 인벤토리 칸 미차감)
- `dropped_at` / `drop_id`: 드랍 후 소프트 삭제 추적

---

## 4. 아이템북

### item_books
`faction_id`로 세계관 연동, `story_text`, `is_active`, `drop_condition_json` 보유. **`required_item_badge_ids` 컬럼은 삭제됨** — 완성 조건은 이제 `badges.item_book_id`(배지→북 소속)로 역방향 관리.

### user_item_book_slots / user_item_book_completions (신규)
- `user_item_book_slots`: 인벤토리 아이템을 슬롯에 장착한 기록 (UNIQUE user+book+badge)
- `user_item_book_completions`: 완성 기록 (PK user_id+item_book_id)

---

## 5. 세계관 (faction) — 신규 도메인

### factions
10개 세계관. `name`, `tagline`, `description`, `drop_weight`, `is_active`, `sort_order`, `drop_condition_json`. 상세 컨텐츠는 [Specs/Content/FACTIONS.md](../Content/FACTIONS.md) 참고.

### faction_adjacency
세계관 간 인접 그래프 (PK: faction_id + adjacent_faction_id). 드랍엔진 v2의 "서사 모멘텀" 판정에 사용 — 상세는 [Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) §3.2 참고.

---

## 6. POI / 드랍

### poi
| 필드 | 설명 |
|------|------|
| category | ENUM → **TEXT + `poi_categories` FK로 전환** (ENUM 자체는 DROP됨) |
| poi_tier | 1=어드민 등록(T1), 2=자동 수집(T2) |
| osm_id | (구) OpenStreetMap 연동 흔적, 현재 신규 수집은 미사용 |
| naver_id | **현재 T2 자동 수집 소스** — 네이버 지역검색 오픈API 연동 키 |

> **T2 POI 데이터 소스가 OpenStreetMap → 네이버 지역검색 오픈API로 전환됨** (2026-07-22). 지도 렌더링도 Google Maps → 네이버 지도(NCP Maps.js)로 전환.

### poi_categories (신규, ENUM 대체)
`slug`(PK), `label`, `pipeline_linked`, `tier`, `keywords[]` — 드랍/픽업 파이프라인과 자동 검색 연동 메타를 코드 하드코딩에서 DB로 이전.

### poi_search_cache (신규)
네이버 지역검색 API 캐시. `grid_key`+`category` PK, TTL 관리.

### poi_drops
| 필드 | 설명 |
|------|------|
| source | **`user`**(유저 드랍) / **`system`**(앰비언트 드랍, 신규) |
| expires_at | user 드랍은 30일 만료, system 드랍은 만료 없음(NULL) |
| dropper_user_id | system 드랍은 nullable |

픽업은 `pickup_drop()` RPC로 원자 트랜잭션 처리.

### drop_events / drop_claims / drop_probability (레거시 추정)
어드민 주도 드랍 이벤트용 초기 테이블. 034(드랍엔진 v2) 이후 `drop_policy`가 사실상 후속 확장판 — 실사용 여부는 코드 확인 필요.

### user_drop_state / drop_policy (신규 — 드랍엔진 v2)
유저별 드랍 모멘텀 상태(연속 common 카운터, 마지막 조각 피티, 일일 드랍 수)와 엔진 전체 파라미터(레어리티 확률, 모멘텀/인접/탐험 가중치). 상세 로직은 [BadgeEngine 문서](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) §3 참고.

### ambient_drop_policy (신규)
유저 행동과 무관하게 시스템이 POI에 상시 배치하는 "앰비언트 드랍" 정책(레어리티 분포, POI당 최대 활성 수).

---

## 7. 조합 (combine) — 신규 도메인

### combination_recipes
`ingredient_badge_ids[]`(2~3개 → **2~10개로 확장**), `result_badge_id`(nullable — 배지 삭제돼도 레시피 보존), `success_rate`, `hint_text`, `is_public`, `required_activity_badge_id`(소모되지 않는 필수 보유 조건).

### combine_policy / user_combine_state (신규)
세계관 다양성 티어별 확률 정책(싱글톤) + 유저별 연속 실패 피티 카운터.

> 조합 시스템은 v1(2026-07 초 계획) → v2(2026-07-27 재설계, "정석 레시피/재료 정확 매칭")로 갈아엎어짐. 현재 상세는 [Specs/Content/COMBINE_RECIPES.md](../Content/COMBINE_RECIPES.md) 참고.

---

## 8. 미션 — 신규 도메인

### missions
`mission_type`(distance/poi_visit/activity_count/item_collect), `condition_json`, `reward_type`(nullable — 배지+포인트 동시 구성 가능), `reward_badge_ids[]`(복수 배지 보상), `reward_points`, `starts_at/ends_at`, `max_completions`, `status_display_type`(ranking/achievement), `visible_rank_count`.

### user_mission_participations / user_mission_completions
참가(진행도 추적)와 완료를 별도 테이블로 관리. "참가 필수·취소 불가" 정책 — 참가자만 완료 보상 대상.

---

## 9. 포인트 (JAM 포인트) — 신규 도메인

### point_wallets
유저당 1개. `balance`는 원장(point_transactions)에서 파생된 캐시값 — 직접 UPDATE 금지.

### point_transactions
append-only 원장. `reason`: `badge_point_reward` / `mission_point_reward` / `admin_grant` / `admin_deduct` / `combine_pity_reward`.

### point_treasury
전체 발행/회수 총량 싱글톤 장부 — 어드민에서 유통량·월렛합·원장합 정합성 검사에 사용.

> 잔액 변경은 전부 `award_points()` RPC(SECURITY DEFINER, service_role 전용)로만 원자 처리.

---

## 10. 소셜

### user_follows (신규)
`follower_id`/`following_id`, UNIQUE + 자기 팔로우 방지 CHECK.

### user_activity_feed (신규)
배지 획득·아이템 드랍·픽업·미션 참가/완료 이벤트를 통합한 피드. `event_type` ENUM, `metadata JSONB`.

---

## 11. 어뷰징/정책 (신규)

| 테이블 | 역할 |
|---|---|
| abusing_policy | 싱글톤. 섀도우밴 등급별 드랍률 배율, GPS 최대 속도, POI 재방문 차단시간, 차량 탑승 속도 필터 |
| user_shadow_bans | soft/hard 밴 등급 + 만료시각 |
| poi_blocks | 유저×POI 단위 72시간 재방문 차단 |
| abusing_logs | GPS 조작 감지 등 이벤트 로그 |

---

## 12. CMS / 운영 (신규)

| 테이블 | 역할 |
|---|---|
| today_cards | 홈 "투데이" 에디토리얼 카드. 템플릿 7종, 노출 기간·태그·레이아웃 관리 |
| theme_presets | 어드민 컬러 테마 프리셋(활성 1개만 유지) |
| wandering_mythic_state | 떠돌이 신화 아이템의 현재 POI/보유자/만료(72h)/포획 횟수 |
| engine_decision_log | 배지·드랍 엔진의 판정 사후 추적 로그 (RLS 적용) |

---

## 원안(2026-07-09) 12개 테이블 대비 변경 요약

| 원안 | 현재 |
|---|---|
| User | `users` — `display_name`→`username`, GPS/온보딩 컬럼 추가 |
| StravaConnection | `strava_connections` — 거의 원형 유지 |
| Badge | `badges` — faction/point/soft-delete 등 대폭 확장, `type`에 `poi` 추가 |
| UserActivityBadge | `user_activity_badges` — 트리거 메타·발급 스냅샷 추가 |
| Inventory | `inventory` — 거의 원형 |
| InventoryItem | `inventory_items` — 일련번호 랜덤화, 슬롯 참조 추가 |
| POI | `poi` — category ENUM→FK 전환, OSM→네이버 데이터 소스 전환 |
| ItemBook | `item_books` — `required_item_badge_ids` 삭제, 소유 관계 역전(badges → item_book_id) |
| PoiDrop | `poi_drops` — `source`(user/system) 분기로 앰비언트 드랍 흡수 |
| DropEvent | `drop_events` — 스키마 변경 없이 잔존 (실사용 여부 별도 확인 필요) |
| DropProbability | `drop_probability` — 잔존하나 `drop_policy`가 사실상 후속 확장판 |
| Trade | `trades` — 스키마 변경 없이 잔존. **`inventory/flea-market` 화면은 "coming soon" placeholder로, 실제 거래 기능 미구현** (2026-08-06 코드 확인) |

---

## 왜 이 구조인가

**배지 이원화 (ActivityBadge vs ItemBadge) + POI 배지 분리**
- 액티비티 배지는 영구 귀속(정체성), 아이템 배지는 거래 가능(경제), POI 배지는 반복 획득(방문 인증) — 세 가지 획득 패턴이 근본적으로 달라 발급 테이블을 분리 유지.

**아이템북 소유 관계 역전**
- 원안은 `item_books.required_item_badge_ids`(북이 배지 목록을 가짐)였으나, 세계관 연동과 슬롯 장착 UX가 추가되며 `badges.item_book_id`(배지가 소속 북을 가짐) 구조로 역전. 배지 하나가 정확히 하나의 북에만 속하는 현재 컨텐츠 구조(세계관 10개 = 아이템북 10개, 각 90종)와 더 잘 맞음.

**포인트를 append-only 원장으로**
- `point_wallets.balance`는 캐시일 뿐, 실제 진실은 `point_transactions`. 정합성 검증(어드민 `points` 화면의 유통량 대사)과 감사 추적을 위해 잔액을 직접 UPDATE하지 않고 RPC로만 변경.

**드랍엔진 상태를 유저별 테이블로 분리 (user_drop_state)**
- 모멘텀·피티 로직이 이전 드랍 결과에 의존하므로, 매 판정마다 히스토리 전체를 조회하는 대신 상태를 캐시해 원자적으로 갱신.

---

## [NEEDS CLARIFICATION]

- [x] `drop_events`/`drop_claims`/`drop_probability`(어드민 주도 이벤트형 드랍)가 `drop_policy`(드랍엔진 v2) 도입 후에도 실제 코드에서 호출되는지 — **레거시 확정** (2026-08-07 코드 확인). `lib/drop/pickup.ts`가 `drop_events`/`drop_claims`를 참조하나 `processDropPickups` 함수가 `src/` 전체에서 호출되지 않아 완전한 데드코드. `drop_probability`는 `database.ts` 타입 정의에만 존재하고 실사용 없음. 세 테이블 모두 드랍엔진 v2(`drop_policy`/`user_drop_state`) 도입 이후 미사용 레거시로 판정.
- [x] `trades` 테이블 + `inventory/flea-market` 화면의 실제 개발 착수 시점 — **미정** (2026-08-07 확정). 착수 결정 시 별도 티켓 생성 예정. 현재 `trades` 스키마는 001 마이그레이션 이후 변경 없이 방치 상태.
- [x] `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` 환경변수가 `.env.local`에는 있으나 코드에서 미사용 — **마이그레이션 미착수, 당장 불필요** (2026-08-07 코드 확인). `src/` 전체에서 두 키를 참조하는 코드 없음. 현재 클라이언트 초기화(`lib/supabase/server.ts`, `client.ts`)는 기존 JWT 키 체계(`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`)로만 작동. `.env.local`의 `sb_publishable_*`/`sb_secret_*` 값은 미사용 환경변수로만 남아 있으며 서비스에 영향 없음. Supabase가 JWT 키를 deprecated할 경우 클라이언트 라이브러리 업그레이드와 함께 마이그레이션 필요.
- [ ] `poi_categories.pipeline_linked`/`tier`/`keywords[]`의 정확한 운영 기준 문서화 필요 (현재는 코드/DB에만 존재)
- [ ] `user_activity_feed`의 공개 범위 정책 — 공개/비공개/팔로우 공개/전체공개 4단계 체계 **수립 예정** (2026-08-07). 현재 본인·타인 프로필 양쪽에서 동일 테이블을 사용하나 RLS·쿼리 레벨의 공개 범위 필터링이 미정의. 체계 확정 시 이 섹션 + [01_PRD.md](01_PRD.md) 동시 업데이트 필요.
- [ ] `wandering_mythic_state`의 유저 대면 UI 완성도 — DB 스키마·Cron(`/api/cron/wandering`)은 구현됐으나 인벤토리·배지 상세·별도 화면 중 어느 지점에서 노출할지 **추가 설명 대기** (2026-08-07)
