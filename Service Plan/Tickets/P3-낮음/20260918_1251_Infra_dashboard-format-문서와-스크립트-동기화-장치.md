---
id: 20260918_1251
category: Infra
priority: P3
status: OPEN
created: 2026-09-18
closed:
---

# [Infra] dashboard-format.md와 ticket-dashboard.mjs 동기화 장치 검토

## 핵심 요약
- 요구사항: 현황판 스크립트만 고치고 계약 문서를 고치지 않는 드리프트를 막을 방법을 검토한다.
- 구현 계획: `pre-commit`에서 스크립트만 바뀌고 문서가 안 바뀐 커밋에 경고를 띄우는 방안 등을 검토한다.
- 관련 파일: `scripts/ticket-dashboard.mjs`, `.claude/skills/jam-work/references/dashboard-format.md`, `.githooks/pre-commit`
- 출처: 티켓 20260918_1152 게이트 리뷰(민지) 범위 밖 발견물

## 배경 / 문제 정의
1152에서 `DASHBOARD.md` 저장 계약이 실제 구현과 어긋나 있던 것을 바로잡았다. 문서에는 "스크립트를 고칠 때 이 문서도
함께 갱신한다"는 문구만 있고 강제하는 장치가 없어 같은 드리프트가 다시 생길 수 있다. 현재는 위험으로만 기록한다.

## 완료 조건
- 장치를 도입할지 여부와 방식이 결정되어 있다 (도입하지 않기로 하면 그 이유를 기록)
