---
id: "20261008_1409"
category: Service
priority: P3
status: OPEN
created: 2026-10-08
---

# [Service] Strava 토큰 교환·API 실패 로그가 응답 본문을 그대로 남긴다

## 핵심 요약
- 요구사항: Strava 응답이 실패일 때 서버 로그에 응답 본문 전체를 남기지 않고, 원인 파악에 필요한 값(상태 코드, Strava 오류 필드 이름 등)만 남긴다. 본문에 민감한 값이 실릴 수 있는지 먼저 확인한다.
- 구현 계획: (미정 — 착수 시 작성) Strava 오류 응답 형식을 확인한 뒤, 실패 로그를 상태 코드와 오류 필드 요약으로 줄이는 공용 함수를 두는 방향.
- 관련 파일: `jam-web/src/app/api/strava/callback/route.ts` L84-86(`tokenRes.text()`를 `console.error`로 출력, 커밋 `96d509fd6` 기준) / 같은 패턴: `jam-web/src/lib/strava/api.ts` L60·L127·L155·L251(`res.text()`)

## 배경 / 문제 정의

### 확인한 사실 (2026-10-08 14:09 KST, 코드 읽기)
- 콜백의 토큰 교환이 실패하면 `const body = await tokenRes.text()` 후 `console.error('[JAM! Strava] 토큰 교환 실패:', body)`로 본문을 그대로 출력한다.
- `lib/strava/api.ts`에도 실패 응답 본문을 `res.text()`로 읽는 곳이 네 군데 있다(출력 방식은 확인하지 않았다).
- 티켓 20261008_1349(Strava OAuth state) 게이트 리뷰에서 민지가 범위 밖 발견물 `[보안/참고]`로 지적했다.
- 같은 콜백의 `console.error('[JAM! Strava] strava_connections upsert 오류:', upsertError)`(커밋 `96d509fd6` 기준 L118)는 오류 객체 전체를 출력한다. Postgres 제약 위반이면 `details`에 행 값(암호화된 토큰 문자열)이 실릴 수 있다(민지 보안 점검 모드 ②, 확신도 낮음).

- 2026-10-08 14:17경 KST 로컬 실측(티켓 1349 검증 중 가짜 code로 토큰 교환): 로그에 찍힌 Strava 응답 본문은 `{"message":"Bad Request","errors":[{"resource":"AuthorizationCode","field":"code","code":"invalid"}]}`였고 비밀값은 없었다. 다른 실패 유형(만료 토큰 갱신 실패 등)의 본문은 확인하지 않았다.

### 판단
- 실패 응답에 토큰이 실릴 가능성은 낮다고 본다. 잘못된 code 응답에는 비밀값이 없었지만, 다른 실패 유형은 확인하지 않았다. 로그는 Vercel에 보관되므로 필요 이상의 외부 응답을 남기지 않는 편이 낫다. **위험도: 참고, 확신도 낮음.**

## 완료 조건
- (착수 시 구체화) Strava 실패 로그에 응답 본문 전체가 출력되지 않고, 상태 코드와 오류 요약으로 원인을 구분할 수 있다.
