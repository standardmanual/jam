---
id: "20260926_1829"
category: Infra
priority: P3
status: OPEN
created: 2026-09-26
---

# [Infra] `weekly-collect.mjs`의 출력 마스킹 대상에 서비스 롤 키를 넣고 자식 프로세스에 넘기는 환경변수를 점검한다

> **연결 메모 (2026-09-30 티켓 20260930_1451 사용자 결정):** 20260930_1504가 루틴을 바꿀 때 함께 정리한다.
>
> **3회차 판정 (2026-10-28, 티켓 20260930_1504): 해당함, 닫지 않음.** `scripts/weekly-collect.mjs`의 마스킹 목록(`SECRET_ENV_KEYS`, 26행)은 아직 3종이고 `SUPABASE_SERVICE_ROLE_KEY`가 없다. 새 `ops-submit.mjs`·`ops-read.mjs`의 토큰 값 지우기(`scrub`)는 그 두 스크립트의 출력만 지우므로 이 티켓을 대신하지 못한다. 새 체계 문서(`ops-weekly.md`·카즈하 정의·`scheduled-jobs.md` 새 체계 소절)는 `weekly-collect.mjs`를 부르라고도, 폐기하라고도 적지 않았다(`grep -rn weekly-collect .claude docs/agents` 결과는 `scheduled-jobs.md` 4-1의 환경변수 설명 한 곳). 4회차에서 루틴 프롬프트에 이 스크립트를 넣을지 정할 때 함께 정한다. 예약 환경에는 서비스 롤 키를 두지 않으므로(`scheduled-jobs.md` 4-1) 지금 노출 경로는 없고 우선순위는 P3 그대로다.

## 핵심 요약

- 요구사항: `weekly-collect.mjs`의 출력 마스킹 대상에 서비스 롤 키를 넣고 자식 프로세스에 넘기는 환경변수를 점검한다
- 구현 계획: 미정(착수 전 실측부터)
- 관련 파일: `scripts/weekly-collect.mjs`(`sanitize`, `execFile` env)

## 배경 / 문제 정의

프로덕션 배포 전 점검(민지 모드 ②·③, 티켓 1741·1756 배포)의 범위 밖 발견물이다. 마스킹 대상이 `ADMIN_API_READ_TOKEN`·`ADMIN_API_COOKIE`·`GA4_SERVICE_ACCOUNT_KEY` 3종과 Bearer·쿠키·이메일 패턴뿐이라 `SUPABASE_SERVICE_ROLE_KEY`가 빠져 있다. 환경변수 전체를 자식에게 넘기고 `ADMIN_API_BASE_URL` 기본값이 `http://localhost:3000`이라 토큰이 그 주소로 간다. 현재 코드에서 값이 출력되는 경로는 확인하지 못했다.

## 완료 조건

- 마스킹 목록에 서비스 롤 키가 들어가고 자식에게 필요한 환경변수만 넘기거나 넘기는 이유가 주석으로 남는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 주요 의사결정 / 핵심 메모
-

### 잔여 이슈
-
