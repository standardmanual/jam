---
id: "20261112_2240"
category: Infra
priority: P2
status: OPEN
created: 2026-11-12
---

# [Infra] staging CI의 기존 실패 시험 2건을 고친다

## 핵심 요약

- 요구사항: staging 최근 CI 5건이 모두 실패한다. 실패 시험 2건은 최근 변경과 무관한 기존 실패다. 고쳐서 CI를 다시 초록으로 만든다.
- 구현 계획: 두 시험의 기대값을 현재 구현에 맞게 고치거나, 구현이 틀렸다면 구현을 고친다.
- 관련 파일(경로 기준 `jam-web/`):
  - `src/app/api/admin/item-paths/__tests__/route.test.ts`: 등급 올리기 길(tierUp)과 잠금(lock) 기대값이 구현과 맞지 않는다.
  - `scripts/asset-generator/__tests__/registerMissionBundle.test.ts`: `status_display_type`이 `'ranking'`일 때의 메시지 기대값이 맞지 않는다.

## 배경 / 문제 정의

티켓 20261112_2141 게이트(민지)가 발견했다. 승격 게이트가 의미를 가지려면 CI가 초록이어야 한다.

## 완료 조건

- 두 시험이 통과하고 `scripts/verify.sh`와 GitHub Actions `verify`가 통과한다.
