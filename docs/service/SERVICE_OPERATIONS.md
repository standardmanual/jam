---
type: guideline
description: "Strava 동기화부터 배지 획득, 드랍, 미션, 피드, 어뷰징 방어, Cron, API, DB 테이블까지 서비스 운영 로직을 정리한 문서다."
---

# JAM! 서비스 운영 로직 전체 정리

> 현재 운영 중인 코드 기준으로 작성된 기술 운영 문서. 항상 현재 상태만 담는다.
> 갱신 이력은 git이 보관한다 — `git log --follow`로 조회할 것.

> **범위 주의**: 배지·드랍 판정 로직의 단일 진실 원천은 `docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md`,
> 데이터 모델의 단일 진실 원천은 `docs/service/prd/02_DATA_MODEL.md`다.
> 이 문서의 §4·§5·§15·§16은 그 문서들과 내용이 겹치며 일부는 이미 어긋나 있다(§16 테이블 25개 vs 31개).
> 정리 전까지는 해당 항목에서 두 문서가 다를 경우 **위 두 문서를 따른다.**

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
13. [Cron 작업](#13-cron-작업)
14. [API 라우트 전체 목록](#14-api-라우트-전체-목록)
15. [DB 테이블 전체 목록](#15-db-테이블-전체-목록)
16. [Strava 활동 타입 매핑](#16-strava-활동-타입-매핑)

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

- Supabase Auth 사용 — **구글(Google) OAuth 단독** (`jam-web/src/app/(auth)/login/page.tsx`).
  이메일/패스워드 가입은 구현돼 있지 않다. 개발 환경에서만 `/api/dev-login`으로 테스트 계정
  로그인 우회가 가능하다(`NODE_ENV === 'development'`에서만 노출, 프로덕션 미노출).
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

### 2-3. 온보딩 흐름 (2단계 카드형, 티켓 20260909_2119)

`GET /auth/callback`은 `users.onboarding_completed_at`이 NULL이면(1단계만 마쳤든 아예 안 마쳤든)
항상 `/onboarding`으로 보낸다. 온보딩 화면 자체가 로드 시점에 유저 상태를 조회해 1단계부터
시작할지 2단계로 곧장 건너뛸지 내부에서 분기한다.

**1단계 — 아이디·이름**
1. `/onboarding` 페이지 접근, `username`이 아직 NULL이면 1단계부터 시작
2. 아이디 입력 → `GET /api/username/check` 중복 확인
   - 규칙: 소문자 영문·숫자·언더스코어·마침표, 최대 **30자**, 마침표로 시작/끝 불가, 마침표 연속 불가, UNIQUE
3. 이름(`display_name`) 입력 — 온보딩에서는 **필수**(자유 텍스트, 최대 30자, 형식 제한 없음).
   프로필 편집에서는 선택값이라는 점과 다르다(20260830_0113)
4. 만 14세 이상 자기확인 체크(최초 1회만 노출, 티켓 20260901_2217)
5. `POST /api/onboarding/complete` (body에 `tribe_id` 없이 호출) → `users.username`,
   `users.display_name`만 저장. `onboarding_completed_at`은 아직 기록하지 않는다

**2단계 — 트라이브 선택 + 프로필이미지**
1. `tribes WHERE is_active = true` 목록을 카드 그리드로 노출(비활성 트라이브 및 0개 상황
   방어 로직 포함)
2. 프로필 이미지는 구글 기본값을 보여주고, 변경 시 기존 `POST /api/profile/avatar`(Supabase
   Storage `avatars` 버킷)를 그대로 재사용 — 선택 사항
3. 트라이브 카드 선택 후 `POST /api/onboarding/complete` (body에 `tribe_id` 포함) 호출:
   - 이미 `tribe_id`가 설정된 유저의 재호출은 409 `ALREADY_SET`으로 거부(트라이브 불변 강제)
   - 제출한 `tribe_id`가 존재하지 않거나 `is_active=false`면 400 `INVALID_TRIBE`
   - 두 거부 모두 `console.error`로 로깅(어뷰징·UI 버그 조기 감지)
   - 통과 시 `users.tribe_id`, `users.onboarding_completed_at`을 함께 기록 — 이 시점부터
     온보딩 완료로 판정된다

**트라이브 불변**: `tribe_id`는 온보딩 2단계에서 1회 설정된 뒤 탈퇴 전까지 변경할 수 없다.
`PATCH /api/profile`에는 애초에 `tribe_id`를 다루는 코드가 없어 변경 API 자체가 존재하지
않는다(프로필 편집은 프로필이미지·아이디·이름만 지원).

**기존 유저**: `onboarding_completed_at` 컬럼은 이번 티켓(20260909_2119)에서 신규 추가됐으므로
추가 직후에는 모든 로우가 NULL이다. 컬럼을 추가하는 마이그레이션(149번)이 같은 트랜잭션에서
`username IS NOT NULL`인 기존 유저의 `onboarding_completed_at`을 즉시 백필한다(과거 1단계
온보딩을 이미 마친 것으로 간주) — 이 백필이 없으면 기존 유저가 다음 로그인 때 전부 온보딩으로
강제 이동한다. `tribe_id`는 백필 대상이 아니라 NULL로 남고, 그 상태로 서비스를 계속
이용할 수 있다(점진적 유도 UI는 후속 과제).

### 2-4. 온보딩 퀘스트 관리자 미리보기 (티켓 20260928_0138, 상위 20260927_2123 N5a·N5b)

`ONBOARDING_QUEST_ENABLED`(`src/lib/onboarding-quest/config.ts`)가 꺼져 있는 동안에도 관리자는
`/admin/onboarding-quest-preview`에서 퀘스트 1~7단계(또는 완료 상태 `done`) 중 하나를 골라 실제
서비스 화면에서 연출을 확인할 수 있다.

- **시작**: 단계 버튼을 누르면 `POST /api/admin/onboarding-quest/preview`(`{ step }`,
  `requireAdmin()`)가 쿠키(`jam_quest_preview`, httpOnly, 1일)를 설정하고 홈(`/`)으로 이동한다.
- **DB 무기록**: 쿠키만 쓴다 — `user_onboarding_quests` 등 어떤 테이블에도 행이 생기거나
  바뀌지 않는다.
- **자동 진행**: 미리보기 중에는 실제 퀘스트 화면의 버튼(`/api/onboarding-quest/step`,
  `/api/onboarding-quest/skip`)이 실제 DB 기록 대신 쿠키 값만 다음 단계로 전이시킨다 — 화면을
  그대로 클릭해 나가면 되고, 다시 어드민 페이지로 돌아갈 필요가 없다.
- **끝내기**: 어드민 페이지의 [미리보기 끝내기] 또는 실제 화면 상단의 앰버색 띠(「퀘스트
  미리보기 중 · N/7단계」)의 [끝내기]가 `{ reset: true }`로 쿠키를 지운다 — 이후 평소 판정
  (기능 스위치·실제 진행도)으로 돌아간다.
- **이중 방어**: 쿠키가 있어도 `getAdminQuestPreview()`가 매번 `getAdminUser()`로 관리자
  여부를 다시 확인한다 — 관리자가 아니면 무시(null)한다.

---

## 3. Strava 연동

**관련 파일:** `src/lib/strava/sync.ts`, `src/app/api/strava/`

### 3-1. OAuth 연동 흐름

```
사용자 → GET /api/strava/auth
           ↓
      무작위 일회용 state 생성 → httpOnly 쿠키로 심고 state 파라미터로 전달
      Strava OAuth 인가 URL로 리다이렉트
      scope: read, activity:read_all
           ↓
사용자가 Strava에서 승인
           ↓
GET /api/strava/callback?code=...&state={무작위 일회용 값}
           ↓
쿠키 값과 state 대조 (없거나 다르면 거부) → 로그인 세션 유저 확인 (없으면 거부)
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

- `state`는 유저 ID가 아니다. 인증 시작이 만든 무작위 일회용 값(256비트)이고, 같은 값이
  `strava_oauth_state` 쿠키(`httpOnly`·`sameSite=lax`·`path=/api/strava`·수명 600초)로 심긴다
  (`src/lib/strava/oauthState.ts`)
- 콜백은 쿠키와 `state`를 상수 시간으로 대조해 다르거나 없으면 `reason=state_mismatch`, 세션 유저가
  없으면 `reason=auth_required`로 거부한다. 거부 시 토큰 교환·DB 저장·동기화를 하나도 실행하지
  않는다. 연결할 유저는 URL이 아니라 로그인 세션의 유저다
- 콜백의 모든 응답(성공·실패)이 `state` 쿠키를 지운다(일회용)
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

3. 마지막으로 가져온 활동의 시작 시각 − 15분(overlap) 이후 활동 조회
   → 커서는 strava_activities에서 그 유저의 최신 start_date를 조회해 구한다(행이 없으면
     after 없이 최신 페이지 1회 조회). last_synced_at(동기화를 누른 벽시계 시각)은 더 이상
     조회 커서가 아니다 — 동시 싱크 잠금 키로만 쓴다(4-1, 티켓 20260922_2207)
   → Strava Activities API (per_page=200)
   → NormalizedActivity로 변환 (STRAVA_TYPE_TO_JAM 매핑)

4. 차량 속도 필터 적용
   → abusing_policy.vehicle_speed_filter_kmh (기본 60km/h, 최소 20km/h) 초과 활동 제외
   → 걸러진 활동은 배지 평가뿐 아니라 아이템 드랍·미션 진행에서도 함께 빠진다

5. Strava Streams API로 GPS 경로 조회
   → 각 활동의 latlng 경로 데이터 획득

6. POI 매칭
   → matchPoisForActivity: 활동 경로 ↔ POI 반경 교차 체크
   → 매칭된 POI의 linked_badge_id가 체크인 배지이고 활동 시작 시각이 배지의 공개 기간 안이면
     record_checkin_earn(DB 함수)으로 user_checkin_badge_earns에 방문 기록 한 줄을 넣고,
     처음 받을 때(is_first)만 배지의 point_reward를 awardPoints로 준다(티켓 20261018_1814)
   → 체크인이 아닌 배지가 연결돼 있어도 발급하지 않는다(옛 'poi_match' 경로 삭제)

7. 아이템 드랍 추첨
   → jamActivityType이 있는 활동에만 tryItemDrop 호출
   → 결과에 따라 inventory_items INSERT

8. 뱃지 엔진 실행
   → evaluateBadges: 조건 달성 배지 발급

9. 아이템북 완성 체크
   → checkItemBookCompletion 호출

10. 미션 달성 체크
    → checkMissions 호출

11. strava_connections.last_synced_at 잠금 키 갱신
    → 처리 시작 전(위 3번 이전)에 선점 갱신해 동시 싱크를 막는다 — 조회 커서 역할은
      없다. 처리 중 예외가 나면 잠금 이전 값으로 롤백한다(20260810_002)
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
   (mystic → common 우선순위로 처리, 초과 시 missed)

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

9. 첫 싱크 플래그 세팅 (dryRun=false이고 skipInitialSyncFlagUpdate가 false/undefined인 경우만):
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
| `time_range` | 한국 시각(KST) 시작 시각의 HH:MM이 {start, end} 범위 내 (자정 경계 지원, 양 끝 포함, `24:00`·`HH:MM:SS`도 읽는다) |
| `poi_id` | 항상 false — GPS 경로 매칭(sync.ts)으로만 발급 |
| `prerequisite_badge_names` | 엔진 Step 1에서 처리 (이 함수에서는 무시) |

### 4-6. 성장 티어 · 진행 트랙 · 홍수 방지 정책

**성장 티어:** 같은 계열(`family_key`, 없으면 같은 이름) 그룹에서 이미 보유한 티어보다 낮거나 같은 배지는 평가 대상 제외.  
Common 보유 시 → Rare부터 평가. Epic 이미 보유 시 → Mystic만 평가.

**진행 트랙:** 순수 거리 또는 횟수 조건만 있는 배지는 `actType:distance_km` 또는 `actType:total_count` 키로 묶여 최고값 1개만 발급.  
PROGRESSION_MODIFIERS(`elevation_gain_m`, `min_speed_kmh`, `streak_days`, `duration_minutes`, `weekend_duration_hours`, `monthly_km`, `weekly_count`, `season_count`, `month`, `season`, `temperature_min/max_c`, `poi_id`, `time_range`) 중 하나라도 있으면 트랙 독립.

**홍수 방지:** 30일 롤링 윈도우 내 동일 `activity_type`당 최대 **3개** 발급.  
초과 시 mystic 우선 통과, 나머지 missed 처리.

### 4-7. POI 통과 배지 발급

```
matchPoisForActivity(latlngPath, pois):
  각 POI에 대해:
  → 활동 경로의 GPS 좌표 중 POI 반경 내 진입 여부 체크
  → 매칭 시 poi.linked_badge_id(체크인 배지, 공개 기간 안) → record_checkin_earn으로
     user_checkin_badge_earns에 방문 기록 INSERT, 처음 받을 때만 point_reward 지급
     (옛 user_activity_badges 'poi_match' 발급은 티켓 20261018_1814에서 삭제)
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
| `common` | Common | ✅ 허용 |
| `rare` | Rare | ❌ 차단 (initial_sync_done 후 해제) |
| `epic` | Epic | ❌ 차단 |
| `mystic` | Mystic | ❌ 차단 |

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
   0.65 ~ 0.75: epic(10%)
   0.75 ~ 0.80: mystic   ( 5%)
   0.80 ~ 1.00: null     (20%, 드랍 없음)

2. 섀도우밴 적용 (shouldAllowDrop):
   soft 밴 → epic, mystic 드랍률 0%로 강제
   hard 밴 → rare, epic, mystic 드랍률 0%로 강제
              (common만 통과)
   null rarity → 바로 종료 (드랍 없음)

3. 배지 후보 조회:
   badges WHERE type='item' AND rarity=추첨rarity

4. 가중 랜덤 선택 (weightedPick):
   badges.drop_weight 기반 가중 확률 적용

5. 인벤토리 슬롯 확인:
   inventory.used_slots >= max_slots → 드랍 취소

6. inventory_items INSERT:
   { badge_id, obtained_by: 'drop', expires_at: 7-1 「만료값」 표의 동기화 드랍 행 }

7. inventory.used_slots += 1

8. recordFeedEvent: 'item_dropped' 기록
```

### 5-3. 드랍 확률 요약

| 등급 | 기본 확률 | 드랍 없음 확률 |
|------|----------|---------------|
| common | 40% | — |
| rare | 25% | — |
| epic | 10% | — |
| mystic | 5% | — |
| 드랍 없음 | — | 20% |

섀도우밴 시 epic/mystic 또는 rare까지 차단되어 실질 드랍률 감소.

---

## 6. POI 드랍 · 픽업

**관련 파일:** `src/lib/drop/pickup.ts`, `src/app/api/drops/`

### 6-1. POI 드랍 (poi_drops)

```
사용자가 직접 POI에 드랍 (POST /api/drops):
1. 인벤토리에서 아이템 선택
2. API 호출 → POI 활성 여부·반경 500m 이내 확인 (isUserNearPoi, DROP_RADIUS_METERS)
3. create_user_drop RPC (DB 원자 트랜잭션): 개체 소유·슬롯 장착 여부 확인 후
   poi_drops INSERT { dropper_user_id, badge_id, poi_id, inventory_item_id, source: 'user' }
   — 드랍 1건 = 1행이고, 개체(inventory_items)는 지워지지 않고 소유자(inventory_id)만 비워진다
   inventory.used_slots -= 1, custody_events INSERT 'UserDrop'
4. 응답 뒤(after()): 놓은 사람의 JAM! 행동 지표 drop_item_count 배지 판정
```

### 6-2. POI 픽업 흐름

```
POST /api/drops/[dropId]/pickup → pickup_drop RPC (DB 원자 트랜잭션):

사전 검증:
  ① 유저 현재 위치 → POI 반경 500m 이내 확인 (isUserNearPoi, DROP_RADIUS_METERS)
  ② poi_blocks 체크: 해당 POI에 해당 유저 블록 없음
  ③ GPS 조작 감지 (checkAndUpdateLocation):
     이전 위치 대비 이동속도 > gps_max_speed_kmh (기본 300km/h) → 거부
  ④ poi_drops.is_available = true
  ⑤ 본인 드랍도 주울 수 있다 (047_reallow_pickup_own_drop.sql, 108의 pickup_drop에 본인 차단 없음)
  ⑥ inventory.used_slots < max_slots (슬롯 여유 확인)

처리:
  poi_drops.picked_up_by = 유저, picked_up_at = now, is_available = false
  개체(inventory_items) 소유자만 줍는 사람의 인벤토리로 이동 (일련번호 불변, 신규 INSERT 없음)
  inventory.used_slots += 1
  custody_events INSERT 'Pickup'
  recordFeedEvent: 'item_picked_up'
  응답 뒤(after()): JAM! 행동 지표 판정 — 줍는 사람(pickup_item_count·pickup_from_user_count)과
    놓은 사람(picked_up_by_user_count)을 각각. 시스템 드랍은 줍는 사람의 pickup_item_count만,
    자기 드랍이면 판정하지 않는다
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
  obtained_by: 개체를 처음 발급한 경로. 지금 코드가 넣는 값은 'drop' | 'ambient_drop' | 'system_event'
               (픽업은 소유자만 옮기므로 이 값을 바꾸지 않는다)
  expires_at: 발급 경로가 정한다 (아래 「만료값」 표). NULL이면 기한이 없다
  dropped_at: POI 드랍 시 설정
  slotted_in: user_item_book_slots.id 참조 (장착 시)
```

**만료값(`inventory_items.expires_at`)**: 개체를 발급할 때 한 번 정하고, 이후 픽업·드랍·장착으로
바뀌지 않는다. 발급은 `grant_inventory_item()` RPC(마이그레이션 173)가 받은 `p_expires_at`을 그대로
넣고, 인자를 넘기지 않으면 NULL이다.

| 발급 경로 | obtained_by | expires_at | 코드 |
|---|---|---|---|
| 동기화 드랍 (5-2) | `drop` | 그 아이템 배지의 공개 종료일(`badges.valid_until`). 공개 종료일이 없으면 NULL | `jam-web/src/lib/drop-engine/index.ts` `insertDrop()` |
| 시스템 드랍 (POI에 미리 배치) | `ambient_drop` | NULL | `mint_and_place_ambient_drop()` (마이그레이션 108). 잠김으로 만든 배지는 `mint_and_place_ambient_drop_locked()` (마이그레이션 240) |
| 믹스 보상 (8-1 6-a단계) | `system_event` | 지급 시점 + 30일 | `jam-web/src/lib/combine/index.ts` 보상 지급 |
| 미션 보상 (9장) | `system_event` | NULL (`p_expires_at`을 넘기지 않는다) | `jam-web/src/lib/missions/rewards.ts` `grantMissionRewards()` → DB 함수 `mission_grant_item_rewards`(마이그레이션 250), 받지 않은 보상은 `mission_claim_item_rewards` |
| POI 픽업 (6-2) | 바꾸지 않음 | 바꾸지 않음 (소유자와 `obtained_at`만 옮긴다) | `pickup_drop()` (마이그레이션 108) |
| 어드민 시뮬레이션 (`dryRun`이 아닐 때) | `drop` | 지급 시점 + 30일 | `jam-web/src/app/api/admin/simulate/route.ts` |

만료일이 지나도 개체를 파괴하거나 장착·믹스·드랍을 막는 처리는 없다. 만료값은 화면 표시(획득
이력의 만료일, 7일 이내면 「곧 만료」 칩)에만 쓰인다. 타입과 획득 이력 화면에 `drop_event` 분기가
남아 있지만, 이 값으로 발급하는 코드는 없다(`drop_events` 테이블은 마이그레이션 075에서 삭제).

### 7-2. 아이템북 슬롯 장착

```
POST /api/itembooks/[id]/slot

검증:
  ⓪ 컬렉션이 «공개됨»이 아니면 RPC 호출 전에 404 item_book_not_found
     (판정 정의는 02_DATA_MODEL.md «컬렉션 노출 판정», 티켓 20260930_1516)
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
    슬롯 수 >= 총 badge 수 → 완성 판정
    → 미완성 상태였으면 user_item_book_completions UPSERT (ignore duplicates)
    → reward_badge_id 있고 유저가 그 배지를 아직 없으면 activity badge 발급
       (완성 기록이 이미 있어도 따라잡아 발급 — issueItemBookRewardBadges)
```

장착으로 완성하면 장착 라우트(`POST /api/itembooks/[id]/slot`)가 응답 뒤 `after()`에서 같은 발급 함수로 보상 배지를
바로 발급한다(`runSlotRewardIssue`, `src/lib/itembook/slotReward.ts`). 이 경로는 완성 기록(`user_item_book_completions`)이
있는지로 완성을 판정한다. 두 경로가 보유 확인과 `23505` 건너뜀을 공유해 배지는 한 번만 나간다(티켓 20261001_0635).

---

## 8. 조합(Combine) 시스템

**관련 파일:** `src/lib/combine/index.ts`, `src/lib/combine/recipe-payload.ts`, `src/lib/combine/policy.ts`, `src/app/api/combine/route.ts`

레시피 구성 규칙(슬롯 기반 OR 매칭, 슬롯 종류, 실패 처리 정책)과 등재 레시피의 정본은
`docs/service/content/COMBINE_RECIPES.md`다. 이 절은 서버가 실제로 처리하는 순서만 적는다.

### 8-1. 조합 흐름

```
POST /api/combine { recipe_id: string, item_ids: string[] }  (item_ids 1~10개, 중복 불가)

1. 로그인 확인 → 없으면 401
2. recipe_id가 문자열이 아니거나 item_ids 개수가 1~10이 아니면 400
   (recipe_not_found / invalid_count)

3. combineRecipeAttempt — 지정한 레시피 하나만 검증한다(전체 레시피 스캔 없음)
   - item_ids에 중복이 있거나 상한을 넘으면 → invalid_count
   - 레시피가 없거나 공개 기간 밖이면(공개 시각 전이거나 종료 시각이 지났으면) → recipe_not_found
     (공개 전·종료된 레시피는 없는 레시피와 같다. 판정은 lib/combine/visibility.ts의 recipeReleaseState)
   - 투입한 개체를 내 인벤토리에서 조회한다(아이템북에 꽂히지 않았고 드랍되지 않은 것만).
     하나라도 못 찾으면 → items_not_found
   이 세 경우는 소각도 포인트 지급도 없다.

4. 슬롯 매칭(matchesRecipeSlots)
   - 아이템 슬롯: 투입한 배지가 그 슬롯의 후보 중 하나여야 한다
   - 조건 슬롯(액티비티·체크인): 후보 중 하나를 보유하고 있으면 충족한다

5. 투입한 아이템 개체 소각 — 매칭 성공·미매칭과 무관하게 항상 실행
   destroyed_at을 세우고 인벤토리 칸을 반환하며 Consume 이벤트를 기록한다.
   조건 슬롯의 배지는 보유만 확인하므로 소각하지 않는다.

6-a. 매칭 성공
   reward_badge_ids를 전부 지급한다(만료값은 7-1 「만료값」 표의 믹스 보상 행, 인벤토리에 칸이 없으면 그 배지는 건너뛴다).
   reward_points가 0보다 크면 지급한다(사유 combine_recipe_reward).
   결과 아이템 배지가 열린 채 지급되면 그 배지의 point_reward도 일련번호마다 한 번 지급한다(사유 badge_point_reward,
   inventory_items.point_awarded_at으로 중복 방지, 잠긴 개체는 열 때, 받지 않은 결과는 받을 때 — 티켓 20261019_1314 2회).
6-b. 미매칭(no_recipe_match)
   combine_policy.fail_reward_points가 0보다 크면 지급한다(사유 combine_fail_reward).
   실패 이력을 기록한다.
```

**주의**
- 소각은 결과와 무관하다. 투입 개수가 레시피 슬롯 수와 다르면 미매칭이므로, 재료를 1개만 넣어도
  소각되고 실패 포인트가 지급된다. 라우트에는 횟수·일일 상한이 없다(점검은 티켓 20260924_1207).
- 보상 배지가 전부 지급되지 않고 포인트도 0이면 성공이지만 재료만 소각된 상태다. 라우트가
  「레시피 실패」 문구를 내려 주고, 원인은 서버 로그에만 남는다.

### 8-2. 레시피 구조

```sql
combination_recipes {
  id, name,
  reward_points: integer          -- 성공 시 지급 포인트(0이면 미지급)
  reward_badge_ids: UUID[]        -- 성공 시 확정 지급하는 아이템배지
  valid_from: timestamptz | null  -- 공개 시각(null이면 처음부터 공개)
  valid_until: timestamptz | null -- 종료 시각(null이면 종료 없음). 둘 다 있으면 valid_from < valid_until
}
combination_recipe_slots {
  recipe_id, slot_order,
  badge_type: 'item' | 'activity' | 'checkin'   -- item은 소각, 나머지는 보유 확인만
  allowed_badge_ids: UUID[]       -- 슬롯 후보(OR)
}
combine_policy { fail_reward_points: integer }  -- 미매칭 시 지급하는 고정 포인트
```

레시피당 슬롯은 2~10개이고 아이템 슬롯이 1개 이상 있어야 한다(`recipe-payload.ts`).

공개 기간(공개 시각 `valid_from` ≤ 지금 < 종료 시각 `valid_until`) 밖의 레시피는 일반 유저에게 없는
레시피와 같다. `/combine` 화면은 공개 중인 레시피만 내려 주고(`filterReleasedRecipes`), 믹스 시도는
재료를 소각하기 전에 `recipe_not_found`로 거절한다. 종료 시각은 선택이고(비우면 상시) 공개 뒤에도 바꾸거나
지울 수 있다. 종료된 레시피로 이미 받은 보상은 그대로다. 레시피를 내리는 길은 종료 시각이고, 삭제도
남는다(삭제 가드 포함).

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

달성 시 (티켓 20261019_1311):
  supabase.rpc('mission_complete', { p_user_id, p_mission_id }) 한 번으로 완료를 기록한다.
    선착순 미션(missions.max_completions IS NOT NULL)이면 DB 함수가 미션 잠금 아래에서
    완료자 수를 세고 기록하므로 동시에 동기화해도 상한을 넘지 않는다.
    응답이 completed(+ completion_id)일 때만 보상 지급 → recordFeedEvent: 'mission_completed' → 소식으로 이어간다.
    already_completed·mission_full·tribe_not_allowed·not_participating·user_suspended는 건너뛴다.
    RPC 호출 실패·계약과 다른 응답은 완료시키지 않는다.
  반환값에 완료 기록 id가 든 completedMissions: [{ missionId, completionId }]를 싣는다.
```

보상 지급(티켓 20261019_1313, 운영 로직 13.2절·6.4절): 완료 기록 뒤 `grantMissionRewards`가 보상 배지를 유형으로 가른다.
- 액티비티 배지는 `user_activity_badges`에 넣는다(이미 가졌으면 건너뛴다).
- 아이템 배지는 DB 함수 `mission_grant_item_rewards` 한 번으로 준다. **이미 가진 아이템 배지도 새 개체로 주고**, 인벤토리 빈칸이
  보상 전부가 들어갈 만큼 없으면 아무것도 주지 않고 «받지 않은 보상»(`mission_item_rewards.status = 'pending'`)으로 기록한다.
  예전의 «이미 가졌거나 가득 차면 흔적 없이 건너뜀»은 없앴다. 잠김은 배지의 «잠김으로 만든 아이템 배지»(`badges.always_locked`) 설정을 따른다.
- 열린 개체의 배지 포인트는 지급할 때(또는 받을 때) 한 번, 잠긴 개체는 열 때 준다. 미션 포인트(`reward_points`)는 예전처럼 바로 준다.
- 체크인 등 액티비티·아이템 외 유형과 숨김 배지(`is_hidden`)는 보상으로 지급하지 않고 경고만 남긴다.
- **보상 배지 저장 검증**(티켓 20261019_1313 2회): 어드민 미션 저장(POST·PATCH `/api/admin/missions`), 운영툴 예약 등록, 등록 스크립트가 같은 판정(`lib/missions/reward-badges.ts`)을 쓴다 —
  배지가 있어야 하고(삭제 제외), 유형은 액티비티·아이템만(체크인 거절), 숨김 배지는 거절, 같은 배지가 두 번 들어오면 한 번으로 줄인다(어드민 저장).
  오류는 현상·원인·해결책 문구로 400이고, 배지를 읽지 못하면 통과시키지 않고 500이다. PATCH는 보상 배지 칸이 본문에 있을 때만 본다.
  게이트 미션의 본 배지(`gated_badge_id`)도 숨김 배지를 거절한다. 어드민의 보상·게이트 배지 검색(`/api/admin/badges/search?excludeHidden=1`)은 숨김 배지를 결과에서 뺀다.
- **숨김 배지의 사용처 제한**: 선행 배지(`prerequisite_badge_names`)와 교차 게이트 3종(`cross_in_axis`·`cross_between_axis`·`gate_mission_badge`)은 숨김 배지를 가리키지 못한다
  (선행 배지는 이름이 실제로 있어야 하고, 교차 게이트는 가리키는 계열에 숨김 배지가 없어야 한다, `findHiddenBadgeReferenceError`).
  이미 미션 보상·게이트 미션의 본 배지·다른 배지의 선행 배지·교차 게이트로 쓰이는 배지를 숨김으로 바꾸는 저장(`PUT /api/admin/badges/[id]`)은 사용처를 문구에 알리며 거절한다.
  숨김으로 새로 만드는 배지(`POST`)도 이름·계열이 이미 쓰이면 거절한다. 이미 숨김인 배지의 다른 칸 수정은 사용처를 보지 않는다.
- **노출 가림**: 미션 상세·목록·투데이 카드는 숨김 보상 배지의 이름·그림·id·개수를 내리지 않는다(상세는 보상 카드와 클라이언트로 넘기는 `reward_badge_ids`에서, 목록은 이름 맵과 각 미션의 `reward_badge_ids`에서, 투데이 카드는 `reward_badge_count`에서 뺀다). 숨김 여부를 읽지 못하면 보상 배지를 내리지 않는다. 잠김으로 만든 아이템 배지(`badges.always_locked`)가 보상이면 상세·목록 모두 같은 자리에서 이름·그림·id를 빼고 등급만 내린다(`lib/missions/locked-rewards.ts`, 티켓 20261019_1317).
- 받지 않은 보상은 기한이 없고, 미션 기간이 끝난 뒤에도 `POST /api/missions/[id]/claim`으로 받는다(이용 정지 중 403, 빈칸 부족 409
  `insufficient_slots`, 받을 보상 없음 409 `no_pending`). 받기 화면은 미션 상세의 «받을 보상» 카드다(5-7 2회, 티켓 20261019_1317).
- 보상 지급이 던져도 완료 기록은 이미 남아 있다. `checkMissions`는 오류를 남기고 그 미션의 피드·소식을 건너뛴 채 다음 미션을 이어 판정한다.

참가·노출 규칙(티켓 20261019_1311): 이용 정지 중이면 참가가 403이고, 참가할 수 있는 트라이브가 정해진
미션은 대상이 아닌 트라이브 유저에게 목록·상세에 보이지 않으며 참가·상황 조회가 404다.
이용 정지 중인 유저는 다른 유저가 보는 순위에서 빠진다. 규칙 상세는 `docs/service/prd/02_DATA_MODEL.md` §8.

어드민 미션 저장의 트라이브 규칙(티켓 20261019_1318 1회, `lib/admin/mission-tribes.ts`): 어드민 미션 양식은 `POST·PATCH /api/admin/missions`에
`scope`(`common`·`tribe`)와 `allowed_tribe_ids`를 미션 본문과 함께 보낸다. 두 필드는 `missions` 칸이 아니라서 라우트가 본문에서 빼고
`mission_allowed_tribes`에 따로 저장한다.
- `scope`가 본문에 없으면(PATCH 부분 갱신) 트라이브를 건드리지 않는다. `common`은 허용 목록을 비운다(같이 온 목록은 무시). `tribe`는 `tribes`에 있는 UUID를 하나 이상 요구하고 중복은 한 번으로 줄인다. 잘못된 값은 400이다.
- 참가나 완료 기록이 있는 미션은 **접근을 줄이는 변경**(공통 → 트라이브 제한, 허용 트라이브 빼기·바꿔치기)을 409로 거절한다. 이미 참가한 유저가 갑자기 미션을 볼 수 없게 되는 일을 막으려는 것이다. 더하는 변경과 공통으로 넓히는 변경은 기록이 있어도 저장한다.
- 순서: PATCH는 검증과 409 판정을 미션 내용 저장 **전에** 끝내고, 미션 칸을 저장한 뒤 허용 트라이브를 맞춘다. 허용 트라이브 저장은 «없는 것을 먼저 넣고 남는 것을 나중에 지운다»(목록이 중간에 비어 트라이브 미션이 공통 미션으로 열리지 않게). 미션 저장 뒤 트라이브 저장이 실패하면 500으로 그 사실을 알리고, 같은 내용으로 다시 저장하면 이어서 맞춘다. POST는 미션을 만든 뒤 트라이브 저장이 실패하면 방금 만든 미션을 지우고 500이다.
- 읽기 실패(트라이브·허용 목록·참가·완료 기록)는 확인 없이 진행하지 않고 고정 문구로 500이다. 미션 저장 라우트의 500은 DB 오류 원문을 싣지 않고 로그에만 남긴다(`lib/admin/mission-save-messages.ts`).
- 미션 삭제 가드(`MISSION_REFERENCE_SOURCES`)는 받지 않은 보상을 담은 `mission_item_rewards`와 참가 취소 이력 `mission_participation_cancellations`를 삭제를 막는 참조로, `mission_allowed_tribes`는 운영 설정이라 삭제 뒤 안내만 하는 참조로 다룬다.

### 9-4. 미션 타입

| mission_type | 조건 | 구현 상태 |
|---|---|---|
| `distance` | 누적 이동 거리(km) | ✅ 운영 중 |
| `activity_count` | 활동 횟수 | ✅ 운영 중 |
| `poi_visit` | POI 방문 횟수 | ❌ 미구현 |
| `item_collect` | 아이템 수집 | ❌ 미구현 |

### 9-5. 공개 미션 운영 원칙

- **정의.** 공개 미션은 노출 조건(`visibility_rule_json`)이 없고 게이트 축(`gate_axis`)도 없는 미션이다. 게이트 미션은 Mystic 진입 열쇠이므로 공개 미션으로 세지 않는다.
- **공백 금지.** 노출 시작일이 지났고 종료 전인 공개 미션이 어느 날짜에도 1건 이상 있어야 한다.
- **상시 입문 미션.** 종료일이 없는 공개 미션 1건을 항상 둔다. 배지가 없는 유저가 처음 참가하는 자리다.
- **시즌 공개 미션.** 시즌 캘린더의 시즌마다 1건 이상을 두며, 기간이 이어져 공백이 없어야 한다. 다음 시즌 미션은 현재 시즌이 끝나기 전에 등록한다.
- **보상.** 공개 미션의 보상은 common 아이템배지, 포인트 0에서 시작한다. 이를 넘는 보상은 `/jam-plan`에서 시뮬레이터 검증을 거친 뒤에만 정한다. 보상 배지는 게이트 열쇠 계열(`gate_mission_badge` 요구의 대상)이 아니어야 한다.
- **게이트 미션 불변.** 게이트 미션의 노출 조건은 이 원칙으로 바꾸지 않는다. 바꾸려면 별도 기획을 거친다.
- **서사·자동화.** 공개 미션의 서사는 윈터 검수를 받는다. 자동 생성한 미션 초안은 보상 칸을 비워 두고 사람이 채운다.
- **주간 점검.** `scripts/admin-api-read.mjs`가 참가 가능한 공개 미션 수(0이면 `[주의]`)와 상시 공개 미션 보상 배지의 유효·삭제·미조회 건수를 건수만 출력한다. 계산은 `scripts/public-mission-check.mjs`다.

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
abusing_policy.vehicle_speed_filter_kmh (기본값: 60km/h, 최소값: 20km/h)

Strava 동기화 시:
  activity.average_speed_kmh > vehicle_speed_filter_kmh
  → 해당 활동을 아래 세 곳에서 모두 제외
     · 액티비티 배지 평가 (evaluateBadges)
     · 아이템 드랍 대상 선정·판정 (tryItemDrop)
     · 미션 진행 체크 (checkMissions)
```

- 임계값은 `getAbusingPolicy()`(정식 경로)로 읽는다. 못 읽거나 값이 0 이하면 기본값 60km/h로
  폴백하고 서버 로그를 남긴다 — 필터식이 "이하만 통과"라 임계값이 0이면 모든 활동이 탈락해
  배지·드랍·미션이 한꺼번에 멈추기 때문이다.
- **하한 20km/h는 어드민 저장 경로에서 강제한다.** 사이클링 평균속도가 통상 20~30km/h라
  그 아래로 내리면 차량이 아니라 정상 활동을 거르게 된다. 20 미만을 저장하면 400과 함께
  안내 메시지가 뜬다. 필터를 사실상 끄고 싶으면 값을 크게(예: 999) 올린다.
  (티켓 20260831_1300)

### 12-2. GPS 조작 감지

```
src/lib/abusing/gps-detector.ts

checkAndUpdateLocation(userId, lat, lng):
  users.last_location_(lat/lng/at) 조회
  이동 거리(Haversine, 미터) / 경과 시간 → 속도 계산
  > gps_max_speed_kmh (기본 300km/h) → GPS 조작 판정(speed) → 픽업 거부

  일일 누적 이동거리(users.gps_daily_distance_km, UTC 날짜 기준 리셋):
    구간 이동거리를 매 호출마다 누적
    > gps_daily_distance_cap_km (기본 3000km/일) → GPS 조작 판정(daily_distance) → 픽업 거부

  정상 → users.last_location · gps_daily_distance_km 업데이트
```

- 최소 이동거리(`MIN_DISTANCE_KM=0.15km`)·최소 경과시간(`MIN_ELAPSED_SECONDS=5초`) 가드는
  GPS 재수신 시 좌표가 튀는 노이즈를 걸러낸다. 짧은 간격의 소규모 튐만 걸러낼 뿐,
  일일 누적거리 쪽은 게이트를 통과한 모든 정상 이동을 계속 더한다.
- ⚠️ **`haversineDistance()`는 미터를 반환한다.** `checkAndUpdateLocation()` 안에서 이
  값을 즉시 `/1000`으로 km 변환한 뒤 속도·누적거리 계산에 써야 한다 — 2026-08-31까지
  이 변환이 빠져 있어 모든 임계값이 실제로는 1000배 민감하게(300km/h→0.3km/h,
  3000km/일→3km/일, 150m→15cm) 작동했고, 정상적인 하루 도보 이동만으로도 상시 오탐이
  났다(티켓 20260813_002의 6건, 20260831_1504의 2건 모두 같은 근본 원인). 이 함수를
  다시 손댈 때는 반환 단위를 재확인할 것.

### 12-3. 섀도우밴

```
user_shadow_bans { user_id, ban_level: 'soft'|'hard', reason, expires_at }

soft 밴:
  epic, mystic 발급 → 0% (차단)
  rare, common 정상 유지

hard 밴:
  rare, epic, mystic 발급 → 0% (차단)
  common만 정상 유지
```

적용 경로 (`getUserBanLevel()`·`shouldAllowDrop()` 공용, `src/lib/abusing/shadow-ban.ts`):
- 아이템 드랍(`src/lib/drop-engine/index.ts`) — 차단된 등급은 common으로 강등한다("활동당
  최소 1개 확정" 보장을 지키기 위한 예외), common도 차단이면 그 드랍 자체가 취소된다
- 액티비티 배지 발급(`src/lib/badge-engine/index.ts`의 `evaluateBadgesDetailed`) — rarity가
  있는 배지(등급형·반복형 등급 사다리)만 대상. 레벨형(`rarity` NULL)은 등급 서열이 없어
  대상이 아니다. 강등 없이 차단되며, 그 배치에서는 단순 미발급으로 남는다(조건 자체는
  유지되므로 밴이 풀린 뒤 다음 평가에서 정상 발급된다)
- 서비스 사용량 배지(`src/lib/badge-engine/usageBadges.ts`, 팔로우 API·동기화 API 트리거) —
  rarity가 있는 배지만 대상, 액티비티 배지와 동일한 판정(강등 없이 미발급)
- POI·체크인 배지 발급(`src/lib/strava/sync.ts`의 `processFetchedActivities`) — checkin
  타입(`user_checkin_badge_earns`)은 최초 획득에만 적용(반복 방문 카운터 증가는 대상 밖),
  레거시 `activity`+`poi_id` 타입(`user_activity_badges`)은 항상 최초 1회 지급이라 매번
  적용. 어드민 시뮬레이터(`/api/admin/simulate`)는 실유저 발급과 분리된 진단 도구라
  의도적으로 게이트 밖에 있다

> ⚠️ 위는 **설계 의도**다. **Epic 차단은 현재 꺼져 있다**(soft/hard 모두 배율 1.00).
> 경위와 판단 보류 사유는 [12-6](#12-6-어뷰징-정책-싱글톤-abusing_policy) 참조.

### 12-4. POI 블록

```
poi_blocks { user_id, poi_id, blocked_until }

픽업 시도 시 poi_blocks 체크:
  해당 (user_id, poi_id)에 유효한 블록 있음 → 픽업 거부
  기본 블록 기간: 72시간
```

### 12-5. 교통수단 구간 감지·거리/시간 재산정

**관련 파일:** `src/lib/strava/transitSegment.ts`, `src/lib/strava/api.ts`(`getActivityStreams`),
`src/lib/strava/sync.ts`(`processFetchedActivities`)

걷기 활동 중간에 지하철·버스 같은 교통수단 구간이 섞여도, 12-1의 차량속도필터와 걷기 배지
게이트는 둘 다 `averageSpeedKmh`(전체 평균)만 검사해 걸러내지 못한다. 짧은 교통수단 구간은
전체 평균을 크게 끌어올리지 않기 때문이다(실사례: distanceKm 2.5, maxSpeedKmh 119.5,
averageSpeedKmh 7.0 — 집→지하철역 도보, 지하철 탑승, 하차 후 회사까지 도보. 티켓 20260909_1012).

```
Strava 동기화 시 (poiMatchTargets — 배치 최신 10건, POI 매칭과 동일 대상):
  getActivityStreams(activityId)로 velocity_smooth(m/s)·time(누적 초) 스트림 조회

  activity.jamActivityType이 걷기·러닝·자전거이고
  activity.maxSpeedKmh > 활동 타입별 임계값인 경우에만:
    velocity_smooth에서 그 임계값을 30초 이상 연속으로 초과하는 구간을 찾는다
    → 그 구간의 거리·시간을 distanceKm/movingTimeSec에서 제외
    → averageSpeedKmh 재계산
    → normalizeActivity() 이후·배지/드랍/미션 판정 이전에 NormalizedActivity에 반영
```

- **활동 타입별 임계값**(`abusing_policy`, 어드민에서 조정 가능):
  - 걷기 `transit_walk_max_speed_kmh` (기본 20km/h) — 엘리트 경보 선수 최고 기록보다도 높다
  - 러닝 `transit_run_max_speed_kmh` (기본 27km/h) — 30초 지속 창 기준 800m~마일 세계기록
    페이스. 마라톤 페이스(~21km/h)가 아니라 그 시간대에 버틸 수 있는 단거리 기록이 물리적
    상한선이다 — 낮추면 정상 인터벌 훈련·라스트 스퍼트를 오탐한다
  - 자전거 `transit_cycling_max_speed_kmh` (기본 55km/h) — 엘리트 로드 사이클링 평균속도
    40~45km/h + 내리막 스퍼트 여유분. 12-1의 차량속도필터(평균 60km/h)와 별개로, "평균은
    정상인데 짧은 구간만 교통수단이 섞인" 케이스를 잡는 보완재다
  - 최소 지속시간 `transit_segment_min_duration_sec` (기본 30초) — 모든 타입 공통
- **fail-open**: 스트림 조회 실패(네트워크 오류·404·부족한 스트림)는 기존 `averageSpeedKmh`
  기준 판정으로 그대로 폴백한다 — POI 매칭 실패 처리와 같은 패턴이다.
- **롤백**: 로직 전체가 위 임계값 필드로 게이팅돼 있다 — 문제가 생기면 임계값을 매우 높게
  (예: 999km/h) 조정해 사실상 비활성화할 수 있다(어드민 화면에서 즉시 반영, 배포 롤백 불필요).
- **범위 밖(후속 티켓)**: 이 로직 배포 전 이미 처리된 과거 활동·배지·드랍의 소급 재평가, 문제
  발견 시 배지·드랍 자동 회수(현재 코드에 자동 회수 기능 자체가 없다 — 회수는 기존 포인트의
  `abuse_reclaim` 사유와 같은 수동 절차), `MAX_POI_MATCH_ACTIVITIES_PER_SYNC`(10개) 밖
  백필 활동의 검증은 모두 별도 티켓이다.

### 12-6. 어뷰징 정책 싱글톤 (abusing_policy)

```sql
-- 컬럼 16종 + id + updated_at (2026-09-09 마이그레이션 148 반영)
abusing_policy {
  id: 1 (항상 단 1건)
  -- 밴 등급별 드랍 배율 (0.0 = 완전 차단, 1.0 = 정상). 8종 모두 0~1
  soft_common_rate:  1.0            -- soft밴 시 common 드랍률
  soft_rare_rate:    1.0            -- soft밴 시 rare 드랍률
  soft_epic_rate:    1.0            -- soft밴 시 epic 드랍률  ⚠️ 아래 주석 참조
  soft_mystic_rate:  0.0            -- soft밴 시 mystic 드랍률
  hard_common_rate:  1.0            -- hard밴 시 common 드랍률
  hard_rare_rate:    0.0            -- hard밴 시 rare 드랍률
  hard_epic_rate:    1.0            -- hard밴 시 epic 드랍률  ⚠️ 아래 주석 참조
  hard_mystic_rate:  0.0            -- hard밴 시 mystic 드랍률
  -- 임계값 (상한 없는 정수)
  gps_max_speed_kmh:                300  -- GPS 조작 감지 기준
  gps_daily_distance_cap_km:        3000 -- 일일 누적 이동거리 상한
  vehicle_speed_filter_kmh:         60   -- 차량 탑승 판정 기준. 최소 20 (초과 활동은 배지·드랍·미션에서 제외)
  poi_block_hours:                  72   -- GPS 조작 감지 후 POI 블록 지속 시간
  transit_walk_max_speed_kmh:       20   -- 걷기 활동 중 교통수단 구간 감지 임계값 (12-5)
  transit_run_max_speed_kmh:        27   -- 러닝 활동 중 교통수단 구간 감지 임계값 (12-5)
  transit_cycling_max_speed_kmh:    55   -- 자전거 활동 중 교통수단 구간 감지 임계값 (12-5)
  transit_segment_min_duration_sec: 30   -- 교통수단 구간 판정 최소 연속 지속시간 (12-5)
  updated_at
}
```

> ⚠️ **Epic 차단은 현재 의도적으로 꺼져 있다** (`soft_epic_rate` = `hard_epic_rate` = **1.00**).
> 12-3의 "soft/hard 밴 → epic 0% 차단"은 **설계 의도이지 현재 동작이 아니다.**
>
> 경위: 2026-08-13 티켓 20260813_003의 rename 누락으로 코드가 조회하는 키와 DB 컬럼명이
> 어긋났고, `shadow-ban.ts`의 `?? 1.0` 폴백이 그 결여를 "허용"으로 읽어 Epic 차단이 18일간
> 무음으로 꺼져 있었다. 마이그레이션 115(티켓 20260831_1115)가 컬럼명을 통일하면서
> **유저 체감 동작을 바꾸지 않기로 결정해**(사용자 확인 2026-08-31) 실효값 1.00을 명시했다.
> **차단을 실제로 켤지는 어뷰징 현황을 확인한 뒤 별도 티켓에서 판단한다.**
> Mystic 차단(0.00)은 그동안에도 정상 작동했다.

어드민 패널(`/admin/abusing`)에서 `PUT /api/admin/abusing/policy`로 수정한다.
라우트는 `DEFAULT_POLICY`의 16개 키만 통과시키는 화이트리스트를 돌린다 — 배율 8종은 0~1,
임계값 8종은 0 이상만 검사하고 상한을 두지 않는다. 저장 실패는 500 + `error`로 화면에 노출된다
(2026-08-13 ~ 08-31 사이 이 화면의 저장은 전부 무음 실패했다 — 티켓 20260831_1149).

**불변식: `src/lib/abusing/policy.ts`의 `DEFAULT_POLICY`는 이 행의 미러다.**
"바람직한 값"이 아니라 **DB를 못 읽을 때 현행 운영값을 그대로 재현하는 값**이다.
폴백이 정책을 바꾸면 장애 대응이 아니라 무음 정책 변경이 된다 — 실제로 `DEFAULT_POLICY`의
Epic 배율만 `0.0`이어서 정책 조회가 한 번 실패하면 의도적으로 꺼둔 Epic 차단이 켜졌다
(티켓 20260831_1259에서 `1.0`으로 정렬).

> ⚠️ **DB의 배율을 바꾸면 같은 티켓에서 `policy.ts`의 `DEFAULT_POLICY`도 함께 바꾼다.**
> 한쪽만 바꾸면 정상 경로와 폴백 경로의 판정이 갈리고, 그 차이는 무음으로 드러나지 않는다.
> 회귀 가드: `src/lib/abusing/__tests__/shadow-ban.test.ts`가 배율 8종의 일치를 고정한다.

소비 지점 `shouldAllowDrop()`의 폴백 방향도 이 행과 묶여 있다 — **미지 등급은 차단(fail-closed),
값 결여·NaN은 `DEFAULT_POLICY` 폴백**이며 둘 다 `console.error`를 남긴다.
다만 미지 등급의 **실효 결과는 "드랍 취소"가 아니라 "common 강등"** 이다 — 호출부
`drop-engine/index.ts`의 `applyShadowBanCap()`이 차단된 등급을 common으로 낮춰 재판정하고,
common 배율이 1.0인 한 그 드랍은 살아남는다. 등급 → 배율 키 매핑은
`Record<BadgeRarity, keyof AbusingPolicy>`로 고정돼 있어 등급명이 바뀌면 `tsc`가 잡는다.

---

## 13. Cron 작업

**크론의 단일 진실 원천은 [`docs/service/prd/04_PROJECT_SPEC.md` 「Vercel Cron 작업」](prd/04_PROJECT_SPEC.md#vercel-cron-작업)이다.**
경로·스케줄·인증 방식·제거된 크론의 이력이 모두 그곳에 있다. 실체는 `jam-web/vercel.json`의
`crons` 배열이므로, 문서와 어긋나면 항상 그 파일이 옳다.

> ⚠️ **이 절에 크론 표를 다시 만들지 말 것.** 예전에는 여기에도 같은 표가 있었고, 그 사본이
> 37일 동안 틀린 채로 방치됐다 — 2026-07-31에 삭제된 `/api/cron/sync`를 계속 안내하면서
> 실제로 도는 `notifications`·`ambient-drop`은 빠져 있었다(티켓 20260906_1245). 한 사실을 두
> 문서가 나눠 가지면 한쪽만 갱신되는 일이 반복된다. 크론 정보가 필요하면 위 링크로 보낸다.

---

## 14. API 라우트 전체 목록

### 유저 앱용

| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | `/auth/callback` | Supabase Auth 콜백 |
| GET | `/api/strava/auth` | Strava OAuth 시작 |
| GET | `/api/strava/callback` | Strava OAuth 콜백 (토큰 저장 + 첫 동기화) |
| POST | `/api/strava/sync` | 수동 Strava 동기화 |
| GET, PATCH | `/api/profile` | 프로필 조회/수정 |
| POST | `/api/profile/avatar` | 아바타 업로드(서버에서 EXIF 제거·방향 적용 후 저장) |
| GET | `/api/username/check` | 유저네임 중복 확인 |
| POST | `/api/onboarding/complete` | 온보딩 완료 처리 |
| POST | `/api/follows` | 팔로우 |
| DELETE | `/api/follows/[userId]` | 언팔로우 |
| GET | `/api/users/[username]/followers` | 팔로워 목록 |
| GET | `/api/users/[username]/following` | 팔로잉 목록 |
| GET | `/api/users/[username]/itembooks` | 유저 아이템북 목록 |
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

스케줄은 여기에 적지 않는다 — [§13](#13-cron-작업)이 가리키는 SOT에만 둔다.

| 메서드 | 경로 | 기능 |
|--------|------|------|
| GET | `/api/cron/poi-cleanup` | 삭제된 배지에 연결된 미픽업 POI 드랍 소각(드랍 자체에는 만료가 없다), 3개월 지난 부정 이용 탐지 기록(`abusing_logs`) 삭제 |
| GET | `/api/cron/notifications` | 알림(소식) T2 배치 생성 |
| GET | `/api/cron/ambient-drop` | 앰비언트(시스템) POI 드랍 배치 + 날짜 예약 배포 처리 |
| GET | `/api/cron/external-inputs` | 날씨·특일을 미리 받아 `external_input_daily`에 저장 |
| GET | `/api/cron/ops-reconcile` | 운영툴 항목 상태를 실제 자원에 맞춤(공개·종료·취소·실패, 밖에서 바뀐 것은 결정 기록만) |
| GET | `/api/cron/ops-stop-signals` | 운영툴 중단 신호 점검 — 상태 맞추기를 먼저 하고, 직전 한 시간에 새로 걸린 예약 누락·루틴 실패를 `#jam-alert`에 알림 |

### 어드민

| 메서드 | 경로 | 기능 |
|--------|------|------|
| POST | `/api/admin/auth` | 어드민 인증 |
| GET, POST | `/api/admin/badges` | 배지 목록/생성 |
| PUT, PATCH, DELETE | `/api/admin/badges/[id]` | 배지 수정/삭제 |
| PATCH | `/api/admin/badges/[id]/assign` | 배지 item_book_id 할당 |
| GET, POST | `/api/admin/tribes` | 트라이브 목록/생성 |
| GET, PUT, DELETE | `/api/admin/tribes/[id]` | 트라이브 수정 |
| GET, POST | `/api/admin/itembooks` | 아이템북 목록/생성 |
| PUT, PATCH, DELETE | `/api/admin/itembooks/[id]` | 아이템북 수정/삭제 |
| GET, POST | `/api/admin/missions` | 미션 목록/생성 |
| PATCH, DELETE | `/api/admin/missions/[id]` | 미션 수정/삭제 |
| GET, POST | `/api/admin/poi` | POI 목록/생성 |
| PUT, DELETE | `/api/admin/poi/[id]` | POI 수정/삭제 |
| PATCH | `/api/admin/poi/review/[id]` | 검토 큐 단건 승인/카테고리변경후승인/거부 ([[20260907_1242]]) |
| POST | `/api/admin/poi/review/bulk` | 검토 큐 다중선택 일괄 처리 ([[20260907_1242]]) |
| GET | `/api/admin/poi/review/ids` | 검토 큐 필터 결과의 전체 ID(전체 선택용, 상한 1,000) |
| GET, POST | `/api/admin/recipes` | 조합 레시피 목록/생성 |
| PATCH, DELETE | `/api/admin/recipes/[id]` | 레시피 수정/삭제. PATCH는 공개된 레시피의 공개 시각 변경을 409로 거절하고, 종료 시각은 공개 뒤에도 바꾸거나 지울 수 있다(공개 시각 이하이면 400, [[20261002_0710]]) |
| POST | `/api/admin/recipes/[id]/cancel-release` | 공개 전(예약 중) 레시피 취소 = 삭제. 삭제 가드를 거치고, 이미 공개됐으면 409, 없으면 404 ([[20261001_1158]]) |
| GET, POST | `/api/admin/ambient-drop/schedules` | 앰비언트 드랍 날짜 예약 목록(최근 50건)/등록 ([[20261001_2052]]) |
| POST | `/api/admin/ambient-drop/schedules/preview` | 날짜 예약 등록 전 미리 확인(예정 시각 기준, 쓰기 없음, 겹침 지점 수) |
| POST | `/api/admin/ambient-drop/deploy` | 앰비언트 드랍 즉시 배포. 본문 없음 = 저장된 설정으로 배포(예약 시각 전후 창 409), 본문 있음 = 지정한 지점·아이템으로 1회 배포(「지금」, 창 미적용, [[20261001_2053]]) |
| PATCH, DELETE | `/api/admin/ambient-drop/schedules/[id]` | 날짜 예약 시각 수정/공개 전 취소(행은 `canceled`로 남음) |
| GET | `/api/admin/users` | 유저 검색(자동완성용) |
| POST | `/api/admin/users/[id]/reset` | 유저 데이터 리셋 (본인·어드민 계정은 403) |
| GET | `/api/admin/users/ids` | 유저 목록 필터 결과의 전체 ID(전체 선택용, 상한 1,000) |
| POST | `/api/admin/users/export` | 선택한 유저 CSV 내보내기 |
| POST | `/api/admin/users/bulk` | 유저 일괄 포인트 지급·회수·초기화·삭제 (미리보기·확인 문구, 어드민·본인 자동 제외) |
| POST | `/api/admin/simulate` | 드랍/배지 시뮬레이션 |
| POST | `/api/admin/drop-policy/exclusions/bulk` | 드랍 제외 관리 일괄 제외·제외 해제(아이템배지·컬렉션) |
| GET | `/api/admin/drop-policy/exclusions/ids` | 드랍 제외 관리 필터 결과의 전체 ID(전체 선택용, 상한 1,000) |
| GET, PUT | `/api/admin/abusing/policy` | 어뷰징 정책 조회/수정 |
| GET, POST, DELETE | `/api/admin/abusing/bans` | 섀도우밴 목록/부여 |
| GET, DELETE | `/api/admin/abusing/poi-blocks` | POI 블록 관리 |

---

## 15. DB 테이블 전체 목록

| 테이블 | 설명 | 생성 마이그레이션 |
|--------|------|------------------|
| `users` | 유저 기본 정보 (id, email, username, avatar_url, last_location, **initial_sync_done**) | 001, 032 |
| `strava_connections` | Strava OAuth 토큰 + 동기화 상태 | 001 |
| `badges` | 배지 정의 (type, rarity, condition_json, drop_weight) | 001 |
| `user_activity_badges` | 유저 획득 배지 기록 (triggered_by, strava 메타) | 001 |
| `inventory` | 유저 인벤토리 (max_slots, used_slots) | 001 |
| `inventory_items` | 인벤토리 아이템 개별 레코드 (expires_at, slotted_in) | 001 |
| `item_books` | 아이템북 정의 (tribe_id, reward_badge_id, is_active) | 001 |
| `poi` | 관심 지점 (위치, 반경, linked_badge_id, osm_id) | 001 |
| `tribes` | 트라이브 정의 | 014, 152(리네임) |
| `combination_recipes` | 조합 레시피 (name, reward_points, reward_badge_ids, valid_from, valid_until) | 011, 174, 175, 204, 213 |
| `missions` | 미션 정의 (type, condition_json, starts/ends_at, max_completions) | 011 |
| `user_mission_participations` | 미션 참가 기록 | 012 |
| `user_mission_completions` | 미션 완료 기록 | 011 |
| `mission_allowed_tribes` | 미션에 참가할 수 있는 트라이브 (행이 없으면 공통 미션) | 249 |
| `mission_participation_cancellations` | 트라이브 변경으로 취소된 미션 참가 기록 | 249 |
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

---

## 16. Strava 활동 타입 매핑

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
