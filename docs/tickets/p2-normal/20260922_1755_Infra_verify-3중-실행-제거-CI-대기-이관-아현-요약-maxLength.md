---
id: "20260922_1755"
category: Infra
priority: P2
status: CLOSED
created: 2026-09-22
closed: 2026-09-22
parent: "20260922_1749"
---

# [Infra] `verify.sh` 3중 실행 제거·아현 CI 대기를 민지로 이관·아현 요약 `maxLength` 강제

## 핵심 요약

- 요구사항: 티켓 한 건에 같은 검사(`scripts/verify.sh`)가 아현 로컬 → `.githooks/pre-push` → CI 세 번 돌고, 아현이 CI가 끝날 때까지 약 3분을 기다린다. ① Workflow 에이전트 워크트리(`wf_*`)에서 리뷰 브랜치로 push할 때 pre-push의 `verify.sh` 실행을 건너뛴다(기준 방어 검사는 그대로) ② 아현은 push 후 CI를 기다리지 않고 반환한다 ③ 민지가 다른 점검을 먼저 하고 마지막에 CI 상태를 확인한다 ④ `DEV_RESULT.summary`에 `maxLength`를 걸어 diff 원문이 요약에 실리지 못하게 한다(티켓 20260922_0620 흡수). `infra` 유형, 경로 ③ 표준(최적화 검토 1749 §2-B·§2-D).
- 구현 계획: 아래 「구현 계획」 파일 단위 목록. 파일 7개라 `plan_only` 임계값을 넘는다 — 카리나가 1단계 규모 사전 판정(티켓 20260922_1754)으로 첫 호출부터 면제를 넘긴다.
- 관련 파일: `.githooks/pre-push`(리뷰 브랜치 verify 게이트 `case "$branch" in claude/jamwork-*)` 절, 파일 끝부분; 링크드 워크트리 판정 로직은 같은 파일의 staging 차단 절 `is_linked_worktree`·`worktree_name` 계산부), `scripts/pre-push-worktree-block.test.mjs`(케이스 (a)~(e) 뒤에 추가), `.claude/agents/jam-developer.md`(「CI stamp」 문단 150~154줄, Hard rules 목록 끝), `.claude/agents/jam-reviewer.md`(Checklist 1번 88~92줄, 「Re-running checks yourself」 139~148줄), `.claude/workflows/jam-work.js`(`DEV_RESULT` 스키마 45~56줄), `.claude/workflows/jam-work.test.mjs`(스키마 텍스트 검사 추가), `.claude/skills/jam-work/references/forms/implementation-summary-format.md`(길이 상한 문단)
- 함께 볼 티켓: 20260922_0620(요약 형식 위반 — 이 티켓이 흡수, 머지 후 카리나가 CLOSED), 20260921_2304(CI 도장 도입), 20260918_0421(pre-push verify 게이트 도입)

## 배경 / 문제 정의

CI 실측 143~176초(문서 전용 14~18초). 아현은 로컬에서 `verify.sh`를 돌려 통과시킨 뒤 push하고, pre-push가 같은 스크립트를 다시 돌리고, CI가 세 번째로 돌린다. 아현은 `gh run watch`로 CI가 끝날 때까지 기다린 뒤에야 반환하므로 그 3분 동안 파이프라인 전체가 멈춘다. 민지는 점검표 1번에서 어차피 CI 상태를 확인하므로, 대기를 민지 쪽으로 옮기면 민지·채원②가 티켓·diff를 읽는 동안 CI가 병렬로 돈다.

요약 길이는 형식 문서(30줄)가 프롬프트로만 강제돼 세 번 연속 어겨졌고(0620), diff 원문이 카리나 컨텍스트·민지 프롬프트·채원② 프롬프트 세 곳에 그대로 실렸다. 프롬프트로 막은 규칙은 뚫리고 스키마·훅으로 막은 규칙은 안 뚫린다(`team-operations.md` §8).

## 상세 요구사항

### 서비스/코드베이스 관점

1. **pre-push**: `claude/jamwork-*` 절에서, 현재 위치가 링크드 워크트리이고 폴더 이름이 `wf_`로 시작하면 `verify.sh`를 실행하지 않고 "CI(`verify` 워크플로)가 검증한다"는 한 줄만 stderr에 남긴다. 그 외(메인 트리, 카리나의 `gateOnly` 패치용 임시 워크트리처럼 이름이 `wf_`가 아닌 워크트리)는 지금처럼 실행한다. 기준 방어 검사(억제 주석 사유·`.skip`/`.only`·테스트 삭제 사유·`--max-warnings`)는 위쪽 블록에서 모든 브랜치에 이미 적용되므로 건드리지 않는다. `JAM_SKIP_VERIFY` 우회 변수는 그대로 둔다.
2. **테스트**: 임시 저장소에 `scripts/verify.sh`(마커 파일을 만드는 가짜)와 `jam-web/node_modules/` 디렉터리를 두고, `refs/heads/claude/jamwork-x` push를 (f) `wf_*` 링크드 워크트리에서 → 마커 없음·종료 0, (g) 이름이 `wf_`가 아닌 워크트리에서 → 마커 있음, 두 케이스를 기존 파일에 추가한다. 기존 케이스 (a)~(e)는 그대로 통과해야 한다.
3. **아현 정의**: 「CI stamp」 문단을 "push 후 `gh run list --branch <branch> --limit 1 --json databaseId,url`로 run URL을 얻어 `검증 결과`에 적고 **기다리지 않고 반환**한다. CI 판정은 민지가 한다"로 바꾼다. Hard rules에 "**확인하지 않은 환경 주장 금지** — 무엇이 '없다'·'안 된다'고 적기 전에 `ls`·`grep`·`test -e`로 확인하고 그 명령과 결과를 함께 인용한다"를 추가한다(0620 ②).
4. **민지 정의**: 점검표 1번을 "CI 상태가 아직 `in_progress`/`queued`면 2~12번을 먼저 판정하고 **마지막에** `gh run watch <id> --exit-status`로 기다린다(최대 5분). `failure`면 `gh run view <id> --log-failed`의 실패 단계 이름을 `reasons`에 적고 FAIL. 상태가 없으면 기존대로 직접 `verify.sh`를 돌린다"로 고친다. 「Re-running checks yourself」도 같은 내용으로 맞춘다.
5. **스키마**: `DEV_RESULT.properties.summary`에 `maxLength: 3000`을 건다(형식 문서 30줄 ≈ 3,000자). 주석에 근거(0620, 요약이 세 곳에 실림)를 한 줄로 남긴다.
6. **스키마 테스트**: `jam-work.test.mjs`가 `jam-work.js` 원문에서 `summary` 속성에 `maxLength`가 있는지 확인한다(스키마 객체가 export되지 않으므로 텍스트 검사면 충분하다).
7. **형식 문서**: `implementation-summary-format.md` 길이 상한 문단에 "글자 상한 3,000자 — `DEV_RESULT` 스키마 `maxLength`로 기계가 강제한다"를 덧붙인다.

## 구현 계획

| # | 파일 | 변경 |
|---|---|---|
| 1 | `.githooks/pre-push` | `claude/jamwork-*` 절 안에서 `wf_*` 링크드 워크트리 판정 → `verify.sh` 건너뜀. 판정 로직은 staging 차단 절의 `is_linked_worktree`·`worktree_name` 계산을 루프 상단으로 올려 두 절이 공유하거나, 같은 계산을 함수로 뽑는다 |
| 2 | `scripts/pre-push-worktree-block.test.mjs` | 케이스 (f)(g) 추가 — 가짜 `verify.sh` 마커 방식 |
| 3 | `.claude/agents/jam-developer.md` | 「CI stamp」 문단 교체(대기 제거, run URL 기록), Hard rule 13 "확인하지 않은 환경 주장 금지" |
| 4 | `.claude/agents/jam-reviewer.md` | 점검표 1번·「Re-running checks yourself」 — CI 후행 확인 절차 |
| 5 | `.claude/workflows/jam-work.js` | `DEV_RESULT.summary.maxLength: 3000` |
| 6 | `.claude/workflows/jam-work.test.mjs` | `maxLength` 텍스트 검사 |
| 7 | `.claude/skills/jam-work/references/forms/implementation-summary-format.md` | 글자 상한 문단 |

`docs/agents/team-operations.md` §9-⑦(민지 검사 재실행 관련 서술)이 이 변경으로 거짓이 되는 문장이 있는지 `grep -n "verify" docs/agents/team-operations.md`로 확인하고, 있으면 그 문장만 고친다(자동 생성 구간은 손대지 않는다).

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- `wf_*` 링크드 워크트리에서 `claude/jamwork-*`로 push할 때 pre-push가 `verify.sh`를 실행하지 않고, 이름이 `wf_`가 아닌 워크트리·메인 트리에서는 실행한다. 재현: `node scripts/pre-push-worktree-block.test.mjs`의 신규 케이스 (f)(g)가 통과하고 기존 (a)~(e)도 통과한다.
- 기준 방어 검사는 `wf_*` 워크트리의 리뷰 브랜치 push에도 그대로 걸린다(pre-push의 해당 블록이 변경되지 않았음을 diff로 확인).
- `jam-developer.md`에 `gh run watch`로 기다리라는 지시가 없고, run URL을 `검증 결과`에 적고 반환하라는 지시가 있다. "확인하지 않은 환경 주장 금지" 규칙이 있다.
- `jam-reviewer.md` 점검표 1번이 "진행 중이면 다른 항목 먼저 → 마지막에 최대 5분 대기 → 실패면 실패 단계명과 함께 FAIL → 상태 없으면 직접 실행" 순서를 담는다.
- `jam-work.js`의 `DEV_RESULT.summary`에 `maxLength: 3000`이 있고 `jam-work.test.mjs`가 이를 확인한다. 이 티켓에서 아현이 반환한 `summary`가 3,000자 이하다.
- `scripts/verify.sh` 통과, 리뷰 브랜치 CI `verify` success.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)

- 티켓 20260922_0620을 이 티켓 처리로 CLOSED 하고 완료 기록에 여기를 가리킨다.
- 이 티켓 자신의 「실행 지표」에 아현 소요 시간을 적고, 이전 표준 티켓(2308·2309·2311: 13분 45초~19분 47초)과 견준다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- `.githooks/pre-push`: 링크드 워크트리 판정(`is_linked_worktree`·`worktree_name`)을 루프 상단으로 올려 staging 차단 절과 verify 게이트가 공유한다. `wf_*` 워크트리에서 `claude/jamwork-*`로 push하면 `verify.sh`를 건너뛰고 "CI(verify 워크플로)가 검증합니다"만 남긴다. 기준 방어 검사 블록은 변경 없음.
- `jam-developer.md`: 「CI stamp」를 "run URL만 `검증 결과`에 적고 기다리지 않고 반환"으로 교체. Hard rule 13 "확인하지 않은 환경 주장 금지" 추가.
- `jam-reviewer.md`: 점검표 1번·「Re-running checks yourself」를 "진행 중이면 2~12번 먼저 → 마지막에 최대 5분 대기 → `failure`면 실패 단계명과 FAIL → 상태 없으면 직접 `verify.sh`"로 교체.
- `jam-work.js`: `DEV_RESULT.summary`에 `maxLength: 3000`. 이번 아현 요약은 2,510자(민지가 `node .length`·`wc -m`으로 교차 확인).
- 테스트: `pre-push-worktree-block.test.mjs` (f)(g) — 가짜 `verify.sh` 마커 방식. `jam-work.test.mjs` test23 — 스키마 텍스트 검사.
- 문서: `team-operations.md` §9 표 review 브랜치 행, `implementation-summary-format.md` 글자 상한 문단.

### 변경된 파일
```
.githooks/pre-push
scripts/pre-push-worktree-block.test.mjs
.claude/agents/jam-developer.md
.claude/agents/jam-reviewer.md
.claude/workflows/jam-work.js
.claude/workflows/jam-work.test.mjs
.claude/skills/jam-work/references/forms/implementation-summary-format.md
docs/agents/team-operations.md
```

### 테스트 결과
- [x] `node scripts/pre-push-worktree-block.test.mjs` (a)~(g) 통과
- [x] `node .claude/workflows/jam-work.test.mjs` 23개 통과
- [x] `scripts/verify.sh` 전항목 통과 · CI `verify` success (862836b1)

### 배포 정보
- 배포일: 2026-09-22
- 환경: staging (빌드 없음 — jam-web 밖 변경)
- 커밋: 862836b1 (구현) · afceef3e (병합)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 첫 구현 (게이트 PASS, 재작업 없음) | 2 | 208,545 | 78,224 / 17,223 | 18분 10초 | 119 |
| 합계 | 2 | 208,545 | 78,224 / 17,223 | 18분 10초 | 119 |

### 주요 의사결정 / 핵심 메모
- 계획 반환 면제 사유: 파일 7개로 임계값 초과. 「구현 계획」이 파일 단위로 적혀 있고 카리나가 1749 검토에서 각 파일의 해당 구간을 확인했다(면제 조건 (a)(b), 티켓 20260922_1754 절차 첫 적용). **결과: `plan_only` 왕복 없이 첫 호출에서 구현으로 들어갔다.**
- 이 실행의 지표는 **최적화 전 기준선**이다. 아현은 옛 정의로 돌아 CI를 기다렸고, `core.hooksPath`가 메인 체크아웃 절대경로라 워크트리 push에도 메인 트리의 옛 pre-push(verify 실행)가 돌았다. 새 규칙은 머지 뒤 다음 티켓부터 적용된다 — 이전 표준 티켓(2308·2309·2311: 180,702~185,897토큰·13분 45초~19분 47초)과 같은 구간이다.
- 민지 발견물 `[주의]` CI 액션 Node 20 사용 중단 → 티켓 20260922_1818로 분리.
- 아현 `[참고]`: 워크트리에서 push해도 메인 체크아웃의 훅이 실행되는 것은 기존 구조다. 머지 후 메인 트리가 최신화되면 새 분기가 적용된다.

### 잔여 이슈
- 다음 표준 티켓 실측으로 소요 시간 단축(목표 12분 이하)을 확인한다 (상위 티켓 1749 성공 기준).
