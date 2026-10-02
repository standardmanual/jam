---
type: data-model
description: "유저 모바일 웹의 도메인별 테이블 구조와 관계, 원안 대비 변경 요약을 개념 수준으로 정리한 데이터 모델 문서다."
code:
  - "jam-web/supabase/migrations"
---

# JAM! 유저 모바일 웹 — 데이터 모델

> 이 문서는 앱에서 다루는 핵심 데이터의 구조를 정의합니다.
> 개발자가 아니어도 이해할 수 있는 "개념적 ERD"입니다.
>
> **2026-08-06 갱신**: `jam-web/supabase/migrations/` 001~074 전수 대조로 현재 DB 상태 기준
> 재작성. 원안(2026-07-09) 대비 트라이브·조합·미션·포인트·팔로우·어뷰징·드랍엔진v2·CMS 등
> 12개 도메인이 신규 추가됐고, 기존 12개 테이블 중 다수가 구조적으로 변경됨.

---

## 전체 구조 (도메인별)

```
[유저/인증]     users ─1:1─ strava_connections
                 ├─1:N─ strava_activities (동기화 원본 활동 기록)
                 └──tribe_id──> tribes (온보딩에서 1회 선택, 탈퇴 전까지 불변)

[배지]          badges (activity/item/checkin) ──tribe_id──> tribes
                 ├─1:N─ user_activity_badges      (활동/아이템 배지, 행은 1개 · 반복 획득은 earn_count 누적)
                 └─1:N─ user_checkin_badge_earns  (체크인 배지, 반복 획득 가능)

[인벤토리]      users ─1:1─ inventory ─1:N─ inventory_items ──badge_id──> badges
                                              └─ slotted_in ──> item_books (슬롯 장착)

[컬렉션]        item_books ──tribe_id──> tribes
                 ├─1:N─ user_item_book_slots        (슬롯별 장착 현황)
                 └─1:N─ user_item_book_completions   (완성 기록)

[트라이브]        tribes ─N:M(인접)─ tribes (tribe_adjacency, 드랍 모멘텀용)

[POI/드랍]      poi ──category──> poi_categories
                 ├─1:N─ poi_drops (유저 드랍)
                 └─연결─ badges (linked_badge_id)
                users ─1:1─ user_drop_state (드랍 모멘텀/피티 상태)
                drop_policy (싱글톤 파라미터)

[조합]          combination_recipes (보상만) + combination_recipe_slots (슬롯 2~10개, OR 후보)
                combine_policy (싱글톤 — 실패 시 고정 포인트)
                user_combine_fail_logs · user_combine_success_logs (유저별 믹스 실패·성공 이력)

[미션]          missions ─1:N─ user_mission_participations (참가+진행도)
                          └─1:N─ user_mission_completions   (완료 기록)

[포인트]        users ─1:1─ point_wallets ─1:N─ point_transactions (append-only 원장)
                point_treasury (전체 발행/회수 싱글톤 장부)

[소셜]          users ─N:M(팔로우)─ users (user_follows)
                user_activity_feed (배지/드랍/미션 이벤트 통합 피드)

[어뷰징]        abusing_policy(싱글톤) / user_shadow_bans / poi_blocks / abusing_logs

[CMS/기타]      today_cards (홈 에디토리얼) / theme_presets (어드민 컬러 테마)
                engine_decision_log (배지·드랍 엔진 판정 로그)

[운영툴]        ops_bundles ─1:N─ ops_bundle_items   (에이전트가 제출한 한 주치 운영 묶음과 그 항목)
                     └─1:N─ ops_decisions ──item_id──> ops_bundle_items (결정 기록, 추가만)
                ops_rules   (밸런스 규칙·신호 기준값, 규칙 키가 기본키)
                ops_patterns ─1:N─ ops_pattern_taste_signals   (패턴 사전과 그 패턴의 취향 신호)
                ops_pattern_common_rules   (모든 패턴에 적용하는 공통 규칙)
```

---

## 1. 유저 / 인증

### users
Strava를 쓰는 활동가. 구글 로그인으로 가입, 이후 2단계 온보딩(아이디·이름 → 트라이브·프로필이미지)에서
필수 필드를 채운다.

| 필드 | 설명 |
|------|------|
| id | Supabase auth.users FK |
| email | 구글 계정 이메일 |
| username | 고유 닉네임 (`^[a-z0-9._]+$`, nullable — 온보딩 1단계 완료 전 null) |
| display_name | 자유 형식 표시 이름 (nullable, 1~30자, 형식 제한 없음). 화면에서 username이 노출되던 위치는 이 값이 있으면 이 값을, 없으면 username을 대신 노출(표시 전용 폴백 — DB에 복사해 채우지 않음). 온보딩 1단계에서 필수 입력, 프로필 편집에서 임의 시점에 다시 변경 가능(필수 아님, 수정 횟수 제한 없음, 티켓 20260830_0113) |
| avatar_url | 프로필 이미지. 온보딩 2단계에서 구글 기본값을 보여주고 변경 가능(선택) |
| tribe_id | 온보딩 2단계에서 선택한 트라이브 FK → `tribes.id`, nullable. **온보딩 완료 시 1회 설정된 뒤 탈퇴 전까지 불변** — 변경 API 없음. 기존 유저는 null 허용(강제 재온보딩 없음, 티켓 20260909_2119) |
| onboarding_completed_at | 온보딩 2단계(트라이브 포함)까지 완료된 시각, nullable. null이면 `/auth/callback`이 온보딩으로 리다이렉트한다(티켓 20260909_2119) |
| last_location_lat/lng/at | 최근 위치 (GPS 조작 감지용) |
| initial_sync_done | 첫 Strava 동기화 시 common 등급만 발급하는 게이트 완료 여부 |

> 원안의 `display_name`(당시엔 유일한 이름 필드)은 `username`으로 rename됐었으나,
> 2026-08-30(티켓 20260830_0113)에 `display_name`이 **별도의 표시 전용 필드**로
> 재도입됨 — 지금은 `username`(로그인 식별자·URL 슬러그)과 `display_name`(자유 형식
> 노출 이름, 없으면 username 폴백)이 공존한다.
>
> `region`·`activity_types[]`(활동 지역·활동 종목 복수 선택)는 마이그레이션 001부터 있었으나
> 입력 UI가 한 번도 만들어진 적 없는 죽은 컬럼이었다 — 티켓 20260909_2119에서 PRD 삭제 +
> DB 컬럼 삭제 + 참조 코드 정리로 완전히 제거했다.

**JAM! 행동 지표의 원천**: `created_at`(가입 시각)이 가입 경과일(`days_since_signup`)의 기준이다. 가입한 날(KST)부터
오늘(KST)까지의 날짜 차를 세고, 주간 활동일·최근 30일 활동일·같은 지점 체크인 일수는 가입한 날 이후 기록만 센다
(티켓 20261001_0633, [BADGE_ENGINE_UNIFIED.md](../badge-engine/BADGE_ENGINE_UNIFIED.md) ③ JAM! 카테고리).

### user_onboarding_quests (신규)
온보딩 퀘스트(1~7단계, 연출용) 유저별 진행 상태(마이그레이션 195, 티켓 20260927_2124/상위 20260927_2123). `user_id`(PK, `users(id)` FK, 유저 삭제 시 CASCADE), `step_progress`(단계 키 `sync`·`bag`·`pickup`·`mix_fail`·`mix_success`·`drop`·`browse` → 완료 시각 ISO 문자열 JSONB, 기본값 `{}`), `skipped_at`(건너뛰기 T8 시각, 있으면 완료 배지 불가), `completed_at`(실제 첫 활동 유입 시각 T6), `reward_granted_at`(완료 배지·100P 지급 시각 T7, 멱등 기준), `created_at`.

행 생성 시점은 `POST /api/onboarding/complete`가 `onboarding_completed_at`을 처음 기록하는 순간(service_role, 이미 있으면 무시)이며, **기능 배포 이후 온보딩 2단계를 마친 신규 유저에게만** 만든다 — 기존 유저에게 소급 생성하지 않는다(백필 없음). 행의 존재 자체가 "퀘스트 대상"의 기준이다. 퀘스트 1~7단계는 연출용 데이터이고, 이 테이블 외의 실제 테이블(`inventory_items`·`poi_drops`·`user_activity_badges`·`point_transactions`)에는 퀘스트 때문에 행을 만들지 않는다.

RLS는 켜고 본인 행 SELECT만 허용, INSERT·UPDATE·DELETE 정책은 없다(서버 service_role 경로 전용).

**기능 스위치**: `src/lib/onboarding-quest/config.ts`의 `ONBOARDING_QUEST_ENABLED`가 `false`면 온보딩을 완료해도 행을 만들지 않는다. 하위 티켓들이 순차로 프로덕션에 나가도 스위치를 켜기 전에는 신규 유저에게 반쯤 만든 퀘스트가 보이지 않게 하기 위함이며, 스위치는 상위 티켓의 마지막 단계에서 켠다.

### strava_connections
원안과 거의 동일. `access_token`/`refresh_token` 암호화 저장, `backfill_completed` 유지.

### strava_sync_failures
Strava 동기화 실패 기록(마이그레이션 176). `failure_type`(`token_refresh_failed`·`rate_limited`·`strava_api_error`), `error_message`, `occurred_at`. `syncStravaActivities()`의 실패 경로가 남기며, 기록이 실패해도 동기화 자체는 막지 않는다. 어드민 주간 집계(`/api/admin/kpi/weekly`의 `stravaSyncFailures`)의 원천이다. RLS를 켜고 정책을 두지 않아 service_role만 접근한다. `user_id`는 원인 추적용이고 집계 응답에는 넣지 않는다.

### strava_activities (신규)
동기화 원본 활동 기록. `strava_id`, `jam_activity_type`, `distance_km`, `normalized`(정규화된 활동 JSON), `processed_via`(sync/reconcile/manual_backfill). UNIQUE(user_id, strava_id)로 중복 동기화 방지 — 이기종 데이터 중복 이슈의 실제 해결책.

`normalized`의 구조는 `NormalizedActivity`(`src/types/strava.ts`)다. 2026-09-05부터 v5 확장
6필드(심박·파워·케이던스·최고속도·최고도달고도·경과시간)가 함께 저장되며, **측정값이 없으면
키 자체가 없다**(`null`이 아니다 — 티켓 20260905_0029). 컬럼 변경은 없다(jsonb).
확장 필드를 소급 채운 행은 `normalized.extendedBackfilledAt`(ISO 문자열)로 표시한다 — **`processed_via`는 덮어쓰지 않는다.** 그 값은 «이 행이 어떤 경로로 들어왔는가»이지 «나중에 무엇으로 채워졌는가»가 아니며, 덮어쓰면 유입 경로 이력이 사라진다
(`jam-web/scripts/backfill-strava-extended-fields.ts`). `'reconcile'`은 2026-08-10 이전 과거 데이터에만
있고 신규 기록은 없다.

**JAM! 행동 지표의 원천**: 주간 활동일(`weekly_active_days`)과 최근 30일 활동일(`signup_recent_active_days`)의
「활동한 날」이 이 테이블의 `start_date`(timestamptz — 현지 시각 열은 없다)를 KST 날짜로 옮겨 센다. 가입한 날
이후 행만 읽고, `normalized`의 `jamActivityType`·`distanceKm`·`movingTimeSec`·`averageSpeedKmh`로 JAM! 종목·걷기
게이트·차량 속도 필터를 통과한 활동만 센다(티켓 20261001_0633). 수동 입력 활동은 저장된 정보로 가를 수 없다.

---

## 2. 배지

### badges
| 필드 | 설명 |
|------|------|
| type | `activity` / `item` / **`poi`**(신규 — POI 통과 시 반복 발급) |
| rarity | common / rare / epic / mystic. **nullable** — NULL이면 무한레벨형이며, 이것이 v5의 **유일한** 배지 종류 판정 기준이다(별도 `badge_kind` 컬럼을 두지 않는다 — 판정 기준이 둘이면 서로 어긋난다). `CHECK ((rarity IS NULL) = (level IS NOT NULL))`이 강제한다 |
| level | 무한레벨형의 레벨(Lv.1~∞). 등급형은 NULL. `level >= 1` |
| family_key | 계열 식별자. 이름 문자열 대신 쓰는 안정적인 키. 활동 배지에만 채운다 |
| sort_order | 표시 순서(오름차순). 계열 레일 1~99(계열 안 모든 등급이 같은 값을 공유) / 독립 발급 배지 101~ . **`0`은 «아직 설정하지 않음»이며 화면에서 맨 뒤로 밀린다** — 저장소의 다른 `sort_order`(`today_cards`·`tribes`·`item_books`)는 0이 앞이라는 반대 관습이므로, 배지에 한해 이 규약을 따른다 |
| tribe_id | 소속 트라이브 (아이템 배지) |
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
| image_source | 배지 대표 이미지(`image_url`)의 제작 경로(nullable text, CHECK `admin-generator`·`agent-generator`·`jam-img`, 마이그레이션 186, 티켓 20260924_2200, 2026-09-25 적용). `admin-generator`=에셋 제너레이터 적용 탭(수동 제작), `agent-generator`=윤진 CLI 등록 스크립트(윤진 자동, 티켓 20260924_2202), `jam-img`=기존 아이콘 파이프라인(후속 티켓 20260925_0352에서 기록 추가). NULL이면 기존 배지(미상). 어드민 배지 목록·상세 라벨과 목록 필터의 단일 출처는 `jam-web/src/lib/admin/contentImageSource.ts`(티켓 20260925_1407에서 미션까지 공용으로 일반화). 적용 탭은 원본 PNG를 `images` 버킷 `badges/asset-generator/{id}.png`에 보관하고 긴 변 1280px WebP(`{id}.webp`)를 `image_url`에 넣는다 (규격 근거는 PRD asset-generator §9) |

#### 배경 렌더링 우선순위

badges / item_books / tribes 세 테이블이 같은 배경 컬럼 세트를 갖고, 판정은 전부
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
활동/아이템 배지 발급 기록. **행은 유저·배지당 1개**(UNIQUE user_id+badge_id)이고, 같은 배지를 여러 번 받는 반복 획득은 행을 늘리는 대신 `earn_count`를 올린다. **그 증가는 발급이 아니다** — 피드·결산·획득 연출을 만들지 않는다. 실제 발급은 등급 임계값(1·5·20·50회)에서만 일어난다. 이 분리가 v5 홍수 방지의 실체다. 지점(POI)/Strava 트리거 메타(`triggered_by_*`) + 어드민 조회용 `condition_snapshot`(발급 당시 실측값) 포함.

| 필드 | 설명 |
|------|------|
| earn_count | **그 배지의 기준 조건을 만족한 활동 수**(v5 B1에서 재정의). 등급형·레벨형은 발급 시 1. 반복형은 발급 시점에 그때까지 쌓인 회차를 전부 심고, 이후 새 활동마다 오른다. **그 증가는 발급이 아니다** — 피드·결산·획득 연출을 만들지 않는다 |
| earn_history | 회차별 이력(jsonb 배열). 원소는 `earned_at` + 근거 활동(`strava_activity_id` 또는 `poi_id`). **`strava_activity_id`가 반복 획득의 멱등 판정 키다** — 이미 들어 있는 활동으로는 카운터가 오르지 않는다(마이그레이션 132의 `increment_activity_badge_earn`). ⚠️ **상한 200.** 여기 도달한 뒤로는 `earn_count = jsonb_array_length(earn_history)` 불변식이 깨진다(`earn_count`만 계속 증가). ⚠️ JSONB라 FK가 없다 — 근거 활동이 삭제되면 참조가 끊긴 채 남는다 |

> UNIQUE를 해제하고 행을 쌓는 방식(선례: `user_checkin_badge_earns`)은 검토 후 미채택했다 —
> «보유 여부»를 행 1개 전제로 판정하는 코드가 33개 파일에 퍼져 있어 전수 점검 비용이
> 이력 보존의 이득을 넘는다(티켓 20260905_0027).

### user_checkin_badge_earns (신규)
체크인 배지는 반복 획득 가능하므로 별도 테이블. UNIQUE(user_id, badge_id, poi_id, strava_id)로 동일 통과분 중복 방지.

> 2026-08-26(티켓 20260826_004)에 `user_poi_badge_earns`에서 개명. `poi_id` 컬럼은 지점 참조라
> 이름을 유지한다. 같은 티켓에서 `badge_type` `'poi'` → `'checkin'`,
> `notification_type` `'poi_badge_earned'` → `'checkin_badge_earned'`,
> `missions.mission_type` `'poi_visit'` → `'checkin'`으로 함께 개명됐다.

**JAM! 행동 지표의 원천**: 같은 지점 체크인 일수(`same_spot_checkin_days`)는 `poi_id`별
`triggered_by_activity_date`(체크인을 만든 활동의 시각)의 서로 다른 KST 날짜 수의 최댓값이다. 동기화 시각
(`earned_at`)이 아니라 활동 날짜로 센다 — 며칠 뒤에 동기화한 체크인이 있기 때문이다. 활동 날짜가 없는 행은 세지
않는다. 이 날짜는 주간 활동일의 «체크인한 날»로도 쓰인다(티켓 20261001_0633).

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
[BadgeEngine 문서](../badge-engine/BADGE_ENGINE_UNIFIED.md) §3.5-1 참고. 어드민 조회 화면은
별도 티켓([20260829_2139](../../tickets/p2-normal/20260829_2139_Admin_아이템배지-발급현황-이력조회-화면.md)).

---

## 4. 컬렉션

### item_books
`tribe_id`로 트라이브 연동, `story_text`, `is_active`, `drop_condition_json` 보유. **`required_item_badge_ids` 컬럼은 삭제됨** — 완성 조건은 이제 `badges.item_book_id`(배지→북 소속)로 역방향 관리.

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

**컬렉션 노출 판정** (`valid_from`·`valid_until`은 마이그레이션 171, 판정 원천은 `src/lib/itembook/visibility.ts`,
티켓 20260930_1516). 시각이 비면 그 방향은 제한이 없고, 시작·종료 시각은 경계를 포함한다. 판정은 둘이다 —
기간이 끝난 컬렉션을 이미 가진 유저에게는 계속 보여 주되 새 드랍·완성 판정 대상으로는 삼지 않기 때문이다.

| 판정 | 조건 | 쓰는 곳 |
|---|---|---|
| 공개됨(화면용) | `is_active` 그리고 (`valid_from`이 비었거나 지금 이전) | `/api/itembooks`, `/collections/[id]`(공개되지 않았으면 404), 장착 `POST /api/itembooks/[id]/slot`(공개되지 않았으면 404), `/badges` 컬렉션 탭(공개 전 컬렉션은 목록·진행도에서 빠짐), 배지 상세의 컬렉션 카드(공개 전이면 카드를 그리지 않음) |
| 노출 중(드랍·완성용) | 공개됨 그리고 (`valid_until`이 비었거나 지금 이후) | 앰비언트 드랍(`BADGE_ENGINE_UNIFIED.md` §3.12), 완성 판정(`checkItemBookCompletion`), 완성 가능 소식(`findCompletableItemBooks`) |

어드민 컬렉션 목록의 상태 필터(노출 중·기간 밖·비활성)는 어드민 전용 분류라 이 판정을 쓰지 않는다. 어드민에게만 보이는
예외는 두지 않는다 — 공개 전 컬렉션의 어드민 미리보기는 유저 화면 주소를 열지 않고 `ItemBookHeroSection`을 직접 그린다.

### user_item_book_slots / user_item_book_completions (신규)
- `user_item_book_slots`: 인벤토리 아이템을 슬롯에 장착한 기록 (UNIQUE user+book+badge)
  - `inventory_item_id`(NOT NULL): **어느 개체가 꽂혀 있는지의 정본.** UNIQUE 제약이 배지 단위라
    컬렉션당 같은 배지는 1개만 장착되지만, 유저가 같은 배지를 여러 개 보유할 수 있으므로
    "어느 개체인가"는 이 컬럼으로만 확정된다. 컬렉션 화면의 배지 상세 링크가 싣는
    `?item={inventory_item_id}`의 출처이기도 하다 (티켓 20260907_2059).
- `user_item_book_completions`: 완성 기록 (PK user_id+item_book_id)
  - **JAM! 행동 지표의 원천**: 완성한 컬렉션 수(`collection_complete_count`)가 `user_id`로 거른 행 수를 센다.
    PK라 행 수가 서로 다른 컬렉션 수이고, 장착 해제·교체는 이 기록을 지우지 않는다(티켓 20261001_0633).

---

## 5. 트라이브 (tribe) — 신규 도메인

### tribes
10개 트라이브. `name`, `tagline`, `description`, `drop_weight`, `is_active`, `sort_order`, `drop_condition_json`. 상세 컨텐츠는 [jam-doc/planning/content/TRIBES.md](../../../jam-doc/planning/content/TRIBES.md) 참고.

`background_color`/`background_shader_id`(20260818_004) 외에 `background_image_url`/`background_video_url`
(nullable, 20260819_013), `background_animation`(jsonb nullable, 20260901_1944) 보유. 트라이브 자체는
서비스 공개 상세 페이지가 없어 이 값이 직접 렌더링되지는 않음 — 소속 컬렉션·배지 전체로 캐스케이드
일괄 적용하기 위한 마스터 값 저장용.

캐스케이드는 컬렉션과 동일하게 **`background_color` + `background_animation` 2필드**만 복사하며,
영상·이미지는 복사도 삭제도 하지 않는다(§2 «배경 렌더링 우선순위» 참고).

`PUT /api/admin/tribes/[id]`는 부분 body 병합을 지원한다(20260827_005) — body에 없는(=`undefined`)
필드는 기존 DB 값을 그대로 유지하고, body에 명시적으로 포함된 필드만 갱신한다. 인접 트라이브만 저장하는
`AdjacencyEditor.tsx`처럼 일부 필드만 담아 호출하는 화면도 안전하게 이 엔드포인트를 재사용할 수 있다.

### tribe_adjacency
트라이브 간 인접 그래프 (PK: tribe_id + adjacent_tribe_id). 드랍엔진 v2의 "서사 모멘텀" 판정에 사용 — 상세는 [docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md](../badge-engine/BADGE_ENGINE_UNIFIED.md) §3.2 참고.

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
| naver_category | **신규(2026-09-07, [20260907_1242](../../tickets/p2-normal/20260907_1242_Infra_POI-네이버원본분류검증게이트및-어드민검토큐.md))** — 네이버 지역검색 응답의 원본 분류 문자열(가공 없이 저장). 수동 등록(T1)은 NULL |
| naver_keyword | 위와 동일 티켓 신규 — 이 POI를 찾은 실제 네이버 검색 키워드. 수동 등록(T1)은 NULL |
| pending_review | 위와 동일 티켓 신규 — 수집 시 3단계 판정(자동승인/자동거부/검토대기) 중 "검토대기"로 저장된 행 표시. `is_active`(노출 여부)와는 분리된 개념 — 검토 대기 중에도 게이트 통과분과 동일하게 노출된다 |

> **T2 POI 데이터 소스가 OpenStreetMap → 네이버 지역검색 오픈API로 전환됨** (2026-07-22). 지도 렌더링도 Google Maps → 네이버 지도(NCP Maps.js)로 전환.
>
> **네이버 지역검색은 좌표/반경 파라미터가 없어** `"{지역명} {키워드}"` 형태로만 검색한다 —
> 해당 지역에 대상이 없으면 무관한 결과를 반환한다. 실측(2026-09-07): nature 카테고리 자동수집
> 16건 중 실제 자연 장소는 2건(오염률 87.5%). 이 오염을 걸러내는 검증 게이트가
> `poi_categories.requires_review`·`naver_category`/`category-gate.ts`다(아래 참고).

### poi_categories (신규, ENUM 대체)
`slug`(PK), `label`, `pipeline_linked`, `tier`, `keywords`(jsonb), `display_on_map`, `requires_review` — 드랍/픽업 파이프라인과 자동 검색 연동 메타를 코드 하드코딩에서 DB로 이전.

| 필드 | 운영 기준 |
|------|------|
| `pipeline_linked` | `true`인 카테고리만 자동 검색 대상으로 로드된다. `false`는 수동 등록 전용 |
| `tier` | **2026-09-07([20260907_1243](../../tickets/p2-normal/20260907_1243_Infra_POI-카테고리체계-재정리-및-기존POI재분류.md))부터 파이프라인 연동 카테고리 전부 `1`로 통일** — 컬럼·코드의 `tier===1\|\|tier===2` 필터(`categories.ts`)는 남아있지만 `tier=2`인 행이 없어 사실상 전부 "매 요청마다 검색"으로 동작한다. `pipeline_linked=false`는 `tier=NULL` |
| `keywords` | **2026-09-07부터 `text[]`→`jsonb` 전환.** 각 원소 `{"keyword": string, "scope": "dong"\|"gu"\|"sido"}` — `scope`는 역지오코딩 결과(`{sido, gu, dong}`, `reverse-geocode.ts`) 중 이 키워드에 접두어로 붙일 지역 단위. 카테고리 하나 안에서도 키워드별로 다른 지역 단위를 쓸 수 있다(예: government의 주민센터=동, 구청=구, 시청=시도). **검색 결과의 카테고리는 그 키워드를 소유한 슬러그로 고정**되며, POI 이름은 판정에 쓰이지 않는다 |
| `display_on_map` | **신규(2026-09-07)** — `false`면 자동수집은 계속하되 지도(드랍/픽업 화면)에는 노출하지 않는다. 노출 여부와 게이트 통과 여부(`pending_review`)는 서로 무관 — 검토 대기 중에도 `display_on_map`을 그대로 따른다 |
| `requires_review` | **신규(2026-09-07, [20260907_1242](../../tickets/p2-normal/20260907_1242_Infra_POI-네이버원본분류검증게이트및-어드민검토큐.md))** — `true`면 수집 시 네이버 원본 분류를 카테고리별 allow/reject 패턴(`src/lib/poi/category-gate.ts`)과 대조해 자동거부(미저장)/자동승인/검토대기 3단계로 분기한다. 기본 `false`(기존처럼 무조건 저장). 검토대기분은 어드민 `/admin/poi/review`에서 승인·카테고리 변경·거부 처리. 거부된 POI는 삭제 대신 `unassigned`(미분류·거부됨) 홀딩 카테고리로 이관돼 보관된다(`pipeline_linked=false`라 재수집·재검토 큐 어느 쪽에도 다시 나타나지 않음) |

> **카테고리를 새로 만들 때 주의**: `slug`는 `^[a-z][a-z0-9_]*$`만 허용(한글 불가, 라벨로 표기).
> 배지 발급 근거가 되는 카테고리라면 `src/lib/poi/radius-policy.ts`의
> `EXACT_MATCH_RADIUS_BY_CATEGORY`에 반경을 **반드시 함께 등록**해야 한다 — 누락 시 기본
> 500m가 적용돼 오탐이 발생한다(20260811_006). 또한 `poi.category`는 `poi_categories.slug`를
> 참조하는 FK(ON UPDATE CASCADE / ON DELETE RESTRICT)라 **카테고리 행을 먼저 INSERT**해야
> POI를 옮길 수 있고, 소속 POI가 남아 있는 카테고리는 삭제되지 않는다. `poi.category`의 컬럼
> DEFAULT는 `unassigned`(2026-09-07 이전엔 `other`였으나 그 카테고리가 삭제되며 함께 보정).
>
> **2026-09-07 카테고리 재정리([[20260907_1243]]) 이후 14종**: government·convenience·
> tourist_attraction·nature·stadium·school·park·hospital·pharmacy·food·mountain·
> train_subway·route·unassigned. 삭제됨: `transit`(대중교통, 카테고리+POI 16건 전부 삭제 —
> 삭제 전 실측상 배지 연결·드랍/조회 이력 0건 확인됨), `other`(기타, POI 3건은 `unassigned`로
> 이관). 통합됨: `bike_route`+`trail` → `route`. 신설: `stadium`(경기장)·`school`(학교).
> `mountain`·`train_subway`는 `pipeline_linked=false`로 전환(자동수집 중단, 기존 POI는 활성
> 유지 — 실측상 두 카테고리 모두 자동수집 산출이 사실상 없었고 대부분 수동 등록이었음).

### poi_search_cache (신규)
네이버 지역검색 API 캐시. `grid_key`+`category` PK, TTL 관리.

### poi_drops
| 필드 | 설명 |
|------|------|
| source | `'user'` 또는 `'system'`. 유저 드랍/앰비언트(시스템) 드랍을 구분한다. 2026-08-25~26에 앰비언트가 한 차례 제거됐다가([20260825_004](../../tickets/p1-high/20260825_004_Feature_앰비언트-드랍-기능-제거.md)) 재도입됐다([20260826_009](../../tickets/p1-high/20260826_009_BadgeEngine_앰비언트-POI-드랍-재도입.md)) — 그 사이엔 전 행이 `'user'`였다 |
| inventory_item_id | **신규(2026-08-29, 티켓 20260829_2101)** — 이 드랍이 가리키는 실제 개체(`inventory_items`). `source` 무관하게 항상 **이미 발급된** row를 참조한다(픽업은 소유권 이전일 뿐 재발급이 아니다). 마이그레이션 이전에 완료된(픽업 종료) 과거 드랍은 소급 연결되지 않아 NULL일 수 있다 |
| badge_id | 조인 편의용 파생 컬럼 — 항상 `inventory_item_id`가 가리키는 개체의 `badge_id`와 일치(드리프트 없음). 정본은 `inventory_items.badge_id` |
| expires_at | **2026-08-29부터 유저 드랍도 NULL(무기한 대기, 회수·만료 없음)** — 과거엔 30일 만료였으나 의도(유저 드랍은 기한 개념 없음)와 어긋나 바로잡았다. system 드랍도 여전히 NULL(만료 없음 — 상시 존재 전제, 한시 노출은 `badges.valid_from/valid_until`로 대체) |
| dropper_user_id | 유저 드랍만 값 존재, system 드랍은 NULL. FK는 `ON DELETE SET NULL`(2026-08-29 이전엔 `CASCADE`였다 — 드랍한 사람이 탈퇴해도 무기한 대기 중인 드랍 row 자체가 사라지지 않도록 전환) |

픽업은 `pickup_drop()` RPC로 원자 트랜잭션 처리 — 2026-08-29부터 신규 `inventory_items` row를
INSERT하지 않고 기존 개체의 소유자(`inventory_id`)만 옮긴다(일련번호 불변). 유저 드랍 생성도
`create_user_drop()` RPC로 원자 처리(개체 소프트 삭제 대신 `inventory_item_id` 연결 + 소유자
필드만 비움). 미픽업 만료·소프트 삭제된 배지 정리는 `expire_stale_poi_drops()` RPC(cron이
호출)가 개체 소각(`destroyed_at`)까지 함께 처리한다.

**인덱스와 JAM! 행동 지표의 원천**: JAM! 카테고리 드랍·픽업 행동 지표 4종(`drop_item_count`·
`pickup_item_count`·`pickup_from_user_count`·`picked_up_by_user_count`, 티켓 20261001_0632)이
이 테이블을 읽는다 — 드랍 1건 = 1행이고, `inventory_item_id`가 있는 행의 **서로 다른 개체·유저 수**로
센다(`dropper_user_id` NULL은 시스템·탈퇴한 놓은 사람, `picked_up_by` NULL은 미픽업·탈퇴한 줍는 사람).
조회는 놓은 사람 기준(`dropper_user_id`)과 주운 사람 기준(`picked_up_by`) 두 가지이며, 마이그레이션 202가
부분 인덱스 2개를 더한다(실행됨): `idx_poi_drops_dropper_lookup (dropper_user_id, id)`·
`idx_poi_drops_picker_lookup (picked_up_by, id)`, 둘 다 `WHERE inventory_item_id IS NOT NULL`.
기존 인덱스는 `idx_poi_drops_available`·`idx_poi_drops_inventory_item`·`idx_poi_drops_system_available`다.
세는 규칙은 [BADGE_ENGINE_UNIFIED.md](../badge-engine/BADGE_ENGINE_UNIFIED.md) ③ JAM! 카테고리의
드랍·픽업 절에 있다.

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
유저별 드랍 모멘텀 상태(연속 common 카운터, 마지막 조각 피티, 일일 드랍 수)와 엔진 전체 파라미터(레어리티 확률, 모멘텀/인접/탐험 가중치). 상세 로직은 [BadgeEngine 문서](../badge-engine/BADGE_ENGINE_UNIFIED.md) §3 참고.

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
> Supabase MCP `generate_typescript_types`로 받아 반영해 같은 커밋에 함께 넣을 것(`npm run db:types`는 제거돼 실행 불가).

### ambient_drop_config (재도입 — 2026-08-26, 마이그레이션 104)
앰비언트(시스템) POI 드랍 배치 설정 싱글톤(id=1). 카테고리(`poi_categories` 13종 또는 전체)·
등급비율(4종 합=1)·대상 컬렉션(`item_books` 단독/멀티/전체) 3축을 각각 명시값 또는 무작위로
설정하고, `all_random`으로 3축을 한 번에 무작위 처리할 수 있다. `auto_enabled`(예약 배포
사용 여부)·`schedule_hour_kst`(예약 배포 시각 — **KST 정시 0~23**)·`exclusion_window_minutes`
(그 시각 전후 즉시 배포 차단 창)로 예약 배포/즉시 배포 트리거의 상호 배제를 관리한다.
`last_auto_run_on`(KST 날짜)은 매시 도는 cron이 하루 2회 배포하지 않도록 조건부 UPDATE로
선점하는 **시스템 전용 필드**다 — 어드민 저장 경로에서 제외돼 있다(마이그레이션 137, 티켓
[20260906_1206](../../tickets/p1-high/20260906_1206_BadgeEngine_앰비언트-드랍-배포시각-어드민설정.md)).
`batch_size`/`max_active_per_poi`는 3축에 속하지 않는 실행
파라미터. 상세 로직은 [BadgeEngine 문서](../badge-engine/BADGE_ENGINE_UNIFIED.md) §3.12 참고.

> **구 `ambient_drop_policy`(마이그레이션 044, 100에서 DROP)와는 스키마가 다르다.** 구 모델은
> "활성 POI 수 × 커버리지 비율 → 부족분 보충"이라는 전역 목표치 모델이었고, 신규 모델은
> 실행마다 3축을 골라 `batch_size`개를 그때그때 배치하는 배치 실행형이다 — 티켓
> [20260826_009](../../tickets/p1-high/20260826_009_BadgeEngine_앰비언트-POI-드랍-재도입.md).

### ambient_drop_schedules (마이그레이션 209, 티켓 20261001_2051, 2026-10-01 적용 — RLS 활성·정책 0개·CHECK 9개 확인)
앰비언트 드랍 **날짜 예약**. 날짜(KST 정시)·지점·아이템을 정해 두면 매시 cron이 도래한 예약을 한 번만 실행한다.
싱글톤 `ambient_drop_config`와 별개 테이블이고 예약 경로는 그 설정에 쓰지 않는다. 어드민 API·cron 전용이라 RLS를 켜고
정책을 만들지 않았다(service_role만 접근). 로직은 [BadgeEngine 문서](../badge-engine/BADGE_ENGINE_UNIFIED.md) §3.12 「날짜 예약 배포」.

| 칸 | 뜻 |
|---|---|
| `id`, `title` | 예약 id, 운영자가 알아보는 이름(100자 이하, 없어도 됨) |
| `scheduled_at` | 놓을 시각. **KST 정시만** 받는다(CHECK) |
| `status` | `scheduled`·`running`·`done`·`skipped`·`failed`·`missed`·`canceled`. `stalled`(`running`이 30분 넘게 남음)는 DB 상태가 아니라 읽는 쪽이 파생한다 |
| `poi_mode` | `list`(지점 직접 선택: `poi_ids` 1개 이상 + 지점당 `per_poi_count`) · `category`(지점 종류+개수: `poi_category` + `total_count` 1~100, `poi_ids`는 비어 있음) |
| `poi_category` | `poi_categories.slug`. null은 「전체 종류」. **FK를 걸지 않았다** — `ON DELETE SET NULL`이면 종류가 지워질 때 예약이 「전체」로 넓어진다. 앱이 등록 때 존재를 확인하고 실행 때 없으면 대상 없음으로 건너뛴다 |
| `item_mode` | `items`(`badge_ids` 1개 이상, `collection_ids` 비어 있음) · `collections`(`collection_ids` 1개 이상, `badge_ids` 비어 있음) |
| `per_poi_count`, `total_count` | 1 이상. `list`는 지점 수 × `per_poi_count` ≤ 100, `category`는 `total_count` ≤ 100(1건 총 100개 상한, 임시값) |
| `created_by`, `created_at`, `updated_at` | 등록한 관리자 이메일과 시각 |
| `claimed_at`, `finished_at`, `canceled_at` | cron이 선점한 시각, 실행이 끝난 시각, 공개 전에 취소한 시각 |
| `result` | 실행 결과 요약(JSONB): 요청 수·놓은 수·실패 수·건너뜀 사유·제외 목록·겹친 지점 수·놓은 drop id. `missed`는 `{"reason":"missed"}` |

- 대기 중인 예약만 담은 부분 인덱스 `idx_ambient_drop_schedules_due (scheduled_at) WHERE status = 'scheduled'`가 cron의 도래 조회를 받친다.
- 칸 이름 `poi_ids`·`poi_category`·`badge_ids`·`collection_ids`·`per_poi_count`·`total_count`는 밸런스 규칙 R8의 키(`ops_rules`의 `economy_keys` 23개)와 겹치지 않는다.
  `jam-web/src/lib/ambient-drop/__tests__/schedule-r8-keys.test.ts`가 대조한다.
- 놓인 드랍(`poi_drops`)은 이 테이블을 가리키지 않는다. 실행 이력은 `engine_decision_log`(`ambient_batch_result`, `trigger: 'scheduled'`, `scheduleId`)에 남는다.

---

## 7. 조합 (combine) — 신규 도메인

### combination_recipes (티켓 20260917_1427 — 슬롯 구조로 재설계)
`name`(TEXT, nullable — 레시피 표시용 이름, 마이그레이션 175. 믹서 화면 상단 요약·레시피
탐색 목록에 노출. 기존 레시피는 NULL일 수 있어 화면은 "이름 없는 레시피" 폴백을 쓴다.
어드민 폼은 신규/수정 시 입력을 필수로 요구), `reward_points`, `reward_badge_ids[]`(아이템
배지만), `valid_from`(TIMESTAMPTZ, nullable — 공개 시각, 마이그레이션 204·티켓 20261001_1157. NULL이면
처음부터 공개, 값이 있으면 그 시각부터 공개하며 공개 전 레시피는 일반 유저에게 없는 레시피와 같다),
`valid_until`(TIMESTAMPTZ, nullable — 종료 시각, 마이그레이션 213·티켓 20261002_0710. NULL이면
종료 없음(상시), 값이 있으면 그 시각부터 종료하며 종료된 레시피도 일반 유저에게 없는 레시피와 같다.
이미 받은 보상은 그대로이고 삭제 가드도 그대로다. 둘 다 있으면 `valid_from < valid_until`이어야 한다 —
CHECK `combination_recipes_valid_period_check`). 재료 배열 컬럼(`ingredient_badge_ids`·`required_badge_ids`)과
비공개 레시피 컬럼(`is_public`·`hint_text`)은 제거됐다 — 재료는 아래 `combination_recipe_slots`로
옮겨졌다.

**삭제 가드** (`recipe-references.ts`, 티켓 20261001_1200): `combination_recipes.id`를 FK로 참조하는
테이블은 없다. 대신 삭제되지 않은(`deleted_at IS NULL`) 배지의 조건
`condition_json.recipe_first_success.recipe_id`가 레시피를 가리키면 단건·일괄 삭제를 막는다(단건
409, 일괄은 건너뜀 사유 — 「이 레시피를 가리키는 배지가 N개 있어요」). 참조 조회가 실패해도
삭제를 막는다(fail-closed).

### combination_recipe_slots (신규, 티켓 20260917_1427)
레시피당 슬롯 2~10개(최소 1개는 아이템 타입). `slot_order`, `badge_type`(item/activity/checkin,
슬롯 단위로 고정), `allowed_badge_ids[]`(같은 타입 배지 후보, OR — 유저는 슬롯당 하나만 채운다).

### combine_policy (싱글톤)
`fail_reward_points`(미매칭 시 지급할 고정 포인트) 하나만 남아 있다. 트라이브 다양성 티어
확률 정책·피티 카운터(`user_combine_state`)는 2026-09-10 폐기됐다.

### user_combine_fail_logs (마이그레이션 153)
믹스 실패 1건 = 1행. 어드민 유저 상세에서만 조회한다(유저 화면 비노출). `user_id`(→ `users`,
`ON DELETE CASCADE`), `attempted_at`, `ingredient_badge_ids[]`, `fail_reason`, `points_awarded`.
`fail_reason`은 CHECK로 4값만 허용한다 — `no_recipe_match`·`items_not_found`·`invalid_count`·
`recipe_not_found`. JAM! 행동 지표의 믹스 실패·시도 횟수는 이 중 `no_recipe_match`만 센다.
코드가 기록하던 `recipe_not_found`가 CHECK에 없어 저장이 조용히 실패하던 것을 마이그레이션
200(티켓 20261001_0636)에서 고쳤다. RLS를 켜고 정책을 만들지 않는다 —
service_role만 접근한다.

### user_combine_success_logs (신규, 티켓 20261001_0631, 마이그레이션 200)
믹스 성공 1건 = 1행. 보상이 전부 비어 재료만 소각된 **빈손 성공도 1행**이다. 믹스 시도·성공
횟수와 「레시피 최초 성공」 배지 조건(JAM! 행동 지표)의 원천이다.
- 컬럼: `id`, `user_id`(→ `users`, `ON DELETE CASCADE`), `recipe_id`(UUID, NOT NULL),
  `attempted_at`, `ingredient_badge_ids[]`, `result_badge_ids[]`, `points_awarded`(≥0),
  `is_recipe_first`(BOOLEAN — 그 레시피를 전체 유저 중 처음 성공한 행이면 true).
- **`recipe_id`에는 FK를 걸지 않았다.** 레시피를 지워도 그 유저의 성공 횟수와 최초 성공 기록이
  남아야 하기 때문이다. 그래서 레시피 삭제 가드(`recipe-references.ts`)는 이 테이블을 세지
  않는다.
- 인덱스: `(user_id, attempted_at DESC)`, 부분 유니크 `(recipe_id) WHERE is_recipe_first` —
  레시피마다 최초 표시 행을 DB가 1개로 강제한다.
- RLS를 켜고 정책을 만들지 않는다 — service_role만 접근한다(유저 화면 비노출).
- 과거 성공은 되살릴 수 없어 백필하지 않는다. 그래서 시도·성공 횟수는 이 기록을 시작한 날부터
  센다(실패 로그는 2026-09-10부터).
- RPC `record_combine_success(p_user_id, p_recipe_id, p_ingredient_badge_ids, p_result_badge_ids,
  p_points_awarded) → boolean` — `SECURITY DEFINER`, `EXECUTE`는 service_role만. 먼저
  `is_recipe_first = true`로 넣어 보고(`ON CONFLICT (recipe_id) WHERE is_recipe_first DO
  NOTHING`) 이미 최초 행이 있으면 `is_recipe_first = false`로 한 번 더 넣는다. 반환값은 「이
  호출이 그 레시피의 최초 성공인가」이며, 두 유저가 동시에 같은 레시피를 성공해도 최초 표시는
  정확히 1행이다. 호출은 `combineRecipeAttempt()`가 보상·포인트 지급이 끝난 뒤 한다
  (`src/lib/combine/index.ts`).
- 유저 초기화(`resetUserData`)는 이 기록도 함께 지운다.

> 조합 시스템은 v1(2026-07 초 계획) → v2(2026-07-27 재설계, "정석 레시피/재료 정확 매칭")로 갈아엎어짐. 현재 상세는 [jam-doc/planning/content/COMBINE_RECIPES.md](../../../jam-doc/planning/content/COMBINE_RECIPES.md) 참고.

---

## 8. 미션 — 신규 도메인

### missions
`mission_type`(distance/checkin/activity_count/item_collect/streak_days/duration_minutes/elevation_gain_m — `checkin`은 2026-08-26에 `poi_visit`에서 개명 — 뒤 3종은 2026-08-13 추가, 배지엔진의 `evaluateConditionDetailed`를 그대로 재사용해 판정), `condition_json`(뒤 3종은 badge-engine `BadgeCondition`과 동일한 필드 어휘 사용), `reward_type`(nullable — 배지+포인트 동시 구성 가능), `reward_badge_ids[]`(복수 배지 보상), `reward_points`, `starts_at/ends_at`(`ends_at`은 2026-08-13부터 nullable — NULL은 "상시 미션", 종료일 없음), `max_completions`, `status_display_type`(ranking/achievement/individual — `individual`은 2026-08-13 추가, 본인 진행상황만 반환하고 다른 참가자는 노출하지 않음), `visible_rank_count`, `image_url`(2026-08-15 추가 — 미션 카드 썸네일 URL. Supabase Storage `mission-images` 버킷 참조. NULL이면 플레이스홀더 표시), `condition_text`(2026-09-27 추가, 마이그레이션 193, 티켓 20260927_0026 — nullable text. 미션 상세 달성 조건 카드의 첫 줄에 쓰는 직접 쓴 조건 문장이다. 값이 있으면 카드가 이 문장을 쓰고 목표 유형별 기본 문구(「미션 완료 1 달성」 등)는 그리지 않으며, NULL이면 기존 표시 그대로다. 문장 끝에 마침표를 찍지 않는다. 어드민 폼 두 곳에서 입력한다), `gated_badge_id`(2026-08-25 추가, nullable FK → `badges.id` — 이 미션을 완료해야 획득 조건이 열리는 **본 배지**. 레벨업 미션 15종만 값을 가지며, 미션 노출 판정(`src/lib/missions/visibility.ts`)이 이 배지의 등급과 유저 보유 등급을 비교해 open/locked/hidden을 결정한다. 티켓 20260825_028. ⚠️ v5 게이트 미션은 이 필드를 쓰지 않는다 — 아래 `gate_axis` 3종이 정본이며 두 방식은 공존할 수 없다), `gate_axis`/`gate_stage`/`visibility_rule_json`(2026-09-05 추가, 마이그레이션 135, 티켓 20260905_0033 — **게이트 미션 전용, 기간형 미션에는 전부 NULL**. `gate_axis`는 이 미션이 여는 축(`{종목}:{축슬러그}`, 계열 키와 같은 형태), `gate_stage`는 `rare_to_epic`|`epic_to_mystic`(둘은 항상 짝), `visibility_rule_json`은 노출 조건 `{require_owned, hide_when_owned, unmet_visibility}`로 «해당 축 Epic 보유 AND Mystic 미보유»를 표현한다. 안쪽 계열 요구는 2단 교차 게이트(`BadgeGateRequirement`)와 **같은 형태·같은 검증 함수**(`normalizeGateRequirement`)를 쓰며, 형태가 깨지면 통과가 아니라 `locked`로 막는다(fail-closed) — 등급 없는 배지를 게이트로 걸었을 때 게이팅이 조용히 꺼지던 경로를 닫은 것이다). v5 게이트
미션 시딩(티켓 20260906_2231)은 같은 `reward_badge_ids`를 여러 `gate_axis`(예: 자전거
"요일"·"주기" 두 축 모두 동일 배지를 열어줌)에 배정해 DB 행이 실제 보상 종 수보다 많다
(53행/40종). 미션 목록 UI(`/missions`)는 `reward_badge_ids` 기준으로 대표 1행만 노출한다
(`dedupeByRewardBadge`, 티켓 20260907_0043) — DB 행 수와 화면에 보이는 카드 수가 다른 것은
버그가 아니라 이 정책 때문이다.

`exposure_mode`/`exposure_at`(2026-09-12 추가, 마이그레이션 163, 티켓 20260912_0139 — 관리자
수동 노출 제어). `exposure_mode`는 `hidden`/`start_date`(기본값)/`scheduled` 중 하나(CHECK
제약). `hidden`은 목록·오늘 피드 카드·참가 API·상세 직접 접근 등 모든 사용자 노출 지점에서
무조건 제외한다. `start_date`는 `starts_at` 시각에 노출한다 — 기존에 목록 쿼리가 `ends_at`만
필터링해 아직 시작하지 않은 미션도 노출되던 갭을 이 모드가 메운다. `scheduled`는
`exposure_at`(그 모드일 때만 사용)에 지정한 시각에 노출하며 `starts_at`과는 무관하게 노출
시점만 별도로 조정할 수 있다. 판정은 `isMissionExposed()`(`src/lib/missions/visibility.ts`)
하나로 통일하고, 게이트 미션 노출 판정(`gate_axis`/`visibility_rule_json`)보다 **먼저** 적용되는
별도 레이어다 — `hidden`이면 게이트 판정에 도달하기 전에 걸러진다. `exposure_at`이 비어 있는
`scheduled` 미션은 fail-closed로 항상 숨김 처리된다.

`image_source`(nullable text, CHECK `admin-generator`·`agent-generator`, 마이그레이션 188,
티켓 20260925_1407) — 미션 카드 썸네일(`image_url`)의 제작 경로. `admin-generator`=에셋
제너레이터 적용 탭(수동 제작), `agent-generator`=CLI가 만든 이미지(윤진 등록 스크립트, 티켓
20260925_1412 / 기존 미션 일괄 적용 도구 `apply-mission-images.mjs`, 티켓 20260926_2346). NULL이면 기존 미션(미상). 배지의 `image_source`(`badges` 테이블, 위 §8)와
값 어휘를 공유하되 배지 전용 `jam-img`는 없다. 라벨·필터 단일 출처는
`jam-web/src/lib/admin/contentImageSource.ts`(배지·미션 공용).

### user_mission_participations / user_mission_completions
참가(진행도 추적)와 완료를 별도 테이블로 관리. "참가 필수·취소 불가" 정책 — 참가자만 완료 보상 대상.

**JAM! 행동 지표의 원천**: 완료한 미션 수(`mission_complete_count`)가 `user_mission_completions`에서 `user_id`로 거른
행 수를 센다. `UNIQUE(user_id, mission_id)`라 행 수가 서로 다른 미션 수이고, 가입 이전 기록도 센다(티켓 20261001_0633).

---

## 9. 포인트 (JAM 포인트) — 신규 도메인

### point_wallets
유저당 1개. `balance`는 원장(point_transactions)에서 파생된 캐시값 — 직접 UPDATE 금지.

### point_transactions
append-only 원장. `reason`: `badge_point_reward` / `mission_point_reward` / `admin_grant` / `admin_deduct` / `combine_fail_reward` / `combine_recipe_reward` / `item_book_completion_point_reward`(마이그레이션 157).

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
| today_cards | 홈 "투데이" 카드. 템플릿 8종, 노출 기간·태그·레이아웃 관리(값 목록과 노출 규칙은 [home-feed/PRD.md](home-feed/PRD.md)). `content_type_id`(text, NULL 허용, CHECK T01~T17)는 컨텐츠 유형 카탈로그(`docs/specs/prd/content-automation/PRD.md` §6) ID로 2026-09-24 마이그레이션 183에서 추가(티켓 20260923_2259). 기존 카드는 NULL. `description`(text, NULL 허용)은 카드 게재용 설명문(부제 아래 표시, 40자 이하·줄바꿈 없음, `editorial_article` 미사용)으로 마이그레이션 197에서 추가(티켓 20260929_1335) — 상한·표시 규칙은 home-feed PRD §6. `shape`(text, NULL 허용, CHECK `hero`·`poster`·`square`·`brief`·`list`)은 카드 모양, `title_in_image`(boolean, NULL 허용)는 이미지 안에 제목이 있는지로 마이그레이션 206에서 추가(티켓 20261001_1203). 둘 다 NULL이면 옛 카드라 규칙으로 판정하고 새 카드부터 값을 저장한다(백필 없음). `pattern_no`(text, NULL 허용, CHECK·FK 없음)는 운영 항목의 패턴 번호 복사본으로 마이그레이션 211에서 추가(티켓 20260930_1503 ①, 2026-10-01 적용). 옛 카드는 NULL이고 채우는 쪽은 카드를 만드는 티켓 1500이다. RLS는 활성이고 인증 유저 SELECT 정책 「today_cards: 인증 유저 읽기」는 `is_active`이면서 노출 기간 안(`starts_at <= now() AND ends_at >= now()`)인 행만 읽게 한다(마이그레이션 214, 티켓 20261002_1257). 노출 태그(`exposure_tags`) 거르기는 정책에 없고 앱이 한다. 쓰기 정책은 없고 `anon`은 읽을 수 없다. 앱은 service 클라이언트로 읽어 이 정책을 거치지 않는다 |
| today_card_events | 투데이 카드 노출·열람·후속 행동 계측 로그(마이그레이션 183, 티켓 20260923_2259). `card_id`(→ today_cards, 삭제 시 NULL), `content_type_id`(기록 시점 값 복제), `event`(CHECK impression·click·followup), `followup_action`, `occurred_at`. **유저 식별자 컬럼 없음**(집계 전용, 결정 4-6). 인덱스 `(content_type_id, occurred_at)`. RLS 활성·정책 없음(서비스 롤만 쓰기). 기록 API·트래커는 티켓 20260924_0004. `card_shape`(text, NULL 허용, CHECK 없음)는 기록 시점에 그려진 모양의 복사본으로 마이그레이션 206에서 추가(티켓 20261001_1203)하고, 기록 API가 노출 검증의 카드 조회에서 정해 채운다(티켓 20261001_1431). 모양 도입 전 기록과 `shape`가 없는 전환 전 옛 카드의 기록은 NULL. `pattern_no`(text, NULL 허용, CHECK·FK 없음)는 기록 시점 카드의 패턴 번호 복사본으로 마이그레이션 211에서 추가(티켓 20260930_1503 ①, 2026-10-01 적용)한다. 옛 기록은 NULL이고 기록하는 쪽은 티켓 1503 ⑥이다 |
| external_input_daily | 외부 입력(날씨 구분·특일 목록)의 하루 단위 저장값(마이그레이션 184, 티켓 20260924_0602). 기본키 (`kind`, `date_kst`), `kind` CHECK(weather·special_days), `date_kst`(DATE, 한국 표준시 기준), `value`(JSONB — 날씨는 `{"kind":"clear"\|"mild"\|"rain"\|"extreme"}`, 특일은 정규화된 특일 배열), `fetched_at`. **유저 식별자 컬럼 없음**. RLS 활성·정책 없음(서비스 롤 전용). 사전 갱신 cron이 쓰고 카드 조회가 읽는 코드는 티켓 20260923_2333 |
| asset_presets | JAM! 에셋 제너레이터 프리셋(마이그레이션 185, 티켓 20260924_2159, 2026-09-25 적용). `id`(uuid), `name`, `target_type`(CHECK `badge`·`mission`·`collection`·`home_feed` 4종, 마이그레이션 187로 확장), `stage_ratio`(CHECK `1:1`·`4:5`·`9:16`·`16:9`, `16:9`는 마이그레이션 205로 확장), `layers`(JSONB — 이미지·텍스트 오버레이 레이어 목록과 순서. 텍스트 레이어는 글자 내용 `content`도 저장, 리본 레이어·배경색·리본 랜덤값·시드는 저장하지 않음, 직렬화 규칙은 `jam-web/src/lib/asset-generator/presetSerialize.ts`), `created_by`(어드민 users.id, FK 없음), `created_at`, `updated_at`(앱이 직접 갱신). 이미지 원본은 `images` 버킷 `asset-generator/presets/{presetId}/{layerId}.{png\|svg}`에 올라가고 `layers`의 `assetUrl`이 그 공개 URL을 가리킨다. RLS 활성·정책 없음(서비스 롤 전용, 어드민 API `/api/admin/asset-generator/presets`). 수동 경로(어드민)가 만들고 자동 경로(윤진 CLI, 티켓 20260924_2201)가 읽는다 |
| theme_presets | 어드민 컬러 테마 프리셋(활성 1개만 유지) |
| engine_decision_log | 배지·드랍 엔진의 판정 사후 추적 로그 (RLS 적용) |
| ops_bundles | 운영툴의 운영 묶음(마이그레이션 198, 티켓 20260930_1816). 에이전트가 `POST /api/admin/ops-inbox`로 제출한 한 주치 묶음 한 건. `id`(uuid), `bundle_id`(text, **유일** — 제출자가 정한 식별자, 재제출·동시 제출 판정), `week`(text, NULL 허용, `2026-W41` 표기), `hypothesis`(text NULL), `author`(text, 제출 에이전트 이름·자기 신고), `routine_run`(JSONB NULL), `color_rationale_link`(text NULL), `is_sample`(boolean, 기본 false — 시험 묶음), `raw`(JSONB — 제출 본문 전체, 바꾸지 않는다), `raw_hash`(text — 키 순서를 정렬한 JSON의 SHA-256, 같은 본문 재제출 판정), `format_errors`(JSONB, 기본 `[]` — 「경로: 사유」 문자열 배열), `received_at`(기본 now()). **묶음 상태 컬럼 없음**(항목 상태에서 계산, [ops-tool/PRD.md](ops-tool/PRD.md) §7). 인덱스 `(received_at DESC)`(시간당 제출 수 확인). RLS 활성·정책 없음(서비스 롤 전용) |
| ops_bundle_items | 묶음 안의 항목 한 건(마이그레이션 198). `id`(uuid), `bundle_id`(→ ops_bundles.id, 삭제 시 함께 삭제), `position`(int, 제출 배열 순서 0부터), `item_key`(text NULL — 묶음 안 고유 키, **(묶음, item_key) 유일 제약 없음**: 중복도 형식 오류로 저장한다), `kind`(text NULL — 7개 값, **CHECK 없음**: 허용값 밖도 형식 오류로 저장한다), `pattern_no`(text NULL), `starts_at`·`ends_at`(timestamptz NULL), `status`(text, 기본 `arrived`, CHECK `arrived`·`reviewing`·`approved`·`preparing`·`scheduled`·`live`·`ended`·`rejected`·`cancelled`·`failed`), `original`(JSONB — 제출 항목 원본, 바꾸지 않는다), `edited`(JSONB NULL — 직접 수정본. 검토중 항목의 직접 수정이 채운다(티켓 1818). 최상위 키 덮어쓰기라 `copy`·`colors`는 합친 객체 전체가 들어가고, 값이 원본과 같아지면 그 키가 빠진다. 남은 수정이 없으면 NULL), `created_resource`(JSONB NULL — 예약 등록으로 만들어진 자원의 ID, 티켓 1500이 채운다. 종류마다 키 하나: `today_card_id`·`mission_id`·`badge_id`·`item_book_id`·`recipe_id`·`ambient_drop_schedule_id`, 시험 묶음은 `{"sample": true}`. 계약은 [ops-tool/PRD.md](ops-tool/PRD.md) §8.5), `format_errors`(JSONB, 기본 `[]`), `created_at`, `updated_at`(앱이 직접 갱신). 조회·정렬에 쓰는 공통 필드만 열로 두고 나머지는 `original`에 둔다. 인덱스 `(bundle_id)`. RLS 활성·정책 없음(서비스 롤 전용) |
| ops_decisions | 운영툴 결정 기록(마이그레이션 198). **추가만 한다**(수정·삭제 API 없음, 지울 수 있는 것은 시험 묶음의 기록뿐). `id`(uuid), `bundle_id`(→ ops_bundles.id, 삭제 시 함께 삭제), `item_id`(→ ops_bundle_items.id NULL, 삭제 시 함께 삭제 — 묶음 전체에 대한 행은 NULL), `action`(text — `submit`(제출)·`approve`·`reject`·`edit`·`revert`(수정 되돌림)·`execute`(예약 등록으로 예약됨)·`fail`(예약 등록 실패와 실패로 닫기, 티켓 20261002_1123)·`cancel`(공개 전 취소, 티켓 20261002_1256), `end`·`external_change`(상태 맞추기, 티켓 20261002_1813), **CHECK 없음**: 뒤 티켓이 값을 더한다. 티켓 1500이 지금 종료의 `end`와 `fail`의 드랍 놓침·건너뜀을 더한다(설계 확정, [ops-tool/PRD.md](ops-tool/PRD.md) §10). 상태 맞추기는 `cancel`·`fail`에 밖에서 지워짐·멈춘 준비중도 쓴다), `actor`(text — 관리자 ID 또는 `token:<에이전트 이름>`. 상태 맞추기가 남기는 행은 `system:reconcile`), `batch_id`(uuid NULL — 일괄 승인·예약 등록 실행·공개 전 취소의 처리 번호, 그 처리로 바뀐 항목마다 1행이 같은 값을 가진다), `diff`(JSONB NULL — `edit`·`revert`의 수정 전후 차이 `[{ path, before, after }]`, `external_change`의 다른 칸만 담은 전후 값 `{ starts_at?: { item, resource }, ends_at?: { item, resource }, is_active?: { item: true, resource: false } }`, 시각은 ISO 문자열이고 시각이 없는(상시) 쪽은 null), `reason`(text NULL — 반려 이유, 수정한 이유, `fail`의 실패 사유, `cancel`의 취소 사유(선택), 상태 맞추기의 `cancel`·`end`는 「운영툴 밖에서 지워졌어요」), `slack_result`(JSONB NULL — 슬랙 알림 결과 `{ channel, ok, error? }`), `created_at`. 제출 한 번에 `submit` 1행이 남고, 결정 하나에 그 행동의 1행이 남는다(일괄 승인은 승인된 항목마다 1행, 예약 등록은 예약된 항목마다 `execute` 1행·실패한 항목마다 `fail` 1행, 공개 전 취소는 취소한 항목마다 `cancel` 1행). 행동 규칙은 [ops-tool/PRD.md](ops-tool/PRD.md) §7.3이다. 인덱스 `(bundle_id)`. RLS 활성·정책 없음(서비스 롤 전용) |
| ops_rules | 운영툴의 규칙 값(마이그레이션 207, 티켓 20260930_1459 조각 A, [ops-tool/PRD.md](ops-tool/PRD.md) §5.2). `rule_key`(text, **기본키** — 예: `open_collections_max`), `rule_group`(text, CHECK `balance`·`signal` — 신호 기준값은 조각 C가 `signal`로 같은 테이블에 넣는다. **바꾼 값만** 행이 되고 키는 기준값 키, `value`는 `{"value": <값>}`, `level`·`enabled`는 자리값 `warn`·`true`다. 기본값 행은 없고 기본값으로 되돌리면 행을 지운다. 기본값 원천은 ops-tool PRD §5.1과 `thresholds.ts`), `value`(JSONB — 규칙마다 모양이 다르다: R1~R3 `{max, provisional}`, R4 `{min_days, provisional}`, R5 `{kinds: {종류: {max, provisional}}}`, R6·R7 `{}`(R5를 따른다), R8 `{keys: [...]}`. `provisional=true`는 실측 없이 정한 임시값), `level`(text, CHECK `info`(참고)·`warn`(주의)), `enabled`(boolean, 기본 true), `updated_at`(기본 now()), `updated_by`(text NULL — 시드는 비우고, 설정 화면(조각 B·C)이 저장할 때 관리자 ID를 채운다. API 응답에는 싣지 않는다), `previous_value`(JSONB NULL — 값이 바뀔 때 이전 값을 넣는다. 설정 화면의 「직전 값으로 되돌리기」가 읽는다). 시드는 밸런스 규칙 R1~R8 8행(모두 `balance`·`warn`·켜짐). RLS 활성·정책 없음(서비스 롤 전용). 2026-10-01 적용(정책 0개·시드 8행·R8 키 23개 확인) |
| ops_patterns | 운영툴의 패턴 사전(마이그레이션 210, 티켓 20260930_1503 ①, [ops-tool/PRD.md](ops-tool/PRD.md) §10.1). 2026-10-01 적용(세 테이블 RLS 활성·정책 0개·CHECK 11개·행 0개 확인). `pattern_no`(text, **기본키**, CHECK `^P[0-9]{2,}$` — `P01`~, 번호는 재사용하지 않고 지우지 않는다), `name`, `principle`(작동 원리), `user_experience`(유저가 겪는 것), `menus`(text[], 기본 `{}`), `samples`(JSONB 배열 `[{ no, name, role, impl }]`, `role`은 `main`·`aux`·`related`), `card_shapes`(JSONB 배열 `[{ shape, note }]` — `shape` 값은 앱이 `CARD_SHAPES`로 검사하고 DB CHECK는 없다), `knobs`(JSONB 객체 `{ condition·place·time·reward: { open, closed }, tribe: { rule, example } }`), `pitfalls`(text, 기본 `''`), `status`(text, 기본 `active`, CHECK `active`·`paused`·`archived`), `pause_reason`(text NULL — `paused`이면 공백 아닌 값 필수), `origin`(text, 기본 `manual`, CHECK `seed`·`manual`·`proposal`), `origin_item_id`(uuid NULL, → ops_bundle_items.id 삭제 시 NULL, 값이 있는 행끼리 유일), `created_at`, `updated_at`(앱이 직접 갱신), `updated_by`(text NULL — API 응답에 싣지 않는다). RLS 활성·정책 없음(서비스 롤 전용). 이 테이블을 읽거나 쓰는 코드는 뒤 조각(②~⑬)이 만든다 |
| ops_pattern_taste_signals | 패턴의 취향 신호(마이그레이션 210, 티켓 20260930_1503 ①). 2026-10-01 적용. `id`(uuid), `pattern_no`(text NULL, → ops_patterns.pattern_no — NULL이면 공통 취향 신호), `name`(방향 이름), `reason`(이유), `basis`(text, 기본 `estimate`, CHECK `estimate`(추정)·`confirmed`(확정)), `evidence_decision_id`(uuid NULL, → ops_decisions.id 삭제 시 NULL — `confirmed`일 때만 값이 있을 수 있다), `confirmed_at`(timestamptz NULL — `confirmed`이면 값 필수), `confirmed_by`(text NULL — API 응답에 싣지 않는다), `sort_order`(int, 기본 0), `created_at`, `updated_at`(앱이 직접 갱신). 인덱스 `(pattern_no)`, 유일 `(COALESCE(pattern_no, ''), name)`. RLS 활성·정책 없음(서비스 롤 전용) |
| ops_pattern_common_rules | 모든 패턴에 적용하는 공통 규칙(마이그레이션 210, 티켓 20260930_1503 ①). 2026-10-01 적용. `rule_no`(int, **기본키**, CHECK > 0), `title`, `body`, `created_at`, `updated_at`(앱이 직접 갱신), `updated_by`(text NULL — API 응답에 싣지 않는다). RLS 활성·정책 없음(서비스 롤 전용) |

---

## 원안(2026-07-09) 12개 테이블 대비 변경 요약

| 원안 | 현재 |
|---|---|
| User | `users` — `display_name`→`username`, GPS/온보딩 컬럼 추가, 이후 `display_name` 표시 전용 필드로 재도입(20260830) |
| StravaConnection | `strava_connections` — 거의 원형 유지 |
| Badge | `badges` — tribe/point/soft-delete 등 대폭 확장, `type`에 `poi` 추가 |
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
- 원안은 `item_books.required_item_badge_ids`(북이 배지 목록을 가짐)였으나, 트라이브 연동과 슬롯 장착 UX가 추가되며 `badges.item_book_id`(배지가 소속 북을 가짐) 구조로 역전. 배지 하나가 정확히 하나의 북에만 속하는 현재 컨텐츠 구조(트라이브 10개 = 컬렉션 10개, 각 90종)와 더 잘 맞음.

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
- [x] `wandering_mythic_state`(삭제된 테이블 — 옛 이름 그대로 표기)의 유저 대면 UI 완성도 — **기능 전면 제거로 해소** (2026-08-24, 티켓 [20260824_017](../../tickets/p2-normal/20260824_017_Infra_떠돌이신화-기능-전면제거.md)). 프로덕션 실사용 0건(배지·상태행·획득·인벤토리 전부)이 확인되어 UI를 구현하는 대신 `wandering_mythic_state` 테이블과 `badges.is_wandering` 컬럼, `/api/cron/wandering`을 제거했다.
