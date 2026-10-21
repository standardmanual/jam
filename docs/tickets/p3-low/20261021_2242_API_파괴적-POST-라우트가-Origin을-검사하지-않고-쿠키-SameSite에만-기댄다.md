---
id: "20261021_2242"
category: API
priority: P3
status: OPEN
created: 2026-10-21
parent: "20261021_1249"
---

# [API] 파괴적 POST 라우트가 Origin을 검사하지 않고 쿠키 SameSite에만 기댄다

## 핵심 요약

- 요구사항: 티켓 `20261021_1249` 3회가 만든 `POST /api/account/delete`는 쿠키 세션으로만 인증하고 요청의 `Origin`을 검사하지 않는다. 같은 패턴이 `api/strava/disconnect`, 어드민 삭제 같은 다른 파괴적 라우트에도 있다. 쿠키가 `SameSite=Lax`라면 다른 사이트의 `POST`에는 실리지 않으므로 지금은 막혀 있다고 보이지만, 이를 코드로 고정한 곳이 없다. 파괴적 라우트에 `Origin` 검사를 공통으로 둘지 정한다.
- 구현 계획: ① 세션 쿠키의 `SameSite` 값을 확인한다(Supabase SSR 기본값, `src/lib/supabase/server.ts`와 `proxy.ts`). ② 파괴적 `POST`(탈퇴, 연결 끊기, 어드민 삭제·일괄 작업)를 모아 공통 `Origin` 검사 함수를 만들지 정한다. ③ 하지 않기로 하면 «SameSite=Lax에 의존한다»를 `docs/service/prd/`의 보안 서술에 한 줄로 적고 닫는다.
- 관련 파일: `jam-web/src/app/api/account/delete/route.ts` 24줄 근처(민지 보고, 카리나가 직접 확인하지는 않았다), `jam-web/src/app/api/strava/disconnect/route.ts`, `jam-web/src/lib/supabase/server.ts`.

## 배경 / 문제 정의

티켓 20261021_1249 3회 게이트(민지, 참고)가 발견했다. 확신도는 낮다. 3회가 새로 만든 문제가 아니라 기존 패턴이다.

발견: 2026-10-21 티켓 20261021_1249 3회 게이트.

## 상세 요구사항

### 서비스/코드베이스 관점

- 검사를 더하더라도 같은 사이트의 정상 요청과 시험 환경의 요청은 통과한다.

## 완료 조건

- [ ] 공통 검사를 두거나, 두지 않는 이유가 문서에 있다

## 진행 기록

## 잔여 이슈
