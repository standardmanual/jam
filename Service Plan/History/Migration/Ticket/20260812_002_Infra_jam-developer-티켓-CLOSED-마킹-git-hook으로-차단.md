---
id: 20260812_002
category: Infra
status: CLOSED
created: 2026-08-12
closed: 2026-08-12
---

# [Infra] jam-developer의 티켓 CLOSED 자가 마킹을 git hook으로 기계적 차단

## 배경 / 문제 정의

`/jam-work` 파이프라인에서 jam-developer(트레일메이커)가 구현/조사를 마친 뒤 티켓 문서의
`status`를 스스로 `CLOSED`로 마킹하는 프로세스 이탈이 **3회 반복**됐다 (티켓 009, 010, 011).
`.claude/agents/jam-developer.md`에 "CLOSED로 바꾸지 않는다"는 규칙을 명문화했음에도
(티켓 009 처리 시 추가) 이후 티켓 010, 011에서 재발 — 프롬프트 텍스트만으로는 강제력이
부족하다는 게 확인됨.

## 상세 요구사항

프롬프트 규칙을 더 강하게 쓰는 대신, git 레벨에서 기계적으로 막는다.

### 서비스/코드베이스 관점
- `.githooks/pre-commit` 신설: 현재 브랜치가 `claude/jamwork-*` 패턴이고, staged된 티켓 파일
  (`Service Plan/History/Migration/Ticket/*.md`)의 diff에 `+status: CLOSED`가 있으면 커밋을 거부.
- `main` 브랜치에서는 차단하지 않음 — 오케스트레이터가 사용자 승인 후 CLOSED 처리하는 정상 흐름은
  그대로 허용돼야 함.
- 저장소가 `core.hooksPath`를 `.githooks`로 쓰도록 로컬 git config 설정 (`.git/hooks/`는 git이
  버전 관리하지 않아 클론마다 비어있으므로, 훅 스크립트 자체는 `.githooks/`에 커밋해 공유하고
  활성화만 로컬 설정으로 함).

## 구현 계획
1. `.githooks/pre-commit` 작성 — 파일명에 공백이 있는 경로(`Service Plan/...`)를 안전하게 다루기
   위해 NUL 구분(`-z`) + `while read -d ''` + `<(...)` 프로세스 치환 사용 (`#!/bin/bash` 필요,
   `/bin/sh`의 워드 스플리팅으로 공백 포함 경로가 깨지는 문제를 실제로 재현 후 수정함).
2. `git config core.hooksPath .githooks` 로컬 설정.
3. 실제 테스트 브랜치(`claude/jamwork-test-hook`)로 3가지 케이스 검증 후 정리:
   - review 브랜치 + CLOSED 커밋 → 차단됨 (의도대로)
   - review 브랜치 + IN_PROGRESS 커밋 → 통과
   - main 브랜치 + CLOSED 커밋 → 통과
4. `.claude/agents/jam-developer.md` 규칙 4에 훅이 실제로 강제한다는 사실 추가.
5. `CLAUDE.md` 규칙 4에 새 클론 시 `core.hooksPath` 활성화 필요하다는 안내 추가.

---
## 완료 기록

### 구현 내용 요약
계획대로 전부 구현·테스트·정리 완료. 첫 구현은 `#!/bin/sh` + `for f in $(git diff ...)`
방식이었는데, 저장소 경로에 공백이 많아(`Service Plan/`, `Migration/Ticket/`) 워드 스플리팅으로
차단 로직이 조용히 무력화되는 버그를 테스트 중 실제로 발견 — `#!/bin/bash` + `-z`/NUL 구분
방식으로 재작성해 해결.

### 변경된 파일
```
.githooks/pre-commit (신규)
.claude/agents/jam-developer.md
CLAUDE.md
Service Plan/History/Migration/Ticket/20260812_002_Infra_jam-developer-티켓-CLOSED-마킹-git-hook으로-차단.md
```

### 테스트 결과
- [x] review 브랜치에서 CLOSED 커밋 시도 → 차단 확인 (exit 1, 안내 메시지 출력)
- [x] review 브랜치에서 IN_PROGRESS 커밋 → 정상 통과 확인
- [x] main 브랜치에서 CLOSED 커밋 → 정상 통과 확인
- [x] 테스트용 더미 티켓·테스트 브랜치 전부 정리, `git status` 깨끗함

### 배포 정보
- 배포일: 2026-08-12
- 환경: 로컬 git 설정 + 저장소 파일 (서비스 코드 아님, 이번 로컬 환경엔 즉시 적용됨)
- 커밋: `37fbbd4`

### 주요 의사결정 / 핵심 메모
- push 자체(main 직접 push)를 막는 pre-push 훅은 추가하지 않음 — 이건 실제로 위반된 적이
  없는 규칙이라 지금 확인된 문제(CLOSED 마킹)만 정확히 겨냥해서 고쳤다. 과잉 방어 금지 원칙.
- `.git/hooks/`가 아니라 `.githooks/`(버전관리)로 만든 이유: 훅 자체가 git 추적 대상이어야
  다른 머신/클론에서도 코드 리뷰·재사용이 가능함. 활성화(`core.hooksPath`)는 클론마다 1회
  로컬 설정이 필요하다는 한계는 CLAUDE.md에 남겨둠.

### 잔여 이슈
- 이 저장소를 새로 클론하는 다른 머신/세션에서는 `git config core.hooksPath .githooks`를
  1회 수동 실행해야 훅이 활성화됨 — 자동화(예: postCheckout 안내, setup 스크립트)는
  필요성이 생기면 추가.
