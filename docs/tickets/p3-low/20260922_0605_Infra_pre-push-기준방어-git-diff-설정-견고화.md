---
id: "20260922_0605"
category: Infra
priority: P3
status: OPEN
created: 2026-09-22
parent: "20260922_0206"
---

# [Infra] pre-push 기준 방어의 `git diff` 호출을 사용자 설정에 흔들리지 않게 한다 (색상 강제·비ASCII 경로)

## 핵심 요약

- 요구사항: 기준 방어(`.githooks/pre-push`)가 `git diff`를 사용자·환경의 git 설정에 맡긴 채 호출해서, 설정에 따라 검사가 조용히 꺼지거나 파일을 놓친다. (1) `color.diff=always`이면 ANSI 색상 코드가 헤더·hunk·추가 줄 앞에 붙어 awk 패턴이 하나도 맞지 않는다. 그러면 아무것도 수집되지 않고 통과한다(fail-open). (2) 기본 설정(`core.quotePath=true`)에서 비ASCII 경로는 따옴표와 8진수 이스케이프로 출력돼 `^jam-web/` 필터를 빠져나간다.
- 구현 계획: 훅의 `git diff` 호출을 `git -c core.quotePath=false -c color.ui=never diff --no-color --unified=0 ...`으로 바꾸고, 임시 저장소 테스트에 두 시나리오를 추가한다. 옛 훅에서 실패하는 것을 먼저 확인한다.
- 관련 파일: `.githooks/pre-push`(기준 방어 절의 `git diff`), `scripts/pre-push-guard-bar.test.mjs`, `.githooks/pre-commit`(336행, 확인만)
- 상위 티켓: 20260922_0206. 출처: 민지 게이트의 범위 밖 발견물과 아현의 `[참고]`. 경로: ③ 표준(infra)

## 배경 / 문제 정의

민지가 임시 저장소에서 재현했다. `color.diff=always`로 사유 없는 `eslint-disable`을 넣은 push와 `jam-web/src/한글.ts`에 같은 것을 넣은 push가 옛 훅과 새 훅 모두 exit 0이었다. 이 PC의 git 설정에는 `color.diff`·`color.ui`가 없고, 현재 `jam-web`의 비ASCII 경로 파일 9개는 전부 png·sql이라 기준 방어 대상 확장자(ts·tsx·js·jsx·mjs·cjs)로는 0개다. 그래서 지금 영향은 없다. 다른 PC의 git 설정은 확인하지 못했다. 기준 방어의 목적이 "기준을 낮추는 변경을 기계가 막는다"인데 설정 하나로 통째로 꺼질 수 있는 것이 문제다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. 기준 방어의 `git diff` 호출에 `--no-color`와 `-c core.quotePath=false`를 지정한다. 같은 훅의 다른 `git diff`·`git show` 호출도 같은 영향을 받는지 확인한다.
2. 테스트: (a) `color.diff=always`를 설정한 임시 저장소에서 사유 없는 `eslint-disable` push가 차단된다. (b) `jam-web/src/한글.ts`에 같은 것을 넣은 push가 차단된다.
3. 선택: 차단 메시지에 위반 줄과 함께 파일 경로를 출력한다(민지가 파일 귀속을 마커 문자열로 간접 검증해야 했던 이유).
4. `.githooks/pre-commit` 336행의 `+++*) continue`도 내용이 `++`로 시작하는 줄을 건너뛰는 같은 종류의 패턴이다. 그 검사는 파일별 `git diff --cached -U0 -- <파일>`로 돌아 파일 귀속 문제는 없고 영향도 낮으므로, 고칠지 확인만 하고 결과를 기록한다.

## 구현 계획

1. 재현 테스트 작성(옛 훅 실패 확인) → 호출 수정 → `scripts/verify.sh` 통과.

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- 색상 강제 설정과 비ASCII 경로 두 시나리오 테스트가 옛 훅에서 실패하고 수정 뒤 통과한다.
- 기존 기준 방어 테스트 13개와 워크트리 차단 테스트가 그대로 통과한다. `scripts/verify.sh`가 통과한다.

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
- 환경: staging (빌드 없음)
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
