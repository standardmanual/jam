---
id: "20260926_1545"
category: Infra
priority: P2
status: OPEN
created: 2026-09-26
closed:
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
