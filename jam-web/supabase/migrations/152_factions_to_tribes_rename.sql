-- 티켓 20260910_1226: DB 스키마 트라이브 완전 통일 — factions → tribes 리네임
--
-- 티켓 20260910_1129에서 코드·UI 명칭은 "세계관"→"트라이브"로 전부 바꿨지만, 당시 staging·
-- 프로덕션 공용 단일 DB에 아직 배포되지 않은 코드가 남아 있어 DB 스키마(factions/faction_id
-- 계열)는 의도적으로 남겨뒀다. 아직 서비스 런칭 전이라 실사용자 데이터가 없으므로 이번 티켓에서
-- DB 스키마까지 완전히 tribes/tribe_id로 통일한다.
--
-- ⚠️ 실행 순서 주의 (오케스트레이터용): 이 마이그레이션 실행 직후 코드(이미 이 커밋에 포함된
-- tribe_id/tribes 기준 코드)를 staging→main 순서로 신속히 배포해 창을 최소화한다. 이 파일이
-- 커밋된 시점에는 아직 실행 전이므로 database.generated.ts는 여전히 옛 컬럼명 기준이고,
-- npx tsc --noEmit이 실패할 수 있다 — 마이그레이션 실행 후 타입 재생성으로 해소한다.
--
-- 실행 기록 (2026-09-10): mcp__supabase__apply_migration으로 실행 완료. Storage 버킷
-- images의 badges/factions/{collectionId}/* 171개 파일은 SQL로 표현할 수 없어 이 파일
-- 밖에서 Storage Move API로 별도 이동했고(전량 성공), badges.image_url(90행)·
-- item_books.image_url(10행)의 factions/ 문자열도 별도 UPDATE로 tribes/에 맞췄다.

-- ────────────────────────────────────────────────────────────
-- 1. 테이블 리네임
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.factions RENAME TO tribes;
ALTER TABLE public.faction_adjacency RENAME TO tribe_adjacency;

-- 제약(PK/FK) 이름도 함께 정리한다 — 동작에는 영향 없는 메타데이터 변경이지만,
-- "완전 통일"이 이번 티켓의 목적이므로 옛 이름을 남기지 않는다.
ALTER TABLE public.tribes RENAME CONSTRAINT factions_pkey TO tribes_pkey;
ALTER TABLE public.tribe_adjacency RENAME CONSTRAINT faction_adjacency_pkey TO tribe_adjacency_pkey;

-- ────────────────────────────────────────────────────────────
-- 2. 컬럼 리네임
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.badges RENAME COLUMN faction_id TO tribe_id;
ALTER TABLE public.item_books RENAME COLUMN faction_id TO tribe_id;
ALTER TABLE public.users RENAME COLUMN faction_id TO tribe_id;
ALTER TABLE public.tribe_adjacency RENAME COLUMN faction_id TO tribe_id;
ALTER TABLE public.tribe_adjacency RENAME COLUMN adjacent_faction_id TO adjacent_tribe_id;
ALTER TABLE public.user_drop_state RENAME COLUMN last_drop_faction_id TO last_drop_tribe_id;
ALTER TABLE public.combine_policy RENAME COLUMN tier1_min_factions TO tier1_min_tribes;
ALTER TABLE public.combine_policy RENAME COLUMN tier2_min_factions TO tier2_min_tribes;
ALTER TABLE public.combine_policy RENAME COLUMN tier3_min_factions TO tier3_min_tribes;

-- FK 제약 이름도 함께 정리 (RENAME COLUMN은 제약 이름을 자동으로 바꾸지 않는다).
ALTER TABLE public.badges RENAME CONSTRAINT badges_faction_id_fkey TO badges_tribe_id_fkey;
ALTER TABLE public.item_books RENAME CONSTRAINT item_books_faction_id_fkey TO item_books_tribe_id_fkey;
ALTER TABLE public.users RENAME CONSTRAINT users_faction_id_fkey TO users_tribe_id_fkey;
ALTER TABLE public.tribe_adjacency RENAME CONSTRAINT faction_adjacency_faction_id_fkey TO tribe_adjacency_tribe_id_fkey;
ALTER TABLE public.tribe_adjacency RENAME CONSTRAINT faction_adjacency_adjacent_faction_id_fkey TO tribe_adjacency_adjacent_tribe_id_fkey;
ALTER TABLE public.user_drop_state RENAME CONSTRAINT user_drop_state_last_drop_faction_id_fkey TO user_drop_state_last_drop_tribe_id_fkey;

-- RLS 정책 이름도 함께 정리 (마이그레이션 014, 034에서 "factions"/"faction_adjacency"로 명명됨).
ALTER POLICY "factions: 전체 읽기 허용" ON public.tribes RENAME TO "tribes: 전체 읽기 허용";
ALTER POLICY "faction_adjacency: 전체 읽기 허용" ON public.tribe_adjacency RENAME TO "tribe_adjacency: 전체 읽기 허용";

-- ────────────────────────────────────────────────────────────
-- 3. RPC 리네임 + 본문 내부 참조 갱신
--    (마이그레이션 092 도입 → 121 background_color 단일화 → 124 background_animation 추가.
--     124가 최신 정의이므로 그 본문을 기준으로 테이블/컬럼 참조만 tribe로 바꿔 재정의한다.
--
--     ⚠️ 실행 시 실측: 파라미터 이름이 p_faction_id → p_tribe_id로 바뀌므로
--     ALTER FUNCTION ... RENAME TO 후 CREATE OR REPLACE는 Postgres가
--     "42P13: cannot change name of input parameter"로 거부한다(같은 트랜잭션이라 전체
--     롤백됨 — 실행 직후 확인). DROP 후 CREATE로 바꾸고, DROP이 기존 GRANT를 지우므로
--     마이그레이션 109에서 잠가둔 권한(PUBLIC 차단 + service_role만 허용)을 명시적으로
--     재부여한다.)
-- ────────────────────────────────────────────────────────────

DROP FUNCTION public.count_faction_background_cascade(uuid);
DROP FUNCTION public.apply_faction_background_cascade(uuid);

CREATE FUNCTION public.count_tribe_background_cascade(p_tribe_id UUID)
RETURNS TABLE(direct_badges INT, item_books INT, item_book_badges INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tribes WHERE id = p_tribe_id) THEN
    RAISE EXCEPTION '존재하지 않는 트라이브입니다: %', p_tribe_id;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::INT FROM public.badges WHERE tribe_id = p_tribe_id AND deleted_at IS NULL),
    (SELECT count(*)::INT FROM public.item_books WHERE tribe_id = p_tribe_id),
    (SELECT count(*)::INT FROM public.badges
      WHERE deleted_at IS NULL
        AND item_book_id IN (SELECT id FROM public.item_books WHERE tribe_id = p_tribe_id));
END;
$$;

CREATE FUNCTION public.apply_tribe_background_cascade(p_tribe_id UUID)
RETURNS TABLE(direct_badges INT, item_books INT, item_book_badges INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_background_color TEXT;
  v_background_animation JSONB;
  v_direct_badges INT;
  v_item_books INT;
  v_item_book_badges INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tribes WHERE id = p_tribe_id) THEN
    RAISE EXCEPTION '존재하지 않는 트라이브입니다: %', p_tribe_id;
  END IF;

  SELECT background_color, background_animation
  INTO v_background_color, v_background_animation
  FROM public.tribes
  WHERE id = p_tribe_id;

  -- (a) 트라이브 직속 배지
  WITH updated AS (
    UPDATE public.badges
    SET background_color = v_background_color,
        background_animation = v_background_animation
    WHERE tribe_id = p_tribe_id
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_direct_badges FROM updated;

  -- (b) 트라이브 소속 컬렉션
  WITH updated AS (
    UPDATE public.item_books
    SET background_color = v_background_color,
        background_animation = v_background_animation
    WHERE tribe_id = p_tribe_id
    RETURNING id
  )
  SELECT count(*) INTO v_item_books FROM updated;

  -- (c) 그 컬렉션들에 속한 아이템배지
  WITH updated AS (
    UPDATE public.badges
    SET background_color = v_background_color,
        background_animation = v_background_animation
    WHERE deleted_at IS NULL
      AND item_book_id IN (SELECT id FROM public.item_books WHERE tribe_id = p_tribe_id)
    RETURNING id
  )
  SELECT count(*) INTO v_item_book_badges FROM updated;

  RETURN QUERY SELECT v_direct_badges, v_item_books, v_item_book_badges;
END;
$$;

REVOKE ALL ON FUNCTION public.count_tribe_background_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_tribe_background_cascade(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.apply_tribe_background_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_tribe_background_cascade(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────
-- 4. jsonb 키 리네임 (faction 관련 키 → tribe)
--
--    이 워크트리 세션은 DB에 직접 SELECT를 실행할 수 있는 도구가 없어(SQL 작성만 허용,
--    실행은 오케스트레이터 권한) 실제 payload/metadata의 정확한 키 이름을 조회로 확인하지
--    못했다. 대신 하드코딩된 키 이름을 추측해 틀리는 위험을 피하기 위해, "faction"을
--    부분 문자열로 포함하는 모든 top-level 키를 "tribe"로 치환하는 범용 UPDATE로 작성했다.
--    (예: faction_name → tribe_name, faction_id → tribe_id 등 키 이름에 상관없이 안전하게 동작)
--    오케스트레이터는 실행 전 SELECT로 실제 키 목록을 한 번 더 확인할 것을 권장한다.
-- ────────────────────────────────────────────────────────────

UPDATE public.user_activity_feed
SET metadata = (
  SELECT jsonb_object_agg(
    CASE WHEN key LIKE '%faction%' THEN replace(key, 'faction', 'tribe') ELSE key END,
    value
  )
  FROM jsonb_each(metadata) AS kv(key, value)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_object_keys(metadata) AS k WHERE k LIKE '%faction%'
);

UPDATE public.engine_decision_log
SET payload = (
  SELECT jsonb_object_agg(
    CASE WHEN key LIKE '%faction%' THEN replace(key, 'faction', 'tribe') ELSE key END,
    value
  )
  FROM jsonb_each(payload) AS kv(key, value)
)
WHERE payload IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_object_keys(payload) AS k WHERE k LIKE '%faction%'
  );

-- event 컬럼(문자열 값 자체, jsonb 아님)에 남아있는 'faction_constant_missing' 이벤트명도
-- 코드에서 'tribe_constant_missing'으로 바꾸므로 기존 로그 행도 함께 맞춘다.
UPDATE public.engine_decision_log
SET event = 'tribe_constant_missing'
WHERE event = 'faction_constant_missing';
