---
id: "20261107_2244"
category: UI
priority: P3
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
---

# [UI] ProgressBar 채움 폭 전환에 prefers-reduced-motion 처리가 없다

## 핵심 요약

- 요구사항: 채움의 폭 전환(`transition: width var(--duration-slow) …`, track-gradient는 `clip-path`)이 동작 줄이기 설정에서도 그대로 돈다. 설정이 켜진 사용자에게는 전환을 끄는 처리를 더한다.
- 구현 계획: 미정(착수 전 규모 판정).
- 관련 파일: `jam-web/design-system/components/feedback/ProgressBar.jsx`, `ProgressBar.stories.tsx`, `ProgressBar.prompt.md`

## 배경 / 문제 정의

티켓 20261107_2156 채원 사후 리뷰의 참고 발견이다(이번 diff가 만든 문제가 아니라 기존 상태). `ListRow`는 동작 줄이기에서 눌림 변환과 transition을 스스로 끄지만 `ProgressBar`에는 같은 처리가 없다.

## 완료 조건

- 동작 줄이기 설정에서 채움 폭이 전환 없이 바로 바뀐다.
- 기본 호출의 마크업(인라인 스타일)은 바뀌지 않는다(처리를 CSS로 하거나 새 prop 없이 한다면 어떻게 하는지 채원이 판정).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
