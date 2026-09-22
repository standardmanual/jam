---
id: "20260922_1754"
category: Infra
priority: P2
status: OPEN
created: 2026-09-22
closed:
parent: "20260922_1749"
---

# [Infra] `plan_only` 왕복 제거 — 카리나가 티켓 생성 시 규모를 사전 판정한다

## 핵심 요약

- 요구사항: 아현이 탐색만 하고 `plan_only`로 돌아온 뒤 면제를 받아 같은 탐색을 다시 하는 왕복을 없앤다. 카리나가 티켓을 만드는 1단계에서 파일 수·줄 수를 임계값과 견주고, 넘길 것 같으면 쪼개거나 파일 단위 계획을 적고 첫 호출부터 `planOnlyWaiver`를 넘긴다. 아현의 `plan_only`는 안전망으로만 남긴다. `docs` 유형, 카리나 직접(최적화 검토 1749 §2-A).
- 구현 계획: ① `SKILL.md` 1단계에 「규모 사전 판정」 항목 추가 ② `SKILL.md` 3.0절 `plan_only` 후속에 "계획을 티켓으로 옮길 때 파일 경로+함수명까지" 명시 ③ `stop-conditions.md` 면제 조건에 "정상 경로는 카리나 사전 판정, `plan_only`는 안전망" 문단 추가 ④ `handling-rules.md`에 규칙 한 줄.
- 관련 파일: `.claude/skills/jam-work/SKILL.md`(1단계 127~135줄, 3.0절 250~254줄), `.claude/skills/jam-work/references/stop-conditions.md`(면제 부여 조건 32~35줄), `.claude/skills/jam-work/references/handling-rules.md`

## 배경 / 문제 정의

임계값(파일 5개 초과 또는 100줄 이상)에 걸리면 아현은 구현 없이 계획만 반환한다. 최근 사례 3건(20260922_1521·1522·1523)은 그 1차 호출에만 82,613~110,130토큰·3.8~4.9분이 들었고, 면제 후 2차 호출은 새 컨텍스트에서 같은 파일을 다시 읽었다. 세 건 모두 카리나가 만든 이식 티켓이라 처음부터 클 것이 예측 가능했다 — 크기를 재는 일을 아현의 탐색에 맡길 이유가 없다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. 카리나는 티켓 「관련 파일」을 적을 때 파일 수를 센다. 5개를 넘기거나 100줄을 넘길 것 같으면 아현 호출 전에 (a) 티켓을 쪼개거나 (b) 「구현 계획」을 파일 단위(경로+함수명·줄 위치)로 적고 첫 호출에 `planOnlyWaiver`를 넣는다.
2. 면제 조건 (a)(b)(`stop-conditions.md`)는 바뀌지 않는다 — 충족 시점만 "아현 반환 후"에서 "티켓 생성 시"로 당긴다.
3. `plan_only`가 그래도 발동하면(카리나 판정이 틀린 경우) 3.0절 절차대로 처리하되, 계획을 티켓에 옮길 때 파일 경로+함수명까지 적어 2차 호출의 재탐색을 줄인다.

## 완료 조건

- `SKILL.md` 1단계에 규모 사전 판정 항목이 있고, 임계값 수치는 적지 않고 `stop-conditions.md`를 가리킨다(단일 원천 유지).
- `stop-conditions.md` 면제 조건에 정상 경로(카리나 사전 판정)와 안전망(`plan_only`)의 관계가 한 문단으로 적혀 있다.
- `handling-rules.md`에 규칙이 한 줄 있다.
- `node scripts/check-contract.mjs`와 `node scripts/check-skills.mjs`가 통과한다.
- 이 티켓 다음에 만드는 티켓 20260922_1755(파일 7개)에 이 절차를 실제로 적용해 첫 호출부터 면제를 넘긴다 — 아현이 `plan_only` 없이 구현으로 들어가면 절차가 작동한 것이다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- `SKILL.md` 1단계에 3번 「규모 사전 판정」을 넣었다 — 임계값 수치는 적지 않고 `stop-conditions.md`를 가리킨다. 3.0절 `plan_only` 후속에 "계획을 옮길 때 파일 경로 + 함수명·줄 위치까지"와 "이 경로에 왔다면 사전 판정이 빗나간 것이니 원인을 한 줄 남긴다"를 덧붙였다.
- `stop-conditions.md` 면제 부여 조건 아래에 정상 경로(카리나 사전 판정)와 안전망(`plan_only`)의 관계를 한 문단으로 적고 실측 수치(1521·1522·1523)를 근거로 달았다.
- `handling-rules.md` 카리나 표에 규칙 한 줄을 추가했다.
- 첫 적용: 티켓 20260922_1755(파일 7개)를 만들며 「구현 계획」을 파일 단위로 적고 첫 호출부터 `planOnlyWaiver`를 넘긴다.

### 변경된 파일
```
.claude/skills/jam-work/SKILL.md
.claude/skills/jam-work/references/stop-conditions.md
.claude/skills/jam-work/references/handling-rules.md
```

### 테스트 결과
- [x] `node scripts/check-contract.mjs` 통과 · `node scripts/check-skills.mjs` 통과 (2026-09-22 18:00 KST)

### 배포 정보
- 배포일:
- 환경: staging (빌드 없음)
- 커밋:

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 카리나 직접 | 0 | 측정 불가 | 0 / 0 | 측정 불가 | — |
| 합계 | 0 | 측정 불가 | 0 / 0 | 측정 불가 | — |

### 주요 의사결정 / 핵심 메모
- 임계값 수치는 `stop-conditions.md`에만 두고 `SKILL.md`는 참조만 한다(단일 원천 유지, `contract.json` `stale_phrases`가 수치 복제를 막는다).
- 첫 적용 결과: 티켓 20260922_1755(파일 7개)에 첫 호출부터 `planOnlyWaiver`를 넘겼고, 아현은 `plan_only` 없이 구현으로 들어가 게이트 PASS까지 한 번에 갔다. 민지 점검표 5번도 면제 값이 채워져 `[주의]` 대상이 아니었다.

### 잔여 이슈
- 없음
