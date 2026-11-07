---
id: "20261107_2243"
category: UI
priority: P3
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
---

# [UI] ProgressBar에 접근성 속성(role·aria-value)이 없다

## 핵심 요약

- 요구사항: 진행 바는 정보인데 `role="progressbar"`·`aria-valuenow` 같은 접근성 속성이 사용처 10곳 모두에 없다. 읽기가 바뀌는 판단이라 사용자 판단으로 도입 범위를 정한다(전체 도입, 켠 호출부만, 장식 처리).
- 구현 계획: 미정(착수 전 규모 판정).
- 관련 파일: `jam-web/design-system/components/feedback/ProgressBar.jsx`, `ProgressBar.stories.tsx`, `ProgressBar.prompt.md`

## 배경 / 문제 정의

티켓 20261107_2156 게이트·채원 사후 리뷰의 참고 발견이다. 3-5배치(20261107_1947)에서 `RankingListRow`는 `as="span"`을 켜면서 호출부 래퍼에 `aria-hidden`을 걸어 장식으로 처리한다. 10곳 전체의 `role` 도입은 스크린리더가 새로 읽는 내용이 생기는 변경이라 별도로 정한다.

## 완료 조건

- 도입 범위(전체·옵트인·장식 유지)가 판정돼 있다.
- 도입한다면 기존 호출부의 화면은 그대로이고, 읽기 변경이 `prompt.md`에 적혀 있다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
