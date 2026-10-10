---
id: "20260928_1458"
category: Infra
priority: P2
status: OPEN
created: 2026-09-28
closed:
---

# [Infra] PRD와 서비스 플랜이 존재하지 않는 「Strava 전체 유저 자동 동기화 Cron」을 구현됨으로 적은 것을 바로잡는다

## 핵심 요약
- 요구사항: `docs/service/prd/01_PRD.md` §3 기능 표의 「Strava 동기화 (OAuth 연결)」 행은 「전체 유저 자동 동기화 Cron」을 ✅로 적고, `docs/plan/vision/02 JAM! 서비스 플랜.md` L116은 「일 1회 자동 동기화(Cron)로 밤에 앱을 켜면 보상이 쌓여있는 경험이 실제로 동작」한다고 적는다. 실제 `jam-web/vercel.json` crons에는 `/api/cron/poi-cleanup`·`notifications`·`ambient-drop`·`external-inputs` 네 개뿐이고 Strava 동기화 Cron은 없다(2026-09-28 카리나 확인, 티켓 `20260927_2129` T6 확인과 일치). 문서를 사실대로 고치고, 서비스 플랜의 「유저 피로도 제로 🟢 구현됨」 판정도 다시 본다.
- 구현 계획: 동기화 경로(연동 직후 첫 동기화·수동 동기화·로그인 시점 동기화 여부)를 코드로 확인 → PRD·서비스 플랜 서술 정정 → 다른 문서의 같은 서술 검색. 자동 동기화를 실제로 만들지는 별도 기획 판단이다(`/jam-plan`).
- 관련 파일: `docs/service/prd/01_PRD.md` §3 L86, `docs/plan/vision/02 JAM! 서비스 플랜.md` L116, `jam-web/vercel.json` crons, `jam-web/src/app/api/strava/sync/route.ts`, `jam-web/src/app/api/strava/callback/route.ts` L90

## 배경 / 문제 정의
상위 티켓 `20260927_2123` 후속 범위(PRD·서비스 플랜의 퀘스트 상태 갱신)를 진행하다 같은 표에서 발견했다. CLAUDE.md 절대 규칙 5(환경은 확인한 결과만 적는다) 위반 상태이고, 「밤에 앱을 켜면 보상이 쌓여 있다」는 핵심 약속이 문서상으로만 구현돼 있어 우선순위를 P2로 둔다.

## 완료 조건
- 두 문서의 동기화 서술이 실제 코드 경로와 일치한다.
- 같은 서술이 다른 문서에 남아 있지 않다(검색 결과를 티켓에 기록).

---
## 완료 기록 *(작업 완료 후 작성)*
