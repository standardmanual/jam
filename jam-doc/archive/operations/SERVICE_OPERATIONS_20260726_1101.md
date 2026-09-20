# JAM! 서비스 운영 문서 — 변경분 (2026-07-26 11:01)

> **이 버전의 변경 내용:** 투데이 카드에 `layout_type`(노출 형태) 추가 — template_type(콘텐츠 종류)과 별개 축으로 큰썸네일형/배지목록형/바로가기형/배너형/기타 5종 지원.
> 이전 버전: SERVICE_OPERATIONS_20260726_1028.md

---

## 투데이 카드 노출 형태(layout_type) 추가

**관련 파일:** `supabase/migrations/049_today_cards_layout_type.sql`(신규), `src/types/database.ts`, `src/lib/today/cards.ts`, `src/app/(main)/TodayCardStack.tsx`, `src/app/admin/today/TodayCardList.tsx`

- **배경**: 기존 `template_type`(콘텐츠 종류: 배지소개/미션소개/기사 등)은 "무엇을 보여줄지"만 결정했고, "어떻게 보여줄지"(카드 모양)는 항상 하나의 고정 레이아웃이었음. 콘텐츠 종류와 노출 형태를 독립된 축으로 분리해 어드민이 자유롭게 조합할 수 있게 함.
- **`layout_type` 5종**:
  - `large_thumbnail`(큰 썸네일형) — 커버 이미지 크게 + 제목/부제. 없으면 첫 참조 배지의 이미지로 자동 대체.
  - `badge_gallery`(배지목록형) — 참조된 배지들을 가로 갤러리로 나열(이미지+이름). `resolved_badges`(신규, `getTodayCards()`가 `badge_ids`를 실제 배지 정보로 조인해서 채워줌)를 사용.
  - `shortcut`(바로가기형) — 이미지 없이 아이콘+제목 한 줄, 이동 유도 CTA.
  - `banner`(배너형) — 가로로 넓은 띠, 배경 이미지 위 텍스트 오버레이.
  - `other`(기타) — 위 4종에 안 맞는 콘텐츠용 담백한 기본형.
- **어드민**: 카드 생성 폼에 "노출 형태" 셀렉트 추가. 템플릿 타입을 고르면 어울리는 레이아웃을 기본값으로 미리 선택해주되(`suggestedLayoutFor`), 어드민이 자유롭게 다른 형태로 바꿀 수 있음(강제 아님).
- **DB 반영 필요**: `layout_type` 컬럼 추가는 DDL이라 이번에도 관리자가 Supabase SQL Editor에서 직접 실행 필요 — `049_today_cards_layout_type.sql`. 이미 있는 20개 샘플 카드에 대한 레이아웃/썸네일 백필은 `supabase/seed_phase15_layout_backfill.sql`(049 적용 후 실행, 또는 세션에서 직접 UPDATE 실행 가능 — DML은 service_role로 가능).
