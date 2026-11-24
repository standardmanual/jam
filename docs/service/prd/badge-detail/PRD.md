---
type: prd
status: draft
description: "배지 상세 화면 3종(아이템·체크인·액티비티)과 컬렉션 상세의 티켓 디자인 규격이다. 기본 바탕 위 티켓 머리, 절취선, 그라데이션 아래 블록, 티켓 범위 토큰, 티켓색 결정(홈 카드 이어받기·무작위), 사진 자리와 미획득 실루엣, Strava 버튼을 정한다."
related:
  - "20261122_1221"
  - "20261122_1222"
  - "20261122_1223"
  - "20261122_2226"
  - "20261124_2252"
  - "20261124_2253"
---

# 배지 상세 티켓 PRD

> 상위 티켓 [20261122_1221](../../../tickets/p2-normal/20261122_1221_UI_배지-상세-화면을-티켓-디자인으로-리뉴얼한다-상위.md). 시안은 캔버스 «배지 상세 티켓안»(2026-11-22 사용자 확정).
> 1회차(20261122_1222)가 티켓 틀·랜덤 색·토큰 덮어쓰기를, 2회차(20261122_1223)가 히어로 카드 분리와 이력·조건 부품의 제목 숨김을 만든다.

## 1. 범위

`/badges/[id]` 세 변형(아이템·체크인·액티비티, 본인·타인 `?u=` 보기). 드랍 시트형 상세(`BadgeDetailSheet`)·어드민 미리보기·잠긴 개체 상세(`LockedItemDetail`)는 범위 밖이다.

## 2. 페이지

- 페이지 바탕은 다른 화면과 같은 기본 `--background`다(덮어쓰지 않는다). 처음에는 크림 `#F1E9D6`으로 덮어썼으나 2026-11-22 사용자 지시로 걷었다(티켓 20261122_1424). TopNav는 그대로다.
- 티켓은 좌우 16px 바깥 여백(`margin: 4px 16px 0`). 공유 버튼은 티켓 밖 하단(`padding: 24px 16px 32px + 안전영역`)에 둔다. 공유 버튼이 없는 경우(미획득·타인 배지)에도 티켓과 푸터 사이에 같은 아래 여백(32px + 안전영역)을 둔다(티켓 20261122_1442).
- 전체 화면 배경 테마 레이어, 체크인 안내 문단, 액티비티 «획득 정보» 카드 제목은 없다.

## 3. 티켓 머리

티켓색 단색, 윗모서리 직각. 안쪽 여백 `20px 20px 24px`, 가로 배치(`space-between`, gap 12px).

- 왼쪽: `.jam-logo-mark`, 높이는 종류 글자 한 줄의 실제 글자 높이와 같은 17.73px, 윗선도 종류 글자 윗선과 맞춘다(`margin-top` 3.73px). 2026-11-22 사용자 지시로 로고와 종류 글자를 둘 다 70%로 줄였다(이전: 로고 44.5px = 종류+날짜 묶음 높이, 종류 34px, 티켓 20261122_1404).
- 오른쪽(우측 정렬, 세로 gap 6px): 종류 글자 `ITEM`·`CHECK IN`·`ACTIVITY`(Noto Sans KR 900, 23.8px) + 날짜 `YYYY.MM.DD`(한국 시각, Geist Mono 12px). 날짜는 아이템=대표 개체 획득일, 체크인=마지막 방문일, 액티비티=획득일. 미획득이면 날짜 줄이 없다.

## 4. 절취선

머리와 아래 블록 사이, 사진 구간과 카드 구간 사이 두 곳. 점선(지름 4px, 간격 10px, 좌우 26px 안쪽)과 양끝 직선 삼각 홈(깊이 20px·높이 40px)을 `var(--background)`로 칠해 페이지 바탕과 같은 색으로 보이게 한다.

## 5. 아래 블록

사진 구간부터 티켓 끝까지 한 덩어리, 아래 모서리 12px.

- 배경 `linear-gradient(180deg, 티켓색, 끝색)`. 끝색은 일반 `oklch(from 티켓색 calc(l - 0.08) calc(c * 1.2) h)`, 노랑(HSL 색상 40~70°) `oklch(from 티켓색 calc(l - 0.03) calc(c * 1.15) calc(h - 20))`.
- 그레인: 오라와 같은 노이즈(`AURA_GRAIN_URL`) 180px 타일, soft-light, opacity .55.
- 1회차: 사진 자리에 히어로 카드를 통째로 넣는다. 2회차에서 사진과 글자 상자로 나눈다.
- 사진 자리(통합 팔레트 4, 티켓 20261122_2226): 이미지 색 그라데이션(Aura)과 그림자는 없다. 바탕은 `--card-bg`(티켓색 70% + 흰색) 단색이다. 어드민이 배지에 지정한 블롭 애니메이션 테마가 있으면 그 배경이 그대로 깔린다.
- 미획득 배지: 회색·반투명 대신 같은 그림의 알파 모양을 티켓색을 깊게 낮춘 단색 실루엣(`--ticket-silhouette`)으로 칠한다. 색은 키별 hex 표 `TICKET_SILHOUETTE`다: 노랑 `#B4600F`(오렌지 쪽), 초록 `#2E6B17`, 분홍 `#8E2C69`, 하늘 `#1D6F8E`, 빨강 `#8A1414`, 보라 `#5E3E92`, 파랑 `#0B4E80`. 일곱 색 모두 사진 자리 바탕(티켓색 70% + 흰색 30%)과 휘도 대비 3:1 이상이고, 단위 시험이 이를 고정한다. 칠하기는 SVG 필터(`feFlood` + `SourceAlpha`)다 — CSS mask는 다른 출처 이미지가 CORS 없이는 비어 그림이 사라질 수 있다. 그림이 없거나 불러오지 못하면 메달 아이콘을 같은 색으로 그린다.
- 획득 정보 카드의 «Strava에서 보기» 버튼: 검정 바탕(`--foreground`)·흰 굵은 글씨(`--snow`), 폭 100%·높이 최소 44px·완전 둥근 필. 같은 부품을 쓰는 POI 이력의 Strava 버튼도 같은 모양이다. 칩(등급·레벨·방문 횟수)은 제목 상자 안에 그대로 둔다.

## 6. 티켓 범위 토큰 덮어쓰기

`--card-bg`·`--surface` = 티켓색 70% + 흰색, `--background-secondary` = 티켓색 45% + 흰색, `--muted` = `rgba(23,23,23,.8)`, `--border` = `rgba(23,23,23,.12)`. 티켓 루트 클래스에서만 덮어쓰고 `:root`에는 쓰지 않는다.

## 7. 티켓색 결정

- 후보는 통합 팔레트 일곱 색(`--jam-yellow`·`green`·`pink`·`sky`·`red`·`purple`·`blue`). 짙은 초록(`green-deep`)·흰색은 후보가 아니다. 홈피드 `--feed-color-*`는 쓰지 않는다.
- 홈 카드에서 들어오면 그 카드의 바탕색을 이어받는다. 짙은 초록은 초록으로 접는다. 홈 카드가 배지 상세 한 건(`/badges/{id}`) 주소로 가는 링크에는 `tc`(카드 바탕 키)와 `tb`(박스 키) 쿼리가 붙는다(`cardView.ts`가 `withTicketColorQuery`로 한 번에 붙인다). 다른 목적지와 목록 항목 주소에는 붙지 않는다.
- 이어받은 색이 배지 이미지 대표 색(`bg_colors`)과 `violatesImageColorRule`에 걸리면 박스 색을, 그것도 걸리면 일곱 색 중 걸리지 않는 색에서 서버가 요청마다 무작위로 고른다. 모두 걸리면 일곱 색 전체에서 고른다.
- 탭 바·직접 링크 등 다른 경로(쿼리가 없거나 `tc`·`tb`가 허용 목록 밖: 배열·빈 값·`white`·옛 키·대소문자 틀림)는 오류 없이 위 무작위와 같다.
- 쿼리 값은 신뢰하지 않는다. `FEED_COLOR_KEYS` 허용 목록으로만 읽고 주소·화면에 그대로 반영하지 않는다. 공유 버튼은 배지 그림 이미지 한 장을 내보내고 주소를 복사하지 않는다(`BadgeShareButton.tsx`에 `location`·주소 복사 호출이 없다). 사용자가 주소창의 주소를 직접 복사해 보내면 `tc`·`tb`가 딸려 가 받는 사람도 같은 색을 본다.
- 첫 HTML에 인라인 `--ticket`·`--ticket-end`·`--ticket-silhouette`와 CSS 모듈 클래스가 담긴다. 클라이언트 JS로 색·모양을 정하지 않는다.

## 8. 구현 위치

| 내용 | 위치 |
|---|---|
| 티켓 틀 | `jam-web/src/app/(main)/badges/[id]/BadgeTicket.tsx`, `BadgeTicket.module.css` |
| 사진 박스(배경+이미지만) | `jam-web/src/app/(main)/badges/[id]/TicketPhoto.tsx` |
| 글자 상자(칩·이름 / 설명, 2px 테두리 두 칸) | `jam-web/src/app/(main)/badges/[id]/TicketTitleBoxes.tsx`, `BadgeTicket.module.css`의 `.titleBox` |
| 부품 제목 숨김(`hideTitle`, sr-only) | `PoiEarnHistory.tsx`·`ItemEarnHistory.tsx`·`BadgeConditionCard.tsx` — 배지 상세만 켠다 |
| 색 결정·끝색·실루엣 색·쿼리 검증·날짜 | `jam-web/src/lib/badgeTicket/ticketColor.ts` |
| 홈 카드 → 상세 쿼리 | `jam-web/src/lib/today/cardView.ts`(`withTicketColorQuery`) |
| Strava 버튼 | `jam-web/src/components/StravaLink.tsx` |
| 세 변형 조립 | `jam-web/src/app/(main)/badges/[id]/page.tsx` |
| 종류 글자 | `jam-web/src/lib/i18n/ko.ts`의 `badges.ticketKind*` |

## 9. 컬렉션 상세 (티켓 20261124_2252·2253)

> 상위 티켓 [20261124_2252](../../../tickets/p2-normal/20261124_2252_UI_컬렉션-상세-화면을-배지-상세와-같은-티켓-디자인으로-리뉴얼한다-상위.md). 1회차 20261124_2253이 서비스 화면 `/collections/[id]`를, 2회차 20261124_2254가 어드민의 컬렉션 상세 미리보기 프레임과 트라이브 폼의 «배경 테마» 카드를 걷는다.

- **범위**: `/collections/[id]` 본인·타인(`?u=`)·장착(`slot=1`) 보기 모두 같은 틀이다. 404·로그인 이동·슬롯 선택 시트·«모두 빼기» 시트(티켓 밖 오버레이)는 그대로다. 전체 화면 배경 테마 레이어와 대표 카드 블롭 애니메이션은 그리지 않는다.
- **틀**: 배지 상세의 `BadgeTicket`을 그대로 쓴다(값은 위 §3~§5와 같다). 머리는 로고와 `COLLECTION`이고 날짜 줄이 없다. 순서는 머리 → 절취선 1 → [표지 1:1 → 글자 상자 → 진행 표시 → 절취선 2 → 이야기 글 → 슬롯 칸 → 체크인 배지]다.
- **티켓색**: `item_books.cover_params.bgHex`를 OKLCH로 읽어 명도를 `max(0.2, L - 0.10)`으로 낮추고 채도·색상은 유지한다(색역 밖이면 채도만 줄인다). 끝색은 배지 상세와 같은 `ticketEndColor`다. 값이 없거나 `#rrggbb`가 아니면 통합 팔레트 일곱 색 중 하나로 대신한다. 서버가 정해 첫 HTML에 `data-ticket-color="cover"`와 인라인 `--ticket`(hex)으로 담는다. 홈 카드 색 이어받기(`tc`·`tb`)는 쓰지 않는다.
- **글자색 두 겹**: 티켓 면 위 글자(머리·로고·글자 상자·진행 «n/N»·이야기 글·체크인 제목·힌트)는 `--ticket-text`다. `#171717`·`#fff` 중 «티켓색»과 «티켓색·끝색 중간색» 둘 다 대비 4.5 이상인 쪽을 `#171717` → `#fff` 순서로 먼저 통과한 것으로 쓰고, 둘 다 안 되면 순수 `#000`을 쓴다. 그것도 안 되면 두 곳 대비 중 작은 쪽이 가장 큰 후보를 쓴다. `--muted`(80%)·`--border`(12%)·`--link`가 이 값에서 나온다. 카드 안 글자(슬롯 칸·체크인 타일·표지 자리·배지 없음 안내·초록 완성 알림)는 항상 `#171717`이다(`.cards`·`.ink`가 토큰을 잉크색으로 되돌린다). 면 위 글자 구간에는 `TicketTone tone="face"`를 쓴다.
- **카드 바탕**: `--card-bg`·`--surface`는 티켓색 `--card-mix`(기본 70%) + 흰색, `--background-secondary`는 `--card-mix-2`(기본 45%) + 흰색이다. 카드 안 `#171717` 대비가 4.5 미만이면(짙은 표지) `--card-mix`를 5%씩 낮추고 `--card-mix-2`는 같은 비율로 따라 낮춘다. 연한 표지는 70%/45%다.
- **사진 자리**: 표지를 좌우 16px·모서리 16px·1:1·아래 20px로 그대로 채운다(`CollectionTicketPhoto.tsx`). 오라·블롭·그림자 없음. 표지가 없거나 불러오지 못하면 `--card-bg` 1:1 칸에 `MagicBookIcon`이다.
- **글자 상자**: 위 칸 이름(h1, `text-3xl`), 아래 칸 설명(`text-base`, 마침표 기준 줄바꿈). 이름 위에 컬렉션 등급 칩(`RarityBadge` md)을 둔다: 4등급 컬렉션(`tier_mode`)에서 지금 장착한 배지의 등급이고, Common이거나 등급이 아직 정해지지 않았거나 4등급이 아닌 컬렉션은 칩이 없다(2026-11-25 사용자 지시). 설명이 없으면 아래 칸과 가운데 테두리를 그리지 않는다. 배지 상세의 `TicketTitleBoxes`와 같은 안쪽(`TicketTitleBoxesView`)을 쓴다.
- **진행 표시**: 글자 상자 아래·절취선 2 위 티켓 면(좌우 16px). 모으는 중은 초록 캡슐 `ProgressCountBar`(«n/N»), 완성하면 초록 완성 알림 카드(칩·제목·본문)다. 지금 모양 그대로이고 «n/N» 글자색만 티켓 글자색을 따른다.
- **보조 글자**: 이야기 글·체크인 힌트는 80% 투명 `--muted`로는 짙거나 채도 높은 티켓에서 대비 4.5를 못 넘는 표지가 많아 `--foreground`(= 티켓 글자색)를 쓴다.
- **어드민 미리보기 없음**: 컬렉션 상세 미리보기 프레임(`ItemBookDetailPreviewFrame`)과 옛 히어로(`ItemBookHeroSection`)는 삭제했다(티켓 20261124_2254). 컬렉션 편집 폼(티켓 20261124_2326)과 트라이브 폼에는 컬렉션 상세 미리보기·배경 테마 입력이 없고, 트라이브 저장은 `background_color`·`background_animation`을 보내지 않는다(PUT은 기존 값 유지, POST는 null). DB 칸과 API는 그대로 둔다.
- **구현 위치**: `collections/[id]/page.tsx`(조립), `collections/[id]/CollectionTicketPhoto.tsx`, `badges/[id]/BadgeTicket.tsx`(`TicketPaint`·`TicketTone`)·`BadgeTicket.module.css`(`--ticket-text`·`--card-mix`), `badges/[id]/TicketTitleBoxes.tsx`(`TicketTitleBoxesView`), `lib/badgeTicket/ticketColor.ts`(`deriveCoverTicketColor`·`pickTicketTextColor`·`pickCardMix`), 종류 글자 `lib/i18n/ko.ts`의 `itembooks.ticketKind`. MODULAR 승격(티켓 20261122_1351)은 하지 않고 서비스 전용을 유지한다.
