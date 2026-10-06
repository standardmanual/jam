---
id: "20261006_1527"
category: Infra
priority: P1
status: CLOSED
created: 2026-10-06
closed: 2026-10-06
---

# [Infra] staging 자동 로그인 계정이 관리자라 누구나 공용 DB 어드민을 쓸 수 있었다

## 핵심 요약

- 요구사항: stage.j-a-m.app의 자동 로그인 계정이 다시 관리자가 되지 못하게 코드로 막고, staging 어드민 확인에 기대던 문서·절차를 현재 상태로 고친다. 응급 조치(dev-tester `is_admin = false`)는 2026-10-06 15:12 KST에 했다.
- 구현 계획: 아래 「구현 계획」(파일 단위). 유형 `bug`. Vercel 배포 보호는 이번 범위가 아니다(사용자 결정 사항으로 남김).
- 관련 파일: `jam-web/src/lib/admin/auth.ts`(`hasAdminAccess`), `jam-web/src/app/api/dev-login/route.ts`(`DEV_USER_EMAIL` 19행), `jam-web/src/proxy.ts`(89–91행 자동 로그인), `jam-web/supabase/migrations/seed_dev_tester_not_admin.sql`, `docs/specs/DEV_PROCESS_GUARDRAILS.md` 패턴 13

## 배경 / 문제 정의

2026-10-06 `/jam-ship`(origin/main daf6db727 → 565c3067b) 5단계 병렬 점검(민지 모드 ② 3번 [보안/참고])에서 짚었고 카리나가 확인했다. 확인한 사실: dev-tester가 `users.is_admin = true`였다. jam-stage에는 Vercel 접근 보호가 없어 쿠키 없는 요청이 `/` → `/api/dev-login`(307)으로 가고 dev-tester의 Supabase 세션 쿠키를 받았다. 그 상태에서 `/admin` 대시보드가 열렸다. jam-stage에는 `ADMIN_EMAILS`가 없다. DB는 staging·프로덕션 공용이다.

사용자 승인으로 15:12 KST에 `is_admin = false`로 바꿨고(seed 파일에 기록), 그 뒤 staging `/admin`은 `/forbidden`(「접근 권한 없음」)이다. 9월 중순부터 staging 어드민 미리보기(예: 온보딩 퀘스트 미리보기, 티켓 20260927_2123)가 이 자동 로그인에 기대어 왔으므로 그 확인 경로는 이제 쓸 수 없다.

## 구현 계획

> 2026-10-06 카리나 규모 사전 판정: 코드 2~3·테스트 1·문서 1파일, 약 100줄. 아래 표에 파일·함수·줄 위치가 있어 첫 호출부터 계획 반환 면제로 진행한다.

| 경로 | 위치 | 변경 |
|---|---|---|
| `jam-web/src/lib/env/test-accounts.ts` | `TEST_ACCOUNT_USER_IDS` 25–34 | dev-login 계정의 user id(`00000000-0000-0000-0000-000000000001`)와 이메일(`dev-tester@jam.local`)을 이름 붙은 상수로 내보내고, 배열은 그 상수를 쓴다 |
| `jam-web/src/app/api/dev-login/route.ts` | `DEV_USER_EMAIL` 19 | 위 공용 상수를 쓴다(하드코딩 위치 하나로) |
| `jam-web/src/lib/admin/auth.ts` | `hasAdminAccess` 33–42 | 맨 앞에서 `STAGING_MODE === 'true'`이고 대상이 dev-login 계정(id 또는 이메일)이면 `false`. `ADMIN_EMAILS`·`users.is_admin`보다 먼저 본다. 로컬 개발(`NODE_ENV=development`, `STAGING_MODE` 없음)은 지금처럼 `ADMIN_EMAILS` 셸 변수로 관리자가 될 수 있다(패턴 13 유지). `isAdminAccount`(유저 일괄 처리의 자동 제외용)는 바꾸지 않는다 |
| 새 `jam-web/src/lib/admin/__tests__/auth.test.ts` | — | staging + dev-login 계정 → `is_admin`이 참이거나 화이트리스트에 있어도 false(DB 조회 없이), 로컬(스테이징 아님) + 화이트리스트 → true, staging + 다른 관리자 → 기존 판정대로 true |
| `docs/specs/DEV_PROCESS_GUARDRAILS.md` | 패턴 13 「반드시 지킬 것」 | 「staging에서는 자동 로그인 계정이 관리자가 될 수 없다(코드 차단, 티켓 20261006_1527)」 한 줄 |

## 완료 조건

- staging 자동 로그인 계정이 DB 값과 무관하게 어드민 화면·API에 들어가지 못한다(테스트).
- staging 어드민 확인을 안내하던 현재 상태 문서가 고쳐졌다(로컬 실렌더 패턴 13으로 안내).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- 응급 조치(2026-10-06 15:12 KST, 사용자 승인): dev-tester `is_admin = false`(`seed_dev_tester_not_admin.sql`). staging `/admin` → `/forbidden` 확인.
- 코드 차단: `auth.ts`의 비공개 함수 `isBlockedStagingAutoLogin`을 `hasAdminAccess` 맨 앞에서 호출한다. `STAGING_MODE === 'true'`이고 id 또는 이메일(대소문자 무시)이 dev-login 계정이면
  `ADMIN_EMAILS`·`users.is_admin`보다 먼저 false다. proxy·admin layout·`getAdminUser`(API)가 모두 이 함수를 거친다. 로컬은 `ADMIN_EMAILS` 셸 변수로 그대로 관리자가 된다. `isAdminAccount`는 그대로.
- dev-login 계정 id·이메일은 `test-accounts.ts`의 `DEV_LOGIN_USER_ID`·`DEV_LOGIN_USER_EMAIL` 한 곳에 두고 dev-login 라우트가 그 상수를 쓴다. 패턴 13과 규칙표 70행을 현재 상태로 고쳤다.

### 변경된 파일
```
jam-web/src/lib/admin/auth.ts, jam-web/src/lib/env/test-accounts.ts, jam-web/src/app/api/dev-login/route.ts, jam-web/src/lib/admin/__tests__/auth.test.ts(신규 11건),
docs/specs/DEV_PROCESS_GUARDRAILS.md(패턴 13), .claude/skills/jam-work/references/handling-rules.md(70행, 카리나 머지 때), jam-web/supabase/migrations/seed_dev_tester_not_admin.sql(응급 조치 기록)
(코드 5파일, jam-web 178줄. 리뷰 브랜치 claude/jamwork-20261006_1527-staging-dev-login-admin-block, 범위 e273c4035..699300c18, staging 머지 6ca80e960)
```

### 테스트 결과
- [x] 아현: 재현 테스트 먼저(수정 전 5건 실패) → 수정 뒤 11건 통과, `scripts/verify.sh` 전 단계 통과.
- [x] CI `verify`(run 37429409139, headSha 699300c18) success.
- [x] 민지: 점검표 **PASS**(9 보안: 차단이 화이트리스트·DB 조회보다 앞).
- [x] 카리나: 1502 ③-a와 합친 상태(6ca80e960)로 `scripts/verify.sh` 전 단계 통과.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 사용자 노출 문구 신규·변경 없음(해당 없음)

### 배포 정보
- 배포일: (staging 머지까지, 2026-10-06. 프로덕션은 STAGING_MODE가 없어 동작 변화 없음, 다음 `/jam-ship`에서 함께)
- 환경: staging
- 커밋: 머지 6ca80e960

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 아현·민지 | 140,166 | 21,040 / 13,936 | 12분 10초 | 68 |
| 합계 | 2 | 140,166 | 21,040 / 13,936 | 12분 10초 | 68 |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

- 2026-10-06 `/jam-ship` 보안 점검에서 발견 → 응급 조치(사용자 승인) → 코드 차단(사용자가 배포 직후 처리 승인). 게이트 PASS와 머지(사용자 승인). staging 믹스 화면에서 자동 로그인 계정은 공개 전 레시피를
  더 보지 못한다(`allowUnreleased`가 같은 판정을 씀, 의도된 결과 — 공개 전 확인은 로컬 실렌더). 범위 밖: P2 20261006_1629(자동 로그인 세션의 일반 API 노출, 사용자 결정 「나중에 정한다」),
  P3 20261006_1630(레거시 `ADMIN_SECRET` 쿠키 인증 경로). `hasAdminAccess` JSDoc의 공백 한 칸 변경은 동작 무관이라 그대로 뒀다.

### 잔여 이슈
- staging 확인: push 뒤 jam-stage 배포에서 `/admin`이 `/forbidden`으로 가는지 본다(DB 값과 무관한 차단이라 결과는 응급 조치 뒤와 같다).
