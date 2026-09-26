---
id: "20260926_1440"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
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
- 하위 티켓 네 건(20260922_1209, 20260921_1412, 20260918_1251, 20260922_1401)을 한 번의 구현·게이트·병합으로 처리했고 네 건도 함께 CLOSED로 바꿨다. 세부는 각 하위 티켓의 완료 기록에 있다.

### 변경된 파일
```
- scripts/batch-tickets.mjs, scripts/batch-tickets.test.mjs
- .githooks/pre-commit (⑧ 재생성 안내 + 현황판 경고 블록, +19줄)
- .claude/skills/jam-work/references/handling-rules.md (+1줄)
- scripts/check-contract.mjs (+50/-3), scripts/doc-check-hook.test.mjs (+120)
```

### 테스트 결과
- [x] `scripts/verify.sh` 전 단계 통과. 커밋 2회 모두 pre-commit 통과(새 경고·검사가 정상 커밋을 막지 않음). CI 성공(실행 36221842519, 커밋 e28fa458)
- [x] 민지 게이트 **PASS**. 점검 12항목 중 1·2·3·4·5·10·11 통과, 나머지 해당 없음. 검토 범위 0e21bc0a..e28fa458
- [x] 병합 뒤 통합본에서 `pre-commit` 문법 검사와 `check-contract` 통과, 병합 직후 카리나의 실제 커밋이 새 훅을 통과했다

### 배포 정보
- 배포일: 2026-09-26 (staging 병합·push). 프로덕션은 `/jam-ship`으로 별도 진행
- 커밋: 구현 89f0a582·93faf0f0·e28fa458, 병합 9925abdd (리뷰 브랜치 `claude/jamwork-20260926_1440-hook-cleanup-bundle`)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 (묶음 4건, 게이트 PASS) | 132,890 | 98,893 / 23,045 | 11.9분 | 60 |
| 합계 | 2 | 132,890 | 98,893 / 23,045 | 11.9분 | 60 |

### 주요 의사결정 / 핵심 메모
- **1251의 이전 검토 결정을 묶음 지시가 뒤집었다.** 하위 티켓 1251의 2026-09-21 검토는 "pre-commit 경고는 도입하지 않고 출력 형식 테스트로 대체"였지만, 묶음 티켓의 파일 단위 계획과 완료 조건이 pre-commit 경고를 명시했다. 아현이 이를 assumptions에 밝히고 묶음 지시를 따랐고, 차단하지 않는 경고라 부담이 작아 그대로 인정했다.
- **관문 파일의 테스트는 임시 저장소에서만 했다.** `pre-commit`·`check-contract`는 커밋을 막는 관문이라 메인 저장소 훅을 건드리지 않았다. `GIT_*` 환경변수를 버려 실제 저장소 설정과 격리했다.
- **계획 반환 면제.** 파일 약 7개·예상 125줄이라 티켓에 파일 단위 계획을 적고 첫 호출부터 면제했다. 실제 추가 약 210줄(예상의 1.7배, 테스트 비중이 큼)이었다.
- **범위 밖 발견물(민지 [참고])**: 1251의 결정 변경과 1401의 선택 항목 미이행 두 가지를 각 하위 티켓의 완료 기록에 남겼고 별도 티켓은 만들지 않았다.

### 잔여 이슈
- `routine_commit_restriction` 실동작 검증(선택 항목, 필요해지면 추가).
