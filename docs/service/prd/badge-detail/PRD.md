---
type: prd
status: draft
description: "배지 상세 화면 3종(아이템·체크인·액티비티)의 티켓 디자인 규격이다. 크림 페이지, 티켓 머리, 절취선, 그라데이션 아래 블록, 티켓 범위 토큰, 랜덤 색 규칙을 정한다."
related:
  - "20261122_1221"
  - "20261122_1222"
  - "20261122_1223"
---

# 배지 상세 티켓 PRD

> 상위 티켓 [20261122_1221](../../../tickets/p2-normal/20261122_1221_UI_배지-상세-화면을-티켓-디자인으로-리뉴얼한다-상위.md). 시안은 캔버스 «배지 상세 티켓안»(2026-11-22 사용자 확정).
> 1회차(20261122_1222)가 티켓 틀·랜덤 색·토큰 덮어쓰기를, 2회차(20261122_1223)가 히어로 카드 분리와 이력·조건 부품의 제목 숨김을 만든다.

## 1. 범위

`/badges/[id]` 세 변형(아이템·체크인·액티비티, 본인·타인 `?u=` 보기). 드랍 시트형 상세(`BadgeDetailSheet`)·어드민 미리보기·잠긴 개체 상세(`LockedItemDetail`)는 범위 밖이다.

## 2. 페이지

- 페이지 범위에서 `--background`를 크림 `#F1E9D6`으로 덮어쓴다(TopNav도 따라간다). TopNav는 그대로다.
- 티켓은 좌우 16px 바깥 여백(`margin: 4px 16px 0`). 공유 버튼은 티켓 밖 하단(`padding: 24px 16px 32px + 안전영역`)에 둔다.
- 전체 화면 배경 테마 레이어, 체크인 안내 문단, 액티비티 «획득 정보» 카드 제목은 없다.

## 3. 티켓 머리

티켓색 단색, 윗모서리 직각. 안쪽 여백 `20px 20px 24px`, 가로 배치(`space-between`, gap 12px).

- 왼쪽: `.jam-logo-mark`, 높이 44.5px.
- 오른쪽(우측 정렬, 세로 gap 6px): 종류 글자 `ITEM`·`CHECK IN`·`ACTIVITY`(Noto Sans KR 900, 34px) + 날짜 `YYYY.MM.DD`(한국 시각, Geist Mono 12px). 날짜는 아이템=대표 개체 획득일, 체크인=마지막 방문일, 액티비티=획득일. 미획득이면 날짜 줄이 없다.

## 4. 절취선

머리와 아래 블록 사이, 사진 구간과 카드 구간 사이 두 곳. 점선(지름 4px, 간격 10px, 좌우 26px 안쪽)과 양끝 직선 삼각 홈(깊이 20px·높이 40px)을 `var(--background)`로 칠해 페이지 크림과 같은 색으로 보이게 한다.

## 5. 아래 블록

사진 구간부터 티켓 끝까지 한 덩어리, 아래 모서리 12px.

- 배경 `linear-gradient(180deg, 티켓색, 끝색)`. 끝색은 일반 `oklch(from 티켓색 calc(l - 0.08) calc(c * 1.2) h)`, 노랑(HSL 색상 40~70°) `oklch(from 티켓색 calc(l - 0.03) calc(c * 1.15) calc(h - 20))`.
- 그레인: 오라와 같은 노이즈(`AURA_GRAIN_URL`) 180px 타일, soft-light, opacity .55.
- 1회차: 사진 자리에 히어로 카드를 통째로 넣는다. 2회차에서 사진과 글자 상자로 나눈다.

## 6. 티켓 범위 토큰 덮어쓰기

`--card-bg`·`--surface` = 티켓색 70% + 흰색, `--background-secondary` = 티켓색 45% + 흰색, `--muted` = `rgba(23,23,23,.8)`, `--border` = `rgba(23,23,23,.12)`. 티켓 루트 클래스에서만 덮어쓰고 `:root`에는 쓰지 않는다.

## 7. 랜덤 색

- 후보는 원색 5개(`--jam-red`·`yellow`·`green`·`purple`·`blue`). 홈피드 `--feed-color-*`는 쓰지 않는다.
- 서버에서 요청마다 고른다. 배지 이미지 대표 색(`bg_colors`)과 `violatesImageColorRule`에 걸리는 색은 뺀다. 모두 빠지면 5개 전체에서 고른다.
- 첫 HTML에 인라인 `--ticket`·`--ticket-end`와 CSS 모듈 클래스가 담긴다. 클라이언트 JS로 색·모양을 정하지 않는다.

## 8. 구현 위치

| 내용 | 위치 |
|---|---|
| 티켓 틀 | `jam-web/src/app/(main)/badges/[id]/BadgeTicket.tsx`, `BadgeTicket.module.css` |
| 사진 박스(배경+이미지만) | `jam-web/src/app/(main)/badges/[id]/TicketPhoto.tsx` |
| 글자 상자(칩·이름 / 설명, 2px 테두리 두 칸) | `jam-web/src/app/(main)/badges/[id]/TicketTitleBoxes.tsx`, `BadgeTicket.module.css`의 `.titleBox` |
| 부품 제목 숨김(`hideTitle`, sr-only) | `PoiEarnHistory.tsx`·`ItemEarnHistory.tsx`·`BadgeConditionCard.tsx` — 배지 상세만 켠다 |
| 색 선택·끝색·날짜 | `jam-web/src/lib/badgeTicket/ticketColor.ts` |
| 세 변형 조립 | `jam-web/src/app/(main)/badges/[id]/page.tsx` |
| 종류 글자 | `jam-web/src/lib/i18n/ko.ts`의 `badges.ticketKind*` |
