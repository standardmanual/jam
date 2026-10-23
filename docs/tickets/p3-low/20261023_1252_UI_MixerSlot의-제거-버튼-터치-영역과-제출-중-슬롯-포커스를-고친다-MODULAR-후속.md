---
id: "20261023_1252"
category: UI
priority: P3
status: OPEN
created: 2026-10-23
---

# [UI] MixerSlot의 제거 버튼 터치 영역과 제출 중 슬롯 포커스를 고친다 (MODULAR 후속)

## 핵심 요약

- 요구사항: MixerSlot의 ✕ 제거 버튼이 16x16px라 44px 터치 영역에 못 미친다. MixerSlot에 `disabled`가 없어 제출 중에도 슬롯 버튼이 포커스를 받고 화면 읽기 프로그램이 «슬롯 채우기»로 읽는다. 티켓 `20261022_2119`(7-7a) 3회의 채원 사후 리뷰가 다시 짚었고, 레시피 믹서도 같은 컴포넌트라 두 화면에 모두 해당한다.
- 구현 계획: ✕ 버튼의 보이는 크기는 그대로 두고 눌리는 영역만 44px 이상으로 넓힌다. `disabled` prop을 더해 제출 중에는 포커스를 받지 않게 하고, 사용처가 `onClick`을 `undefined`로 넘기던 우회를 prop으로 바꾼다. Story를 함께 갱신한다.
- 관련 파일: `jam-web/design-system/components/patterns/MixerSlot.jsx`와 Story, 사용처 `jam-web/src/app/(main)/combine/CombineClient.tsx`·`TierUpPanel.tsx`

## 배경 / 문제 정의

기존에 «MODULAR 후속 건으로 기록한다»고 판정에 적었으나 티켓에 기록이 없어 이 티켓으로 남긴다. 사용자 노출 문구는 바뀌지 않는다.

## 완료 조건

- ✕ 버튼의 눌리는 영역이 44px 이상이고 보이는 크기는 그대로다.
- 제출 중에는 슬롯 버튼이 포커스를 받지 않고 «슬롯 채우기»로 읽히지 않는다.
- 레시피 믹서와 등급 올리기 화면의 기존 시험이 통과하고 Story가 갱신됐다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
