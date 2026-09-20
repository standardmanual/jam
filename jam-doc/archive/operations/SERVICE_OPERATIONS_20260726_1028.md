# JAM! 서비스 운영 로직 — Phase 15 투데이 개편 반영

> **이 버전의 변경 내용:** 홈 → '투데이' 개편 — `today_cards` 콘텐츠 카드 CMS + 노출조건 태그(OR 매칭) + 예약 발행 + 에디토리얼 기사 페이지 신설
> 이전 버전: SERVICE_OPERATIONS_20260725_2009.md

> 본 문서는 `PRD/SERVICE_OPERATIONS.md` 기반으로 Phase 15에서 **변경/신설된 섹션만** 기술한다.

---

## N. 투데이 콘텐츠 카드 (Phase 15 신설)

### N-1. 개념

기존 홈(`/`)은 "내가 한 일"(최근 배지/피드) 중심이었다. Phase 15에서 하단 탭 "홈"을 **"투데이"**로 개명하고,
홈 최상단에 어드민이 큐레이션한 **콘텐츠 카드 스택**을 추가했다. 기존 홈 섹션(최근 배지/바로가기/피드)은
순서·내용 그대로 아래에 유지된다(회귀 없음).

### N-2. 데이터 모델 — `today_cards`

- 마이그레이션: `supabase/migrations/048_today_cards.sql`
- 주요 컬럼:
  - `template_type` (CHECK 7종): `badge_spotlight` / `progress_nudge` / `mission_spotlight` / `itembook_milestone` / `location_trend` / `drop_alert` / `editorial_article`
  - 공통: `title`, `subtitle`, `cover_image_url`
  - 템플릿별 참조: `badge_ids UUID[]`(배지 소개/진행/지역), `mission_id`(진행/미션), `item_book_id`(아이템북), `region_label`(지역), `body_markdown`(기사 본문)
  - 이동: `target_href`(비우면 템플릿 규칙 자동 생성)
  - 노출 제어: `exposure_tags TEXT[]`(기본 `{all}`), `starts_at`/`ends_at`(예약 발행), `sort_order`, `is_active`
- RLS: 인증 유저는 `is_active = TRUE` 카드만 SELECT. 쓰기는 서비스 롤(어드민 API)만.
- 인덱스: `idx_today_cards_window (starts_at, ends_at) WHERE is_active`.

### N-3. 노출조건 태그 계산 (`src/lib/today/exposure.ts`)

요청 시점에 유저 상태 태그를 계산해 카드의 `exposure_tags`와 **배열 겹침(OR)** 매칭한다.

- 항상 포함: `all`, 시간대 태그(`time_dawn`/`morning`/`afternoon`/`evening`/`night`, **KST(UTC+9) 기준**)
- 조건부 자동계산: `has_participating_mission`(참가·미완료 미션 존재), `has_ending_soon_mission`(3일 내 종료 미완료 미션), `has_incomplete_itembook`(슬롯 일부만 채운 미완성 북), `new_user`(가입 7일 이내)
- 순수 함수 `timeOfDayTag`/`isNewUser`는 유닛테스트(`src/lib/today/__tests__/today-logic.test.ts`, node:assert) 커버.
- 활동 로그 원본 테이블이 없어 "러닝 많이 하는 유저" 등 활동기반 세그먼트는 범위 밖(Phase 2).

### N-4. 카드 조회 (`src/lib/today/cards.ts`)

- `getTodayCards(userId, userCreatedAt?, now?)`:
  `is_active` AND `starts_at <= now <= ends_at` AND `exposure_tags && [유저태그]` → `sort_order ASC, starts_at DESC`.
  각 카드에 `resolved_href` 부여.
- `resolveTargetHref(card)` (순수 함수, 테스트 커버):
  - `editorial_article` → 항상 `/today/{id}` (어드민 입력 무시)
  - 그 외 → 어드민 `target_href` 우선, 없으면 템플릿 규칙:
    배지 1개 `/badges/{id}` · 여러 개 `/badges`, `mission_spotlight` `/missions/{id}`, `itembook_milestone` `/itembooks/{id}`, `drop_alert` `/drops`.
- `getPublishedArticleCard(cardId, now?)`: 기사 페이지 전용 단건. `editorial_article`이고 `is_active`·기간 내일 때만 반환 → 예약발행 전/종료 후 직링크 접근 차단.

### N-5. 화면

- **홈 카드 스택**: `src/app/(main)/page.tsx`가 `getTodayCards()` 호출 → `TodayCardStack.tsx`(카드 0개면 섹션 자체 미노출). 유저 검색 아래, 최근 배지 위에 삽입.
- **기사 페이지**: `src/app/(main)/today/[cardId]/page.tsx`. `body_markdown`을 **빈 줄 기준 문단 분리**(`<p>`, 마크다운 파서 미설치)로만 렌더링. 기간 밖/비활성/다른 템플릿 → `notFound()`.
- **하단 탭**: `TabBar.tsx` 라벨 "홈" → "투데이" (href/아이콘/active 로직 불변).

### N-6. 어드민 CMS

- 목록/생성: `src/app/admin/today/page.tsx` + `TodayCardList.tsx`(템플릿 선택 → 동적 폼). 배지 검색·다중선택, 미션/아이템북 셀렉트, 노출조건 태그 체크, 시작/종료 일시, 정렬순서, 활성 토글.
- API: `src/app/api/admin/today/route.ts`(GET/POST), `src/app/api/admin/today/[id]/route.ts`(PATCH/DELETE). `requireAdmin()` + service client.
- 어드민 내비(`AdminNav.tsx`)에 "투데이 콘텐츠" 진입 추가.

### N-7. 샘플 콘텐츠

- `supabase/seed_phase15_today_cards_20.sql`: 20개(badge_spotlight 5 / progress_nudge 3 / mission_spotlight 3 / itembook_milestone 2 / location_trend 2 / drop_alert 2 / editorial_article 3). 배지/미션/아이템북은 이름 서브쿼리로 참조. 전 카드 `ends_at = 2026-12-30 23:59:59+09`, 3개(#5·#8·#18)만 미래 `starts_at`로 예약 발행 시연.
