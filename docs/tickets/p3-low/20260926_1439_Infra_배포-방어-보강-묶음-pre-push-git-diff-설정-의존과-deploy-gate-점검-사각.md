---
id: "20260926_1439"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
related:
  - "20260922_0605"
  - "20260922_0653"
---

# [Infra] 배포 방어 보강 묶음: pre-push의 `git diff` 설정 의존(0605)과 deploy-gate 점검 사각(0653)

> 하위 티켓들을 한 번의 구현·게이트·병합으로 처리하기 위한 묶음 티켓이다(사용자 지시, 2026-09-26). 끝나면 하위 티켓도 함께 닫는다. **각 하위 티켓의 「구현 계획」과 「완료 조건」이 세부 기준이다. 아래 표는 파일 단위 실행 범위이고, 세부 요구사항은 하위 티켓 본문(`docs/tickets/`)을 읽는다.**

## 핵심 요약

- 요구사항: (1) `.githooks/pre-push` 기준 방어가 `git diff`를 사용자·환경 git 설정에 맡긴 채 호출해서 `color.diff=always`이면 awk 패턴이 하나도 맞지 않고 비ASCII 경로는 따옴표로 감싸져 파일을 놓친다. 설정에 흔들리지 않게 고친다(티켓 20260922_0605). (2) `scripts/deploy-gate.mjs`에 민지가 재현한 점검 사각 3건(따옴표 없는 `.env` 비밀 대입, 규칙 밖 이름의 `.sql`, 스테이징 쿠키)을 줄인다(티켓 20260922_0653).
- 관련 파일: `.githooks/pre-push`, `scripts/pre-push-guard-bar.test.mjs`, `scripts/deploy-gate.mjs`, `scripts/deploy-gate.test.mjs`.

## 구현 계획

### 파일 단위 계획 (규모 사전 판정, 2026-09-26)

| # | 파일 | 하는 일 | 예상 줄 수 |
|---|---|---|---|
| 1 | `.githooks/pre-push`(기준 방어 절의 `git diff` 호출) | `git -c core.quotePath=false -c color.ui=never diff --no-color --unified=0 ...`로 바꾼다. `.githooks/pre-commit` 336행은 확인만 한다 | 약 6 |
| 2 | `scripts/pre-push-guard-bar.test.mjs` | 임시 저장소 시나리오 2개 추가: `color.diff=always` 설정, 비ASCII 경로. **옛 훅에서 실패하는 것을 먼저 확인한 뒤** 고친 훅으로 통과시킨다 | 약 50 |
| 3 | `scripts/deploy-gate.mjs` | 하위 티켓 0653 「구현 계획」대로: (1) `.env*`(`.example`·`.sample`·`.template` 제외)에서 따옴표 없는 `NAME=<16자 이상>` 대입과 백틱 대입도 비밀로 본다(코드 파일은 지금처럼 따옴표 대입만, `process.env.X` 오탐 회피). (2) 규칙 밖 이름의 `.sql`을 `others`로 센다. (3) 스테이징 쿠키 사각(하위 티켓 본문 참고) | 약 40 |
| 4 | `scripts/deploy-gate.test.mjs` | 사각 3건을 재현하는 케이스와 오탐이 없는 케이스 | 약 70 |

- 예상 합계 약 170줄, 변경 파일 4개라 100줄 기준을 넘긴다. `planOnlyWaiver`로 첫 호출부터 면제한다. **이 파일들은 배포·푸시 관문이므로 테스트는 반드시 임시 저장소에서만 돌리고 메인 저장소의 훅·브랜치를 바꾸지 않는다.** 기존 정상 push가 새로 막히지 않는지도 테스트로 확인한다.

## 완료 조건

- `color.diff=always`와 비ASCII 경로에서 옛 훅은 검사가 꺼지거나 놓치고 새 훅은 정상 검사한다(임시 저장소 테스트).
- deploy-gate의 세 사각이 테스트로 재현되어 막히고, 오탐 케이스(예: `.env.example`, `process.env.X`)는 통과한다. `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 하위 티켓 두 건(20260922_0605, 20260922_0653)을 한 번의 구현·게이트·병합으로 처리했고 두 건도 함께 CLOSED로 바꿨다. 세부는 각 하위 티켓의 완료 기록에 있다.

### 변경된 파일
```
- .githooks/pre-push
- scripts/pre-push-guard-bar.test.mjs
- scripts/deploy-gate.mjs
- scripts/deploy-gate.test.mjs
```
(jam-web 변경 없음, 합계 추가 196줄·삭제 15줄)

### 테스트 결과
- [x] `scripts/verify.sh` 전 항목 통과, CI `verify` 성공(실행 36221874364, 커밋 86e59147)
- [x] 민지 게이트 **PASS**. 점검 12항목 중 1·2·3·4·5·9·10·11 통과, 나머지 해당 없음. 게이트가 별도 워크트리에서 옛 훅·옛 deploy-gate로 새 테스트를 돌려 실패함을 재현했다. 검토 범위 0e21bc0a..86e59147
- [x] 병합 뒤 `pre-push` 문법 검사, `deploy-gate check`, `check-contract` 통과

### 배포 정보
- 배포일: 2026-09-26 (staging 병합·push). 프로덕션은 `/jam-ship`으로 별도 진행
- 커밋: 구현 833b82ac·86e59147, 병합 a6a17bd8 (리뷰 브랜치 `claude/jamwork-20260926_1439-deploy-defense`)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 (묶음 2건, 게이트 PASS) | 136,912 | 104,102 / 25,244 | 12.7분 | 60 |
| 합계 | 2 | 136,912 | 104,102 / 25,244 | 12.7분 | 60 |

### 주요 의사결정 / 핵심 메모
- **관문 파일이라 테스트를 임시 저장소에서만 했다.** `pre-push` 훅과 `deploy-gate`는 push·배포를 막는 관문이라 메인 저장소의 훅·브랜치를 바꾸지 않고, 각 사각을 그 부분만 옛 방식으로 되돌린 임시 복사본에서 실패시켜 테스트가 실제로 잡는지 확인했다.
- **`deploy-gate.mjs`는 이번 세션의 배포 검증 도구다.** `served`(서빙 배포 id 확인)의 리다이렉트 처리를 고쳤으므로 다음 `/jam-ship`에서 실제 프로덕션 응답으로 다시 확인한다.
- **계획 반환 면제.** 파일 4개·예상 약 170줄이라 티켓에 파일 단위 계획을 적고 첫 호출부터 면제했다. 실제 +196/−15줄로 예상 범위 안이었다.
- **범위 밖 발견물(민지 [참고])** → P3 티켓 생성: `pre-commit`의 `.from('badges')` 경고 검사가 색상 설정에 약함. 옛 훅에서 시나리오 16·17 재현이 안 된 것은 0605에 기록했다.

### 잔여 이슈
- `.githooks/pre-commit:354` 부근 경고 검사(후속 티켓).
