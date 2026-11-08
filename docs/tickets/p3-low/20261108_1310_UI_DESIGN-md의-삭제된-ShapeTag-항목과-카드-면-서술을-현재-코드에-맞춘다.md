---
id: "20261108_1310"
category: UI
priority: P3
status: OPEN
created: 2026-11-08
parent: "20261106_1750"
---

# [UI] DESIGN md의 삭제된 ShapeTag 항목과 카드 면 서술을 현재 코드에 맞춘다

## 핵심 요약

- 요구사항: `jam-web/DESIGN.md`가 코드와 어긋난 곳 둘을 고친다. ① 104줄에 2026-11-07에 삭제된 `ShapeTag` 항목이 남아 있다. ② 78~79줄이 «카드는 흰 면과 테두리만으로 구분된다»고 적지만 공통 `Card`·`BadgeGridCard`·`CollectionGridCard`는 `--card-bg` 면에 외곽선이 없다(`cardFacePairs.test.tsx` 머리말 근거).
- 구현 계획: `DESIGN.md`를 열어 두 곳을 코드(`Card.jsx`, 시험)로 확인한 사실만 고친다. 날짜가 박힌 과거 기록은 건드리지 않는다.
- 관련 파일: `jam-web/DESIGN.md`(78~79·104줄), `jam-web/design-system/components/cards/Card.jsx`(읽기만)

## 배경 / 문제 정의

목록 행 4단계 5-2(티켓 20261108_1220)의 게이트·사후 리뷰가 범위 밖 발견물로 올렸다. 이번 티켓에서는 고치지 않았다.

## 완료 조건

- 위 요구사항이 코드·문서에서 확인된다(상세는 착수할 때 채원·카리나가 확정한다).

---
## 완료 기록 *(작업 완료 후 작성)*
