-- 299_delete_pre_jam2_gate_missions.sql
-- JAM 2.0 이전부터 있던 게이트 미션 53건을 미션 행째 삭제하고, 그 미션을 가리키는 알림·소식도 함께 지운다
-- (티켓 20261028_1530, 상위 20261022_1140. 사용자 결정 = 2026-10-28 «JAM2.0 이전의 게이트미션을 아예 삭제», 같은 날 «알림·소식도 삭제»,
--  정책 정본 = docs/plan/jam2/service-redesign/10 미션.md 6절)
--
-- 작성만 하고 실행하지 않았다. 실행은 JAM 2.0 오픈 직전에 244를 적용한 «바로 다음», 245보다 «앞에서» 카리나가 한다
-- (순서와 점검표는 docs/plan/jam2/12 JAM 2.0 오픈 전후 적용 순서.md 4절 12번과 4.1절). 새 칸·새 함수는 없고 백업 표 1개
-- (gate_mission_backup_20261028)만 덧붙인다.
--
-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 옛 프로덕션 코드에도 바로 반영된다.
--    게이트 미션 카드가 미션 목록에서 사라지고, 그 미션에 걸린 참가 기록과 완료 기록(외래 키 ON DELETE CASCADE)이 함께 지워진다.
--    그 미션을 가리키는 알림 1건과 소식 7건도 지워진다(외래 키가 없어 이 파일이 직접 지운다). 유저의 알림함과 활동 기록에서 사라진다.
--    미션 행은 «삭제 표시»를 쓰지 않고 실제로 지운다(missions에 deleted_at·is_active 칸이 없다).
--
-- 규칙
--   ① 대상: gate_axis 또는 gate_stage가 채워져 있고 created_at이 2026-10-01 00:00(KST) 이전인 미션.
--      조사(2026-10-28) 기준 53건이고 전부 2026-09-06 23:57~23:59(KST)에 한 번에 만든 행이다. 두 칸은 53건 모두 함께 채워져 있다.
--      날짜 경계가 있는 이유: JAM 2.0 기간에 새로 만든 게이트 미션은 이 SQL이 지우지 않기 위해서다.
--   ② 같이 지워지는 것(ON DELETE CASCADE): user_mission_participations(참가 6건·유저 2명), user_mission_completions(완료 1건·유저 1명),
--      그리고 0건인 mission_allowed_tribes, mission_item_rewards, mission_participation_cancellations, mission_rank_snapshots.
--      지우기 전에 미션·참가·완료·알림·소식 행 전체를 백업 표에 담고(JSON), 되돌림 SQL이 그 표를 쓴다.
--   ③ 삭제를 막는 참조: point_transactions.source_mission_id(NO ACTION). 지금 0건이다. 있으면 삭제가 외래 키 오류로 막히므로 가드가 먼저 멈춘다.
--   ④ 값이 비워지는 참조(ON DELETE SET NULL): today_cards.mission_id, ranking_modes.target_mission_id. 지금 0건이다. 가드가 0건을 확인한다
--      (SET NULL이 일어나면 되돌림 SQL이 그 값을 복원하지 못하기 때문이다).
--   ⑤ 사용자 결정(2026-10-28)은 «참가 6건·완료 1건을 함께 지운다»였다. 그보다 늘었으면 결정의 근거가 바뀐 것이므로 가드가 멈춘다.
--      (줄어드는 것은 괜찮다. 테스트 유저를 먼저 지우면 유저 외래 키 CASCADE로 줄 수 있다.)
--   ⑥ 알림·소식(2026-10-28 사용자 결정 «알림·소식도 삭제»): 외래 키가 없어 이 파일이 직접 지운다.
--      찾는 기준은 알림 notifications.payload->>'mission_id', 소식 user_activity_feed.metadata->>'mission_id'가 대상 미션의 id인 행이다.
--      조사(2026-10-28)는 알림 1건(mission_completed)과 소식 7건(mission_joined 6, mission_completed 1)이다.
--      이 두 표를 가리키는 외래 키와 삭제에 걸리는 트리거는 없다(알림에는 UPDATE 트리거만 있다).
--      결정 때(알림 1건·소식 7건)보다 늘었으면 가드가 멈춘다. 또 행 전체를 문자열로 훑어 센 값이 키로 센 값과 다르면
--      (미션 id를 배열 같은 다른 모양으로 담은 행이 있다는 뜻이다) 가드가 멈춘다. 그런 행은 지우지 않는다.
--
-- 트리거: missions와 두 기록 표에는 사용자 정의 트리거가 없다(2026-10-28 확인). 삭제가 다른 곳에 부수 효과를 내지 않는다.
--
-- ⚠️ 이 SQL이 «하지 않는» 일 (리뷰어·카리나가 알아야 한다)
--   (a) 미션 보상 배지를 끄는 일은 244가 한다. 이 SQL은 244가 먼저 적용되지 않으면 가드에서 멈춘다(대상 미션의 보상 배지 연결 중 켜진 것이 0이어야 한다).
--   (b) 받은 배지 기록(user_activity_badges)과 포인트 원장(point_transactions)은 건드리지 않는다. 두 표는 missions의 자식 표가 아니다.
--   (c) 게이트 미션 «장치»(어드민 게이트 미션 화면, lib/missions/gateMissions.ts, 조건 키)는 그대로 둔다. 정책이 장치를 남기기로 했다(10 미션 6절).
--   (d) 완료 기록 1건이 지워지므로, 그 유저 1명의 mission_complete_count(액티비티 배지의 JAM 조건, lib/badge-engine/jamActionCompletionMetrics.ts가
--       user_mission_completions 행 수를 센다)가 1 줄어든다. 이미 받은 배지는 그대로이고 앞으로 판정하는 값만 줄어든다.
--       챕터 점수는 영향이 없다(chapter_score_events에 이 미션을 가리키는 행 0건, 2026-10-28 확인).
--   (e) 알림·소식은 payload.mission_id·metadata.mission_id로만 찾는다. 다른 모양으로 담은 행은 지우지 않고 가드가 찾아 멈춘다(⑥).
--       chapter_score_events, chapter_ups, today_card_events에는 이 미션을 가리키는 행이 0건이라 다루지 않는다(2026-10-28 확인).
--   (f) 백업 표는 지우지 않는다. 오픈 뒤 문제가 없다고 확인한 다음 파일 끝 «되돌림 SQL» 아래의 DROP으로 지운다.
--
-- 되돌림 방법과 사후 확인은 파일 끝에 있다. 이 파일 자체가 백업을 만들므로 별도의 «사전 백업 SELECT»는 필요 없다.
-- 다만 실행 직전에 아래 드라이런을 돌려 «기대값»과 맞는지 보고, 그 결과를 티켓 20261028_1530에 남긴다.

-- ═══════════════════════════════════════════════════════════════════════════
-- 드라이런 (읽기 전용 SELECT — 적용 전에 돌려서 «기대값»과 맞는지 본다. 데이터를 바꾸지 않는다)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 기대값(2026-10-28 조사 기준, 244를 적용하기 «전» 값):
--   ① 53 / ② 2 / ③ 6 / ③-1 2 / ④ 1 / ④-1 1 / ⑤ 53 / ⑥ 0 / ⑦ 0 / ⑧ 0 / ⑨ 1 / ⑨-1 1 / ⑩ 7 / ⑩-1 7
-- 244를 적용한 «뒤»에는 ⑤가 0이어야 한다(그래야 본문의 가드를 통과한다). 나머지는 같거나 ③·④·⑨·⑩이 줄어든다.
-- ⑨-1과 ⑩-1(행 전체를 문자열로 훑어 센 값)은 ⑨와 ⑩(키로 센 값)과 같아야 한다. 다르면 가드가 멈춘다.
--
-- WITH target AS (
--   SELECT id, reward_badge_ids FROM public.missions
--    WHERE (gate_axis IS NOT NULL OR gate_stage IS NOT NULL)
--      AND created_at < TIMESTAMPTZ '2026-10-01 00:00:00+09'
-- )
-- SELECT '① 삭제 대상 게이트 미션' AS 지표, count(*)::text AS 값 FROM target
-- UNION ALL SELECT '② 대상 밖 미션(그대로 남는 미션)', count(*)::text FROM public.missions WHERE id NOT IN (SELECT id FROM target)
-- UNION ALL SELECT '③ 같이 지워질 참가 기록', count(*)::text FROM public.user_mission_participations WHERE mission_id IN (SELECT id FROM target)
-- UNION ALL SELECT '③-1 그 참가 기록의 유저 수', count(DISTINCT user_id)::text FROM public.user_mission_participations WHERE mission_id IN (SELECT id FROM target)
-- UNION ALL SELECT '④ 같이 지워질 완료 기록', count(*)::text FROM public.user_mission_completions WHERE mission_id IN (SELECT id FROM target)
-- UNION ALL SELECT '④-1 그 완료 기록의 유저 수', count(DISTINCT user_id)::text FROM public.user_mission_completions WHERE mission_id IN (SELECT id FROM target)
-- UNION ALL SELECT '⑤ 대상 미션의 보상 배지 연결 중 아직 켜진 것(244 전 53, 244 뒤 0)', count(*)::text
--                   FROM target t JOIN public.badges b ON b.id = ANY (t.reward_badge_ids) WHERE b.deleted_at IS NULL
-- UNION ALL SELECT '⑥ 삭제를 막는 point_transactions', count(*)::text FROM public.point_transactions WHERE source_mission_id IN (SELECT id FROM target)
-- UNION ALL SELECT '⑦ 값이 비워지는 참조(today_cards + ranking_modes)',
--                  ((SELECT count(*) FROM public.today_cards WHERE mission_id IN (SELECT id FROM target))
--                 + (SELECT count(*) FROM public.ranking_modes WHERE target_mission_id IN (SELECT id FROM target)))::text
-- UNION ALL SELECT '⑧ 같이 지워지는 그 밖의 자식 표(허용 트라이브 + 아이템 보상 + 참가 취소 + 순위 스냅샷)',
--                  ((SELECT count(*) FROM public.mission_allowed_tribes WHERE mission_id IN (SELECT id FROM target))
--                 + (SELECT count(*) FROM public.mission_item_rewards WHERE mission_id IN (SELECT id FROM target))
--                 + (SELECT count(*) FROM public.mission_participation_cancellations WHERE mission_id IN (SELECT id FROM target))
--                 + (SELECT count(*) FROM public.mission_rank_snapshots WHERE mission_id IN (SELECT id FROM target)))::text
-- UNION ALL SELECT '⑨ 같이 지울 알림(payload.mission_id)', count(*)::text FROM public.notifications
--                   WHERE payload->>'mission_id' IN (SELECT id::text FROM target)
-- UNION ALL SELECT '⑨-1 같은 알림을 행 전체 문자열로 훑어 센 값(⑨와 같아야 한다)', count(*)::text FROM public.notifications n
--                   WHERE EXISTS (SELECT 1 FROM target t WHERE n::text LIKE '%' || t.id::text || '%')
-- UNION ALL SELECT '⑩ 같이 지울 소식(metadata.mission_id)', count(*)::text FROM public.user_activity_feed
--                   WHERE metadata->>'mission_id' IN (SELECT id::text FROM target)
-- UNION ALL SELECT '⑩-1 같은 소식을 행 전체 문자열로 훑어 센 값(⑩과 같아야 한다)', count(*)::text FROM public.user_activity_feed f
--                   WHERE EXISTS (SELECT 1 FROM target t WHERE f::text LIKE '%' || t.id::text || '%');

-- ═══════════════════════════════════════════════════════════════════════════
-- 본문
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 안전 확인: 하나라도 어긋나면 아무것도 바꾸지 않고 멈춘다(오류가 나면 트랜잭션 전체가 되돌아간다).
DO $guard$
DECLARE
  v_ids       UUID[];
  v_sids      TEXT[];
  v_pats      TEXT[];
  v_missions  INT;
  v_part      INT;
  v_comp      INT;
  v_notif     INT;
  v_notif_txt INT;
  v_feed      INT;
  v_feed_txt  INT;
  v_n         INT;
  v_refs      TEXT;
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO v_ids
    FROM public.missions
   WHERE (gate_axis IS NOT NULL OR gate_stage IS NOT NULL)
     AND created_at < TIMESTAMPTZ '2026-10-01 00:00:00+09';
  v_missions := cardinality(v_ids);

  IF v_missions = 0 THEN
    RAISE EXCEPTION '삭제 대상 게이트 미션이 0건입니다. 이미 지웠거나 조건이 바뀌었으니 아무것도 바꾸지 않고 멈춥니다.';
  END IF;
  IF v_missions > 53 THEN
    RAISE EXCEPTION '삭제 대상이 %건으로 조사 때의 53건보다 많습니다. 어떤 미션이 늘었는지 확인한 뒤 이 숫자를 고칩니다.', v_missions;
  END IF;

  -- 244 선행: 대상 미션의 보상 배지가 아직 켜져 있으면 멈춘다
  SELECT count(*) INTO v_n
    FROM public.missions m
    JOIN public.badges b ON b.id = ANY (m.reward_badge_ids)
   WHERE m.id = ANY (v_ids) AND b.deleted_at IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '대상 미션의 보상 배지가 아직 켜져 있습니다(연결 %건). 244를 먼저 적용합니다.', v_n;
  END IF;

  -- 같이 지워질 유저 기록: 사용자 결정(2026-10-28)은 참가 6건·완료 1건이다. 늘었으면 멈춘다.
  SELECT count(*) INTO v_part FROM public.user_mission_participations WHERE mission_id = ANY (v_ids);
  IF v_part > 6 THEN
    RAISE EXCEPTION '같이 지워질 참가 기록이 %건으로 결정 때의 6건보다 많습니다. 사용자에게 다시 확인합니다.', v_part;
  END IF;
  SELECT count(*) INTO v_comp FROM public.user_mission_completions WHERE mission_id = ANY (v_ids);
  IF v_comp > 1 THEN
    RAISE EXCEPTION '같이 지워질 완료 기록이 %건으로 결정 때의 1건보다 많습니다. 사용자에게 다시 확인합니다.', v_comp;
  END IF;

  -- 삭제를 막거나 값을 바꾸는 참조, 그리고 예상 밖 자식 기록은 모두 0이어야 한다
  SELECT string_agg(r.label || ' ' || r.cnt::text, ', ') INTO v_refs
    FROM (
      SELECT 'point_transactions' AS label, count(*) AS cnt FROM public.point_transactions WHERE source_mission_id = ANY (v_ids)
      UNION ALL SELECT 'today_cards', count(*) FROM public.today_cards WHERE mission_id = ANY (v_ids)
      UNION ALL SELECT 'ranking_modes', count(*) FROM public.ranking_modes WHERE target_mission_id = ANY (v_ids)
      UNION ALL SELECT 'mission_allowed_tribes', count(*) FROM public.mission_allowed_tribes WHERE mission_id = ANY (v_ids)
      UNION ALL SELECT 'mission_item_rewards', count(*) FROM public.mission_item_rewards WHERE mission_id = ANY (v_ids)
      UNION ALL SELECT 'mission_participation_cancellations', count(*) FROM public.mission_participation_cancellations WHERE mission_id = ANY (v_ids)
      UNION ALL SELECT 'mission_rank_snapshots', count(*) FROM public.mission_rank_snapshots WHERE mission_id = ANY (v_ids)
    ) r
   WHERE r.cnt > 0;
  IF v_refs IS NOT NULL THEN
    RAISE EXCEPTION '대상 미션을 가리키는 기록이 남아 있습니다(%). 백업 범위에 없는 기록이라 멈춥니다. 내용을 보고 백업·되돌림 SQL을 넓힌 뒤 다시 합니다.', v_refs;
  END IF;

  -- 알림·소식: 미션 id를 담은 키(알림 payload.mission_id, 소식 metadata.mission_id)로 센 값과, 행 전체를 문자열로 훑어 센 값이 같아야 한다.
  -- 다르면 다른 모양(배열 등)으로 미션 id를 담은 행이 있다는 뜻이라 멈춘다.
  v_sids := ARRAY(SELECT x::text FROM unnest(v_ids) AS x);
  v_pats := ARRAY(SELECT '%' || x::text || '%' FROM unnest(v_ids) AS x);

  SELECT count(*) INTO v_notif     FROM public.notifications n      WHERE n.payload->>'mission_id'  = ANY (v_sids);
  SELECT count(*) INTO v_notif_txt FROM public.notifications n      WHERE n::text LIKE ANY (v_pats);
  SELECT count(*) INTO v_feed      FROM public.user_activity_feed f WHERE f.metadata->>'mission_id' = ANY (v_sids);
  SELECT count(*) INTO v_feed_txt  FROM public.user_activity_feed f WHERE f::text LIKE ANY (v_pats);
  IF v_notif_txt <> v_notif OR v_feed_txt <> v_feed THEN
    RAISE EXCEPTION '미션 id를 정해진 키 밖에도 담은 알림·소식이 있습니다(알림: 키 %건·문자열 %건, 소식: 키 %건·문자열 %건). 지우는 기준을 넓힌 뒤 다시 합니다.',
      v_notif, v_notif_txt, v_feed, v_feed_txt;
  END IF;

  -- 같이 지워질 알림·소식: 사용자 결정(2026-10-28)은 알림 1건·소식 7건이다. 늘었으면 멈춘다.
  IF v_notif > 1 THEN
    RAISE EXCEPTION '같이 지워질 알림이 %건으로 결정 때의 1건보다 많습니다. 사용자에게 다시 확인합니다.', v_notif;
  END IF;
  IF v_feed > 7 THEN
    RAISE EXCEPTION '같이 지워질 소식이 %건으로 결정 때의 7건보다 많습니다. 사용자에게 다시 확인합니다.', v_feed;
  END IF;

  RAISE NOTICE '가드 통과: 미션 %건, 참가 %건, 완료 %건, 알림 %건, 소식 %건', v_missions, v_part, v_comp, v_notif, v_feed;
END
$guard$;

-- 사후 확인에 쓸 «지우기 전» 값 (이 트랜잭션이 끝나면 사라진다)
CREATE TEMP TABLE _gate_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.missions)::INT AS total_missions,
  (SELECT count(*) FROM public.user_mission_participations p
    WHERE p.mission_id IN (SELECT m.id FROM public.missions m
                            WHERE (m.gate_axis IS NOT NULL OR m.gate_stage IS NOT NULL)
                              AND m.created_at < TIMESTAMPTZ '2026-10-01 00:00:00+09'))::INT AS participations,
  (SELECT count(*) FROM public.user_mission_completions c
    WHERE c.mission_id IN (SELECT m.id FROM public.missions m
                            WHERE (m.gate_axis IS NOT NULL OR m.gate_stage IS NOT NULL)
                              AND m.created_at < TIMESTAMPTZ '2026-10-01 00:00:00+09'))::INT AS completions,
  (SELECT count(*) FROM public.notifications n
    WHERE n.payload->>'mission_id' IN (SELECT m.id::text FROM public.missions m
                                        WHERE (m.gate_axis IS NOT NULL OR m.gate_stage IS NOT NULL)
                                          AND m.created_at < TIMESTAMPTZ '2026-10-01 00:00:00+09'))::INT AS notifications,
  (SELECT count(*) FROM public.user_activity_feed f
    WHERE f.metadata->>'mission_id' IN (SELECT m.id::text FROM public.missions m
                                         WHERE (m.gate_axis IS NOT NULL OR m.gate_stage IS NOT NULL)
                                           AND m.created_at < TIMESTAMPTZ '2026-10-01 00:00:00+09'))::INT AS feeds;

-- 백업 표 — 서버 전용(RLS 켜고 정책 없음, 클라이언트 권한 회수). 이미 있으면 한 번 실행한 적이 있다는 뜻이라 일부러 오류로 멈춘다.
CREATE TABLE public.gate_mission_backup_20261028 (
  kind          TEXT NOT NULL CHECK (kind IN ('mission', 'participation', 'completion', 'notification', 'feed')),
  row_id        UUID NOT NULL,
  snapshot      JSONB NOT NULL,
  backed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, row_id)
);

ALTER TABLE public.gate_mission_backup_20261028 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gate_mission_backup_20261028 FROM anon, authenticated;

COMMENT ON TABLE public.gate_mission_backup_20261028 IS
  'JAM 2.0 이전 게이트 미션 삭제 되돌림용 백업(티켓 20261028_1530). mission·participation·completion·notification·feed는 지우기 직전 전체 행(snapshot)이다. 오픈 뒤 문제가 없으면 지운다. 서버(service role)만 읽고 쓴다.';

-- 지우기 직전 상태를 백업 표에 담는다 (미션을 먼저 담고, 나머지는 그 미션 id로 찾는다)
INSERT INTO public.gate_mission_backup_20261028 (kind, row_id, snapshot)
SELECT 'mission', m.id, to_jsonb(m)
  FROM public.missions m
 WHERE (m.gate_axis IS NOT NULL OR m.gate_stage IS NOT NULL)
   AND m.created_at < TIMESTAMPTZ '2026-10-01 00:00:00+09';

INSERT INTO public.gate_mission_backup_20261028 (kind, row_id, snapshot)
SELECT 'participation', p.id, to_jsonb(p)
  FROM public.user_mission_participations p
 WHERE p.mission_id IN (SELECT row_id FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');

INSERT INTO public.gate_mission_backup_20261028 (kind, row_id, snapshot)
SELECT 'completion', c.id, to_jsonb(c)
  FROM public.user_mission_completions c
 WHERE c.mission_id IN (SELECT row_id FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');

INSERT INTO public.gate_mission_backup_20261028 (kind, row_id, snapshot)
SELECT 'notification', n.id, to_jsonb(n)
  FROM public.notifications n
 WHERE n.payload->>'mission_id' IN (SELECT row_id::text FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');

INSERT INTO public.gate_mission_backup_20261028 (kind, row_id, snapshot)
SELECT 'feed', f.id, to_jsonb(f)
  FROM public.user_activity_feed f
 WHERE f.metadata->>'mission_id' IN (SELECT row_id::text FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');

-- 삭제: 백업한 id만 지운다. 참가·완료 기록은 미션을 지울 때 외래 키 CASCADE로 함께 지워지고, 알림·소식은 외래 키가 없어 따로 지운다.
DELETE FROM public.missions
 WHERE id IN (SELECT row_id FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');

DELETE FROM public.notifications
 WHERE id IN (SELECT row_id FROM public.gate_mission_backup_20261028 WHERE kind = 'notification');

DELETE FROM public.user_activity_feed
 WHERE id IN (SELECT row_id FROM public.gate_mission_backup_20261028 WHERE kind = 'feed');

-- 사후 확인(같은 트랜잭션 안): 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다.
DO $post$
DECLARE
  v_n       INT;
  v_backup  INT;
  v_before  RECORD;
BEGIN
  SELECT * INTO v_before FROM _gate_before;

  -- 백업한 미션이 하나도 남지 않았다
  SELECT count(*) INTO v_n FROM public.missions
   WHERE id IN (SELECT row_id FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 지웠어야 할 미션이 %건 남았습니다(기대 0).', v_n;
  END IF;

  -- 날짜 경계 안의 게이트 미션이 하나도 남지 않았다
  SELECT count(*) INTO v_n FROM public.missions
   WHERE (gate_axis IS NOT NULL OR gate_stage IS NOT NULL)
     AND created_at < TIMESTAMPTZ '2026-10-01 00:00:00+09';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: JAM 2.0 이전 게이트 미션이 %건 남았습니다(기대 0).', v_n;
  END IF;

  -- 지워진 미션의 참가·완료 기록이 하나도 남지 않았다(CASCADE 확인)
  SELECT count(*) INTO v_n FROM public.user_mission_participations
   WHERE mission_id IN (SELECT row_id FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 지워진 미션의 참가 기록이 %건 남았습니다(기대 0).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.user_mission_completions
   WHERE mission_id IN (SELECT row_id FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 지워진 미션의 완료 기록이 %건 남았습니다(기대 0).', v_n;
  END IF;

  -- 지워진 미션을 가리키는 알림·소식이 하나도 남지 않았다
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE payload->>'mission_id' IN (SELECT row_id::text FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 지워진 미션을 가리키는 알림이 %건 남았습니다(기대 0).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.user_activity_feed
   WHERE metadata->>'mission_id' IN (SELECT row_id::text FROM public.gate_mission_backup_20261028 WHERE kind = 'mission');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 지워진 미션을 가리키는 소식이 %건 남았습니다(기대 0).', v_n;
  END IF;

  -- 대상 밖 미션은 그대로다: 지금 미션 수 = 지우기 전 수 - 백업한 미션 수
  SELECT count(*) INTO v_backup FROM public.gate_mission_backup_20261028 WHERE kind = 'mission';
  SELECT count(*) INTO v_n FROM public.missions;
  IF v_n <> v_before.total_missions - v_backup THEN
    RAISE EXCEPTION '끝 검사: 남은 미션이 %건입니다(기대 % - % = %).', v_n, v_before.total_missions, v_backup, v_before.total_missions - v_backup;
  END IF;

  -- 백업 건수가 지우기 전에 센 값과 같다
  SELECT count(*) INTO v_n FROM public.gate_mission_backup_20261028 WHERE kind = 'participation';
  IF v_n <> v_before.participations THEN
    RAISE EXCEPTION '끝 검사: 참가 기록 백업이 %건입니다(기대 %).', v_n, v_before.participations;
  END IF;
  SELECT count(*) INTO v_n FROM public.gate_mission_backup_20261028 WHERE kind = 'completion';
  IF v_n <> v_before.completions THEN
    RAISE EXCEPTION '끝 검사: 완료 기록 백업이 %건입니다(기대 %).', v_n, v_before.completions;
  END IF;
  SELECT count(*) INTO v_n FROM public.gate_mission_backup_20261028 WHERE kind = 'notification';
  IF v_n <> v_before.notifications THEN
    RAISE EXCEPTION '끝 검사: 알림 백업이 %건입니다(기대 %).', v_n, v_before.notifications;
  END IF;
  SELECT count(*) INTO v_n FROM public.gate_mission_backup_20261028 WHERE kind = 'feed';
  IF v_n <> v_before.feeds THEN
    RAISE EXCEPTION '끝 검사: 소식 백업이 %건입니다(기대 %).', v_n, v_before.feeds;
  END IF;

  RAISE NOTICE '끝 검사 통과: 지운 미션 %건, 참가 %건, 완료 %건, 알림 %건, 소식 %건, 남은 미션 %건',
    v_backup, v_before.participations, v_before.completions, v_before.notifications, v_before.feeds, v_before.total_missions - v_backup;
END
$post$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 사후 확인 (COMMIT 뒤, 읽기 전용 — 결과를 티켓 20261028_1530에 남긴다)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 기대값: ① 0 / ② 2(드라이런 ②와 같은 값) / ③ 53 / ④ 6(드라이런 ③과 같은 값) / ⑤ 1(드라이런 ④와 같은 값) / ⑥ 1(드라이런 ⑨와 같은 값) / ⑦ 7(드라이런 ⑩과 같은 값)
--
-- SELECT '① 남은 JAM 2.0 이전 게이트 미션' AS 지표, count(*)::text AS 값 FROM public.missions
--  WHERE (gate_axis IS NOT NULL OR gate_stage IS NOT NULL) AND created_at < TIMESTAMPTZ '2026-10-01 00:00:00+09'
-- UNION ALL SELECT '② 남은 미션 전체', count(*)::text FROM public.missions
-- UNION ALL SELECT '③ 백업한 미션', count(*)::text FROM public.gate_mission_backup_20261028 WHERE kind = 'mission'
-- UNION ALL SELECT '④ 백업한 참가 기록', count(*)::text FROM public.gate_mission_backup_20261028 WHERE kind = 'participation'
-- UNION ALL SELECT '⑤ 백업한 완료 기록', count(*)::text FROM public.gate_mission_backup_20261028 WHERE kind = 'completion'
-- UNION ALL SELECT '⑥ 백업한 알림', count(*)::text FROM public.gate_mission_backup_20261028 WHERE kind = 'notification'
-- UNION ALL SELECT '⑦ 백업한 소식', count(*)::text FROM public.gate_mission_backup_20261028 WHERE kind = 'feed';

-- ═══════════════════════════════════════════════════════════════════════════
-- 되돌림 SQL (COMMIT 뒤에 필요할 때만, 한 번의 호출로 통째로 실행한다)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 지운 미션, 참가·완료 기록, 알림, 소식을 백업 표의 값으로 다시 넣는다. 미션을 먼저 넣고 나머지를 나중에 넣는다(외래 키 때문이다).
-- 그 사이 유저가 지워졌다면(users 외래 키 CASCADE) 그 유저의 기록은 되돌릴 수 없어 아래 조건이 걸러낸다. 걸러진 행 수는 확인 쿼리로 본다.
-- 알림의 행위자(actor_user_id)가 그 사이 지워졌다면 그 칸만 비워서(NULL) 넣는다(원래 외래 키가 ON DELETE SET NULL이다).
-- 다시 넣은 미션은 옛 프로덕션 코드에서 다시 보인다. 0건인 자식 표(허용 트라이브 등)는 백업하지 않았다(가드가 0건을 확인했다).
--
-- BEGIN;
-- INSERT INTO public.missions
-- SELECT (jsonb_populate_record(NULL::public.missions, s.snapshot)).*
--   FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'mission';
--
-- INSERT INTO public.user_mission_participations
-- SELECT (jsonb_populate_record(NULL::public.user_mission_participations, s.snapshot)).*
--   FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'participation'
--    AND (s.snapshot->>'user_id')::uuid IN (SELECT id FROM public.users);
--
-- INSERT INTO public.user_mission_completions
-- SELECT (jsonb_populate_record(NULL::public.user_mission_completions, s.snapshot)).*
--   FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'completion'
--    AND (s.snapshot->>'user_id')::uuid IN (SELECT id FROM public.users);
--
-- INSERT INTO public.notifications
-- SELECT (jsonb_populate_record(NULL::public.notifications,
--          CASE WHEN (s.snapshot->>'actor_user_id') IS NOT NULL
--                AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = (s.snapshot->>'actor_user_id')::uuid)
--               THEN jsonb_set(s.snapshot, '{actor_user_id}', 'null'::jsonb)
--               ELSE s.snapshot END)).*
--   FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'notification'
--    AND (s.snapshot->>'user_id')::uuid IN (SELECT id FROM public.users);
--
-- INSERT INTO public.user_activity_feed
-- SELECT (jsonb_populate_record(NULL::public.user_activity_feed, s.snapshot)).*
--   FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'feed'
--    AND (s.snapshot->>'user_id')::uuid IN (SELECT id FROM public.users);
-- COMMIT;
--
-- 되돌린 뒤 확인: 아래 다섯이 모두 0이어야 한다(백업과 다른 행, 또는 되돌리지 못한 행).
-- 알림은 행위자가 지워진 경우에만 백업과 달라질 수 있다.
-- SELECT count(*) FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'mission' AND NOT EXISTS (SELECT 1 FROM public.missions m WHERE m.id = s.row_id AND to_jsonb(m) = s.snapshot);
-- SELECT count(*) FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'participation' AND NOT EXISTS (SELECT 1 FROM public.user_mission_participations p WHERE p.id = s.row_id AND to_jsonb(p) = s.snapshot);
-- SELECT count(*) FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'completion' AND NOT EXISTS (SELECT 1 FROM public.user_mission_completions c WHERE c.id = s.row_id AND to_jsonb(c) = s.snapshot);
-- SELECT count(*) FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'notification' AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.id = s.row_id AND to_jsonb(n) = s.snapshot);
-- SELECT count(*) FROM public.gate_mission_backup_20261028 s
--  WHERE s.kind = 'feed' AND NOT EXISTS (SELECT 1 FROM public.user_activity_feed f WHERE f.id = s.row_id AND to_jsonb(f) = s.snapshot);
--
-- 백업 표가 더 필요 없으면(오픈 뒤 문제가 없다고 확인한 다음) 지운다
-- DROP TABLE IF EXISTS public.gate_mission_backup_20261028;
