---
id: "20260925_0507"
category: Infra
priority: P3
status: OPEN
created: 2026-09-25
closed:
parent: "20260924_2154"
---

# [Infra] 격리 워크트리의 `typecheck`가 메인 폴더·CI와 다르게 실패한다는 보고를 확인한다

> 티켓 20260924_2201 실행 중 아현의 보고와 카리나의 실측이 어긋나 남긴 티켓이다. 서브에이전트가 "무관한 기존 오류"라고 판단해 게이트에 실패 신호를
> 넘길 수 있어 원인을 좁혀 둔다.

## 핵심 요약

- 요구사항: 아현은 2201의 격리 워크트리(`.claude/worktrees/wf_*`)에서 `scripts/verify.sh`의 `typecheck`가 shader-lab 파일 5곳(`ShaderLabPropertiesPanel.tsx` 등,
  `"liquid-metal"` 누락 오류)에서 실패했고 `git stash`로 `origin/staging`(6092364c) 원본에서도 재현했다고 보고했다. 같은 커밋의 CI `verify`(typecheck 포함)는
  성공했고, 메인 폴더에서 머지 뒤 `npm run typecheck`도 종료 코드 0이었다. 격리 워크트리에서만 나는 차이의 원인을 확인하고 재발을 막는다.
- 구현 계획: 원인 후보를 좁힌다. (a) 워크트리의 `jam-web/node_modules`가 메인 폴더 링크라서 `postinstall`의 패치(`patch-package`, 메인 폴더 설치 시 출력된
  "Applying patches... @basementstudio/shader-lab@3.0.2")가 워크트리의 타입 검사에서 다르게 보이는지, (b) `.next/types` 캐시, (c) 워크트리 생성 기준 브랜치.
  원인이 확인되면 `docs/agents/`의 격리 워크트리 절차나 아현 정의의 "검사 실패 시 판단" 문구에 한 줄을 남긴다.
- 관련 파일: `scripts/verify.sh`(typecheck 단계 36줄 근처), `jam-web/package.json`(`typecheck` 스크립트, patch-package 설정),
  `jam-web/patches/`, `docs/agents/team-operations.md`(격리 워크트리 절), `.claude/agents/jam-developer.md`(Hard rule 13)

## 배경 / 문제 정의

아현이 무관한 실패라고 보고하고 넘어가는 규칙(Hard rule 13)은 원본에서도 재현될 때만 성립한다. 이번에는 워크트리에서는 재현되고 메인·CI에서는 재현되지 않아
"기존 오류"라는 판단이 틀렸다. 같은 일이 실제 결함을 가릴 수도 있다.

## 완료 조건
- 격리 워크트리와 메인 폴더의 `typecheck` 결과가 갈리는 원인이 확인되어 이 티켓에 적혀 있다.
- 재발 방지가 필요하면(절차·문구) 해당 문서에 반영한다. 필요 없으면 근거를 적고 닫는다.

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

### 잔여 이슈
-
