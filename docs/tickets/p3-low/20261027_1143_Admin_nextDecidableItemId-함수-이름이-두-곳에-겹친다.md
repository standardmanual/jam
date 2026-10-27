---
id: "20261027_1143"
category: Admin
priority: P3
status: OPEN
created: 2026-10-27
closed:
parent: "20261026_2020"
specs:
  - "docs/service/prd/admin-boards/PRD.md"
---

# [Admin] `nextDecidableItemId`가 두 곳에 같은 이름으로 있어 헷갈린다 (2024 후속)

> 상위: 20261026_2020

## 핵심 요약

- 문제: `jam-web/src/lib/admin/opsInbox/selection.ts`(날짜별 목록 순서로 반려 뒤 다음 항목을 고른다)와 `jam-web/src/lib/admin/opsBoard/drawerView.ts`(`position` 순으로 「빼기」·「이대로 두기」 뒤 다음 항목을 고른다)에 같은 이름의 함수가 있다. 쓰는 곳에서 어느 쪽인지 헷갈릴 수 있다.
- 구현 계획: 이름으로 구분한다(예: `drawerView.ts`의 것을 `nextItemToReview`로 바꾸고 호출부 `OpsDecisionWorkspace.tsx`와 시험을 맞춘다). 동작은 바꾸지 않는다.
- 관련 파일: 위 두 파일, `jam-web/src/components/admin/ops/OpsDecisionWorkspace.tsx`, `jam-web/src/lib/admin/opsBoard/__tests__/drawerView.test.ts`

## 완료 조건

- 두 함수의 이름이 서로 다르고 호출부가 맞게 바뀌었다. 관련 시험이 통과한다.
