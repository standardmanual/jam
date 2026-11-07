---
id: "20261107_2121"
category: UI
priority: P3
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
---

# [UI] ItemSerialCode 루트 div를 span으로 바꿔 ListRow 클릭 영역 규칙을 맞춘다

## 핵심 요약

- 요구사항: `ItemSerialCode`(MODULAR 원본)의 루트 요소가 `<div>`라서 `ListRow`의 클릭 영역(`<a>`·`<button>`) 안에 넣으면 «클릭 영역 안은 phrasing 요소만 쓴다» 규칙에 어긋난다. 루트를 `<span>`(`display:flex` 유지)으로 바꾸고 원본과 서비스 사본을 같은 값으로 맞춘다.
- 구현 계획: 미정(착수 전 규모 판정). `ds` 유형이라 채원 사전 판정과 Story 확인이 따른다.
- 관련 파일: `jam-web/design-system/components/`의 `ItemSerialCode.jsx`(원본, 루트 요소), 서비스 쪽 사본이 있으면 그것과 `ds:check` 쌍 대조, `jam-web/src/components/inventory/ItemCandidateRow.tsx`(3-4배치에서 `title`에 넣는 곳).

## 배경 / 문제 정의

티켓 20261107_1946(3-4배치 개체 후보 행) 채원 사전 판정에서 나온 후속 제안이다. 옛 `ListRowCard`도 같은 상태였고 3-4에서는 범위 밖(MODULAR)이라 고치지 않았다. 일련번호를 `title`이나 `meta`에 넣는 모든 행이 같은 문제를 가진다.

## 완료 조건

- `ItemSerialCode`의 루트가 `<span>`이고 레이아웃(`display:flex`, 높이, 자간)이 그대로다. 사용하는 모든 화면(히어로, 배지 상세, 선택 시트 행)의 모양이 바뀌지 않는다.
- 원본과 사본이 같은 값이고 `npm run ds:check`가 오류 0이다. Story가 있으면 함께 확인한다.
- `ListRow` 클릭 영역 안에 일련번호를 넣은 행에 `<div>`가 남지 않는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
