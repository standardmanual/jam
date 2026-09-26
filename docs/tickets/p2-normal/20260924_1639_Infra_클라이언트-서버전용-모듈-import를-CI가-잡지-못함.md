---
id: "20260924_1639"
category: Infra
priority: P2
status: CLOSED
created: 2026-09-24
closed: 2026-09-26
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
- 묶음 티켓 20260926_1239로 처리했다. 상세와 실행 지표는 그 티켓의 완료 기록에 있다.
- 신규 `scripts/check-client-server-imports.mjs`: `jam-web/src`(와 design-system)에서 첫 문장이 `'use client'`인 파일을 시작으로 값 import(`import type`·`{ type X }`만 있는 것과 `export type` 제외)만 따라가, 서버 전용 모듈에 닿으면 최단 경로를 `→`로 출력하고 종료 코드 1로 끝낸다. 서버 전용은 파일 위쪽 `SERVER_ONLY_MODULES` 상수(`lib/supabase/server.ts`, `lib/admin/auth.ts`)와 `next/headers`·`server-only`를 import하는 파일이다. `@/`·`@ds/` 별칭과 상대경로를 해석한다.
- `scripts/verify.sh`에 `client-server-imports` 단계를 추가했다.

### 변경된 파일
```
- scripts/check-client-server-imports.mjs (신규)
- scripts/check-client-server-imports.test.mjs (신규)
- scripts/verify.sh
```

### 테스트 결과
- [x] 단위 테스트: `UsersFilterBar → user-list → auth` 재현 픽스처가 3단계 경로로 실패 판정, `import type`·`{ type X }`만이면 통과, 혼합·여러 줄 import 파싱, 서버 컴포넌트는 대상 아님, `next/headers`·`server-only` 자동 판정, 순환 import 종료
- [x] 현재 저장소(945개 파일, 클라이언트 243개, 값 import 1,608건)에서 위반 0건 통과. 가짜 클라이언트 파일이 `auth`를 값 import하는 프로브를 넣으면 경로를 출력하고 종료 코드 1이 되는 것을 게이트가 확인했다. 병합 뒤 통합본에서도 통과

### 잔여 이슈
- 정규식 기반이라 문자열·템플릿 안의 줄 첫머리 `import` 문은 오탐할 수 있고 동적 `import()`는 따라가지 않는다(정적 도달만). 현재 저장소에서는 발생하지 않는다(후속 티켓).
