---
id: 20260827_008
category: Service
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [Service] 인증 미들웨어(proxy.ts) publicPaths startsWith 접두어 오매칭 선제 수정

## 배경 / 문제 정의
같은 날 이미 두 차례 동일 패턴의 버그가 발견·수정됐다: 어드민 사이드바 `isNavItemActive`
(티켓 `20260827_003`, `/admin/points`가 `/admin/poi`의 문자열 접두어로 오매칭)와 서비스
탭바 `isActive`(티켓 `20260827_006`). 후자의 완료 기록 "잔여 이슈"에 `jam-web/src/proxy.ts`가
동일 패턴의 위험을 안고 있다고 명시적으로 남겨져 있어, 이번 티켓에서 처리한다.

`jam-web/src/proxy.ts:56`의 `publicPaths.some(p => pathname.startsWith(p))`는 인증 우회
대상 화이트리스트(`/login`, `/auth/callback`, `/forbidden`, `/api/dev-login`, `/spike`,
`/api/cron`)를 판정하는 로직인데, 단순 `startsWith` 접두어 매칭을 쓴다. 이번엔 탭 하이라이트가
아니라 **인증 우회 여부를 결정하는 보안 관련 코드**라서 더 민감하다.

현재 `jam-web/src/app/` 라우트 트리를 전수 확인한 결과 실제로 오매칭되는 라우트는 없다
(예: `/login-history`, `/forbidden-x` 같은 라우트 부재). 다만 향후 새 라우트가 `publicPaths`
나열 값들의 접두어가 되는 이름으로 추가되면(예: `/login-attempts`, `/spike-old`) 의도치 않게
"공개 경로"로 오매칭되어 인증 체크를 건너뛸 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `publicPaths` 6개 항목의 의도를 먼저 구분한다:
  - **정확 매칭 대상** (하위 라우트 없음, 오케스트레이터가 `src/app/` 트리 확인 완료):
    `/login`, `/auth/callback`, `/forbidden`, `/api/dev-login`
  - **하위 경로 포함이 의도인 대상** (실제 하위 라우트 존재):
    `/spike` (`/spike/background-generator`, `/spike/background-generator/kaleidoscope`,
    `/spike/badge-reveal`), `/api/cron` (`/api/cron/ambient-drop`, `/api/cron/notifications`,
    `/api/cron/poi-cleanup`)
  - → 무조건 전체를 정확매칭으로 바꾸면 `/spike`·`/api/cron` 하위 라우트가 인증에 걸려
    깨진다 (특히 `/api/cron`은 티켓 `20260825_003` 사고 재발 — Vercel cron이 세션 쿠키 없이
    호출하는데 미들웨어에서 걸러지면 307 리다이렉트되어 cron이 조용히 실패한다).
- `isNavItemActive`(티켓 003)·`TabBar.isActive`(티켓 006)와 동일한 안전 패턴
  `pathname === p || pathname.startsWith(p + '/')`을 `publicPaths` 판정에 적용한다.
  이 패턴은 정확 매칭 대상(하위 라우트가 실제로 없으므로 결과적으로 정확 매칭과 동일하게
  동작)과 하위 경로 포함 대상(해당 서브트리는 계속 매칭) 양쪽을 **하나의 로직으로 동시에
  올바르게 커버**하므로, 항목별로 분기(`exact` 플래그 등)를 따로 둘 필요가 없다.
- 기존 주석(`/spike`, `/api/cron` 관련 설명)은 그대로 유지한다.

## 구현 계획
- `jam-web/src/proxy.ts:56`의
  `const isPublicPath = publicPaths.some((p) => pathname.startsWith(p))`를
  `const isPublicPath = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))`로
  변경한다.
- 변경 파일: `jam-web/src/proxy.ts` (1줄)
- 영향 범위: 인증 미들웨어 전체 요청 경로에서 실행되므로, 화이트리스트에 속한 6개 경로와
  그 하위 경로가 여전히 인증 없이 통과되는지, 그 외 경로는 여전히 `/login`(또는 `/api/dev-login`)
  으로 리다이렉트되는지 검증이 필요하다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`jam-web/src/proxy.ts:56`의 `publicPaths.some((p) => pathname.startsWith(p))`를
`publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))`로 변경. 티켓에
기록된 구현 계획을 그대로 반영했으며, 항목별 분기(`exact` 플래그 등) 없이 단일 로직으로
정확 매칭 대상(`/login`, `/auth/callback`, `/forbidden`, `/api/dev-login`)과 하위 경로
포함 대상(`/spike`, `/api/cron`)을 동시에 올바르게 커버함을 확인했다. 기존 주석(`/spike`,
`/api/cron` 관련 설명)은 그대로 유지.

### 변경된 파일
```
jam-web/src/proxy.ts (1줄)
```

### 테스트 결과
- [x] Node 스크립트로 21개 케이스(정확 매칭 대상 6개: 정상/오매칭 후보, 하위경로 포함
  대상의 루트·1단계·2단계 하위 경로, 오매칭 후보 `/spike-old`·`/api/cron-legacy` 등) 검증 —
  전체 통과. 특히 `/login-history`, `/forbidden-x`, `/api/dev-login-extra`, `/spike-old`,
  `/api/cron-legacy` 등 접두어 오매칭 후보가 모두 `false`(공개 경로 아님)로 정확히 판정됨을
  확인.
- [x] `src/app/` 라우트 트리 재확인 — `/login`, `/auth/callback`, `/forbidden`, `/api/dev-login`은
  하위 라우트 없음. `/spike`, `/api/cron`은 각각 하위 라우트가 실제로 존재(`spike/`,
  `api/cron/*`)하며 변경 후에도 정상 매칭됨을 확인.
- [ ] 실제 배포 환경(staging/production)에서의 수동 확인은 미실시 (미들웨어 전역 로직이라
  로컬 재현이 배포 환경과 동일하며, 리뷰 단계에서 필요시 추가 확인 권장)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 (로직 변경만, 사용자 노출 텍스트 없음)

### 배포 정보
- 배포일: staging 2026-08-27 (프로덕션 반영은 `/jam-ship`으로 별도 진행)
- 환경: staging
- 커밋: (staging 머지 커밋 참조)

### 주요 의사결정 / 핵심 메모
- 티켓에 기록된 조사 결과·구현 계획을 그대로 따랐으며 추가 판단이 필요한 부분은 없었다.
- 항목별로 정확매칭/하위경로매칭을 분기하지 않고 `pathname === p || pathname.startsWith(p + '/')`
  단일 패턴으로 처리 — 티켓 20260827_003(`isNavItemActive`)·20260827_006(`TabBar.isActive`)과
  동일한 패턴으로 통일되어 코드베이스 전반의 "활성/공개 경로 판정" 로직 일관성도 확보됨.
- **티켓 번호 재부여**: 최초 `20260827_007`로 생성했으나, 구현 진행 중 다른 세션이 동일 번호
  (`20260827_007_API_SERVICE_OPERATIONS-어드민API-HTTP메서드-표기오류-정정`, 무관한 작업)를
  먼저 staging에 병합해 `20260827_008`로 재번호했다. 구현 커밋 메시지에는 원래 번호(007)가
  남아있다. 티켓 006에서도 동일한 충돌이 두 차례 있었던 것으로 보아, 여러 `/jam-work` 세션이
  동시에 도는 동안 티켓 번호 충돌이 반복되는 구조적 문제로 보인다.

### 잔여 이슈
- 없음
- (범위 밖, 게이트 리뷰 sideFinding) `jam-web/src/proxy.ts:75`의 어드민 경로 보호 로직
  (`pathname.startsWith('/admin')`)도 동일 계열의 접두어 패턴이다. 실패-안전(fail-safe) 방향이라
  보안 결함은 아니지만, 향후 `/administrator` 류 라우트가 추가되면 스타일 통일 검토 여지가 있다.
