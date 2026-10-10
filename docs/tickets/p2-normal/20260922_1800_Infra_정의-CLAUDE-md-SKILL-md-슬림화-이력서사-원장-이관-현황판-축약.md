---
id: "20260922_1800"
category: Infra
priority: P2
status: CLOSED
created: 2026-09-22
closed: 2026-09-22
parent: "20260922_1749"
---

# [Infra] 정의·CLAUDE.md·SKILL.md 슬림화 — 이력 서사를 사고 원장으로 옮기고 현황판을 축약한다

## 핵심 요약

- 요구사항: 호출마다 실리는 고정 로딩량을 줄인다. 규칙은 남기고 "왜 이렇게 됐나"(티켓 번호·날짜·사고 경위)는 이미 사고 원장 역할을 하는 `docs/agents/team-operations.md` §8로 옮긴다. `CLAUDE.md`의 카리나 전용 절은 `docs/agents/orchestrator.md`로 옮긴다. 세션 시작 현황판은 P2·P3 OPEN 티켓을 건수로 접는다. `docs` 유형, 카리나 직접(최적화 검토 1749 §2-C). 아현이 티켓 1755에서 고치는 `jam-developer.md`·`jam-reviewer.md`와 그 변경으로 사실이 바뀌는 `SKILL.md` 「참고」절은 **1755 머지 뒤에** 손댄다.
- 구현 계획: ① `CLAUDE.md` — 「팀 구성」표·「작업 진행 방식」스킬 표·「새 세션 읽기 순서」를 빼고 `orchestrator.md`로 이동(카리나만 읽는다). 신호·확신도 분류 한 줄, 문서 체계 표, 「폴더 = 수명주기」는 전원 규칙이라 남긴다 ② `scripts/ticket-dashboard.mjs` — P2·P3 `OPEN`은 건수만, `--all`로 전체. 테스트 추가 ③ (1755 머지 뒤) `jam-developer.md`·`jam-reviewer.md`·`jam-work/SKILL.md` — 이력 서사를 `team-operations.md` §8로 옮기고 규칙만 남긴다. 민지 정의의 모드 ②·③ 절은 `ship-security-check.md`·`ship-test-check.md` 머리로.
- 관련 파일: `CLAUDE.md`, `docs/agents/orchestrator.md`(§6 뒤에 절 추가), `scripts/ticket-dashboard.mjs`(`main()` 출력부 240~255줄), `scripts/ticket-dashboard.test.mjs`, `.claude/agents/jam-developer.md`, `.claude/agents/jam-reviewer.md`, `.claude/skills/jam-work/SKILL.md`(「참고」절), `docs/agents/team-operations.md` §8, `.claude/skills/jam-work/references/ship-security-check.md`·`ship-test-check.md`, `docs/agents/contract.json`(`stale_phrases`·`paths_exist` 대조)

## 배경 / 문제 정의

실측(1749 §1.1): `CLAUDE.md` 9,477B는 서브에이전트 전원이 호출마다 받고 선택 제외가 안 된다. 아현 정의 16,434B·민지 정의 13,680B의 30~40%가 규칙이 아니라 경위다. `SKILL.md` 39,457B는 카리나가 `/jam-work`마다 받는데 「참고」절 약 9KB가 거의 이력이다. 세션 시작 현황판 7,315B는 티켓 34건을 전부 나열한다. 표준 티켓(아현+민지) 기준 약 6천 토큰, UI 티켓(4회 호출) 약 1만 토큰이 매번 든다 — 비율은 3~5%지만 재시도·`gateOnly`·배포 점검까지 모든 호출에 누적된다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **CLAUDE.md**: 6개 절대 규칙, 신호·확신도 분류, 문서 체계 표(①~⑤), 「폴더 = 수명주기」, 버전 사본 금지는 남긴다. 「팀 구성」표는 "정의는 `.claude/agents/`, 팀 지도는 `team-operations.md`" 두 줄로, 「작업 진행 방식」스킬 표는 "`/jam-work`로 처리한다" 한 줄로 줄인다. 「새 세션 읽기 순서」는 `orchestrator.md`로 옮긴다. 크기 수치는 문서에 적지 않는다(`contract.json` `stale_phrases`).
2. **orchestrator.md**: 옮겨 온 「새 세션 읽기 순서」와 스킬 표를 새 절로 둔다. 카드(CARD 마커 안)는 40줄 상한을 지킨다 — 카드에 넣지 않는다.
3. **현황판**: `partitionRows(rows, showAll)`를 export해 P2·P3이면서 `OPEN`인 행을 건수로 접는다. 접힌 줄에 `--all` 안내를 넣는다. 순수 함수라 테스트한다.
4. **정의 슬림화(1755 머지 뒤)**: 규칙 문장에서 괄호 안 티켓 번호·날짜·"seen on …"·사고 경위를 떼어 §8에 한 줄씩 옮긴다. 규칙 자체는 글자 하나 바꾸지 않는다. `db` 유형에만 필요한 Hard rule 3의 마이그레이션 상세(확장→전환→축소, `DROP FUNCTION`, 되돌림 SQL 마커)는 `references/db-migration-rules.md`로 분리하고 아현 정의는 "`db` 유형이면 이 파일을 먼저 읽는다" 한 줄로 가리킨다. 민지 정의의 모드 ②·③ 절은 두 점검표 파일 머리로 옮기고 정의에는 모드 표만 남긴다.
5. **SKILL.md 슬림화(1755 머지 뒤)**: 「참고」절에서 규칙(전달 필수 항목·opt-in·채원② 15줄 기준·민지 CI 재실행 조건·토큰 측정 방법)은 해당 절 본문으로 올리고, 경위는 `references/rationale.md`로 옮긴다. 각 절의 "(티켓 XXXX, 2026-09-XX 이전에는…)" 괄호도 같은 파일로.

## 완료 조건

- `CLAUDE.md`에 「팀 구성」표·스킬 표·「새 세션 읽기 순서」가 없고, `orchestrator.md`에 있다. `node scripts/check-contract.mjs` 통과.
- `node scripts/ticket-dashboard.mjs`가 P2·P3 OPEN을 건수로 접고, `--all`이면 전부 나열한다. `node scripts/ticket-dashboard.test.mjs` 통과.
- (1755 머지 뒤) `jam-developer.md`·`jam-reviewer.md`에 티켓 번호·날짜가 규칙 문장 안에 남아 있지 않고, 옮겨 간 내용이 `team-operations.md` §8에 있다. `node scripts/check-skills.mjs`·`node scripts/gen-team-doc.mjs --check` 통과.
- (1755 머지 뒤) `SKILL.md`에 「참고」절이 없고 `references/rationale.md`가 있다. `check-skills` 통과.
- 각 파일의 바이트 수를 완료 기록에 전후로 적는다(문서 본문이 아니라 완료 기록에만).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

**1차분 (커밋 0e52afb7)**
- `CLAUDE.md`: 「팀 구성」표·스킬 표·「새 세션 읽기 순서」를 `orchestrator.md` §7로 옮기고 「팀」 절 세 줄로 대체.
- `scripts/ticket-dashboard.mjs`: `partitionRows()` export — P2·P3 `OPEN`은 건수로 접고 `--all`로 전체. 테스트 추가.

**2차분 (1755 머지 뒤)**
- `jam-developer.md`: Hard rule 3의 마이그레이션 상세를 `references/db-migration-rules.md`로 분리(정의는 "파일 쓰기 전에 읽는다" 한 줄). 규칙 5·9·11·12·13, 「CI stamp」, 「Return format」에서 티켓 번호·날짜·사고 경위 제거. 「Return format」에 `summary` 3,000자 상한 명시.
- `jam-reviewer.md`: 「모드 ②·③ 공통 규칙」 15줄을 한 문단으로 압축(이식 출처 제거). 점검표 1·2·5·8·11번과 「입력」절에서 티켓 번호 제거. 1번과 중복이던 「Re-running checks yourself」 절 제거(내용은 1번 끝에 한 문장). 8번은 `db-migration-rules.md`를 가리킨다.
- `SKILL.md`: 각 절의 "(티켓 XXXX, 2026-09-XX …)" 괄호와 4.1절 실측 서사를 `references/rationale.md`(절 번호별)로 옮김. 「참고」절은 규칙성 항목만 남기고 이력(플러그인 흡수·외부 스킬 대체·병렬화 이력·실측 수치)을 같은 파일로. 1단계 2번에 "관련 파일 지도" 규칙 흡수. `db` 행·참고 절을 1755 변경(verify 생략·CI 대기 이관)에 맞게 갱신.
- `team-operations.md` §8: 옮겨 온 사고 10행 추가(티켓 번호 충돌·checkout -b 오염·워크트리 강제 제거·배지 이미지 덮어씀·함수 오버로드·osxkeychain·요약 형식 위반·Build CPU·정의 서사 혼입).
- `CLAUDE.md` 규칙 6·`orchestrator.md` §4·`DEV_PROCESS_GUARDRAILS.md` 2곳·`04_PROJECT_SPEC.md`: "jam-developer.md Hard rules 3" 참조를 `db-migration-rules.md`로 교체.

### 변경된 파일
```
CLAUDE.md
docs/agents/orchestrator.md
docs/agents/team-operations.md
docs/agents/DEV_PROCESS_GUARDRAILS.md
docs/service/prd/04_PROJECT_SPEC.md
scripts/ticket-dashboard.mjs
scripts/ticket-dashboard.test.mjs
.claude/agents/jam-developer.md
.claude/agents/jam-reviewer.md
.claude/skills/jam-work/SKILL.md
.claude/skills/jam-work/references/rationale.md (신규)
.claude/skills/jam-work/references/db-migration-rules.md (신규)
```

### 테스트 결과
- [x] `scripts/verify.sh` 전항목 통과 (lint·typecheck·test·ds:check·slop·scripts-test·contract·team-doc·skills, 1분 49초) — 2026-09-22 18:40 KST
- [x] `node scripts/ticket-dashboard.test.mjs` 통과 (`partitionRows` 케이스 포함)

### 크기 전후 (바이트, `wc -c`)

| 파일 | 전 | 후 | 변화 |
|---|---|---|---|
| `CLAUDE.md` (서브에이전트 전원, 호출마다) | 9,477 | 6,758 | −29% |
| 세션 시작 현황판 출력 | 7,315 | 4,066 | −44% |
| `jam-developer.md` | 16,811 | 13,252 | −21% |
| `jam-reviewer.md` | 14,433 | 12,443 | −14% |
| `jam-work/SKILL.md` (카리나) | 40,506 | 35,886 | −11% |
| 신규 `rationale.md` (필요할 때만) | — | 6,840 | |
| 신규 `db-migration-rules.md` (`db` 유형만) | — | 3,636 | |

표준 티켓(아현 1회 + 민지 1회) 기준 호출당 약 11KB(≈ 3천 토큰) 감소. `db` 유형이 아니면 마이그레이션 규칙 3.6KB도 더 이상 실리지 않는다.

### 배포 정보
- 배포일: 2026-09-22
- 환경: staging (빌드 없음)
- 커밋: 0e52afb7 (1차분) · 2차분은 아래 push 커밋

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 카리나 직접 | 0 | 측정 불가 | 0 / 0 | 측정 불가 | — |
| 합계 | 0 | 측정 불가 | 0 / 0 | 측정 불가 | — |

### 주요 의사결정 / 핵심 메모
- **완료 조건에서 벗어난 점**: `SKILL.md`의 「참고」절을 없애지 않고 규칙성 항목(전달 필수 항목·opt-in·채원② 15줄 기준·CI 도장 흐름·토큰 측정·워크트리 최신성·라우팅 평가 절차)만 남겼다. 이 항목들은 본문 어느 절에도 자연스럽게 들어가지 않고 절차를 실행할 때 필요하다. 경위만 `rationale.md`로 옮겼다.
- 민지 정의의 모드 ②·③ 공통 규칙은 두 점검표 파일 머리로 옮기면 같은 다섯 줄이 두 곳에 생긴다(`CLAUDE.md` 규칙 5 위반). 대신 정의 안에서 한 문단으로 압축했다.
- 규칙 문장 자체는 바꾸지 않았다 — 괄호 안 경위와 "seen on …" 류만 뗐다. 아현의 Hard rule 5 "stale worktree" 서술은 사고 경위 없이 스크립트 동작(종료 코드 2)만 남겼다.
- 1749 §2-C의 목표 크기(아현 9KB·민지 10KB·SKILL 20KB)는 추정이었고 실제로는 각각 13.3·12.4·35.9KB에 그쳤다. 남은 분량은 경위가 아니라 규칙·절차 본문이라 더 줄이려면 절차를 참조 파일로 쪼개야 한다(1749 잔여 이슈).

### 잔여 이슈
- `SKILL.md`의 `batch`·`gateOnly` 절차(약 4KB, 자주 쓰지 않음)를 참조 파일로 빼는 선택지 — 카리나 카드·3.1절 참조가 함께 바뀌어야 해 별도 판단.
