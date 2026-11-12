---
id: "20261112_1816"
category: UI
priority: P3
status: CLOSED
closed: 2026-11-12
created: 2026-11-12
parent: "20261112_1625"
---

# [UI] 서비스 Button과 DS Button의 글자 두께를 맞춘다

## 핵심 요약

- 요구사항: 서비스 `Button`(`jam-web/src/components/ui/Button.tsx`)과 DS `Button`(`jam-web/design-system/components/buttons/Button.jsx`)의 글자 두께가 갈라져 있다. 한쪽으로 맞춘다. **어느 쪽으로 맞출지는 사용자 결정 대기**(WAITING).
- 구현 계획: 결정이 나면 한 쪽 값을 바꾸고, 스토리·시험·`Button.prompt.md`를 같이 고친다. `jam-web/scripts/ds-sync-check.mjs`와 `buttonVariantPairs.test.tsx`가 쌍을 대조한다.
- 관련 파일(지도, 경로 기준 `jam-web/`):
  - 서비스: `src/components/ui/Button.tsx` 129행 `font-normal`(400, 모든 변형 고정, 주석 «weight 400 고정»).
  - DS: `design-system/components/buttons/Button.jsx` 83행 `fontWeight: 600`(모든 변형).
  - 스토리·지침: `design-system/components/buttons/Button.stories.tsx`, `Button.prompt.md`, `LoadMoreButton.*`(1회차에서 새로 만든 쌍, 같은 차이를 물려받는다).

## 배경 / 문제 정의

1회차(20261112_1626) 검토에서 민지·채원이 같은 사실을 각각 발견했다. Storybook의 버튼은 600이고 실제 서비스 화면의 버튼은 400이라, 스토리가 실제보다 굵게 보인다. 캔버스의 버튼(더보기·저장·취소 등)은 서비스 화면을 옮긴 것이라 400이다.

## 상세 요구사항

- 결정 사항(사용자): ① DS를 400으로 맞춘다 ② 서비스를 600으로 맞춘다 ③ 지금대로 둔다.
- ①이면 DS `Button.jsx` 83행과 DS 쪽 변형 값, 스토리의 굵기 단언, 문서를 고친다. ②이면 서비스 전역 버튼이 굵어져 모든 화면이 바뀌므로 범위가 커진다.

## 구현 계획

결정 뒤 확정한다.

## 완료 조건

- 결정이 ①이면: DS `Button.jsx`의 모든 변형이 400이고 스토리가 서비스와 같은 굵기로 보인다. `ds-sync-check`와 `buttonVariantPairs.test.tsx`가 통과한다.
- 결정이 ③이면: 이 티켓을 «차이는 의도»라는 기록과 함께 닫는다(`Button.prompt.md`에 한 줄 명시).


---
## 완료 기록

### 구현 내용 요약
- 사용자 결정(2026-11-12): ① DS를 400으로 맞춘다.
- `design-system/components/buttons/Button.jsx`의 글자 두께를 600에서 400으로 낮췄다(모든 변형). `LoadMoreButton`은 DS `Button`을 쓰므로 함께 맞춰진다. `Button.prompt.md`에 «모든 변형 400» 규칙 한 줄을 더했다.
- 서비스 화면과 캔버스는 이미 400이라 바뀌지 않는다. 관련 시험(`src/components/ui/__tests__`) 629건 통과, `ds:check` 오류 0.
- 확인하지 못한 항목: Storybook 실렌더(로컬에서 열지 않음).
