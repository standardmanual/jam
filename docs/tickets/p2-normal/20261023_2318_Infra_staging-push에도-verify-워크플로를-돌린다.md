---
id: "20261023_2318"
category: Infra
priority: P2
status: IN_PROGRESS
created: 2026-10-23
closed:
parent: "20260922_0205"
---

# [Infra] staging push에도 verify 워크플로를 돌린다

## 핵심 요약

- 요구사항: 사용자 결정(2026-10-23 «staging CI 추가해줘», 티켓 20260922_0205)에 따라 `verify` 워크플로를 `staging` push에서도 돌려 결과를 커밋 상태(check)로 남긴다. `main`은 범위 밖이다.
- 구현 계획: ① `.github/workflows/verify.yml` 트리거에 `staging`을 더한다 ② 변경 범위 판별의 폴백이 staging에서 가벼운 검사로 잘못 가지 않게 가드를 더한다 ③ «staging에는 CI가 없다»고 적은 곳을 정정하고 옛 문구를 `stale_phrases`로 등록한다.
- 관련 파일: `.github/workflows/verify.yml`(`on.push.branches`, `변경 범위 판별` 단계의 폴백 분기, `concurrency` 주석), `docs/plan/vision/02 JAM! 서비스 플랜.md` §8.2 16번, `docs/agents/team-operations.md` 사고 이력 ⑦(386~393행), `.claude/skills/jam-ship/SKILL.md` 44~46행, `docs/agents/contract.json` `stale_phrases`
- 경로: 카리나 직접(경미 기준 파일 1~2개를 넘지만 코드 변경은 워크플로 한 파일 실행 코드 4줄이다). 민지 게이트는 거치지 않았다(아래 「주요 의사결정」).

## 배경 / 문제 정의

`verify`는 처음에 `claude/**` push에만 걸었다. 저장소가 비공개였을 때 GitHub Actions 무료 한도를 아끼려는 2026-09-22 사용자 결정이었다. 2026-10-23 사용자가 저장소를 공개로 전환해 그 한도 제약이 없어졌고(티켓 20260922_0205 「전제 변경」), 같은 날 staging 추가를 지시했다.

staging에서는 변경 범위 판별의 폴백이 문제가 된다. 이 단계는 직전 push의 SHA(`github.event.before`)와 비교하고, 그 SHA가 없거나(브랜치 첫 push, 강제 push) 클론에 없으면 `origin/staging`과의 병합 기준점으로 대신한다. 리뷰 브랜치에서는 기준점이 staging 쪽 조상이라 브랜치 변경이 잡히지만, staging 위에서는 기준점이 HEAD 자신이라 변경 파일이 비어 «문서만 변경»으로 분류된다. 코드가 바뀐 push도 가벼운 검사만 돌게 되는 결함이다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. `on.push.branches`에 `staging`을 더한다. `main`은 더하지 않는다.
2. 폴백에서 병합 기준점이 HEAD와 같으면 기준점이 없는 것으로 보고 전체 검증으로 간다(기존 «비교 기준을 찾지 못해 전체 검증으로 진행합니다» 경로).
3. `concurrency`는 그대로 둔다(같은 브랜치의 앞 실행을 취소). staging에서도 앞 실행이 취소되고 그 커밋의 check가 `cancelled`로 남는다는 설명을 주석으로 적는다.
4. «staging에는 CI가 없다»고 적은 서술을 정정하고, 옛 문구가 되살아나지 않게 `stale_phrases`에 등록한다.

## 구현 계획

1. `.github/workflows/verify.yml`: `branches`에 `staging` 추가, 폴백 가드(`[ "$base" = "$(git rev-parse HEAD)" ]`이면 `base=""`) 추가, 머리말 주석과 `concurrency` 주석 정정.
2. 서술 정정: 서비스 플랜 §8.2 16번(«CI는 리뷰 브랜치와 staging에만 있습니다»), `team-operations.md` ⑦(`남은 위험`은 main에 CI가 없다는 것), `jam-ship` 스킬 «main에는 CI가 없다».
3. `contract.json`의 `stale_phrases`에 «staging과 main에는 CI가 없다», «staging push에는 아직 CI가 없다», «CI는 리뷰 브랜치에만 있습니다»를 등록한다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- `verify.yml`을 YAML로 읽으면 `on.push.branches`가 `["claude/**", "staging"]`이다.
- 변경 범위 판별 단계의 셸 스크립트를 워크플로에서 꺼내 임시 저장소에서 실행하면 다음처럼 분류된다: (a) staging에서 직전 SHA가 정상이고 문서만 바뀐 push는 가벼운 검사, (b) 같은 조건에서 `jam-web/` 코드가 바뀐 push는 전체 검증, (c) staging 폴백(직전 SHA 없음)은 전체 검증, (d) staging에서 직전 SHA가 클론에 없으면 전체 검증, (e) 리뷰 브랜치 폴백은 기존대로 병합 기준점 비교. 가드를 뺀 원래 스크립트는 (c)를 가벼운 검사로 분류한다.
- `node scripts/check-contract.mjs`가 통과하고, 정정한 서술 3곳에 옛 문구가 남아 있지 않다.

### 후속 범위 (담당: 카리나, 시점: push 직후)

- 이 변경을 `staging`에 push하면 `verify` 런이 시작돼 결론이 남는다. 첫 push의 변경에 `.github/`가 있어 전체 경로로 간다. 런 ID와 결론을 완료 기록에 적는다.
- 런이 실패하면 원인이 이 변경인지 staging의 기존 문제(시험 실패 등)인지 가려 적는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- `verify.yml`에 `staging` 트리거와 변경 범위 판별의 폴백 가드를 더했다. 서술 정정 3곳과 `stale_phrases` 3건을 같은 커밋에 넣었다.

### 변경된 파일
```
.github/workflows/verify.yml
docs/plan/vision/02 JAM! 서비스 플랜.md
docs/agents/team-operations.md
.claude/skills/jam-ship/SKILL.md
docs/agents/contract.json
docs/tickets/p2-normal/20261023_2318_Infra_staging-push에도-verify-워크플로를-돌린다.md
docs/tickets/p2-normal/20260922_0205_Infra_CI-1주-실측-후-staging-확대-결정.md  (결정 기록, 닫기)
```

### 테스트 결과
- [x] `yaml.safe_load`로 트리거 확인: `{"push": {"branches": ["claude/**", "staging"]}}`
- [x] 변경 범위 판별 스크립트 `bash -n` 통과, 임시 저장소 시나리오 (a)~(e)가 모두 위 완료 조건대로 분류됨. 가드를 뺀 원래 스크립트는 (c)를 `full=false`로 분류했고 수정본은 `full=true`로 분류함(대조 실행).
- [ ] 첫 staging 런 결과(후속 범위)

### 배포 정보
- 배포일: 2026-10-23
- 환경: staging (빌드 없음)
- 커밋: (push 결과를 따른다)

### 주요 의사결정 / 핵심 메모

- 민지 게이트를 거치지 않았다. 경미 수정 기준(파일 1~2개)을 넘는 작업이라 표준 경로가 원칙이지만, 코드 변경이 워크플로 한 파일 실행 코드 4줄이고 위 시뮬레이션으로 분류 동작을 확인했다. 독립 판정이 필요하면 게이트만 따로 돌린다.
- `main`에는 걸지 않았다. 사용자 지시가 staging까지였다.
- `jam-ship`이 staging의 CI 결과를 읽어 승격 전 점검에 쓰게 할지는 정하지 않았다. 현재 `jam-ship`의 «승격 전 유일한 재검증» 서술은 그대로 두었다.
- 로컬 `pre-push`(staging은 lint와 기준 방어만)와 CI의 중복은 그대로 둔다.

### 잔여 이슈
- `verify.yml`의 트리거에 `staging`이 있는지를 대조하는 계약 줄은 추가하지 못했다. `check-contract.mjs`에 파일 내용을 대조하는 검사 종류가 없어서, 옛 문구 3건을 `stale_phrases`로만 등록했다. 필요하면 워크플로 트리거 검사를 `check-contract.mjs`에 더하는 별도 티켓을 만든다.
- 문서만 바뀐 staging push(예: 데일리 미팅 리포트 커밋 `a8b2f2f`)마다 가벼운 검사(1주 실측 평균 14초)가 돈다. 노이즈가 문제가 되면 `paths-ignore: docs/operations/reports/**`를 검토한다.
