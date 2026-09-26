---
id: "20260926_1545"
category: Infra
priority: P2
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
parent: "20260926_1541"
---

# [Infra] 주간-수집-통합-스크립트-weekly-collect

## 핵심 요약

- 요구사항: 카즈하가 도구 호출 17회로 나눠 하던 주간 수집을 `node scripts/weekly-collect.mjs --since <지난 리포트 날짜>` 한 번으로 끝낸다(카즈하 66,889 절감).
- 구현 계획: 기존 수집 명령을 병렬로 실행해 출처별 절(`### 출처: …`)로 이어 붙여 출력한다. 대상: `ga4-weekly-metrics.mjs`, 어드민 KPI 주간 집계(`/api/admin/kpi/weekly`, 읽기 토큰), `admin-api-read.mjs`, `ticket-dashboard.mjs`, `ticket-metrics.mjs --since`, `git log origin/main --since`, 선별 리포트(`jam-doc/operations/reports/triage/*.md`)의 체크 줄 수·적격/사람 필요 건수(동의율). 한 출처가 실패하면 그 출처만 1회 재시도하고 실패 사유를 그 절에 적으며 전체는 계속한다. 토큰·유저 식별 정보는 출력하지 않는다.
- 관련 파일: 신규 `scripts/weekly-collect.mjs`·`weekly-collect.test.mjs`. 참고: `scripts/ga4-weekly-metrics.mjs`, `scripts/admin-api-read.mjs`, `scripts/ticket-dashboard.mjs`, `scripts/ticket-metrics.mjs`, `.claude/skills/jam-work/references/forms/weekly-briefing-format.md`(출처 목록).

## 완료 조건

- 한 번 실행으로 위 출처가 절별로 나오고, 한 출처를 일부러 실패시켜도 나머지가 출력되며 실패 절에 사유가 적힌다(테스트로 주입).
- 출력에 `@` 이메일 형태나 토큰 값이 없다.
- `scripts/verify.sh`가 통과한다.

---
## 완료 기록

### 구현 내용 요약
`node scripts/weekly-collect.mjs --since <날짜>`를 추가했다. GA4·KPI 주간 집계·어드민 읽기·티켓 현황판·워크플로 수치·main 커밋·선별 동의율 7개 출처를 병렬로 수집해 `### 출처: …` 절로 출력한다. 출처 하나가 실패하면 1회 재시도 뒤 그 절에 사유를 적고 나머지는 계속하며, 맨 위에 `수집 실패: 출처 (사유)` 줄을 낸다. 이메일 형태와 토큰·쿠키 값은 가린다.

### 변경된 파일
```
scripts/weekly-collect.mjs (신규)
scripts/weekly-collect.test.mjs (신규)
```

### 테스트 결과
- [x] `scripts/verify.sh` 전항목 통과, CI verify success. 출처 주입으로 일부러 낸 실패, `@`·토큰 값 부재, `--since bad` 종료 코드 2를 테스트로 확인.

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 (채원 생략, infra) | 측정 불가 | 32,332 / 11,489 | 워크플로 전체 35.4분(3건 합계) | 워크플로 전체 131회(3건 합계) |
| 합계 | 2 | 측정 불가(3건 묶음 워크플로 전체 344,035) | 위와 같음 | 35.4분(3건 합계) | 131(3건 합계) |

### 주요 의사결정 / 핵심 메모
- 구현자가 티켓에 없이 넣은 두 가지(현황판 카리나 카드 제거, git 로그 30줄 상한)는 토큰 절감 목적이라 범위 이탈로 보지 않았다.
- 게이트 [참고]: `today/metrics`는 수집 대상에 없고 KPI가 `--since`와 다른 기간(기본 7일)일 수 있다 → 카즈하 프롬프트 교체(1546)에서 반영한다. 이메일 마스킹 범위 → 티켓 20260926_1621.
- 병합: 2026-09-26 사용자 승인(세 건 함께), 게이트 PASS·재작업 없음.

### 잔여 이슈
- 카즈하 프롬프트와 `weekly-briefing-format.md`가 이 스크립트를 쓰도록 바꾸는 일은 티켓 1546에서 한다.
