---
id: 20260921_1208
category: Infra
priority: P2
status: CLOSED
created: 2026-09-21
---

# [Infra] 로컬 `main`이 원격과 무관한 이력이라 `/jam-ship`의 승격 절차가 막힌다

## 핵심 요약

- 현상: 2026-09-21 `/jam-ship`을 실행하자 절차 3의 `git merge --ff-only origin/staging`이 `fatal: refusing to merge unrelated histories`로 거부됐고, `git push origin main`은 원격이 더 앞서 있다는 이유로 거절됐다. 프로덕션에는 아무것도 올라가지 않았다.
- 확인한 사실: 로컬 `main`은 `968490bc`(2026-09-18, 커밋 2,923개)이고 원격 `main`(`1999a3ca`)과 **공통 조상이 없다.** 로컬 `main`의 reflog에는 `merge origin/staging: Fast-forward`가 남아 있다. 원격 `main`은 원격 `staging`의 조상이라 fast-forward 승격은 가능했다.
- **우회**: 로컬 `main`을 거치지 않고 `JAM_SHIP=1 git push origin origin/staging:main`으로 승격했다(강제 push가 아니라서 원격이 fast-forward가 아니면 거부한다). 배포는 정상 완료됐다.
- **원인은 확인하지 못했다.** 원격 이력이 어느 시점에 바뀌었는지(예: 저장소 재통합)나 로컬 `main`이 언제부터 어긋났는지는 조사하지 않았다.
- 관련 파일: `.claude/skills/jam-ship/SKILL.md`(절차 3), 로컬 `main` 브랜치

## 배경 / 문제 정의

`/jam-ship`은 로컬 `main`을 체크아웃해 `origin/staging`을 ff-only로 합친 뒤 push한다. 로컬 `main`이 원격과 무관한 이력이면 이 절차가 매번 실패한다. 다른 PC의 로컬 `main`도 같은 상태일 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 로컬 `main`이 어긋난 원인을 확인한다(원격 이력 변경 시점, 다른 PC의 상태).
- `/jam-ship`을 로컬 `main`에 의존하지 않게 고칠지 정한다. 예: `git push origin origin/staging:main`(ff가 아니면 원격이 거부)으로 바꾸고 사전 확인에 `git merge-base --is-ancestor origin/main origin/staging`를 넣는다. 로컬 `main`을 원격에 맞출지는 사용자가 정한다. 로컬 `main`의 2,923개 커밋은 원격에 없는 이력일 수 있어 임의로 삭제하지 않는다.

## 완료 조건

- `/jam-ship`이 로컬 `main` 상태와 무관하게 성공하거나, 로컬 `main`이 원격과 맞춰져 있다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- **로컬 `main`을 원격과 맞췄다(2026-09-26, 카리나).** 옛 로컬 `main`(`968490bc`, 2026-09-18)은 원격 `main`과 공통 조상이 없어 삭제하지 않고 `main-pre-reintegration-20260918`로 이름만 바꿔 보존했다. 원격 `main`(`50e07c97`)에서 새 로컬 `main`을 만들었다(추적 브랜치 `origin/main`).
- 결과 확인: 새 로컬 `main`과 `origin/main`의 공통 조상이 `50e07c97`이고, `main`이 `origin/staging`의 조상이라 `/jam-ship` 7절의 `git merge --ff-only origin/staging`이 통과하는 상태다.
- 절차 문서에 재발 방지 안내를 추가했다: `.claude/skills/jam-ship/SKILL.md` 7절(승격 직전 로컬 `main`이 원격과 같은 이력인지 확인하고, 아니면 이름만 바꿔 보존한 뒤 원격에 맞춘다)과 `.claude/skills/jam-work/references/scheduled-jobs.md`의 주간 배포 절차.
- 승격 명령(`JAM_SHIP=1 git push origin main`)은 그대로 둬 `.claude/settings.json`의 자동 허용 규칙과 어긋나지 않는다.

### 변경된 파일
```
- .claude/skills/jam-ship/SKILL.md
- .claude/skills/jam-work/references/scheduled-jobs.md
- (로컬 git 브랜치 이름 변경: main → main-pre-reintegration-20260918, 새 main 생성. 저장소에 커밋되는 파일 아님)
```

### 테스트 결과
- [x] `git merge-base main origin/main` = `50e07c97`, `git merge-base --is-ancestor main origin/staging` 성공

### 주요 의사결정 / 핵심 메모
- **원인은 여전히 확인하지 못했다**(원격 이력이 언제 바뀌었는지, 로컬 `main`이 언제부터 어긋났는지). 2026-09-20 저장소 재통합 때 이력이 다시 쓰인 것으로 추정한다(`docs/agents/orchestrator.md` §5). 재발하면 위 안내로 복구한다.
- **이 조치는 이 PC에만 적용된다.** 로컬 브랜치 상태는 저장소에 없으므로 다른 PC에서도 같은 증상이 있으면 `jam-ship` 7절의 확인·복구를 그 PC에서 한 번 실행한다.
- 백업 브랜치는 필요 없다고 확인되면 지워도 된다(`git branch -D main-pre-reintegration-20260918`, 사용자 판단).
