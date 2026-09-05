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

[배지]          badges (activity/item/checkin) ──faction_id──> factions
                 ├─1:N─ user_activity_badges      (활동/아이템 배지, 행은 1개 · 반복 획득은 earn_count 누적)
                 └─1:N─ user_checkin_badge_earns  (체크인 배지, 반복 획득 가능)

[인벤토리]      users ─1:1─ inventory ─1:N─ inventory_items ──badge_id──> badges
                                              └─ slotted_in ──> item_books (슬롯 장착)

[컬렉션]        item_books ──faction_id──> factions
                 ├─1:N─ user_item_book_slots        (슬롯별 장착 현황)
                 └─1:N─ user_item_book_completions   (완성 기록)

[세계관]        factions ─N:M(인접)─ factions (faction_adjacency, 드랍 모멘텀용)

[POI/드랍]      poi ──category──> poi_categories
                 ├─1:N─ poi_drops (유저 드랍)
                 └─연결─ badges (linked_badge_id)
                users ─1:1─ user_drop_state (드랍 모멘텀/피티 상태)
                drop_policy (싱글톤 파라미터)

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
| display_name | 자유 형식 표시 이름 (nullable, 1~30자, 형식 제한 없음). 화면에서 username이 노출되던 위치는 이 값이 있으면 이 값을, 없으면 username을 대신 노출(표시 전용 폴백 — DB에 복사해 채우지 않음). 프로필 편집 화면에서만 설정 가능, 필수 아님, 수정 횟수 제한 없음 (티켓 20260830_0113) |
| avatar_url | 프로필 이미지 |
| region | 활동 지역 |
| activity_types[] | 활동 종목 복수 선택 |
| last_location_lat/lng/at | 최근 위치 (GPS 조작 감지용) |
| initial_sync_done | 첫 Strava 동기화 시 common 등급만 발급하는 게이트 완료 여부 |

> 원안의 `display_name`(당시엔 유일한 이름 필드)은 `username`으로 rename됐었으나,
> 2026-08-30(티켓 20260830_0113)에 `display_name`이 **별도의 표시 전용 필드**로
> 재도입됨 — 지금은 `username`(로그인 식별자·URL 슬러그)과 `display_name`(자유 형식
> 노출 이름, 없으면 username 폴백)이 공존한다.

### strava_connections
원안과 거의 동일. `access_token`/`refresh_token` 암호화 저장, `backfill_completed` 유지.

### strava_activities (신규)
동기화 원본 활동 기록. `strava_id`, `jam_activity_type`, `distance_km`, `normalized`(정규화된 활동 JSON), `processed_via`(sync/reconcile/manual_backfill). UNIQUE(user_id, strava_id)로 중복 동기화 방지 — 이기종 데이터 중복 이슈의 실제 해결책.

`normalized`의 구조는 `NormalizedActivity`(`src/types/strava.ts`)다. 2026-09-05부터 v5 확장
6필드(심박·파워·케이던스·최고속도·최고도달고도·경과시간)가 함께 저장되며, **측정값이 없으면
키 자체가 없다**(`null`이 아니다 — 티켓 20260905_0029). 컬럼 변경은 없다(jsonb).
`processed_via = 'manual_backfill'`은 그 확장 필드를 소급 채운 행을 뜻한다
(`scripts/backfill-strava-extended-fields.ts`). `'reconcile'`은 2026-08-10 이전 과거 데이터에만
있고 신규 기록은 없다.

---

## 2. 배지

### badges
| 필드 | 설명 |
|------|------|
| type | `activity` / `item` / **`poi`**(신규 — POI 통과 시 반복 발급) |
| rarity | common / rare / epic / mystic. **nullable** — NULL이면 무한레벨형이며, 이것이 v5의 **유일한** 배지 종류 판정 기준이다(별도 `badge_kind` 컬럼을 두지 않는다 — 판정 기준이 둘이면 서로 어긋난다). `CHECK ((rarity IS NULL) = (level IS NOT NULL))`이 강제한다 |
| level | 무한레벨형의 레벨(Lv.1~∞). 등급형은 NULL. `level >= 1` |
| family_key | 계열 식별자. 이름 문자열 대신 쓰는 안정적인 키. 활동 배지에만 채운다 |
| sort_order | 표시 순서(오름차순). 계열 레일 1~99(계열 안 모든 등급이 같은 값을 공유) / 독립 발급 배지 101~ . **`0`은 «아직 설정하지 않음»이며 화면에서 맨 뒤로 밀린다** — 저장소의 다른 `sort_order`(`today_cards`·`factions`·`item_books`)는 0이 앞이라는 반대 관습이므로, 배지에 한해 이 규약을 따른다 |
| faction_id | 소속 세계관 (아이템 배지) |
| item_book_id | 소속 컬렉션 (구조 역전 — 컬렉션이 배지 목록을 갖는 게 아니라 배지가 소속 컬렉션을 가짐) |
| drop_weight / drop_condition_json | 드랍엔진 판정용 |
| valid_from / valid_until | 노출 기간 |
| point_reward | 발급 시 지급 포인트 |
| deleted_at | 소프트 삭제 |
| background_color | 배지 상세화면 배경 테마 컬러(nullable). `background_image_url`이 없을 때만 렌더링에 쓰임. 어드민에서 이미지 업로드 시 평균 컬러 자동 프리필 + 수동 오버라이드 가능(20260818_003). TopNav·히어로카드·고정 배경 레이어에 실제 렌더링됨 |
| background_shader_id | 배지 상세화면 배경 쉐이더 식별자(nullable). 어드민에 선택 UI는 있으나(20260818_003, placeholder 목록) **렌더링에는 미연결** — 값이 있어도 무시됨. `background_image_url` 도입(20260819_008) 이후 이 컬럼을 통한 실시간 쉐이더 렌더링 경로는 채택되지 않음 — 사실상 레거시 |
| background_image_url | 배경 제너레이터(패턴/애니메이션 + Paper 셰이더 필터 합성)로 만든 배경을 어드민에서 static PNG로 구워(bake) Storage에 올린 뒤 저장하는 URL(nullable, 20260819_008). **`background_color`보다 우선 렌더링**됨(`getBadgeBackgroundStyle`) — 값이 있으면 이 이미지를, 없으면 `background_color`로 폴백. `background_color`와 상호 배타적으로 쓰임(어드민에서 저장 시 반대쪽을 null로 정리, DB 제약 아님). 원시 설정값(이미지·패턴/애니메이션 파라미터·필터 종류)은 저장하지 않음 — 재편집 가능한 설정이 아니라 완성된 이미지 1장 |
| background_animation | 배지 상세화면 **이미지 카드 안**에서 라이브 실행하는 블롭 애니메이션 파라미터(jsonb, nullable, 20260901_1944). 위 세 배경 컬럼과 **렌더링 지점이 다르다** — 전체 배경 레이어가 아니라 430×430 Hero 카드 내부의 `<canvas>`다. 영상 배경(`background_video_url`)과 달리 파일을 굽지 않고 파라미터만 저장해 재편집이 가능하다. 값 형태는 `{ type: 'blob', colors: [4색], bgColor, speed, seed, blur, scale }`이며, jsonb라 스키마 검증이 없어 `parseBlobAnimation`이 관용적으로 정규화한다(형식이 어긋나면 `null` = 애니메이션 없음). **렌더링 우선순위 최상위** — 아래 «배경 렌더링 우선순위» 참고 |
| category | 체크인 배지(`type==='checkin'`) 전용 지점 카테고리 오버라이드(nullable text, `poi_categories.slug` FK, `ON DELETE SET NULL`, 20260830_1344). 값이 있으면 연결된 지점의 `poi.category`보다 우선해 어드민 목록·공개 배지함의 분류 기준이 되고, `null`이면 `poi.category`로 폴백한다(20260830_1522). 체크인 외 타입은 서버에서 항상 `null`로 강제 |

#### 배경 렌더링 우선순위

badges / item_books / factions 세 테이블이 같은 배경 컬럼 세트를 갖고, 판정은 전부
`src/lib/badgeBackgroundTheme.ts` **한 곳**에서 한다(호출부가 우선순위를 각자 해석하지 않는다).

**`background_animation` > `background_image_url` > `background_color`**

- `background_animation`이 있으면 전체 배경 레이어를 **통째로 비운다** — CSS 배경(`getBadgeBackgroundStyle`),
  반복 영상(`getBadgeBackgroundVideoUrl`), TopNav·본문 투명 판정(`hasBadgeBackgroundTheme`) 세 함수가
  모두 "배경 없음"으로 답하고, 애니메이션은 Hero 카드 안에서만 그려진다.
- 애니메이션이 없으면 `background_image_url`(구워둔 정적 PNG), 그것도 없으면 `background_color` 순.
- `background_shader_id`는 값이 있어도 항상 무시된다(레거시).

**캐스케이드는 영상·이미지를 복사도 삭제도 하지 않는다.** 어드민 "하위에 일괄 적용"은
`background_color` + `background_animation` 2필드만 복사한다(아래 §4·§5). 그 결과 하위 엔티티는
"부모의 애니메이션 + 자기 예전 영상/이미지"라는 상태로 남을 수 있는데, 제너레이터가 제거돼
(20260901_1929) 다시 만들 수 없는 값이라 파괴적으로 지우지 않고 **위 렌더링 우선순위로 충돌을
막는다**. 애니메이션을 해제하면 예전 배경이 그대로 되살아난다. 이 규칙을 세 함수 중 일부에만
적용하면 레이어가 절반만 비워져(CSS는 비었는데 영상은 재생) 화면 전체 MP4와 카드 안 블롭이 동시에
도는 상태가 된다 — 실제로 20260901_1944 게이트 FAIL이 이 부분 적용에서 나왔다.

### user_activity_badges
활동/아이템 배지 발급 기록. **행은 유저·배지당 1개**(UNIQUE user_id+badge_id)이고, 같은 배지를 여러 번 받는 반복 획득은 행을 늘리는 대신 `earn_count`를 올린다. 지점(POI)/Strava 트리거 메타(`triggered_by_*`) + 어드민 조회용 `condition_snapshot`(발급 당시 실측값) 포함.

| 필드 | 설명 |
|------|------|
| earn_count | 획득 총 횟수. 최초 발급이 1 |
| earn_history | 회차별 획득 이력(jsonb 배열). 원소는 `earned_at` + 근거 활동(`strava_activity_id` 또는 `poi_id`). **`earn_count = jsonb_array_length(earn_history)` 불변식**을 마이그레이션 130에서 백필로 성립시켰다. ⚠️ JSONB라 FK가 없다 — 근거 활동이 삭제되면 참조가 끊긴 채 남는다 |

> UNIQUE를 해제하고 행을 쌓는 방식(선례: `user_checkin_badge_earns`)은 검토 후 미채택했다 —
> «보유 여부»를 행 1개 전제로 판정하는 코드가 33개 파일에 퍼져 있어 전수 점검 비용이
> 이력 보존의 이득을 넘는다(티켓 20260905_0027).

### user_checkin_badge_earns (신규)
체크인 배지는 반복 획득 가능하므로 별도 테이블. UNIQUE(user_id, badge_id, poi_id, strava_id)로 동일 통과분 중복 방지.

> 2026-08-26(티켓 20260826_004)에 `user_poi_badge_earns`에서 개명. `poi_id` 컬럼은 지점 참조라
> 이름을 유지한다. 같은 티켓에서 `badge_type` `'poi'` → `'checkin'`,
> `notification_type` `'poi_badge_earned'` → `'checkin_badge_earned'`,
> `missions.mission_type` `'poi_visit'` → `'checkin'`으로 함께 개명됐다.

---

## 3. 인벤토리

### inventory / inventory_items
원안 구조 유지(50슬롯). `inventory_items`에 추가된 것:
- `serial_number`: SERIAL(순차) → **BEFORE INSERT 트리거로 1~999,999 난수 부여**로 변경(발급 순서 역산 방지). 앰비언트 드랍(배치 시점에 선발급된 개체, `obtained_by='ambient_drop'`)만 50,001~999,999로 제한하는 분기가 `assign_random_serial()`에 있다.
- `slotted_in`: 컬렉션 슬롯에 장착된 경우 참조 (장착 중엔 인벤토리 칸 미차감)
- `dropped_at` / `drop_id`: **레거시 컬럼** — 2026-08-29(티켓 20260829_2101) 이전에 드랍된
  과거 데이터에만 값이 남아 있다. 그 시점부터 유저 드랍은 이 컬럼을 더 이상 쓰지 않고
  `poi_drops.inventory_item_id`로 소유권 이전을 추적한다(아래 poi_drops 참고).
- `inventory_id`: **nullable** (2026-08-29). NULL = 현재 소유자 없음 — `poi_drops`가 이
  개체를 참조 중이면 Dropped/AtPoi, 아니면(계정 탈퇴로 소유자를 잃음) Orphaned. FK는
  `ON DELETE SET NULL`(과거 `ON DELETE CASCADE`였다 — 계정 탈퇴 시 개체가 하드 삭제되지
  않고 Orphaned로 보존되도록 전환됨).
- `destroyed_at`: **신규(2026-08-29)** — 개체 파괴(조합 소모/미픽업 만료) 소프트 삭제 시점.
  `assign_random_serial()`의 유니크 체크가 `destroyed_at IS NULL` 조건으로 좁혀져, 파괴된
  개체의 번호만 재사용 가능한 풀로 돌아간다.

### custody_events (신규, 2026-08-29 — 티켓 20260829_2101)
`InventoryItem` 한 개체의 점유(custody) 변화 이력(append-only). `Minted`/`UserDrop`/
`Pickup`/`Expire`/`Slot`/`Unslot`/`Consume`/`Orphan` 8종. `from_user_id`/`to_user_id`/
`actor_user_id`는 라이브 FK(`ON DELETE SET NULL`) + `*_username` 스냅샷을 함께 가진다 —
계정 탈퇴로 FK가 비어도 스냅샷은 남는다. 계정 탈퇴 시 `Orphan` 이벤트는 앱 로직이 아니라
`BEFORE DELETE ON public.users` 트리거(`log_orphan_custody_events()`)로 기록된다. 상세는
[BadgeEngine 문서](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) §3.5-1 참고. 어드민 조회 화면은
별도 티켓([20260829_2139](../../Tickets/20260829_2139_Admin_아이템배지-발급현황-이력조회-화면.md)).

---

## 4. 컬렉션

### item_books
`faction_id`로 세계관 연동, `story_text`, `is_active`, `drop_condition_json` 보유. **`required_item_badge_ids` 컬럼은 삭제됨** — 완성 조건은 이제 `badges.item_book_id`(배지→북 소속)로 역방향 관리.

`background_color`/`background_shader_id`(20260818_004, 컬렉션 상세 배경 테마용) 외에
`background_image_url`/`background_video_url`(nullable, 20260819_013),
`background_animation`(jsonb nullable, 20260901_1944) 보유 — badges 테이블과 동일 패턴이며
우선순위도 §2의 «배경 렌더링 우선순위»와 동일하다. `/collections/[id]` 상세화면에 배지 상세와
동일한 단일 고정 배경 레이어로 렌더링되고(20260819_014), `background_animation`은 그 레이어가
아니라 대표 이미지 카드 **안**에서 실행된다.

어드민 "하위에 일괄 적용" 버튼은 컬렉션 자신의 **`background_color` + `background_animation`
2필드**를 소속 배지(`item_book_id` 일치, 소프트 삭제 제외) 전체에 1회성으로 복사한다 — 실시간
fallback이 아니며 항상 덮어쓴다. 예전에는 4필드 스냅샷을 복사했으나, 마이그레이션 121
(20260901_1929)에서 배경 제너레이터·쉐이더가 제거되며 `background_color` 1필드로 줄었고,
20260901_1944에서 `background_animation`이 더해져 지금은 2필드다. 배경색과 애니메이션은 저작
화면에서 배타로 선택되므로 **둘을 함께 복사해야** 하위 배지의 모드가 부모와 정확히 일치한다
(한쪽만 복사하면 애니메이션 → 배경색 전환이 하위에 반영되지 않는다).

### user_item_book_slots / user_item_book_completions (신규)
- `user_item_book_slots`: 인벤토리 아이템을 슬롯에 장착한 기록 (UNIQUE user+book+badge)
- `user_item_book_completions`: 완성 기록 (PK user_id+item_book_id)

---

## 5. 세계관 (faction) — 신규 도메인

### factions
10개 세계관. `name`, `tagline`, `description`, `drop_weight`, `is_active`, `sort_order`, `drop_condition_json`. 상세 컨텐츠는 [Specs/Content/FACTIONS.md](../Content/FACTIONS.md) 참고.

`background_color`/`background_shader_id`(20260818_004) 외에 `background_image_url`/`background_video_url`
(nullable, 20260819_013), `background_animation`(jsonb nullable, 20260901_1944) 보유. 세계관 자체는
서비스 공개 상세 페이지가 없어 이 값이 직접 렌더링되지는 않음 — 소속 컬렉션·배지 전체로 캐스케이드
일괄 적용하기 위한 마스터 값 저장용.

캐스케이드는 컬렉션과 동일하게 **`background_color` + `background_animation` 2필드**만 복사하며,
영상·이미지는 복사도 삭제도 하지 않는다(§2 «배경 렌더링 우선순위» 참고).

`PUT /api/admin/factions/[id]`는 부분 body 병합을 지원한다(20260827_005) — body에 없는(=`undefined`)
필드는 기존 DB 값을 그대로 유지하고, body에 명시적으로 포함된 필드만 갱신한다. 인접 세계관만 저장하는
`AdjacencyEditor.tsx`처럼 일부 필드만 담아 호출하는 화면도 안전하게 이 엔드포인트를 재사용할 수 있다.

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
| linked_badge_id | 연결된 체크인 배지(1:1). **배지가 소프트 삭제(`badges.deleted_at`)돼도 이 FK는 정리되지 않는다** — 배지를 삭제해도 POI 쪽 연결은 그대로 남는다. 화면에서 연결 배지 이름을 표시할 때는 반드시 `badges.deleted_at`도 함께 조회해 비활성화 여부를 구분해야 한다(누락 시 삭제된 배지 이름이 계속 노출되는 버그가 됨 — 20260830_1547) |

> **T2 POI 데이터 소스가 OpenStreetMap → 네이버 지역검색 오픈API로 전환됨** (2026-07-22). 지도 렌더링도 Google Maps → 네이버 지도(NCP Maps.js)로 전환.

### poi_categories (신규, ENUM 대체)
`slug`(PK), `label`, `pipeline_linked`, `tier`, `keywords[]` — 드랍/픽업 파이프라인과 자동 검색 연동 메타를 코드 하드코딩에서 DB로 이전.

| 필드 | 운영 기준 |
|------|------|
| `pipeline_linked` | `true`인 카테고리만 자동 검색 대상으로 로드된다. `false`는 수동 등록 전용 |
| `tier` | 1 = 매 요청마다 검색 / 2 = 티어1 결과가 반경 500m 내 3건 미만일 때만 보조 검색. 1·2가 아니면 검색에서 제외 |
| `keywords[]` | 네이버 지역검색 쿼리 문자열. **검색 결과의 카테고리는 그 키워드를 소유한 슬러그로 고정**되며, POI 이름은 판정에 쓰이지 않는다 |

> **카테고리를 새로 만들 때 주의**: `slug`는 `^[a-z][a-z0-9_]*$`만 허용(한글 불가, 라벨로 표기).
> 배지 발급 근거가 되는 카테고리라면 `src/lib/poi/radius-policy.ts`의
> `EXACT_MATCH_RADIUS_BY_CATEGORY`에 반경을 **반드시 함께 등록**해야 한다 — 누락 시 기본
> 500m가 적용돼 오탐이 발생한다(20260811_006). 또한 `poi.category`는 `poi_categories.slug`를
> 참조하는 FK(ON UPDATE CASCADE / ON DELETE RESTRICT)라 **카테고리 행을 먼저 INSERT**해야
> POI를 옮길 수 있고, 소속 POI가 남아 있는 카테고리는 삭제되지 않는다.
>
> 2026-08-24 기준 배지 연결 카테고리: `train_subway`(기차/지하철) 929개 · `mountain`(산) 847개는
> POI와 배지가 1:1 일치, `transit`(대중교통) 69개 중 22개만 배지 연결([[20260824_023]]).

### poi_search_cache (신규)
네이버 지역검색 API 캐시. `grid_key`+`category` PK, TTL 관리.

### poi_drops
| 필드 | 설명 |
|------|------|
| source | `'user'` 또는 `'system'`. 유저 드랍/앰비언트(시스템) 드랍을 구분한다. 2026-08-25~26에 앰비언트가 한 차례 제거됐다가([20260825_004](../../Tickets/20260825_004_Feature_앰비언트-드랍-기능-제거.md)) 재도입됐다([20260826_009](../../Tickets/20260826_009_BadgeEngine_앰비언트-POI-드랍-재도입.md)) — 그 사이엔 전 행이 `'user'`였다 |
| inventory_item_id | **신규(2026-08-29, 티켓 20260829_2101)** — 이 드랍이 가리키는 실제 개체(`inventory_items`). `source` 무관하게 항상 **이미 발급된** row를 참조한다(픽업은 소유권 이전일 뿐 재발급이 아니다). 마이그레이션 이전에 완료된(픽업 종료) 과거 드랍은 소급 연결되지 않아 NULL일 수 있다 |
| badge_id | 조인 편의용 파생 컬럼 — 항상 `inventory_item_id`가 가리키는 개체의 `badge_id`와 일치(드리프트 없음). 정본은 `inventory_items.badge_id` |
| expires_at | **2026-08-29부터 유저 드랍도 NULL(무기한 대기, 회수·만료 없음)** — 과거엔 30일 만료였으나 의도(유저 드랍은 기한 개념 없음)와 어긋나 바로잡았다. system 드랍도 여전히 NULL(만료 없음 — 상시 존재 전제, 한시 노출은 `badges.valid_from/valid_until`로 대체) |
| dropper_user_id | 유저 드랍만 값 존재, system 드랍은 NULL. FK는 `ON DELETE SET NULL`(2026-08-29 이전엔 `CASCADE`였다 — 드랍한 사람이 탈퇴해도 무기한 대기 중인 드랍 row 자체가 사라지지 않도록 전환) |

픽업은 `pickup_drop()` RPC로 원자 트랜잭션 처리 — 2026-08-29부터 신규 `inventory_items` row를
INSERT하지 않고 기존 개체의 소유자(`inventory_id`)만 옮긴다(일련번호 불변). 유저 드랍 생성도
`create_user_drop()` RPC로 원자 처리(개체 소프트 삭제 대신 `inventory_item_id` 연결 + 소유자
필드만 비움). 미픽업 만료·소프트 삭제된 배지 정리는 `expire_stale_poi_drops()` RPC(cron이
호출)가 개체 소각(`destroyed_at`)까지 함께 처리한다.

> **`source` 컬럼·`assign_random_serial()` 분기·`poi_drops_source_consistency` CHECK** — 전부
> 마이그레이션 044(2026-07-22) 도입, 100(2026-08-25 제거 시)에도 살아남아 104(2026-08-26 재도입)에서
> 그대로 재사용됐다. `assign_random_serial()`은 `obtained_by='ambient_drop'`이면(2026-08-29
> 이전엔 `source='system'` 조인으로 판별했다 — 앰비언트 드랍이 이제 poi_drops row 생성
> "이전"에 개체를 선발급하므로 그 시점엔 조인 대상이 없어 판별 방식을 바꿨다) 일련번호를
> 50,001~999,999로 제한하고, CHECK는 `source='user' → dropper_user_id NOT NULL` /
> `source='system' → dropper_user_id NULL`을 강제한다(2026-08-29부터 `expires_at` 조건은
> 양쪽 다 빠졌다 — 위 표 참고).

### drop_events / drop_claims / drop_probability (레거시 추정)
어드민 주도 드랍 이벤트용 초기 테이블. 034(드랍엔진 v2) 이후 `drop_policy`가 사실상 후속 확장판 — 실사용 여부는 코드 확인 필요.

### user_drop_state / drop_policy (신규 — 드랍엔진 v2)
유저별 드랍 모멘텀 상태(연속 common 카운터, 마지막 조각 피티, 일일 드랍 수)와 엔진 전체 파라미터(레어리티 확률, 모멘텀/인접/탐험 가중치). 상세 로직은 [BadgeEngine 문서](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) §3 참고.

> ℹ️ **등급 컬럼명은 앱 키와 일치한다** — `drop_policy`·`ambient_drop_config`는
> `rarity_epic`/`rarity_mystic`, `abusing_policy`는 `soft|hard_epic_rate`/`soft|hard_mystic_rate`.
> 한동안 테이블마다 이름이 갈라져 `src/lib/drop-engine/policy.ts`가 입출력 시점에 변환했으나
> (티켓 20260813_003의 컬럼 rename 누락 → 20260831_1118의 한시적 대응), 마이그레이션 115가
> 세 테이블을 전부 통일하면서 그 변환 매핑은 제거했다(티켓 20260831_1115).
>
> ⚠️ **`abusing_policy`의 Epic 차단율은 의도적으로 꺼둔 상태다.** 컬럼명이 어긋나 있던 동안
> `shadow-ban.ts`의 3단계 조회가 `undefined ?? 1.0`으로 폴백해 **차단이 한 번도 작동하지
> 않았다**. 개명으로 조회가 성립하면 잠들어 있던 값 `0.00`이 살아나 soft/hard밴 유저의 Epic
> 드랍이 즉시 0%가 되므로, 등급명 변경만으로 유저 체감 동작이 바뀌지 않도록 마이그레이션 115가
> `soft_epic_rate`·`hard_epic_rate`를 `1.00`(허용)으로 고정했다. **Mystic 차단은 계속 정상
> 작동한다**(`0.00`). Epic 차단을 실제로 켤지는 별도 판단이 필요하다.
>
> 참고: 한동안 수기 타입 `database.ts`(앱 키 기준)와 생성 타입 `database.generated.ts`(DB 컬럼
> 기준)가 이 테이블에서 어긋나 컬럼명 불일치가 타입 체크로 잡히지 않았다. 마이그레이션 115로
> 양쪽 모두 DB와 일치하고, 티켓 20260831_1213이 타입 검사 자체도 되살렸다(아래).

### Supabase 타입의 진실 원천 (2026-08-31 티켓 20260831_1213)

**Supabase 클라이언트 제네릭의 진실 원천은 `src/types/database.generated.ts`다.**
`lib/supabase/client.ts`·`server.ts` 3곳이 이 파일을 주입하므로,
`.from(t).insert/update/upsert()`의 **컬럼명·타입 검사가 생성 타입 기준으로 실제로 걸린다.**

수기 `src/types/database.ts`는 **삭제하지 않고 도메인 자산으로 남긴다** — 168개 파일이 `XxxRow`를
값 형태로 import하고, 각 컬럼의 의미·마이그레이션 근거 주석이 생성 타입에는 없으며,
`BadgeCondition`·`ActivityType`처럼 `jsonb`/`text[]`를 좁힌 도메인 타입은 여기서만 정의된다.
**다만 이 파일의 Row를 고쳐도 쓰기 검사에는 영향이 없다.**

> ⚠️ **왜 전환이 필요했나.** 수기 파일은 Row를 `interface`로 선언하는데, `interface`는 암묵적
> 인덱스 시그니처가 없어 supabase-js의 `GenericTable`(`Row: Record<string, unknown>`) 제약을
> 만족하지 못한다. 그 결과 **모든 쓰기 페이로드가 `never[]`로 추론**돼 올바른 컬럼을 써도 컴파일
> 오류가 났고, 쓰기 지점마다 `@ts-expect-error`가 달렸다(92개 / 55파일). **그 지시자가 컬럼명
> 검증까지 함께 껐고**, 어드민 드랍 정책 저장이 41일간 조용히 실패한 사고(20260831_1118)가
> 컴파일에서 안 잡힌 직접 원인이 됐다. 전환 후 **억제는 0개**다.

**아직 검사 밖인 예외** (전부 기존 코드, 별도 정리 대상):

| 예외 | 왜 검사가 안 걸리나 |
|---|---|
| `.update(body as never)` 4곳 (`api/admin/{today,missions,recipes}/[id]/route.ts`, `lib/missions/rewards.ts:142`) | `as never` 캐스팅이 억제와 같은 효과를 낸다. `@ts-expect-error` 0개가 "모든 쓰기가 검사된다"를 뜻하지 않는다 |
| 쓰기 페이로드에 `Record<string, unknown>` 반환 함수를 스프레드하는 형태 | 그 스프레드가 기여하는 키는 페이로드 타입에서 **통째로 사라진다**. `drop_policy`의 `toDbColumns()`가 그랬고, 마이그레이션 115로 매핑이 제거되면서 해소됐다 |

> ⚠️ **생성 타입이 낡으면 이제는 올바른 코드가 잘못된 컴파일 오류를 낸다.** 실제로 20260831_1158
> 조사 시점에 `badges.category`·`poi.is_active`가 그 상태였다. 마이그레이션을 추가하면
> `npm run db:types`로 재생성해 같은 커밋에 함께 넣을 것.

### ambient_drop_config (재도입 — 2026-08-26, 마이그레이션 104)
앰비언트(시스템) POI 드랍 배치 설정 싱글톤(id=1). 카테고리(`poi_categories` 13종 또는 전체)·
등급비율(4종 합=1)·대상 컬렉션(`item_books` 단독/멀티/전체) 3축을 각각 명시값 또는 무작위로
설정하고, `all_random`으로 3축을 한 번에 무작위 처리할 수 있다. `auto_enabled`(자동 스케줄
등록 여부)·`exclusion_window_minutes`(자동 스케줄 전후 수동 배포 차단 창)로 자동(cron)/수동
트리거의 상호 배제를 관리한다. `batch_size`/`max_active_per_poi`는 3축에 속하지 않는 실행
파라미터. 상세 로직은 [BadgeEngine 문서](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) §3.12 참고.

> **구 `ambient_drop_policy`(마이그레이션 044, 100에서 DROP)와는 스키마가 다르다.** 구 모델은
> "활성 POI 수 × 커버리지 비율 → 부족분 보충"이라는 전역 목표치 모델이었고, 신규 모델은
> 실행마다 3축을 골라 `batch_size`개를 그때그때 배치하는 배치 실행형이다 — 티켓
> [20260826_009](../../Tickets/20260826_009_BadgeEngine_앰비언트-POI-드랍-재도입.md).

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
`mission_type`(distance/checkin/activity_count/item_collect/streak_days/duration_minutes/elevation_gain_m — `checkin`은 2026-08-26에 `poi_visit`에서 개명 — 뒤 3종은 2026-08-13 추가, 배지엔진의 `evaluateConditionDetailed`를 그대로 재사용해 판정), `condition_json`(뒤 3종은 badge-engine `BadgeCondition`과 동일한 필드 어휘 사용), `reward_type`(nullable — 배지+포인트 동시 구성 가능), `reward_badge_ids[]`(복수 배지 보상), `reward_points`, `starts_at/ends_at`(`ends_at`은 2026-08-13부터 nullable — NULL은 "상시 미션", 종료일 없음), `max_completions`, `status_display_type`(ranking/achievement/individual — `individual`은 2026-08-13 추가, 본인 진행상황만 반환하고 다른 참가자는 노출하지 않음), `visible_rank_count`, `image_url`(2026-08-15 추가 — 미션 카드 썸네일 URL. Supabase Storage `mission-images` 버킷 참조. NULL이면 플레이스홀더 표시), `gated_badge_id`(2026-08-25 추가, nullable FK → `badges.id` — 이 미션을 완료해야 획득 조건이 열리는 **본 배지**. 레벨업 미션 15종만 값을 가지며, 미션 노출 판정(`src/lib/missions/visibility.ts`)이 이 배지의 등급과 유저 보유 등급을 비교해 open/locked/hidden을 결정한다. 티켓 20260825_028).

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

**`strava_activity_id BIGINT NULL`** (마이그레이션 107, 티켓 20260827_018) — 이 이벤트가
어느 활동에서 나왔는지. UUID FK가 아니라 **Strava 숫자 id**를 쓴다:
`strava_activities.strava_id` · `user_activity_badges.triggered_by_strava_id` ·
결산 알림 payload의 `activity_ids`와 같은 규약이라 **알림과 피드가 같은 키로 말한다**.
FK 제약도 걸지 않는다 — `strava_activities` 적재보다 이벤트 기록이 앞설 수 있고,
참조 무결성보다 기록 유실 방지가 우선이다.

- **NULL = 활동 귀속 불명.** 활동 단위가 아닌 이벤트(`mission_joined`·`item_picked_up`·
  `mission_completed`)와 **107 이전에 쌓인 과거 행 전부**가 여기 해당한다.
  `mission_completed`를 뺀 이유는 미션이 여러 활동에 걸친 누적이라 한 활동에 귀속시키면
  사실과 어긋나기 때문이다.
- **백필하지 않는다.** 과거 이벤트가 어느 활동에서 나왔는지 복원할 방법이 없다 —
  `event_at`이 부정확하다는 것은 마이그레이션 093·094에서 이미 실측됐다. 추정 매칭으로
  잘못 묶는 것보다 단건으로 남기는 쪽이 안전하다(graceful degradation).
- 인덱스: `(user_id, strava_activity_id) WHERE strava_activity_id IS NOT NULL` 부분 인덱스.
- 프로필 피드는 이 값이 같은 이벤트를 **2건 이상일 때만** 한 카드로 접는다. NULL 행끼리는
  절대 묶지 않는다.

> **기록 순서 제약** — 이 컬럼을 쓰는 코드보다 DDL이 **먼저** 나가야 한다. 반대로 하면
> `recordFeedEvent`의 insert가 42703으로 실패하는데, 이 함수는 예외를 삼키고
> `console.error`만 남겨 **화면은 멀쩡한데 피드 기록만 사라지는 무증상 장애**가 된다.

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
| engine_decision_log | 배지·드랍 엔진의 판정 사후 추적 로그 (RLS 적용) |

---

## 원안(2026-07-09) 12개 테이블 대비 변경 요약

| 원안 | 현재 |
|---|---|
| User | `users` — `display_name`→`username`, GPS/온보딩 컬럼 추가, 이후 `display_name` 표시 전용 필드로 재도입(20260830) |
| StravaConnection | `strava_connections` — 거의 원형 유지 |
| Badge | `badges` — faction/point/soft-delete 등 대폭 확장, `type`에 `poi` 추가 |
| UserActivityBadge | `user_activity_badges` — 트리거 메타·발급 스냅샷 추가 |
| Inventory | `inventory` — 거의 원형 |
| InventoryItem | `inventory_items` — 일련번호 랜덤화, 슬롯 참조 추가 |
| POI | `poi` — category ENUM→FK 전환, OSM→네이버 데이터 소스 전환 |
| ItemBook | `item_books` — `required_item_badge_ids` 삭제, 소유 관계 역전(badges → item_book_id) |
| PoiDrop | `poi_drops` — `source`(`'user'`/`'system'`)로 유저 드랍과 앰비언트(시스템) 드랍 구분 |
| DropEvent | `drop_events` — 스키마 변경 없이 잔존 (실사용 여부 별도 확인 필요) |
| DropProbability | `drop_probability` — 잔존하나 `drop_policy`가 사실상 후속 확장판 |
| Trade | `trades` — 스키마 변경 없이 잔존. **`inventory/flea-market` 화면은 "coming soon" placeholder로, 실제 거래 기능 미구현** (2026-08-06 코드 확인) |

---

## 왜 이 구조인가

**배지 이원화 (ActivityBadge vs ItemBadge) + 체크인 배지 분리**
- 액티비티 배지는 영구 귀속(정체성), 아이템 배지는 거래 가능(경제), 체크인 배지는 반복 획득(같은 지점에 다시 체크인 가능) — 세 가지 획득 패턴이 근본적으로 달라 발급 테이블을 분리 유지.

**컬렉션 소유 관계 역전**
- 원안은 `item_books.required_item_badge_ids`(북이 배지 목록을 가짐)였으나, 세계관 연동과 슬롯 장착 UX가 추가되며 `badges.item_book_id`(배지가 소속 북을 가짐) 구조로 역전. 배지 하나가 정확히 하나의 북에만 속하는 현재 컨텐츠 구조(세계관 10개 = 컬렉션 10개, 각 90종)와 더 잘 맞음.

**포인트를 append-only 원장으로**
- `point_wallets.balance`는 캐시일 뿐, 실제 진실은 `point_transactions`. 정합성 검증(어드민 `points` 화면의 유통량 대사)과 감사 추적을 위해 잔액을 직접 UPDATE하지 않고 RPC로만 변경.

**드랍엔진 상태를 유저별 테이블로 분리 (user_drop_state)**
- 모멘텀·피티 로직이 이전 드랍 결과에 의존하므로, 매 판정마다 히스토리 전체를 조회하는 대신 상태를 캐시해 원자적으로 갱신.

---

## [NEEDS CLARIFICATION]

- [x] `drop_events`/`drop_claims`/`drop_probability`(어드민 주도 이벤트형 드랍)가 `drop_policy`(드랍엔진 v2) 도입 후에도 실제 코드에서 호출되는지 — **레거시 확정** (2026-08-07 코드 확인). `lib/drop/pickup.ts`가 `drop_events`/`drop_claims`를 참조하나 `processDropPickups` 함수가 `src/` 전체에서 호출되지 않아 완전한 데드코드. `drop_probability`는 `database.ts` 타입 정의에만 존재하고 실사용 없음. 세 테이블 모두 드랍엔진 v2(`drop_policy`/`user_drop_state`) 도입 이후 미사용 레거시로 판정.
- [x] `trades` 테이블 + `inventory/flea-market` 화면의 실제 개발 착수 시점 — **미정** (2026-08-07 확정). 착수 결정 시 별도 티켓 생성 예정. 현재 `trades` 스키마는 001 마이그레이션 이후 변경 없이 방치 상태.
- [x] `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` 환경변수가 `.env.local`에는 있으나 코드에서 미사용 — **마이그레이션 미착수, 당장 불필요** (2026-08-07 코드 확인). `src/` 전체에서 두 키를 참조하는 코드 없음. 현재 클라이언트 초기화(`lib/supabase/server.ts`, `client.ts`)는 기존 JWT 키 체계(`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`)로만 작동. `.env.local`의 `sb_publishable_*`/`sb_secret_*` 값은 미사용 환경변수로만 남아 있으며 서비스에 영향 없음. Supabase가 JWT 키를 deprecated할 경우 클라이언트 라이브러리 업그레이드와 함께 마이그레이션 필요.
- [x] `poi_categories.pipeline_linked`/`tier`/`keywords[]`의 정확한 운영 기준 문서화 (2026-08-24 위 표로 반영)
- [ ] `user_activity_feed`의 공개 범위 정책 — 공개/비공개/팔로우 공개/전체공개 4단계 체계 **수립 예정** (2026-08-07). 현재 본인·타인 프로필 양쪽에서 동일 테이블을 사용하나 RLS·쿼리 레벨의 공개 범위 필터링이 미정의. 체계 확정 시 이 섹션 + [01_PRD.md](01_PRD.md) 동시 업데이트 필요.
- [x] `wandering_mythic_state`(삭제된 테이블 — 옛 이름 그대로 표기)의 유저 대면 UI 완성도 — **기능 전면 제거로 해소** (2026-08-24, 티켓 [20260824_017](../../Tickets/20260824_017_Infra_떠돌이신화-기능-전면제거.md)). 프로덕션 실사용 0건(배지·상태행·획득·인벤토리 전부)이 확인되어 UI를 구현하는 대신 `wandering_mythic_state` 테이블과 `badges.is_wandering` 컬럼, `/api/cron/wandering`을 제거했다.
