---
id: "20261008_1355"
category: Infra
priority: P2
status: OPEN
created: 2026-10-08
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
