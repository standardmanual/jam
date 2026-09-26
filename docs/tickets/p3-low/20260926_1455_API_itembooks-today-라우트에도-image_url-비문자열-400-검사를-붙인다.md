---
id: "20260926_1455"
category: API
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260926_1442"
  - "20260926_0203"
---

# [API] `itembooks/[id]`·`today/[id]` 라우트에도 `image_url` 비문자열 400 검사를 붙인다

> 2026-09-26 티켓 20260926_1442 게이트(민지)의 [참고] 발견물이다.

## 핵심 요약

- 요구사항: `imageSourceReset`의 비문자열 방어(500 제거)는 이 함수를 쓰는 모든 라우트에 적용되지만, 400 검사(`imageUrlTypeError`)는 `badges/[id]`·`missions/[id]`에만 붙였다. `itembooks/[id]`·`today/[id]`는 비문자열 `image_url`이 update 페이로드로 그대로 가는 종전 동작이 남아 있다(500만 사라짐). 같은 검사를 붙여 비문자열을 400으로 거절한다.
- 관련 파일: `jam-web/src/lib/admin/imageSourceReset.ts:31`, `jam-web/src/app/api/admin/itembooks/[id]/route.ts`, `jam-web/src/app/api/admin/today/[id]/route.ts`.

## 완료 조건

- 두 라우트에서 비문자열 `image_url`이 400이고 정상 요청은 그대로다(단위 테스트).


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
