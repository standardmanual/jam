# JAM! Phase 15 데이터 모델 — 홈 → '투데이' 개편

> 작성일: 2026-07-26

---

## 1. 신규 테이블: `today_cards`

```sql
CREATE TABLE public.today_cards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type     TEXT NOT NULL CHECK (template_type IN (
                       'badge_spotlight', 'progress_nudge', 'mission_spotlight',
                       'itembook_milestone', 'location_trend', 'drop_alert', 'editorial_article'
                     )),

  -- 공통 표시 필드
  title             TEXT NOT NULL,
  subtitle          TEXT,
  cover_image_url   TEXT,

  -- 템플릿별 참조 필드 (해당 템플릿에서만 사용, 나머지는 NULL/빈 배열)
  badge_ids         UUID[] NOT NULL DEFAULT '{}',   -- badge_spotlight, progress_nudge, location_trend
  mission_id        UUID REFERENCES public.missions(id) ON DELETE SET NULL,      -- progress_nudge, mission_spotlight
  item_book_id      UUID REFERENCES public.item_books(id) ON DELETE SET NULL,    -- itembook_milestone
  region_label      TEXT,                            -- location_trend (자유 입력, 예: "성수동")
  body_markdown     TEXT,                             -- editorial_article 본문

  -- 이동 경로 (editorial_article은 무시하고 /today/[id]로 고정 이동)
  target_href       TEXT,

  -- 노출 제어
  exposure_tags     TEXT[] NOT NULL DEFAULT '{all}',
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES public.users(id)
);

CREATE INDEX idx_today_cards_window ON public.today_cards (starts_at, ends_at) WHERE is_active = TRUE;

ALTER TABLE public.today_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "today_cards: 인증 유저 읽기" ON public.today_cards FOR SELECT TO authenticated USING (is_active = TRUE);
-- 쓰기는 서비스 롤(어드민 API)만 — 별도 authenticated INSERT/UPDATE 정책 없음
```

- `exposure_tags`는 문자열 배열. 값의 종류는 애플리케이션 레벨에서만 검증(Phase15_01 §4의 6개 자동 계산 태그 + `all`). DB CHECK 제약은 걸지 않음 — Phase 2에서 태그 종류가 늘어날 걸 감안.
- `badge_ids`가 배열인 이유: `badge_spotlight`/`location_trend`는 "배지 여러 개"를 한 카드에서 소개할 수 있어야 함(유저 예시: "레전드등급 배지 5").
- `editorial_article`은 `body_markdown`만 채우고 `badge_ids`/`mission_id`/`item_book_id`는 비워둠 — 순수 텍스트 콘텐츠.

## 2. 템플릿별 필드 사용 매트릭스

| 템플릿 | title | subtitle | cover_image_url | badge_ids | mission_id | item_book_id | region_label | body_markdown | target_href |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| badge_spotlight | ✅ | ✅ | ✅ | ✅(1개+) | | | | | 자동: 배지 1개면 `/badges/{id}`, 여러개면 `/badges`(어드민이 직접 지정 가능) |
| progress_nudge | ✅ | ✅ | ✅ | ✅(선택) | ✅(선택) | | | | 자동: badge/mission 중 채워진 쪽으로 |
| mission_spotlight | ✅ | ✅ | ✅ | | ✅ | | | | 자동: `/missions/{mission_id}` |
| itembook_milestone | ✅ | ✅ | ✅ | | | ✅ | | | 자동: `/itembooks/{id}`(경로는 실제 라우트 확인 후 Step에서 조정) |
| location_trend | ✅ | ✅ | ✅ | ✅(1개+) | | | ✅ | | 어드민 자유 입력(보통 `/badges`) |
| drop_alert | ✅ | ✅ | ✅(선택) | | | | | | 고정: `/drops` |
| editorial_article | ✅ | ✅ | ✅ | | | | | ✅ | 무시(항상 `/today/{id}`) |

## 3. 노출조건 태그 계산 (서버, 요청 시점)

```typescript
// src/lib/today/exposure.ts (신규)
async function computeUserExposureTags(userId: string, now: Date): Promise<string[]> {
  const tags = ['all', timeOfDayTag(now)] // 'time_dawn' | 'time_morning' | ...

  // 아래 3개는 각각 단순 존재 여부 쿼리 (COUNT 아님, LIMIT 1 exists 체크)
  if (await hasParticipatingMission(userId)) tags.push('has_participating_mission')
  if (await hasEndingSoonMission(userId, now)) tags.push('has_ending_soon_mission')
  if (await hasIncompleteItemBook(userId)) tags.push('has_incomplete_itembook')
  if (isNewUser(userId, now)) tags.push('new_user') // users.created_at 기준, DB 조회 없이 이미 가진 값으로 판정 가능

  return tags
}
```

- `hasEndingSoonMission`: `user_mission_participations` JOIN `missions` WHERE `ends_at BETWEEN now AND now+3d` AND 미완료.
- `hasIncompleteItemBook`: 기존 `src/lib/itembook/checker.ts`의 완성 판정 로직을 재사용해 "슬롯 일부만 참" 상태 확인.

## 4. 카드 조회 쿼리

```sql
SELECT * FROM public.today_cards
WHERE is_active = TRUE
  AND starts_at <= NOW() AND ends_at >= NOW()
  AND exposure_tags && ARRAY['all', ...유저태그]::TEXT[]   -- 배열 겹침 연산자
ORDER BY sort_order ASC, starts_at DESC;
```

- `&&`(overlap) 연산자는 `exposure_tags` GIN 인덱스로 가속 가능하나, 카드 수가 적을 것으로 예상되는 Phase 15 규모(수십~수백 개)에서는 불필요 — 필요 시 후속 Phase에서 추가.

## 5. 마이그레이션 파일

- `jam-web/supabase/migrations/0XX_today_cards.sql`: §1의 `CREATE TABLE` 그대로. 번호는 구현 시점의 최신 번호 다음 값 사용(직접 `ls supabase/migrations/`로 확인 — 044/045/046/047 등 중복 번호 파일이 이미 있었던 전례가 있으니 반드시 실물 확인).
