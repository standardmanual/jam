---
id: "20261022_2225"
category: Admin
priority: P1
status: CLOSED
created: 2026-10-22
---

# [Admin/Today] 투데이 콘텐츠 생성 노출 형태에 Dome(아치 돔)·Ticket(티켓) 추가 및 홈 피드 렌더링 지원

## 핵심 요약
- 요구사항: 사용자 결정에 따라 쉐이프 프로토타입 중 실용성과 심미성이 입증된 1번(Dome - 아치 돔)과 2번(Ticket - 상하 노치 티켓)을 정식 카드 형태로 채택한다. 어드민 투데이 콘텐츠 생성/수정(`TodayCardForm`)의 '노출 형태' 선택 옵션에 `dome`과 `ticket`을 추가하고, 홈 피드 카드 컴포넌트(`TodayCard`)에 `DomeCard`와 `TicketCard`를 신규 구현하여 연동한다.
- 구현 내용:
  1. **DB 마이그레이션 (`286_today_cards_add_dome_ticket_shapes.sql`)**: `today_cards_layout_type_check` 및 `today_cards_shape_check`에 `dome`, `ticket` 허용 추가.
  2. **타입 및 상수 정의**:
     - `types/database.ts`: `TodayCardLayoutType`에 `'dome' | 'ticket'` 추가.
     - `lib/today/shape.ts`: `CARD_SHAPES` 및 `IMAGE_CARD_SHAPES`에 `'dome' | 'ticket'` 추가, `resolveShape` 대응 규칙 추가.
     - `lib/admin/today-sections.ts`: `TODAY_LAYOUT_OPTIONS`에 아치 돔형, 티켓형 옵션 추가, `buildTodayCardSavePayload` 연동.
  3. **홈 피드 카드 컴포넌트 신규 구현**:
     - `components/today/DomeCard.tsx`: 상단 140px 아치형 실루엣을 가진 돔 카드.
     - `components/today/TicketCard.tsx`: 상하 펀칭 노치 컷아웃과 티켓 분할선을 가진 티켓 카드.
     - `components/today/TodayCard.tsx`: `RENDERED_SHAPES`에 `dome`, `ticket` 등록 및 렌더러 분기.
  4. **어드민 미리보기 연동**:
     - 어드민 생성 폼(`TodayCardForm`) 및 날짜별 미리보기에서 돔형/티켓형 실시간 렌더링 확인.
- 관련 파일:
  - `jam-web/supabase/migrations/286_today_cards_add_dome_ticket_shapes.sql`
  - `jam-web/src/types/database.ts`
  - `jam-web/src/lib/today/shape.ts`
  - `jam-web/src/lib/admin/today-sections.ts`
  - `jam-web/src/components/today/DomeCard.tsx`
  - `jam-web/src/components/today/TicketCard.tsx`
  - `jam-web/src/components/today/TodayCard.tsx`
  - `jam-web/src/app/admin/today/TodayCardForm.tsx`

## 완료 조건
- 어드민 투데이 카드 생성/수정 화면에서 '노출 형태'로 '아치 돔형', '티켓형'을 선택할 수 있다.
- 선택 시 우측 레일 실시간 미리보기에 아치 돔 및 티켓 형태의 카드가 정상 렌더링된다.
- 홈 피드 카드 컴포넌트(`TodayCard`)에서 `dome`과 `ticket` 모양 카드가 에러 없이 렌더링된다.
- TypeScript 타입 체크 및 ESLint, 관련 단위 테스트 전수 통과.
