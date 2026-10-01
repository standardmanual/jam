---
id: "20261001_2151"
category: Infra
priority: P3
status: OPEN
created: 2026-10-01
closed:
parent: "20260930_1503"
---

# [Infra] ops-patterns 테스트의 가짜 쿼리 클래스 중복

> 출처: 20261001_2134(1503-②) 게이트(민지) 범위 밖 발견물 `[구조/참고]`

## 핵심 요약

- 요구사항: 가짜 Query 클래스(`select`·`eq`·`neq`·`maybeSingle`·`then`)가 두 테스트 파일에 거의 같게 복제돼 있다. 1503의 다음 조각(④ 조합 뽑기·⑤ 결정 기록 등)이
  테스트를 더하기 전에 공용 테스트 도우미로 옮긴다.
- 구현 계획: 착수할 때 관련 파일을 읽고 파일 단위로 적는다.
- 관련 파일: `jam-web/src/lib/admin/opsPatterns/__tests__/read.test.ts` 41~80행, `jam-web/src/app/api/admin/ops-patterns/__tests__/route.test.ts` 34~70행

## 완료 조건

- 가짜 쿼리 클래스가 한 곳에 있고 두 테스트가 그것을 가져다 쓴다. 테스트 결과는 바뀌지 않는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
