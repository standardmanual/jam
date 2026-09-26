---
id: "20260926_1223"
category: Infra
priority: P3
status: OPEN
created: 2026-09-26
closed:
parent: "20260926_1202"
specs: []
---

# [Infra] plan_only 「100줄 이상」 기준의 측정 방식을 stop-conditions.md에 명시한다

> 발견 경위: 티켓 20260926_1203·1204 구현 중 아현·민지가 함께 지적했다(범위 밖 발견물).

## 핵심 요약

- 요구사항: `.claude/skills/jam-work/references/stop-conditions.md` 26행의 「파일 5개 초과 또는 100줄 이상」에서 「100줄」을 무엇으로 셀지(추가+삭제 합계인지, 신규 파일·테스트 포함인지, 문서 제외인지) 한 문장으로 정한다.
- 구현 계획: 실측 사례를 근거로 기준을 정하고 그 문장을 stop-conditions.md에만 적는다(다른 문서는 참조만).
- 관련 파일: `.claude/skills/jam-work/references/stop-conditions.md`(24~35행), `.claude/agents/jam-developer.md`(Stop conditions), `scripts/verify.sh`가 아니라 아현이 `git diff --numstat`으로 재는 값(`devResult.diffLineCount`)

## 배경 / 문제 정의

2026-09-26 실측 두 건.
- 1203: 코드 변경은 라우트 2개 약 10줄이었지만 테스트 포함 추가+삭제 165줄이라 「100줄 이상」에 걸렸고, 아현은 구현·push를 끝낸 뒤에야 이를 알았다.
- 1204: 파일 3개인데 신규 파일 줄 수만으로 100줄을 넘어 `plan_only`로 한 번 멈췄고, 면제 부여 후 재호출해야 했다(1차 호출 약 43k 토큰 낭비).
기준이 모호해 같은 크기의 일이 어떤 때는 통과하고 어떤 때는 멈춘다. 카리나의 1단계 규모 사전 판정도 「몇 줄」로 셀 수 없어 빗나간다.

## 상세 요구사항

- 측정 대상(추가+삭제 합계인지 순증인지), 포함 범위(테스트·신규 파일·문서), 재는 명령(`git diff --numstat` 기준)을 정한다.
- 1단계 규모 사전 판정에서 카리나가 같은 방식으로 예측할 수 있는 형태여야 한다(예: 신규 파일은 예상 줄 수를 합산).

## 완료 조건

- stop-conditions.md에 측정 방식이 한 문장 이상 명시돼 있고, jam-developer.md·SKILL.md 1단계 3번이 그 절을 가리킨다(서술 복사 없음).
- `scripts/check-contract.mjs`가 통과한다.

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
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
