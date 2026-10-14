---
id: "20261014_1442"
category: Infra
priority: P3
status: CLOSED
created: 2026-10-14
closed: 2026-10-14
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

리뷰 브랜치 verify 게이트(`case "$branch" in claude/jamwork-*)`)의 if 체인 맨 앞에 `local_sha`가 전부 0이면 안내 한 줄을 출력하고 건너뛰는 분기를 더했다. `JAM_SKIP_VERIFY=1` 우회, wf 워크트리 건너뜀, node_modules 없음 건너뜀, verify 실행 분기는 바꾸지 않았다. 티켓 구현 계획의 「case 앞에 조건」은 case 안쪽 if 체인의 첫 분기로 구현했고 동작은 같다.

게이트: 민지 PASS(재작업 없음). 변경 전 훅으로 되돌리면 새 사례가 실제로 실패함을 확인했다.

### 변경된 파일
```
.githooks/pre-push (+6/-1)
scripts/pre-push-worktree-block.test.mjs (+16/-3, 사례 (h) 추가)
docs/agents/team-operations.md (+1/-1, 「머지와 배포의 경계」 review 브랜치 행)
docs/agents/team-map.html (+1/-1, 위 문서에서 재생성)
```

### 테스트 결과
- [x] CI verify 성공 (run 38521491905)
- [x] 머지된 상태에서 `scripts/pre-push-worktree-block.test.mjs` 통과 (워크트리 차단·리뷰 브랜치 verify 게이트·삭제 push 건너뜀)
- [x] 기존 사례 (f)(g)가 변경 후 훅에서 그대로 통과

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 (구현·게이트) | 2 | 103,516 | 22,779 / 9,653 | 18분 13초 | 67 |
| 합계 | 2 | 103,516 | 22,779 / 9,653 | 18분 13초 | 67 |

### 잔여 이슈

- `scripts/gen-team-map.mjs` 211행의 팀 지도 훅 목록 줄(`how: ...`)에는 삭제 push 건너뜀이 빠져 있다. 같은 지도의 「머지와 배포의 경계」 표에는 반영됐다. 거짓 서술이 아니라 누락이며 동작에는 영향이 없다.
- 훅은 push하는 쪽 로컬 `.githooks`에서 적용된다. 이 머지 뒤부터 삭제 push에 효력이 있고, 이전 시점의 클론에서는 기존 훅이 돈다.
