---
id: "20261023_1309"
category: UI
priority: P3
status: OPEN
created: 2026-10-23
---

# [UI] 공용 EmptyState의 제목이 한글 단어 중간에서 줄바꿈된다 (break-keep 없음, MODULAR)

## 핵심 요약

- 요구사항: 공용 `EmptyState`의 제목이 한글 단어 중간에서 줄이 바뀐다. 티켓 `20261022_2119`(7-7a) 3회를 staging에서 실렌더로 확인하다가 발견했다. 등급 올리기 재료 시트의 빈 상태 제목 «등급을 올릴 수 있는 아이템 배지가 없어요»가 360px 화면에서 «등급을 올릴 수 있는 아이템 배» / «지가 없어요»로 «배지가»가 끊겼다.
- 구현 계획: 제목 `<p>`가 `word-break: normal`(글자 24px, 폭 280px)이라 한글은 음절 사이 어디서나 줄이 바뀐다. 제목과 설명에 `break-keep`(필요하면 `text-balance`)을 더하고 Story를 갱신한다. 사용처가 여럿이라 줄바꿈이 달라지는 화면을 함께 훑는다.
- 관련 파일: `jam-web/design-system/components/feedback/EmptyState.jsx`와 Story, 사용처(`CombineClient.tsx`·`TierUpPanel.tsx` 등 `EmptyState`를 가져오는 곳)

## 배경 / 문제 정의

채원의 사후 리뷰는 코드와 클래스만으로 «한국어 줄바꿈 통과»라고 판단했지만, 실렌더에서만 보이는 결함이었다. `EmptyState`는 MODULAR 공용 컴포넌트라 모든 사용처가 같은 영향을 받는다. 다른 문구가 긴 빈 상태에서도 같은 일이 생길 수 있다.

## 완료 조건

- 360px에서 빈 상태 제목과 설명이 한글 단어 중간에서 끊기지 않는다(재료 시트 빈 상태로 확인).
- `EmptyState`를 쓰는 화면의 기존 시험과 Story가 통과하고, 줄바꿈이 달라진 화면을 훑어 어색한 곳이 없다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
