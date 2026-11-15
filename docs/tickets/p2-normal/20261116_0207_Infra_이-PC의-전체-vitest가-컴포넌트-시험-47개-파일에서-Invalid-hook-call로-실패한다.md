---
id: "20261116_0207"
category: Infra
priority: P2
status: OPEN
created: 2026-11-16
closed:
---

# [Infra] 이 PC의 전체 vitest가 컴포넌트 시험 47개 파일에서 Invalid hook call로 실패한다

## 핵심 요약
- 요구사항: 메인 트리(`/Volumes/뚝섬하드/시현/JAM!/jam-web`)에서 `npx vitest run`을 돌리면 `.tsx` 컴포넌트 시험 47개 파일이 `Invalid hook call`로 실패한다. CI에서는 같은 시험이 통과한다. 로컬에서도 전체 시험이 통과하게 한다.
- 구현 계획: 원인을 먼저 찾는다. 후보는 React 사본이 둘 이상 잡히는 경우(메인 트리의 `node_modules`와 다른 경로의 사본, 워크트리 링크, vitest의 해석 경로)다. 원인이 설치 상태면 재설치 절차를 문서에 남기고, 설정이면 설정을 고친다.
- 관련 파일: `jam-web/vitest.config.*`(해석 경로와 dedupe 설정), `jam-web/package.json`, `scripts/verify.sh`(36줄 `run_step test npm test`), `.githooks/pre-push`(로컬 verify를 부르는 구간)

## 배경 / 문제 정의
- 2026-11-16 00:40 KST에 카리나가 메인 트리(staging, 실제 설치된 node_modules)에서 전체 vitest를 돌렸다. 55개 파일 555건이 실패했고, 그 가운데 47개 `.tsx` 파일은 `Invalid hook call`(로그에 519회, `Cannot read properties of null (reading 'useRef')` 등)이었다. `src/components/admin/ops/__tests__/*.test.tsx`, `src/app/admin/missions/MissionForm.test.tsx`, `src/components/admin/balance/__tests__/sections.test.tsx` 등이다.
- 같은 날 CI(run 43735928333)는 이 시험들을 포함해 전부 통과했다. 따라서 코드가 아니라 이 PC의 환경 문제다.
- 지금까지는 «워크트리의 node_modules 심볼릭 링크 때문»으로 알려져 있었는데, 링크가 아닌 메인 트리에서도 똑같이 난다. `node_modules/react`는 한 개(19.2.4)만 보였다.
- 영향: 로컬 `scripts/verify.sh`의 test 단계가 항상 실패한다. 그래서 메인 세션의 리뷰 브랜치 push가 pre-push verify에 막히고, 아현과 민지가 로컬에서 전체 시험으로 회귀를 확인할 수 없다. 파일을 하나씩 돌리는 단독 실행은 통과한다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 실패하는 시험 하나(예: `src/app/admin/missions/MissionForm.test.tsx`)를 단독으로 돌렸을 때와 전체로 돌렸을 때의 차이를 먼저 가린다. 단독은 통과하고 전체에서만 실패한다면 시험 사이의 모듈 캐시나 풀 설정 문제일 수 있다.
- CI와 로컬의 차이(Node 버전, 설치 방식 `npm ci`, 환경 변수)를 대조한다.
- 서비스 코드의 동작은 바꾸지 않는다.

## 구현 계획
다음 작업에서 정한다. 원인 조사가 먼저다.

## 완료 조건
- 메인 트리에서 `cd jam-web && npx vitest run`이 실패 0건으로 끝난다.
- 원인과 재발 방지 방법이 이 티켓의 완료 기록에 적혀 있다. 설치 상태가 원인이면 복구 절차가 `docs/agents/orchestrator.md`에 한 줄로 들어 있다.

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
- 환경: production
- 커밋: 

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
- 출처: 카리나 실측(티켓 20261115_0030 진행 중). 그 티켓에서는 범위 밖으로 두었다.

### 잔여 이슈
-
