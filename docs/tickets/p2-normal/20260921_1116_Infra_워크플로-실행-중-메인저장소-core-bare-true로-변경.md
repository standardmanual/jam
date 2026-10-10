---
id: 20260921_1116
category: Infra
priority: P2
status: CLOSED
created: 2026-09-21
closed: 2026-09-21
---

# [Infra] 워크플로 실행 중 메인 저장소의 `core.bare`·`core.hooksPath`가 바뀌어 git이 동작하지 않았다

## 핵심 요약

- 현상: jam-work 워크플로(아현 구현 → 민지 리뷰)가 끝날 때마다 메인 체크아웃의 `.git/config`에서 `core.bare = true`, `core.hooksPath = /dev/null`, `user.name = tester`, `user.email = t@example.com`이 발견됐다. `git status`·`git add`가 `fatal: this operation must be run in a work tree`로 실패했고, 훅이 꺼져 커밋 검사가 돌지 않았다. 워크플로 다섯 번 중 다섯 번 재현됐다.
- **원인(확인함)**: 아현이 `claude/jamwork-*` 브랜치를 push하면 `.githooks/pre-push`가 `scripts/verify.sh`를 돌린다. 이 안의 `scripts-test` 단계(티켓 20260919_1306이 추가)가 루트 `scripts/*.test.mjs`를 실행하는데, 그중 `doc-check.test.mjs`(228~231행)와 `doc-check-hook.test.mjs`가 임시 저장소에서 `git init`, `git config user.email t@example.com`, `git config user.name tester`, `git config core.hooksPath /dev/null`을 실행한다. 훅 안에서는 git이 `GIT_DIR` 등을 물려주는데 두 테스트는 이를 정리하지 않아, 임시 저장소가 아니라 **실제 저장소 설정**에 쓰였다.
- 수정: (1) 두 테스트의 `run` 헬퍼가 물려받은 `GIT_*`를 버린다. (2) `verify.sh`가 루트 테스트를 돌리기 전에 `GIT_*`를 제거한다. (3) 감시용 저장소의 링크드 워크트리 관리 디렉터리를 `GIT_DIR`로 가리킨 채 다른 루트 테스트를 실행하고 그 저장소의 공용 설정이 바뀌면 실패하는 회귀 테스트 `scripts/test-env-isolation.test.mjs`를 추가했다. 새 루트 테스트가 생겨도 자동으로 검사 대상이 된다.

## 배경 / 문제 정의

메인 체크아웃이 bare로 인식되면 카리나의 커밋·push가 모두 막히고 병렬 세션도 같은 영향을 받는다. 훅이 꺼지면 커밋 검사(문서 검사·정합성 검사)가 조용히 건너뛰어진다. 사용자 이름이 바뀌면 커밋 작성자가 틀어진다. 아현이 보고한 「첫 push 실패」와 `JAM_SKIP_VERIFY=1` 우회도 같은 원인이었다(verify가 `must be run in a work tree`로 실패).

## 재현과 검증 (2026-09-21, 실제 저장소는 건드리지 않고 복제본에서 실험)

- **재현(수정 전)**: 저장소를 복제하고 `extensions.worktreeConfig = true`, 링크드 워크트리, `claude/jamwork-exp` 브랜치를 만들어 push했다. pre-push가 verify를 돌렸고 push가 막혔으며, 복제본 설정이 `bare=true`, `hooksPath=/dev/null`, `user=tester`로 바뀌었다. 실제 사고와 증상이 일치한다.
- **`core.bare = true`를 쓰는 명령(확정, 사용자 지시로 재조사)**: `GIT_TRACE2_EVENT`로 push 훅 안의 git 명령을 전부 기록했다. `core.bare`를 명시적으로 쓰는 명령은 없었다(`git config` 93건 중 `bare` 인자 0건, 저장소 코드 전수 검색에서도 0건). 대신 두 테스트가 임시 폴더에서 실행한 **`git init -q`**가 원인이다. 훅이 물려주는 값은 `GIT_DIR=<저장소>/.git/worktrees/<워크트리>`(링크드 워크트리의 관리 디렉터리)이고 `GIT_WORK_TREE`는 없다. 이 상태에서 다른 폴더에서 `git init`을 실행하면 git은 임시 폴더가 아니라 `GIT_DIR`가 가리키는 기존 저장소를 다시 초기화하고, `GIT_DIR`가 `<현재 폴더>/.git`가 아니므로 bare 저장소로 판단해 공용 `.git/config`에 `core.bare = true`를 쓴다. 최소 실험(git 2.54.0)으로 조건을 확정했다: `GIT_DIR`가 메인 `.git`이면 바뀌지 않고(단독 실험이 재현되지 않았던 이유), 워크트리 관리 디렉터리일 때만 바뀌며, `GIT_WORK_TREE`를 함께 주면 바뀌지 않는다. 아현은 항상 링크드 워크트리에서 push하므로 매번 재현됐다.
- **회귀 테스트가 결함을 잡는지**: 회귀 테스트가 실제 조건(링크드 워크트리 관리 디렉터리를 `GIT_DIR`로)을 그대로 재현하도록 보강했다. 수정 전 코드에서는 `doc-check.test.mjs`·`doc-check-hook.test.mjs` 둘 다 감시 저장소에 `bare = true`를 써서 실패했고, 수정 후 통과했다.
- **수정 후 같은 push 실험**: verify가 통과하고 push가 성공했으며 복제본 설정이 그대로였다(`bare=false`, `hooksPath=.githooks`, `user=x`).

## 완료 조건

- 워크플로가 돌고 push 훅에서 verify가 실행돼도 메인 저장소의 `core.bare`·`core.hooksPath`·`user.*`가 바뀌지 않는다. 다음 워크플로 실행 뒤 값을 확인해 재발이 없음을 다시 본다.

---
## 완료 기록

### 구현 내용 요약
원인을 확인하고 세 겹으로 막았다. 두 테스트 헬퍼의 `GIT_*` 정리, `verify.sh`의 `GIT_*` 제거, 감시용 저장소를 쓰는 회귀 테스트 `test-env-isolation.test.mjs`. 오염돼 있던 메인 저장소의 `user.name`·`user.email`(로컬)도 지워 전역 설정(`standardmanual`)이 다시 쓰이게 했다. `DEV_PROCESS_GUARDRAILS.md`에 패턴 15를 추가했다.

### 변경된 파일
```
scripts/doc-check.test.mjs
scripts/doc-check-hook.test.mjs
scripts/verify.sh
scripts/test-env-isolation.test.mjs (신규)
docs/agents/DEV_PROCESS_GUARDRAILS.md (패턴 15)
```

### 테스트 결과
- [x] `scripts/verify.sh` 전 항목 통과(48초). 회귀 테스트가 `scripts-test` 단계에 포함된다
- [x] 수정 전 실패·수정 후 통과 확인(위 재현과 검증)
- [x] 수정 후 복제본 push 실험에서 설정 유지 확인

### 배포 정보
- 배포일: 2026-09-21 (staging, `jam-web/` 밖 변경이라 빌드 없음)
- 환경: 저장소 스크립트·문서
- 커밋: 62eff343(수정), 이 티켓의 종료 커밋

### 주요 의사결정 / 핵심 메모
- 원인은 오늘 추가한 `verify.sh`의 `scripts-test` 단계(20260919_1306)와 기존 테스트의 조합이었다. 그 단계가 훅 안에서 돌게 되면서 잠재돼 있던 결함이 드러났다. 이 단계를 되돌리지 않고 테스트 쪽을 고쳤다.
- 테스트 헬퍼 두 곳을 고치는 것만으로는 새 테스트가 같은 결함을 다시 만들 수 있어서, 모든 루트 테스트를 자동으로 검사하는 회귀 테스트와 `verify.sh` 쪽 제거를 함께 두었다.

### 잔여 이슈
- **커밋 작성자**: 사고가 난 동안 오늘 커밋 37개 중 17개가 작성자 `tester <t@example.com>`로 기록됐고 이미 staging에 push됐다. 이력을 다시 쓰는 것은 되돌릴 수 없어 하지 않았다. 처리 방법(그대로 두기, `.mailmap`으로 표시만 바꾸기, 이력 재작성)은 사용자 결정이 필요하다.
