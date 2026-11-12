---
id: "20261112_1817"
category: UI
priority: P3
status: IN_PROGRESS
created: 2026-11-12
parent: "20261112_1625"
---

# [UI] SlotOutline의 style 태그를 한 번만 주입하고 눌림 영역을 44px로 넓힌다

## 핵심 요약

- 요구사항: 2회차(20261112_1627) 검토가 제안한 두 가지를 처리한다. ① `SlotOutline`이 인스턴스마다 `<style>` 태그를 렌더하는 중복(컬렉션 최대 30칸이면 같은 CSS가 30번)을 한 번만 주입하게 한다. ② `SlotCircleButton`의 눌림 영역이 24px 원 + `before:-inset-2` = 40×40px라 점검표 기준 44px에 모자란다. 이를 44px로 넓힌다.
- 구현 계획: ①은 순수 정리라 바로 진행한다. ②는 **카드 이동(링크) 영역이 줄어드는 정도에 사용자 판단이 필요**해서 사용자 확인 뒤 진행한다.
- 관련 파일(지도, 경로 기준 `jam-web/`):
  - ① `design-system/components/cards/SlotOutline.jsx`(인스턴스마다 `<style>` 렌더, 페이드 전환용 CSS). 같은 방식을 따른 `design-system/components/navigation/Accordion.jsx`와 묶어 DS 공통 정리로 볼 수 있다. 서비스는 `@ds`를 그대로 import하므로 한 곳 수정으로 끝난다. 시험 `src/components/ui/__tests__/SlotOutline.test.tsx`, 스토리 `SlotOutline.stories.tsx`.
  - ② `src/components/ui/SlotCircleButton.tsx`의 `before:-inset-2`(40px) → `before:-inset-2.5`(44px). 호출부 `collections/[id]/SlotGrid.tsx`, `combine/RecipeSlotCard.tsx`. 같은 규격의 DS `design-system/components/patterns/MixerSlot.jsx` `ActionCircle`의 제거 버튼 눌림 박스(40px)도 같이 판단.

## 배경 / 문제 정의

① 동작 문제는 없으나 같은 CSS가 DOM에 반복된다. ② `SlotCircleButton`은 카드(링크) 위에 얹혀 있어, 눌림 영역을 키우면 카드 이동 영역이 그만큼 줄어든다. 슬롯 칸이 약 104px, 이미지 상자가 80~90px이라 중앙 버튼의 44px 영역은 이미지 상자 거의 절반을 덮는다.

## 상세 요구사항

- ①: `<style>`을 모듈 수준에서 한 번만 주입하거나(문서에 한 번 삽입) 스타일시트로 올린다. 점선 모양·페이드는 그대로.
- ②: 사용자 결정 대기. 안 ⓐ 44px로 넓힌다(권장 안, 접근성 기준 충족, 카드 이동 영역 감소). 안 ⓑ 지금 40px을 유지한다(기존 `-` 버튼과 같은 규격, 예외로 기록).

## 구현 계획

① 먼저. ②는 결정 뒤.

## 완료 조건

- 컬렉션 30칸에서도 `SlotOutline` 스타일 규칙이 DOM에 한 번만 있다. 시험이 이를 단언한다.
- ②가 ⓐ이면 눌림 영역이 44×44px이고 `SlotGrid`·`RecipeSlotCard` 시험이 통과한다. ⓑ이면 `SlotCircleButton` 주석에 예외 사유를 적는다.
- `scripts/verify.sh`가 통과한다.
