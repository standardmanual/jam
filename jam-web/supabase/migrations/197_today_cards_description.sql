-- 197: today_cards.description 신규 — 홈피드 카드 게재용 설명문 (티켓 20260929_1335)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--
-- 배경:
--   주간 편성안의 「설명(게재 문안)」을 담을 곳이 없었다(티켓 20260929_1250). 기사(editorial_article)
--   카드는 `body_markdown`이 있지만 그 밖의 카드는 제목·부제만 보인다. 부제 아래에 유저에게 보이는
--   짧은 설명문(40자 이하, 화면에서 2줄까지)을 넣을 수 있게 컬럼을 추가한다.
--
-- 설계:
--   - `description`은 nullable TEXT. 기존 카드는 전부 NULL로 남고 화면은 지금과 같다.
--   - 40자 상한·줄바꿈 금지·기사 템플릿 금지는 어드민 폼과 등록 묶음(registerHomeFeedBundle.mjs)이
--     같은 상수로 검사한다. DB CHECK는 넣지 않는다(상한을 바꿀 때 마이그레이션이 필요 없도록).
--   - 추가만 하고 옛 모양을 건드리지 않는 순수 확장(expand) 마이그레이션이다
--     (`db-migration-rules.md` §1). 백필은 없다.
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS로 작성했다.

BEGIN;

ALTER TABLE public.today_cards ADD COLUMN IF NOT EXISTS description TEXT NULL;

COMMENT ON COLUMN public.today_cards.description IS
  '홈피드 카드 게재용 설명문(유저에게 보임, 40자 이하·줄바꿈 없음). 부제 아래 14px로 표시한다.
   editorial_article은 쓰지 않고(본문은 body_markdown), shortcut 레이아웃은 화면에 그리지 않는다.
   NULL이면 표시 없음 — 티켓 20260929_1335.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'today_cards' AND column_name = 'description';
-- SELECT count(*) FROM public.today_cards WHERE description IS NOT NULL; -- 0이어야 정상(실행 직후)

-- 되돌림 SQL
-- ALTER TABLE public.today_cards DROP COLUMN IF EXISTS description;
