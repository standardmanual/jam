---
id: "20261006_1527"
category: Infra
priority: P1
status: OPEN
created: 2026-10-06
closed:
---

# [Infra] staging 자동 로그인 계정이 관리자라 누구나 공용 DB 어드민을 쓸 수 있었다

## 핵심 요약

- 요구사항: stage.j-a-m.app의 자동 로그인 계정이 다시 관리자가 되지 못하게 코드로 막고, staging 어드민 확인에 기대던 문서·절차를 현재 상태로 고친다. 응급 조치(dev-tester `is_admin = false`)는 2026-10-06 15:12 KST에 했다.
- 구현 계획: 착수 때 정한다. 후보: `hasAdminAccess()`가 `STAGING_MODE`에서 dev-login 계정(`DEV_USER_EMAIL`)을 관리자로 보지 않게 한다. staging 배포 보호(Vercel)를 켤지는 사용자 결정.
- 관련 파일: `jam-web/src/lib/admin/auth.ts`(`hasAdminAccess`), `jam-web/src/app/api/dev-login/route.ts`(`DEV_USER_EMAIL` 19행), `jam-web/src/proxy.ts`(89–91행 자동 로그인), `jam-web/supabase/migrations/seed_dev_tester_not_admin.sql`, `docs/specs/DEV_PROCESS_GUARDRAILS.md` 패턴 13

## 배경 / 문제 정의

2026-10-06 `/jam-ship`(origin/main daf6db727 → 565c3067b) 5단계 병렬 점검(민지 모드 ② 3번 [보안/참고])에서 짚었고 카리나가 확인했다. 확인한 사실: dev-tester가 `users.is_admin = true`였다. jam-stage에는 Vercel 접근 보호가 없어 쿠키 없는 요청이 `/` → `/api/dev-login`(307)으로 가고 dev-tester의 Supabase 세션 쿠키를 받았다. 그 상태에서 `/admin` 대시보드가 열렸다. jam-stage에는 `ADMIN_EMAILS`가 없다. DB는 staging·프로덕션 공용이다.

사용자 승인으로 15:12 KST에 `is_admin = false`로 바꿨고(seed 파일에 기록), 그 뒤 staging `/admin`은 `/forbidden`(「접근 권한 없음」)이다. 9월 중순부터 staging 어드민 미리보기(예: 온보딩 퀘스트 미리보기, 티켓 20260927_2123)가 이 자동 로그인에 기대어 왔으므로 그 확인 경로는 이제 쓸 수 없다.

## 완료 조건

- staging 자동 로그인 계정이 DB 값과 무관하게 어드민 화면·API에 들어가지 못한다(테스트).
- staging 어드민 확인을 안내하던 현재 상태 문서가 고쳐졌다(로컬 실렌더 패턴 13으로 안내).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-
