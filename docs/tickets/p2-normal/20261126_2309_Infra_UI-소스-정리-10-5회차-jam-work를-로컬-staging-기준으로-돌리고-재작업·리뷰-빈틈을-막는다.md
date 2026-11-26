---
id: "20261126_2309"
category: Infra
priority: P2
status: CLOSED
created: 2026-11-26
closed: 2026-11-26
parent: "20261125_1923"
---

# [Infra] UI 소스 정리 10-5회차: jam-work를 로컬 staging 기준으로 돌리고 재작업·리뷰 빈틈을 막는다

## 핵심 요약

- 요구사항: 상위 티켓 20261125_1923 10회차 운영 항목(3·5·7·8·9회차에서 넘긴 것). 2026-11-10부터 staging push를 사용자 요청 때만 하므로 로컬 staging이 원격보다 앞선 채 회차가 돈다. 그런데 jam-work는 `origin/staging`을 기준으로 삼아 다섯 가지 문제가 반복됐다: ① 검토 범위에 앞 회차 커밋이 섞인다 ② 재작업 때 옛 아현 작업 폴더가 리뷰 브랜치를 점유한다 ③ 아현이 리뷰 브랜치 push를 시도한다 ④ 민지 작업 폴더에 설치본이 없어 전체 시험을 못 돌린다 ⑤ 아현이 바꾼 이름·문자열을 확인하는 시험이나 짝 파일을 놓친다.
- 사용자 승인: 2026-11-26 — 운영 항목을 10회차에 넣는다(«전부 10회차에 넣기»), 리뷰 브랜치는 로컬에만 두고 머지 전 실제 설치본 verify는 카리나가 한다(«로컬 유지»).
- 관련 파일: `.claude/workflows/jam-work.js`(아현 첫 명령 403행 부근, 재시도 문구 408-411행, 게이트 폴백 168-177행)와 `.claude/workflows/jam-work.test.mjs`, `.claude/agents/jam-developer.md`(규칙 5 «리뷰 브랜치 push» 36-56행), `.claude/agents/jam-reviewer.md`(점검표 1번 기계 검사 83-88행), `.claude/skills/jam-work/SKILL.md`(2단계 `retryBranch` 설명, 4단계 1번 오염 검사·CI 확인, 참고 «워크트리 최신성»), `scripts/cleanup-stale-worktree.sh`와 `scripts/cleanup-stale-worktree.test.mjs`. 처리 규칙표·`orchestrator.md`는 10-4가 고치는 중이라 건드리지 않는다.
- 화면 변화: 없음.

## 구현 계획

1. 기준 브랜치를 로컬 `staging`으로: 아현 첫 명령을 `git checkout --detach staging && scripts/workspace-setup.sh link "$(pwd)"`로(fetch 없음, 워크트리는 같은 저장소라 로컬 브랜치가 보인다). 새 브랜치는 `git checkout -b claude/jamwork-{id}-{slug} staging`, 반환하는 `baseSha`는 그때의 `git rev-parse staging`. `retryBranch`는 원격이 아니라 로컬 브랜치를 그대로 체크아웃한다. 게이트 폴백(168-177행)의 `origin/staging`도 `staging`으로. SKILL.md 2단계 설명과 «워크트리 최신성» 참고를 맞춘다. 원격에만 있고 로컬에 없는 경우는 없다고 보되, 로컬 `staging`이 없으면 멈추고 보고하게 한다.
2. 옛 작업 폴더의 브랜치 점유: `scripts/cleanup-stale-worktree.sh`가 «origin에 push하지 않은 커밋이 있으면 거절(종료 코드 2)»해서 로컬 전용 리뷰 브랜치에서는 늘 거절된다. 커밋은 브랜치에 남으므로 거절 조건은 «커밋하지 않은 변경이 있을 때»만 남기고, 작업 폴더를 지우는 대신 `checkout --detach`로 브랜치만 풀게 바꾼다(작업 폴더 삭제는 기존 정리 루틴 몫). 시험을 고친다.
3. push: 아현 정의 규칙 5와 `jam-work.js` 재시도 문구에서 리뷰 브랜치 push를 지우고 «리뷰 브랜치는 로컬에만 둔다. push하지 않는다»를 기본으로 둔다(요청문에 따로 적을 필요가 없게). SKILL.md 4단계 1번의 «CI 상태 확인»은 «카리나가 머지 전에 npm ci 설치본 작업 폴더에서 staging과 리뷰 브랜치를 detached로 합쳐 `scripts/verify.sh`를 돌린다»로 바꾸고, 오염 검사는 `git log --oneline staging..<브랜치>`가 이 티켓 커밋만 담는지로 바꾼다.
4. 민지 설치본: 민지 정의 점검표 1번 — CI 상태가 없으면(로컬 전용 브랜치) 전체 verify는 돌리지 않고 바뀐 파일의 시험·검사기만 돌린 뒤 «전체 verify는 카리나가 실제 설치본에서 머지 전에 돌린다»로 적는다. 이것만으로 WARN 사유로 삼지 않는다.
5. 아현 변경 누락: 아현 정의에 «이름·경로·문자열을 바꾸거나 지웠으면 제출 전에 `git grep -n -F '<옛 문자열>'`로 시험·스토리·문서·생성 문서에 남은 곳을 찾아 함께 고친다. 짝으로 바뀌어야 하는 파일(패키지 목록과 잠금 파일, 생성기와 생성 문서 등)이 diff에 함께 있는지 확인한다»를 넣는다.
6. 확인(아현): `node .claude/workflows/jam-work.test.mjs`, `node scripts/cleanup-stale-worktree.test.mjs`, `node scripts/check-skills.mjs`, `node scripts/check-contract.mjs`, `node scripts/gen-team-doc.mjs --check`, `node scripts/gen-team-map.mjs --check`(낡으면 다시 생성). **push하지 않는다.**

## 완료 조건

- `jam-work.js`에 `origin/staging` 기준 명령이 남지 않고(설명 주석 제외), 시험이 새 명령을 확인한다.
- 커밋만 있고 변경이 없는 옛 작업 폴더가 브랜치를 잡고 있을 때 정리 스크립트가 브랜치를 풀고, 커밋하지 않은 변경이 있으면 거절하는 것을 시험으로 보인다.
- 민지 PASS 또는 WARN, 카리나가 실제 설치본 verify 통과 확인 뒤 사용자 머지 승인.

## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 리뷰 브랜치 `claude/jamwork-20261126_2309-jamwork-local-staging`(로컬, `9d9e51bbc..12ca9768c`)를 로컬 staging에 머지(`8a2a3e001`, 사용자 승인 2026-11-26 «머지해»). push 안 함. 리뷰 브랜치는 아현 작업 폴더에서 풀어 지웠다.
- `jam-work.js`: 아현 첫 명령은 `git checkout --detach staging && scripts/workspace-setup.sh link`(fetch 없음, 로컬 staging이 없으면 멈추고 보고), 재시도는 로컬 브랜치를 그대로 체크아웃하고 push 금지, 게이트 첫 명령은 fetch 없이 `git checkout --detach <sha>`, 범위가 없을 때 폴백은 `staging`. `origin/staging`은 설명 주석 한 곳에만 남았다.
- `scripts/cleanup-stale-worktree.sh`: 커밋하지 않은 변경이 있을 때만 거절(종료 코드 2)하고, 그 밖에는 작업 폴더를 지우지 않고 `checkout --detach`로 브랜치만 푼다. origin 확인·fetch 제거.
- 아현 정의 규칙 5: 리뷰 브랜치는 로컬에만 둔다(10-2가 넣은 «기본 push»를 되돌림), 기준은 로컬 `staging`, `baseSha`는 `git rev-parse staging`. 이름·경로·문자열을 바꾸거나 지웠으면 `git grep -n -F`로 남은 곳을 찾고 짝 파일을 확인한다.
- 민지 정의 점검표 1번: CI 상태가 없으면 바뀐 파일의 시험·검사기만 돌리고 «전체 verify는 카리나가 실제 설치본에서 머지 전에 돌린다»로 적는다(이것만으로 WARN 아님).
- jam-work SKILL.md: 2단계 `retryBranch`, 일괄 머지 순서, `gateOnly` 임시 워크트리 절차, 4단계 1번(오염 검사 `git log --oneline staging..<브랜치>`, CI 확인 → 카리나의 설치본 verify), 4.1절, «워크트리 최신성»을 같은 방향으로.

### 변경된 파일
```
.claude/workflows/jam-work.js·jam-work.test.mjs, .claude/agents/jam-developer.md·jam-reviewer.md, .claude/skills/jam-work/SKILL.md,
scripts/cleanup-stale-worktree.sh·cleanup-stale-worktree.test.mjs (7개, +91 −106)
```

### 테스트 결과
- [x] jam-work.test.mjs(test4·24~26 새 명령 확인), cleanup-stale-worktree.test.mjs(미커밋 변경 없으면 브랜치만 풀림·있으면 종료 코드 2), check-skills, check-contract, gen-team-doc·gen-team-map --check 통과
- [x] 카리나: 실제 설치본에서 staging `9d9e51bbc` + 10-5(`12ca9768c`)로 `scripts/verify.sh` 20단계 모두 통과
- [x] 민지 판정 **PASS**

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 아현·민지 | 116,323 | 27,636 / 13,004 | 2분 27초 | 27 |
| 합계 | 2 | 116,323 | 27,636 / 13,004 | 2분 27초 | 27 |

### 주요 의사결정 / 핵심 메모
- 이번 실행은 고치기 전 `jam-work.js`로 돌았으므로 요청문에 «fetch하지 말고 로컬 브랜치 체크아웃»을 적었다. 다음 실행부터는 스크립트가 그렇게 지시한다. 세션의 에이전트 정의는 세션을 시작할 때 읽히므로, 새 정의는 다음 세션부터 적용된다.
- 아현이 티켓에 없던 게이트 첫 명령(`git fetch origin <branch>`)도 함께 고쳤다(로컬 전용 브랜치에서 실패하므로 같은 목적).
- 사용자 승인: 2026-11-26 — 운영 항목 10회차 포함, 리뷰 브랜치 로컬 유지(«로컬 유지»), 머지(«머지해»)

### 잔여 이슈
- `jam-work.test.mjs:559` test26의 함수 이름이 `OriginStaging`으로 남아 실제 동작과 어긋난다(민지 참고, 동작 무관).
