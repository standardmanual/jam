---
id: "20261109_1146"
category: Infra
priority: P2
status: OPEN
created: 2026-11-09
---

# [Infra] verify의 spacing 기준선 불일치로 staging CI가 실패한다

## 핵심 요약

- 요구사항: `scripts/verify.sh`의 spacing 검사가 기준선과 맞지 않아 CI(`verify`)가 실패한다. staging `a199b50`과 그 이전 커밋 2건의 CI도 같은 이유로 실패했다(티켓 `20261109_1127` 게이트 리뷰의 범위 밖 발견물, 민지 [주의/정합성]).
- 구현 계획: 실패 대상 파일의 간격 값이 의도된 변경인지 확인하고, 의도된 것이면 기준선을 갱신하고 아니면 값을 고친다.
- 관련 파일: `jam-web/src/app/(main)/badges/[id]/page.tsx`, `InventoryItemHistorySheet.tsx`, `jam-web/src/app/(main)/badges/[id]/BadgeHeroSection.tsx`, `CollectionGridCard.tsx`, spacing 기준선 파일(`scripts/verify.sh`의 spacing 단계가 읽는 파일).

## 배경 / 문제 정의

- 2026-11-09 오전에 배지 상세·컬렉션 칸 화면을 연달아 고친 커밋(티켓 `20261109_1019`~`1048`)부터 CI가 spacing 단계에서 실패한다. CI가 계속 실패하면 새 review 브랜치의 실패가 이 문제 때문인지 새 결함 때문인지 가르기 어렵다.

## 완료 조건

- staging에서 `scripts/verify.sh`의 spacing 단계가 통과하고 CI가 성공한다.

---
## 완료 기록
