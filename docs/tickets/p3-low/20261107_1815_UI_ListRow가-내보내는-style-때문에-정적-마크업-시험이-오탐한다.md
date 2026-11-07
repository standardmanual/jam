---
id: "20261107_1815"
category: UI
priority: P3
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
---

# [UI] ListRow가 행마다 내보내는 style 때문에 정적 마크업 시험이 오탐한다

## 핵심 요약

- 요구사항: `ListRow`는 `<style href>`를 행마다 함께 내보낸다. 정적 마크업(`renderToStaticMarkup`)에서 `href=` 부재나 텍스트를 검사하는 시험은 style을 먼저 걷어야 해서, 배치마다 같은 오탐이 반복된다. 시험용 보조 함수를 한 곳에 두거나, style을 행 밖으로 한 번만 내보내는 방안을 판정한다.
- 구현 계획: 미정(착수 전 규모 판정).
- 관련 파일: `jam-web/src/components/ui/ListRow.tsx`(323줄 근처), `CombineClient.tierUp.test.tsx`·`TierUpPanel.test.tsx`·`admin/ops/__tests__/kindPreview.test.tsx`(이미 style을 걷고 검사하도록 고친 곳)

## 배경 / 문제 정의

티켓 20261107_0011 게이트 리뷰의 참고 발견이다. 3배치 이후에도 같은 시험 보정이 늘어날 수 있다.

## 완료 조건

- 새 시험이 style 걷기를 따로 알 필요가 없다(보조 함수 또는 구조 변경).
- 원본과 사본이 같은 값이고 `npm run ds:check`가 오류 0이다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
