-- 367_chapter_jam_backfill_prepare.sql
-- 기존 유저 이관 준비: 백업 표와 이관 함수 추가 (티켓 20261127_1728, 상위 20261127_1720)
--
-- 확장 단계다(db-migration-rules.md 1절). 새 표 chapter_jam_backfill 1개와 새 함수 chapter_jam_backfill_chunk 1개만 덧붙인다.
-- 데이터를 바꾸지 않는다. 적용 직후 chapter_jam_backfill은 0행이고 user_chapters·chapter_ups·chapter_jam_events도 그대로다.
-- 옛 함수·열·정책·기존 표는 건드리지 않는다. 호출하는 곳이 아직 없다.
--
-- 이관 규칙(사용자 확정, 2026-11-27)
--   이번 챕터 진행값 = (현재 챕터에 도달한 뒤의 capsule_fill 합계) + 지갑 잔액.
--   현재 챕터 도달 시각은 chapter_ups의 그 챕터 행 reached_at이고, 행이 없으면 모든 capsule_fill을 센다.
--   진행값이 required_jam 이상이면 한 번에 여러 챕터까지 올리고 넘친 잼은 이월한다(chapter_jam_apply와 같은 규칙). 챕터는 내려가지 않는다.
--   보상은 이관이 새로 올린 챕터만 대상이며(promoted_chapters), 지급은 C3b가 오픈 뒤 첫 동기화에서 한다. 이 파일은 지급하지 않는다.
--
-- 함수 하나가 두 모드를 한다
--   p_apply = FALSE(기본): 아무것도 쓰지 않고 유저별 대조표만 돌려준다. 유저 순서가 고정이라 같은 p_limit로 다시 부르면 같은 유저가 나온다.
--                          전체를 보려면 p_limit을 대상 수 이상으로 준다.
--   p_apply = TRUE        : 유저마다 user_chapters를 잠그고 쓴다. 이미 이관한 유저는 대상에서 빠지므로 remaining이 0이 될 때까지 반복 호출한다(멱등).
--
-- 실행은 C1b(20261127_1750)가 main 승격 직전에, 동기화가 멈춘 배포 창에서 한다. 이 파일은 표와 함수만 만든다.
-- 적용 대상: Supabase는 staging·프로덕션 공용 단일 DB라 적용 즉시 프로덕션에 반영된다.
-- 되돌림은 367_chapter_jam_backfill_prepare_down.sql.

-- 1. chapter_jam_backfill — 이관 전 값의 백업과 이관 기록(유저당 1행)
CREATE TABLE IF NOT EXISTS public.chapter_jam_backfill (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  before_chapter_no INTEGER NOT NULL,
  before_chapter_jam INTEGER NOT NULL,
  before_capsule_full_count INTEGER NOT NULL,
  ledger_fills INTEGER NOT NULL,
  wallet_balance BIGINT NOT NULL,
  computed_jam INTEGER NOT NULL,
  old_gauge_jam INTEGER,
  after_chapter_no INTEGER NOT NULL,
  after_chapter_jam INTEGER NOT NULL,
  promoted_chapters INTEGER[] NOT NULL DEFAULT '{}',
  seeded_event_keys TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chapter_jam_backfill_no_downgrade CHECK (after_chapter_no >= before_chapter_no)
);

-- 정책은 만들지 않는다. service_role과 SECURITY DEFINER 함수만 접근한다.
ALTER TABLE public.chapter_jam_backfill ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.chapter_jam_backfill IS
  '기존 유저 챕터 진행값 이관(C1b)의 백업과 기록, 유저당 1행. before_*는 이관 전 user_chapters 값(되돌림의 근거), promoted_chapters는 이관이 새로 올린 챕터(C3b가 보상 지급에 씀), seeded_event_keys는 이관이 chapter_jam_events에 심은 멱등 키(되돌릴 때 지움). chapter_jam_backfill_chunk()로만 쓴다.';

-- 2. chapter_jam_backfill_chunk — 대조표와 이관
CREATE OR REPLACE FUNCTION public.chapter_jam_backfill_chunk(
  p_limit INTEGER DEFAULT 200,
  p_apply BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user RECORD;
  v_rows JSONB := '[]'::JSONB;
  v_processed INTEGER := 0;
  v_downgraded INTEGER := 0;
  v_remaining INTEGER;
  v_before_chapter INTEGER;
  v_before_jam INTEGER;
  v_before_count INTEGER;
  v_reached_at TIMESTAMPTZ;
  v_fills INTEGER;
  v_wallet BIGINT;
  v_computed INTEGER;
  v_old_gauge INTEGER;
  v_chapter_no INTEGER;
  v_jam INTEGER;
  v_required INTEGER;
  v_next INTEGER;
  v_guard INTEGER;
  v_inserted INTEGER;
  v_loop_promoted BOOLEAN;
  v_promoted INTEGER[];
  v_seeded TEXT[];
  v_seed_count INTEGER;
BEGIN
  -- 1) 입력 검사
  IF p_limit IS NULL OR p_limit < 1 OR p_apply IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_input');
  END IF;

  -- 2) 대상: 챕터가 있고 아직 이관하지 않은 유저를 user_id 순으로 p_limit명
  FOR v_user IN
    SELECT uc.user_id
      FROM public.user_chapters uc
     WHERE uc.chapter_no IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.chapter_jam_backfill b WHERE b.user_id = uc.user_id)
     ORDER BY uc.user_id
     LIMIT p_limit
  LOOP
    -- 3-1) 현재 값 읽기(쓰기 모드는 잠그고 읽는다). 그 사이 바뀌었으면 건너뛴다.
    IF p_apply THEN
      SELECT uc.chapter_no, uc.chapter_jam, uc.capsule_full_count
        INTO v_before_chapter, v_before_jam, v_before_count
        FROM public.user_chapters uc
       WHERE uc.user_id = v_user.user_id
       FOR UPDATE;

      IF FOUND AND EXISTS (SELECT 1 FROM public.chapter_jam_backfill b WHERE b.user_id = v_user.user_id) THEN
        CONTINUE;
      END IF;
    ELSE
      SELECT uc.chapter_no, uc.chapter_jam, uc.capsule_full_count
        INTO v_before_chapter, v_before_jam, v_before_count
        FROM public.user_chapters uc
       WHERE uc.user_id = v_user.user_id;
    END IF;

    IF NOT FOUND OR v_before_chapter IS NULL THEN
      CONTINUE;
    END IF;

    -- 3-2) 현재 챕터 도달 시각 이후의 capsule_fill 합계(행이 없으면 전체)
    SELECT cu.reached_at INTO v_reached_at
      FROM public.chapter_ups cu
     WHERE cu.user_id = v_user.user_id AND cu.chapter_no = v_before_chapter;

    SELECT GREATEST(0, COALESCE(-SUM(t.amount), 0))::INTEGER INTO v_fills
      FROM public.jam_transactions t
     WHERE t.user_id = v_user.user_id
       AND t.reason = 'capsule_fill'
       AND (v_reached_at IS NULL OR t.created_at >= v_reached_at);

    -- 3-3) 지갑 잔액(행이 없으면 0)
    SELECT COALESCE(
             (SELECT w.balance FROM public.jam_wallets w WHERE w.user_id = v_user.user_id),
             0)
      INTO v_wallet;

    v_computed := v_fills + v_wallet;

    -- 옛 게이지 근사값(참고용): 채운 캡슐 수 × 지금 캡슐 필요량 + 채운 양 + 지갑 잔액
    SELECT (COALESCE(v_before_count, 0) * COALESCE(cp.required, 0) + COALESCE(cp.filled, 0) + v_wallet)::INTEGER
      INTO v_old_gauge
      FROM (SELECT 1) base
      LEFT JOIN public.user_capsules cp ON cp.user_id = v_user.user_id;

    -- 3-4) 승급 반복(안전 한도 100회). 필요량이 없거나 모자라면, 다음 챕터가 없으면 멈춘다.
    v_chapter_no := v_before_chapter;
    v_jam := v_computed;
    v_guard := 0;
    v_loop_promoted := FALSE;
    v_promoted := ARRAY[]::INTEGER[];

    WHILE v_guard < 100 LOOP
      v_guard := v_guard + 1;

      SELECT d.required_jam INTO v_required
        FROM public.chapter_definitions d
       WHERE d.chapter_no = v_chapter_no;

      EXIT WHEN v_required IS NULL OR v_jam < v_required;

      SELECT MIN(d.chapter_no) INTO v_next
        FROM public.chapter_definitions d
       WHERE d.chapter_no > v_chapter_no;

      EXIT WHEN v_next IS NULL;

      v_jam := v_jam - v_required;

      IF p_apply THEN
        INSERT INTO public.chapter_ups (user_id, chapter_no)
        VALUES (v_user.user_id, v_next)
        ON CONFLICT (user_id, chapter_no) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;

        IF v_inserted > 0 THEN
          v_promoted := array_append(v_promoted, v_next);
        END IF;
      ELSE
        -- 대조 모드: 쓰지 않으므로 chapter_ups에 아직 없는 챕터만 «새로 오른 챕터»로 센다.
        IF NOT EXISTS (
          SELECT 1 FROM public.chapter_ups cu WHERE cu.user_id = v_user.user_id AND cu.chapter_no = v_next
        ) THEN
          v_promoted := array_append(v_promoted, v_next);
        END IF;
      END IF;

      v_chapter_no := v_next;
      v_loop_promoted := TRUE;
    END LOOP;

    -- 3-5) 원장 줄의 멱등 키를 심는다(쓰기 모드). 대조 모드는 심을 후보 수만 센다.
    IF p_apply THEN
      WITH src AS (
        SELECT 'activity_settlement:' || t.source_activity_id::TEXT AS event_key, t.amount
          FROM public.jam_transactions t
         WHERE t.user_id = v_user.user_id
           AND t.reason = 'activity_settlement'
           AND t.source_activity_id IS NOT NULL
        UNION ALL
        SELECT t.source_event_key AS event_key, t.amount
          FROM public.jam_transactions t
         WHERE t.user_id = v_user.user_id
           AND t.reason = 'service_activity'
           AND t.source_event_key IS NOT NULL
           AND btrim(t.source_event_key) <> ''
      ),
      ins AS (
        INSERT INTO public.chapter_jam_events (user_id, event_key, amount)
        SELECT v_user.user_id, s.event_key, s.amount FROM src s WHERE s.amount > 0
        ON CONFLICT (user_id, event_key) DO NOTHING
        RETURNING event_key
      )
      SELECT COALESCE(array_agg(event_key), ARRAY[]::TEXT[]) INTO v_seeded FROM ins;

      v_seed_count := COALESCE(cardinality(v_seeded), 0);
    ELSE
      v_seeded := ARRAY[]::TEXT[];

      SELECT count(*)::INTEGER INTO v_seed_count
        FROM (
          SELECT 'activity_settlement:' || t.source_activity_id::TEXT AS event_key
            FROM public.jam_transactions t
           WHERE t.user_id = v_user.user_id
             AND t.reason = 'activity_settlement'
             AND t.source_activity_id IS NOT NULL
          UNION ALL
          SELECT t.source_event_key
            FROM public.jam_transactions t
           WHERE t.user_id = v_user.user_id
             AND t.reason = 'service_activity'
             AND t.source_event_key IS NOT NULL
             AND btrim(t.source_event_key) <> ''
        ) k
       WHERE NOT EXISTS (
         SELECT 1 FROM public.chapter_jam_events e
          WHERE e.user_id = v_user.user_id AND e.event_key = k.event_key
       );
    END IF;

    -- 3-6) 쓰기: user_chapters 갱신과 백업 행. capsule_full_count는 승급이 있었을 때만 0으로 맞춘다.
    IF p_apply THEN
      UPDATE public.user_chapters
         SET chapter_no = v_chapter_no,
             chapter_jam = v_jam,
             capsule_full_count = CASE WHEN v_loop_promoted THEN 0 ELSE capsule_full_count END,
             updated_at = now()
       WHERE user_id = v_user.user_id;

      INSERT INTO public.chapter_jam_backfill (
        user_id, before_chapter_no, before_chapter_jam, before_capsule_full_count,
        ledger_fills, wallet_balance, computed_jam, old_gauge_jam,
        after_chapter_no, after_chapter_jam, promoted_chapters, seeded_event_keys
      ) VALUES (
        v_user.user_id, v_before_chapter, v_before_jam, COALESCE(v_before_count, 0),
        v_fills, v_wallet, v_computed, v_old_gauge,
        v_chapter_no, v_jam, v_promoted, v_seeded
      );
    END IF;

    IF v_chapter_no < v_before_chapter THEN
      v_downgraded := v_downgraded + 1;
    END IF;

    v_processed := v_processed + 1;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'userId', v_user.user_id,
      'beforeChapter', v_before_chapter,
      'afterChapter', v_chapter_no,
      'beforeJam', v_before_jam,
      'afterJam', v_jam,
      'ledgerFills', v_fills,
      'walletBalance', v_wallet,
      'oldGaugeJam', v_old_gauge,
      'gaugeDrop', (v_chapter_no = v_before_chapter AND v_old_gauge IS NOT NULL AND v_jam < v_old_gauge),
      'promoted', to_jsonb(v_promoted),
      'seededKeys', v_seed_count
    ));
  END LOOP;

  -- 4) 남은 유저 수(아직 이관하지 않은 대상). 대조 모드에서는 이번에 본 유저도 남은 것으로 센다.
  SELECT count(*)::INTEGER INTO v_remaining
    FROM public.user_chapters uc
   WHERE uc.chapter_no IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.chapter_jam_backfill b WHERE b.user_id = uc.user_id);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'apply', p_apply,
    'processed', v_processed,
    'remaining', v_remaining,
    'downgraded', v_downgraded,
    'rows', v_rows
  );
END;
$$;

COMMENT ON FUNCTION public.chapter_jam_backfill_chunk(INTEGER, BOOLEAN) IS
  '기존 유저의 이번 챕터 진행값을 원장 기준(현재 챕터 도달 뒤 capsule_fill 합계 + 지갑 잔액)으로 이관한다. 실행은 C1b가 하며, 기본은 아무것도 쓰지 않는 대조 모드(p_apply=FALSE)로 유저별 대조표만 돌려준다. p_apply=TRUE는 유저마다 user_chapters를 잠그고 필요량 이상이면 여러 챕터까지 올려 넘친 잼을 이월하고(챕터 하향 없음), 이관 전 값을 chapter_jam_backfill에 백업하며, 새로 오른 챕터를 promoted_chapters에, 원장 줄의 멱등 키를 chapter_jam_events에 심는다. 이관한 유저는 대상에서 빠져 다시 불러도 같은 결과다. p_limit명씩 처리하고 remaining이 0이 될 때까지 반복한다. 입력 오류는 invalid_input. 지갑·capsule_* 표·인벤토리·대기 보상은 건드리지 않는다. service_role 전용.';

REVOKE ALL ON FUNCTION public.chapter_jam_backfill_chunk(INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chapter_jam_backfill_chunk(INTEGER, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chapter_jam_backfill_chunk(INTEGER, BOOLEAN) TO service_role;

-- 되돌림 SQL
-- 짝 파일 367_chapter_jam_backfill_prepare_down.sql 참고. 이관을 실행한 뒤에는 C1b의 되돌림 SQL로 데이터를 먼저 복원한 다음에만 지운다.
-- DROP FUNCTION IF EXISTS public.chapter_jam_backfill_chunk(INTEGER, BOOLEAN);
-- DROP TABLE IF EXISTS public.chapter_jam_backfill;
