---
id: "20261102_2247"
category: UI
priority: P3
status: OPEN
created: 2026-11-02
---

# [UI] 디자인시스템과 서비스 BadgeGridCard의 미획득(earned=false) 표현 차이를 맞춘다

## 핵심 요약

- 요구사항: `earned={false}`일 때 서비스 `BadgeGridCard`는 `grayscale opacity-40`이고, 디자인시스템 사본은 `grayscale`만 건다. 어느 쪽이 기준인지 정해 두 곳을 맞춘다.
- 구현 계획: 채원 판정으로 기준을 정한 뒤 다른 쪽을 고치고, DS Story의 `play` 검증도 같이 맞춘다.
- 관련 파일: `jam-web/src/components/ui/BadgeGridCard.tsx`(`thumbDimmed`·`thumbnailCls`), `jam-web/design-system/components/patterns/BadgeGridCard.jsx`·`.stories.tsx`.

## 배경 / 문제 정의

- 티켓 20261102_1834를 처리하며 채원이 발견했다. 이번 변경이 만든 차이가 아니라 이전부터 있던 차이라 건드리지 않았다.
- 두 사본이 달라서 DS 화면에서 본 미획득 카드와 서비스에서 보이는 카드의 흐림 정도가 다르다.

## 완료 조건

- 두 컴포넌트의 `earned={false}` 썸네일 처리가 같고, Story `play`와 서비스 단위 시험이 같은 값을 기대한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 잔여 이슈
- 티켓 20261102_1834의 채원 사후 리뷰 범위 밖 발견물(참고)을 자동으로 올린 것이다.
