---
id: "20261127_1741"
category: Admin
priority: P2
status: OPEN
created: 2026-11-27
parent: "20261127_1720"
workType: admin
---

# [Admin] C10a 정책 대시보드 `policiesData.ts`를 새 구조로 동기화한다

## 핵심 요약

- 요구사항: 정책 대시보드 카탈로그의 캡슐 항목을 상위 티켓 표대로 바꾸고, 새 항목(카드 표시 규칙, 진행값 적립 규칙, 챕터 보상)을 더한다(CLAUDE.md 규칙 2).
- 구현 계획: 아래 «구현 계획»의 단계를 파일 단위로 따른다(3단계).
- 관련 파일: `jam-web/src/lib/admin/policyDashboard/policiesData.ts` / `jam-web/src/lib/admin/policyDashboard/__tests__/policiesData.test.ts`, `liveValues.ts` / `jam-web/src/app/api/admin/policy-dashboard/route.ts`
- 선행 티켓: 20261127_1739(C9a), 20261127_1740(C9b)
- 상위 티켓: 20261127_1720(챕터 게이지 카드로 전환하고 캡슐을 폐지한다). 기획 경위와 사용자 확정 결정은 상위 티켓에 있다.

## 배경 / 문제 정의

상위 티켓 20261127_1720의 단계 C(전환, 같은 배포 창)에 속하는 조각이다. 잼은 챕터를 올리는 경험치이고 포인트는 별도 재화이며, 캡슐은 폐지한다(2026-11-27 사용자 결정). 챕터 1~9의 필요 잼은 870, 1,120, 1,260, 1,600, 1,980, 2,205, 2,700, 3,300, 3,960이고, 넘친 잼은 이월한다.

## 구현 계획

1. `jam-web/src/lib/admin/policyDashboard/policiesData.ts`(111곳): 상위 티켓의 «정책 대시보드 동기화 대상» 표대로 항목을 교체·삭제·추가한다. `ch12-advance-count`·`ch5-costs-by-chapter`의 `dbTable`·`dbColumn`·`adminLink`를 바꾼다.
2. `jam-web/src/lib/admin/policyDashboard/__tests__/policiesData.test.ts`(29곳)와 `liveValues.ts`(4곳)를 맞춘다. 연결: `jam-web/src/app/api/admin/policy-dashboard/route.ts`(4곳).
3. 챕터 보상 값이 확정 전이면 «미정»으로 표시하고, 확정 뒤 같은 항목을 채운다.

## 완료 조건

- `policiesData.ts`에서 캡슐 항목 id가 0개이고 새 항목이 추가돼 있으며, `policiesData.test.ts`가 통과한다.
- 챕터별 필요 잼 항목이 DB 값(870~3,960)과 같고 `adminLink`가 새 구역을 가리킨다.
- 정책 대시보드 화면(`/admin/policy-dashboard`)에서 카리나가 실렌더로 확인했다.

## 규모와 체크포인트

- 규모: 파일 4개, 약 300줄(추정, 미검증). 분할된 첫 조각
- 체크포인트: admin 유형: 머지 뒤 카리나 실렌더 검증.

## 주요 의사결정 / 핵심 메모

- 상위 티켓의 사용자 확정 결정과 «하지 않을 것»을 따른다. 확인하지 않은 수치는 «미검증»이다.
- 계획 반환 면제 전제: 이 티켓은 파일 5개 초과 또는 100줄 이상이 예상돼 위 «구현 계획»을 파일 단위로 적었다. 사용자가 이 방식을 승인했다(2026-11-27). `/jam-work` 호출 때 카리나가 `planOnlyWaiver`로 넘기고, 면제 사유를 여기에 이어서 남긴다.
