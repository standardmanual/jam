---
id: "20261014_1442"
category: Infra
priority: P3
status: OPEN
created: 2026-10-14
closed:
---

# [Infra] pre-push 훅이 브랜치 삭제 push에도 전체 검증을 돌린다

## 핵심 요약

- 요구사항: `.githooks/pre-push`의 리뷰 브랜치 verify 게이트가 삭제 push(`local_sha`가 전부 0)에서는 실행되지 않게 한다.
- 구현 계획: `case "$branch" in claude/jamwork-*)` 게이트 앞에 `[ "$local_sha" != "$zero_sha" ]` 조건을 둔다. 삭제 push에서 verify가 호출되지 않는 훅 테스트를 더한다.
- 관련 파일: `.githooks/pre-push`(리뷰 브랜치 verify 게이트, 262~292행 부근), 기존 훅 테스트 `scripts/pre-push-worktree-block.test.mjs`

## 배경 / 문제 정의

### 관찰한 사실 (2026-10-14 14:30경 KST)

- `git push origin --delete`로 `claude/jamwork-*` 원격 브랜치 25개를 지우려 하자 5분이 넘도록 끝나지 않았다.
- 그동안 pre-push 훅의 자식 프로세스로 `scripts/verify.sh`가 실행 중인 것을 확인했다. 삭제 push인데 코드 검증이 돌고 있었다.

### 코드에서 읽은 사실

- 훅의 다른 구간(39, 109, 191행)은 `local_sha`가 0이면 건너뛴다. 리뷰 브랜치 verify 게이트에는 그 조건이 없다.
- 그래서 삭제 대상 브랜치 이름이 `claude/jamwork-*`이면 삭제 ref마다 전체 검증이 돈다. 이 재현은 코드를 읽기 전 실제 push로 관찰했고, 코드를 고친 뒤 다시 재현하지는 않았다.

## 상세 요구사항

- 삭제 push는 검증할 코드가 없으므로 verify 게이트를 건너뛴다. 건너뛴다는 안내 한 줄을 출력한다.
- 일반 리뷰 브랜치 push의 동작(verify 실행, `JAM_SKIP_VERIFY=1` 우회, wf 워크트리 건너뜀)은 바꾸지 않는다.
- 영향: 병합된 리뷰 브랜치 수백 개를 정리할 때 삭제 push가 사실상 불가능하다. 문서화된 우회(`JAM_SKIP_VERIFY=1`)가 있으나 우회에 기대지 않아도 되게 한다.

## 완료 조건

- 삭제 push(`local_sha`가 0)에서 verify.sh가 호출되지 않는다. 훅 테스트로 고정한다.
- 일반 리뷰 브랜치 push는 기존대로 verify를 실행한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 
