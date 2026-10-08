---
id: "20261008_1413"
category: API
priority: P3
status: OPEN
created: 2026-10-08
---

# [API] Strava OAuth state 쿠키를 로그인 유저에 묶고 콜백의 남은 약점을 정리한다

## 핵심 요약
- 요구사항: 티켓 20261008_1349가 넣은 state 쿠키를 로그인 유저에 묶어, 다른 경로로 피해자 브라우저에 쿠키를 심는 공격(쿠키 토싱 등)이 생겨도 공격자의 code·state 쌍이 피해자 세션에 붙지 않게 한다. 같은 콜백에 남은 참고 수준 약점 두 가지도 함께 정리한다.
- 구현 계획: (미정 — 착수 시 작성) state 쿠키 값에 서버 비밀값으로 만든 유저 ID 서명(HMAC)을 함께 담고, 콜백이 세션 유저로 서명을 다시 계산해 대조하는 방향. 새 비밀값이 필요한지, 기존 환경변수를 쓸지 정한다.
- 관련 파일: `jam-web/src/lib/strava/oauthState.ts`(커밋 `96d509fd6` 기준 L18-50), `jam-web/src/app/api/strava/auth/route.ts` L49, `jam-web/src/app/api/strava/callback/route.ts` L32-60

## 배경 / 문제 정의

### 확인한 사실 (2026-10-08 14:13 KST, 민지 보안 점검 모드 ② 결과와 코드 읽기)
- 1349의 state 쿠키는 `httpOnly`·`sameSite=lax`·`path=/api/strava`·`maxAge=600`이고 Domain 속성이 없는 host-only 쿠키다. 값은 256비트 무작위 값이며 유저나 세션에 묶여 있지 않다.
- 콜백의 Strava `error` 분기와 `code`/`state` 누락 분기는 state 대조 전에 쿠키를 지운다(L46-52).
- `NEXT_PUBLIC_BASE_URL`이 비어 있으면 `redirectAndClearState`가 상대 URL로 `NextResponse.redirect`를 불러 예외가 나는데, 이 함수가 `try` 밖(L47·L51·L59)에서도 호출된다. 1349 이전부터 같은 구조였다. 프로덕션·staging에는 값이 설정돼 있다.

### 판단
- 쿠키 토싱: 형제 서브도메인(예: `stage.j-a-m.app`)이나 XSS로 `Domain=j-a-m.app` 쿠키를 심을 수 있게 되면, 공격자가 자기 state 값을 피해자 쿠키에 넣고 자기 code로 콜백을 열게 해서 피해자 계정에 자기 Strava를 붙일 수 있다. 지금 코드에는 외부 입력으로 쿠키를 심는 경로가 없어서 현재 악용 가능성은 낮다. **위험도: 참고, 확신도 보통.**
- `error` 분기의 쿠키 삭제: 로그인한 피해자를 `/api/strava/callback?error=x` 링크로 보내면 진행 중인 연동이 실패한다. 방해 수준이고 기밀성 영향은 없다. **위험도: 참고, 확신도 높음.**
- 환경변수 누락 시 500: 설정이 빠지는 사고가 없으면 드러나지 않는다. **위험도: 참고, 확신도 높음.**

## 완료 조건
- (착수 시 구체화) 다른 유저 세션에서 만든 state 쿠키·state 쌍으로는 콜백이 토큰 교환까지 가지 않는다는 것을 테스트로 확인한다.
