---
id: "20261008_1355"
category: Infra
priority: P2
status: CLOSED
created: 2026-10-08
closed: 2026-11-09
---

# [Infra] user_follows 읽기 정책이 비로그인(anon)에도 전체 행을 공개한다

## 핵심 요약
- 요구사항: `user_follows`의 SELECT 정책을 서비스가 실제로 필요한 범위로 줄인다. 최소한 anon 역할이 전체 팔로우 관계(`follower_id`·`following_id`)를 나열하지 못하게 한다.
- 구현 계획: (미정 — 착수 시 작성) 앱이 브라우저 클라이언트로 `user_follows`를 직접 읽는 곳이 있는지 먼저 확인하고, 없으면 정책을 `authenticated` + 본인 관련 행으로 좁히는 마이그레이션을 쓴다(DB 변경은 사용자 승인 후 카리나가 실행).
- 관련 파일: `jam-web/supabase/migrations/021_follows.sql` L19-21(`"Anyone can view follows" ... FOR SELECT USING (true)`) / 서버 쪽 조회: `jam-web/src/app/api/users/[username]/followers/route.ts`, `following/route.ts`, `jam-web/src/app/(main)/[username]/page.tsx`

## 배경 / 문제 정의

### 확인한 사실 (2026-10-08 13:50경 KST, 읽기 전용 SQL)
- 운영 DB `pg_policies`: `user_follows`의 `"Anyone can view follows"`는 `cmd=SELECT`, `roles={public}`, `qual=true`다. `public` 역할에는 anon도 포함된다.
- 티켓 20261008_1349(Strava OAuth state) 조사 중 유저 UUID 노출 경로로 발견했다.

### 판단
- anon 키(브라우저에 공개된 값)만 있으면 로그인 없이 PostgREST로 전체 소셜 그래프의 UUID를 나열할 수 있다(확신도 높음, 직접 호출은 해 보지 않음).
- 1349 수정 뒤에는 UUID를 알아도 Strava 연결 공격에 쓸 수 없으므로 단독 위험은 개인정보 노출(누가 누구를 팔로우하는지)이다. **위험도: 주의, 확신도 높음.**

## 완료 조건
- (착수 시 구체화) anon 키로 `user_follows`를 select하면 행이 나오지 않는다.
- 팔로워·팔로잉 화면과 API, 프로필의 팔로우 상태 표시가 그대로 동작한다.

---
## 완료 기록

### 구현 내용 요약
`user_follows`의 읽기 정책 «Anyone can view follows»(모든 역할, 조건 없음)를 지우고, 로그인한 사용자(authenticated)만 읽는 «Authenticated can view follows»를 만들었다. 이제 비로그인 상태로는 팔로우 관계를 나열할 수 없다. 티켓의 구현 계획은 «본인 관련 행»으로 좁히는 것이었으나, 팔로워·팔로잉 목록 화면(`followers/page.tsx`, `following/page.tsx`, `feed/page.tsx`)이 로그인 세션 키로 다른 유저의 행을 읽으므로 그대로 좁히면 목록이 비게 된다. 그래서 로그인 사용자 전체로 좁히는 데서 멈췄다. 사용자가 2026-11-09 질문 팝업에서 «정책을 좁힌다»를 선택했다.

### 변경된 파일
```
jam-web/supabase/migrations/333_user_follows_select_authenticated_only.sql
jam-web/supabase/migrations/333_user_follows_select_authenticated_only_down.sql (되돌림)
```

### 테스트 결과
- [x] 롤백 드라이런(DO 블록 + RAISE): 전체 9행, 비로그인(anon) 0행, 로그인(authenticated) 9행.
- [x] 실행 직후 읽기 전용 확인: `pg_policies`에 «Authenticated can view follows»(SELECT, authenticated)만 남고 INSERT·DELETE 정책은 그대로.
- [ ] 로그인 상태로 팔로워·팔로잉 화면을 열어 확인하지는 않았다(해당 코드는 모두 로그인하지 않으면 /login으로 보낸다).

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 카리나 직접 (경미 수정) | - | - / - | - | - |
| 합계 |  | - | - / - | - | - |

### 주요 의사결정 / 핵심 메모
- 공용 DB라 실행 즉시 프로덕션에 반영됐다. 되돌림은 위 `_down` 파일이다.
- 팔로우한 사람 수·팔로워 수를 세는 서버 코드(랭킹, 배지, 알림, 오늘의 현황)는 서버 키로 읽는지 로그인 세션 키로 읽는지를 하나씩 확인하지 않았다. 로그인 세션으로 읽는 곳은 영향이 없고, 비로그인 상태로 읽는 곳이 있으면 비게 된다.

### 잔여 이슈
- 비로그인 상태로 이 표를 읽는 코드가 있는지(예: 예약 작업이 anon 키를 쓰는 경우)는 후속 점검 대상이다.
