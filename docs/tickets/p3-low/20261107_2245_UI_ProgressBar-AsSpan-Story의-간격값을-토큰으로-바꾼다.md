---
id: "20261107_2245"
category: UI
priority: P3
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
---

# [UI] ProgressBar AsSpan Story의 간격값을 토큰으로 바꾼다

## 핵심 요약

- 요구사항: `ProgressBar.stories.tsx`의 `AsSpan` Story에서 세로 묶음의 `gap: 8`과 `<a>`의 `gap: 8`이 px 직접 입력이다. `var(--spacing-8)`로 바꾼다(데모 폭 `width: 280`은 토큰 대상이 아니라 둔다).
- 구현 계획: 미정(착수 전 규모 판정).
- 관련 파일: `jam-web/design-system/components/feedback/ProgressBar.jsx`, `ProgressBar.stories.tsx`, `ProgressBar.prompt.md`

## 배경 / 문제 정의

티켓 20261107_2156 채원 사후 리뷰의 제안이다. Story 전용 데모 값이고 컴포넌트에는 영향이 없어 중대로 올리지 않았다.

## 완료 조건

- `AsSpan` Story의 간격이 `--spacing-8` 토큰을 쓴다.
- Story의 모양이 이전과 같고 `npm run ds:check`가 오류 0이다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
