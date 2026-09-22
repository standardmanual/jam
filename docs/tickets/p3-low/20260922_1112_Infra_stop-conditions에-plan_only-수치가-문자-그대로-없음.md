---
id: "20260922_1112"
category: Infra
priority: P3
status: OPEN
created: 2026-09-22
parent: "20260921_2305"
---

# [Infra] `stop-conditions.md`가 단일 원천인데 `plan_only`의 수치(파일 5개·100줄)는 아현 정의 표에만 문자 그대로 있다

## 핵심 요약

- 요구사항: 티켓 20260921_2305가 정지 조건 단일 원천을 `.claude/skills/jam-work/references/stop-conditions.md`로 정했고, 티켓 20260922_0619가 민지 점검표 5번에서 "5개 파일 또는 100줄" 수치의 출처로 그 문서를 인용한다. 그런데 그 문서 본문에는 세는 방식만 있고 두 수치가 문자 그대로 적혀 있지 않다. 수치는 `.claude/agents/jam-developer.md`의 Stop conditions 표에 있다. 수치를 `stop-conditions.md`에 한 번만 적고, 아현 정의 표는 그 문서를 참조하게 한다(또는 그 반대 — 어느 쪽이든 한 곳).
- 구현 계획: `stop-conditions.md`의 `plan_only` 항목에 임계값(바뀌는 모든 파일 기준 5개 초과 또는 100줄 이상)을 명시하고, `jam-developer.md` 표의 수치 문장을 참조로 바꾼다. 미러 문서 `docs/agents/workflow/agents/01_아현_개발.md`도 함께 본다(티켓 20260922_1030 대상). `git grep '5개 초과\|100줄'`로 정의가 한 곳인지 확인한다.
- 관련 파일: `.claude/skills/jam-work/references/stop-conditions.md`, `.claude/agents/jam-developer.md`, `.claude/agents/jam-reviewer.md`(인용 문장), `docs/agents/workflow/agents/01_아현_개발.md`
- 상위 티켓: 20260921_2305(하네스 실측 2에서 돌린 0619 게이트의 범위 밖 발견물). 경로: ① 경미(파일 2~3개·10줄 이내 예상)

## 배경 / 문제 정의

민지가 0619 게이트에서 "나중에 `stop-conditions.md`만 보고 수치를 찾으려는 사람이 헷갈릴 수 있다"고 지적했다. 동작에는 영향이 없지만, 단일 원천 문서에 핵심 수치가 없으면 수치를 바꿀 때 원천이 아닌 곳을 고치게 된다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. 임계값은 한 곳에만 문자 그대로 존재한다.
2. 다른 곳은 그 문서를 참조한다.

## 구현 계획

1. 위 「구현 계획」 한 줄대로.

## 완료 조건

- `git grep`으로 임계값 정의가 `stop-conditions.md` 한 곳뿐이다(완료 기록·티켓 제외).

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
