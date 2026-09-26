---
id: "20260922_1214"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-22
parent: "20260922_1056"
---

# [Infra] `cleanup-stale-worktree.sh`가 `set -e` 없이 돌아 중간 명령 실패가 조용히 다음 단계로 넘어간다

## 핵심 요약

- 요구사항: `scripts/cleanup-stale-worktree.sh`는 `set -uo pipefail`만 켜고 `-e`를 빼 두었다. `git worktree list --porcelain`·`git status --short` 같은 중간 명령이 예기치 않게 실패해도 멈추지 않고 다음 분기로 흐른다. 지금 구조에서는 "점유 없음/거부" 쪽으로 새서(fail-open) 오삭제로 이어지진 않지만, 애매한 경로 자체를 없앤다. `-e`를 켜되, 의도적으로 실패를 허용하는 명령(`git rev-parse --verify origin/<branch>` 등)은 `if`/`||` 가드로 감싸 종료 코드 2 경로가 유지되게 한다.
- 구현 계획: `set -euo pipefail`로 바꾸고 의도적 실패 지점을 가드한 뒤, 기존 테스트 4종이 그대로 통과하는지와 "git 명령이 실패하는 상황"(예: 저장소 밖에서 실행) 테스트 1건을 추가한다.
- 관련 파일: `scripts/cleanup-stale-worktree.sh`, `scripts/cleanup-stale-worktree.test.mjs`
- 상위 티켓: 20260922_1056(민지 게이트의 범위 밖 발견물). 경로: ① 경미 또는 ③ 표준(infra) — 가드가 여러 줄이면 표준

## 배경 / 문제 정의

셸 스크립트에서 `-e` 없이 분기하면 실패한 명령의 빈 출력이 "해당 없음"으로 읽혀 조건이 뒤집힐 수 있다. 이 스크립트는 워크트리 삭제라는 되돌리기 어려운 동작을 하므로 실패 시 반드시 멈춰야 한다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. 예기치 않은 명령 실패는 종료 코드 1로 즉시 중단한다(거부 2·할 일 없음 0과 구분).
2. 기존 종료 코드 계약(0/2)은 그대로다.

## 구현 계획

1. 위 「구현 계획」대로.

## 완료 조건

- 기존 테스트 4종 + 명령 실패 1종 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 묶음 티켓 20260926_1240으로 처리했다. 상세와 실행 지표는 그 티켓의 완료 기록에 있다.
- `scripts/cleanup-stale-worktree.sh`를 `set -euo pipefail`로 바꿨다. `git rev-parse --show-toplevel` 실패 시 안내를 출력하고 종료 코드 1로 끝낸다. `git worktree list --porcelain`은 프로세스 치환이라 `-e`가 실패를 못 잡으므로 변수에 먼저 담게 했다. 의도적 실패 지점은 이미 가드돼 있어 그대로 두었고 종료 코드 0/2 계약은 유지된다.

### 변경된 파일
```
- scripts/cleanup-stale-worktree.sh
- scripts/cleanup-stale-worktree.test.mjs
```

### 테스트 결과
- [x] 기존 테스트 4종과 저장소 밖 실행 1종 통과, 스크립트가 `set -euo pipefail`인지 확인. `scripts/verify.sh` 통과, CI 성공

### 잔여 이슈
- `set -e` 중단 때 종료 코드가 1이 아니라 실패한 git 명령의 코드(보통 128)로 끝난다. 호출부(`jam-developer.md`)는 종료 코드 2만 특별 취급하고 나머지는 중단·보고로 처리하므로 영향이 없다.
