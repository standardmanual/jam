---
id: "20261108_1648"
category: UI
priority: P3
status: OPEN
created: 2026-11-08
closed: ""
parent: "20261106_1750"
specs: []
---

# [UI] PoiCarouselModal 시험의 «등급 칩 줄 없음» 단정이 gap 문자열에 기댄다

## 핵심 요약

- 요구사항: `PoiCarouselModal.test.tsx`의 «common 행은 등급 칩 줄을 만들지 않는다»가 마크업 문자열 `gap:var(--spacing-4)`의 유무로 판정한다. 같은 모달의 다른 요소에 같은 `gap`이 생기면 칩 줄이 없어도 거짓 양성(오탐)이 나거나, 칩 줄 구현이 바뀌면 거짓 음성이 난다. 칩 줄을 가리키는 더 직접적인 표지(예: 등급 칩의 `data-*`나 `RarityBadge` 고유 문자열)로 바꾼다.
- 구현 계획: 단정을 칩 줄 고유 표지로 바꾸고, 표지가 없으면 `RarityBadge` 출력 문자열을 쓴다. rare 행은 칩 줄이 있고 common 행은 없는 두 경우를 그대로 지킨다.
- 관련 파일: `jam-web/src/components/PoiCarouselModal.test.tsx`(`ListRow` 배선 3건, «common 행은 등급 칩 줄을 만들지 않는다» 단정).
- 담당 에이전트: 카리나(경미 수정 판정), 필요하면 아현.

## 배경 / 문제 정의

목록 행 5-3(`20261108_1625`)이 `ItemRow`를 `ListRow`로 옮기며 단정 3건을 더했다. 민지 게이트가 이 단정이 `gap:var(--spacing-4)` 문자열에 기댄다고 지적했다. 5-3 머지가 끝나야 이 단정이 staging에 들어오므로, 이 티켓은 5-3 머지 뒤에 한다.

## 완료 조건

- 단정이 `gap` 문자열이 아니라 칩 줄 고유 표지로 판정한다.
- rare 행은 칩 줄이 있고 common 행은 없다는 두 경우가 모두 통과한다.
- 변경 파일이 `scripts/verify.sh`를 통과한다.

---
## 완료 기록 *(작업 후 작성)*
