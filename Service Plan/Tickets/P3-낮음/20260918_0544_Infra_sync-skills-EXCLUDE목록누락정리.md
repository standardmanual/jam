---
id: 20260918_0544
category: Infra
priority: P3
status: OPEN
created: 2026-09-18
closed:
---

# [Infra] `.claude/sync-skills.sh`의 EXCLUDE 목록에 JAM 전용 스킬 3종 누락

## 배경 / 문제 정의
티켓 `20260918_0422`(에이전트 팀 도입 ③) 게이트 리뷰가 발견한 범위 밖 항목이다.

`.claude/sync-skills.sh`의 EXCLUDE 목록은 JAM 프로젝트 전용 스킬을 전역(`~/.agents/skills/`
등)으로 미러링하지 않도록 걸러내는 목록이다. 그런데 `jam-ds`·`jam-img`·`jam-sync` 3종이
빠져 있어, 이 프로젝트 전용 스킬들이 다른 프로젝트로 미러링될 위험이 있다(이번 티켓과 무관한
기존 누락 — `20260918_0422`에서는 신규 스킬 `jam-plan`·`jam-story`만 EXCLUDE에 추가함).

## 상세 요구사항
- `.claude/sync-skills.sh`의 EXCLUDE 목록에 `jam-ds`·`jam-img`·`jam-sync`를 추가한다
- 이미 잘못 미러링된 사본이 있는지 확인하고, 있으면 정리한다

## 완료 조건
- `jam-ds`·`jam-img`·`jam-sync`가 EXCLUDE 목록에 포함된다
- 전역에 잘못 미러링된 사본이 없다
