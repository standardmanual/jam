---
id: "20261107_1814"
category: UI
priority: P3
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
---

# [UI] ListRow.prompt.md의 B 계열 구성표와 실제 렌더 순서를 맞춘다

## 핵심 요약

- 요구사항: `ListRow.prompt.md`의 B 계열 구성표는 `title + chips + meta` 순서로 적혀 있지만, 실제 렌더 순서는 eyebrow → title → meta → chips다. 표를 실제 순서에 맞게 고치거나, 순서를 표에 맞출지 채원이 판정한다.
- 구현 계획: 미정(착수 전 규모 판정).
- 관련 파일: `jam-web/design-system/components/patterns/ListRow.prompt.md`(원본), 필요하면 `jam-web/src/components/ui/ListRow.tsx`와 `ListRow.jsx`(쌍 대조 대상)

## 배경 / 문제 정의

티켓 20261107_0011 게이트 리뷰의 참고 발견이다. 호출부가 표를 믿고 칩을 `chips` 슬롯에 두면 칩이 meta 아래로 내려간다. 2-2 배치의 레시피 행은 이 때문에 칩을 `eyebrow`에 두었다.

## 완료 조건

- 구성표와 실제 렌더 순서가 같다.
- 문서만 고치면 `npm run ds:check`가 오류 0이다. 렌더 순서를 바꾼다면 원본과 사본이 같은 값이다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
