---
id: "20260926_1453"
category: Infra
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260922_0605"
  - "20260926_1439"
---

# [Infra] `pre-commit`의 `.from('badges')` 경고 검사가 `color.diff=always`에서 패턴이 맞지 않는다

> 2026-09-26 티켓 20260926_1439 게이트(민지)의 [참고] 발견물이다.

## 핵심 요약

- 요구사항: `.githooks/pre-commit` 354행 부근의 `.from('badges')` 경고 검사가 `git diff --cached -U0 -- "$f"`를 색상·설정 고정 없이 호출한다. `color.diff=always` 설정이면 ANSI 코드 때문에 패턴이 맞지 않아 경고가 조용히 꺼진다(티켓 20260922_0605가 `pre-push`에서 고친 것과 같은 종류). 경고 전용 검사라 급하지 않다. 같은 방식(`-c core.quotePath=false -c color.ui=never diff --no-color`)으로 고친다.
- 관련 파일: `.githooks/pre-commit:354` 부근, 임시 저장소 테스트는 `scripts/doc-check-hook.test.mjs`에 시나리오를 추가한다.

## 완료 조건

- `color.diff=always`에서도 `.from('badges')` 경고가 출력된다(임시 저장소 테스트, 옛 훅에서 실패 확인). 정상 커밋은 막히지 않는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
