---
id: "20260924_1639"
category: Infra
priority: P2
status: OPEN
created: 2026-09-24
closed:
related:
  - "20260924_0951"
  - "20260924_0916"
---

# [Infra] 클라이언트 컴포넌트가 서버 전용 모듈을 가져오는 빌드 오류를 CI가 잡지 못한다

## 핵심 요약

- 요구사항: `'use client'` 파일이 값 import를 따라가다 서버 전용 모듈(`next/headers`를 쓰는 `lib/supabase/server.ts`, `lib/admin/auth.ts` 등)에 닿으면 `scripts/verify.sh`가 실패하게 한다.
- 구현 계획: 클라이언트 파일에서 시작해 `import type`을 뺀 값 import만 따라가며 서버 전용 모듈 도달 여부를 검사하는 스크립트를 만들고 `verify.sh`에 넣는다. 서버 전용 모듈 목록은 한 곳에 둔다. 카리나가 통합 실측 중에 쓴 임시 스크립트(같은 논리)를 출발점으로 삼는다.
- 관련 파일: `scripts/verify.sh`, `jam-web/src/lib/supabase/server.ts`, `jam-web/src/lib/admin/auth.ts`

## 배경 / 문제 정의

어드민 목록 공통화 통합(2026-09-24)에서 `UsersFilterBar`(클라이언트)가 `lib/admin/user-list.ts`의 정렬 상수를 값으로 가져왔고, 그 파일이 서버 전용 `./auth`를 import했다. `next dev`에서 `/admin/users`·`/admin/abusing`이 500이 났고, `next build`도 실패했을 것이다. 그런데 `scripts/verify.sh`(lint·타입 검사·단위 테스트·문서 검사)와 CI는 모두 통과했다. 아현·민지 게이트도 각 티켓에서 통과시켰다. 로컬 실렌더 중에야 드러났다. 이런 오류는 화면을 실제로 렌더하거나 빌드해야만 잡힌다.

## 완료 조건

- 서버 전용 모듈에 닿는 클라이언트 파일이 있으면 검사가 실패하고, 도달 경로(파일 → … → 서버 전용 모듈)를 출력한다.
- `import type`·`{ type X }`만 가져오는 경우는 통과한다(단위 테스트).
- 이번 사례(`UsersFilterBar → user-list → auth`)를 재현하는 픽스처가 실패로 판정된다(단위 테스트).
- `scripts/verify.sh`가 이 검사를 포함하고, 현재 저장소에서 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
