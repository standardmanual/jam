---
id: "20260921_2307"
category: Infra
priority: P2
status: CLOSED
created: 2026-09-21
closed: 2026-09-22
parent: "20260921_2207"
---

# [Infra] 게이트만 재실행 경로 — 작은 재작업은 카리나가 리뷰 브랜치에 직접 패치하고 민지만 다시 부른다

## 핵심 요약

- 요구사항: 재작업 사유가 좁을 때(파일 2개·10줄 이내로 고칠 수 있을 때) 아현을 다시 부르지 않고, 카리나가 리뷰 브랜치에 직접 패치한 뒤 워크플로를 `gateOnly`로 호출해 민지(와 해당 시 채원②)만 실행한다.
- 구현 계획: `jam-work.js`에 `gateOnly: true`, `branch`, `commitRange`(`baseSha..commitSha`) 인자를 추가해 채원①·아현 단계를 건너뛴다. `/jam-work` SKILL.md 3.1절 재작업 분기에 "좁은 재작업 → gateOnly" 규칙과 카리나의 패치 절차(워크트리가 아니라 메인 트리에서 `git fetch` → 임시 워크트리로 체크아웃 → 패치·커밋·push)를 적는다.
- 관련 파일: `.claude/workflows/jam-work.js`(인자 파싱·2단계 분기·3단계 `rangeInstruction`), `.claude/skills/jam-work/SKILL.md`(2절 인자 표·3.1절), `docs/agents/orchestrator.md`(카리나가 하는 일: 경미 수정 범위)
- 상위 티켓: 20260921_2207(#2). 경로: ③ 표준(infra)

## 배경 / 문제 정의

운영 점검(20260921_2207 §2.8)에서 재작업이 첫 실행보다 토큰이 더 들었다(20260921_0841: 첫 166,921 → 재작업 191,061). 재시도는 아현+민지 전체 재실행이라 설계 보정 한 줄에도 같은 비용이 든다. 카리나 카드는 경미 수정(파일 1~2개·10줄 이내)을 직접 처리하도록 이미 허용하므로, 그 범위의 재작업은 카리나가 고치고 판정만 다시 받는 경로가 맞다.

참고 선례(2026-09-22, 티켓 20260921_2303): 아현의 리뷰 브랜치 위에 카리나가 보완 커밋을 쌓을 때 `git worktree add -b <새 브랜치> .claude/worktrees/<이름> origin/<리뷰 브랜치>`로 격리하고, 민지는 Agent 도구로 직접 호출해 고정 커밋 범위(`git diff <A> <B>`)만 판정하게 했다. 새 브랜치는 push하지 않고 로컬에만 두었고, staging 반영은 메인 트리에서 `git merge --ff-only`로 했다. 민지 재판정은 143,532토큰·약 12분이었다(아현+민지 첫 실행 341,102토큰의 약 42%). 2026-09-22 이후 카리나의 격리 브랜치는 `claude/jamwork-*` 이름을 쓰지 않는다(티켓 20260921_2304 결정).

## 상세 요구사항

### 서비스/코드베이스 관점

- `gateOnly` 호출은 `ticketPath`·`branch`·`commitRange`를 필수로 받고, `devResult` 자리에 카리나가 적은 패치 요약(무엇을 왜 고쳤는지, 기존 `summary` 형식)을 넣어 민지에게 넘긴다.
- 민지 프롬프트는 기존과 같이 `reviewedRange`를 고정 범위로 받는다. 채원②는 `ui`·`ds` 유형이고 diff가 15줄 이상일 때만(기존 규칙 동일).
- 반환 스키마는 기존과 같다(`gate`·`designReview`·`needsRework`·`tokenUsage`). `tokenUsage`에 `jam-developer`는 없고 `orchestrator-patch: 0`으로 표시한다.
- 적용 조건은 SKILL.md에 수치로: 재작업 사유가 파일 2개·10줄 이내로 고쳐지고, 로직 판단이 새로 필요하지 않을 때. 아니면 기존 재시도 경로.
- 카리나의 패치는 메인 트리에서 브랜치를 전환하지 않는다(병렬 세션 공유). `git worktree add` 임시 워크트리에서 작업하고 끝나면 제거한다.

## 구현 계획

1. `jam-work.js` 분기 추가와 인자 검증(필수 인자 누락 시 명확한 오류).
2. SKILL.md 2절 인자 표·3.1절 갱신, orchestrator.md 한 줄.
3. 작은 실제 티켓으로 실측 1회(토큰·소요 기록).

## 완료 조건

- `gateOnly` 호출로 아현 없이 민지 판정이 반환되고 결과 스키마가 기존과 같다(실측 1회, 토큰·소요를 완료 기록에).
- 필수 인자가 빠지면 워크플로가 조용히 진행하지 않고 오류를 반환한다.
- SKILL.md에 적용 조건(수치)과 카리나 패치 절차가 있고, 기존 재시도 경로 설명은 그대로다.

## 후속 범위 (이 티켓의 구현 범위 밖, 담당자·시점 명시)

- 완료 조건 1의 "실측 1회, 토큰·소요를 완료 기록에"는 **카리나**가 수행한다. 아현의 구현 범위가 아니다.
- 시점: 1차 게이트 FAIL(2026-09-22) 뒤 재판정을 `gateOnly`로 호출하는 그 실행이 실측이다. 토큰·소요는
  CLOSED 처리 시 완료 기록에 적는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- `jam-work.js`에 `gateOnly`(불리언)·`branch`·`commitRange`(`baseSha..commitSha`)·`devResult`(카리나의 패치
  요약, 문자열 또는 `{summary, diffLineCount}`) 인자를 추가했다. 민지 게이트+채원② 병렬 호출 로직을
  `runGateReview()` 공유 함수로 뽑아 표준 경로(`runSingleTicket`)와 신규 `runGateOnly()`가 같은 코드를
  쓴다. `gateOnly`는 채원①·아현을 건너뛰고 민지(와 `ui`·`ds` 유형이면서 diff 15줄 이상일 때 채원②)만
  호출한다. 필수 인자(`ticketPath`·`branch`·`commitRange`·`devResult`) 누락 시 `throw new Error`로
  멈춘다. 반환 스키마는 기존과 같고 `tokenUsage`는 `jam-developer` 없이 `orchestrator-patch: 0`이다.
- `SKILL.md` 2절 인자 표에 4개 인자를, 3.1절 재작업 분기에 적용 조건(파일 2개·10줄 이내, 로직 판단
  불필요)과 카리나 패치 절차 4단계(메인 트리 브랜치 전환 금지 → 임시 워크트리 → 패치·커밋·push →
  워크트리 제거 → `gateOnly` 호출)를 적었다. `orchestrator.md` 카리나 카드와 미러 문서
  `00_카리나_오케스트레이터.md`에 같은 내용 한 줄을 넣었다.

### 변경된 파일
```
- .claude/workflows/jam-work.js
- .claude/workflows/jam-work.test.mjs (test20~22 추가)
- .claude/skills/jam-work/SKILL.md (2절·3.1절)
- docs/agents/orchestrator.md
- docs/agents/workflow/agents/00_카리나_오케스트레이터.md
- docs/tickets/p2-normal/20260921_2307_...md (후속 범위 절)
```

### 테스트 결과
- [x] `node .claude/workflows/jam-work.test.mjs` 21/21 통과(test20 필수 인자 누락 오류, test21 채원①·아현
  미호출·`orchestrator-patch: 0`, test22 `ui`·diff≥15줄이면 채원② 호출). 머지 후 메인 트리에서 재확인.
- [x] `scripts/verify.sh` 통과, CI `verify` 성공(run 35684612903 → 4cacb19a, 35685072870 → d671fafc)
- [x] **완료 조건 1 실측**: 1차 게이트 FAIL 뒤 재판정을 `gateOnly`로 호출했다. 아현 없이 민지 판정이
  반환됐고 결과 스키마(`gate`·`designReview`·`needsRework`·`tokenUsage`)가 기존과 같았다.

### 배포 정보
- 배포일: 2026-09-22
- 환경: staging (빌드 없음)
- 커밋: 4cacb19a(구현, 아현) · d671fafc(패치, 카리나) · 5c8cb939(병합)

### 실행 수치 (Workflow `<usage>`)
| 실행 | 에이전트 | 전체 토큰 | 소요 | 도구 호출 | 출력 토큰 |
|---|---|---|---|---|---|
| 1차 표준 (아현 → 민지) | 2명 | 253,908 | 888초(약 14.8분) | 72회 | 아현 43,603 · 민지 20,479 |
| 2차 `gateOnly` (민지만) | 1명 | 61,933 | 156초(약 2.6분) | 15회 | 민지 14,726 |

`gateOnly` 재판정은 전체 재실행 대비 토큰 약 24%, 시간 약 18%다. 선례(티켓 20260921_2303, 민지 직접
호출 143,532토큰·약 12분)보다도 작다 — 리뷰 범위가 작고 패치 요약이 구조화돼 넘어간 영향으로 본다.

### 주요 의사결정 / 핵심 메모
- **1차 게이트 FAIL 사유는 구현 결함이 아니라 티켓 형식**이었다. 완료 조건 1의 "실측 1회"를 카리나가
  맡기로 한 사실이 티켓에 「후속 범위」 헤딩(담당자·시점)으로 적혀 있지 않았다(리뷰 지침 20260922_0003,
  선례 20260921_2305). 재작업 사유가 문서 2개·8줄이라 이 티켓이 만든 `gateOnly` 경로를 그대로 써서
  재판정했고, 그 호출이 곧 완료 조건 1의 실측이 됐다.
- **`gateOnly`를 머지 전에 쓰는 방법**: `Workflow(name: 'jam-work')`는 메인 트리(staging)의
  `jam-work.js`를 읽으므로 새 인자를 아직 모른다. 리뷰 브랜치의 `jam-work.js`를 스크래치패드로 복사해
  `scriptPath`로 넘겼다. 머지 뒤에는 `name: 'jam-work'`로 바로 쓸 수 있다.
- **임시 워크트리는 detached로 만들었다.** 아현의 워크플로 워크트리(`wf_*`)가 리뷰 브랜치를 이미 잡고
  있어 같은 브랜치를 두 번 체크아웃할 수 없었다. `git push origin HEAD:<리뷰 브랜치>`로 밀었다.
  SKILL.md 3.1절의 `-b <임시 브랜치>` 절차와 결과는 같다.
- **`plan_only` 면제 사유**: 티켓 「구현 계획」이 파일 단위(jam-work.js·SKILL.md·orchestrator.md)로
  적혀 있었고, 카리나가 착수 전 `gateOnly`·`commitRange` 인자 부재와 변경 범위를 확인했다. 아현은 hard
  rule 2(로직 변경 시 테스트 동반)로 테스트 파일 1개를 더 바꿔 실제 4개 파일이 됐다 — 민지는 스코프
  크립 아님으로 판정했다.
- 1차 게이트의 범위 밖 발견물(미러 문서 드리프트)은 별도 티켓 없이 카리나 패치에 포함해 해소했다.

### 잔여 이슈
- 20260922_1301 (P3): `team-operations.md` §3 경로 표에 재시도·`gateOnly` 경로가 없다 (2차 게이트 발견물).
- 아현의 워크플로 워크트리(`.claude/worktrees/wf_*`)가 리뷰 브랜치를 잡은 채 남아 `gateOnly` 패치
  워크트리를 같은 브랜치로 만들 수 없었다. 티켓 20260921_2309(브랜치 정리 자동화)에서 함께 다룬다.
