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
                 ├──tribe_id──> tribes (온보딩에서 1회 선택, 유저는 직접 바꿀 수 없음 — 어드민 변경만)
                 └─1:N─ user_tribe_changes (어드민이 트라이브를 바꾼 기록, 마이그레이션 258)

[배지]          badges (activity/item/checkin) ──tribe_id──> tribes
                 ├─1:N─ user_activity_badges      (활동/아이템 배지, 행은 1개 · 반복 획득은 earn_count 누적)
                 └─1:N─ user_checkin_badge_earns  (체크인 배지, 반복 획득 가능)

[인벤토리]      users ─1:1─ inventory ─1:N─ inventory_items ──badge_id──> badges
                                              └─ slotted_in ──> item_books (슬롯 장착)

[컬렉션]        item_books ──tribe_id──> tribes
                 ├─1:N─ user_item_book_slots        (슬롯별 장착 현황)
                 ├─1:N─ user_item_book_completions   (완성 기록, 옛 구조)
                 ├─1:N─ user_item_book_tier_completions (등급별 완성 기록, 4등급 구조 — 마이그레이션 222)
                 └─1:N─ item_book_tier_rewards       (컬렉션·등급별 보상) ── tier ──> item_book_tier_default_rewards (등급별 기본 보상)

[트라이브]        tribes ─N:M(인접)─ tribes (tribe_adjacency, 드랍 모멘텀용)

[POI/드랍]      poi ──category──> poi_categories
                 ├─1:N─ poi_drops (유저 드랍)
                 └─연결─ badges (linked_badge_id)
                users ─1:1─ user_drop_state (발급 경로가 쓰는 열은 common_streak·capsule_epic_miss뿐. 옛 열 7개는 정리 SQL 272 작성됨, 출시 뒤 실행 대기)
                drop_policy (옛 싱글톤 파라미터. 코드가 쓰지 않음, 정리 SQL 271 작성됨, 출시 뒤 실행 대기)

[조합]          combination_recipes (보상만) + combination_recipe_slots (슬롯 2~5개, OR 후보)
                combine_pending_results (빈칸이 모자라 받지 않은 믹스 결과, 마이그레이션 236)
                combine_policy (싱글톤 — 실패 시 고정 포인트 · 등급 올리기 윗등급 확률)
                user_combine_fail_logs · user_combine_success_logs (유저별 믹스 실패·성공 이력)

[미션]          missions ─1:N─ user_mission_participations (참가+진행도)
                          ├─1:N─ user_mission_completions   (완료 기록)
                          ├─1:N─ mission_allowed_tribes     (참가할 수 있는 트라이브, 마이그레이션 249 — 행이 없으면 공통 미션)
                          ├─1:N─ mission_participation_cancellations (트라이브 변경으로 취소된 참가 기록, 마이그레이션 249)
                          └─1:N─ mission_item_rewards       (받은·받지 않은 아이템 배지 보상, 마이그레이션 250) ──badge_id──> badges

[포인트]        users ─1:1─ point_wallets ─1:N─ point_transactions (append-only 원장)
                point_treasury (전체 발행/회수 싱글톤 장부)
                badge_point_policy(싱글톤: 등급별·레벨형 배지 포인트 일괄 값 — 새 배지의 기본값, 마이그레이션 288)

[잼]            users ─1:1─ jam_wallets ─1:N─ jam_transactions (append-only 원장)
                users ─1:N─ jam_daily_earned (KST 날짜별 모은 양)
                jam_policy(싱글톤: 강도 배율·대량 수령 경보 기준·동기화 아이템 배지 발급 값·잠긴 아이템 배지 최소값과 잠길 확률)
                users ─1:N─ item_issue_log (아이템 배지 발급 기록, append-only)
                users ─1:N─ sync_pending_items (동기화 중 가득 차 보류한 아이템 배지)

[챕터]          users ─1:1─ user_chapters (지금 챕터·누적 점수)
                users ─1:N─ chapter_score_events (점수 기록) ──> chapter_score_rules (활동별 점수 규칙)
                users ─1:N─ chapter_ups (오른 기록) ──> chapter_definitions (챕터별 필요 점수)

[캡슐]          users ─1:1─ user_capsules (지금 캡슐: 필요량·채운 양)
                users ─1:N─ capsule_opens (열 때마다 한 줄, append-only)
                users ─1:N─ capsule_unseen_results (동기화에서 자동으로 열린 결과 중 아직 보지 않은 것)
                users ─1:N─ capsule_pending_rewards (인벤토리가 차서 보류한 캡슐 보상, 유저당 최대 2개, 마이그레이션 300 표·302 함수)
                jam_forfeit_weekly (뷰: jam_transactions의 capsule_forfeit 줄을 주 단위로 합침, 마이그레이션 302)
                capsule_policy(싱글톤: 개수·확률·보정·퀘스트 전 값) / capsule_chapter_costs (챕터별 채울 양 두 가지·100% 횟수)

[소셜]          users ─N:M(팔로우)─ users (user_follows)
                user_activity_feed (배지/드랍/미션 이벤트 통합 피드)

[어뷰징]        abusing_policy(싱글톤) / user_shadow_bans(옛 방식, 코드가 쓰지 않음, 표 정리 대기(6-4 4회)) / poi_blocks / abusing_logs
                users ─1:N─ user_suspensions (이용 정지 상태와 이력, JAM 2.0)

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
| tribe_id | 온보딩 2단계에서 선택한 트라이브 FK → `tribes.id`, nullable. **온보딩 완료 시 1회 설정된 뒤 유저는 직접 바꿀 수 없다** — 바꾸는 길은 어드민 변경(`admin_change_user_tribe`)뿐이고, 로그인한 유저가 브라우저에서 본인 `tribe_id`를 직접 쓰는 것은 DB 트리거가 거절한다(마이그레이션 260, 아래 §8 «유저의 직접 쓰기 차단»). null이면 트라이브를 고르지 않은 것이고, **앱을 쓸 수 있는지의 판정 기준이다**: `(main)` 레이아웃이 `/onboarding`으로 보내고 Strava 연결·동기화를 거절한다(티켓 20261021_1247). 개발 로그인 테스트 계정은 비어 있을 때만 로그인 라우트가 활성 트라이브를 지정한다 |
| onboarding_completed_at | 온보딩 2단계(트라이브 포함)까지 완료된 시각, nullable(티켓 20260909_2119). **리다이렉트 판정에는 쓰지 않는다** — 기준은 `tribe_id`다(티켓 20261021_1247). 완료 시각은 있는데 트라이브가 없는 계정이 있어, 이 값으로 판정하면 앱 안 게이트와 로그인 콜백이 서로 다른 곳으로 보낸다. 어드민 유저 목록의 «온보딩 완료» 표시에는 그대로 쓴다 |
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
온보딩 퀘스트(1~7단계, 연출용) 유저별 진행 상태(마이그레이션 195, 티켓 20260927_2124/상위 20260927_2123). `user_id`(PK, `users(id)` FK, 유저 삭제 시 CASCADE), `step_progress`(단계 키 `sync`·`bag`·`pickup`·`mix_fail`·`mix_success`·`drop`·`browse` → 완료 시각 ISO 문자열 JSONB, 기본값 `{}`), `skipped_at`(건너뛰기 T8 시각, 있으면 완료 배지 불가), `completed_at`(«연출 7단계를 마쳤거나 건너뜀»과 «실제 3단계 완료»가 둘 다 된 시각 — 티켓 20261021_1248부터. 그 전에는 실제 첫 활동 유입 시각이었다), `reward_granted_at`(완료 배지·100P 지급 시각 T7, 멱등 기준), `created_at`. 실제 3단계는 이 표에 기록하지 않고 `strava_activities`·`capsule_opens`·`inventory_item_events`에서 읽는다(`lib/onboarding-quest/real-steps.ts`).

행 생성 시점은 `POST /api/onboarding/complete`가 `onboarding_completed_at`을 처음 기록하는 순간(service_role, 이미 있으면 무시)이며, **기능 배포 이후 온보딩 2단계를 마친 신규 유저에게만** 만든다 — 기존 유저에게 소급 생성하지 않는다(백필 없음). 행의 존재 자체가 "퀘스트 대상"의 기준이다. 퀘스트 1~7단계는 연출용 데이터이고, 이 테이블 외의 실제 테이블(`inventory_items`·`poi_drops`·`user_activity_badges`·`point_transactions`)에는 퀘스트 때문에 행을 만들지 않는다.

RLS는 켜고 본인 행 SELECT만 허용, INSERT·UPDATE·DELETE 정책은 없다(서버 service_role 경로 전용).

**기능 스위치**: `src/lib/onboarding-quest/config.ts`의 `ONBOARDING_QUEST_ENABLED`가 `false`면 온보딩을 완료해도 행을 만들지 않는다. 하위 티켓들이 순차로 프로덕션에 나가도 스위치를 켜기 전에는 신규 유저에게 반쯤 만든 퀘스트가 보이지 않게 하기 위함이며, 스위치는 상위 티켓의 마지막 단계에서 켠다.

### strava_connections
원안과 거의 동일. `access_token`/`refresh_token` 암호화 저장, `backfill_completed` 유지.

**연결 상태 세 칸**(마이그레이션 225, 티켓 20261017_1422). 모두 덧붙인 칸이라 옛 칸의 뜻은 그대로고, 옛 `users.initial_sync_done`도 바꾸지 않는다.
- `first_sync_pending` (boolean, NOT NULL, 기본 false): true인 연결은 `users.initial_sync_done`과 상관없이 첫 동기화 규칙(인정 활동 가운데 최근 1건)을 쓰고, 동기화 조회 커서를 `strava_activities`의 최신 시각에서 읽지 않는다(이전 계정의 활동 이력에 끌려가지 않게). 인정 활동을 정산한 동기화가 끝나면 false로 돌아간다. 정산이 0건이면 true로 남는다. 다른 Strava 계정을 연결해 새 행이 생길 때만 콜백이 true로 만든다.
- `disconnected_at` (timestamptz, NULL 허용): NULL이면 연결 중이고 값이 있으면 끊김이다.
- `disconnect_reason` (text, NULL 허용): `token_refresh_failed`(토큰 갱신 실패) · `token_revoked`(Strava가 401로 철회를 알림) · `user_disconnected`(유저가 직접 끊음).

**연결 상태 규칙**(`src/lib/strava/connection-state.ts`가 판정 한 곳이다): 행이 없으면 `none`, 행이 있고 `disconnected_at`이 NULL이면 `connected`, 값이 있으면 `disconnected`. 화면은 여기에 끊김 사유를 더한 `resolveStravaUiState`(`connected`·`none`·`disconnected_error`·`disconnected_user`)를 쓴다 — `user_disconnected`만 `disconnected_user`이고 나머지 사유(비어 있는 사유 포함)는 `disconnected_error`다. 행의 존재를 «연결됨»으로 읽는 곳은 없다: 홈·상단 메뉴·배지 상세·공유 데이터·소식 경고 판정은 이 판정으로 읽고, 백필·동기화 정체 소식 배치·어드민 초기화·일괄 삭제 영향 집계는 끊김 행을 건너뛴다.

끊김 행은 동기화하지 않는다 — 수동 동기화 API(`POST /api/strava/sync`)는 500이 아니라 409(`code: strava_disconnected`, `connectionState: disconnected`)로 알린다. 토큰 갱신이 **인증 오류**(Strava 응답 400·401·403)로 실패하거나 활동 조회가 401이면 끊김으로 저장하고 `strava_disconnected` 소식을 하루 한 번 보낸다. 5xx·네트워크 오류·시간 초과 같은 **일시 실패**는 끊김으로 저장하지 않는다(실패 기록과 소식만 남기고 다음 동기화에서 다시 시도). 끊긴 행의 기록·배지·잼·포인트는 다른 테이블에 있어 그대로 남는다.

**연결 규칙**(`GET /api/strava/callback`): 한 JAM 계정에는 연결이 하나뿐이다. 토큰 교환 뒤 `strava_athlete_id`로 기존 연결을 먼저 찾는다.
- 다른 JAM 계정에 이미 연결된 Strava 계정(끊김 포함)이면 콜백은 아무것도 저장하지 않는다. 기존 행의 `user_id`는 덮어쓰이지 않는다(옛 upsert는 덮어썼다). 기존 계정(`users`)을 읽어 둘로 나눠 보낸다(티켓 20261021_1249 4회, 운영 로직 3.2절).
  - 일반·정상 계정이면 방금 받은 토큰을 쿠키 `strava_replace_offer`에 담아 `/profile?strava=duplicate`로 보낸다(아래 «그래도 연결하기»).
  - 어드민(`is_admin` 또는 화이트리스트 이메일)이거나 이용 정지 중(`user_suspensions`에 진행 중인 행)이거나 유저 행이 없으면 쿠키 없이 `/profile?strava=duplicate_blocked`로 보낸다. 읽지 못하면 «지워도 된다»로 보지 않고 `/profile?strava=error&reason=db_error`로 닫는다.
- 같은 유저의 같은 Strava 계정이면 토큰만 갱신하고 끊김 칸을 지운다. `first_sync_pending`과 `last_synced_at`은 그대로라 마지막 동기화 뒤부터 이어서 가져온다.
- 같은 유저가 다른 Strava 계정을 연결하면 새 행을 `first_sync_pending=true`로 만들고 이 유저의 이전 연결 행을 지운다. 이전 행 삭제가 실패하면 방금 넣은 새 행을 되돌려 같은 `user_id`의 행이 둘 남지 않게 한다.
- 위 두 저장은 `lib/strava/connection-save.ts`의 `saveStravaConnection`이 맡고 콜백과 `POST /api/strava/replace`가 같이 쓴다. 기존 계정 판정(`assessDuplicateOwner`)과 연결 직후 즉시 동기화(`syncAfterConnect`)도 같은 파일이다.

**«그래도 연결하기»**(티켓 20261021_1249 4회, 운영 로직 3.2절). DB 표를 더하지 않고 인증으로 받은 토큰을 10분짜리 쿠키에 담는다.
- 쿠키 `strava_replace_offer`(`lib/strava/replace-offer.ts`): httpOnly, `sameSite=lax`, `path=/api/strava`, `maxAge=600`, `secure`는 운영에서만. 값은 `{iv}:{암호문}.{서명}`이다. 내용(JSON: 로그인한 유저 id, Strava athlete id, 방금 받은 access·refresh 토큰, 토큰 만료 시각, 제안이 닫히는 시각)을 기존 `encrypt`(AES-256-CBC)로 암호화한 뒤 암호문에 HMAC-SHA256을 붙인다. 서명 키는 `ENCRYPTION_KEY`에서 용도 문자열로 파생한다(새 환경변수 없음). 개봉은 서명을 상수 시간으로 비교한 뒤 복호화하고 만료를 확인한다.
- `POST /api/strava/replace`(본문 없음, 쿠키와 세션이 입력): 로그인 확인(401) → 쿠키 개봉(없음·변조·만료·다른 유저의 것은 400, `next: 'restart'`) → 이 Strava 계정을 가진 기존 계정을 **다시** 찾아 판정(어드민·이용 정지·유저 행 없음은 403 `next: 'blocked'`, 읽기 실패는 500 `next: 'retry'`) → `deleteAccount(기존 계정, { skipStravaDeauthorize: true })`(실패는 500 `retry`, 그사이 이미 지워졌으면 그대로 이어감) → 새 연결 저장(`first_sync_pending=true`) → 이 유저의 이전 연결 정리 → 첫 동기화(실패해도 성공) → `200 { success: true }`. 기존 계정이 로그인한 유저 자신이면 지우지 않고 토큰만 갱신한다. 기존 계정을 지운 뒤 저장이 실패하면 500 `restart`와 고정 문구(`d.stravaConnection.replaceResult.afterDeleteFailed`)다. 성공·`restart`·`blocked`에서는 쿠키를 지우고 `retry`에서는 남긴다. 실패 응답은 `{ error, next }`이고 `error`는 `d.stravaConnection.replaceResult.*`의 완성 문장이다. DB·Auth·Strava 오류 원문과 토큰·쿠키 값은 응답과 로그에 싣지 않는다.
- 화면은 `components/strava/StravaDuplicateSheet.tsx`다. `?strava=duplicate`는 «취소»와 «그래도 연결하기», `?strava=duplicate_blocked`는 «닫기»와 «문의하기»(`/voc`)를 보인다. 성공하면 `window.location.replace('/profile?strava=connected&reveal=1')`로 이동한다.

**연결 끊기와 좌표 파기**(`POST /api/strava/disconnect`, 마이그레이션 265, 운영 로직 3.2·18.5절): 끊김을 저장한 뒤 `scrub_user_location(p_user_id) → jsonb`를 부른다(`service_role` 전용, `SECURITY DEFINER`). 지우는 것은 `users.last_location_lat/lng/at`(NULL로)과 `strava_activities.normalized`의 `startLatLng`·`endLatLng` 키뿐이다. 값이 이미 비어 있는 행은 건드리지 않아 다시 불러도 안전하고 반환은 `{ user_location_cleared, activities_cleared }`다. 좌표 없는 확인자료와 `abusing_logs`는 지우지 않는다. 실패하면 한 번 더 부르고 두 번 모두 실패해도 끊기는 200이다(서버 로그만). 이미 끊긴 연결과 끊김 저장 실패에는 부르지 않는다. 끊긴 연결을 하루 한 번 쓸어 담는 파기는 후속 티켓 `20261022_0500`이다.

**연결 끊기**(`POST /api/strava/disconnect`): Strava 앱 연결을 해제(`POST /oauth/deauthorize`)하고 — 실패해도 계속한다 — 저장된 토큰을 지운 뒤 `user_disconnected`로 끊김을 저장한다. 행은 지우지 않는다. 연결 행이 없으면 404이고, 이미 끊긴 연결에 다시 부르면 앱 해제를 부르지 않고 200으로 돌려주며 `disconnected_at`·`disconnect_reason`을 덮어쓰지 않는다(멱등). 프로필 수정 화면의 «동기화 끊기» 확인 시트가 이 API를 부르고, 200과 404를 모두 성공으로 처리한다.

**화면의 접근 규칙**: 클라이언트(프로필 수정)가 이 테이블을 읽을 때는 `select('*')`를 쓰지 않고 `disconnected_at, disconnect_reason, last_synced_at`만 고른다 — 토큰 칸이 브라우저로 내려가면 안 된다.

### strava_sync_failures
Strava 동기화 실패 기록(마이그레이션 176, 값 추가 218). `failure_type`(`token_refresh_failed`·`rate_limited`·`strava_api_error`·`drop_attempt_failed`), `error_message`, `occurred_at`. `syncStravaActivities()`의 실패 경로가 남기며, 기록이 실패해도 동기화 자체는 막지 않는다. `drop_attempt_failed`는 동기화 중 드랍 시도(`tryItemDrop`)가 던진 오류를 활동 단위로 남기는 값이다 — 동기화 자체는 성공하고 그 활동만 드랍 기회가 복구되지 않으므로, `error_message`에 `stravaId=<값>: <메시지>`를 적는다. 어드민 주간 집계(`/api/admin/kpi/weekly`)의 원천이다. `stravaSyncFailures`는 `drop_attempt_failed`를 제외한 건수이고, 그 유형의 건수는 `dropAttemptFailures`가 따로 센다. RLS를 켜고 정책을 두지 않아 service_role만 접근한다. `user_id`는 원인 추적용이고 집계 응답에는 넣지 않는다.

### strava_activities (신규)
동기화 원본 활동 기록. `strava_id`, `jam_activity_type`, `distance_km`, `normalized`(정규화된 활동 JSON), `processed_via`(sync/reconcile/manual_backfill). UNIQUE(user_id, strava_id)로 중복 동기화 방지 — 이기종 데이터 중복 이슈의 실제 해결책.

**걸러짐 표시 두 칸**(마이그레이션 223, 티켓 20261017_1421):
- `filter_reason` (text, NULL 허용): NULL이면 인정 활동, 값이 있으면 걸러진 사유(`virtual`·`unsupported_sport`·`manual_entry`·`file_upload`·`no_gps`·`too_short`·`vehicle_speed`·`suspended`; `suspended`는 이용 정지 구간 `[suspended_at, lifted_at)`에 시작한 활동에 동기화가 붙이고(정산하지 않고 행만 남김, 티켓 20261017_1426) `too_short`는 교통수단 구간을 뺀 뒤 10분 미만일 때도 붙는다). 걸러진 활동도 저장하지만 이력 조회(`getActivityHistory`)는 `filter_reason IS NULL`인 행만 읽는다. 「이미 처리한 활동」 조회는 걸러진 행도 포함한다. 옛 행은 NULL이라 인정으로 읽히며 소급하지 않는다. 판정 기준은 `BADGE_ENGINE_UNIFIED.md` §1 「인정 활동 입구」.
- `source_meta` (jsonb, NULL 허용): 인정 판정에 쓴 원본 값의 유무·모양 요약(종목 이름, `manual`, 업로드 번호 유무, 외부 ID 모양(없음/파일 이름/그 밖), 시작 좌표 유무, 경로 요약 유무, 종목 불일치로 걷기로 바꿨을 때만 원래 종목 `typeMismatchFrom`). 경로 요약 본문·좌표·외부 ID 원문은 담지 않는다. 파일 업로드 판정이 추정 기준이라, 나중에 실제 데이터로 기준을 검증하고 고치기 위한 근거다.

`normalized`의 구조는 `NormalizedActivity`(`src/types/strava.ts`)다. 2026-09-05부터 v5 확장
6필드(심박·파워·케이던스·최고속도·최고도달고도·경과시간)가 함께 저장되며, **측정값이 없으면
키 자체가 없다**(`null`이 아니다 — 티켓 20260905_0029). 컬럼 변경은 없다(jsonb).
확장 필드를 소급 채운 행은 `normalized.extendedBackfilledAt`(ISO 문자열)로 표시한다 — **`processed_via`는 덮어쓰지 않는다.** 그 값은 «이 행이 어떤 경로로 들어왔는가»이지 «나중에 무엇으로 채워졌는가»가 아니며, 덮어쓰면 유입 경로 이력이 사라진다
(`jam-web/scripts/backfill-strava-extended-fields.ts`). `'reconcile'`은 2026-08-10 이전 과거 데이터에만
있고 신규 기록은 없다.

**JAM! 행동 지표의 원천**: 주간 활동일(`weekly_active_days`)과 최근 30일 활동일(`signup_recent_active_days`)의
「활동한 날」이 이 테이블의 `start_date`(timestamptz — 현지 시각 열은 없다)를 KST 날짜로 옮겨 센다. 가입한 날
이후 행만 읽고, `normalized`의 `jamActivityType`·`distanceKm`·`movingTimeSec`·`averageSpeedKmh`로 JAM! 종목·걷기
게이트·차량 속도 필터를 통과한 활동만 센다(티켓 20261001_0633). 걸러진 활동(`filter_reason`이 있는 행)은 읽지 않는다(티켓 20261017_1421).

### 계정 삭제: retained_records · prepare_account_deletion · purge_expired_retained_records — 마이그레이션 262·263·264, 티켓 20261021_1249 1·2·3회
운영 로직 17장. 유저 탈퇴, 어드민 삭제(단건·일괄), «그래도 연결하기»의 기존 계정 지우기가 **같은 규칙**으로 지운다. 규칙은 앱의 `deleteAccount`(`lib/account/delete-account.ts`)가 갖고,
어드민 삭제(`hardDeleteUser`)와 유저 탈퇴(`POST /api/account/delete`), «그래도 연결하기»(`POST /api/strava/replace`)가 이 함수를 부른다. 공용 DB 적용 여부는 티켓 완료 기록을 따른다.
«그래도 연결하기»만 옵션 `skipStravaDeauthorize`를 켠다: 지우는 계정과 새로 연결하는 계정이 같은 Strava 계정이라 앱 승인 해제가 방금 받은 새 토큰까지 무효로 만들 수 있다(추정). 켜면 아래 2번(토큰 읽기)과 6번(해제)을 모두 건너뛰고 나머지 순서와 실패 처리는 그대로다.

**지우는 순서** (`deleteAccount`):
1. 어드민 계정은 거절한다(`admin_account`). 호출부의 거절과 별개인 이중 안전장치다.
2. Strava 토큰을 메모리로 읽어 둔다(`strava_connections`의 암호화된 토큰 칸). 연결 행은 계정을 지울 때 함께 사라지기 때문이다. 연결이 없거나 이미 끊겼거나 읽기가 실패하면 해제를 건너뛸 뿐 멈추지 않는다.
3. 아바타 파일 삭제(`lib/account/avatar-cleanup.ts`: `avatars` 버킷의 `${userId}/` 폴더를 목록으로 읽어 모두 지운다. 구글 사진 URL을 쓰는 유저는 파일이 없다). **실패해도 계정 삭제는 멈추지 않고** 서버 로그에만 남긴다. 준비 RPC보다 앞이다: 아이템이 «없어짐»으로 바뀐 뒤 계정 삭제까지의 틈에 느린 파일 삭제가 끼지 않게 한다(티켓 20261021_1841). 대신 준비 RPC가 실패하면 계정은 남는데 아바타 파일은 이미 지워진 상태가 된다.
4. 준비 RPC `prepare_account_deletion(p_user_id) → jsonb` — 한 트랜잭션, 다시 불러도 안전(두 번째 호출은 모든 건수가 0). 실패하면 여기서 멈추고 계정은 지우지 않는다(`prepare_failed`).
5. `auth.admin.deleteUser` — `public.users`가 `auth.users`를 `ON DELETE CASCADE`로 참조해 나머지는 외래키가 연쇄로 지운다. 실패는 고정 코드 `delete_failed`로만 돌려주고 원문은 서버 로그에 남는다.
6. 계정 삭제가 성공했을 때만 Strava 쪽 앱 승인을 해제한다(`lib/strava/deauthorize-connection.ts`, 연결 끊기 API와 같은 함수: 만료 직전이면 토큰을 갱신하고 `POST /oauth/deauthorize`). 실패는 로그만 남기고 탈퇴는 성공이다. 탈퇴 화면은 Strava 앱 목록에서 JAM!이 빠진다는 약속을 하지 않는다(해제 실패는 로그만 남아 지킬 수 없다).

**유저 탈퇴 API** (티켓 20261021_1249 3회, 운영 로직 17.1절):
- `POST /api/account/delete` 본문 `{ confirmPhrase }`. 순서: 로그인 확인(401, `d.common.authRequired`) → 확인 문구 서버 재검사(400, 앞뒤 공백 무시·NFC 정규화, 상수 `WITHDRAW_CONFIRM_PHRASE`=«탈퇴합니다») → `deleteAccount`. 지울 대상은 세션의 유저뿐이다(본문의 id는 읽지 않는다). 어드민 계정은 403, 유저 행이 없으면 404, 준비·삭제 실패와 예외는 500이다. 성공은 `200 { success: true }`. **이용 정지 중인 유저도 탈퇴할 수 있다**(`assertNotSuspended`를 부르지 않는다, 운영 로직 16.4). 실패 응답은 `d.account.*`의 고정 문장이고 DB·Auth 원문을 싣지 않는다.
- `GET /api/account/delete-summary` — 로그인한 유저 본인의 «지워지는 것» 수치 `{ summary: { activityBadgeCount, checkinBadgeCount, itemCount, jamBalance, pointBalance, stravaConnected } }`(`lib/account/summary.ts`). 액티비티 배지는 `user_activity_badges` 행(삭제된 배지 제외), 체크인 배지는 `user_checkin_badge_earns`를 배지 종류로 합친 수, 아이템은 인벤토리의 `destroyed_at IS NULL` 개체 수(준비 RPC가 «없어짐» 처리하는 수), 잼·포인트는 각 지갑 잔액, Strava는 끊기지 않은 연결이 있을 때만 true다. 조회가 하나라도 실패하면 0으로 위장하지 않고 500이며, 화면은 수치 없이 일반 문장을 보이고 탈퇴는 막지 않는다.
- 화면은 프로필 편집의 «탈퇴하기»(`components/account/WithdrawSheet.tsx`)다. 성공하면 브라우저에서 `signOut({ scope: 'local' })`을 마친 뒤 `window.location.replace('/login?withdrawn=1')`로 이동하고, 로그인 화면이 «탈퇴가 끝났어요. 계정을 지웠어요.» 안내를 보인다(`?error`가 함께 있으면 오류 배너만). 트라이브를 고르지 않아 온보딩에 머무는 유저는 프로필 편집에 닿지 못한다(티켓 20261021_2124).

**prepare_account_deletion** (SECURITY DEFINER, `search_path = public`, `service_role`만 실행):
- `users` 행을 `FOR UPDATE`로 잠근다. 없으면 `{found:false}`.
- 보관 복사(`retained_records`, `ON CONFLICT (kind, source_id) DO NOTHING`, 이미 기간이 지난 기록은 복사하지 않는다): 체크인 배지 획득 `checkin_earn`, 장소 열람 `poi_view`, 드랍 `poi_drop`(`dropper_user_id`), 픽업 `poi_pickup`(`picked_up_by`)은 최근 6개월, 부정 이용 탐지 기록 `abuse_log`는 최근 3개월.
  확인자료는 식별자와 시각만 담고(`poi_id`·`badge_id`·`strava_activity_id`) 좌표·활동 이름·거리는 담지 않는다. `abuse_log`만 탐지 시점 좌표가 든 `detail`을 담는다. `retained_until` = 기록 시각 + 기간.
- `custody_events`의 `*_username`을 짝 `*_user_id`가 이 유저인 행에서 NULL로 비운다.
- 이 유저 인벤토리의 `destroyed_at IS NULL` 아이템마다 `Orphan` 이벤트(`from_user_id` = 유저, 이름 NULL)를 넣고 `destroyed_at = now()`와 `inventory_id = NULL`(소유 비우기, 마이그레이션 108의 파괴 규약)로 «없어짐» 처리한다. 새 이벤트 종류를 만들지 않는다(`custody_events_event_type_check` 불변). 일련번호는 다시 쓰일 수 있다(알려진 틈 참고).
- 반환: `{found:true, retained:{checkin_earn, poi_view, poi_drop, poi_pickup, abuse_log}, custody_rows_cleared, vanished_items}`. 앱 파서 `parsePrepareResult`가 이 모양만 인정하고 그 밖은 `prepare_failed`로 멈춘다.

**retained_records** (마이그레이션 262): `id`, `kind`(CHECK 5종), `source_id`(원본 행 id, 외래키 없음), `subject_user_id`(지운 유저 id, 외래키 없음), `occurred_at`, `detail`(jsonb), `retained_until`, `created_at`. `UNIQUE (kind, source_id)`, `retained_until` 인덱스.
RLS 켬 + 정책 없음 + `anon`·`authenticated` 권한 회수 = `service_role` 전용이다. 어드민 화면은 없고 수사 등 요청이 오면 SQL로 조회한다. 기간 상수는 `lib/account/retention.ts`이고 시험이 SQL 파일과 같은지 확인한다. 법무 확인(티켓 20260929_1303)에서 기간이 바뀌면 상수와 함수를 함께 고친다.
**purge_expired_retained_records()** → `retained_until <= now()`인 행을 지우고 지운 수를 돌려준다(`service_role` 전용). 하루 한 번 일일 크론 `/api/cron/poi-cleanup`(매일 UTC 00:00, `vercel.json` 변경 없음)이 앱의 `purgeExpiredRetainedRecords`(`lib/account/purge-retained.ts`)로 부른다. 부정 이용 탐지 기록 파기가 실패해도 이 호출을 하고, 이 호출이 실패해도 크론 응답은 200이며 `retainedRecordPurgeError`로만 알린다(응답의 `purgedRetainedRecords`가 지운 수). 드랍 소각 RPC가 실패해 크론이 500으로 끝나는 날에는 파기하지 않고 다음 실행으로 넘어간다.

**어드민 삭제의 응답**: 실패하면 DB·Auth 오류 원문 대신 고정 문구 «계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.»(`ADMIN_DELETE_FAILED_MESSAGE`)만 나간다(단건 500, 일괄 `skipped` 사유). 일괄 미리보기(`dry_run`)는 삭제 안내에 `vanishingItemCount`(없어질 아이템 수)와
`retainedRecordCount`(보관 표로 복사될 기록 수)를 더해 알린다.

**알려진 틈**:
- 준비 함수를 거치지 않고 Supabase 화면에서 직접 지우는 경우는 옛 동작 그대로다(트리거가 `OLD.username`을 남기고 보관 복사·이름 비우기가 없다).
- 준비와 계정 삭제 사이에 새로 생긴 기록은 보관 표로 복사되지 않는다. 준비 뒤 계정 삭제가 실패하면 소유 아이템은 이미 «없어짐» 처리된 상태이며, 다시 지우면 이어서 처리된다. 유저 탈퇴 화면은 이 경우에도 «다시 시도해 주세요»만 안내하고 계정이나 데이터가 그대로라고 단정하지 않는다(티켓 20261021_1841에서 아바타 삭제를 준비 앞으로 옮겨 틈을 줄였다).
- 이미 지워진 유저가 남긴 이름 스냅샷(이 규칙 이전)은 `*_user_id`가 비어 있어 준비 함수가 찾을 수 없다. 마이그레이션 264가 한 번 비운다(아래 «탈퇴 유저 표시»). 화면은 264 적용 여부와 상관없이 `*_user_id`가 NULL인 칸의 이름 문자열을 쓰지 않는다.
- **일련번호 재사용**: 일련번호 유일 인덱스(`idx_inventory_items_serial_number_active`)와 `assign_random_serial()`은 `destroyed_at IS NULL`인 개체만 겹치지 않게 막으므로(마이그레이션 108), «없어짐» 처리한 개체의 번호는 다시 쓰일 수 있다. 번호를 1~999,999에서 무작위로 고르므로 새 아이템을 발급할 때 특정한 없어진 번호가 뽑힐 확률은 한 번에 약 100만 분의 1이고(발급이 쌓이면 누적된다), 어드민 삭제·믹스로 없어진 개체와 같은 동작이다. 운영 로직 6.3·17.2의 «번호를 다시 쓰지 않는다»를 보장하려면 옛 인덱스와 함수를 바꿔야 하므로 후속 티켓 `20261021_1849`에서 다룬다.
- 문의 기록은 DB가 아니라 Tally와 연결된 읽기 전용 구글 시트라 지우지 않는다. 방침대로 처리 완료 후 3년 보관한다(사용자 결정, 2026-10-21).

**탈퇴 유저 표시** (티켓 20261021_1249 2회, 운영 로직 17.2절): 지운 유저가 남긴 이력의 행위자 칸은 외래키 `ON DELETE SET NULL`로 비워진다(`custody_events.*_user_id`, `poi_drops.dropper_user_id`·`picked_up_by`, `notifications.actor_user_id`).
화면은 비어 있는 행위자를 **고정 텍스트 `₩*&%#@`**(사용자가 정한 텍스트, 사전 `ko.withdrawnUser.name`)로 보인다. 안내 문구 «₩*&%#@님은 탈퇴한 사용자입니다»(`ko.withdrawnUser.notice`)는 이름 요소의 `title`과 `aria-label`에만 쓰고, 누를 곳이 없으므로 링크와 팝업은 없다.
**«비었다»만으로는 탈퇴인지 원래 비었는지 알 수 없어**, 칸마다 탈퇴 판정 규칙이 다르다. 규칙은 순수 함수 `lib/account/withdrawn-actor.ts`가 갖는다.
- `custody_events`: 이벤트 종류별 **필수 칸**의 `*_user_id`가 NULL이면 탈퇴다. 필수가 아닌 칸의 NULL은 원래 빈 것이다.

  | 이벤트 | 필수 칸 |
  |---|---|
  | `Minted` · `Expire` | 없음(셋 다 원래 빈다) |
  | `UserDrop` · `Orphan` | `from` |
  | `Pickup` | `to`, 그리고 유저 드랍을 줍는 경우의 `from` |
  | `Slot` · `Unslot` · `Consume` · `AdminDestroy` | `actor` |
  | `AdminReassign` | `to`, `actor` |

  `Pickup.from`이 NULL일 때 시스템 드랍인지 탈퇴인지는 이벤트만으로 알 수 없어, 같은 개체의 `poi_drops` 중 `picked_up_at`이 이벤트의 `created_at`과 같은 행의 `source`로 가른다(어드민 이력 한정. 2026-10-21 실측 105건 중 100건 일치, 5건은 짝이 없어 아무것도 그리지 않는다).
  `*_user_id`가 NULL인 칸에 이름 문자열이 남아 있어도 화면은 쓰지 않는다.
- `poi_drops`: `source = 'user'`인데 `dropper_user_id`가 NULL이면 드랍한 유저가 탈퇴한 것이다. `source = 'system'`(앰비언트)은 원래 NULL이다. `picked_up_at`이 있는데 `picked_up_by`가 NULL이면 항상 탈퇴다.
- `notifications`: 행위자를 쓰는 5종(`drop_picked_up`, `followed`, `following_rare_badge`, `following_collection_complete`, `following_mission_complete`)에서만 행위자가 없으면 탈퇴다. 나머지 종류의 행위자 칸은 원래 비어 있다.
- 피드(`user_activity_feed`)·팔로우·미션 참가는 외래키 `CASCADE`로 행이 사라지므로 표시할 자리가 없다.

**마이그레이션 264** (`264_clear_withdrawn_custody_usernames.sql`): 263 이전에 이미 지워진 유저의 옛 이름 스냅샷을 비우는 **데이터 정리 한 번**이다. `custody_events`에서 `*_user_id`가 NULL인 칸의 `*_username`을 NULL로 바꾼다(2026-10-21 조사로 13건: `Slot.actor` 7, `Pickup.from` 1, `Orphan.from` 5).
제약·외래키·트리거·함수는 바꾸지 않고, 되돌림 SQL은 없다(지운 이름의 사본이 표에 없다). 파일 머리말에 실행 전·후 확인 SELECT가 있다. 공용 DB 적용 여부는 티켓 완료 기록을 따른다.

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
| is_hidden | 숨김 배지(마이그레이션 243, 티켓 20261018_1815 3회). 기본 false. true이면 **받기 전까지** 배지함·상세·공유 응답·개수 어디에도 이름·조건이 내려가지 않는다(서버가 거른다 — BADGE_ENGINE_UNIFIED §2.18). 이미 받았으면 다른 배지와 같다. DB 제약: 액티비티 배지만(`badges_hidden_activity_only`), 포인트 0(`badges_hidden_no_points`), 등급은 Common 또는 없음(`badges_hidden_common_only`) |
| branch_key | 배지의 가지 분류(마이그레이션 243). 유저 화면에는 가지 이름을 보이지 않는다(배지 트리 화면 제거, 티켓 20261018_1817). 기본 NULL(분류 없음). 값: `rhythm`·`recovery`·`time_season`·`explore`·`attribute`·`milestone`·`jam_activity` 중 하나(`badges_branch_key_known`). 어드민 입력은 4-5, 화면 표기는 4-6 |
| tribe_id | 소속 트라이브 (아이템 배지) |
| item_book_id | 소속 컬렉션 (구조 역전 — 컬렉션이 배지 목록을 갖는 게 아니라 배지가 소속 컬렉션을 가짐) |
| drop_weight / drop_condition_json | 옛 드랍엔진 판정용. 새 발급 경로(`syncIssue.ts`)는 후보를 균등 무작위로 골라 읽지 않는다(코드에서 읽는 곳은 어드민 배지·트라이브 양식뿐) |
| valid_from / valid_until | 노출 기간 |
| point_reward | 발급 시 지급 포인트. 잠긴 채 받은 아이템 배지는 주지 않는다(열린 상태가 될 때 한 번 준다. 연 때의 포인트·포인트 소식·피드는 `openLockedItem`이 처리한다, 티켓 20261026_1031). 아이템·체크인 배지 값은 마이그레이션 253으로 규칙 값이 되었다(현황은 포인트 객체 모델 1.7). 새 배지의 기본값(등급별·레벨형 일괄 값)은 `badge_point_policy`(마이그레이션 288)에 있다 |
| always_locked | **잠김으로 만든 아이템 배지**(boolean, 기본 false, 마이그레이션 231). true면 어느 경로로 얻어도 늘 잠긴 채 나온다(`lock_reason = badge_locked`). 어드민 양식 입력은 2회 |
| unlock_required | 여는 데 필요한 잼의 양(integer, nullable, 양수, 마이그레이션 231). NULL이면 그 등급의 최소값(`jam_policy.locked_min_*`)을 쓴다. 최소값보다 적게는 저장하지 않는다(앱 코드가 막는다, 2회). 개체에는 배정될 때 이 값이 고정된다 |
| deleted_at | 소프트 삭제 |
| background_color | 배지 상세화면 배경 테마 컬러(nullable). `background_image_url`이 없을 때만 렌더링에 쓰임. 어드민에서 이미지 업로드 시 평균 컬러 자동 프리필 + 수동 오버라이드 가능(20260818_003). TopNav·히어로카드·고정 배경 레이어에 실제 렌더링됨 |
| background_shader_id | 배지 상세화면 배경 쉐이더 식별자(nullable). 어드민에 선택 UI는 있으나(20260818_003, placeholder 목록) **렌더링에는 미연결** — 값이 있어도 무시됨. `background_image_url` 도입(20260819_008) 이후 이 컬럼을 통한 실시간 쉐이더 렌더링 경로는 채택되지 않음 — 사실상 레거시 |
| background_image_url | 배경 제너레이터(패턴/애니메이션 + Paper 셰이더 필터 합성)로 만든 배경을 어드민에서 static PNG로 구워(bake) Storage에 올린 뒤 저장하는 URL(nullable, 20260819_008). **`background_color`보다 우선 렌더링**됨(`getBadgeBackgroundStyle`) — 값이 있으면 이 이미지를, 없으면 `background_color`로 폴백. `background_color`와 상호 배타적으로 쓰임(어드민에서 저장 시 반대쪽을 null로 정리, DB 제약 아님). 원시 설정값(이미지·패턴/애니메이션 파라미터·필터 종류)은 저장하지 않음 — 재편집 가능한 설정이 아니라 완성된 이미지 1장 |
| background_animation | 배지 상세화면 **이미지 카드 안**에서 라이브 실행하는 블롭 애니메이션 파라미터(jsonb, nullable, 20260901_1944). 위 세 배경 컬럼과 **렌더링 지점이 다르다** — 전체 배경 레이어가 아니라 430×430 Hero 카드 내부의 `<canvas>`다. 영상 배경(`background_video_url`)과 달리 파일을 굽지 않고 파라미터만 저장해 재편집이 가능하다. 값 형태는 `{ type: 'blob', colors: [4색], bgColor, speed, seed, blur, scale }`이며, jsonb라 스키마 검증이 없어 `parseBlobAnimation`이 관용적으로 정규화한다(형식이 어긋나면 `null` = 애니메이션 없음). **렌더링 우선순위 최상위** — 아래 «배경 렌더링 우선순위» 참고 |
| category | 체크인 배지(`type==='checkin'`) 전용 지점 카테고리 오버라이드(nullable text, `poi_categories.slug` FK, `ON DELETE SET NULL`, 20260830_1344). 값이 있으면 연결된 지점의 `poi.category`보다 우선해 어드민 목록·공개 배지함의 분류 기준이 되고, `null`이면 `poi.category`로 폴백한다(20260830_1522). 체크인 외 타입은 서버에서 항상 `null`로 강제 |
| image_source | 배지 대표 이미지(`image_url`)의 제작 경로(nullable text, CHECK `admin-generator`·`agent-generator`·`jam-img`, 마이그레이션 186, 티켓 20260924_2200, 2026-09-25 적용). `admin-generator`=에셋 제너레이터 적용 탭(수동 제작), `agent-generator`=윤진 CLI 등록 스크립트(윤진 자동, 티켓 20260924_2202), `jam-img`=기존 아이콘 파이프라인(후속 티켓 20260925_0352에서 기록 추가). NULL이면 기존 배지(미상). 어드민 배지 목록·상세 라벨과 목록 필터의 단일 출처는 `jam-web/src/lib/admin/contentImageSource.ts`(티켓 20260925_1407에서 미션까지 공용으로 일반화). 적용 탭은 원본 PNG를 `images` 버킷 `badges/asset-generator/{id}.png`에 보관하고 긴 변 1280px WebP(`{id}.webp`)를 `image_url`에 넣는다 (규격 근거는 PRD asset-generator §9) |

**RLS** (마이그레이션 216, 티켓 20261005_1151). 인증 유저의 SELECT 정책 「badges: 전체 읽기 허용」은 두 조건을 모두 만족하는 행만 읽게 한다
(정책 이름의 «전체»는 이 변경 뒤 낡은 표기다).

- **활동 배지는 공개 시각이 지나야 보인다.** `type`이 `activity`(JAM! 배지 포함)이면 `valid_from`이 비었거나 지금 이전이어야 한다. `type`이 `activity`가 아닌 배지(체크인·아이템)에는 이 조건이 걸리지 않는다.
- **컬렉션 소속 배지는 그 컬렉션이 공개돼야 보인다.** `item_book_id`가 있는 배지(지금은 아이템 배지뿐)는 소속 `item_books`가 `is_active`이고 `valid_from`이 비었거나 지금 이전이어야 한다. 컬렉션 공개 조건은 서브쿼리에 직접 적혀 있다(`item_books` 정책 215와 같은 조건).
- **받아들이는 경계(2026-10-05 기준 해당 데이터 0건).** (가) 공개 시각을 보지 않고 배지를 주는 경로(미션 보상·조합 보상·컬렉션 완성 보상·온보딩 완료 배지·레거시 지점 연결 활동 배지)로 공개 전 활동 배지를 먼저 받은 유저는 공개 시각까지 세션 화면에서 그 배지를 보지 못한다.
  운영툴은 미션·컬렉션이 연결 배지보다 먼저 공개되는 것을 사전 점검에서 막는다(티켓 20260930_1500 ⑨·⑩). (나) 공개되지 않은 컬렉션 소속 아이템을 가진 유저는 인벤토리 화면에서 그 아이템을 보지 못한다(조합·드랍 시트는 service 조회라 보인다).
- 정책에 넣지 않은 것: `deleted_at`(세션 화면이 쿼리·임베드에서 이미 거른다)과 `valid_until`(종료된 배지는 이미 받은 유저에게 계속 보인다).
- `anon`에는 읽기·쓰기 정책이 없고 인증 유저에게도 쓰기 정책이 없다. 관리자 화면·관리자 API·배지·드랍 엔진·크론·프로필·조합·미션 API는 service 클라이언트라 정책을 거치지 않는다. 관리자 예외는 두지 않는다.

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

**방문 기록과 처음 받을 때 포인트 (JAM 2.0, 마이그레이션 241, 티켓 20261018_1814, 운영 로직 11장)**: 방문 기록은
DB 함수 `record_checkin_earn(p_user_id, p_badge_id, p_poi_id, p_strava_id, p_activity_name, p_distance_km, p_activity_date)`
하나로 넣는다(SECURITY DEFINER, `service_role`만 실행). 같은 유저·배지의 호출은 `pg_advisory_xact_lock` 안에서 순서대로
돌며 «이전 방문 수 세기 → 한 줄 넣기 → 처음인지 판정»을 한 번에 하고 `{ok, duplicate, earn_id, visit_count, is_first}`를
돌려준다. 같은 활동·장소·배지를 다시 넣으면(UNIQUE) 줄을 만들지 않고 `duplicate:true`다. 포인트는 함수 안에서 주지
않는다 — `sync.ts`가 `is_first`일 때만 `badges.point_reward`를 `awardPoints(…, 'badge_point_reward')`로 한 번 준다
(다시 지나가면 방문 기록만). 공개 기간(`valid_from`~`valid_until`)은 앱이 활동 시작 시각(`start_date`)으로 판정한 뒤
함수를 부른다 — 기간 밖 활동은 방문 기록도 남기지 않는다(받은 배지에는 기한이 없다). 옛 코드는 이 함수를 쓰지 않고
테이블에 직접 넣으며 두 방식의 줄은 같은 모양이다. 장소에 연결된 `type != 'checkin'` 배지를 `user_activity_badges`에
`triggered_by='poi_match'`로 발급하던 옛 경로는 삭제했다(이미 발급된 행은 그대로).

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
- **잠김 칸 5개 (JAM 2.0, 마이그레이션 231, 티켓 20261018_0051, 운영 로직 7.2·7.4·7.5절)** — 잠긴 아이템 배지는 따로 된 기능이 아니라 개체의 상태다.
  전부 덧붙이기이고 기본값이 «열림»이라 옛 프로덕션 코드와 이미 있는 개체(적용 당시 1,343행, 잠긴 개체 0행)는 그대로다.
  - `locked`(boolean, 기본 false): 잠긴 개체인가. 한 번 열면 false가 되고 다시 잠기지 않는다.
  - `unlock_required`(integer, nullable): 여는 데 필요한 잼의 양. **배정될 때 고정**하고 이후 어드민이 배지 값을 바꿔도 바뀌지 않는다. 열린 채 받은 개체는 NULL.
  - `unlock_filled`(integer, 기본 0): 지금까지 채운 양. `locked_item_fill`이 올린다(마이그레이션 235).
  - `lock_reason`(`badge_locked` 잠김으로 만든 배지 / `rolled` 잠긴 채 배정됨 / `designated` 운영자가 지정함): 연 뒤에도 이력으로 남는다.
  - `unlocked_at`(timestamptz, nullable): 연 시각.
  - CHECK `inventory_items_lock_consistent`: 잠긴 개체는 `unlock_required`·`lock_reason`이 있고 `unlock_filled <= unlock_required`, `unlocked_at`이 비어 있다.
  - **지급 함수** `grant_inventory_item_locked(p_inventory_id, p_badge_id, p_obtained_by, p_expires_at, p_locked, p_lock_reason, p_unlock_required)`
    (`SECURITY DEFINER`, `service_role`만 실행, 뒤 네 인자는 선택): 옛 `grant_inventory_item`을 그대로 부른 뒤 같은 트랜잭션에서 잠김 칸을 채운다.
    `p_locked`가 true인데 까닭이나 필요한 양이 없으면 `{ok: false, reason: 'invalid_lock_args'}`다. 옛 지급 경로(믹스·미션 보상·픽업·퀘스트)는
    옛 함수를 그대로 부르고 그 개체는 열린 채다. 동기화 발급(`syncIssueRun.ts`)과 보류 고르기(`resolve_sync_pending_items`)만 새 함수를 쓴다.
  - **트리거** `trg_inventory_items_reject_locked`: 잠긴 개체의 `slotted_in`(컬렉션 꽂기)·`dropped_at` 갱신을 `locked_item_cannot_be_slotted`·
    `locked_item_cannot_be_dropped` 오류로 거부한다. 장착·교체의 마지막 방어선이다. 유저 드랍(`create_user_drop`)은 `dropped_at`을 쓰지 않고
    `inventory_id`만 비우므로 이 트리거가 막지 못한다. 마이그레이션 238은 그 함수가 잠긴 개체를 `locked_item`으로 거절하게 했으나(티켓 20261018_0657, 묶음 4 전까지의 임시 방어선)
    **마이그레이션 239가 그 거절을 없앴다** — 잠긴 채 드랍하고 줍는다(아래 «드랍·픽업»). `/api/drops`의 `locked_item` 매핑은 DB가 더는 그 코드를 돌려주지 않아 지웠고 트리거 오류 매핑만 남는다.
  - **잠긴 동안의 제한**(서버가 거절, 코드 `locked_item_not_allowed`): 컬렉션 장착·교체(`/api/itembooks/[id]/slot`), 믹스 재료(`combineRecipeAttempt`, 소각 전에 거절),
    트리거 오류 메시지도 같은 코드로 바꿔 응답한다. 드랍·픽업은 막지 않는다(마이그레이션 239). 화면의 안내는 3-6이다.
  - **드랍·픽업 (JAM 2.0, 마이그레이션 239, 티켓 20261018_1812, 운영 로직 7.2·7.3·9.3·9.5절)** — `CREATE OR REPLACE`만 쓴다(서명·`SECURITY DEFINER`·권한·반환 형식 그대로, 반환에 키만 더함).
    - `create_user_drop`: 잠긴 개체도 드랍한다. 잠긴 개체의 `unlock_filled`를 0으로 되돌리고 `unlock_required`·`lock_reason`·`locked`·일련번호는 그대로 둔다(채운 양은 돌려주지 않는다 — 유저 사이에 잼을 옮기는 길을 막는다).
      사라진 양이 있으면 `inventory_item_events`에 `dropped`(`amount` = 사라진 양, `filled_after` = 0) 한 줄을 남기고, 반환에 `lost_fill`(사라진 양, 열린 개체·채운 양 0이면 0)을 싣는다. 이용 정지는 `{ok:false, error:'user_suspended'}`로 거절한다.
      드랍·픽업의 이력(드랍한 사람·장소·시각, 픽업한 사람·시각)은 지금처럼 `custody_events`(`UserDrop`·`Pickup`)와 `poi_drops`에 남고, `inventory_item_events`에는 «사라진 채운 양»만 더한다.
    - `pickup_drop`: 이용 정지를 `user_suspended`로, 꺼진 장소(`poi.is_active = false`)를 `poi_inactive`로 거절한다. 잠긴 채 줍는다 — 소유만 옮기고 잠김·필요한 양·채운 양(0)·일련번호는 그대로다. 자기 드랍도 줍는다(거절 코드 없음).
      꺼진 장소의 드랍은 지우지 않으므로 장소를 다시 켜면 다시 주울 수 있다. 인벤토리가 가득 차면 줍지 않고 `inventory_full`이다.
    - 앱: `POST /api/drops`·`POST /api/drops/[dropId]/pickup`은 DB 호출 전에 `assertNotSuspended`로 먼저 막고(403 `user_suspended`, 문구 `d.suspension.dropBlocked`·`pickupBlocked`) DB의 `user_suspended`도 같은 403으로 바꾼다. 드랍 성공 응답에 `lostFill`을 싣는다.
      픽업은 꺼진 장소를 드랍이 없을 때와 같은 404로 닫는다. `GET /api/drops/poi/[poiId]`는 꺼진 장소의 드랍을 내리지 않고(빈 목록), `GET /api/drops/[dropId]`와 함께 잠긴 개체의 이름·그림·설명·컬렉션·트라이브·일련번호·배지 id를 서버에서 비워
      `locked: true`·등급(`badge_rarity`)·필요한 양(`unlock_required`)만 싣는다(7.3절). 잠긴 채 받은 개체는 피드(`item_picked_up`)와 놓은 사람 소식(#13)에 이름·그림을 싣지 못하므로 남기지 않는다.
      `GET /api/inventory/items/[itemId]/drop-loss`는 내 개체를 드랍하면 사라질 양을 `{ lostFill }`로 알린다(`src/lib/drop/drop-loss-contract.ts`, 열린 개체·0이면 0, 내 것이 아니면 404). 화면(4-6)이 드랍 확인 단계에서 읽는다.
    - 자기 드랍 줍기는 허용이지만 챕터 점수·횟수에는 세지 않는다: 횟수 지표 4종은 조회 규칙으로 이미 자기 드랍을 빼므로 새 칸을 더하지 않았고, 같은 기준을 `isSelfPickup`(`src/lib/drop/self-pickup.ts`)에 한 곳으로 두어 챕터 점수(묶음 5)가 쓴다.
- **시스템 드랍 잠긴 채 놓기 (JAM 2.0, 마이그레이션 240, 티켓 20261018_1813, 운영 로직 7.2·9.4절)** — 새 함수 하나만 덧붙인다. 옛 `mint_and_place_ambient_drop`(108)은 그대로다(옛 프로덕션 코드가 쓴다).
  - `mint_and_place_ambient_drop_locked(p_poi_id, p_badge_id, p_lock_reason, p_unlock_required)` → JSONB `{ok, drop_id, inventory_item_id}`. `SECURITY DEFINER`, `authenticated` 실행 권한 없음(서버만).
    개체를 `locked = true`·`lock_reason`·`unlock_required`(놓을 때 고정)·`unlock_filled = 0`·소유자 없음(`inventory_id` NULL)·`obtained_by = 'ambient_drop'`으로 만들고, 옛 함수와 같게 `poi_drops`(`source = 'system'`, 만료 없음)와 `custody_events` `Minted`를 남긴다.
    잘못된 까닭(`badge_locked`·`rolled`·`designated` 밖)·양수가 아닌 필요한 양·NULL은 `{ok:false, error:'invalid_lock_args'}`로 거절하고 개체를 만들지 않는다.
  - 앱(`placeAmbientDrops.ts`)이 `badges.always_locked`인 배지만 이 함수로(까닭 `badge_locked`, 필요한 양 = 배지의 `unlock_required`, 없으면 `jam_policy.locked_min_*`) 놓고 나머지는 옛 함수로 놓는다. 생성 타입(`database.generated.ts`)에 새 함수를 맞췄다.
- **채우기·열기 (JAM 2.0, 마이그레이션 235, 티켓 20261018_0053, 운영 로직 7.2·8.5절)** — 전부 덧붙이기다. 옛 테이블·함수·칸의 뜻은 바꾸지 않고 232·234의 캡슐 함수도 건드리지 않는다.
  - 새 칸 `inventory_items.point_awarded_at`(timestamptz, nullable): 잠긴 개체를 열 때 배지 포인트를 준 시각. «한 일련번호에 한 번만» 주는 기록이다. 열린 채 받아 지급한 개체는 이 칸을 쓰지 않는다.
  - 새 표 `inventory_item_events`(append-only, RLS만 켜고 클라이언트 정책 없음, service_role 전용): 개체가 거쳐 간 이력. `inventory_item_id`·`badge_id`(ON DELETE SET NULL), `serial_number`, `user_id`(그 일을 한 유저),
    `event_type`(`received`·`slotted`·`unslotted`·`dropped`·`picked_up`·`consumed`·`locked`·`filled`·`unlocked`), `amount`(filled일 때 그 번에 채운 양), `filled_after`(채운 뒤 누적), `points_awarded`(unlocked일 때 준 포인트), `created_at`.
    이번에는 `filled`·`unlocked`만 쓰고 나머지 종류는 묶음 4 이후가 이어 쓴다. 잠긴 아이템 배지를 연 횟수는 `event_type = 'unlocked'`를 세어 얻는다.
  - 새 함수 `jam_fill_decide(p_remaining, p_balance, p_amount DEFAULT NULL) → jsonb`(IMMUTABLE, service_role만 실행): 얼마를 채울지 판정하는 읽기 전용 순수 함수다. `already_full`, `invalid_amount`, `exceeds_remaining`(남은 양 포함), `insufficient_jam` 순으로 검사하고
    기본값은 남은 양, 가진 잼이 모자라면 가진 만큼이다. `capsule_fill`과 같은 규칙이고, 두 함수의 판정이 같은지는 롤백 실측이 같은 표로 비교한다. `capsule_fill`은 이 함수를 쓰지 않는다(캡슐 쪽 통일은 3-4 이후 필요하면).
  - 새 함수 `locked_item_fill(p_user_id, p_item_id, p_amount DEFAULT NULL) → jsonb`(SECURITY DEFINER, service_role만 실행): 이용 정지 확인(`user_suspended`) → 개체 행 잠금(내 것이고 버려지거나 드랍되지 않은 개체가 아니면 `item_not_found`, 열린 개체면 `not_locked`)
    → `jam_fill_decide` → `jam_apply(locked_item_badge_fill, 음수)` 한 줄 + `unlock_filled` 갱신 + 이력(`filled`) 한 줄이 한 트랜잭션. 성공하면 `applied`·`required`·`filled`·`remaining`·`balance`를 돌려준다.
  - 새 함수 `locked_item_open(p_user_id, p_item_id) → jsonb`(SECURITY DEFINER, service_role만 실행): 이용 정지 확인 → 개체 행 잠금(`item_not_found`·`not_locked`) → 다 채웠는지 확인(`not_full`, `required`·`filled` 포함) → 같은 개체를 `locked = false`, `unlocked_at = now()`로 바꾼다(일련번호 그대로, 새로 뽑지 않음, 인벤토리 빈칸 불필요).
    배지에 `point_reward`가 있고 `point_awarded_at`이 비어 있으면 `award_points(badge_point_reward)`로 연 유저에게 한 번 주고 칸을 채운다. 이력(`unlocked`) 한 줄까지 한 트랜잭션이다. 동시에 두 번 열어도 행 잠금 때문에 두 번째는 `not_locked`다. 포인트 지급이 실패하면 열기 전체가 되돌려진다.
    성공하면 `itemId`·`badgeId`·`serialNumber`·`pointsAwarded`를 돌려준다. DB 안에서 포인트를 주므로 `awardPoints`의 알림(`notifyPointChange`)은 이 경로에서 나가지 않는다.
  - API(앱은 위 함수를 부르기만 한다, 응답 모양은 `src/lib/inventory/lockedItemFill-contract.ts`): `GET /api/inventory/items/[itemId]/lock`(채운 양·필요량·남은 양·잼·`openable`, 이용 정지 중에도 허용), `POST .../fill { amount? }`(양의 정수만, 이용 정지 중 403 `user_suspended`,
    `already_full`·`exceeds_remaining`·`invalid_amount` 400, `insufficient_jam`·`not_locked` 409, `item_not_found` 404), `POST .../open`(이용 정지 중 403, `not_full`(채운 양·필요량 포함)·`not_locked` 409, `item_not_found` 404, 그 밖의 오류 500).
    열기 전에는 이름·그림·설명·컬렉션·트라이브·일련번호를 어떤 응답에도 싣지 않고, 열기 성공 응답에만 개체 정보를 싣는다(7.3절).
    열기 성공 응답에는 `serialPrefix`(`inventory_items.serial_prefix`, 읽지 못하면 null)도 싣는다 — 화면이 `ItemSerialCode`로 번호를 그리는 데 쓴다(티켓 20261018_0054 2회, SQL 변경 없음).
  - **잠긴 개체를 읽는 조회(티켓 20261018_0054 2회, 7.3절)**: `inventory_items.badge_id`로 배지·컬렉션·트라이브·일련번호를 드러내는 조회는 `locked = false` 개체만 읽는다 — 프로필 컬렉션 수·레거시 피드 합성, 컬렉션 목록·장착 후보, 믹스 재료,
    `/api/itembooks`·`/api/users/[username]/itembooks`, `/badges`의 컬렉션 발견 판정, 배지 상세의 보유 개체 목록. 인벤토리 서버 페이지는 잠긴 개체의 이름·그림을 클라이언트 props에서 비운다.
  - **잠긴 채 드랍·픽업된 개체의 프로필 피드(티켓 20261018_1837, 7.3절, SQL 변경 없음)**: 프로필 페이지(`/[username]`, 내 프로필과 타인 프로필 모두)가 `poi_drops`로 «놓은 드랍»·«주운 드랍» 피드 항목을 합성할 때
    `poi_drops.inventory_item_id → inventory_items.locked`를 함께 읽는다. 잠긴 개체의 항목은 서버에서 이름·그림·배지 id를 비우고 이름은 «잠긴 아이템 배지»(`d.lockedItem.card.name`)와 등급(`rarity`)만 싣는다
    (`badge_id`가 비어 피드의 «상세» 버튼도 그려지지 않는다). 개체가 연결돼 있는데 잠김을 읽지 못하면(`inventory_items`·`locked`가 비었다) 잠긴 것으로 본다. 개체 연결이 없는 과거 드랍은 열린 것으로 본다.
    열린 개체의 항목은 그대로 이름·그림을 싣는다. 판정과 가린 메타는 `lib/activity-feed/lockedDrop.ts`가 단일 원천이다. 홈·`/feed` 피드는 `poi_drops`를 읽지 않고 `user_activity_feed`만 읽으며,
    잠긴 채 받은 개체는 받을 때·픽업할 때 피드 기록(`item_dropped`·`item_picked_up`)을 남기지 않으므로(`issueFollowUp`·픽업 라우트) 열기 전에는 이름이 실릴 행이 없다(연 때는 `openLockedItem`이 동기화로 받은 개체만 `item_dropped`를 올린다. 캡슐에서 나온 잠긴 개체는 열어도 올리지 않는다, 티켓 20261026_1031). 드랍 라우트(`POST /api/drops`)는 피드·소식을 기록하지 않는다.
  - 되돌림: 새 객체만 지운다. 채운 잼은 원장에 남아 지갑으로 돌아오지 않고, 열어서 준 포인트도 회수되지 않는다.

### custody_events (신규, 2026-08-29 — 티켓 20260829_2101)
`InventoryItem` 한 개체의 점유(custody) 변화 이력(append-only). `Minted`/`UserDrop`/
`Pickup`/`Expire`/`Slot`/`Unslot`/`Consume`/`Orphan` 8종. `from_user_id`/`to_user_id`/
`actor_user_id`는 라이브 FK(`ON DELETE SET NULL`) + `*_username` 스냅샷을 함께 가진다.
**계정을 지울 때는 이 유저의 이름 스냅샷을 비운다**(운영 로직 17.2절, 티켓 20261021_1249): 앱이 계정을 지우는
경로(`deleteAccount`)는 준비 함수 `prepare_account_deletion`이 짝 `*_user_id`가 이 유저인 행의 이름 칸을 NULL로 만들고, 소유 아이템에
`Orphan` 이벤트(이름 없이 `from_user_id`만)를 남기고 `destroyed_at`을 채우며 소유를 비워 «없어짐» 처리한다(아래 «계정 삭제» 절).
이력 화면은 이벤트 종류별 필수 칸의 `*_user_id`가 NULL이면 탈퇴 텍스트로 보인다(«계정 삭제» 절의 «탈퇴 유저 표시»).
`BEFORE DELETE ON public.users` 트리거(`log_orphan_custody_events()`)는 그대로 있으며, 준비 함수를 거치지 않고 지우는 경우(Supabase 화면에서
직접 삭제)에만 `destroyed_at IS NULL`인 소유 아이템에 `OLD.username` 스냅샷을 남긴다. 상세는
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

**RLS** (마이그레이션 215, 티켓 20261004_2041). 인증 유저의 SELECT 정책 「item_books: 전체 읽기 허용」은 `is_active`이고
`valid_from`이 비었거나 지금 이전인 행만 읽게 한다 — 위 «공개됨» 판정과 같은 조건이고 종료 시각(`valid_until`)은 보지 않는다
(정책 이름의 «전체»는 이 변경 뒤 낡은 표기다). 공개 전·비활성 컬렉션은 앱 화면뿐 아니라 로그인 유저의 PostgREST 직접 조회에서도
0행이다. `anon`에는 읽기·쓰기 정책이 없고 인증 유저에게도 쓰기 정책이 없다. 앱의 관리자 화면·관리자 API·서버 조회는
service 클라이언트라 정책을 거치지 않는다. 관리자에게 공개 전 컬렉션을 보여 주는 정책 예외는 두지 않는다.

### user_item_book_slots / user_item_book_completions (신규)
- `user_item_book_slots`: 인벤토리 아이템을 슬롯에 장착한 기록 (UNIQUE user+book+badge)
  - `inventory_item_id`(NOT NULL): **어느 개체가 꽂혀 있는지의 정본.** UNIQUE 제약이 배지 단위라
    컬렉션당 같은 배지는 1개만 장착되지만, 유저가 같은 배지를 여러 개 보유할 수 있으므로
    "어느 개체인가"는 이 컬럼으로만 확정된다. 컬렉션 화면의 배지 상세 링크가 싣는
    `?item={inventory_item_id}`의 출처이기도 하다 (티켓 20260907_2059).
- `user_item_book_completions`: 완성 기록 (PK user_id+item_book_id)
  - **JAM! 행동 지표의 원천**: 완성한 컬렉션 수(`collection_complete_count`)가 이 표와 등급 완성 표(`user_item_book_tier_completions`,
    아래 4-2절)에서 `user_id`로 거른 컬렉션 id를 합쳐 서로 다른 컬렉션 수를 센다. 장착 해제·교체는 이 기록을 지우지 않는다(티켓 20261001_0633,
    두 표 합산은 티켓 20261022_0939 1회).

### 4-2. 컬렉션 4등급 구조 (JAM 2.0) — 마이그레이션 222, 티켓 20261016_2340
운영 로직 8.3절이 근거다. 마이그레이션 222는 2026-10-17에 적용됐다. 옛 객체(`slot_item_into_book`, `swap_item_in_book`, `unslot_item_from_book`, `user_item_book_completions`, `item_books.reward_points`·`reward_badge_id`)는 바꾸지 않고 새 객체를 덧붙인다. 옛 것을 지우는 축소는 묶음 6이다.

**구조 규칙**
- **한 칸 묶기**: 같은 컬렉션(`badges.item_book_id`) 안에서 이름(`badges.name`)이 같은 아이템 배지 4장(`badges.rarity` = common·rare·epic·mystic)을 한 칸으로 본다. 묶음용 새 테이블은 없다. 어드민은 지금처럼 배지를 컬렉션에 넣기만 한다.
- **컬렉션 등급은 저장하지 않는다**: 그 유저가 그 컬렉션에 지금 꽂아 둔 배지의 등급이 곧 컬렉션 등급이다. 다 빼면 풀린다.
- **켜는 칸**: `item_books.tier_mode`(BOOLEAN NOT NULL, 기본 false). true인 컬렉션만 새 규칙을 쓰고 false인 컬렉션은 옛 규칙·옛 함수 그대로다. 어드민 컬렉션 수정 화면의 «4등급 방식» 패널에서 하나씩 켜고 끈다(티켓 20261022_1139 1회). 켜기는 한 유저가 여러 등급을 꽂아 둔 컬렉션이면 서버가 거절하고, 끄기는 등급별 완성 기록이 있으면 거절한다. 등급별 보상은 켜진 컬렉션에만 나오는 같은 화면의 «등급별 보상» 편집기에서 입력한다(2회, `PUT /api/admin/itembooks/[id]/tier-rewards`: 포인트는 비우면 기본값·0이면 지급 없음, 보상 배지는 비우면 없음, 같은 배지를 두 등급에 고를 수 없다). 편집기는 `item_book_tier_rewards`만 쓴다. 4등급 컬렉션의 `item_books.reward_points`·`reward_badge_id` 값은 지우지 않고 편집 폼이 그 칸만 접는다.
- **완성**: 그 등급의 이름 칸을 모두 채우면 그 등급이 완성된다. 분모는 그 컬렉션에서 그 등급 배지가 있는 이름 수이고, 옛 규칙(179)처럼 드랍 제외(`drop_excluded`)·소프트 삭제 배지를 빼며 그 등급이 전부 드랍 제외이면 제외 없이 센다. 등급마다 한 번만 기록하고 보상도 한 번만 나간다. 장착을 풀어도 기록은 남고 다시 채워도 같은 등급 보상은 나가지 않는다.

**테이블**
- `user_item_book_tier_completions`: 등급별 완성 기록. `(user_id, item_book_id, tier)` 복합 PK, `completed_at`. 본인만 SELECT, 쓰기 정책 없음.
- `item_book_tier_rewards`: 컬렉션·등급별 보상. `(item_book_id, tier)` 복합 PK, `reward_points`(NULL이면 기본값, `>= 0`), `reward_badge_id`(→ `badges.id`, 삭제 시 NULL, NULL이면 보상 배지 없음). RLS 활성·정책 없음(서버 전용).
- `item_book_tier_default_rewards`: 등급별 기본 보상 포인트. `tier` PK, `reward_points`(`>= 0`). 초기값 common 100 / rare 200 / epic 400 / mystic 800(운영 로직 8.6절). 값 변경에 마이그레이션이 필요 없다. RLS 활성·정책 없음(서버 전용). 편집 화면은 어드민 «밸런스 설정»의 «컬렉션과 믹스» 구역이다(`/admin/balance#collection`, 티켓 20261022_1133, [ADMIN_PRD.md](admin-ui/ADMIN_PRD.md) §5-9). 네 등급 행을 칸 이름 `default_reward:<등급>`으로 편집하고, 저장하면 바뀐 행의 `updated_at`을 직접 올린다(갱신 트리거가 없다). 컬렉션마다 따로 정한 값(`item_book_tier_rewards.reward_points`)이 있으면 그 값이 먼저이고, 이미 받은 보상은 바뀌지 않는다.
- `tier` 열의 형은 `badge_rarity`다.

**함수** (둘 다 SECURITY DEFINER, `service_role`만 실행)
- `slot_item_into_book_tiered(p_user_id, p_item_book_id, p_inventory_item_id)`: 179의 검사(인벤토리·소유·드랍됨·이미 꽂힘·다른 컬렉션 배지)에 `item_book_not_found`·`tier_mode_off`(꺼진 컬렉션)·`tier_mismatch`(이미 꽂힌 배지와 등급이 다름)를 더했다. 완성이면 `award_points`(사유 `item_book_completion_point_reward`)로 포인트를 준다. 포인트는 `item_book_tier_rewards.reward_points`, 없으면 기본값이다. 반환: `ok`, `slot`, `tier`, `completed_tier`(이번 장착으로 새로 완성한 등급, 아니면 null). **보상 배지는 SQL이 주지 않는다** — 옛 함수처럼 앱 코드가 지급한다. 장착 API가 `completed_tier`의 등급 보상 배지(`item_book_tier_rewards.reward_badge_id`)를 주고, 동기화 뒤 보정(`checker.ts`)이 등급별 완성 기록을 보고 못 받은 등급 보상 배지를 따라잡는다.
- `swap_item_in_book_tiered(p_user_id, p_item_book_id, p_slot_id, p_new_inventory_item_id)`: 151의 검사에 `tier_mode_off`·`tier_mismatch`(등급이 다름)를 더했다. 같은 배지의 다른 개체로만 바꾸므로 완성에는 영향이 없다.
- 장착 해제는 옛 `unslot_item_from_book`을 그대로 쓴다.

**장착 API 분기** (`jam-web/src/app/api/itembooks/[id]/slot/route.ts`)
- POST(장착)·PATCH(교환)가 컬렉션의 `item_books.tier_mode`를 읽어 켜진 컬렉션은 `slot_item_into_book_tiered`·`swap_item_in_book_tiered`를, 꺼진 컬렉션은 옛 함수를 이전과 같은 인자로 부른다. DELETE(해제)는 `tier_mode`와 무관하게 옛 함수다.
- 새 함수의 오류 `tier_mismatch`·`tier_mode_off`는 409, 교환의 `item_book_not_found`는 404로 응답한다.
- 모두 해제는 별도 경로 `DELETE /api/itembooks/[id]/slots`(`jam-web/src/app/api/itembooks/[id]/slots/route.ts`, 티켓 20261028_1420)다. 요청한 유저가 이 컬렉션에 꽂은 장착 전부(소프트 삭제된 배지에 꽂힌 장착 포함, 다른 컬렉션·다른 유저는 제외)를 장착마다 `unslot_item_from_book`으로 순서대로 푼다. 새 SQL 함수는 없다. 해제하면 장착마다 인벤토리 칸을 하나씩 쓰므로 먼저 빈칸(`max_slots - used_slots`)이 장착 수 이상인지 확인하고, 모자라면 아무것도 풀지 않고 409와 `code: inventory_full`로 응답한다. 확인 뒤 경합으로 중간에 가득 차면 거기서 멈추고 같은 409에 푼 수(`released`)와 남은 수(`remaining`)를 싣는다(풀린 것을 되돌리지 않는다). 그 밖의 실패는 500에 같은 두 수를 싣는다. 성공은 `{ ok, released, remaining: 0 }`이고 장착이 없으면 해제 0개로 성공이다. 장착 해제는 완성 기록을 지우지 않는다.

**조회 응답 필드** (`GET /api/itembooks`, `GET /api/users/[username]/itembooks`)
- 기존 필드(`totalBadgeCount`·`slottedCount`·`isCompleted` 등)의 이름과 값은 그대로이고 `tierMode`·`tier`·`tiers`를 더했다.
- `tierMode`는 `item_books.tier_mode`다. `tier`는 지금 꽂힌 배지의 등급이고 아무것도 꽂지 않았거나 옛 컬렉션이면 `null`이다.
- `tiers`는 등급을 키로 `total`·`filled`(그 등급의 이름 수 기준, 판정은 아래 「완성 판정 규칙」)·`complete`(지금 계산상 완성)·`recorded`(그 등급의 `user_item_book_tier_completions` 행 유무)를 담는다. 옛 컬렉션은 `{}`다.
- `isCompleted`: `tier_mode` 컬렉션은 등급별 완성 기록이 하나라도 있거나 지금 계산상 완성이면 true다(등급별 상세는 `tiers`). 옛 컬렉션은 옛 완성 기록이 있거나 계산상 완성이면 true로 이전과 같다.
- 응답 필드는 `tierMode`를 쓰고 `tier_mode`는 DB 열 이름이다. 컬렉션 상세 화면은 이 조회 API를 거치지 않고 `item_books.tier_mode`와 `computeBookCompletion`의 `tier`를 직접 읽는다(아래 「컬렉션 상세 화면의 칸」).

**컬렉션 상세 화면의 칸** (`jam-web/src/app/(main)/collections/[id]/page.tsx`, 칸 만들기 `jam-web/src/lib/itembook/tier-badge-slots.ts`, 티켓 20261028_1408)
- `tier_mode`가 꺼진 컬렉션은 소속 아이템 배지 전부를 1:1로 칸에 두는 이전 모양 그대로다.
- `tier_mode`가 켜진 컬렉션은 같은 이름의 4등급 배지를 한 칸으로 묶어 «이름 수»만큼 칸을 그린다(보통 9칸이고 36칸이 아니다). 칸 순서는 이름이 처음 나오는 순서(`created_at`)로 고정해서, 컬렉션 등급이 정해지거나 풀려도 같은 이름이 같은 자리에 있다. 등급이 비어 있는 배지는 분모 규칙과 같이 칸에서 뺀다.
- 컬렉션 등급이 정해졌으면 그 등급의 배지만 칸으로 그리고, 후보(장착할 수 있는 개체)도 그 배지의 것만 나온다. 이름은 알지만 그 등급의 개체가 없고 다른 등급만 가진 칸은 «???»이며 «추가»가 없다. 본인 화면에서는 격자 위에 «{등급} 등급으로 모으고 있어요…» 안내 한 줄이 보인다. 드랍 제외 배지도 칸에는 넣는다.
- 컬렉션 등급이 없으면(아무것도 장착하지 않았으면) 이름마다 한 칸이고 등급 칩과 안내 한 줄이 없다. 칸의 그림은 가진 배지 가운데 가장 낮은 등급(없으면 그 이름의 가장 낮은 등급)이다. «추가»는 후보가 1개여도 항상 선택 시트를 열고, 시트는 이름의 모든 등급 개체를 낮은 등급 순으로 등급 칩·일련번호와 함께 보인다. 첫 장착한 배지의 등급이 컬렉션 등급이 되고, 장착한 배지를 모두 해제하면 다시 등급 없는 칸으로 돌아온다.
- 컬렉션 등급은 화면이 새로 계산하지 않고 `computeBookCompletion`의 `tier`를 읽는다. 이 호출에는 소프트 삭제 배지도 넘겨서, 삭제된 배지에 꽂힌 슬롯의 등급이 컬렉션 등급으로 읽힌다(서버의 `tier_mismatch` 판정과 같다). 칸 목록·분모·분자에서는 삭제 배지를 계속 뺀다. 컬렉션 등급을 정한 삭제 배지 때문에 그 등급에 살아 있는 배지가 하나도 없으면, 진행도의 기준 등급(첫 등급)으로 칸을 그리되 후보를 비워 «추가»를 열지 않는다.
- 타인 열람(`readOnly`)은 그 유저의 등급 기준 칸을 보이고 버튼과 안내 한 줄이 없다. 슬롯이 0개이면 404인 접근 정책은 그대로다.
- 이름 수가 등급마다 다르거나 드랍 제외 배지가 있는 등급은 칸 수가 진행도 분모와 다를 수 있다. 컨텐츠 입력 규칙(`docs/service/content/ITEMBOOK_TIERS.md` 1절)의 위반이거나 꺼진 컬렉션과 같은 동작이어서 화면에서 숨기지 않는다.

**컬렉션 완성을 세는 곳 — 옛 완성 표와 등급 완성 표를 함께 읽는다** (티켓 20261022_0939 1회, 읽는 쪽 빈틈 메우기. 옛 완성 표를 읽는 쪽을 걷는 일은 이 티켓 2회)
- **`collection_complete_count` 지표**(`jam-web/src/lib/badge-engine/jamActionCompletionMetrics.ts`): 두 표의 컬렉션 id를 합쳐 서로 다른 컬렉션 수를 센다. **등급 하나라도 완성하면 센다, 컬렉션당 최대 1**이고 겹쳐도 한 번만 센다. 선택 인자 `window`는 두 표의 `completed_at`에 건다. 조회 오류는 0으로 바꾸지 않고 던진다.
- **운영 신호 «컬렉션 완성» 카운터**(`jam-web/src/lib/admin/opsSignals/load.ts`, 행동 횟수 급증): 두 표의 기간 안 행 수를 더한다. 이 카운터는 컬렉션 수가 아니라 완성 건수라 한 컬렉션의 등급 완성은 등급마다 한 건이다.
- **팔로잉 소식 `following_collection_complete` 후보**(`jam-web/src/lib/notifications/batch/following.ts`): 24시간 안의 두 표 기록을 (유저, 컬렉션)당 하나(가장 이른 완성 시각)로 줄여 후보를 만든다. 한 사람이 같은 컬렉션의 여러 등급을 완성해도 «소식이 N건 더 있어요»가 붙지 않는다. 후보 모양과 알림 그룹 키(컬렉션, 행위자)는 그대로다.

**삭제 가드** (`jam-web/src/lib/admin/reference-guards.ts` `ITEM_BOOK_REFERENCE_SOURCES`)
- `user_item_book_tier_completions`는 컬렉션 삭제 시 CASCADE라, 옛 `user_item_book_slots`·`user_item_book_completions`와 같이 삭제를 막는 참조로 센다. 등급별 완성 기록이 있는 컬렉션은 하드 삭제 대신 비활성화를 안내한다.
- 배지 하드 삭제 가드(`jam-web/src/lib/admin/badge-references.ts` `BADGE_REFERENCE_SOURCES`)는 `item_book_tier_rewards.reward_badge_id`를 «컬렉션 등급별 보상»으로 센다(티켓 20261022_1139 2회). 외래키가 `ON DELETE SET NULL`이라 삭제가 DB에서 실패하지는 않으므로 옛 «컬렉션 완성 보상»(`item_books.reward_badge_id`)과 같이 `blocksDelete`는 false이고 콘텐츠 연결로 센다. 단건 하드 삭제는 콘텐츠 연결이 하나라도 있으면 먼저 정리하라고 409로 안내한다.

**완성 판정 규칙 (코드, 2026-10-17 통일 — 티켓 20261016_2340 2회)**
`jam-web/src/lib/itembook/completion-basis.ts`의 `computeBookCompletion` 한 곳이 컬렉션의 분모·분자를 정한다. 장착 뒤 보정(`checker.ts`), 완성 가능 소식, 컬렉션 화면·목록 API, 투데이, 알림 배치가 모두 이 함수를 부른다. 기준은 완성 기록을 남기는 DB 함수(179·222)다.
- **분모**: 소속 배지 중 소프트 삭제가 아닌 `item`+`checkin` 배지에서 드랍 제외(`drop_excluded`)를 뺀 집합이다. 전부 제외이면 등록 배지 전체를 센다.
- **분자**: 컬렉션별이다. 그 컬렉션의 슬롯과 그 컬렉션 소속 체크인 배지의 획득 이력만 센다(다른 컬렉션 슬롯은 세지 않는다).
- **`tier_mode` 컬렉션**: 등급마다 따로, 분모·분자 모두 그 등급의 이름 수로 센다. 컬렉션 등급은 채운 배지의 등급에서 읽고, 이 판별에서만 소프트 삭제 배지에 꽂힌 슬롯도 센다(222의 `tier_mismatch` 판정과 일치 시험의 등급 읽기가 `deleted_at`을 걸지 않기 때문이다. 분모·분자는 그대로 삭제 배지를 뺀다. 그 등급에 살아 있는 배지가 없어 등급별 계산에 없으면 최상위 필드의 기준은 첫 등급이다. 티켓 20261022_1139 2회). `tier_mode` 컬렉션의 등급별 완성은 새 함수가 `user_item_book_tier_completions`에 기록하므로 보정 함수는 옛 완성 기록 `user_item_book_completions`를 쓰지 않는다.
- **표시**: 화면·API의 완성 여부는 `user_item_book_completions` 기록이 있거나 계산상 완성이면 완성이다(`isBookCompleted`).
- 자세한 규칙·근거·영향 실측은 `BADGE_ENGINE_UNIFIED.md` §3.16이다.

> 챕터 점수 연결(`chapter_add_score`)은 묶음 5, 컬렉션 화면 표시·잠금·등급 올리기 레시피는 묶음 3이다. 완성 판정을 `src/lib/itembook/` 한 모듈로 모으는 일은 회차 2에서 끝났다(2회-가: 모듈과 일치 시험, 2회-나: 소비처 교체).

### 4-3. 트라이브 컨텐츠 덮어쓰기 백업 표 `content_overwrite_backup_20261022` (JAM 2.0 7-6) — 마이그레이션 275, 티켓 20261022_1137
옛 컬렉션 44개와 옛 아이템 배지 행 396개를 새 컨텐츠로 **덮어쓰기** 때문에, 되돌림 SQL이 쓸 원본을 담는 임시 표다. 작성됨, **적용 대기**(적용은 롤백 실측과 사용자 승인 뒤 메인 세션이 한다). 6-4의 오픈 뒤 정리 SQL 때 지운다.

- 열: `kind`(`item_book`·`badge`·`new_item_book`·`new_badge`), `row_id`(UUID, `kind`와 함께 PK), `target_tribe`(새 트라이브 이름, 트라이브별 되돌림이 거른다), `snapshot`(JSONB, `to_jsonb(row)`), `backed_up_at`. `item_book`·`badge`는 덮어쓰기 전 전체 행을 `snapshot`에 담고, `new_*`는 새로 넣은 행의 id만 담는다(`snapshot` 없음, CHECK가 짝을 강제한다).
- 접근: RLS를 켜고 정책을 두지 않으며 `anon`·`authenticated` 권한을 회수한다. 서버(service role)만 읽고 쓴다.
- 쓰는 곳: 트라이브별 컨텐츠 SQL(276~280)이 덮어쓰기 직전에 자기 대상 행을 이 표에 (다시) 기록하고, 파일 끝의 되돌림 SQL이 이 표로 옛 값을 되돌린다. SQL은 배지 id가 아니라 «컬렉션의 옛 이름과 옛 배지 이름»으로 옛 행을 찾는다. 짝은 [ITEMBOOK_REPLACEMENT_MAP.md](../content/ITEMBOOK_REPLACEMENT_MAP.md)이고 생성기·데이터는 `jam-web/scripts/jam2-content/`다.
- 덮어쓰기가 바꾸는 열: 컬렉션은 `name`·`description`·`tribe_id`·`is_active`·`tier_mode`·`story_text`·`image_url`·`image_source`와 **배경 칸 5개**(`background_color`·`background_shader_id`·`background_image_url`·`background_video_url`·`background_animation`, 모두 NULL로 비움), 옛 배지 행은 `name`·`description`·`rarity`(common)·`deleted_at`(비움)·`tribe_id`·`image_url`·`image_source`와 같은 **배경 칸 5개**(NULL로 비움)다. `point_reward`·`reward_points`·`reward_badge_id`는 건드리지 않는다. 새로 넣는 행은 배경 칸을 적지 않아 열의 기본값(NULL)이다.
- 되돌림이 복원하는 열: 위에서 바꾼 열 전부(배경 칸 5개 포함)를 `snapshot`에서 읽어 되돌린다. 배경 칸 중 `background_animation`만 JSONB라서 `to_jsonb`가 담은 JSON null을 `NULLIF(snapshot->'background_animation', 'null'::jsonb)`로 SQL NULL로 바꿔 되돌리고, 나머지 TEXT 칸은 `snapshot->>'열'`로 읽는다.

### 4-4. 쓰지 않는 컬렉션·옛 레시피 끄기 백업 표 `retire_backup_20261022` (JAM 2.0 7-7) — 마이그레이션 282, 티켓 20261022_1138
오픈 직전에 쓰지 않는 컬렉션과 옛 레시피 3건을 **끄기** 때문에, 되돌림 SQL이 쓸 직전 상태를 담는 임시 표다. 마이그레이션 282가 만들고, 적용은 오픈 직전이다(묶음 7의 7-9 목록). 오픈 뒤 문제가 없으면 지운다.
7-6의 백업 표(4-3)는 `kind` 제약이 레시피를 담지 못하고 6-4의 오픈 뒤 정리 SQL 때 지워져서 쓰지 않고 따로 만든다.

- 열: `kind`(`item_book`·`combination_recipe`), `row_id`(UUID, `kind`와 함께 PK), `snapshot`(JSONB NOT NULL, `to_jsonb(row)`), `backed_up_at`.
- 접근: RLS를 켜고 정책을 두지 않으며 `anon`·`authenticated` 권한을 회수한다. 서버(service role)만 읽고 쓴다.
- 끄는 대상: «활성 컬렉션 가운데 7-6 계획의 컬렉션 50개에 들지 않는 것»의 `item_books.is_active`(false로, 공용 DB에서 19개이고 19개가 아니면 SQL이 멈춘다. 계획 밖 컬렉션 56개 가운데 37개는 이미 꺼져 있다)와 옛 레시피 3건의 `combination_recipes.valid_until`(적용 시각으로)이다. 다른 열은 바꾸지 않는다. 지우지 않고, 이미 받은 기록은 그대로다.
- 되돌림: 파일 끝의 되돌림 SQL이 `snapshot`에서 `is_active`와 `valid_until`만 읽어 되돌린다. 건수는 `item_book` 19, `combination_recipe` 3으로 기대한다.

---

## 5. 트라이브 (tribe) — 신규 도메인

### tribes
10개 트라이브. `name`, `tagline`, `description`, `drop_weight`, `is_active`, `sort_order`, `drop_condition_json`. 상세 컨텐츠는 [docs/service/content/TRIBES.md](../content/TRIBES.md) 참고.

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
트라이브 간 인접 그래프 (PK: tribe_id + adjacent_tribe_id). 옛 드랍엔진 v2의 "서사 모멘텀" 판정에 쓰였다 — 상세는 [docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md](../badge-engine/BADGE_ENGINE_UNIFIED.md) §3.2 참고. 그 엔진은 2026-10-22(티켓 20261022_0938 1회)에 지웠고, 새 발급 경로(`syncIssue*.ts`)는 이 표를 읽지 않는다. 지금 이 표를 읽는 곳은 어드민의 트라이브 인접 편집·목록 개수·삭제 참조 검사뿐이다.

---

## 6. POI / 드랍

### poi
| 필드 | 설명 |
|------|------|
| category | ENUM → **TEXT + `poi_categories` FK로 전환** (ENUM 자체는 DROP됨) |
| poi_tier | 1=어드민 등록(T1), 2=자동 수집(T2) |
| osm_id | (구) OpenStreetMap 연동 흔적, 현재 신규 수집은 미사용 |
| naver_id | **현재 T2 자동 수집 소스** — 네이버 지역검색 오픈API 연동 키 |
| linked_badge_id | 연결된 체크인 배지(1:1). 어드민 저장 API(`/api/admin/poi`)는 체크인 배지(`badges.type='checkin'`)가 아니면 400으로 거절한다(티켓 20261018_1813). **배지가 소프트 삭제(`badges.deleted_at`)돼도 이 FK는 정리되지 않는다** — 배지를 삭제해도 POI 쪽 연결은 그대로 남는다. 화면에서 연결 배지 이름을 표시할 때는 반드시 `badges.deleted_at`도 함께 조회해 비활성화 여부를 구분해야 한다(누락 시 삭제된 배지 이름이 계속 노출되는 버그가 됨 — 20260830_1547) |
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
| expires_at | **유저 드랍·system 드랍 모두 값을 넣지 않는다(NULL).** 컬럼 기본값이 없고 `create_user_drop()`·`mint_and_place_ambient_drop()` 둘 다 비워 둔다. 유저 드랍은 회수·만료 없이 픽업될 때까지 대기하고, system 드랍은 상시 존재가 전제다(한시 노출은 `badges.valid_from/valid_until`로 대체). 값이 남아 있는 행은 마이그레이션 108(2026-08-29) 이전에 30일 기본값으로 만들어져 그 시점에 이미 비활성이던 유저 드랍뿐이다. `expire_stale_poi_drops()`는 활성 드랍만 고르므로 이 행들은 정리 대상이 아니다 |
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
어드민 주도 드랍 이벤트용 초기 테이블. 034(드랍엔진 v2) 이후 `drop_policy`가 사실상 후속 확장판이었다 — 그 `drop_policy`도 지금은 코드가 쓰지 않는다(아래).

### user_drop_state / drop_policy (옛 드랍엔진 v2의 표 — 엔진은 지웠다)
옛 드랍엔진 v2(`lib/drop-engine/index.ts`·`layers.ts`·`policy.ts` 등)와 어드민 «드랍 정책» 화면은 2026-10-22(티켓 20261022_0938 1회)에 지웠다. 동기화·캡슐의 아이템 배지 발급은 JAM 2.0 경로(`lib/drop-engine/syncIssue*.ts`, 설정은 `jam_policy`·`capsule_policy`)가 한다 — 상세는 [BadgeEngine 문서](../badge-engine/BADGE_ENGINE_UNIFIED.md) §3.0 참고. 공용 DB의 표와 열은 옛 프로덕션 코드가 아직 읽어서 남아 있다.

- **`drop_policy`** (옛 엔진 파라미터 싱글톤): 코드가 읽지도 쓰지도 않는다. **코드가 쓰지 않음. 정리 SQL 271 작성됨, 출시 뒤 실행 대기(티켓 20261022_0938 2회)**다.
- **`user_drop_state`**: 발급 경로(동기화·캡슐)가 읽고 쓰는 열은 `user_id`·`common_streak`(동기화와 캡슐이 합산)·`capsule_epic_miss`(캡슐)·`updated_at`뿐이다. 옛 엔진 전용이던 7열(`last_drop_tribe_id`·`last_drop_book_id`·`last_piece_pity`·`daily_drop_count`·`daily_drop_date`·`total_drops`·`last_activity_at`)은 코드가 읽지도 쓰지도 않는다. **정리 SQL 272 작성됨, 출시 뒤 실행 대기(티켓 20261022_0938 2회)**다. `last_drop_tribe_id`·`last_drop_book_id`에는 `tribes`·`item_books`를 가리키는 외래키(삭제 시 NO ACTION)가 있다. 어드민 삭제 가드(`lib/admin/reference-guards.ts`), 트라이브 목록의 참조 개수(`lib/admin/tribe-list.ts`), 운영툴 컬렉션 되돌림 참조 확인(`lib/admin/registerChecks/references.ts`)은 이 두 열을 조회했지만 2회에서 코드를 걷어, 삭제 가드의 참조 목록에 `user_drop_state`가 없다. SQL 272를 실행하기 전까지는 DB 외래키가 이 두 열이 가리키는 트라이브·컬렉션의 삭제를 막는다(어드민 삭제 라우트는 500으로 답한다).

> ℹ️ **등급 컬럼명은 앱 키와 일치한다** — `drop_policy`·`ambient_drop_config`는
> `rarity_epic`/`rarity_mystic`, `abusing_policy`는 `soft|hard_epic_rate`/`soft|hard_mystic_rate`.
> 한동안 테이블마다 이름이 갈라져 옛 `src/lib/drop-engine/policy.ts`(지웠다)가 입출력 시점에 변환했으나
> (티켓 20260813_003의 컬럼 rename 누락 → 20260831_1118의 한시적 대응), 마이그레이션 115가
> 세 테이블을 전부 통일하면서 그 변환 매핑은 제거했다(티켓 20260831_1115).
>
> ℹ️ 아래 Epic 차단율 이야기는 이력이다. 6-4 2회(티켓 20261021_1250)에서 `shadow-ban.ts`와 배율 8열을 읽고 쓰던 코드(어드민 «정책 설정» 탭의 배율 입력, 저장 API의 0~1 검증, `DEFAULT_POLICY`의 배율 8칸)를 모두 지웠다. 배율 8열은 **코드가 쓰지 않음, 열 정리 대기(6-4 4회)**다.
>
> ⚠️ **`abusing_policy`의 Epic 차단율은 의도적으로 꺼둔 상태였다.** 컬럼명이 어긋나 있던 동안
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
설정한다. `all_random` 칸은 옛 프로덕션 코드용으로 남아 있고, 코드는 읽지도 쓰지도 않는다(티켓 20261018_1813 — 세 축은 각자의 모드만 따른다. 티켓 20261022_0938 1회에서 설정 타입·저장 값에서도 뺐다). **코드가 쓰지 않음. 정리 SQL 274 작성됨, 출시 뒤 실행 대기(0938 2회)**다. `auto_enabled`(예약 배포
사용 여부)·`schedule_hour_kst`(예약 배포 시각 — **KST 정시 0~23**)·`exclusion_window_minutes`
(그 시각 전후 즉시 배포 차단 창)로 예약 배포/즉시 배포 트리거의 상호 배제를 관리한다.
`last_auto_run_on`(KST 날짜)은 매시 도는 cron이 하루 2회 배포하지 않도록 조건부 UPDATE로
선점하는 **시스템 전용 필드**다 — 어드민 저장 경로에서 제외돼 있다(마이그레이션 137, 티켓
[20260906_1206](../../tickets/p1-high/20260906_1206_BadgeEngine_앰비언트-드랍-배포시각-어드민설정.md)).
`batch_size`/`max_active_per_poi`는 3축에 속하지 않는 실행
파라미터. 상세 로직은 [BadgeEngine 문서](../badge-engine/BADGE_ENGINE_UNIFIED.md) §3.12 참고.

**편집 위치** (티켓 20261022_1134 3회): 숫자 8열(`schedule_hour_kst`·`exclusion_window_minutes`·`batch_size`·`max_active_per_poi`·`rarity_common/rare/epic/mystic`)은
어드민 밸런스 설정(`/admin/balance#ambient`)의 «시스템 드랍» 구역이 `updated_at` 조건으로 바꾼다. `rarity_*`는 `NUMERIC(4,3)`(0~1, 합 1)이고 그 화면은 퍼센트(소수 첫째 자리, 합 100)로 보이고 저장할 때 0~1로 바꾼다.
상호 배제 창 상한은 코드 기준 180분이다. `auto_enabled`와 세 축 고르기(`*_mode`·`category_slug`·`collection_ids`)는 어드민 `/admin/ambient-drop`의 저장(`PUT /api/admin/ambient-drop/config`)이 이 **여섯 열만** 쓴다.
`updated_at`은 마이그레이션에 갱신 트리거가 없고 두 화면의 저장이 직접 올린다(`last_auto_run_on`만 쓰는 cron 선점은 올리지 않는다).

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

**JAM 2.0 믹스 고치기 (마이그레이션 236, 티켓 20261018_0055)**: 새 칸 셋을 덧붙였다. `description`(TEXT, nullable —
레시피 설명, 유저에게 보인다), `reward_locked`(BOOLEAN NOT NULL 기본 false — 결과 아이템 배지를 잠긴 채 지급할지.
잠김으로 만든 배지 `badges.always_locked`는 이 값과 상관없이 늘 잠긴다), `allow_no_reward`(BOOLEAN NOT NULL 기본
false — 보상 없음 허용). CHECK `combination_recipes_reward_present_check`는 «`allow_no_reward`이거나 포인트가 있거나
보상 배지가 하나 이상»으로 바뀌었다. 기본값이 false라 옛 행과 옛 어드민의 저장은 지금처럼 보상 하나 이상을 요구하고,
새 어드민 저장 라우트만 `allow_no_reward`를 켠다(운영 로직 8.4절). 레시피당 슬롯 상한은 5다(운영 로직 8.6절, 코드 상수
`MAX_SLOTS`·`MAX_ITEMS`).

**JAM 2.0 단서 레시피와 옛 레시피 끄기 (마이그레이션 281·282, 티켓 20261022_1138)**: 단서 레시피는 단서 20개 × 등급 4개(Common·Rare·Epic·Mystic)라 80건이다.
재료와 보상은 레시피와 같은 등급의 아이템 배지이고, 이름과 설명은 4등급이 같다(컬렉션의 등급은 처음 꽂은 아이템 배지의 등급으로 정해지고 그 뒤로는 같은 등급만 꽂을 수 있어서다. 운영 로직 8.3절).
80건은 `valid_from`에 먼 미래 자리 값 `2099-01-01 00:00 KST`를 넣어 숨긴 채 들어간다. 오픈 전까지 일반 유저와 프로덕션에는 보이지 않고, 운영자만 staging에서 공개 전 시험 믹스를 한다. 오픈 직전 SQL(묶음 7의 7-9 목록)이 이 칸을 실제 오픈 시각으로 바꾼다.
성공 포인트(`reward_points`)는 재료 수 × 10이고 4등급에 같으며, 칸은 재료마다 하나(`allowed_badge_ids` 후보 1개)라 4등급이면 344개다. 옛 트라이브 단독 레시피 3건은 마이그레이션 282가 오픈 직전에 `valid_until`을 채워 끈다(지우지 않는다).
내용과 건수는 [COMBINE_RECIPES.md](../content/COMBINE_RECIPES.md) 4절이고, 끄기 직전 상태는 4-4절의 백업 표가 담는다.

**JAM 2.0 등급 올리기는 레시피 행을 만들지 않는다 (티켓 20261022_2119, 7-7a)**: 등급 올리기는 `combination_recipes`·`combination_recipe_slots`에 행을 넣지 않고 규칙 하나로 처리한다(사용자 결정 2026-10-23).
처음 계획한 레시피 1,350건(마이그레이션 283)은 공용 DB에 적용된 적 없이 폐기했고 파일을 지웠다. 이 기능으로 스키마는 바뀌지 않는다.
규칙(재료 같은 등급 5개, 결과 등급은 확률로 정해짐, 아이템은 균등)은 [COMBINE_RECIPES.md](../content/COMBINE_RECIPES.md) 4절이다.

**삭제 가드** (`recipe-references.ts`, 티켓 20261001_1200): `combination_recipes.id`를 FK로 참조하는
테이블은 없다. 대신 삭제되지 않은(`deleted_at IS NULL`) 배지의 조건
`condition_json.recipe_first_success.recipe_id`가 레시피를 가리키면 단건·일괄 삭제를 막는다(단건
409, 일괄은 건너뜀 사유 — 「이 레시피를 가리키는 배지가 N개 있어요」). 참조 조회가 실패해도
삭제를 막는다(fail-closed).

### combination_recipe_slots (신규, 티켓 20260917_1427)
레시피당 슬롯 2~5개(최소 1개는 아이템 타입, 상한은 티켓 20261018_0055에서 10에서 5로 낮췄다. 공용 DB의 기존 레시피 3개는 모두 3개 이하라 영향이 없다). `slot_order`, `badge_type`(item/activity/checkin,
슬롯 단위로 고정), `allowed_badge_ids[]`(같은 타입 배지 후보, OR — 유저는 슬롯당 하나만 채운다).

### combine_policy (싱글톤)
`fail_reward_points`(미매칭 시 지급할 고정 포인트)와 `tier_up_probability`(등급 올리기에서 결과 등급이 재료 등급의 바로 위일 확률) 두 칸이 있다. 트라이브 다양성 티어
확률 정책·피티 카운터(`user_combine_state`)는 2026-09-10 폐기됐다.
`tier_up_probability`는 마이그레이션 287(티켓 20261023_1648, 7-7b 1회)이 더한 `NUMERIC NOT NULL DEFAULT 0.7`이고 `CHECK`로 0 이상 1 이하만 받는다. 0.7이면 윗등급 70%, 같은 등급 30%다. 재료 등급마다 따로 두지 않는 한 칸이다. 이 칸은 서버 규칙(`getCombinePolicy`)·확률 안내(`COMBINE_COLUMNS`, 칸을 엄격하게 읽음)·어드민 칸이 읽고 쓴다(7-7b 2·4회). 코드의 `DEFAULT_COMBINE_POLICY.tier_up_probability`(0.7)가 칸이 없는 DB에서도 같은 값으로 움직이게 한다.
편집 화면은 어드민 «밸런스 설정»의 «컬렉션과 믹스» 구역이다(`/admin/balance#collection`, 티켓 20261022_1133, [ADMIN_PRD.md](admin-ui/ADMIN_PRD.md) §5-9). 지금 화면에서 고치는 칸은 `fail_reward_points`(0 이상 정수)와 `tier_up_probability`(화면은 퍼센트 0~100, DB는 0~1)이고, 저장하면 `updated_at`을 직접 올리며 변경 이력이 남는다. 두 칸을 함께 바꿔도 한 행이라 한 번의 갱신이다.
옛 «믹스 정책» 화면(`/admin/combine-policy`)과 그 API는 없앴다. 정책 대시보드의 저장 라우트(`PUT /api/admin/policy-dashboard/field`)도 티켓 20261022_1717에서 없앴다. `lib/combine/policy.ts`의 `updateCombinePolicy`는 부르는 곳이 없어졌지만 함수와 시험은 남아 있다(삭제는 후속).

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
- RPC `record_combine_success_with_id`(같은 인자 5개 → `JSONB { id, is_recipe_first }`, 마이그레이션 254,
  티켓 20261019_1315 3회) — 위 함수와 같은 동작에 방금 넣은 행의 id를 함께 돌려준다. 챕터 점수 «믹스 성공»의
  원천 id가 이 행의 id라서 더했고, **앱은 지금 이 함수를 부른다**(9-3절). 위 함수는 바꾸지 않았다 — 옛
  프로덕션 코드가 계속 부르므로 남겨 두고, 그 코드가 사라지는 묶음에서 지운다.
- 유저 초기화(`resetUserData`)는 이 기록도 함께 지운다.

> 조합 시스템은 v1(2026-07 초 계획) → v2(2026-07-27 재설계, "정석 레시피/재료 정확 매칭")로 갈아엎어짐. 현재 상세는 [docs/service/content/COMBINE_RECIPES.md](../content/COMBINE_RECIPES.md) 참고.

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

유저가 직접 참가를 취소하는 길은 없다. 트라이브가 바뀌어 대상이 아니게 된 미션의 참가만 서버가 취소한다(`mission_cancel_for_tribe_change`, 아래).

### mission_allowed_tribes / mission_participation_cancellations / mission_complete / mission_cancel_for_tribe_change — 마이그레이션 249, 티켓 20261019_1311
JAM 2.0 운영 로직 13.2절(트라이브 미션과 선착순 동시 완료)의 서버 쪽 바탕이다. **새 표 2개와 새 함수 2개만 더했고 옛 표·칸·함수는 바꾸지 않았다**(공용 DB라 옛 프로덕션 코드가 같은 표를 쓴다). 2026-10-19 공용 DB에 적용했다.

#### mission_allowed_tribes
미션에 참가할 수 있는 트라이브. `(mission_id, tribe_id)` 복합 PK, 미션 하나에 트라이브마다 한 행이다. **행이 하나도 없는 미션은 모든 유저가 하는 공통 미션**이다. 미션을 지우면 연결도 함께 지워지고(`ON DELETE CASCADE`), 연결된 트라이브는 지울 수 없다(`ON DELETE RESTRICT` — 연결이 조용히 사라져 트라이브 미션이 공통 미션으로 넓어지는 것을 막는다). RLS를 켜고 anon·authenticated의 권한을 모두 회수했다(서버 service_role만 읽고 쓴다).
판정은 `src/lib/missions/tribe-access.ts`의 `isMissionOpenToTribe` 한 곳이다: 허용 목록이 비었거나 없으면 열림, 있으면 유저의 `users.tribe_id`가 들어 있을 때만 열림, 트라이브가 아직 없는 유저(온보딩 전)는 목록이 있는 미션이 닫혀 공통 미션만 본다. 목록(`/missions`)·상세·참가·오늘카드가 `loadMissionVisibilityContext`로 같은 규칙을 쓰고(`visibility.ts`가 완료 판정 다음·게이트 판정 앞에서 `hidden`), 상황 조회(`/api/missions/[id]/status`)도 같은 판정을 쓴다. 대상이 아니면 상세·참가·상황 조회는 404(없는 미션)이고, 이미 완료한 미션은 완료 이력으로 계속 본다. 허용 목록을 읽지 못하면 «제한 없음»으로 보지 않고 오류로 끝낸다.

#### mission_participation_cancellations
트라이브가 바뀌어 취소된 참가의 기록. `id`, `user_id`(CASCADE), `mission_id`(CASCADE), `joined_at`, `progress_value`, `was_completed`(취소 당시 완료 여부), `new_tribe_id`(SET NULL), `reason`(기본 `tribe_changed`), `cancelled_at`. RLS를 켜고 anon·authenticated 권한을 모두 회수했다.

#### mission_complete(p_user_id, p_mission_id) → jsonb
완료 기록을 한 트랜잭션에서 남기는 SECURITY DEFINER 함수(service_role만 실행). `checkMissions`(`src/lib/missions/checker.ts`)가 조건을 채운 미션마다 부른다. 선착순(`max_completions`)이 있는 미션이면 미션마다 어드바이저리 잠금을 잡은 뒤 완료 수를 세고 기록해 **동시에 동기화해도 상한을 넘지 않는다**(상한이 없는 미션은 잠금 없음). 이용 정지·미참가·트라이브 불일치는 앱이 먼저 막고 함수가 한 번 더 막는다.
- 반환: `{ok:true, status:'completed', completion_id}` / `{ok:true, status:'already_completed'}` / `{ok:false, error:'mission_not_found'|'user_suspended'|'not_participating'|'tribe_not_allowed'|'mission_full'}`.
- 앱은 `completed`일 때만 보상·피드·소식을 이어가고, 그 밖의 응답과 RPC 호출 실패, 계약과 다른 응답은 완료시키지 않는다. 예전의 «개수 세기 → INSERT»와 개수 조회 실패 때의 `count ?? 0`(상한 무시)은 없앴다.
- `checkMissions`는 완료 기록 id를 `completedMissions: { missionId, completionId }[]`로 돌려준다(챕터 점수가 원천 id로 쓴다). 기존 `completedMissionIds`는 그대로다.

#### mission_cancel_for_tribe_change(p_user_id) → (out_mission_id, out_mission_title)*
유저의 현재 트라이브가 대상이 아닌 트라이브 제한 미션의 참가를 취소하고(참가 행 삭제, `mission_participation_cancellations`에 기록) 취소한 미션마다 한 행을 돌려준다(호출한 쪽이 소식을 보낸다). 공통 미션과 새 트라이브가 대상인 미션은 그대로이고, 트라이브가 없는 유저는 제한 미션을 모두 취소한다. **이미 완료한 미션의 참가도 취소하지만 완료 기록과 받은 보상은 지우지 않는다**(선착순 자리를 센 완료 기록도 남아 상한에 계속 들어간다). 참가 행이 지워지므로 순위에서 빠진다. **부르는 곳은 어드민 트라이브 변경 함수 `admin_change_user_tribe`(마이그레이션 259) 하나다** — 트라이브를 먼저 갱신한 뒤 같은 트랜잭션 안에서 부른다(아래). 돌려준 목록으로 소식을 만드는 함수(`notifyMissionParticipationCancelled`)는 아래 마이그레이션 251 절에 있다.

### mission_item_rewards / mission_grant_item_rewards / mission_claim_item_rewards — 마이그레이션 250, 티켓 20261019_1313
JAM 2.0 운영 로직 13.2절·6.4절(미션 보상의 새 개체 복사, 가득 참 보류와 받기)의 서버 쪽 바탕이다. **새 표 1개와 새 함수 2개만 더했고 옛 표·칸·함수는 바꾸지 않았다.** 2026-10-19 공용 DB에 적용했다. 본보기는 믹스의 `combine_pending_results`·`combine_grant_results`·`combine_claim_pending`(마이그레이션 236)이다. 동기화 보류(`sync_pending_items`)는 «고른 것만 받고 나머지는 폐기»라 미션 보상이 섞이면 영구 폐기되므로 합치지 않고 미션 전용 표를 따로 뒀다.

#### mission_item_rewards
미션이 유저에게 준(`claimed`) 또는 인벤토리 빈칸이 모자라 아직 못 준(`pending`) 아이템 배지 보상의 기록. 미션 하나가 유저에게 주는 배지마다 한 행이고 `(user_id, mission_id, badge_id)`가 유일해 같은 미션의 같은 배지를 두 번 기록하지 않는다. 기한이 없다(미션 기간이 끝난 뒤에도 받는다). RLS를 켜고 anon·authenticated 권한을 모두 회수했다(서버 service_role만 읽고 쓴다).

| 칸 | 뜻 |
|---|---|
| `user_id` | 주인. 유저 삭제 시 함께 삭제(`ON DELETE CASCADE`) |
| `mission_id` | 보상을 준 미션. 미션을 지우면 기록도 함께 지워진다(`ON DELETE CASCADE`) — 받지 않은 보상도 사라진다 |
| `badge_id` | 아이템 배지. 규칙 없음(NO ACTION)이라 기록이 남은 배지는 지울 수 없다 |
| `locked`·`lock_reason`·`unlock_required` | 잠김. 지급할 때가 아니라 **기록할 때** 배지 설정(`badges.always_locked`)으로 고정한다(받기 전에 배지 설정이 바뀌어도 그대로). 잠겼으면 까닭(`badge_locked`)과 필요한 양이 있어야 한다. 미션에는 잠김 칸이 없다 |
| `status` | `pending`(받지 않음) 또는 `claimed`(받음) |
| `inventory_item_id` | 받아서 생긴 개체(`ON DELETE SET NULL`) |
| `created_at`·`resolved_at` | 기록한 때, 받은 때 |

#### mission_grant_item_rewards(p_user_id, p_mission_id, p_badge_ids) → jsonb
아이템 배지(`badges.type = 'item'`, 삭제되지 않음)만 처리하는 SECURITY DEFINER 함수(service_role만 실행). 이 미션에서 이미 기록된 배지는 건너뛰어 다시 불러도 중복 지급이 없다. **이미 가진 배지도 새 개체로 준다**(일련번호는 새로 매겨진다). 남은 배지가 **모두 들어갈 빈칸이 있으면 전부** `grant_inventory_item_locked`로 줘서 `claimed`로 기록하고 개체 이력(`inventory_item_events` `received`)을 남긴다. **모자라면 아무것도 주지 않고 전부** `pending`으로 기록한다(일부만 주지 않는다).
- 반환: `{ok:true, status:'none'|'granted'|'pending', itemIds, pendingCount[, free, needed]}` / `{ok:false, error:'mission_not_found'|'inventory_not_found'}`.
- 앱은 `grantMissionRewards`(`src/lib/missions/rewards.ts`)가 미션 완료 때 부른다. 액티비티 배지는 지금처럼 `user_activity_badges`에 넣고, 액티비티·아이템 외 유형(체크인 등)과 숨김 배지(`badges.is_hidden`)는 지급하지 않는다(경고만 남긴다). 반환 계약은 `src/lib/missions/claim-contract.ts`가 읽고, 계약 밖 응답은 성공으로 보지 않는다.
- **포인트는 이 함수가 주지 않는다.** 아이템 배지의 포인트는 열린 개체를 받을 때 한 번, 잠긴 개체는 열 때(`locked_item_open`) 준다. 앱이 `granted` 결과의 개체 id로 `inventory_items.locked`·`point_awarded_at`을 읽어 열린 개체에만 `badge_point_reward`를 주고 `point_awarded_at`을 적는다(`src/lib/missions/itemRewardFollowUp.ts`). 남은 칸 알림도 이 후속이 부른다.
- `pending` 결과는 `MissionRewardResult.pendingItemBadgeIds`(잠긴 배지는 `pendingLockedBadgeIds`에도)로 돌아가 `checkMissions`가 `MissionCheckResult.pendingItemBadgeIds`와 `mission_completed` 피드의 `pending_item_badge_ids`(잠긴 배지 제외)에 싣는다.

#### mission_claim_item_rewards(p_user_id, p_mission_id) → jsonb
한 미션의 `pending` 보상을 모두 받는 SECURITY DEFINER 함수(service_role만 실행). **모두 들어갈 빈칸이 있어야 한다**(일부만 받기 없음). 이용 정지 중이면 거부하고, 인벤토리 행과 보상 행을 잠그고 `pending → claimed`로 바꾸므로 같은 보상을 두 번 주지 않는다. 기록해 둔 잠김을 그대로 개체로 옮긴다.
- 반환: `{ok:true, granted, itemIds}` / `{ok:false, error:'user_suspended'|'inventory_not_found'|'no_pending'|'insufficient_slots'[, free, needed]}`.
- API: `POST /api/missions/[id]/claim`(`src/app/api/missions/[id]/claim/route.ts`). 401 → 미션 id가 UUID가 아니면 404 → 이용 정지 403 `user_suspended`(`d.suspension.missionClaimBlocked`) → 함수 호출. 거절은 `no_pending` 409, `insufficient_slots` 409(`free`·`needed` 포함), `inventory_not_found` 404로 옮기고 오류 응답에 내부 정보를 싣지 않는다. 성공이면 위 후속(열린 개체의 배지 포인트·남은 칸 알림)을 처리하고 `{granted, itemIds}`를 돌려준다. 받기에는 트라이브 접근 검사를 하지 않는다(완료한 유저는 상세를 계속 볼 수 있다). 받는 화면은 후속(5-7)이다.

#### 미션 상세의 받지 않은 보상과 기록 읽기 — 티켓 20261019_1313 3회
- `pendingRewards`: 미션 상세 페이지(`src/app/(main)/missions/[id]/page.tsx`)가 내 `mission_item_rewards` 가운데 `status = 'pending'`을 읽어 `MissionDetailClient`의 선택 prop `pendingRewards`로 내린다(기록한 순서). 열린 보상은 `{ locked: false, id, name, image_url, rarity }`, **잠긴 보상은 `{ locked: true, rarity }`뿐이다** — 이름·그림·설명·배지 id를 싣지 않는다(운영 로직 7.3절). 잠김은 기록할 때 고정한 `mission_item_rewards.locked`를 따르고, 등급이 없는 배지는 `rarity`가 null이다(Common으로 접지 않는다). 소프트 삭제 배지도 거르지 않는다 — 받기 함수가 삭제 여부를 보지 않고 모두 주고 필요한 칸 수에 세기 때문이다. 숨김 배지(`badges.is_hidden`)는 어느 쪽으로도 싣지 않는다. 기록이나 배지를 읽지 못하면 빈 배열이 아니라 `null`이다(5-7 2회, 티켓 20261019_1317) — 화면이 «받을 보상 없음»(빈 배열)과 구분해 완료한 미션에서만 읽지 못했다고 알린다. 화면은 비어 있지 않을 때 «받을 보상» 카드와 «받기» 버튼을 그린다.
- `loadMissionRecords(userId, missionId)`(`src/lib/missions/records.ts`): 참가(`joinedAt`, 지금 진행 값), 완료, 받은 보상(`claimed`), 받지 않은 보상(`pending`), 참가 취소(최근 순)를 한 번에 읽는다. **읽기 전용**이고 어드민 유저 상세와 5-7이 쓴다. 보상은 `mission_item_rewards`의 아이템 배지 보상만 담고(액티비티 배지·포인트 보상은 미션과 연결한 표가 없어 읽지 않는다), 진행의 시점별 이력은 두지 않는다(결정 5-b: 진행 값은 참가 행의 현재 값과 취소 당시 값, 50%·80% 돌파는 소식이 갖는다). 반환값은 서버 안에서만 쓴다 — 보상 행에 `locked`와 상관없이 `badgeId`가 들어 있어, 유저 화면으로 내릴 때는 잠긴 보상의 `badgeId`를 빼야 한다. 하나라도 읽지 못하면 «기록 없음»으로 보지 않고 `MissionRecordsReadError`를 던진다(DB 원문은 메시지에 싣지 않는다).

#### 이용 정지와 순위
이용 정지 중인 유저는 미션에 참가할 수 없고(`POST /api/missions/[id]/join` 403 `user_suspended`), 다른 유저가 보는 순위·달성자 목록과 `totalParticipants`에서 빠진다. 본인 화면에는 본인이 계속 보이고, 정지가 풀리면(`user_suspensions.lifted_at`) 다시 보인다. 순위 상승 소식(#23) 배치도 같은 목록으로 순위를 매긴다. 판정은 `filterRankableParticipants`(`src/lib/missions/ranking.ts`)와 `getSuspendedUserIds`(`src/lib/suspension/suspension.ts`)다.

### notification_type `mission_participation_cancelled` — 마이그레이션 251, 티켓 20261019_1313
알림 종류 enum `notification_type`에 `mission_participation_cancelled`를 더했다(트라이브 변경에 따른 미션 참가 취소, 운영 로직 13.2절). 옛 알림 종류는 바꾸지 않았다. 2026-10-19 공용 DB에 적용했다.
- 만드는 곳: `notifyMissionParticipationCancelled(userId, cancelled)`(`src/lib/missions/participation-cancel.ts`)가 `mission_cancel_for_tribe_change`가 돌려준 (미션 id, 이름) 목록으로 `createNotification`을 부른다. 부르는 곳은 어드민 트라이브 변경 `changeUserTribe`(`src/lib/admin/user-tribe.ts`, 티켓 20261021_1247)다. 목록이 비면 만들지 않는다.
- payload: `{ missions: [{ mission_id, title }] }`. 한 번의 변경으로 취소된 미션 전부가 한 행이고, 개수는 배열 길이로 센다. 같은 미션 id는 한 번만 싣는다.
- 키: `once`. 미션 1개면 `mission_participation_cancelled:{mission_id}:{KST 날짜}`, 2개 이상이면 `mission_participation_cancelled:group:{KST 날짜}:{지문}`이다. 같은 날 같은 묶음은 한 번만, 날이 다르면 새로 만든다.
- 알림함: 문구 «트라이브가 바뀌어 「○○」 미션 참가가 취소됐어요», 여러 개면 «트라이브가 바뀌어 미션 N개 참가가 취소됐어요». 이동 위치는 단건도 `/missions`다(대상이 아닌 트라이브의 미션 상세는 404). 자세한 문구는 `notification/PRD.md` §3 ④(#47)다.

### notification_type `chapter_up` — 마이그레이션 255, 티켓 20261019_1316
알림 종류 enum `notification_type`에 `chapter_up`을 더했다(챕터 오름 소식, 운영 로직 12.3절). 옛 알림 종류는 바꾸지 않았다. 새 enum 값은 같은 트랜잭션에서 쓸 수 없어(55P04) 값을 쓰는 코드와 나눈 별도 파일이다. 2026-10-20 공용 DB에 적용했다. 되돌림은 enum 값을 지울 수 없어 앱이 값을 만들지 않게 하고 값은 쓰지 않은 채로 두는 방식이다(파일 끝에 적음).
- 만드는 곳: `processChapterRise`(`src/lib/chapter/rise.ts`)가 `createNotification`을 부른다. 아래 «챕터 1 시작과 오름 처리».
- payload: `{ chapter_no }` — 오른 챕터 가운데 가장 높은 번호(2 이상). 챕터는 숫자로만 표기하므로 이름은 싣지 않는다(2026-10-21 결정).
- 키: `chapter_up:{chapter_no}` + `once`. 같은 챕터 소식은 다시 만들어지지 않는다.
- 알림함: 문구 «축하해요! 챕터 N에 올랐어요», 이동 위치는 내 프로필(`/{username}`, 아이디가 없으면 `/profile`), 아이콘은 메달이다. 자세한 문구는 `notification/PRD.md` §3 챕터(#48)다.

### user_tribe_changes / admin_change_user_tribe / users_block_client_tribe_write / notification_type `tribe_changed` — 마이그레이션 258~261, 티켓 20261021_1247 2회
JAM 2.0 운영 로직 2.4절(운영자가 트라이브를 바꾼다)의 서버 쪽 바탕이다. **새 표 1개, 새 함수 2개(변경 함수·트리거 함수), 새 트리거 1개, 알림 종류 값 1개만 더했고 옛 표·칸·함수의 서명과 권한은 바꾸지 않았다**(공용 DB라 옛 프로덕션 코드가 같은 DB를 쓴다). **마이그레이션 4개는 파일만 작성했고 공용 DB에는 아직 적용하지 않았다**(2026-10-21 기준 — 카리나가 롤백 실측과 사용자 승인 뒤 적용한다. 적용하면 이 문장을 적용 날짜로 바꾼다).

#### user_tribe_changes — 마이그레이션 258
어드민이 유저의 트라이브를 바꿀 때마다 한 행. 사용자 결정 8(2026-10-21): 트라이브 변경 전용 표이며 포인트·권한 등 다른 어드민 조치의 기록과 공통 기록 표는 이 티켓 범위 밖이다.
`id`, `user_id`(→ `users`, CASCADE), `from_tribe_id`·`to_tribe_id`(→ `tribes`, ON DELETE 미지정 = NO ACTION), `reason_code`, `memo`, `changed_by`(→ `users`, SET NULL), `cancelled_mission_count`(기본 0), `created_at`. 인덱스는 `(user_id, created_at DESC)`다.
- `reason_code`는 앱 상수의 코드(`wrong_pick`·`user_request`·`ops_fix`·`other`)이고 **CHECK를 두지 않는다**(사용자 결정 9 — 목록을 바꿀 때 마이그레이션이 필요 없다). 메모는 `other`일 때 앱이 필수로 받고 200자까지다.
- `from_tribe_id`·`to_tribe_id`가 NO ACTION이라 변경 이력이 있는 트라이브는 지울 수 없다. 어드민 트라이브 삭제 가드(`TRIBE_REFERENCE_SOURCES`의 `user_tribe_changes`)와 목록의 삭제 불가 사유 집계가 같은 참조를 막는 참조로 센다.
- `changed_by`는 바꾼 어드민이다. 어드민 계정이 `users`에 없으면(환경변수 화이트리스트 계정 등) NULL로 남고 변경은 실패하지 않는다.
- RLS를 켜고 정책을 두지 않았고 anon·authenticated 권한을 모두 회수했다(서버 service_role만 읽고 쓴다).

#### admin_change_user_tribe(p_admin_id, p_user_id, p_new_tribe_id, p_reason_code, p_memo) → jsonb — 마이그레이션 259
SECURITY DEFINER(`search_path = public`), service_role만 실행한다(`anon`·`authenticated`·PUBLIC 권한 없음). 선례는 252 `admin_deduct_points`다. **한 트랜잭션**에서 (가) 사유 코드 검사 (나) 유저 행 `FOR UPDATE`(같은 유저에게 동시에 들어온 변경을 직렬화) (다) 검사 (라) `users.tribe_id` 갱신 (마) `mission_cancel_for_tribe_change(p_user_id)` 호출 — **취소 함수가 지금의 `tribe_id`를 읽으므로 반드시 갱신 뒤** (바) `user_tribe_changes` 삽입 (사) 결과 반환. 예외가 나면 전체가 롤백되고, 거절하면 아무것도 바꾸지 않는다. 새 트라이브 행은 `FOR SHARE`로 잠가 검사와 갱신 사이에 비활성·삭제되지 않게 한다.

| 응답 | 뜻 |
|---|---|
| `{ok:true, changeId, fromTribeId, toTribeId, toTribeName, cancelled:[{missionId, title}]}` | 변경 완료. `cancelled`가 빈 배열이면 취소된 미션이 없다 |
| `{ok:false, code:'reason_required'}` | 사유 코드가 비었다(앞뒤 공백 제거 뒤) |
| `{ok:false, code:'user_not_found'}` | 유저가 없다 |
| `{ok:false, code:'no_tribe'}` | 트라이브를 고르지 않은 유저다 — 그런 유저는 고르기 화면에서 스스로 고른다 |
| `{ok:false, code:'invalid_tribe'}` | 새 트라이브가 없거나 비활성이다 |
| `{ok:false, code:'same_tribe'}` | 지금 트라이브와 같다 |

사유 코드의 값 검증(고정 목록, «기타» 메모 필수, 메모 길이)은 앱이 한다(`src/lib/admin/user-tribe.ts`). 이 함수는 코드와 메모를 그대로 남기고 메모는 앞뒤 공백을 지워 빈 문자열이면 NULL로 둔다. 이미 받은 배지·잼·챕터와 완료 기록은 건드리지 않고, 보류 중인 아이템 배지도 옛 트라이브의 것 그대로 둔다(이미 번 것을 유지하는 원칙, 사용자 결정 (라)). 끝난 미션의 참가도 5-1 동작대로 함께 취소한다.
앱의 호출 경로: `changeUserTribe`(`src/lib/admin/user-tribe.ts`)가 사유를 검증하고 RPC를 부른 뒤, 성공하면 소식 한 건(`tribe_changed`)과 취소된 미션이 있으면 참가 취소 소식 한 건을 보낸다(소식은 던지지 않고, 실패해도 변경은 유지). 거절 코드는 라우트 `/api/admin/users/[id]/tribe`(POST)가 400·404·409로 나눠 응답한다. 같은 라우트의 GET이 최근 변경 이력과 영향 미리 보기(`previewTribeChange` — 취소 함수와 같은 기준으로 취소될 미션을 읽기만 한다)를 돌려준다.

#### 유저의 직접 쓰기 차단 — `users_block_client_tribe_write` 트리거, 마이그레이션 260
`public.users`의 「본인만 수정」 정책은 `USING (auth.uid() = id)`뿐이고 `WITH CHECK`와 열 제한이 없으며 `authenticated`에 `tribe_id` 열 UPDATE 권한이 있어, 로그인한 유저가 브라우저에서 본인 `tribe_id`를 직접 바꿀 수 있는 틈이 있었다(2026-10-21 정책·권한·트리거를 SELECT로 확인). `is_admin`을 막는 마이그레이션 219의 트리거와 같은 방식으로 막는다.
- `BEFORE INSERT OR UPDATE OF tribe_id ON public.users` 트리거. `current_user`가 `authenticated`·`anon`일 때 INSERT에 `tribe_id`가 있거나 UPDATE에서 `tribe_id` 값이 바뀌면 SQLSTATE `42501`로 거절한다(PostgREST가 403으로 돌려준다). 같은 값을 다시 보내는 저장은 통과한다.
- 트리거 함수는 SECURITY DEFINER가 아니다(`current_user`가 호출 역할로 남아야 한다). `service_role`(온보딩 완료 API, 개발 로그인)과 `postgres`, SECURITY DEFINER 함수(`admin_change_user_tribe`)는 걸리지 않는다. 권한을 회수하지 않아 다른 열의 쓰기는 영향이 없다.
- `username`·`onboarding_completed_at`도 본인이 직접 바꿀 수 있는 틈은 이 티켓 밖이다(별도 티켓 후보).
- 온보딩 완료 API(`api/onboarding/complete`)의 2단계 갱신은 `tribe_id IS NULL`일 때만 저장한다 — 읽은 뒤 쓰는 사이에 두 요청이 겹쳐도 먼저 고른 트라이브를 덮지 못한다. 바뀐 행이 없으면 기존 «이미 설정됨» 응답(409 `ALREADY_SET`)을 준다.

#### notification_type `tribe_changed` — 마이그레이션 261
알림 종류 enum `notification_type`에 `tribe_changed`를 더했다(어드민 트라이브 변경 소식). 맞는 기존 종류가 없다(`announcement`는 투데이 카드 공지). 새 enum 값은 같은 트랜잭션에서 쓸 수 없어(55P04) 값을 쓰는 코드와 나눈 별도 파일이다. 되돌림은 enum 값을 지울 수 없어 앱이 값을 만들지 않게 하고 값은 쓰지 않은 채로 두는 방식이다(파일 끝에 적음).
- 만드는 곳: `changeUserTribe`(`src/lib/admin/user-tribe.ts`)가 변경이 성공한 뒤 `createNotification`을 부른다. 티켓 `20261021_1249`(6-3) 4번의 «트라이브 변경 소식»은 이 종류로 대신한다.
- payload: `{ new_tribe_name }` — 바뀐 트라이브 이름. **유저 알림에는 사유(코드·메모)를 싣지 않는다.**
- 키: `tribe_changed:{user_tribe_changes.id}` + `once`. 변경 한 번에 한 건이다.
- 알림함: 문구 «트라이브가 바뀌었어요. 이제 ○○ 소속이에요. 이미 가진 배지와 잼, 챕터는 그대로예요»(이름이 비면 가운데 문장을 뺀다), 이동 위치는 `/profile`, 아이콘은 사람들(`UsersIcon`)이다. 자세한 문구는 `notification/PRD.md` §3(#49)다.

#### notification_type 3종과 feed_event_type 2종 — 마이그레이션 270, 티켓 20261021_1249 5회
알림 종류 enum `notification_type`에 `suspension_started`·`suspension_lifted`·`reward_pending`(33개 → 36개)을, 피드 종류 enum `feed_event_type`에 `chapter_up`·`collection_tier_completed`(6개 → 8개)를 `ADD VALUE IF NOT EXISTS`로 덧붙였다. 옛 값과 옛 코드는 그대로다. 새 enum 값은 같은 트랜잭션에서 쓸 수 없어(55P04) 값을 쓰는 코드와 나눈 별도 파일이고, **적용 순서는 DDL 먼저, 코드 배포 나중**이다(뒤집히면 `create_notification`과 피드 INSERT가 22P02로 실패하고 앱이 오류를 삼켜 새 소식·새 피드가 한 건도 안 생긴다). 되돌림은 enum 값을 지울 수 없어 앱이 값을 만들지 않게 하고 값은 쓰지 않은 채로 두는 방식이다(파일 끝에 해당 종류 행을 지우는 SQL을 적음). 공용 DB에 적용했는지는 티켓 `20261021_1249`의 진행 기록이 단일 원천이다.
- 소식 3종의 문구·착지·만드는 곳은 `notification/PRD.md` §3(#50 정지됨, #51 정지 해제, #52 받지 않은 보상)이다. 정지됨·풀림 payload에는 **사유 글, 어드민 이메일, 상담 메모를 싣지 않는다.**
- 피드 2종의 메타: `chapter_up` = `{ chapter_no }`(챕터 2 이상으로 새로 올랐을 때만, 한 번에 여러 챕터를 넘으면 가장 높은 챕터 한 건, 챕터 1 시작은 기록하지 않는다. `lib/chapter/rise.ts`). `collection_tier_completed` = `{ collection_id, collection_name, rarity }`(등급을 처음 완성했을 때만, 점수보다 먼저 기록한다. `lib/chapter/collection.ts`). 두 종류 모두 `strava_activity_id`를 비워 기록한다(§10 `user_activity_feed`). 컬렉션 메타에 `level`·`earn_count` 키를 쓰지 않는다(피드 렌더러가 읽어 Lv.N 칩·×N 필을 잘못 붙인다).

#### notification_type 2종 — 마이그레이션 302, 티켓 20261028_1734 1회
알림 종류 enum `notification_type`에 `capsule_nearly_full`·`capsule_jam_blocked`(36개 → 38개)를 `ADD VALUE IF NOT EXISTS`로 덧붙였다. 새 enum 값은 같은 트랜잭션에서 쓸 수 없어(55P04) 302의 함수는 알림 행을 만들지 않고 단계(`alertStage`)와 전환 표식(`blockedNow`)만 돌려주며, 행은 앱(`notifyCapsuleAlerts`)이 만든다. **적용 순서는 DDL 먼저, 코드 배포 나중**이다. 되돌림은 enum 값을 지울 수 없어 앱이 값을 만들지 않게 하고 값은 쓰지 않은 채로 두는 방식이다. 소식 2종의 문구·착지·발송 규칙은 `notification/PRD.md` §3의 «캡슐 — 2종»(#53·#54)이 원천이다.

---

## 9. 포인트 (JAM 포인트) — 신규 도메인

### point_wallets
유저당 1개. `balance`는 원장(point_transactions)에서 파생된 캐시값 — 직접 UPDATE 금지.

### point_transactions
append-only 원장. `reason`: `badge_point_reward` / `mission_point_reward` / `admin_grant` / `admin_deduct` / `combine_fail_reward` / `combine_recipe_reward` / `item_book_completion_point_reward`(마이그레이션 157).

### point_treasury
전체 발행/회수 총량 싱글톤 장부 — 어드민에서 유통량·월렛합·원장합 정합성 검사에 사용.

> 잔액 변경은 전부 `award_points()` RPC(SECURITY DEFINER, service_role 전용)로만 원자 처리. 어드민 회수만 앞에 `admin_deduct_points()`가 서서 잔액을 먼저 검사하고, 통과하면 `award_points()`를 부른다(아래).

### admin_deduct_points — 어드민 회수 (마이그레이션 252, 티켓 20261019_1314, 운영 로직 14.2절)
`admin_deduct_points(p_user_id, p_amount, p_admin_reason_label, p_admin_reason_note) → jsonb`. SECURITY DEFINER, `service_role`만 실행한다(`anon`·`authenticated`·PUBLIC 권한 없음). `p_amount`는 회수할 양(양수)이다.
지갑 행을 `FOR UPDATE`로 잠그고 잔액을 읽어(같은 지갑에 동시에 들어온 회수·지급을 직렬화한다) 잔액이 모자라면 아무것도 바꾸지 않고 거절을 돌려준다. 통과하면 `award_points(-양, 'admin_deduct')`로 원장·지갑·금고를 기존 방식 그대로 처리한다. 지갑이 없는 유저는 잔액 0으로 보고 거절하며 빈 지갑 행을 만들지 않는다. 사유 라벨은 검증하지 않고 원장에 그대로 남긴다(검증은 앱 몫, `lib/points/reasons.ts`).

반환 계약(앱 파서 `lib/points/deduct-contract.ts`의 `parseAdminDeductResult`가 이 세 모양만 인정하고, 그 밖의 응답은 `null`이라 호출부가 성공으로 보지 않는다):

| 응답 | 뜻 |
|---|---|
| `{ok:true, transactionId, balance}` | 회수 완료. `balance`는 회수 뒤 잔액 |
| `{ok:false, error:'insufficient_balance', balance, requested}` | 잔액이 요청 금액보다 적다. 지갑·원장·금고는 바뀌지 않는다 |
| `{ok:false, error:'invalid_amount'}` | 금액이 비었거나 0 이하 |

앱의 호출 경로: `lib/points/index.ts`의 `deductPointsByAdmin`이 RPC를 부르고, 성공이면 `admin_points_changed` 알림을 지금처럼 보낸다. 거절은 알림 없이 결과로 돌려주고, RPC 오류·계약 밖 응답·`invalid_amount`는 `engine_decision_log`(`point_award_failed`)에 남기고 `null`이다. `lib/points/admin-grant.ts`의 `executeAdminGrant`가 음수 금액에서 이 함수를 쓴다(양수 지급은 `awardPoints` 그대로). 단건 `POST /api/admin/points/grant`는 거절을 HTTP 409 `{error, code:'insufficient_balance', balance, requested}`로, 일괄 `POST /api/admin/users/bulk`(`grant_points`)는 거절된 유저를 `skipped`의 사유로 알리고 응답 200으로 나머지 유저를 계속 처리한다.

**한계.** 음수 방지는 이 함수를 거치는 새 경로에서만 유효하다. `award_points()`와 `point_wallets`는 바꾸지 않았고 옛 프로덕션 코드는 이 함수를 모른 채 계속 `award_points()`로 회수하므로, 새 앱이 배포되고 옛 코드가 사라질 때까지 그 경로는 막히지 않는다. 모든 경로를 막는 `point_wallets.balance >= 0` CHECK는 옛 코드를 정리하는 묶음 6에서 더한다(사용자 결정, 2026-10-20). 일괄 미리보기는 잔액이 모자라 건너뛰는 유저 수를 `revokeSkippedCount`로 알리고 화면 문구는 «회수하지 못하고 건너뛰는 유저 N명»이다(티켓 20261019_1318 2회). 단건 `POST /api/admin/points/grant`는 `userId`가 UUID 형식이 아니면 DB 오류(500)가 되기 전에 400으로 안내한다.

### 배지 포인트(`badge_point_reward`)를 주는 곳 (JAM 2.0, 티켓 20261019_1314, 운영 로직 14.1절)
금액은 모두 `badges.point_reward`다(원장 `source_badge_id`에 그 배지가 남는다). 지급은 `awardPoints`로 하고 실패해도 배지 발급·믹스 결과를 되돌리지 않는다(로그와 `engine_decision_log`만). 앱 코드의 지급 호출은 아래가 전부다.

| 경로 | 주는 때 | 코드 |
|---|---|---|
| 액티비티 배지 | 받을 때 한 번(반복형을 다시 받을 때는 없음) | `lib/badge-engine/index.ts`, `lib/badge-engine/usageBadges.ts` |
| 체크인 배지 | 처음 받을 때 한 번 | `lib/strava/sync.ts` |
| 아이템 배지: 동기화 지급·보류 고르기 | 열린 채 받을 때(잠긴 채 받으면 없음) | `lib/drop-engine/issueFollowUp.ts`(`recordIssuedRewards`) |
| 아이템 배지: 미션 보상 | 열린 채 받을 때, `point_awarded_at`으로 중복 방지 | `lib/missions/itemRewardFollowUp.ts` |
| 아이템 배지: **믹스 결과**(2회) | 열린 채 받을 때, `point_awarded_at`으로 중복 방지. 빈칸이 모자라 받지 않은 결과로 남으면 받을 때 | `lib/combine/resultPointFollowUp.ts` |
| 아이템 배지: 잠긴 채 받은 개체 | 열 때 일련번호마다 한 번, `point_awarded_at`으로 중복 방지 | DB `locked_item_open`(마이그레이션 235) |
| 컬렉션 보상 배지(`item_books.reward_badge_id`, 등급 보상 배지 포함) | `user_activity_badges`에 **새로 넣을 때만**. 이미 보유·23505는 지급 없음, 보정분도 새로 넣을 때는 준다 | `lib/itembook/checker.ts`(`issueItemBookRewardBadges`, 동기화 보정과 장착 직후 발급이 함께 쓴다) |
| 미션 보상 배지 | 미션 완료 때 | `lib/missions/rewards.ts` |
| 퀘스트 완료 배지(「JAM!」) | «연출 끝 또는 건너뜀 AND 실제 3단계 완료»가 된 뒤 한 번, 건너뛰지 않은 유저에게만 | `lib/onboarding-quest/completion.ts` |

포인트가 0인 배지는 지급을 부르지 않는다. 믹스의 레시피 보상(`combine_recipe_reward`)과 실패 보상(`combine_fail_reward`), 컬렉션 완성 포인트(`item_book_completion_point_reward`), 미션 포인트(`mission_point_reward`)는 이 표의 배지 포인트가 아니다. 공개 전 레시피의 운영자 시험 믹스도 개체를 실제로 주므로 같은 후속이 배지 포인트를 준다(시험 믹스의 레시피 보상 포인트 지급 변경은 이번 범위가 아니다).

#### badge_point_policy (싱글톤) — 마이그레이션 288, 티켓 20261022_1135
배지 포인트의 **일괄 값**을 담는 한 행 싱글톤(`id = 1` 고정, `CHECK (id = 1)`). `inventory_policy`와 같은 패턴으로 RLS만 켜고 정책은 없으며 anon·authenticated 권한을 회수해 service_role만 읽고 쓴다. 갱신 트리거가 없어 저장 API가 `updated_at`을 직접 올린다.
이 값은 **새 배지의 기본값**이다. 이미 있는 배지의 `badges.point_reward`는 바꾸지 않고, 이미 받은 포인트도 그대로다(지급 코드는 배지를 받을 때 `badges.point_reward`를 읽는다). 기존 배지에 일괄 값을 적용하는 일은 별도 SQL(티켓 20261022_1135 2회)이 맡는다.

| 칸 | 기본값 | 뜻 |
|---|---|---|
| `common_points` / `rare_points` / `epic_points` / `mystic_points` | 10 / 20 / 50 / 100 | 등급별 배지 포인트. 0 이상 정수, INTEGER NOT NULL |
| `leveled_points` | 10 | 레벨형 액티비티 배지의 레벨마다 포인트. 0 이상 정수 |
| `updated_at` | `now()` | 마지막 저장 시각. 화면이 이 값으로 동시 수정을 가른다(409) |

숨김 배지는 마이그레이션 243의 `badges_hidden_no_points` 제약으로 항상 0이라 칸이 없다. 읽는 곳은 둘이다: 어드민 배지 양식의 새 배지 포인트 칸 초깃값(서버 페이지가 읽어 prop으로 내린다)과, 배지 생성 API(`POST /api/admin/badges`)가 `point_reward`를 생략했을 때 채우는 값이다.
코드는 `src/lib/badge/pointPolicy.ts`의 `getBadgePointPolicy`로 읽고, 표나 행이 없거나 값이 비정상이면 칸 단위로 기본값(`DEFAULT_BADGE_POINT_POLICY`)으로 대체하고 로그를 남긴다. 기본값을 바꾸면 마이그레이션 DEFAULT와 이 상수를 같은 티켓에서 함께 바꾼다(시험이 288 파일의 DEFAULT 리터럴과 대조한다).
기본값 계산은 순수 함수 `src/lib/admin/badge-point-defaults.ts`의 `defaultPointFor`다: 숨김이면 0, 레벨형이면 `leveled_points`, 아니면 등급 값. 편집 화면은 어드민 «밸런스 설정»의 «배지와 포인트» 구역이다(`/admin/balance#badgepoints`, [ADMIN_PRD.md](admin-ui/ADMIN_PRD.md) §5-9). 변경 이력은 `balance_setting_changes`에 남는다(구역 키 `badgepoints`).

### 9-2. 잼 (JAM 2.0) — 마이그레이션 220, 티켓 20261016_2338
포인트 원장 구조를 본떴다. 운영 로직 4.2절 "원장과 기록"이 근거다. 2026-10-17 공용 DB에 적용했다.

#### jam_wallets
유저당 1개(첫 지급·차감 때 생성). `balance`=지금 가진 양(`CHECK >= 0`), `total_earned`=활동 정산으로 모은 총량. 본인만 SELECT, 쓰기 정책 없음.

#### jam_daily_earned
`(user_id, earned_on)` 복합 PK. `earned_on`은 활동한 날(KST, 호출부가 `p_earned_on`으로 넘기고 비우면 정산 시각의 KST 날짜), `amount`는 그날 모은 양. 활동 정산 때만 늘어나며 이번 주·이번 달 등 기간별 모은 양은 합산해 읽는다. 본인만 SELECT.

#### jam_transactions
append-only 원장. `amount`는 늘어난 양 +, 쓴 양 -, 0 불가. `reason` 5개:
`activity_settlement`(+) / `capsule_fill`(-) / `locked_item_badge_fill`(-) / `admin_grant`(+) / `admin_deduct`(-). 사유별 부호와 필수 칸은 CHECK로 건다.
마이그레이션 300이 CHECK에 사유 `capsule_forfeit`(-, `source_activity_id` NULL)을 더했고, 쓰는 곳은 `capsule_auto_fill`(마이그레이션 302)이다. 보류가 2개일 때 지갑 잔액 전액이 사라지는 줄이다(아래 9-4 «자동 채움 구조»). 300이 함께 더한 사유 `service_activity`(+, `source_event_key` 필수, `source_activity_id` NULL)는 마이그레이션 303의 `jam_apply_service_activity`가 쓴다(아래 «서비스 활동 잼»). 300이 함께 더한 `locked_unlock_cost`는 `jam_transactions`가 아니라 `point_transactions`의 사유다(300의 10항, 잠긴 열기 포인트 차감).
`source_activity_id`는 `strava_activities.id` 값을 담지만 FK는 없다(활동이 지워져도 원장은 남아야 함). `reason='activity_settlement'`인 줄에 한해 부분 유일 인덱스가 걸려 같은 활동은 한 번만 정산된다. 운영자 지급·회수는 `admin_user_id`(FK 없음)·`admin_reason_label`(필수)·`admin_reason_note`(선택)를 담는다. 유저 삭제 시 함께 삭제(`ON DELETE CASCADE`).

> 가진 양 변경은 `jam_apply(p_user_id, p_amount, p_reason, p_source_activity_id, p_admin_user_id, p_admin_reason_label, p_admin_reason_note, p_earned_on)` RPC(SECURITY DEFINER, service_role 전용)로만 원자 처리한다(예외는 `capsule_forfeit` 하나다: `jam_apply`가 사유 5개만 알아서 `capsule_auto_fill`이 지갑 행 잠금 → 원장 한 줄 → 잔액 차감을 직접 쓴다. 이후 `jam_apply`가 바뀌면 이 경로가 빠질 수 있다). 가진 양을 넘는 차감과 사유별 허용 부호 위반은 거절하고, 이미 정산된 활동의 재정산은 오류 없이 기존 원장 줄을 돌려준다.
> 「모은 양」(`total_earned`, `jam_daily_earned`)은 활동 정산만 늘린다. 운영자 지급·회수, 채움, 소멸(`capsule_forfeit`), 서비스 활동 잼(`service_activity`)은 가진 양만 바꾼다(운영 로직 4.5절). 두 표는 그대로 두고, 잼 조건 지표를 읽는 쪽이 `jam_service_daily`를 더해 합산한다(티켓 20261028_1736, 소멸한 잼은 세지 않는다).

#### 서비스 활동 잼 — 마이그레이션 300·303, 티켓 20261028_1735 (운영 로직 4.2·4.4·4.5절)
규칙(무엇이 얼마를 주는지, 상한, 즉시 채움)은 운영 로직 4.2절이 원천이고 값은 4.4절이다. 이 문서는 DB와 앱 쪽 사실만 둔다.
- `service_jam_rules`(300): `kind`(PK, CHECK 7종 `locked_unlock`·`badge_earned`·`combine_success`·`mission_complete`·`collection_complete`·`drop`·`pickup`), `amount`(INTEGER, 0 이상, 0이면 주지 않음), `updated_at`. RLS만 켜고 정책은 없어 service_role만 읽고 쓴다. 캡슐 가득 참은 종류에 없다. 편집 화면은 «밸런스 설정»의 «서비스 활동 잼» 구역이다(`/admin/balance#servicejam`).
- `jam_policy.service_jam_daily_cap`·`service_jam_weekly_cap`(300): 하루(KST)·주간(월~일, KST) 상한. INTEGER, 0 이상. **0은 «상한 없음»이 아니라 지급 0**이다(함수가 `LEAST(규칙값, 하루 남은 양, 주간 남은 양)`을 쓰고 남은 양이 0 이하면 아무것도 쓰지 않는다). 칸 이름 그대로 같은 구역에서 편집한다.
- `jam_service_daily`(300): `(user_id, kst_date)` PK, `amount`(0 이상). 서비스 활동으로 받은 잼의 날짜별 합이고 하루·주간 상한 판정에 쓴다. 주간 합은 그 주 월요일부터 오늘까지의 행을 더한다. service_role 전용.
- `jam_transactions.source_event_key`(300): 사유 `service_activity`일 때 필수이고 `(user_id, source_event_key)`에 부분 유일 인덱스(`jam_transactions_service_event_uniq`)가 걸려 같은 키는 한 유저에 한 번만 적립된다.
- 함수 `jam_apply_service_activity(p_user_id, p_kind, p_event_key) → jsonb`(303, SECURITY DEFINER, service_role만 실행). 옛 `jam_apply`는 사유를 5개로 하드코딩하고 `source_event_key` 인자가 없어 쓸 수 없으므로 시그니처를 바꾸지 않고 새 함수를 더했다.
  순서: 이용 정지(`user_suspended`) → 입력 확인(`invalid_input`) → 지갑 행 생성·`FOR UPDATE` → 같은 키가 이미 있으면 `duplicate`와 기존 양 → 규칙값 0이면 `rule_zero` → 상한으로 지급량을 줄이고 0 이하면 `capped`(쓰는 것 없음) → 지급 시 원장 한 줄 + 지갑 증가 + `jam_service_daily` 가산.
  `total_earned`는 바꾸지 않고 캡슐도 채우지 않는다. 잠그는 행은 지갑 행 하나뿐이다.
  - 1회차 롤백 드라이런에서 확인한 것: 같은 이벤트 재전송, 드랍→줍기 60건 반복(값 5로 올린 상태)이 하루 상한에서 멈춤, 상한 부분 지급, 주간 경계(KST 월요일), 이용 정지 중 지급 없음, 원장 합 = 지갑 잔액. 같은 계정의 동시 호출은 실행으로 확인하지 못했다.
- 앱: `lib/jam/serviceActivity.ts`의 `awardServiceJam(supabase, { userId, kind, sourceId })`는 던지지 않는다. 이벤트 키는 `<서비스 kind>:<원천 id>`(원천 id는 점수 때 쓰던 id 그대로, 빈 id는 던진다)이고, 지급이 0보다 크고 재전송이 아닐 때만 `runSyncCapsuleAutoFill`로 곧바로 채운다. 실패는 `console.error`와 `engine_decision_log`(`engine='points'`, `event='service_jam_failed'`)에 남고 같은 원천 id로 다시 보낼 수 있다.
  챕터 점수 종류와의 대응(`ChapterScoreKind` → 서비스 kind): `locked_item_badge_open`→`locked_unlock`, `badge_receive`→`badge_earned`, `mix_success`→`combine_success`, `mission_complete`→`mission_complete`, `collection_complete_*` 4종→`collection_complete`, `drop`→`drop`, `pickup`→`pickup`. `jam_earned`·`capsule_open`은 대상이 아니다.
- 호출 지점은 아래 9-3의 «점수 호출 지점과 원천 id» 표의 열 곳과 같다(`jam-web/src/lib/chapter/__tests__/score-wiring.test.ts`가 소스 검색으로 고정한다).

#### jam_policy — 마이그레이션 226, 티켓 20261017_1423
잼 정산의 조정 값을 담는 한 행 싱글톤(`id = 1` 고정). `abusing_policy`·`inventory_policy`와 같은 패턴으로 RLS만 켜고 정책은 없어 service_role만 읽는다. 어드민 화면은 «밸런스 설정»(`/admin/balance`)이다: 강도·경보 여섯 칸은 «잼» 구역(7-1 1회), 동기화 칸과 `common_streak_threshold`·`locked_roll_probability` 열한 칸은 «동기화» 구역(7-1 2회, 캡슐 구역에는 «동기화와 같은 값이에요» 안내만 둔다), `locked_min_*` 네 칸은 «잠긴 아이템 배지» 구역(7-2 1회, 티켓 20261022_1133), `service_jam_daily_cap`·`service_jam_weekly_cap` 두 칸은 «서비스 활동 잼» 구역(티켓 20261028_1735 4회)이다. 같은 행을 쓰는 구역이 여럿이라 한 구역을 저장하면 이 행의 `updated_at`이 올라 다른 구역 화면의 수정 시각도 낡는다(편집하던 값은 화면이 지킨다). 동기화 구역의 열한 칸은 모두 확률 안내 페이지가 읽는 칸(`lib/probability/disclosure.ts`의 `JAM_COLUMNS`)이라 바꾸면 저장 전 확인창이 뜬다. 코드는 `src/lib/jam/policy.ts`의 `getJamPolicy`로만 읽으며, 조회 실패·비정상 값은 기본값(`DEFAULT_JAM_POLICY`)으로 대체하고 로그를 남긴다. 기본값을 바꾸면 이 상수도 같은 티켓에서 함께 바꾼다.

| 칸 | 기본값 | 뜻 |
|---|---|---|
| `intensity_light` / `intensity_normal` / `intensity_hard` | 1 / 2 / 3 | 강도 배율. 가벼움(걷기·전기자전거), 보통(등산·자전거), 격함(러닝·트레일러닝). 0 이상 정수 |
| `mass_earn_alert_multiplier` | 3 | 한 번의 동기화로 받은 잼이 지난 N주 주간 평균의 이 배수를 넘으면 경보 |
| `mass_earn_alert_weeks` | 4 | 경보 비교에 쓰는 지난 기간(주) |
| `mass_earn_alert_no_history_amount` | 1200 | 지난 기록이 없는 유저의 경보 기준 잼(보통 강도 10시간) |
| `sync_item_guaranteed` / `sync_item_guaranteed_hiking` | 1 / 2 | 동기화 활동마다 확정으로 주는 아이템 배지 개수(일반 / 등산). 0 이상 정수, **0이면 드랍 없음** (마이그레이션 227, 티켓 20261017_1424) |
| `sync_item_bonus_rolls` | 2 | 보너스 개수를 굴리는 횟수. 0 이상 정수 |
| `sync_item_bonus_jam_divisor` | 600 | 보너스 한 번마다 확률 = 그 활동의 잼 ÷ 이 값. 1 이상 정수 |
| `sync_item_bonus_max_probability` | 0.25 | 보너스 한 번마다 확률의 상한(0~1) |
| `sync_rarity_common` / `_rare` / `_epic` / `_mystic` | 84 / 13 / 2.5 / 0.5 | 동기화 등급 확률(퍼센트). 네 칸 합계는 100이고 DB 제약(`jam_policy_sync_rarity_sum_100`)이 지킨다 |
| `common_streak_threshold` | 10 | Common이 이 횟수만큼 연속이면 다음은 Rare 이상(`user_drop_state.common_streak`, 동기화와 캡슐 합산) |
| `locked_min_common` / `_rare` / `_epic` / `_mystic` | 30 / 60 / 120 / 240 | 잠긴 아이템 배지를 여는 데 필요한 양의 등급별 최소값. 배지에 값이 없을 때 이 값을 쓴다. 1 이상 정수 (마이그레이션 231, 티켓 20261018_0051, 운영 로직 7.4절). 편집 화면은 «밸런스 설정»의 «잠긴 아이템 배지» 구역이다(티켓 20261022_1133). 이미 잠긴 개체의 `unlock_required`는 배정 때 고정돼 바뀌지 않는다 |
| `service_jam_daily_cap` / `service_jam_weekly_cap` | 40 / 100 | 서비스 활동으로 받는 잼의 하루(KST)·주간(월~일, KST) 상한. 0 이상 정수, **0이면 지급 0**(마이그레이션 300, 위 «서비스 활동 잼») |
| `locked_roll_probability` | 0.25 | 동기화·캡슐에서 나온 아이템 배지가 잠긴 채 배정될 확률(0~1). 0이면 무작위로는 절대 잠기지 않고 1이면 늘 잠긴다 |

**아이템 발급 정책의 대체 규칙**(`getJamPolicy`): 위 10칸 가운데 하나라도 비정상이거나 등급 확률 합계가 100이 아니면(오차 0.001 미만은 허용) **10칸 전체**를 기본값으로 대체하고 로그를 한 번 남긴다. 한 칸만 바꾸면 합계가 어긋나기 때문이다. 강도·경보 칸과 잠김 칸 5개(`locked_*`)는 이 대체와 상관없이 칸 단위로 대체한다. 판정은 순수 함수 `src/lib/drop-engine/syncIssue.ts`(개수 `rollItemCount`, 등급 `rollRarity`, 후보 `pickItemBadge`, 후보 없는 등급을 한 등급씩 내리는 `pickWithRarityFallback`)이고 정책을 인자로 받는다. 동기화는 잼 정산 뒤 `src/lib/drop-engine/syncIssueRun.ts`의 `issueSyncItemBadges`로 이 값들을 읽어 발급한다(규칙은 `BADGE_ENGINE_UNIFIED.md` §3.0). 소속 트라이브(`users.tribe_id`)가 없으면 아이템 배지만 건너뛴다.

**잼 정산 규칙**(운영 로직 4.2~4.5절, 16.3절. 코드 `src/lib/jam/`, 호출 `src/lib/strava/sync.ts`):
- 계산: 잼 = 강도 배율 × 교통수단 구간을 뺀 움직인 시간(분, 내림). 하루 상한은 없다. 전기자전거(`EBikeRide`·`EMountainBikeRide`)는 `jam_activity_type`이 자전거 값이라 원본 종목(`strava_activities.source_meta.sportType`)으로 가벼움을 가린다. 종목 불일치로 걷기가 된 활동(`jam_activity_type='walking'`)은 가벼움이다. 걷기 30분 30, 러닝 30분 90, 자전거 30분 60, 전기자전거 30분 30.
- 대상: 인정 필터와 어뷰징 필터를 모두 통과한 활동만 정산한다. 첫 동기화는 그 가운데 가장 최근 1건이다. 활동을 `strava_activities`에 저장한 뒤 그 행의 `id`를 `p_source_activity_id`로 넘겨 `jam_apply(…, 'activity_settlement', …)`를 활동마다 부른다.
- 날짜: `p_earned_on`에는 활동한 날의 KST 날짜(활동 시작 시각을 KST로 바꾼 날짜)를 넘긴다. 늦게 동기화한 활동도 동기화한 날이 아니라 활동한 날로 `jam_daily_earned`에 잡힌다. `jam_apply`가 미래 날짜를 거절하므로 시계 어긋남으로 미래가 나오면 오늘(KST)로 맞춘다.
- 한 활동 한 번: `source_activity_id` 유일성으로 같은 활동을 다시 정산해도 원장은 한 줄이다. 동기화 뒤 Strava에서 활동을 고치거나 지워도 다시 계산하지 않는다. 정산이 실패한 활동을 다시 정산하는 보정 경로는 없다.
- 실패 격리: 정산 실패는 로그만 남기고 동기화를 막지 않는다. 동기화 응답(`POST /api/strava/sync`)에는 이번 동기화로 받은 잼 합계 `jamEarned`(없으면 0)만 더하고 활동별 잼은 돌려주지 않는다. 화면 표시는 `SyncButton`이 합계를 읽어 결과 화면에 한 줄로 보여 준다(티켓 20261025_2050). 최초 연동 직후 도착 화면(`StravaConnectReveal`)은 콜백이 리다이렉트라 응답 본문이 없어, `GET /api/badges/recent-earned`가 최근 10분 창의 `jam_transactions`(`reason = 'activity_settlement'`, 이 사유의 `amount`는 항상 양수) 합계를 `jamEarned`로 더해 돌려주고 같은 한 줄로 보여 준다(티켓 20261026_1029, 서술은 `01_PRD.md`의 잼 정산 행).
- 대량 수령 경보: 이번 동기화의 잼 합계가 지난 `mass_earn_alert_weeks`주(오늘 KST 포함 7×N일) `jam_daily_earned` 합계의 주간 평균 × `mass_earn_alert_multiplier`를 **넘으면**(같으면 아니다) `#jam-alert`에 중단 신호 글 형식으로 알린다. 지난 기록이 없으면 `mass_earn_alert_no_history_amount`를 넘을 때 알린다. 이번 동기화의 정산 행이 평균에 섞이지 않도록 기준선은 활동 저장·정산 전에 읽는다. 기준선을 읽지 못하면 경보를 건너뛴다. 발송 실패는 동기화 응답을 바꾸지 않는다. 자동 제재는 하지 않는다.
- 이 티켓이 하지 않는 것: 이용 정지 중 정산 차단(2-6), 챕터 점수 가산(묶음 5), 아이템 배지 개수에 잼 쓰기(2-4). 활동별 잼 값은 정산 단계 결과(`jamSettlements`)로만 남겨 2-4가 쓸 수 있게 한다.

#### item_issue_log — 마이그레이션 227, 티켓 20261017_1424
아이템 배지를 줄 때마다 한 줄 남기는 발급 기록(append-only, 운영 로직 6.6절). RLS만 켜고 정책이 없어 service_role만 읽고 쓴다. 동기화(`syncIssueRun.ts`)가 아이템 배지를 줄 때마다 한 줄을 쓴다(경로 `sync`). 기록 실패는 지급과 동기화를 막지 않는다. `rolled_rarity`는 마이그레이션 228이 더한 칸이다.

| 칸 | 뜻 |
|---|---|
| `user_id` | 받은 유저. 유저 삭제 시 함께 삭제(`ON DELETE CASCADE`) |
| `inventory_item_id` | 만들어진 개체(`inventory_items`). 개체가 지워져도 기록은 남도록 `ON DELETE SET NULL` |
| `route` | 경로(예: `sync`). 값의 목록은 코드가 정하고 CHECK 제약은 없다(캡슐·미션·믹스가 이어서 쓴다) |
| `source_activity_id` | 동기화 경로의 대상 활동(`strava_activities.id` 값, FK 없음) |
| `badge_id` / `rarity` | 준 배지와 등급. 배지가 지워지면 `badge_id`는 NULL |
| `rolled_rarity` | 처음 뽑힌 등급(마이그레이션 228, NULL 허용). 뽑힌 등급에 후보가 없어 한 등급씩 내려 준 경우 `rarity`와 달라지며, 운영이 컨텐츠 채움 상태를 보는 근거다 |
| `locked` | 잠긴 채 배정했는가. 동기화 발급이 개체를 지급할 때 정한 값(`assignLock`)과 같다(보류에서 받은 개체는 `resolve_sync_pending_items`가 보류의 값을 옮긴다). 티켓 20261018_0051 전의 기록은 모두 false |
| `serial_number` | 개체의 일련번호 |

인덱스: `(user_id, created_at DESC)`, 대상 활동(`source_activity_id`, NULL 제외).

#### inventory.slot_alert_stage — 마이그레이션 237, 티켓 20261018_0056

`inventory`에 새 칸 `slot_alert_stage`(SMALLINT NOT NULL DEFAULT 0, 값 0·3·1)를 덧붙였다. 남은 칸 알림의 마지막 단계다: 0은 남은 칸 4개 이상, 3은 2~3개, 1은 0~1개. 새 함수 `inventory_slot_alert_step(p_user_id)`(SECURITY DEFINER, service_role 전용)가 인벤토리 행을 잠그고 지금 남은 칸으로 단계를 정해 갱신하고, 단계가 나빠졌으면(0→3, 0→1, 3→1) `{ok, notify: true, stage, free}`를 돌려준다. 알림 행(`inventory_slots_low`)은 앱이 `createNotification`으로 만든다. 알림 종류 enum `notification_type`에 `inventory_slots_low`를 더했다. 옛 칸·옛 함수·옛 알림 종류는 바꾸지 않는다.

#### combine_pending_results — 마이그레이션 236, 티켓 20261018_0055
믹스 결과가 들어갈 인벤토리 빈칸이 모자랄 때 결과를 지급하지 않고 남겨 두는 «받지 않은 믹스 결과»(운영 로직 8.4·6.4절). 재료는 이미 소모됐다. `sync_pending_items`와 같은 모양으로 만들어 묶음 5에서 미션 보상·프로모션과 구조를 합칠 때 옮기기 쉽게 했다. RLS만 켜고 정책이 없어 service_role만 읽고 쓴다.

| 칸 | 뜻 |
|---|---|
| `user_id` | 주인. 유저 삭제 시 함께 삭제(`ON DELETE CASCADE`) |
| `recipe_id` | 결과를 낸 레시피(`ON DELETE SET NULL`) |
| `badge_id` | 받을 아이템 배지 |
| `locked`·`lock_reason`·`unlock_required` | 믹스 때 정한 잠김. 잠겼으면 까닭(`badge_locked`·`designated`)과 필요한 양이 있어야 한다. 받을 때 그대로 지급한다 |
| `status` | `pending`(받지 않음) 또는 `claimed`(받음) |
| `inventory_item_id` | 받아서 생긴 개체(받은 뒤에만) |
| `created_at`·`resolved_at` | 생긴 때, 받은 때(8.5절) |

함수: `combine_grant_results(p_user_id, p_recipe_id, p_badge_ids, p_locked)`는 결과 지급의 단일 경로다. 결과 개수 이상의 빈칸이 있으면 모두 기한 없이(`expires_at` NULL) 지급하고 `{status: 'granted', itemIds}`, 모자라면 일부만 주지 않고 전부 이 표에 남기며 `{status: 'pending', pendingCount, free, needed}`, 지급할 결과가 없으면 `{status: 'none'}`을 돌려준다. 삭제된 배지는 건너뛴다. `combine_claim_pending(p_user_id)`는 받지 않은 결과를 모두 받는다 — 모두 들어갈 빈칸이 있어야 하고(`insufficient_slots`, free·needed), 이용 정지 중이면 `user_suspended`, 받을 것이 없으면 `no_pending`이다. 인벤토리 행과 결과 행을 잠그고 `pending → claimed`로 바꾸므로 같은 결과를 두 번 지급하지 않는다. 앱은 두 함수를 한 번씩 부르기만 하고 빈칸을 나눠 세지 않는다(`lib/combine/index.ts`·`lib/combine/pending.ts`, API `GET·POST /api/combine/pending`). 받지 않은 결과가 있는 동안 새 믹스를 막는 것은 앱 코드의 몫이다(`/api/combine` 409 `pending_results_exist`). `/api/combine` 성공 응답에서 잠긴 채 지급된 결과(`resultBadges[].locked`)는 지급된 개체의 `inventory_items.unlock_required`를 읽어 선택 칸 `unlockRequired`로 싣는다(읽지 못하면 칸을 뺀다). **두 함수는 포인트를 주지 않는다.** 아이템 배지의 포인트는 열린 개체를 받을 때 한 번, 잠긴 개체는 열 때(`locked_item_open`) 준다. 앱이 새 개체를 준 뒤 `lib/combine/resultPointFollowUp.ts`의 `followUpCombineResultPoints`가 지급된 개체 id로 `inventory_items.locked`·`point_awarded_at`을 읽어 열린 개체에만 배지의 `point_reward`를 `badge_point_reward`로 주고 `point_awarded_at`을 적는다(믹스 성공은 `granted`일 때 `lib/combine/index.ts`가, 받지 않은 결과는 받을 때 `POST /api/combine/pending`이 부른다, 티켓 20261019_1314 2회). 응답의 `pointsAwarded`는 레시피 보상 포인트(`combine_recipe_reward`) 그대로이고 배지 포인트를 더하지 않는다.

#### sync_pending_items — 마이그레이션 229, 티켓 20261017_1425
동기화로 받을 아이템 배지 전체가 인벤토리 빈칸보다 많을 때 지급하지 않고 모두 담아 두는 보류 목록(운영 로직 6.4절). RLS만 켜고 정책이 없어 service_role만 읽고 쓴다. 동기화(`syncIssueRun.ts`)가 쓰고, 고르기(`resolve_sync_pending_items`)가 닫는다. 동기화 보류만 위한 작은 테이블이며 미션 보상·프로모션·믹스 결과의 «받지 않은 보상»은 그 기능을 만드는 묶음 3·5에서 같은 패턴으로 잇는다.

| 칸 | 뜻 |
|---|---|
| `user_id` | 보류의 주인. 유저 삭제 시 함께 삭제(`ON DELETE CASCADE`) |
| `source_activity_id` | 대상 활동(`strava_activities.id` 값, FK 없음) |
| `badge_id` / `rarity` / `rolled_rarity` | 받을 배지와 등급, 처음 뽑힌 등급(`item_issue_log`와 같은 뜻) |
| `locked` / `lock_reason` / `unlock_required` | 잠긴 채 배정했는가와 그 까닭, 여는 데 필요한 양(마이그레이션 231, 티켓 20261018_0051). 동기화 발급이 계획 단계에서 정한 값이고, 고르기로 받을 때 개체(`inventory_items`)로 그대로 옮긴다. 열린 보류는 `false`·NULL·NULL |
| `status` | `pending`(고르기 대기) · `claimed`(고르기로 받음) · `discarded`(고르지 않아 받지 못함, 다시 받을 수 없음). CHECK로 세 값만 허용 |
| `inventory_item_id` | 받았을 때 만들어진 개체(`inventory_items`). 개체가 지워지면 `ON DELETE SET NULL` |
| `created_at` / `resolved_at` | 보류가 생긴 때 / 받거나 고르지 않기로 닫힌 때(`pending`이면 NULL) |

인덱스: `(user_id, created_at)`, `status = 'pending'`인 행만.

**`resolve_sync_pending_items(p_user_id uuid, p_chosen_ids uuid[]) → jsonb`** (`SECURITY DEFINER`, `service_role`만 실행): 인벤토리 행을 잠그고 → 고른 개수가 `LEAST(빈칸, 보류 수)`와 정확히 같은지 확인하고 → 고른 것을 `grant_inventory_item_locked`로 지급하며 보류의 잠김을 개체로 옮기고(`claimed`, 마이그레이션 231 이후. 229는 `grant_inventory_item`을 직접 불렀다) → 나머지 보류를 `discarded`로 닫고 → 지급마다 `item_issue_log`에 한 줄(경로 `sync`, `locked`는 보류의 값)을 남긴다. 한 단계라도 실패하면 전체가 되돌려진다. 성공은 `{ok: true, granted, discarded, itemIds}`, 거절은 `{ok: false, error}`(`inventory_not_found`·`no_pending`·`invalid_selection`·`wrong_count`+`expected`)다. 앱은 `lib/strava/pending-items.ts`가 호출하고 `/api/strava/pending-items`가 세션 유저에게만 연다.

### 9-3. 챕터 (JAM 2.0) — 마이그레이션 221, 티켓 20261016_2339
운영 로직 12장 "챕터"가 근거다. 2026-10-17 공용 DB에 적용했다(221이 만든 표 6개 가운데 `chapter_names`는 챕터를 트라이브와 상관없이 숫자로만 표기하기로 한 2026-10-21 결정으로 마이그레이션 257에서 삭제해 5개가 남았다). 점수를 주는 연결은 «점수 호출 지점과 원천 id», 챕터 1 시작·오름 처리·소식·챕터 배지 판정은 «챕터 1 시작과 오름 처리»(티켓 20261019_1316)다. 연출·프로필 표시는 묶음 5(5-7).

#### chapter_definitions
`chapter_no`(1부터, PK)와 `required_score`(오르는 데 필요한 누적 점수). 초기값 10개: 챕터 1=0(퀘스트 완료), 2~10=1,000 / 2,300 / 3,800 / 5,700 / 8,500 / 11,500 / 15,000 / 19,000 / 23,000. 챕터는 행을 더해 늘린다. 로그인 유저 모두 SELECT(다음 챕터까지 게이지). 편집 화면은 어드민 «밸런스 설정»의 «챕터» 구역이다(`/admin/balance#chapter`, 티켓 20261022_1133, [ADMIN_PRD.md](admin-ui/ADMIN_PRD.md) §5-9). 챕터 2~10의 `required_score`만 칸 이름 `required:<챕터>`로 편집하고(앞 챕터보다 커야 하며 챕터 1은 0으로 고정), 저장하면 바뀐 행의 `updated_at`을 직접 올린다(갱신 트리거가 없다). 필요 점수를 낮추면 이미 점수가 넘은 유저는 바로 오르지 않고 다음에 점수가 쌓일 때 오른다(`chapter_add_score`만 챕터를 올린다). `user_chapters`·`chapter_ups`의 외래키가 이 표를 가리켜 유저가 있는 챕터는 지울 수 없으므로 줄이기는 만들지 않고, 행을 더하는 챕터 더하기는 후속 티켓 20261022_1718이다.

#### chapter_score_rules
`activity_kind`(PK), `points_per_unit`, `weekly_cap`(NULL=상한 없음), `over_cap_ratio`(기본 0.5). 활동 종류는 이 테이블의 행이라 새 종류는 행을 더하면 된다. 초기값: `jam_earned` 1점/단위(주 300점 상한, 초과분 절반), `capsule_open` 20, `locked_item_badge_open` 10, `badge_receive` 10, `collection_complete_common`/`rare`/`epic`/`mystic` 100/200/400/800, `mix_success` 20, `mission_complete` 50, `drop` 5, `pickup` 5. 클라이언트 정책이 없어 서버만 읽는다. 편집 화면은 «밸런스 설정»의 «챕터» 구역이다(티켓 20261022_1133). 활동 12종마다 `points_per_unit`·`weekly_cap`·`over_cap_ratio`를 칸 이름 `rule:<활동>:points|cap|ratio`로 편집한다. 화면의 주간 상한 0은 «상한 없음»이고 이 표에는 NULL로 쓴다(읽을 때 NULL은 0으로 보인다). 저장하면 바뀐 행의 `updated_at`을 직접 올린다(갱신 트리거가 없다).

#### user_chapters
유저당 1개(첫 점수·시작 때 생성). `chapter_no`(NULL=퀘스트 전), `total_score`, `capsule_full_count`(INTEGER NOT NULL DEFAULT 0, CHECK 0 이상 — 지금 챕터에서 캡슐이 100%에 닿은 횟수, 챕터가 오르면 0으로 돌아간다. 마이그레이션 300, 티켓 20261028_1732. 세는 곳은 `capsule_auto_fill`이고 캡슐이 100%에 처음 닿는 호출에서 센다. 마이그레이션 302 이전에는 `capsule_open_counted`가 열 때 셌다. 아래 9-4). 본인만 SELECT.

#### chapter_score_events
점수 기록(append-only). `activity_kind`, `source_id`(호출부가 정한 UUID, FK 없음), `occurred_on`(활동한 날 KST), `unit_amount`(호출된 양), `raw_score`(상한 적용 전), `counted_score`(실제로 센 점수). `UNIQUE (activity_kind, source_id)`로 같은 활동은 한 번만 센다. 본인만 SELECT.

#### chapter_ups
오른 기록. `(user_id, chapter_no)` 복합 PK, `reached_at`. 한 번에 여러 챕터를 넘으면 챕터마다 한 줄. 본인만 SELECT.

> 점수·챕터 변경은 전부 두 RPC(SECURITY DEFINER, service_role 전용)로만 처리한다.
> - `chapter_add_score(p_user_id, p_activity_kind, p_source_id, p_amount, p_occurred_on)`: 점수 계산(주 월~일은 활동한 날 기준, 상한 안은 그대로·넘는 부분은 `over_cap_ratio`, 소수점 내림) + 점수 기록 + 누적 점수 반영 + 챕터가 있으면 올릴 수 있는 만큼 상승. 같은 `(활동 종류, 원천)`은 오류 없이 이미 센 결과를 돌려주고, 미래 날짜는 거절한다. 반환: `score_added`, `current_chapter`, `reached_chapters`.
> - `chapter_start(p_user_id)`: 챕터가 비어 있으면 챕터 1로 만들고 쌓인 점수로 오를 챕터까지 한 번에 올린다. 이미 챕터가 있으면 아무것도 하지 않는다. 같은 모양을 돌려준다(`score_added`=0).
> - 챕터는 내려가지 않는다. 퀘스트 전 점수는 버리지 않고 쌓았다가 챕터 1 때 함께 계산한다(가정, SQL 실행 승인 전 재확인).
> - 점수 가산을 부를지 말지(챕터 배지·포인트 조건 배지 제외, 자기 드랍 줍기 제외, 이용 정지 중 차단)는 부르는 쪽 책임이다.

#### 점수 호출 지점과 원천 id (티켓 20261019_1315)
> **상태** (티켓 20261028_1735, 2026-10-29): 아래 표의 `jam_earned`·`capsule_open`은 앞서 멈췄고(티켓 20261028_1733), 나머지 열 곳 호출은 `awardChapterScore` 대신 `awardServiceJam`을 부른다(원천 id·호출 위치는 그대로, 운영 로직 12.2절 상태). `awardChapterScore`를 부르는 곳은 `lib/capsule/open.ts`의 옛(non-counted) 열기 분기 한 곳뿐이고 `/api/capsule/open` 라우트는 `counted: true`로 불러 그 분기를 쓰지 않는다. `chapter_add_score`·`chapter_score_rules`·`chapter_score_events`는 삭제 전(U11)이다. 표의 «연결됨»은 점수를 연결했을 때의 기록이다.

앱은 `src/lib/chapter/score.ts`의 `awardChapterScore(supabase, { userId, kind, sourceId, amount, occurredOn })` 하나로 `chapter_add_score`를 부른다. 활동 종류 12종은 `src/lib/chapter/kinds.ts`(221의 초기값과 같은지 시험이 고정), 점수 값은 코드에 두지 않고 `chapter_score_rules`가 갖는다.
- **던지지 않는다.** RPC 오류·계약 밖 응답·예외는 `console.error`와 `engine_decision_log`(`engine='points'`, `event='chapter_score_failed'`, 페이로드에 종류·원천 id·수량·날짜·오류)에 남기고 `{ ok: false }`를 돌려준다. 본 동작(정산·열기·드랍·픽업)과 응답은 점수 실패로 바뀌지 않는다. 같은 원천 id로 다시 보낼 수 있다(자동 보정은 티켓 20261020_1010).
- `p_occurred_on`은 값이 없으면 키째 생략한다(null을 보내지 않는다). 수량이 1 미만이면 부르지 않는다.
- 점수가 성공하고 `reachedChapters`가 비어 있지 않으면 오름 처리(`processChapterRise`, 소식·챕터 배지 판정)를 이어서 부른다. 오름 처리가 실패하거나 던져도 점수 결과는 바뀌지 않는다(티켓 20261019_1316, 아래 «챕터 1 시작과 오름 처리»).
- `service_role`만 실행하므로 service 클라이언트로 부른다. 동기화 안에서는 주입된 클라이언트를 그대로 넘긴다.
- `src/lib/chapter/source-id.ts`의 `deterministicSourceId(namespace, ...parts)`는 같은 입력에서 같은 UUID(SHA-256 앞 16바이트, 버전 8)를 만든다. 기록 표에 id가 없는 컬렉션 완성과 배지 받기가 쓴다(배지 받기는 2a·2b회, 컬렉션 완성은 3회에 연결).
- 호출 지점의 목록과 활동 종류별 한 모듈 규칙은 `src/lib/chapter/__tests__/score-wiring.test.ts`가 소스 검색으로 고정한다(점수 함수를 부르는 파일·횟수가 어긋나면 깨진다). 같은 시험이 221 규칙을 옮긴 가짜 DB 위에서 8종 활동의 중복 없음·키 충돌 없음·제외 규칙·모은 잼 주 경계·점수 실패 뒤 복구를 확인한다.

| 활동 종류 | 호출 지점 | 원천 id | 날짜 | 상태 |
|---|---|---|---|---|
| `jam_earned` | `lib/jam/settlement.ts` `settleActivities`(정산 항목을 쌓은 직후, 오래된 활동부터) | `strava_activities.id`(`JamSettlementItem.activityId`) | 활동한 날(KST, `earnedOn`) | 연결됨(1회). 수량은 원장에 기록된 양이라 재정산도 같은 키다. **호출을 지웠다**(티켓 20261028_1733 3회): 동기화의 정산은 더 이상 이 활동의 점수를 쌓지 않는다 |
| `capsule_open` | `lib/capsule/open.ts` `openCapsule`(`capsule_open` RPC 직후, 후속 처리 앞) | `capsule_opens.id`(`openId`) | 생략(오늘) | 연결됨(1회). **자동 채움이 부르는 `counted` 열기는 이 호출을 건너뛴다**(티켓 20261028_1733 2회, 아래 9-4). 챕터 횟수는 열기가 아니라 `capsule_auto_fill`이 100%에 닿을 때 센다(마이그레이션 302). `counted`를 켜지 않는 옛 열기 경로는 그대로 점수를 쌓는다 |
| `locked_item_badge_open` | `lib/inventory/lockedItemFill.ts` `openLockedItem`(`locked_item_open` RPC 직후) | 개체 id(`inventory_items.id`) | 생략 | 연결됨(1회) |
| `drop` | `app/api/drops/route.ts` POST(성공 뒤 `after()` 콜백) | `poi_drops.id`(`drop_id`) | 생략 | 연결됨(1회). 유저 드랍만(시스템 드랍은 앰비언트 배치라 이 라우트를 거치지 않는다) |
| `pickup` | `app/api/drops/[dropId]/pickup/route.ts`(성공 뒤 `after()` 콜백) | 경로의 `dropId` | 생략 | 연결됨(1회). `isSelfPickup`이면 세지 않고, 시스템 드랍과 잠긴 채 받은 픽업은 센다. 드랍과 픽업은 활동 종류가 달라 같은 드랍 id로도 키가 겹치지 않는다 |
| `badge_receive` | 새 발급 6곳(엔진 새 발급 `lib/badge-engine/index.ts`·`usageBadges.ts` `issueQualifyingBadges`·미션 보상 `lib/missions/rewards.ts`·컬렉션 보상 `lib/itembook/checker.ts`·온보딩 완료 `lib/onboarding-quest/completion.ts`·체크인 첫 획득 `lib/strava/sync.ts`) → 공용 함수 `lib/chapter/badgeReceive.ts` | (유저, 배지) 결정적 id. 반복형의 새 회차는 (유저, 배지, 활동 id) | 생략 | 새 발급 6곳은 연결됨(2a회). 반복형의 새 회차는 엔진의 `increment` 경로와 첫 발급 경로(같은 평가의 나머지 새 회차)에 연결됨(2b회, `awardBadgeReceiveOccurrenceScores`) |
| `collection_complete_<등급>` | 컬렉션 장착 라우트 `app/api/itembooks/[id]/slot/route.ts` POST(성공 뒤 `after()` 콜백)와 동기화 보정 `lib/itembook/checker.ts`(`completedIds`마다, 완성 기록 upsert 뒤) → 공용 `lib/chapter/collection.ts` | (유저, 컬렉션, 등급) 결정적 id. 등급형이 아닌 컬렉션은 등급 `common` | 생략 | 연결됨(3회). 아래 «컬렉션 완성·믹스 성공·미션 완료 점수» |
| `mix_success` | `lib/combine/index.ts` `recordCombineSuccess`(성공 기록 RPC 직후) → `lib/chapter/mix.ts` | `user_combine_success_logs.id`(`record_combine_success_with_id`가 돌려준 id) | 생략 | 연결됨(3회). 시험 믹스는 기록이 없어 세지 않고 빈손 성공은 센다 |
| `mission_complete` | `lib/missions/checker.ts`(`mission_complete` RPC가 `completed`를 돌려준 직후, 보상 지급 앞) | `user_mission_completions.id`(`completionId`) | 생략 | 연결됨(3회). `already_completed`·거절·계약 밖 응답은 세지 않는다 |

#### 배지 받기 점수의 규칙 (티켓 20261019_1315 2a회, 운영 로직 12.2절)
새 발급 6곳은 `user_activity_badges`에 **새 행을 실제로 넣은 뒤에만** `lib/chapter/badgeReceive.ts`의 `awardBadgeReceiveScore(supabase, { userId, badge: { id, type, is_hidden, condition_json }, origin: { triggeredBy, dryRun } })`를 부른다. 23505·이미 보유·dryRun은 점수 대상이 아니다. 제외 규칙은 이 함수 한 곳에 있고, 아래에 걸리면 `chapter_add_score`를 부르지 않는다(위에서부터 검사, 이용 정지 확인이 마지막 DB 조회).
- **발급 출처**: `origin.dryRun`이 true이거나 `origin.triggeredBy`가 `BADGE_RECEIVE_EXCLUDED_TRIGGERS`(`catalog_reevaluation`, `admin_simulate`, `admin_test`, `catalog_reevaluation:...` 접두 형태 포함)이면 뺀다. 카탈로그 재평가 배치(`reevaluateCatalog.ts`)가 기존 유저에게 수십 개씩 소급 발급하는 배지, 어드민 시뮬레이터와 시험 발급이 챕터를 올리지 않게 한다(사용자 결정 3). 재평가 모듈이 엔진을 가져와 순환이 생기므로 문자열을 이 파일에 두고 시험이 `CATALOG_REEVALUATION_TRIGGER`와 같은 값인지 고정한다.
- **배지 유형**: `activity`·`checkin`만 센다. 아이템 배지는 뺀다(12.2절 «배지 받기»는 액티비티·체크인만 말한다).
- **숨김**: `is_hidden === true`(243)면 뺀다. 체크인 배지는 DB 제약(`badges_hidden_activity_only`)상 숨김일 수 없어 체크인 첫 획득 지점은 `is_hidden`·`condition_json`을 읽지 않고 `{ id, type }`만 넘긴다.
- **제외 조건 키**: `condition_json`의 키가 `BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS` = `follower_count`·`following_count`·`chapter_reached`와 하나라도 겹치면 뺀다. 포인트를 가리키는 조건 키는 지금 0개(티켓 20261019_1314)라 집합에 없다 — 나중에 생기면 이 상수만 고친다(DB의 허용 키 CHECK와 `conditionRegistry.ts`도 함께). `jam_total_earned` 같은 잼 키는 포인트가 아니라 제외하지 않는다.
- **이용 정지**: `getActiveSuspension`으로 정지 중이면 뺀다. 동기화 입구에서 막히지 않는 경로, 곧 정지된 드랍 주인이 다른 유저가 줍는 순간 받는 배지(`picked_up_by_user_count` 등)를 위한 가드다. 확인 조회가 실패하면 «정지 아님»으로 보지 않고 점수를 세지 않은 채 `chapter_score_failed`로 남긴다(같은 원천 id로 다시 보낼 수 있다).
- **원천 id**: `deterministicSourceId('badge_receive', userId, badge.id)`. 같은 배지를 어드민 초기화·삭제 뒤 다시 받아도 같은 키라 한 번만 센다(사용자 결정 2). 레벨형은 레벨마다 배지 행이 달라 레벨마다 센다. 반복형의 «첫 획득»은 새 행이라 이 키로 센다. 반복형의 새 회차는 아래 소절의 키로 따로 센다.
- **체크인**: `record_checkin_earn`의 `is_first`일 때만 센다(다시 지나가기·같은 활동 재동기화(`duplicate`)는 세지 않음).
- 던지지 않는다. 점수 쪽 실패는 배지 발급·포인트·피드·응답을 바꾸지 않고 `chapter_score_failed`로 남는다. 아이템 배지 수령 점수와 드랍 점수 남용 방지는 이 티켓의 범위 밖이다.

#### 반복형의 새 회차 점수 (티켓 20261019_1315 2b회)
반복형은 새 회차마다 `badge_receive` 10점을 따로 센다(사용자 결정 2). 회차를 가리는 값은 `earn_history[].strava_activity_id`(Strava 활동 id, 양의 정수)이고, 원천 id는 `deterministicSourceId('badge_receive', userId, badge.id, String(활동 id))`다. 첫 획득의 `(badge_receive, 유저·배지)` 키와는 JSON 배열의 길이가 달라 겹치지 않는다. 구현은 `awardBadgeReceiveScore`의 선택 입력 `occurrenceActivityId`와 여러 회차를 한 번에 세는 `awardBadgeReceiveOccurrenceScores`(`lib/chapter/badgeReceive.ts`)다. 제외 규칙(발급 출처·유형·숨김·제외 조건 키·이용 정지)과 «던지지 않는다»는 첫 획득과 같다. 첫 회차가 제외 대상이면 나머지도 같은 이유라 부르지 않는다. 활동 id가 비었거나 올바르지 않은 회차는 세지 않고 `chapter_score_failed`로 남긴다.
- **이미 가진 반복형의 새 회차**(`lib/badge-engine/index.ts`의 `action === 'increment'` 경로): RPC `increment_activity_badge_earn`이 **늘어난 개수만** 돌려주고 어느 회차가 늘었는지는 알려주지 않는다. 그래서 `added > 0`일 때 RPC에 보낸 회차 전체(`newOccurrences`, 최근 200건)에 대해 부르고, 키가 멱등이라 이미 센 회차는 DB가 같은 결과를 돌려줘 이중 가산이 없다. `added === 0`이면 부르지 않는다. `dryRun` 분기는 점수를 부르지 않는다. 점수 실패는 카운터 증가·`counted` 기록·반환값을 바꾸지 않는다.
- **미보유 반복형의 첫 발급 경로**(`action === 'issue'`): 한 번의 평가에서 같은 반복형의 새 회차가 여러 건이면(첫 동기화 등) 첫 발급 행이 그 회차를 모두 `earn_count`·`earn_history`에 담는다. 첫 획득의 (유저, 배지) 키가 계기 활동(`triggerActivity`) 하나를 대신하므로, 이번 배치의 나머지 새 회차만 활동 id 키로 센다. 계기 활동은 두 번 세어지지 않는다. 이번 배치 밖에서 이미 쌓여 있던 과거 회차는 «새 회차»가 아니라 세지 않는다(예: 카탈로그에 새로 더한 반복형 배지, 사다리 배지의 임계값을 처음 넘는 평가에서 저장된 이력에만 있던 회차).
- **한계**: RPC가 거절한 과거 회차가 소급 가산될 수 있는 작은 틈이 있다. `added > 0`인 배치에 RPC가 «이미 `earn_history`에 있다»며 세지 않은 회차가 섞여 있으면(`earn_history` 상한 200 밖으로 밀렸다가 다시 들어온 회차 등) 그 회차가 처음 세어지는 것이면 소급 가산되고, 첫 획득 때 (유저, 배지) 키로 센 계기 활동이 다시 들어오면 한 번 더 세어진다. 동기화가 이미 처리한 활동 id를 걸러내므로(`getProcessedStravaIds`) 드문 틈이다. 어드민이 보유 기록을 초기화한 뒤 계기 활동이 달라져도 같은 식으로 한 번 더 세어질 수 있다. 늘어난 활동 id 목록을 돌려주는 새 DB 함수를 두면 정확해지나 이번에는 더하지 않았다.
- 회차 점수는 회차마다 `chapter_add_score` 호출이 한 번씩 나간다(5건씩 나눠 동시에 보낸다). 한 번에 회차가 많은 첫 동기화는 응답이 조금 늘 수 있다. 한 번의 평가에서 회차가 200건을 넘으면 오래된 회차는 `earn_count`에는 들어가지만 점수는 세지 않는다(점수는 `earn_history`에 심는 최근 200건에 맞춰 보낸다).

#### 컬렉션 완성·믹스 성공·미션 완료 점수 (티켓 20261019_1315 3회, 운영 로직 12.2절)
위 표의 마지막 세 줄이다. 셋 다 던지지 않고, 점수 쪽 실패는 본 동작의 결과를 바꾸지 않고 `chapter_score_failed`로만 남는다.

**컬렉션 완성** (`lib/chapter/collection.ts`)
- **원천 id**: 완성 기록 표(`user_item_book_completions`, `user_item_book_tier_completions`)에 id가 없어 `deterministicSourceId('collection_complete', userId, itemBookId, tier)`로 만든다. 활동 종류는 등급에 따라 `collection_complete_common|rare|epic|mystic`(`kinds.ts`의 변환). 등급이 네 값 밖이면 다른 등급으로 대신 세지 않고 점수 없이 기록한다.
- **등급형이 아닌 컬렉션(`tier_mode` 꺼짐, 공용 DB 100개 전부)은 `common`(100)으로 센다**(사용자 결정 4). 나중에 같은 컬렉션이 등급형이 되어 common 등급을 완성해도 (유저, 컬렉션, common)이 같은 키라 같은 완성이 두 번 세어지지 않는다. rare 이상은 새 완성이라 따로 센다.
- **«이번에 새로 완성했는가»**: 등급형은 장착 RPC `slot_item_into_book_tiered`가 돌려주는 `completed_tier`(그 등급을 처음 완성했을 때만 값이 있음)이다. 옛 컬렉션의 장착 RPC는 완성 여부를 돌려주지 않아서, 장착 **전에** `user_item_book_completions`에 기록이 있었는지 읽어 두고(`hasLegacyCollectionCompletion`) 장착 **후**에 기록이 생겼을 때만 센다. 이미 완성한 유저가 다시 장착해도 소급 가산하지 않는다(완성 기록은 장착을 풀어도 남는다). 장착 전·후 기록을 읽지 못하면 소급 가산을 피하려고 세지 않고 기록한다.
- **호출 지점 둘**: 장착 라우트의 응답 뒤 `after()` 콜백(`awardSlotCollectionScore`, 보상 배지 발급·JAM! 판정과 `allSettled`로 함께)과 동기화 보정(`checkItemBookCompletion`의 `completedIds`, 이미 «이번에 새로 완성한 옛 컬렉션»만 담는다. 등급형은 건너뛰고 등급 완성은 장착 RPC만 기록한다). 같은 완성을 두 지점이 모두 보내도 같은 키라 한 번만 센다.
- **이용 정지**: 컬렉션 장착(POST)은 이용 정지 중이면 RPC 전에 403 `user_suspended`(문구 `d.suspension.itemBookSlotBlocked`)이다. 장착 RPC(179·222)가 정지를 보지 않아 정지 중에도 완성 점수가 생길 수 있었기 때문이다(12.2절 전제). 정지 조회가 실패하면 500으로 장착시키지 않는다. 완성을 만들지 않는 해제(DELETE)·교체(PATCH)는 막지 않는다.

**믹스 성공** (`lib/chapter/mix.ts`)
- 성공 기록 RPC를 `record_combine_success_with_id`(마이그레이션 254, 위 `user_combine_success_logs`)로 바꿨다. 돌려받은 `{ id, is_recipe_first }`가 알려진 모양(`id`가 UUID 문자열, `is_recipe_first`가 boolean)일 때만 그 `id`를 원천 id로 센다. 모양이 어긋나거나 RPC가 오류·예외를 내면 점수를 세지 않고 `chapter_score_failed`(원천 id null)로 남긴다 — 그 믹스의 성공 행이 없거나 id를 알 수 없어 같은 원천 id로 다시 보낼 수도 없다.
- 시험 믹스(`testMix`, 운영자의 공개 전 레시피 믹스)는 성공 기록을 남기지 않는 경로라 이 함수를 부르지 않아 점수에서 빠진다. 빈손 성공(결과 배지가 비어도 성공)과 받지 않은 결과로 남은 성공은 성공 행이 있어 센다. 점수는 재료 소각·보상 지급·후속 처리(`followUpCombineResultPoints`) 뒤에 나가므로 그 결과를 바꾸지 않는다.

**미션 완료** (`lib/missions/checker.ts`)
- `mission_complete` RPC(249)가 `completed`와 `completion_id`를 돌려준 직후, `grantMissionRewards` **앞**에서 센다(보상 지급이 던져 `continue`해도 점수를 건너뛰지 않도록). `already_completed`·거절·계약 밖 응답은 완료 기록이 새로 생기지 않아 세지 않는다.

**한계와 알려진 틈**
- 점수 호출이 실패하면 그 일의 점수는 비어 있고(`chapter_score_failed` 기록만 남음) 같은 원천 id로 다시 보낼 수 있다. 자동 보정은 후속 티켓 `20261020_1010`이 다룬다.
- 같은 컬렉션을 두 요청이 동시에 장착하면 둘 다 «새로 완성»으로 읽을 수 있으나 같은 키라 한 번만 센다.
- 드랍 5점에는 상한이 없어 «드랍 → 자기 줍기(0점) → 다시 드랍»을 반복하면 점수가 계속 쌓일 수 있다. 점수 설계의 문제라 이 연결의 범위 밖이다(밸런스 설정 묶음 7과 운영 로직 12.2절 재검토).

#### 챕터 1 시작과 오름 처리 (티켓 20261019_1316 1회, 운영 로직 12.1~12.3절)
이 소절은 1회(챕터 1 시작·오름 처리·소식·챕터 배지 즉시 판정)다. 읽기 함수(내 챕터·이름·다음 챕터까지 비율, 다른 유저용)와 이름 조회는 아래 «챕터 읽기»(2회)다. 챕터 전체의 기능 정의는 [챕터 PRD](chapter/PRD.md)다.

**챕터 1 시작** (`src/lib/chapter/start.ts`)
- 호출 지점은 `lib/onboarding-quest/completion.ts`의 `recordOnboardingQuestCompletion` 한 곳이다. 호출처는 5곳이고 시그니처는 그대로이며 모두 service 클라이언트를 넘긴다: `lib/strava/sync.ts`의 `syncStravaActivities`, `app/api/onboarding-quest/step/route.ts`, `skip/route.ts`, 그리고 **캡슐 열기(`lib/capsule/open.ts`)와 잠긴 개체 열기(`lib/inventory/lockedItemFill.ts`)가 확정된 직후**(챕터 점수를 센 다음, 티켓 20261021_1248)다. 동기화는 처리한 인정 활동이 1건 이상일 때만 부르고, 그 호출은 동기화 끝 판정(`processFetchedActivities` 안) **뒤**에 일어난다. 열기 쪽 호출은 던지지 않고 열기 결과·응답을 바꾸지 않는다.
- **챕터 1 시작 시점은 실제 3단계가 끝난 순간이다**(티켓 20261021_1248, 운영 로직 2.2절). `lib/onboarding-quest/real-steps.ts`의 `readRealSteps`가 ① `strava_activities`(걸러지지 않은 활동, `filter_reason IS NULL`) ② `capsule_opens`(그 유저의 열기 기록) ③ `inventory_item_events`(`event_type='unlocked'`이고 `user_id`가 그 유저)에 각각 행이 1건 이상 있는지 읽고, 모두 있으면(`isRealStepsDone`) `ensureChapterStarted`가 `chapter_start(p_user_id)`를 부른다. 연출 7단계가 끝났는지·건너뛰었는지와 무관하다. 하나라도 읽지 못하면 던져서 «마쳤다»로 보지 않고 시작하지 않는다.
- 완료 기록(`completed_at`)은 «연출 7단계를 마쳤거나 건너뜀» **그리고** «실제 3단계 완료»가 둘 다 된 뒤 조건부 갱신으로 한 번 남긴다. 보상(완료 배지 「JAM!」과 포인트 100)은 그 갱신이 행을 바꾼 호출에서 건너뛰지 않은 유저에게만 나간다. 연출 전에 실제 3단계를 마치면 챕터 1은 바로 받고 보상은 연출을 마친 뒤에 나가며, 건너뛴 유저는 챕터 1만 받는다. 동시 호출에 져서 바뀐 행이 없으면 보상은 이긴 호출이 지급한다(챕터 시작은 멱등이라 둘 다 지나도 된다).
- 응답 `{score_added, current_chapter, reached_chapters}`는 `chapter_add_score`와 같은 계약 검사(`toScoreRow`)로 읽는다. 시작한 뒤에도 챕터가 비어 있는 응답은 계약 밖이다. `reached_chapters`는 챕터 1과, 퀘스트 전에 쌓인 점수로 한 번에 오른 챕터를 모두 담고, 비어 있지 않으면 오름 처리로 넘긴다.
- **재시도 경로** (사용자 결정 4): `chapter_start`가 실패하면 다음 호출이 다시 시도한다. 완료 기록이 없는 유저는 실제 3단계가 끝난 호출마다, 완료 기록이 있는 유저는 들어올 때마다(보상 재시도 분기와 완료 있음 분기 포함) `ensureChapterStarted`가 `user_chapters.chapter_no`를 읽어 **비어 있을 때(행 없음·NULL)만** `chapter_start`를 다시 부른다. 챕터가 있으면 RPC를 부르지 않는다(조회 한 번만 늘어난다). 완료 기록이 있는 유저는 실제 단계를 다시 읽지 않는다. 옛 퀘스트를 마친 유저도 다음 호출에서 챕터 1을 받는다.
- 부르지 않는 경우: 퀘스트 행 없음, 실제 3단계가 하나라도 남음(연출을 다 마쳤어도), 실제 단계를 읽지 못함, `ONBOARDING_QUEST_ENABLED`가 꺼짐. 연출 도중이라도 실제 3단계가 끝났으면 부른다.
- 던지지 않는다. RPC 오류·예외·계약 밖 응답·챕터 조회 실패는 `console.error`와 `engine_decision_log`(`engine='points'`, `event='chapter_start_failed'`)에 남기고, 반환값(지급한 완료 배지 id)과 기존 분기 동작은 그대로다.

**오름 처리** (`src/lib/chapter/rise.ts` `processChapterRise({ userId, reachedChapters }, { skipBadgeEvaluation })`)
- 부르는 곳: `awardChapterScore`(점수가 성공하고 `reachedChapters`가 비어 있지 않을 때)와 `startChapter`(챕터 1 포함). 비어 있으면 아무것도 하지 않는다.
- **소식**: 오른 챕터 가운데 가장 높은 챕터로 `chapter_up` 한 건만 보낸다(여러 챕터를 한 번에 넘어도 한 건). **챕터 1만 오른 경우(챕터 1 시작)도 보낸다**(티켓 20261021_1248 — 챕터 1은 실제 3단계를 마친 순간 시작해 완료 보상과 시점이 갈라지고 건너뛴 유저는 보상이 없다). 새 알림 종류나 마이그레이션은 필요 없다(`chapter_up`은 마이그레이션 255에 이미 있다). 묶음 키 `chapter_up:{챕터}` + `once`라 같은 (유저, 챕터) 소식은 다시 만들어지지 않는다(`once`는 이미 있으면 기존 행을 돌려준다).
- **피드**(티켓 20261021_1249 5회): 가장 높은 챕터가 2 이상일 때만 `recordFeedEvent(userId, 'chapter_up', { chapter_no })` 한 건을 기록한다(챕터 1 시작은 제외). 활동 id를 넘기지 않는다. 오른 챕터 목록이 이번 호출로 `chapter_ups`에 새로 들어간 챕터만 담으므로 목록이 비어 있지 않을 때만 기록하는 것이 «새로 오른 경우에만»이다. 소식·판정과 서로 막지 않는다.
- **챕터 배지 판정**: 오름이 있으면(챕터 1 시작 포함) `runJamActionEvaluation(userId, ['chapter_reached'])`로 챕터 조건 배지를 바로 판정해 받게 한다. 챕터 도달값은 지금 챕터 하나라서 넘은 챕터가 여럿이어도 한 번의 판정으로 `chapter_reached >= N` 배지를 모두 받는다. 배지 소식은 기존 방식(`activity_recap` 결산)이다.
- 판정이 실패해도 소식은 보내고, 소식이 실패해도 판정은 한다. 던지지 않고, 실패는 `console.error`와 `engine_decision_log`(`event='chapter_rise_failed'`, 페이로드 `step`=`notification`·`feed`·`badge_evaluation`·`unexpected`)에 남긴다. `runJamActionEvaluation`은 자기 안의 실패를 스스로 삼키고 `console.error`만 남기므로 `badge_evaluation`은 그 함수를 불러오거나 부르다 던진 경우에만 기록된다.
- **이중 판정 규칙**: 동기화 끝 판정(`JAM_SYNC_TRIGGERS`의 `chapter_reached`)은 DB의 지금 챕터를 읽는다. 동기화가 **직접** 부르는 점수(잼 정산 `settleActivities`, 뒤에 동기화 끝 판정이 반드시 이어짐)만 `skipRiseBadgeEvaluation`을 켜서 오름의 소식은 보내고 챕터 배지 판정은 건너뛴다. 나머지 호출(라우트, 동기화 안의 배지 받기·미션 점수, 동기화 뒤의 챕터 1 시작)은 바로 판정한다. 켜지 않은 호출이 동기화 안에서 겹쳐도 발급은 `user_activity_badges`의 `UNIQUE(user_id, badge_id)`로 한 번뿐이다(`issueQualifyingBadges`가 이미 가진 배지를 건너뛰고 동시 호출의 23505는 부수효과 없이 넘김). 겹치면 판정이 한 번 더 돌고 결과 카드 대신 결산 소식으로 먼저 알려질 뿐이다.
- **순환 import**: `score.ts → rise.ts → jamActionRoute → strava/sync.ts → jam/settlement.ts → score.ts`가 정적으로 이어지면 순환이 되므로, `rise.ts`가 `jamActionRoute`를 호출 시점에 `await import()`로 불러 모듈 평가 시점의 순환을 없앴다(`rise-import-cycle.test.ts`가 두 불러오기 순서를 고정).
- 챕터 배지가 다시 챕터 점수를 올리지 않는다: `chapter_reached` 조건 배지는 «배지 받기» 점수에서 뺀다(위 «배지 받기 점수의 규칙», `rise.test.ts`가 확인).
- 점수 함수와 챕터 1 시작은 오름 처리가 끝나기를 기다린 뒤 돌려준다. 오름이 있는 요청에서만 소식·판정 시간이 더해진다.

#### 챕터 읽기 (티켓 20261019_1316 2회, 운영 로직 12.3절)
프로필(5-7)이 쓸 서버 읽기 함수다. 이 소절은 **무엇을 어느 표에서 읽는가**만 적는다. 응답 모양과 동작(점수 숫자 비노출, 챕터 없음과 읽지 못함의 구분)은 [챕터 PRD](chapter/PRD.md) 5절이고, 챕터를 숫자로만 표기하는 정책은 6절이다. DB 변경은 없다.

| 함수 (`src/lib/chapter/`) | 읽는 표와 열 |
|---|---|
| `getMyChapter` (`read.ts`) | `user_chapters`(이 유저 한 행의 `chapter_no`, `total_score`), 챕터가 있을 때만 `chapter_definitions`(전체, `chapter_no`·`required_score`). 트라이브는 읽지 않는다 |
| `getPublicChapter` (`read.ts`) | `user_chapters`(`chapter_no`만), `users`(`tribe:tribes(id, name)`). `total_score`와 `chapter_definitions`는 읽지 않는다 |

- `total_score`와 `required_score`는 비율 계산(`progress.ts`)에만 쓰이고 응답에 실리지 않는다.
- `user_chapters`는 본인 행만 읽는 정책이라 읽기 함수는 service 클라이언트를 받는다. `chapter_definitions`는 로그인 유저 모두 읽을 수 있다.
- 트라이브는 `users.tribe_id`가 가리키는 지금 트라이브이고 `getPublicChapter`만 읽는다. 챕터 이름은 두지 않는다(2026-10-21 결정).


### 9-4. 캡슐 (JAM 2.0) — 마이그레이션 232·233, 티켓 20261018_0052
운영 로직 5.2·5.4절이 근거다. 2026-10-18 공용 DB에 적용했다(232: 저장·설정·채우기, 233: 열기). 전부 덧붙이기이고 옛 객체의 뜻은 바꾸지 않았다. 새 표는 모두 RLS만 켜고 정책이 없어 service_role만 읽고 쓴다.
동기화가 캡슐을 저절로 채우고 여는 구조(티켓 20261028_1733, 상위 20261028_1730)는 마이그레이션 300·301이 덧붙였다. 아래 «자동 채움 구조» 소절에 모았다. 인벤토리가 차면 보상을 보류하고 둘째부터 잼이 사라지는 구조(티켓 20261028_1734)는 마이그레이션 302가 덧붙였고, «자동 채움 구조»와 «capsule_pending_rewards»·«jam_forfeit_weekly» 소절에 모았다. 232·233·234의 옛 객체와 옛 열은 그대로이고, 프로덕션 main이 옛 함수를 쓰기 때문에 지우지 않았다(정리는 U11).

#### capsule_policy
한 행 싱글톤(`id = 1`). 칸과 기본값: `guaranteed_count` 1, `bonus_count` 1, `bonus_probability` 0.2, `other_tribe_probability` 0.2, `rarity_common`/`_rare`/`_epic`/`_mystic` 70/22/6/2(합계 100, DB 제약 `capsule_policy_rarity_sum_100`), `pity_epic_threshold` 15(보정 1), `pre_quest_fill_amount` 5, `pre_quest_unlock_required` 5(퀘스트 전 첫 캡슐에서 반드시 나오는 잠긴 아이템 배지를 여는 데 필요한 양). Common 연속 보정(10번)과 잠길 확률은 동기화와 합산하는 값이라 `jam_policy`의 것을 그대로 쓴다. 코드는 `src/lib/capsule/policy.ts`의 `getCapsulePolicy`로 읽고, 조회 실패·비정상 칸은 기본값(`DEFAULT_CAPSULE_POLICY`)으로 대체하고 로그를 남긴다(등급 확률 네 칸은 묶음 단위). 기본값을 바꾸면 이 상수도 같은 티켓에서 함께 바꾼다. 편집 화면은 어드민 «밸런스 설정»의 «캡슐» 구역이다(`/admin/balance`, 티켓 20261022_1132 2회, [ADMIN_PRD.md](admin-ui/ADMIN_PRD.md) §5-9). 열한 칸 모두 그 구역에서 편집하고 저장하면 `updated_at`을 직접 올린다(갱신 트리거가 없다). 이 가운데 확률 안내 페이지가 읽는 칸(`pre_quest_*` 두 칸 제외 아홉 칸, `lib/probability/disclosure.ts`의 `CAPSULE_COLUMNS`)을 바꾸면 저장 전 확인창이 뜬다.

#### capsule_chapter_costs
`chapter_no`(PK)와 챕터별 숫자 세 가지, `updated_at`.

| 열 | 내용 | 초기값 챕터 1~10 | 읽는 곳 |
|---|---|---|---|
| `fill_amount` | 옛 채울 양 | 90 / 100 / 110 / 120 / 135 / 150 / 165 / 180 / 200 / 220 | 옛 `capsule_get_or_create`(마이그레이션 234 이후는 `capsule_next_required`)가 캡슐이 생길 때 읽어 필요량을 고정한다. 옛 «채우기»·«열기» 경로가 쓴다 |
| `fill_amount_v2` | 자동 채움의 채울 양. INTEGER, NULL 허용, CHECK 1 이상(마이그레이션 300) | 145 / 160 / 180 / 200 / 220 / 245 / 270 / 300 / 330 / 365 | 새 함수 `capsule_next_required_v2`·`capsule_auto_fill`·`capsule_open_counted`·`capsule_hold_reward` |
| `advance_count` | 이 챕터에서 캡슐이 100%에 닿은 횟수가 이만큼이 되면 다음 챕터로 오른다. INTEGER, NULL 허용, CHECK 1 이상(마이그레이션 300) | 6 / 7 / 7 / 8 / 9 / 9 / 10 / 11 / 12 / NULL (챕터 10은 NULL) | `capsule_auto_fill`(302부터. 301까지는 `capsule_open_counted`) |

- 챕터가 표의 마지막보다 높으면 마지막 행의 양을 쓴다(`fill_amount_v2`는 값이 있는 마지막 행).
- 앱은 이 표를 직접 읽지 않는다. 읽는 쪽은 위 DB 함수와 어드민 «밸런스 설정» 화면뿐이다.
- 편집 화면은 어드민 «밸런스 설정»의 «캡슐» 구역이다(티켓 20261022_1132 2회, 20261028_1733 4회): **값만 바꾸고 챕터 번호를 늘리거나 줄이지 않으며**(챕터 더하기는 7-2), 행마다 `updated_at`이 따로 있어 저장은 바뀐 행만 «읽은 수정 시각이 같을 때» 갱신한다. 한 챕터의 여러 칸을 함께 바꾸면 그 행 갱신 한 번으로 쓴다. 화면은 챕터 1~10만 다룬다.
- 변경 이력의 칸 이름: `chapter:3`(`fill_amount`), `fill_v2:3`(`fill_amount_v2`), `advance:3`(`advance_count`). `advance:N`은 챕터 1~9만 있다. 챕터 10의 `advance_count`는 NULL이 정상이라 화면이 읽지도 쓰지도 않는다.
- 화면이 읽을 때 `fill_amount`·`fill_amount_v2` 값이 숫자가 아니거나, 챕터 1~9의 `advance_count`가 숫자가 아니면 기본값으로 바꿔 보이지 않고 구역 전체가 읽기 오류가 된다.

#### user_capsules
유저당 한 행(`user_id` PK). `required`(필요량, 캡슐이 생길 때 정해 고정), `filled`(채운 양, 0~`required`), `chapter_no`(만들 때의 챕터, NULL이면 퀘스트 전), `alert_stage`(SMALLINT NOT NULL DEFAULT 0, CHECK 0·70·80·90 — 지금 캡슐에서 마지막으로 알린 채움 단계. 보류가 하나일 때 채움이 단계에 처음 닿으면 `capsule_auto_fill`이 올리고, 캡슐이 열리거나 보류로 옮겨지면 0으로 돌린다. 마이그레이션 302), `created_at`, `updated_at`. 처음 필요할 때 만든다(지연 생성).

#### capsule_opens
열 때마다 한 줄(append-only): `opened_at`, `chapter_no`, `required`, `filled`, `items`(나온 개체 목록 JSONB). 캡슐 연 횟수는 이 표로 센다. `capsule_open`이 열 때마다 한 줄 쓰고, 보류를 받는 `capsule_claim_pending`도 한 줄 쓴다(챕터와 채운 양은 보류에 남은 값).

#### capsule_unseen_results
동기화 중 저절로 열린 캡슐 결과 가운데 유저가 아직 보지 않은 것(마이그레이션 300, 티켓 20261028_1732). `id`(uuid PK), `user_id`(`users(id)` FK, 삭제 시 CASCADE), `payload`(JSONB, 기본 `{}`), `created_at`, `seen_at`(NULL이면 아직 보지 않음). `user_id`의 `seen_at IS NULL` 부분 인덱스. RLS만 켜고 정책이 없어 service_role만 읽고 쓴다.
- 한 동기화에서 자동으로 열린 캡슐이 하나라도 있으면 한 건을 쓴다. 열린 게 없으면 쓰지 않는다. 쓰는 곳은 `lib/capsule/sync-auto-fill.ts`의 `runSyncCapsuleAutoFill`이다.
- `payload`는 `{ version: 1, events: [...] }`이다. `events`는 열린 순서 그대로이고, 하나가 캡슐 열기 하나다: `openId`, `items`(나온 개체. 잠긴 개체는 이름·그림 없이 등급과 여는 데 필요한 양), `next`(열자마자 생긴 다음 캡슐), `chapterNo`(횟수를 센 챕터, 센 게 없으면 null), `reachedChapters`(이번 열기로 오른 챕터 번호, 없으면 빈 배열), `chapterCount`(센 뒤의 횟수, 오르면 0, 센 게 없으면 null).
- 기록을 쓰지 못해도 이미 확정된 열기를 되돌리지 않는다. 로그만 남긴다.
- `seen_at`을 채우는 «봤어요» 처리와 화면에 내려주는 응답은 아직 없다(U8·U9).

#### capsule_pending_rewards
인벤토리 빈칸이 모자라 보류한 캡슐 보상(표는 마이그레이션 300, 쓰는 함수는 302, 티켓 20261028_1734). `id`(uuid PK), `user_id`(`users(id)` FK, 삭제 시 CASCADE), `slot`(SMALLINT, CHECK 1·2), `chapter_no`(INTEGER, NULL이면 퀘스트 전), `fill_amount`(INTEGER, CHECK 1 이상 — 보류될 때 캡슐의 필요량), `reached_at`(100%에 닿은 시각, 기본 `now()`), `UNIQUE (user_id, slot)`. 아이템 칸이 없다: 받을 때 추첨한다. RLS만 켜고 정책이 없어 service_role만 읽고 쓴다.
- 유저당 최대 2줄이다(slot 1·2). 줄을 만드는 곳은 `capsule_hold_reward`(가장 낮은 빈 slot), 지우는 곳은 `capsule_claim_pending`(받은 줄)이다. 줄을 바꾸는 두 함수는 캡슐 행을 먼저 잠가 직렬화된다.
- 받는 순서는 `reached_at`, `slot` 순(오래된 것부터)이다. 이 순서는 호출하는 앱(`lib/capsule/claim.ts`)이 정한다. 함수는 넘겨받은 줄을 받는다.

#### jam_forfeit_weekly (뷰)
받을 수 없는 동안 사라진 잼의 주 단위 합(마이그레이션 302, `security_invoker`). `jam_transactions`에서 `reason = 'capsule_forfeit'`인 줄만 센다. 칸: `week_start_kst`(DATE, 그 주 월요일 KST), `user_count`(INTEGER, 그 주에 잼이 사라진 유저 수), `forfeited_amount`(BIGINT, 사라진 양의 합, 양수). `anon`·`authenticated`는 읽을 수 없고 service_role만 읽는다. 읽는 코드와 어드민 화면은 아직 없다. 목표 수치는 두지 않는다(오픈 뒤 4주 관찰).

#### user_drop_state.capsule_epic_miss
새 칸(INTEGER, 기본 0). Epic 이상이 나오지 않은 채 연 횟수(보정 1). `pity_epic_threshold` 이상이면 다음 캡슐은 Epic 이상이고, Epic 이상이 나오면 0이 된다. `capsule_open`이 갱신한다.

> 캡슐 변경은 세 RPC(SECURITY DEFINER, service_role 전용, `authenticated` 실행 권한 없음)로만 처리한다.
> - `capsule_get_or_create(p_user_id) → user_capsules`: 없으면 그때의 챕터(`user_chapters.chapter_no`)로 필요량을 정해 만든다. 챕터가 없으면 `pre_quest_fill_amount`다. 필요량은 이후 챕터가 올라도 바뀌지 않는다.
> - `capsule_fill(p_user_id, p_amount DEFAULT NULL) → jsonb`: 이용 정지 중이면 `user_suspended`로 거절하고, 캡슐 행을 잠근 뒤 `already_full`, `invalid_amount`, `exceeds_remaining`, `insufficient_jam` 순으로 검사한다. 기본값은 남은 양이고 가진 잼이 모자라면 가진 만큼 채운다. `jam_apply(capsule_fill, 음수)` 한 줄과 `filled` 갱신이 한 트랜잭션이다. 성공하면 `applied`·`required`·`filled`·`remaining`·`balance`를 돌려준다.
> - `capsule_open(p_user_id, p_items JSONB) → jsonb`(233): 추첨은 앱이 하고 이 함수는 정해진 결과를 한 트랜잭션으로 확정한다. 순서는 이용 정지 확인(`user_suspended`) → 항목 검사(`invalid_items`, 항목 수는 0 이상 `guaranteed_count + bonus_count` 이하) → 캡슐 행 잠금과 가득 참 확인(`not_full`) → 인벤토리 행 잠금과 빈칸 확인(`inventory_not_found`, `insufficient_slots`와 지금 빈칸 `free`·필요한 빈칸 `needed`) → 개체마다 `grant_inventory_item_locked`와 `item_issue_log`(route `capsule`) → 보정 카운터(`common_streak`는 받은 순서대로, `capsule_epic_miss`는 Epic 이상이 있으면 0, 없으면 +1) → `capsule_opens` 한 줄 → 캡슐 행을 지우고 `capsule_get_or_create`로 다음 캡슐 생성(그때의 챕터로 필요량 고정). 항목은 `{badge_id, rarity, rolled_rarity?, locked, lock_reason, unlock_required}`이고, 성공하면 `openId`·`itemIds`·`items`(`inventoryItemId`, `badgeId`, `rarity`, `locked`, `serialNumber`)·`next`(`required`, `filled`)를 돌려준다. 한 단계라도 실패하면 전체가 되돌려진다. 되돌림은 함수만 지우며 이미 연 기록과 지급된 개체는 남는다.
> - API: `GET /api/capsule`(캡슐 상태, 이용 정지 중에도 허용), `POST /api/capsule/fill { amount? }`(양의 정수만, 이용 정지 중 403 `user_suspended`, 거절 400·409), `POST /api/capsule/open`(이용 정지 중 403, `not_full`·`insufficient_slots`·`no_tribe` 409, 그 밖의 오류 500). 응답 모양은 `src/lib/capsule/capsule-contract.ts`다. `openable`은 다 채웠고 인벤토리 빈칸이 나올 수 있는 최대 개수 이상일 때만 참이며, 못 여는 까닭(`not_full`·`no_free_slots`)과 `freeSlots`·`neededSlots`를 함께 싣는다.
> - 채운 잼은 되돌리지 않는다. 마이그레이션을 되돌리면 원장(`jam_transactions`)의 `capsule_fill` 줄은 남지만 그 잼은 지갑으로 돌아오지 않는다.

#### 자동 채움 구조 — 마이그레이션 300·301·302, 티켓 20261028_1732·1733·1734 (운영 로직 5.2·12.2절)
300이 새 열과 표를 더하고(이 구조가 쓰는 것은 `capsule_chapter_costs.fill_amount_v2`·`advance_count`, `user_chapters.capsule_full_count`, `capsule_unseen_results`다. 300의 나머지 표와 열은 U4~U6이 쓴다), 301이 아래 함수 셋을 더한다. 둘 다 공용 DB에 적용했다. 302(티켓 20261028_1734)는 `capsule_auto_fill`·`capsule_open_counted`를 같은 시그니처로 교체하고 새 함수 `capsule_hold_reward`·`capsule_claim_pending`, 열 `user_capsules.alert_stage`, 뷰 `jam_forfeit_weekly`, 알림 종류 값 2개(`capsule_nearly_full`·`capsule_jam_blocked`)를 더했고 2026-10-29에 공용 DB에 적용했다(적용 기록은 티켓 20261028_1734 1회차). 옛 함수(`capsule_next_required`·`capsule_get_or_create`·`capsule_fill`·`capsule_open`·`jam_apply`)의 인자와 동작은 바뀌지 않았다. 새 함수는 `SECURITY DEFINER`·`search_path=public`이고 service_role만 실행한다(`authenticated`·`anon` 실행 불가).
- `capsule_next_required_v2(p_user_id) → (required, chapter_no)`: 새 캡슐의 필요량. 챕터가 없으면 `capsule_policy.pre_quest_fill_amount`, 있으면 그 챕터의 `fill_amount_v2`, 그 챕터 행에 값이 없으면 값이 있는 마지막 행의 `fill_amount_v2`.
- `capsule_auto_fill(p_user_id) → jsonb {ok, applied, required, filled, full, balance, chapterNo, forfeited, pendingCount, alertStage, reachedChapters, chapterCount}`(302에서 교체. 301의 앞 일곱 키는 그대로): 이용 정지 확인 → 캡슐 행 잠금 → `filled = 0`이면 필요량을 v2로 맞춤 → 보류 수를 센다. 보류가 2개이면 채우지 않고 지갑 잔액 전액을 `jam_transactions`에 `capsule_forfeit`(음수) 한 줄로 쓰고 지갑에서 빼며 `forfeited`로 돌려준다(잔액 0이면 원장 줄 없음, `total_earned`는 줄이지 않음). 보류가 0~1개이면 «지갑 잔액과 남은 양 중 작은 만큼» `jam_apply(-n, 'capsule_fill')`로 빼고 `filled`를 올린다. 이번 호출로 `filled`가 `required`에 처음 닿으면 챕터 횟수 +1과 오름 판정을 하고 오른 챕터를 `reachedChapters`(빈 배열 또는 1개)로 돌려준다(퀘스트 전 캡슐은 세지 않고, `advance_count`가 NULL이거나 다음 챕터 정의가 없으면 횟수만 올리고 멈춘다). 보류가 정확히 1개이고 이번 호출에서 채웠을 때 채움 비율이 70·80·90%에 닿은 가장 높은 단계가 `alert_stage`보다 높으면 그 단계를 `alertStage`로 돌려주고 `alert_stage`를 올린다(비교는 정수 `filled*100 >= 단계*required`, 올리지 않았으면 null). 한 번에 캡슐 하나만 채운다. 잔액이 0이면 `applied = 0, full = false`로 정상 반환한다(반복의 종료 신호다). `pendingCount`는 이 호출이 본 보류 수, `chapterCount`는 호출이 끝난 시점의 `capsule_full_count`다.
- `capsule_open_counted(p_user_id, p_items jsonb) → jsonb {…capsule_open 결과, chapterNo, reachedChapters, chapterCount}`(302에서 교체): 같은 트랜잭션에서 `capsule_open`을 부른 뒤 다음 캡슐의 필요량을 v2로 덮어쓰고 `alert_stage`를 0으로 돌린다. **더는 챕터 횟수를 세지 않는다**(`chapterNo`는 null, `reachedChapters`는 빈 배열, `chapterCount`는 지금 값. 이 세 키는 호출하는 TS가 읽어 남겼다). `capsule_open`이 `ok = false`를 주면 그 결과를 그대로 돌려준다. `total_score`는 건드리지 않는다. 301까지는 열 때 횟수와 오름을 처리했다.
- `capsule_hold_reward(p_user_id) → jsonb {ok, slot, pendingCount, blockedNow, next{required, filled, chapterNo}}`(302, 새 함수): 이용 정지 확인(`user_suspended`) → 캡슐 행 잠금 → 가득 차지 않았으면 `not_full` → 보류가 이미 2개이면 `pending_full` → 가득 찬 캡슐을 `capsule_pending_rewards`의 가장 낮은 빈 slot에 옮기고(`chapter_no`, `fill_amount = required`, `reached_at = now()`) 캡슐을 v2의 새 캡슐로 바꾼다(`filled = 0`, `alert_stage = 0`). `blockedNow`는 이 호출 전 보류 1개에서 호출 뒤 2개가 된 경우만 true다(잼을 받을 수 없게 된 순간의 표식).
- `capsule_claim_pending(p_user_id, p_pending_id, p_items jsonb) → jsonb {ok, openId, itemIds, items, pendingCount}`(302, 새 함수): 보류 한 줄을 받는다. 이용 정지 확인 → 항목 검사(`invalid_items`, `capsule_open`과 같다) → 캡슐 행 잠금 → 보류 줄 잠금(없으면 `pending_not_found`) → 인벤토리 잠금(`inventory_not_found`) → 빈칸이 `guaranteed_count + bonus_count`보다 적으면 아무것도 바꾸지 않고 `insufficient_slots`(`free`, `needed`) → 충분하면 `capsule_open`과 같은 방식으로 지급하고 `item_issue_log`(route `capsule`)·`user_drop_state`·`capsule_opens`(챕터와 채운 양은 보류의 값)를 쓰고 그 보류 줄을 지운다. 캡슐 자체(`filled`, `alert_stage`)는 바꾸지 않는다. `pendingCount`는 남은 보류 수다.

앱 쪽 구현:
- `lib/capsule/auto-fill.ts`의 `runCapsuleAutoFill`(던지지 않는 쪽)·`runCapsuleAutoFillOrThrow`: 한 라운드에 `capsule_auto_fill`을 부르고, `reachedChapters`가 있으면 `processChapterRise`(소식·피드·챕터 배지 판정)를 잇고, 가득 찼으면 «열기 또는 보류»를 한다. 보류가 이미 있으면 열기를 시도하지 않고 `capsule_hold_reward`로 보류하고, 없으면 `openCapsule({ counted: true })`를 시도해 `insufficient_slots`일 때만 보류한다. 그 밖의 `CapsuleError`(`no_tribe` 등)는 오류가 아닌 `blocked` 멈춤이고 채운 잼은 캡슐에 남는다. 최대 50라운드(`CAPSULE_AUTO_FILL_MAX_ROUNDS`)이고 멈춤 사유는 `wallet_empty`·`blocked`·`suspended`·`max_rounds`·`error`다. 보류가 2개이면 DB가 지갑을 소멸시키고 `applied = 0`으로 돌아와 `wallet_empty`로 멈춘다. 결과에는 `holds`·`forfeitedTotal`·`alerts`(가득 차지 않은 응답의 `alertStage`만)·`blockedNow`가 더해졌다. 가득 찬 채 남은 캡슐은 다음 라운드의 `capsule_auto_fill`이 `full = true`로 알려 주므로 맨 앞에서 먼저 처리된다.
- `lib/capsule/open.ts`의 `openCapsule`: `counted` 옵션이 켜지면 RPC가 `capsule_open_counted`로 바뀌고 `awardChapterScore('capsule_open')`을 건너뛴다. `processChapterRise`는 부르지 않는다(오름 처리는 `auto-fill.ts`가 `reachedChapters`로 부른다). 추첨·RPC 항목 변환·후속 처리는 `rollCapsuleItems`·`toRpcItems`·`recordOpenedItems`로 나뉘어 있고 보류 받기가 같은 추첨을 쓴다. 옵션이 없으면 응답 모양까지 옛 경로와 같다.
- `lib/capsule/claim.ts`의 `claimPendingCapsules`와 `POST /api/capsule/claim`: 이용 정지 확인 → 보류를 `reached_at`·`slot` 순으로 읽기 → 보류마다 추첨 후 `capsule_claim_pending`. `insufficient_slots`에서 멈추고 받은 만큼만 받는다. 라우트는 401, 정지 403(`user_suspended`), 하나도 못 받고 빈칸 모자람 409(`insufficient_slots`, `freeSlots`·`neededSlots`), 받을 보류 없음 409(`no_pending`), `no_tribe`·`capsule_changed` 409, 그 밖은 500이다. 받은 것이 하나 이상이면 응답 뒤에 캡슐 연 횟수 지표를 다시 판정한다.
- `lib/capsule/sync-auto-fill.ts`의 `runSyncCapsuleAutoFill`: 던지지 않는다. 자동 채움을 돌리고 열린 캡슐이 있으면 `capsule_unseen_results` 한 건을 쓰며, `notifyCapsuleAlerts`로 소식을 보낸다(`blockedNow`이면 `capsule_jam_blocked` 한 건만, 아니면 `alerts`의 단계마다 `capsule_nearly_full`. 소식 규칙은 [notification/PRD.md](notification/PRD.md) §3). 열기 없이 보류만 생긴 동기화는 `capsule_unseen_results`에 쓰지 않는다.
- `lib/strava/sync.ts`: 잼 정산(`settleActivities`) 직후에 `runSyncCapsuleAutoFill`을 부른다. 새 활동이 없는 동기화의 이른 반환 경로에서도 맨 앞에서 부른다. 열린 캡슐이 있으면 그 동기화의 끝 판정에 `chapter_reached`와 `jamTriggersForCapsuleOpen()`을 더하고, 열기 없이 챕터만 오른 동기화(`chapterRose`)에는 `chapter_reached`만 더한다.
- 중복 방지: 잼 정산은 `jam_apply`의 활동 단위 유일성이 지킨다. 자동 채움은 지갑 잔액만 쓰므로 같은 동기화를 다시 보내면 잔액이 0이라 아무 일도 하지 않는다. 원장의 등식은 `받은 잼(+) = 캡슐에 채운 양(−, capsule_fill) + 소멸한 양(−, capsule_forfeit) + 지금 지갑`이다(회수 `admin_deduct`는 따로 뺀다).
- 보류와 잼 소멸의 규칙(최대 2개, 순서, 지갑 전액, 알림 단계)은 운영 로직 5.2절이 원천이고 이 문서는 DB 쪽 사실만 둔다. 이용 정지 중에는 `capsule_auto_fill`·`capsule_hold_reward`·`capsule_claim_pending`이 모두 `user_suspended`로 거절되어 소멸·보류·받기가 일어나지 않는다.
- 옛 점수 장부는 쓰기를 모두 멈췄다: `lib/jam/settlement.ts`(모은 잼)와 `counted` 열기(캡슐 열기)는 티켓 20261028_1733에서, 나머지 열 곳은 서비스 활동 잼 지급으로 바뀌며(티켓 20261028_1735) 멈췄다(위 9-3 상태 표시). 서비스 활동 잼을 받은 직후의 채움은 같은 `runSyncCapsuleAutoFill`이고, 같은 유저의 자동 채움이 이미 돌고 있는 프로세스에서는 안쪽 호출을 건너뛴다(`lib/capsule/auto-fill.ts`의 유저별 잠금, 멈춤 사유 `busy`).

---

## 10. 소셜

### user_follows (신규)
`follower_id`/`following_id`, UNIQUE + 자기 팔로우 방지 CHECK.

### user_activity_feed (신규)
배지 획득·아이템 드랍·픽업·미션 참가/완료·챕터 오름·컬렉션 등급 완성 이벤트를 통합한 피드. `event_type` ENUM(`feed_event_type` 8개 값), `metadata JSONB`. 챕터 오름·컬렉션 완성은 마이그레이션 270(티켓 20261021_1249 5회)이 더했다.

**`strava_activity_id BIGINT NULL`** (마이그레이션 107, 티켓 20260827_018) — 이 이벤트가
어느 활동에서 나왔는지. UUID FK가 아니라 **Strava 숫자 id**를 쓴다:
`strava_activities.strava_id` · `user_activity_badges.triggered_by_strava_id` ·
결산 알림 payload의 `activity_ids`와 같은 규약이라 **알림과 피드가 같은 키로 말한다**.
FK 제약도 걸지 않는다 — `strava_activities` 적재보다 이벤트 기록이 앞설 수 있고,
참조 무결성보다 기록 유실 방지가 우선이다.

- **NULL = 활동 귀속 불명.** 활동 단위가 아닌 이벤트(`mission_joined`·`item_picked_up`·
  `mission_completed`·`chapter_up`·`collection_tier_completed`)와 **107 이전에 쌓인 과거 행 전부**가 여기 해당한다.
  챕터 오름·컬렉션 완성에 값을 넣으면 같은 활동 묶음 카드에 섞여 묶음 제목이 «기록 N개»로 폴백된다.
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
| abusing_policy | 싱글톤. GPS 최대 속도, POI 재방문 차단시간, 차량 탑승 속도 필터, 교통수단 구간 기준, 종목 불일치 기준값(마이그레이션 224: `mismatch_run_min_speed_kmh` 기본 6, `mismatch_cycling_min_speed_kmh` 기본 10 — 평균 속도가 이 값보다 느린 러닝·자전거는 걷기로 계산, 밸런스 설정 «어뷰징» 구역(`/admin/balance`)에서 수정, 티켓 20261017_1421·20261022_1134). 섀도우밴 등급별 드랍률 배율 8열(`soft_*_rate`·`hard_*_rate`)은 NOT NULL·기본값으로 DB에 남아 있고 **코드가 쓰지 않음, 열 정리 대기(6-4 4회)** |
| user_shadow_bans | soft/hard 밴 등급 + 만료시각. **옛 방식이다**: JAM 2.0의 제재는 이용 정지 하나라 새 동기화·드랍·배지 코드는 읽지 않는다(티켓 20261017_1426). 마지막으로 쓰던 코드(옛 어드민 밴 관리 API, 픽업 GPS 감지의 쓰기, `drop-engine/preview.ts`의 읽기)도 6-4 2회(티켓 20261021_1250)에서 지웠다. **코드가 쓰지 않음, 표 정리 대기(6-4 4회 정리 SQL, 출시 뒤 실행)** — 공용 DB에서 0행이다 |
| user_suspensions | JAM 2.0 이용 정지의 상태와 이력(마이그레이션 230, 티켓 20261017_1426). 아래 «user_suspensions» 절 |
| poi_blocks | 유저×POI 단위 72시간 재방문 차단 |
| abusing_logs | GPS 조작 감지 등 이벤트 로그 |

#### user_suspensions — 마이그레이션 230, 티켓 20261017_1426
운영 로직 16.1·16.4·16.7절. 정지는 운영자만 걸고 푼다. 정지를 걸 때마다 한 줄이 생기고 풀면 그 줄의 `lifted_at`을 채운다(줄은 지우지 않는 이력). RLS만 켜고 정책이 없어 service_role만 읽고 쓴다.

| 칸 | 뜻 |
|---|---|
| `user_id` | 정지된 유저. 유저 삭제 시 함께 삭제(`ON DELETE CASCADE`) |
| `reason` | 정지 까닭(필수, 공백만은 CHECK로 거부). 유저에게 안내로 보여 준다 |
| `suspended_at` / `suspended_by` | 건 시각 / 건 운영자(TEXT, 어드민 이메일 등) |
| `lifted_at` / `lifted_by` / `lift_note` | 푼 시각(NULL이면 진행 중, 끝나는 날 없음) / 푼 운영자 / 풀 때 남기는 상담 결과 메모(선택). `lifted_at >= suspended_at`을 CHECK로 지킨다 |

인덱스: 유저당 진행 중 정지(`lifted_at IS NULL`)를 하나로 묶는 부분 유니크 `uq_user_suspensions_active`, 이력 읽기용 `(user_id, suspended_at DESC)`. 다시 걸려면 먼저 풀어야 한다.

**규칙(앱 코드가 판정):**
- 정지 구간은 반열린 `[suspended_at, lifted_at)`이고 `lifted_at`이 NULL이면 끝없음이다. 판정 함수는 `lib/suspension/suspension-contract.ts`의 `isDuringSuspension`(순수 파일, 클라이언트도 가져올 수 있다)이고 서버 조회는 `lib/suspension/suspension.ts`(`getActiveSuspension`·`getSuspensionPeriods`·`assertNotSuspended`)다.
- **정지 중 동기화는 막는다**: `syncStravaActivities`가 끊김 확인 뒤·보류 확인 앞에서 `assertNotSuspended`를 부른다. `/api/strava/sync`는 403(`code: 'user_suspended'`)으로, 콜백 직후 동기화는 건너뛰고 연결 저장과 로그인은 그대로 진행한다. 가진 잼·아이템 배지·배지·포인트는 그대로 둔다.
- **정지 기간 활동은 정산하지 않는다**: `processFetchedActivities`가 정지 구간을 한 번 읽어 활동 `start_date`가 구간 안이면 `filter_reason = 'suspended'`로 기록만 한다(풀린 뒤 동기화해도 같다).
- **보류 받기(`POST /api/strava/pending-items`)도 막는다**(403). 보류 조회(GET)와 내 기록 보기는 막지 않는다.
- 조회가 실패하면 «정지 아님»으로 보지 않고 던진다(동기화·받기를 하지 않는다).
- 캡슐·믹스·드랍·픽업·미션 참가는 각 묶음이 같은 `assertNotSuspended`를 연결한다. 정지 유저를 미션 순위에서 빼는 일은 묶음 5가 한다.
- **어드민 «이용 정지» 탭**(`/admin/abusing?tab=suspensions`)이 정지를 걸고 푼다: `lib/suspension/suspension-write.ts`의 `suspendUser`(까닭 앞뒤 공백 제거 뒤 빈 값이면 `reason_required`, 없는 유저 `user_not_found`, 진행 중 정지가 있으면 부분 유니크 위반을 `already_suspended`)와 `liftSuspension`(진행 중 줄의 `lifted_at`·`lifted_by`·`lift_note`를 채움, 이미 풀렸거나 없으면 `not_suspended`). API는 `/api/admin/suspensions`(GET 목록, POST 걸기)·`/api/admin/suspensions/[id]`(PATCH 풀기)이며 어드민만 부를 수 있다(400·404·409). 이력 조회는 `lib/admin/suspension-list.ts`다.
- **유저 목록의 제재 표시·«제재 중» 필터와 어드민 홈 «유효 제재 수»**는 `user_suspensions`의 진행 중 줄(`lifted_at IS NULL`)을 기준으로 한다. 옛 `user_shadow_bans`는 읽지 않는다.
- **홈 상단 배너**: 정지 중인 유저의 홈 맨 위(인사말 줄 위)에 사유 전문·정지일·결과 설명·«문의하기»(→ `/voc`)를 그린다(`app/(main)/SuspensionBanner.tsx`, 값은 홈 page.tsx가 `lib/suspension/home-banner.ts`로 읽는다). 조회가 실패하면 홈은 열고 배너만 뺀다. 동기화·보류 받기가 403 `user_suspended`를 받으면 일반 실패가 아니라 `d.suspension.syncBlocked`·`pendingBlocked` 안내 토스트(info)를 낸다. 정지 중에도 로그인, 프로필·배지·인벤토리·컬렉션 보기, 문의는 막지 않는다.

---

## 12. CMS / 운영 (신규)

| 테이블 | 역할 |
|---|---|
| today_cards | 홈 "투데이" 카드. 템플릿 9종, 노출 기간·태그·레이아웃 관리(값 목록과 노출 규칙은 [home-feed/PRD.md](home-feed/PRD.md)). `content_type_id`(text, NULL 허용, CHECK T01~T17)는 컨텐츠 유형 카탈로그(`docs/service/prd/content-automation/PRD.md` §6) ID로 2026-09-24 마이그레이션 183에서 추가(티켓 20260923_2259). 기존 카드는 NULL. `description`(text, NULL 허용)은 카드 게재용 설명문(부제 아래 표시, 40자 이하·줄바꿈 없음, `editorial_article` 미사용)으로 마이그레이션 197에서 추가(티켓 20260929_1335) — 상한·표시 규칙은 home-feed PRD §6. `shape`(text, NULL 허용, CHECK `hero`·`poster`·`square`·`brief`·`list`)은 카드 모양, `title_in_image`(boolean, NULL 허용)는 이미지 안에 제목이 있는지로 마이그레이션 206에서 추가(티켓 20261001_1203). 둘 다 NULL이면 옛 카드라 규칙으로 판정하고 새 카드부터 값을 저장한다(백필 없음). `pattern_no`(text, NULL 허용, CHECK·FK 없음)는 운영 항목의 패턴 번호 복사본으로 마이그레이션 211에서 추가(티켓 20260930_1503 ①, 2026-10-01 적용). 옛 카드는 NULL이고 채우는 쪽은 카드를 만드는 티켓 1500이다. `recipe_id`(uuid, NULL 허용, `combination_recipes(id)` 외래 키 `ON DELETE SET NULL`)는 레시피 공개 카드(`template_type = 'recipe_reveal'`)가 가리키는 레시피로 마이그레이션 217에서 추가(티켓 20261006_1218)했고, 같은 마이그레이션이 `template_type` CHECK에 `recipe_reveal`을 더해 9개 값이 됐다. 기존 카드는 NULL이고 레시피를 지우면 카드는 남고 이 칸만 NULL이 된다(`mission_id`·`item_book_id`·`ranking_mode_id`와 같다). 운영툴이 카드 → 레시피 연결로 채운다([ops-tool/PRD.md](ops-tool/PRD.md) §8.3). RLS는 활성이고 인증 유저 SELECT 정책 「today_cards: 인증 유저 읽기」는 `is_active`이면서 노출 기간 안(`starts_at <= now() AND ends_at >= now()`)인 행만 읽게 한다(마이그레이션 214, 티켓 20261002_1257). 노출 태그(`exposure_tags`) 거르기는 정책에 없고 앱이 한다. 쓰기 정책은 없고 `anon`은 읽을 수 없다. 앱은 service 클라이언트로 읽어 이 정책을 거치지 않는다 |
| today_card_events | 투데이 카드 노출·열람·후속 행동 계측 로그(마이그레이션 183, 티켓 20260923_2259). `card_id`(→ today_cards, 삭제 시 NULL), `content_type_id`(기록 시점 값 복제), `event`(CHECK impression·click·followup), `followup_action`, `occurred_at`. **유저 식별자 컬럼 없음**(집계 전용, 결정 4-6). 인덱스 `(content_type_id, occurred_at)`. RLS 활성·정책 없음(서비스 롤만 쓰기). 기록 API·트래커는 티켓 20260924_0004. `card_shape`(text, NULL 허용, CHECK 없음)는 기록 시점에 그려진 모양의 복사본으로 마이그레이션 206에서 추가(티켓 20261001_1203)하고, 기록 API가 노출 검증의 카드 조회에서 정해 채운다(티켓 20261001_1431). 모양 도입 전 기록과 `shape`가 없는 전환 전 옛 카드의 기록은 NULL. `pattern_no`(text, NULL 허용, CHECK·FK 없음)는 기록 시점 카드의 패턴 번호 복사본으로 마이그레이션 211에서 추가(티켓 20260930_1503 ①, 2026-10-01 적용)한다. 옛 기록은 NULL이고 기록하는 쪽은 티켓 1503 ⑥이다 |
| external_input_daily | 외부 입력(날씨 구분·특일 목록)의 하루 단위 저장값(마이그레이션 184, 티켓 20260924_0602). 기본키 (`kind`, `date_kst`), `kind` CHECK(weather·special_days), `date_kst`(DATE, 한국 표준시 기준), `value`(JSONB — 날씨는 `{"kind":"clear"\|"mild"\|"rain"\|"extreme"}`, 특일은 정규화된 특일 배열), `fetched_at`. **유저 식별자 컬럼 없음**. RLS 활성·정책 없음(서비스 롤 전용). 사전 갱신 cron이 쓰고 카드 조회가 읽는 코드는 티켓 20260923_2333 |
| asset_presets | JAM! 에셋 제너레이터 프리셋(마이그레이션 185, 티켓 20260924_2159, 2026-09-25 적용). `id`(uuid), `name`, `target_type`(CHECK `badge`·`mission`·`collection`·`home_feed` 4종, 마이그레이션 187로 확장), `stage_ratio`(CHECK `1:1`·`4:5`·`9:16`·`16:9`, `16:9`는 마이그레이션 205로 확장), `layers`(JSONB — 이미지·텍스트 오버레이 레이어 목록과 순서. 텍스트 레이어는 글자 내용 `content`도 저장, 리본 레이어·배경색·리본 랜덤값·시드는 저장하지 않음, 직렬화 규칙은 `jam-web/src/lib/asset-generator/presetSerialize.ts`), `created_by`(어드민 users.id, FK 없음), `created_at`, `updated_at`(앱이 직접 갱신). 이미지 원본은 `images` 버킷 `asset-generator/presets/{presetId}/{layerId}.{png\|svg}`에 올라가고 `layers`의 `assetUrl`이 그 공개 URL을 가리킨다. RLS 활성·정책 없음(서비스 롤 전용, 어드민 API `/api/admin/asset-generator/presets`). 수동 경로(어드민)가 만들고 자동 경로(윤진 CLI, 티켓 20260924_2201)가 읽는다 |
| theme_presets | 어드민 컬러 테마 프리셋(활성 1개만 유지) |
| engine_decision_log | 배지·드랍 엔진의 판정 사후 추적 로그 (RLS 적용) |
| ops_bundles | 운영툴의 운영 묶음(마이그레이션 198, 티켓 20260930_1816). 에이전트가 `POST /api/admin/ops-inbox`로 제출한 한 주치 묶음 한 건. `id`(uuid), `bundle_id`(text, **유일** — 제출자가 정한 식별자, 재제출·동시 제출 판정), `week`(text, NULL 허용, `2026-W41` 표기), `hypothesis`(text NULL), `author`(text, 제출 에이전트 이름·자기 신고), `routine_run`(JSONB NULL), `color_rationale_link`(text NULL), `is_sample`(boolean, 기본 false — 시험 묶음), `raw`(JSONB — 제출 본문 전체, 바꾸지 않는다), `raw_hash`(text — 키 순서를 정렬한 JSON의 SHA-256, 같은 본문 재제출 판정), `format_errors`(JSONB, 기본 `[]` — 「경로: 사유」 문자열 배열), `received_at`(기본 now()). **묶음 상태 컬럼 없음**(항목 상태에서 계산, [ops-tool/PRD.md](ops-tool/PRD.md) §7). 인덱스 `(received_at DESC)`(시간당 제출 수 확인). RLS 활성·정책 없음(서비스 롤 전용) |
| ops_bundle_items | 묶음 안의 항목 한 건(마이그레이션 198). `id`(uuid), `bundle_id`(→ ops_bundles.id, 삭제 시 함께 삭제), `position`(int, 제출 배열 순서 0부터), `item_key`(text NULL — 묶음 안 고유 키, **(묶음, item_key) 유일 제약 없음**: 중복도 형식 오류로 저장한다), `kind`(text NULL — 7개 값, **CHECK 없음**: 허용값 밖도 형식 오류로 저장한다), `pattern_no`(text NULL — 제출 값이 `^P[0-9]{2,}$`일 때만 값이 있고 형식이 틀리면 NULL로 저장한다(원본 `original`에는 그대로). 형식은 맞지만 패턴 사전에 없는 번호는 값 그대로 저장하고 형식 오류만 남긴다. CHECK 없음, 티켓 20261007_1745), `starts_at`·`ends_at`(timestamptz NULL), `status`(text, 기본 `arrived`, CHECK `arrived`·`reviewing`·`approved`·`preparing`·`scheduled`·`live`·`ended`·`rejected`·`cancelled`·`failed`), `original`(JSONB — 제출 항목 원본, 바꾸지 않는다), `edited`(JSONB NULL — 직접 수정본. 검토중 항목의 직접 수정이 채운다(티켓 1818). 최상위 키 덮어쓰기라 `copy`·`colors`는 합친 객체 전체가 들어가고, 값이 원본과 같아지면 그 키가 빠진다. 남은 수정이 없으면 NULL), `created_resource`(JSONB NULL — 예약 등록으로 만들어진 자원의 ID, 티켓 1500이 채운다. 종류마다 키 하나: `today_card_id`·`mission_id`·`badge_id`·`item_book_id`·`recipe_id`·`ambient_drop_schedule_id`, 시험 묶음은 `{"sample": true}`. 계약은 [ops-tool/PRD.md](ops-tool/PRD.md) §8.5), `format_errors`(JSONB, 기본 `[]`), `created_at`, `updated_at`(앱이 직접 갱신). 조회·정렬에 쓰는 공통 필드만 열로 두고 나머지는 `original`에 둔다. 인덱스 `(bundle_id)`. RLS 활성·정책 없음(서비스 롤 전용) |
| ops_decisions | 운영툴 결정 기록(마이그레이션 198). **추가만 한다**(수정·삭제 API 없음, 지울 수 있는 것은 시험 묶음의 기록뿐). `id`(uuid), `bundle_id`(→ ops_bundles.id, 삭제 시 함께 삭제), `item_id`(→ ops_bundle_items.id NULL, 삭제 시 함께 삭제 — 묶음 전체에 대한 행은 NULL), `action`(text — `submit`(제출)·`approve`·`reject`·`edit`·`revert`(수정 되돌림)·`execute`(예약 등록으로 예약됨)·`fail`(예약 등록 실패와 실패로 닫기, 티켓 20261002_1123)·`cancel`(공개 전 취소, 티켓 20261002_1256), `end`·`external_change`(상태 맞추기, 티켓 20261002_1813), **CHECK 없음**: 뒤 티켓이 값을 더한다. 티켓 1500이 지금 종료의 `end`와 `fail`의 드랍 놓침·건너뜀을 더한다(설계 확정, [ops-tool/PRD.md](ops-tool/PRD.md) §10). 상태 맞추기는 `cancel`·`fail`에 밖에서 지워짐·멈춘 준비중도 쓴다), `actor`(text — 관리자 ID 또는 `token:<에이전트 이름>`. 상태 맞추기가 남기는 행은 `system:reconcile`), `batch_id`(uuid NULL — 일괄 승인·예약 등록 실행·공개 전 취소의 처리 번호, 그 처리로 바뀐 항목마다 1행이 같은 값을 가진다), `diff`(JSONB NULL — `edit`·`revert`의 수정 전후 차이 `[{ path, before, after }]`, `external_change`의 다른 칸만 담은 전후 값 `{ starts_at?: { item, resource }, ends_at?: { item, resource }, is_active?: { item: true, resource: false } }`, 시각은 ISO 문자열이고 시각이 없는(상시) 쪽은 null), `reason`(text NULL — 반려 이유, 수정한 이유, `fail`의 실패 사유, `cancel`의 취소 사유(선택), 상태 맞추기의 `cancel`·`end`는 「운영툴 밖에서 지워졌어요」), `slack_result`(JSONB NULL — 슬랙 알림 결과 `{ channel, ok, error? }`), `created_at`. 제출 한 번에 `submit` 1행이 남고, 결정 하나에 그 행동의 1행이 남는다(일괄 승인은 승인된 항목마다 1행, 예약 등록은 예약된 항목마다 `execute` 1행·실패한 항목마다 `fail` 1행, 공개 전 취소는 취소한 항목마다 `cancel` 1행). 행동 규칙은 [ops-tool/PRD.md](ops-tool/PRD.md) §7.3이다. 인덱스 `(bundle_id)`. RLS 활성·정책 없음(서비스 롤 전용) |
| ops_rules | 운영툴의 규칙 값(마이그레이션 207, 티켓 20260930_1459 조각 A, [ops-tool/PRD.md](ops-tool/PRD.md) §5.2). `rule_key`(text, **기본키** — 예: `open_collections_max`), `rule_group`(text, CHECK `balance`·`signal` — 신호 기준값은 조각 C가 `signal`로 같은 테이블에 넣는다. **바꾼 값만** 행이 되고 키는 기준값 키, `value`는 `{"value": <값>}`, `level`·`enabled`는 자리값 `warn`·`true`다. 기본값 행은 없고 기본값으로 되돌리면 행을 지운다. 기본값 원천은 ops-tool PRD §5.1과 `thresholds.ts`), `value`(JSONB — 규칙마다 모양이 다르다: R1~R3 `{max, provisional}`, R4 `{min_days, provisional}`, R5 `{kinds: {종류: {max, provisional}}}`, R6·R7 `{}`(R5를 따른다), R8 `{keys: [...]}`. `provisional=true`는 실측 없이 정한 임시값), `level`(text, CHECK `info`(참고)·`warn`(주의)), `enabled`(boolean, 기본 true), `updated_at`(기본 now()), `updated_by`(text NULL — 시드는 비우고, 설정 화면(조각 B·C)이 저장할 때 관리자 ID를 채운다. API 응답에는 싣지 않는다), `previous_value`(JSONB NULL — 값이 바뀔 때 이전 값을 넣는다. 설정 화면의 「직전 값으로 되돌리기」가 읽는다). 시드는 밸런스 규칙 R1~R8 8행(모두 `balance`·`warn`·켜짐). RLS 활성·정책 없음(서비스 롤 전용). 2026-10-01 적용(정책 0개·시드 8행·R8 키 23개 확인) |
| ops_patterns | 운영툴의 패턴 사전(마이그레이션 210, 티켓 20260930_1503 ①, [ops-tool/PRD.md](ops-tool/PRD.md) §10.1). 2026-10-01 적용(세 테이블 RLS 활성·정책 0개·CHECK 11개·행 0개 확인). `pattern_no`(text, **기본키**, CHECK `^P[0-9]{2,}$` — `P01`~, 번호는 재사용하지 않고 지우지 않는다), `name`, `principle`(작동 원리), `user_experience`(유저가 겪는 것), `menus`(text[], 기본 `{}`), `samples`(JSONB 배열 `[{ no, name, role, impl }]`, `role`은 `main`·`aux`·`related`), `card_shapes`(JSONB 배열 `[{ shape, note }]` — `shape` 값은 앱이 `CARD_SHAPES`로 검사하고 DB CHECK는 없다), `knobs`(JSONB 객체 `{ condition·place·time·reward: { open, closed }, tribe: { rule, example } }`), `pitfalls`(text, 기본 `''`), `status`(text, 기본 `active`, CHECK `active`·`paused`·`archived`), `pause_reason`(text NULL — `paused`이면 공백 아닌 값 필수), `origin`(text, 기본 `manual`, CHECK `seed`·`manual`·`proposal`), `origin_item_id`(uuid NULL, → ops_bundle_items.id 삭제 시 NULL, 값이 있는 행끼리 유일), `created_at`, `updated_at`(앱이 직접 갱신), `updated_by`(text NULL — API 응답에 싣지 않는다). RLS 활성·정책 없음(서비스 롤 전용). 이 테이블을 읽거나 쓰는 코드는 뒤 조각(②~⑬)이 만든다 |
| ops_pattern_taste_signals | 패턴의 취향 신호(마이그레이션 210, 티켓 20260930_1503 ①). 2026-10-01 적용. `id`(uuid), `pattern_no`(text NULL, → ops_patterns.pattern_no — NULL이면 공통 취향 신호), `name`(방향 이름), `reason`(이유), `basis`(text, 기본 `estimate`, CHECK `estimate`(추정)·`confirmed`(확정)), `evidence_decision_id`(uuid NULL, → ops_decisions.id 삭제 시 NULL — `confirmed`일 때만 값이 있을 수 있다), `confirmed_at`(timestamptz NULL — `confirmed`이면 값 필수), `confirmed_by`(text NULL — API 응답에 싣지 않는다), `sort_order`(int, 기본 0), `created_at`, `updated_at`(앱이 직접 갱신). 인덱스 `(pattern_no)`, 유일 `(COALESCE(pattern_no, ''), name)`. RLS 활성·정책 없음(서비스 롤 전용) |
| ops_pattern_common_rules | 모든 패턴에 적용하는 공통 규칙(마이그레이션 210, 티켓 20260930_1503 ①). 2026-10-01 적용. `rule_no`(int, **기본키**, CHECK > 0), `title`, `body`, `created_at`, `updated_at`(앱이 직접 갱신), `updated_by`(text NULL — API 응답에 싣지 않는다). RLS 활성·정책 없음(서비스 롤 전용) |
| balance_setting_changes | 어드민 «밸런스 설정» 화면(`/admin/balance`)의 변경 이력(마이그레이션 285, 티켓 20261022_1132, 운영 로직 19.1절). 저장 한 번에 한 행이며 **추가만 한다**(수정·삭제 API 없음). 설정 표(`jam_policy`·`capsule_policy`·`capsule_chapter_costs`)에는 트리거를 달지 않고, 저장 API(`PUT /api/admin/balance/[section]`)가 설정 표를 바꾼 같은 요청에서 이 표에 한 줄을 쓴다. 이력을 쓰지 못하면 방금 갱신을 이전 값으로 되돌린다. `id`(uuid), `section_key`(text, 1~50자 — 구역 키(`jam` 등)로 구역 목록을 바꿀 때 마이그레이션이 필요 없도록 값 목록 CHECK는 두지 않는다), `changes`(JSONB 배열, 한 줄 이상 — 한 줄은 `{field, from, to}`이고 행 단위 설정(챕터별 채울 양)은 `field`를 `chapter:3`처럼 쓴다), `note`(text NULL, 200자 이하 CHECK — 변경 메모, 항상 선택), `affects_disclosure`(boolean, 기본 false — 확률 안내 페이지에 반영되는 칸이 바뀐 저장인지), `changed_by`(→ users.id, 삭제 시 SET NULL — 화면에는 표시 이름(`username`)만 보이고 ID·이메일은 읽기 결과에 싣지 않는다), `created_at`. 인덱스 `(section_key, created_at DESC)`. RLS 활성·정책 없음, anon·authenticated 권한 회수(서비스 롤 전용, `user_tribe_changes`와 같은 방식). 2026-10-22 15:43 KST에 공용 DB에 적용했다(롤백 실측과 사용자 승인 뒤, 코드 push보다 먼저). 구역 키는 `jam`(7-1 1회), `sync`·`capsule`(7-1 2회)이다. `capsule` 구역의 `changes` 한 줄에는 정책 칸 이름과 챕터 행 이름(`chapter:3`)이 함께 올 수 있다. **읽는 곳이 둘이다**: 어드민 구역 화면의 «최근 변경»(`lib/admin/balance/history.ts`)과 공개 확률 안내 페이지(`/probability`)의 «바뀐 날짜» 표다. 후자는 `affects_disclosure = true`인 행만 `section_key, changes, created_at` 세 칸만 읽어(`note`·`changed_by`는 읽지 않아 공개 페이지에 실리지 않는다) 저장 한 번을 한 줄로 보이고, `created_at`을 한국 표준시 날짜로 쓴다(`lib/probability/changeLog.ts`, 티켓 20261022_1700, [probability/PRD.md](probability/PRD.md) 5절). 이 표를 읽는 쪽은 `section_key`(`sync`·`capsule`)와 `changes[].field`(`jam_policy`·`capsule_policy` 컬럼 이름)로 유저용 칸 이름을 찾으므로 구역 키나 칸 이름을 바꾸면 그 이름 표(`JAM_COLUMN_LABELS`·`CAPSULE_COLUMN_LABELS`)도 함께 바꾼다 |

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
| DropProbability | `drop_probability` — 잔존하나 `drop_policy`가 사실상 후속 확장판이었다(그 표도 지금은 코드가 쓰지 않는다) |
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
- 모멘텀·피티 로직이 이전 드랍 결과에 의존하므로, 매 판정마다 히스토리 전체를 조회하는 대신 상태를 캐시해 원자적으로 갱신. (옛 드랍엔진 v2 시절의 결정이다. 그 엔진은 2026-10-22에 지웠고, 지금 쓰는 열은 `common_streak`·`capsule_epic_miss`뿐이다.)

---

## [NEEDS CLARIFICATION]

- [x] `drop_events`/`drop_claims`/`drop_probability`(어드민 주도 이벤트형 드랍)가 `drop_policy`(드랍엔진 v2) 도입 후에도 실제 코드에서 호출되는지 — **레거시 확정** (2026-08-07 코드 확인). `lib/drop/pickup.ts`가 `drop_events`/`drop_claims`를 참조하나 `processDropPickups` 함수가 `src/` 전체에서 호출되지 않아 완전한 데드코드. `drop_probability`는 `database.ts` 타입 정의에만 존재하고 실사용 없음. 세 테이블 모두 드랍엔진 v2(`drop_policy`/`user_drop_state`) 도입 이후 미사용 레거시로 판정.
- [x] `trades` 테이블 + `inventory/flea-market` 화면의 실제 개발 착수 시점 — **미정** (2026-08-07 확정). 착수 결정 시 별도 티켓 생성 예정. 현재 `trades` 스키마는 001 마이그레이션 이후 변경 없이 방치 상태.
- [x] `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` 환경변수가 `.env.local`에는 있으나 코드에서 미사용 — **마이그레이션 미착수, 당장 불필요** (2026-08-07 코드 확인). `src/` 전체에서 두 키를 참조하는 코드 없음. 현재 클라이언트 초기화(`lib/supabase/server.ts`, `client.ts`)는 기존 JWT 키 체계(`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`)로만 작동. `.env.local`의 `sb_publishable_*`/`sb_secret_*` 값은 미사용 환경변수로만 남아 있으며 서비스에 영향 없음. Supabase가 JWT 키를 deprecated할 경우 클라이언트 라이브러리 업그레이드와 함께 마이그레이션 필요.
- [x] `poi_categories.pipeline_linked`/`tier`/`keywords[]`의 정확한 운영 기준 문서화 (2026-08-24 위 표로 반영)
- [ ] `user_activity_feed`의 공개 범위 정책 — 공개/비공개/팔로우 공개/전체공개 4단계 체계 **수립 예정** (2026-08-07). 현재 본인·타인 프로필 양쪽에서 동일 테이블을 사용하나 RLS·쿼리 레벨의 공개 범위 필터링이 미정의. 체계 확정 시 이 섹션 + [01_PRD.md](01_PRD.md) 동시 업데이트 필요.
- [x] `wandering_mythic_state`(삭제된 테이블 — 옛 이름 그대로 표기)의 유저 대면 UI 완성도 — **기능 전면 제거로 해소** (2026-08-24, 티켓 [20260824_017](../../tickets/p2-normal/20260824_017_Infra_떠돌이신화-기능-전면제거.md)). 프로덕션 실사용 0건(배지·상태행·획득·인벤토리 전부)이 확인되어 UI를 구현하는 대신 `wandering_mythic_state` 테이블과 `badges.is_wandering` 컬럼, `/api/cron/wandering`을 제거했다.
