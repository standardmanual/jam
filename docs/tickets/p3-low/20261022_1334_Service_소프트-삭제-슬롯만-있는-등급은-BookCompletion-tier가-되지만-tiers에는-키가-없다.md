---
id: "20261022_1334"
category: Service
priority: P3
status: OPEN
created: 2026-10-22
parent: "20261022_1139"
specs:
  - "docs/service/content/ITEMBOOK_TIERS.md"
---

# [Service] 소프트 삭제 슬롯만 있는 등급은 `BookCompletion.tier`가 되지만 `tiers`에는 키가 없다

## 핵심 요약

- 요구사항: 7-8 2회가 컬렉션 등급 판별에서 소프트 삭제 배지에 꽂힌 슬롯도 세게 맞췄다. 그 등급에 살아 있는 배지가 없으면 `BookCompletion.tier`는 그 등급이 되지만 `tiers`에는 그 키가 없다. 지금은 호출부가 `tiers[tier]`를 직접 색인하지 않아 문제가 없다. 호출부가 생길 때 가정이 깨지지 않게 타입이나 주석으로 알린다.
- 구현 계획: `BookCompletion` 타입 주석에 «`tier`가 `tiers`의 키가 아닐 수 있다»를 적고, 직접 색인하는 호출부를 막는 시험이나 도우미 함수를 둔다.
- 관련 파일: `jam-web/src/lib/itembook/completion-basis.ts` 191줄 근처(민지 보고).

## 배경 / 문제 정의

민지 게이트(참고)가 발견했다. 지금은 해당 슬롯이 0건이라 실제 영향이 없다.

발견: 2026-10-22 티켓 20261022_1139(7-8) 2회 게이트(민지).

## 상세 요구사항

### 서비스/코드베이스 관점

- 완성 판정 결과와 API 응답 모양은 바꾸지 않는다.

## 완료 조건

- [ ] `tier`가 `tiers`에 없을 수 있다는 점이 타입 주석이나 시험으로 고정됐다

## 진행 기록

## 잔여 이슈
