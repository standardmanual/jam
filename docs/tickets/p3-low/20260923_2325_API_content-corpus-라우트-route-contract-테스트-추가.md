---
id: "20260923_2325"
category: API
priority: P3
status: CLOSED
created: 2026-09-23
closed: 2026-09-24
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
## 완료 기록

### 구현 내용 요약
content-corpus 어드민 읽기 라우트의 route-contract 테스트를 추가했다. 라우트 소스를 정적으로 읽어 (1) GET만 export하고 POST/PUT/PATCH/DELETE는 export하지 않음 (2) `@/lib/admin/auth`의 `requireAdminRead`를 import해 `await requireAdminRead(req)`로 호출함 (3) 세션 전용 `requireAdmin()`을 섞어 쓰지 않음을 확인한다. `kpi/weekly` 계약 테스트 패턴을 따랐다.

### 변경된 파일
```
jam-web/src/app/api/admin/content-corpus/__tests__/route-contract.test.ts (신규 38줄)
```

### 테스트 결과
- [x] CI `verify` 성공(run 35924003812, 커밋 79a05505)
- [x] 민지 게이트 PASS. 신규 테스트 3건 통과
- [x] 병합 뒤 통합 `verify.sh` 전항목 통과

### 배포 정보
- 배포일: 2026-09-24 (staging 반영. 프로덕션은 `/jam-ship` 때)
- 환경: staging
- 커밋: 79a05505(브랜치), 병합 커밋 221a0538

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지(2명) | 60,376 | 35,572 / 14,512 | 약 7분 | 24 |
| 합계 |  | 60,376 | 35,572 / 14,512 | 약 7분 | 24 |

### 주요 의사결정 / 핵심 메모
- 크기 상한 30줄을 8줄 넘겼다(헤더 주석과 파일 읽기·주석 제거 보일러플레이트, 파일 1개). 게이트는 영향 없다고 판정했다.
- 개인 식별 정보 검사는 kpi 전용 항목이라 복제하지 않았다.

### 잔여 이슈
- 없음.
