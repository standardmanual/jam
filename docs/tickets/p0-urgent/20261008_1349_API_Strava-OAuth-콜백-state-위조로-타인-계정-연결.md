---
id: "20261008_1349"
category: API
priority: P0
status: CLOSED
created: 2026-10-08
closed: 2026-10-08
specs:
  - docs/service/SERVICE_OPERATIONS.md
---

# [API] Strava OAuth 콜백이 URL의 state를 유저 번호로 믿어 다른 유저 계정에 Strava를 연결할 수 있다

## 핵심 요약
- 요구사항: Strava 콜백이 연결할 유저를 URL의 `state`가 아니라 **로그인 세션의 유저**로 정한다. `state`는 유저 UUID 대신 브라우저 쿠키에 묶인 무작위 일회용 값으로 바꾸고, 콜백은 쿠키 값과 `state`가 같을 때만 토큰 교환을 진행한다. 다르거나 없으면 Strava 토큰 교환·DB 저장·동기화를 하지 않고 오류로 돌려보낸다.
- 구현 계획: 공용 도우미 `jam-web/src/lib/strava/oauthState.ts`(신규)에 쿠키 이름·수명·생성·상수 시간 비교를 둔다. 인증 시작 라우트는 값을 만들어 쿠키에 넣고 `state`로 보낸다. 콜백은 쿠키 대조 → 세션 확인 → 기존 처리 순서로 바꾸고 모든 응답에서 쿠키를 지운다. 두 라우트 테스트를 새로 쓰고 운영 문서 §3-1 흐름을 고친다. 파일별 위치는 아래 「구현 계획」.
- 관련 파일:
  - `jam-web/src/app/api/strava/auth/route.ts` `GET()` L11-39 — L28-34 `URLSearchParams`의 `state: user.id`(L33), L38 `NextResponse.redirect`
  - `jam-web/src/app/api/strava/callback/route.ts` `GET()` L17-102 — L20 `const userId = searchParams.get('state')`, L26-32 오류·누락 리다이렉트, L67-78 `createServiceClient` upsert(`user_id: userId`, `onConflict: 'strava_athlete_id'`), L90 `syncStravaActivities(userId)`
  - `jam-web/src/lib/strava/oauthState.ts` — 신규
  - `jam-web/src/app/api/strava/auth/__tests__/route.test.ts`, `jam-web/src/app/api/strava/callback/__tests__/route.test.ts` — 신규(모킹 관례는 `jam-web/src/app/api/combine/__tests__/route.test.ts` 참고)
  - `docs/service/SERVICE_OPERATIONS.md` §3-1 「OAuth 연동 흐름」 L150-173
  - 참고만(고치지 않음): `jam-web/src/proxy.ts` L59-69 `publicPaths`(콜백은 공개 경로가 아니라 로그인 세션이 있어야 도달), `jam-web/src/lib/admin/auth.ts` L79-88 `timingSafeEqual`(비공개 함수, 같은 방식 참고용), `jam-web/src/lib/strava/sync.ts` L1172-1183(유저당 연결 행을 `.single()`로 읽음)

## 배경 / 문제 정의

### 확인한 사실 (2026-10-08 13:40경 KST, 코드 읽기와 읽기 전용 SQL)
- `auth/route.ts` L33은 Strava 인가 URL에 `state: user.id`(로그인 유저 UUID)를 넣는다. 주석은 "CSRF 방지"라고 적는다.
- `callback/route.ts` L20은 `searchParams.get('state')`를 그대로 `userId`로 쓴다. 이 라우트는 세션 유저를 조회하지 않는다. L68-78에서 서비스 클라이언트(RLS 우회)로 `strava_connections`에 `user_id: userId`를 upsert하고(충돌 기준 `strava_athlete_id`), L90에서 `syncStravaActivities(userId)`를 부른다.
- `proxy.ts`의 `publicPaths`에 `/api/strava/callback`이 없다. 그래서 콜백에 닿으려면 어떤 계정으로든 로그인돼 있어야 한다.
- 운영 DB의 `strava_connections` 제약은 `PRIMARY KEY (id)`, `UNIQUE (strava_athlete_id)`, `user_id` 외래 키 셋이다. `user_id`에는 유일 제약·유일 인덱스가 없다.
- `sync.ts` L1173-1183은 `.eq('user_id', userId).single()`로 연결 행을 읽고, 오류가 나면 "Strava 연동 정보 없음" 예외를 던진다.
- 운영 DB의 `strava_connections`는 4행·서로 다른 유저 4명이다. 한 유저에게 2행 이상 붙은 경우는 없다.
- Strava 인증 문서(developers.strava.com/docs/authentication)는 `state`를 "리다이렉트 URI에 그대로 돌려주는 값"으로만 설명하고 CSRF나 검증 방법은 적지 않는다.

### 판단
- 공격 경로(실행 검증은 하지 않음, 확신도 높음): 공격자가 자기 JAM 계정으로 로그인한 채, 자기 Strava로 받은 인가 `code`와 다른 유저 B의 UUID를 `state`에 넣은 콜백 URL을 열면 B 계정에 공격자의 Strava가 연결된다. 그 뒤 공격자의 활동이 B 계정으로 동기화된다.
- 피해: B가 이미 자기 Strava를 연결해 뒀다면 B에게 연결 행이 2개가 되어 `sync.ts`의 `.single()`이 실패한다. 그러면 B의 동기화가 멈추고 새 활동으로 배지를 받지 못한다. B가 연결하지 않은 상태였다면 공격자의 활동 기록이 B 계정에 쌓인다.
- `state`가 유저 UUID라서 OAuth의 CSRF 방어 역할도 하지 못한다. OAuth 2.0 권고(RFC 6749 §10.12, RFC 9700 §4.7)는 `state`를 유저의 브라우저 세션에 묶인 추측 불가능한 일회용 값으로 쓰라고 한다. 세션 대조만 하면 위 공격은 막지만, UUID를 아는 공격자가 피해자에게 조작한 콜백 링크를 열게 하는 경우(피해자 계정에 공격자 Strava 연결)는 막지 못한다. 그래서 둘 다 적용한다.
- 다른 유저 UUID를 얻는 경로(위험도 판정 근거, 코드와 읽기 전용 SQL로 확인): 로그인한 유저는 다른 유저의 UUID를 쉽게 얻는다. 대표 경로 셋은 다음과 같다. ① `/{username}` 프로필 페이지가 `targetUserId={target.id}`와 대상 유저 행 전체를 `'use client'` 컴포넌트 `ProfileClient`로 넘겨 RSC 페이로드에 실린다(`jam-web/src/app/(main)/[username]/page.tsx` L366-378) ② 커스텀 아바타 URL 경로가 `${user.id}/...`이고 버킷이 공개다(`jam-web/src/app/api/profile/avatar/route.ts` L57) ③ `user_follows`의 SELECT 정책이 `public` 역할에 `true`라서 로그인 없이도 팔로우 관계의 UUID를 나열할 수 있다(운영 DB `pg_policies`로 확인). 이 밖에 `/api/users/search`(이메일 검색으로 id 반환), 팔로워·팔로잉 API, 미션 참가자 상태 API도 UUID를 돌려준다.
- **위험도: 중단, 확신도 높음.** UUID를 얻는 데 특별한 조건이 없고, 콜백에 닿는 데 필요한 조건은 아무 계정으로나 로그인하는 것뿐이다. 실제 공격은 실행해 보지 않았다.
- 서비스 재설계 주제 12(다른 JAM 계정에 연결된 Strava를 연결할 때의 처리)와는 별개다. 이 티켓은 같은 Strava 계정이 다른 JAM 계정으로 옮겨 가는 기존 동작(`onConflict: 'strava_athlete_id'`)을 바꾸지 않는다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 인증 시작(`GET /api/strava/auth`)
  - 로그인 확인(L12-17)은 그대로 둔다.
  - CSPRNG로 128비트 이상의 무작위 값을 만들어 URL 안전 문자열로 쓴다. 이 값을 `state`로 보내고, 같은 값을 리다이렉트 응답에 쿠키로 심는다. 유저 UUID는 `state`나 인가 URL 어디에도 넣지 않는다.
  - 쿠키 속성: `httpOnly: true`, `sameSite: 'lax'`(Strava에서 돌아오는 최상위 GET 이동에 쿠키가 실려야 하므로 `strict`는 안 된다), `secure: process.env.NODE_ENV === 'production'`, `path: '/api/strava'`, `maxAge` 600초.
  - L33의 "CSRF 방지 — userId를 state로 전달" 주석은 실제 동작에 맞게 고친다.
- 콜백(`GET /api/strava/callback`)
  - 연결할 유저는 `createClient()`(`@/lib/supabase/server`)의 `auth.getUser()` 결과로 정한다. URL의 `state`를 유저 번호로 쓰지 않는다.
  - 처리 순서: ① Strava `error` 파라미터가 있으면 기존처럼 오류 리다이렉트 ② `code`나 `state`가 없으면 `reason=missing_params` ③ 쿠키 값이 없거나 `state`와 다르면 `reason=state_mismatch` ④ 세션 유저가 없으면 `reason=auth_required` ⑤ 그 뒤 기존 토큰 교환·암호화·upsert·동기화를 세션 유저 ID로 진행한다.
  - ③·④에 걸리면 Strava 토큰 교환(`fetch(STRAVA_TOKEN_URL)`), DB upsert, 동기화를 하나도 실행하지 않는다.
  - 쿠키와 `state` 비교는 상수 시간 비교로 하고, 둘 중 하나라도 비어 있으면 거부한다.
  - 성공·실패를 가리지 않고 콜백의 **모든 응답**에서 state 쿠키를 지운다(일회용). 지울 때도 같은 `path`를 쓴다.
  - ③·④ 거부 시 서버 로그를 한 줄 남긴다. 로그에 쿠키 값·`state` 값·`code` 값을 넣지 않는다.
  - L27의 `reason=${errorParam}`은 `encodeURIComponent`로 감싼다(Strava가 돌려주는 값을 그대로 쿼리에 이어 붙이지 않게).
  - 파일 머리 주석(L3 `state={userId}`)을 실제 동작에 맞게 고친다.
- 공용 도우미(`jam-web/src/lib/strava/oauthState.ts`, 신규): 쿠키 이름 상수, 수명(초) 상수, 쿠키 속성 객체, 값 생성 함수, 상수 시간 비교 함수를 둔다. 두 라우트가 같은 상수를 쓴다.
- 바꾸지 않는 것: 토큰 교환 요청 본문, 암호화, upsert 충돌 기준(`strava_athlete_id`), `backfill_completed`·`last_synced_at` 값, 동기화를 `await`하는 방식, 성공 리다이렉트(`/profile?strava=connected&reveal=1`), 스코프(`read,activity:read_all`). DB 스키마는 바꾸지 않는다.

### UI/UX 관점
- 화면 변경 없음. 새 `reason` 값(`state_mismatch`·`auth_required`)은 `/profile` 경유지가 그대로 넘기는 쿼리 값일 뿐이고, 사용자에게 보이는 새 문구는 만들지 않는다.

## 구현 계획
1. `jam-web/src/lib/strava/oauthState.ts`(신규, 30~40줄): `STRAVA_OAUTH_STATE_COOKIE`(예: `'strava_oauth_state'`), `STRAVA_OAUTH_STATE_MAX_AGE_SECONDS = 600`, 쿠키 속성 객체(위 속성), `createStravaOAuthState()`(`node:crypto`의 `randomBytes(32).toString('base64url')` 또는 Web Crypto `getRandomValues`), `isValidStravaOAuthState(cookieValue, stateParam)`(빈 값이면 false, 길이가 달라도 끝까지 도는 상수 시간 비교).
2. `auth/route.ts` L26-38: 값 생성 → `params`의 `state`에 넣음 → `const response = NextResponse.redirect(stravaAuthUrl)` → `response.cookies.set(쿠키 이름, 값, 속성)` → `return response`.
3. `callback/route.ts` L17-32: `state`를 `userId`가 아닌 이름(예: `stateParam`)으로 읽고, 쿠키는 `request.cookies.get(...)`로 읽는다. 모든 리다이렉트를 쿠키를 지우는 작은 함수 하나로 통일한다. 위 순서 ①~④를 L34 `try` 앞에 둔다. ④에서 얻은 `user.id`를 L69 `user_id`와 L90 `syncStravaActivities`에 쓴다.
4. 테스트(신규):
   - `callback/__tests__/route.test.ts`: (a) 쿠키 없음 → `state_mismatch`, 토큰 교환 `fetch`·upsert·동기화 미호출 (b) 쿠키와 `state` 불일치 → 같음 (c) 쿠키 일치·세션 없음 → `auth_required`, 같음 (d) 정상 → upsert의 `user_id`와 동기화 인자가 **세션 유저 ID**이고, `state`에 다른 UUID를 넣어도 세션 유저로 저장된다 (e) 위 모든 경우와 Strava `error` 경우에 응답이 state 쿠키를 지운다(`maxAge` 0 또는 만료) (f) `error` 값이 인코딩되어 리다이렉트 URL에 들어간다.
   - `auth/__tests__/route.test.ts`: (a) 비로그인 401은 그대로 (b) 리다이렉트 URL의 `state`가 유저 UUID가 아니고 쿠키 값과 같다 (c) 쿠키 속성이 `httpOnly`·`sameSite=lax`·`path=/api/strava`·`maxAge=600`이다 (d) 호출할 때마다 값이 다르다.
5. `docs/service/SERVICE_OPERATIONS.md` §3-1: `state=userId`를 "무작위 일회용 값 + `httpOnly` 쿠키, 콜백에서 쿠키 대조 후 세션 유저로 저장"으로 고치고, 콜백 URL 표기 `state={userId}`도 고친다.

## 완료 조건
- `GET /api/strava/auth`가 만든 Strava 인가 URL의 `state`는 유저 UUID가 아니며, 같은 응답이 그 값을 `httpOnly`·`sameSite=lax`·`path=/api/strava`·`maxAge=600` 쿠키로 심는다(auth 테스트 b·c·d).
- 콜백에서 쿠키가 없거나 `state`와 다르면 Strava 토큰 교환·`strava_connections` upsert·`syncStravaActivities`가 한 번도 호출되지 않고 `/profile?strava=error&reason=state_mismatch`로 간다(callback 테스트 a·b).
- 쿠키가 맞아도 세션 유저가 없으면 위 세 호출 없이 `reason=auth_required`로 간다(callback 테스트 c).
- 정상 경로에서 upsert의 `user_id`와 동기화 인자는 세션 유저 ID다. `state`에 다른 유저의 UUID 모양 값을 넣어도 결과가 같다(callback 테스트 d).
- 콜백의 모든 응답(Strava `error`, 누락, 불일치, 미로그인, 토큰 교환 실패, DB 오류, 성공)이 state 쿠키를 지운다(callback 테스트 e).
- 거부 로그에 쿠키 값·`state`·`code`가 들어가지 않는다(코드 확인).
- `docs/service/SERVICE_OPERATIONS.md` §3-1에 `state=userId` 서술이 남아 있지 않다.
- `scripts/verify.sh`가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 인증 시작: `state`를 유저 UUID 대신 256비트 무작위 값(`randomBytes(32)`, base64url 43자)으로 바꾸고, 같은 값을 `strava_oauth_state` 쿠키(`httpOnly`, `sameSite=lax`, `path=/api/strava`, `maxAge=600`, `secure`는 production만)로 심는다.
- 콜백: ① Strava `error` ② 누락 ③ 쿠키·`state` 상수 시간 대조(`state_mismatch`) ④ 세션 유저 확인(`auth_required`) ⑤ 기존 토큰 교환·upsert·동기화 순서로 바꿨다. `user_id`와 동기화 인자는 세션의 `user.id`에서만 온다. 모든 응답이 `redirectAndClearState` 한 곳을 지나며 쿠키를 지운다. 거부 로그에는 값을 남기지 않고, Strava `error` 값은 `encodeURIComponent`로 감쌌다.
- 공용 도우미 `jam-web/src/lib/strava/oauthState.ts`에 쿠키 이름·수명·속성·생성·비교를 모았다.
- 머지 뒤 카리나: `docs/agents/contract.json`의 `deploy_gate.public_routes`에서 `strava/callback`을 뺐다(콜백이 이제 세션을 확인하므로 공개 라우트 선언이 사실과 맞지 않음, 민지 범위 밖 발견물).

### 변경된 파일
```
jam-web/src/lib/strava/oauthState.ts                      (신규)
jam-web/src/app/api/strava/auth/route.ts
jam-web/src/app/api/strava/callback/route.ts
jam-web/src/app/api/strava/auth/__tests__/route.test.ts   (신규)
jam-web/src/app/api/strava/callback/__tests__/route.test.ts (신규)
docs/service/SERVICE_OPERATIONS.md                          (§3-1)
docs/agents/contract.json                                 (머지 뒤 카리나)
```
구현 커밋 `96d509fd6`, staging 머지 `9de1f57c7`, contract 정리 `5ae18c524`.

### 테스트 결과
- [x] 단위 테스트 22건 통과(callback: 쿠키 없음·빈 값·불일치·길이 차이·세션 없음에서 토큰 교환·upsert·동기화 미호출, 정상 경로는 세션 유저로 저장, 응답 8종 모두 쿠키 삭제, `error` 인코딩, 거부 로그 값 없음 / auth: 401 유지, state ≠ UUID, 쿠키 속성, production secure, 호출마다 다른 값). 대조 조건을 꺼 보면 거부 테스트 5건이 실패함(아현 뮤테이션 확인)
- [x] CI verify 성공(run 37730469118), `scripts/deploy-gate.mjs check`·`deploy-gate.test.mjs`·`check-contract.mjs` 통과
- [x] 민지 게이트 PASS(완료 조건 8개, 점검표 9번 보안 통과), 민지 보안 점검 모드 ② 악용 가능 문제 없음(참고 6건)
- [x] 카리나 로컬 실측(2026-10-08 14:17경 KST, 머지 결과 워크트리의 `next dev`, 개발용 로그인, curl): 인증 시작 307 → `www.strava.com/oauth/authorize`, state 43자, 인가 URL에 UUID 없음, `Set-Cookie`가 `Path=/api/strava; Max-Age=600; HttpOnly; SameSite=lax`이고 값이 state와 같음 / 받은 state + 가짜 code → `reason=token_exchange`(대조 통과 후 Strava가 code 거부), 쿠키 `Max-Age=0` / 같은 state 재사용 → `state_mismatch` / 새로 시작 후 UUID 모양 위조 state → `state_mismatch` / `error=access_denied%26strava%3Dconnected` → 인코딩된 채 `reason`에 들어감 / 서버 로그는 `콜백 거부: state_mismatch` 두 줄과 토큰 교환 실패 한 줄뿐이고 쿠키·state·code 값 없음
- [ ] 실제 Strava 계정으로 staging에서 연동 왕복(사용자 확인 권장, 카리나는 Strava 로그인 불가)

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 (Workflow wf_dab3a5c1-2b2) | 아현·민지(게이트) | 141,974 | 30,563 / 10,570 | 12분 21초 | 62 |
| 2 (민지 보안 점검 모드 ②) | 민지 | 72,861 | - / - | 3분 44초 | 18 |
| 합계 | 3회 호출 | 214,835 | 30,563 / 10,570 | 16분 5초 | 80 |

### 주요 의사결정 / 핵심 메모
- 세션 대조만 하는 안과 쿠키 일회용 값만 쓰는 안 중 하나만 고르지 않고 둘 다 적용했다. 세션 대조는 "공격자가 직접 콜백을 여는" 경로를, 쿠키 대조는 "피해자에게 조작한 콜백 링크를 열게 하는" CSRF 경로를 막는다. 서명(HMAC) 방식의 state는 새 비밀값이 필요해서 고르지 않았다(쿠키가 `httpOnly`이고 서버가 직접 심으므로 서명 없이도 충분하다).
- 1단계 규모 판정: 바뀌는 파일 6개(코드 2·신규 도우미 1·신규 테스트 2·문서 1), 테스트 포함 100줄 이상으로 계획 반환 기준을 넘는다. 보안 수정은 한 번에 들어가야 해서 쪼개지 않고, 파일 단위 구현 계획을 적은 뒤 첫 호출부터 면제를 넘겼다. 실제 변경은 jam-web 540줄·파일 6개였다.
- 아현 가정 2건(세션 확인을 `try` 맨 앞에 둠, 쿠키 속성을 함수로 둠)은 민지가 스펙 위반이 아니라고 판정했다.
- 보안 리뷰는 사용자 요청에 따라 게이트 뒤 민지 모드 ②를 티켓 범위(`7089b0c00..96d509fd6`)에 따로 적용했다.
- 오염 검사(`merge-base --is-ancestor`)는 실패했다. 리뷰 브랜치가 갈라진 뒤 다른 세션이 구상 문서 커밋 4개를 staging에 올렸기 때문이며, 브랜치에만 있는 커밋은 구현 커밋 하나이고 겹치는 파일은 없었다. 사용자에게 알리고 승인받아 머지했다.
- 위험도 판정에 쓴 조사(유저 UUID 노출 경로, Explore 서브에이전트)는 179,193토큰·7분 26초·도구 62회였다. 실행 지표 표에는 넣지 않았다.
- 세션 시작 직후 작업 워크트리가 지워져 있었다(P1 20261001_1143 재발, 그 티켓에 기록). 같은 경로에 다시 만들고 잠가서 진행했다.

### 잔여 이슈
- 정상 사용자가 연동에 실패할 수 있는 경우(민지 보안 점검 findings 3번, 감수하기로 함): 두 탭에서 동시에 연동을 시작하면 먼저 시작한 탭이 실패한다. 배포 순간 이미 Strava 화면에 있던 사용자는 한 번 실패한다. 시작 브라우저와 콜백 브라우저가 다르면 실패한다(수정 전에도 콜백이 로그인 세션을 요구해 대부분 실패했다).
- 범위 밖 발견물 티켓: P0 20261008_1354(프로필 페이지 데이터 노출), P2 20261008_1355(`user_follows` anon 공개), P3 20261008_1356(`poi_drops` 직접 조회), P3 20261008_1409(Strava 실패 로그), P3 20261008_1413(state 쿠키를 유저에 묶는 추가 강화, `error` 분기 쿠키 삭제, 환경변수 누락 시 500).
- 민지 보안 점검의 staging 개발용 로그인 관찰은 기존 설계(`jam-web/src/lib/admin/auth.ts` 주석: staging에서 그 계정은 관리자가 될 수 없음)와 P3 20261007_0955(요청 횟수 제한)가 다루고 있어 새 티켓을 만들지 않았다.
