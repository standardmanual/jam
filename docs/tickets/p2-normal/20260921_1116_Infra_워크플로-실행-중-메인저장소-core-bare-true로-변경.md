---
id: 20260921_1116
category: Infra
priority: P2
status: OPEN
created: 2026-09-21
---

# [Infra] 워크플로 실행 중 메인 저장소의 `core.bare`가 `true`로 바뀌어 git이 작업 트리로 인식하지 못했다

## 핵심 요약

- 현상: jam-work 워크플로(아현 구현 → 민지 리뷰)를 돌린 직후 메인 체크아웃에서 `git status`·`git add`가 `fatal: this operation must be run in a work tree`로 실패했다. `git worktree list`가 메인 체크아웃을 `(bare)`로 표시했다.
- 확인한 사실: `.git/config`의 `core.bare`가 `true`였고, 이 파일의 수정 시각은 11:14:42 KST로 워크플로 실행 시간대(약 11:10~11:14)와 겹친다. `git config core.bare false` 한 줄로 복구됐고, 이후 `git status`가 정상이며 작업 트리 파일은 그대로였다.
- **같은 종류의 변경이 한 번 더 확인됐다.** 두 번째 워크플로(약 11:18~11:21) 직후 `.git/config`의 `core.hooksPath`가 `/dev/null`이었다(수정 시각 11:20:00 KST). 메인 체크아웃과 격리 워크트리 두 곳 모두 같은 값이었다. 이 값이면 커밋·push 훅이 돌지 않는다. 그 사이 만든 커밋 2개(63c40af2, 24e51413)가 pre-commit 검사를 받지 못했다. `scripts/ensure-hooks-path.sh`가 `.githooks`로 되돌렸고 `node scripts/doc-check.mjs --all --summary`로 문서 frontmatter 오류 0건을 확인했다. 아현의 `verify.sh`는 이 값 때문에 contract 항목이 실패했다고 보고했다.
- **세 번째 워크플로(약 11:24~11:28)에서는 두 값이 동시에 바뀐 채 발견됐다.** `.git/config` 수정 시각 11:27:51 KST, `core.bare = true`와 `core.hooksPath = /dev/null`이 함께였다. 워크플로가 끝날 때마다 재현되고 있다(세 번 중 세 번). 복구는 `git config core.bare false`와 `scripts/ensure-hooks-path.sh` 두 줄이다.
- 네 번째 워크플로(약 11:30~11:34) 직후에도 같은 상태(`core.bare = true`, `core.hooksPath = /dev/null`)였다. 네 번 중 네 번 재현됐다. 아현은 이번에도 「첫 push가 훅 출력만 남기고 실패했고 재실행에서 성공했다」고 보고했다.
- 다섯 번째 워크플로(약 11:44~11:49) 직후에도 같은 상태(`core.bare = true`, `core.hooksPath = /dev/null`)였다. 다섯 번 중 다섯 번 재현이다.
- **이번 워크플로에서 아현이 push 훅 안의 `scripts/verify.sh`가 `fatal: this operation must be run in a work tree`로 실패했다고 보고했다**(scripts-test·contract·team-doc 세 단계). 이는 `core.bare = true`일 때 `git rev-parse --show-toplevel` 등이 내는 오류 메시지와 같다. 아현은 `JAM_SKIP_VERIFY=1`로 우회해 push했고, 수동 실행 verify는 통과했다. 앞서 두 번 보고된 「첫 push 실패」도 같은 원인일 가능성이 있으나 그때는 오류 메시지를 확인하지 못했다. 확정하지는 않았다.
- 아현이 보고한 「첫 push는 실패했고 재시도에서 성공, 원인 미확인」이 티켓 20260921_1110과 20260921_1112 두 번 나왔다. 같은 원인인지는 확인하지 못했다.
- 공유 `.git/config`를 여러 워크트리가 함께 쓰므로, 워크플로 실행 중 어느 쪽에서든 이 파일이 바뀌면 메인 체크아웃에 그대로 영향이 간다. 두 사고(`core.bare`, `core.hooksPath`) 모두 워크플로 실행 시간대에 일어났다.
- **원인은 확인하지 못했다.** `core.bare`를 누가 바꿨는지 알 수 없다. 워크트리를 만들거나 지우는 git 조작, 아현의 실행 명령, 병렬로 열린 다른 세션 등이 후보이지만 어느 것도 확인하지 않았다.
- 관련 파일: `.git/config`, `.claude/workflows/jam-work.js`, `.claude/agents/jam-developer.md`(아현의 워크트리 절차)

## 배경 / 문제 정의

메인 체크아웃이 bare로 인식되면 카리나의 커밋·push가 모두 막히고, 병렬 세션도 같은 영향을 받는다. 이번에는 실패 메시지로 바로 드러나 즉시 복구했지만, 값이 조용히 바뀌는 경로가 있다면 재발할 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 워크플로가 돌 때 `core.bare`를 바꾸는 명령이 있는지 확인한다(`jam-work.js`, 아현·민지 정의, `scripts/workspace-setup.sh`, 훅). 이번 시간대의 워크트리 생성·삭제 흐름을 재현해 본다.
- 원인을 찾으면 그 경로를 막는다. 찾지 못하면 `scripts/ensure-hooks-path.sh`처럼 세션 시작 때 `core.bare`가 `true`이면 알리거나 되돌리는 보장 장치를 둘지 판단한다.
- 새 환경 주장이 생기면 `docs/agents/contract.json`에 검사 줄을 함께 추가한다(CLAUDE.md 규칙 5).

## 완료 조건

- 원인이 확인돼 재현 경로가 막혀 있거나, 확인되지 않았더라도 재발 시 자동으로 드러나거나 복구되는 장치가 있다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경:
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
