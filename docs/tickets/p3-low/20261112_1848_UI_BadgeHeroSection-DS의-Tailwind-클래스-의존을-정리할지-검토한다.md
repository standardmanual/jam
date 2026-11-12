---
id: "20261112_1848"
category: UI
priority: P3
status: OPEN
created: 2026-11-12
parent: "20261112_1818"
---

# [UI] BadgeHeroSection DS의 Tailwind 클래스 의존을 정리할지 검토한다

## 핵심 요약

- 요구사항: 1818에서 DS로 올린 `BadgeHeroSection`은 DS 컴포넌트 중 처음으로 인라인 style이 아니라 Tailwind 클래스(`gap-4 p-6`, `text-snow`, `bg-card-bg`, `text-wrap!` 등)를 쓴다. 이 의존을 유지할지, 인라인 style과 CSS 변수로 바꿀지 판단한다.
- 구현 계획: 먼저 DS를 claude.ai/design 업로드(`/jam-ds` 모드 ③)에 올려 이 컴포넌트가 무너져 보이는지 확인한다. 무너지면 인라인 style로 바꾸고 `heroLayout`·`heroTextColor` 시험의 클래스 단언을 스타일 단언으로 옮긴다.
- 관련 파일(지도, 경로 기준 `jam-web/`): `design-system/components/cards/BadgeHeroSection.jsx`(마크업), `BadgeHeroSection.prompt.md`(예외 사유 문단), `src/app/(main)/badges/[id]/__tests__/heroLayout.test.tsx`·`heroTextColor.test.tsx`(클래스 문자열 단언).
- 함께 볼 소소한 항목: 스토리 `BadgeHeroSection.stories.tsx` 37행의 지역 컴포넌트 이름 `Image`가 전역 `Image` 생성자를 가린다(이름 변경).

## 배경 / 문제 정의

1818 채원② 검토의 제안이다. 서비스 화면과 Storybook은 Tailwind가 있어 정상이지만, Tailwind가 없는 환경(claude.ai/design 업로드본)에서는 간격·글자색·면이 빠질 수 있다. 실렌더로 서비스에서는 클래스가 정상 생성됨을 확인했다(1818 완료 기록).

## 완료 조건

- 업로드본에서의 모양을 확인하고, 유지 또는 인라인 전환 중 하나로 결정해 기록한다. 전환하면 서비스 렌더 결과가 같고 관련 시험이 통과한다.
