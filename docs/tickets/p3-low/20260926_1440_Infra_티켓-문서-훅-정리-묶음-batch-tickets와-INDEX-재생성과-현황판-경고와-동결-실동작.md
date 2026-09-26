---
id: "20260926_1440"
category: Infra
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260922_1209"
  - "20260921_1412"
  - "20260918_1251"
  - "20260922_1401"
---

# [Infra] 티켓·문서·훅 정리 묶음: batch-tickets `column` 단서(1209), INDEX 충돌 재생성 안내(1412), 현황판 문서 동기화 경고(1251), workflow 동결 실동작 검증(1401)

> 하위 티켓들을 한 번의 구현·게이트·병합으로 처리하기 위한 묶음 티켓이다(사용자 지시, 2026-09-26). 끝나면 하위 티켓도 함께 닫는다. **각 하위 티켓의 「구현 계획」과 「완료 조건」이 세부 기준이다. 아래 표는 파일 단위 실행 범위이고, 세부 요구사항은 하위 티켓 본문(`docs/tickets/`)을 읽는다.**

## 핵심 요약

- 요구사항: (1) `scripts/batch-tickets.mjs`의 `DB_CLUE_RE`에 결합 패턴을 더해 「column」만 있는 DB 성격 Infra 티켓이 `infra`로 새는 오판을 막는다(1209). (2) `docs/specs/INDEX.md` 병합 충돌 시 손으로 풀지 않고 `node scripts/gen-doc-index.mjs`로 재생성한다는 안내를 `pre-commit` 차단 메시지와 `handling-rules.md`에 남긴다(1412). (3) `ticket-dashboard.mjs`만 바뀌고 `dashboard-format.md`가 안 바뀐 커밋에 경고를 띄운다(1251, 차단 아님). (4) `checkWorkflowFreeze`가 훅 문자열 존재만 보는 한계를 고쳐, ⑨ 블록을 주석 처리한 훅을 위반으로 잡는다(1401).
- 관련 파일: `scripts/batch-tickets.mjs`(+`.test.mjs`), `.githooks/pre-commit`(⑧ 블록 메시지, 경고 블록 신규), `.claude/skills/jam-work/references/handling-rules.md`, `scripts/check-contract.mjs`(`checkWorkflowFreeze`), `scripts/doc-check-hook.test.mjs`, `docs/agents/contract.json`(`workflow_freeze`).

## 구현 계획

### 파일 단위 계획 (규모 사전 판정, 2026-09-26)

| # | 파일 | 하는 일 | 예상 줄 수 |
|---|---|---|---|
| 1 | `scripts/batch-tickets.mjs`(`DB_CLUE_RE`) | `(?:테이블\|DB)\s*(?:column\|컬럼)\|(?:column\|컬럼)\s*(?:추가\|삭제\|정리\|변경)` 같은 결합 패턴 추가 | 약 3 |
| 2 | `scripts/batch-tickets.test.mjs` | 「컬럼 정리」만 있는 가상 티켓(`db` 기대), 「column」이 UI 그리드 열을 뜻하는 가상 티켓(`infra` 기대) | 약 30 |
| 3 | `.githooks/pre-commit`(⑧ 블록 차단 메시지) | 충돌 시 재생성 안내 한 줄 | 약 3 |
| 4 | `.claude/skills/jam-work/references/handling-rules.md`(카리나 표) | INDEX.md 병합 충돌 시 재생성 행 | 약 2 |
| 5 | `.githooks/pre-commit`(신규 경고 블록) | `scripts/ticket-dashboard.mjs`가 바뀌고 `.claude/skills/jam-work/references/dashboard-format.md`가 안 바뀐 커밋에 경고를 출력(차단하지 않음) | 약 15 |
| 6 | `scripts/check-contract.mjs`(`checkWorkflowFreeze`), `scripts/doc-check-hook.test.mjs` | 하위 티켓 1401 「구현 계획」대로: 임시 저장소에서 ⑨ 블록을 주석 처리한 훅이 차단을 푸는지 재현하는 시나리오를 만들고, `check-contract`가 그 상태를 위반으로 잡도록 대조를 문자열 존재에서 실동작 기준으로 보강 | 약 70 |

- 예상 합계 약 125줄, 변경 파일 약 7개라 기준을 넘긴다. `planOnlyWaiver`로 첫 호출부터 면제한다. **훅과 계약 검사는 커밋을 막는 관문이므로 테스트는 임시 저장소에서만 돌리고, 새 경고가 정상 커밋을 막지 않는지(경고만 출력)를 테스트로 확인한다.** `.githooks/pre-commit`은 하위 티켓 1412·1251이 함께 고치므로 충돌 없이 두 블록을 넣는다.

## 완료 조건

- 「컬럼 정리」만 있는 티켓은 `db`로, UI 열 의미의 `column` 티켓은 `infra`로 판정된다(단위 테스트).
- INDEX 충돌 재생성 안내가 `pre-commit` 차단 메시지와 `handling-rules.md`에 있고, 현황판 스크립트만 바뀐 커밋에 경고가 나온다(차단하지 않음, 임시 저장소 테스트).
- ⑨ 블록을 주석 처리한 훅을 `check-contract`가 위반으로 잡는다. `scripts/verify.sh` 통과.

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
