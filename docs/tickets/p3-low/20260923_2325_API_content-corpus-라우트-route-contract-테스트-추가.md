---
id: "20260923_2325"
category: API
priority: P3
status: OPEN
created: 2026-09-23
closed:
parent: "20260923_2252"
related:
  - "20260923_2256"
---

# [API] content-corpus 어드민 읽기 라우트에 route-contract 테스트 추가

> 티켓 20260923_2256 게이트 리뷰(민지)의 범위 밖 발견물 [보안/참고]에서 자동 생성. 우선순위는 신호 등급(참고)에 따라 P3.

## 핵심 요약

- 요구사항: `jam-web/src/app/api/admin/content-corpus/route.ts`에 `kpi/weekly`·`badges` 라우트와 같은 route-contract 테스트(GET 전용 export, `requireAdminRead` 호출, `requireAdmin` 미혼용)를 추가한다. 인증 경로가 실수로 느슨해져도 CI가 잡게 한다.
- 구현 계획: 기존 route-contract 테스트 파일의 패턴을 그대로 복제해 라우트 1개를 추가한다.
- 관련 파일: `jam-web/src/app/api/admin/content-corpus/route.ts`, 기존 계약 테스트(`jam-web/src/app/api/admin/kpi/weekly/` 또는 `jam-web/src/lib/admin/__tests__/`에서 `requireAdminRead` 검색), `jam-web/src/lib/admin/auth.ts` `requireAdminRead`(83행).

## 배경 / 문제 정의

민지 지적: content-corpus 라우트는 `requireAdminRead`로 인증하지만 그 계약을 고정하는 테스트가 없다. 코드베이스 전역 관례는 아니지만(drop-policy·missions·users 라우트도 없음), 자동화 예약 세션이 읽는 라우트라 인증 경로 보호 가치가 있다.

## 완료 조건

- content-corpus 라우트의 route-contract 테스트가 추가되어 `scripts/verify.sh`에서 통과한다.
- 테스트가 GET 전용 export·`requireAdminRead` 호출·`requireAdmin` 미혼용 세 가지를 확인한다.

크기 상한: 파일 1~2개, 30줄 이내(경로 ① 경미 가능).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
