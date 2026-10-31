-- 307_delete_remaining_two_missions.sql
-- 299 대상 밖 미션 2건(그루터기 살롱의 겨울 채비, 겹쳐진 도시의 새 얼굴)을 삭제하고 그 미션을 가리키는 알림·소식을 함께 지운다
-- (티켓 20261031_1334. 사용자 결정 = 2026-10-31 «미션 두건은 삭제». 299와 같은 방식이다.)
--
-- 2026-10-31에 공용 DB에서 롤백 실측 뒤 실행했다. 이 파일은 실행한 문장과 같은 내용이다(DO 블록 한 번의 호출, v_dry = true로 롤백 실측).
--
-- ⚠️ 공용 DB 영향: 두 미션 카드가 사라지고 참가 6건(유저 2명)·완료 4건과 알림 9건·소식 10건이 함께 지워진다.
--    today_cards 4장은 외래 키가 ON DELETE SET NULL이라 카드는 남고 mission_id만 비워진다(모두 기간이 지난 카드다).
--    두 미션의 보상 배지(볼따구에 숨긴 도토리, 낡은 시장 바구니)는 아이템 배지라 그대로 남는다.
--
-- 백업: extra_mission_backup_20261031(mission 2, participation 6, completion 4, notification 9, feed 10, today_card 4 = 35행).
-- 실행 직후 확인: 미션 0건, 참가·완료 0건, 백업 35행. 오픈 뒤 문제가 없으면 백업 표를 지운다.

DO $t$
DECLARE
  v_dry boolean := false;
  v_ids uuid[] := ARRAY['b1009708-3258-477d-9278-107ad2c67d12','5fc147fd-307e-4dc0-a7dd-a736ceee906f']::uuid[];
  v_sids text[]; v_n int; v_refs text; v_notif int; v_notif_txt int; v_feed int; v_feed_txt int; v_total int; v_msg text;
BEGIN
  v_sids := ARRAY(SELECT x::text FROM unnest(v_ids) x);
  SELECT count(*) INTO v_n FROM public.missions WHERE id = ANY(v_ids) AND gate_axis IS NULL AND gate_stage IS NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION '대상 미션이 %건입니다(기대 2).', v_n; END IF;
  SELECT string_agg(r.label || ' ' || r.cnt::text, ', ') INTO v_refs FROM (
    SELECT 'point_transactions' AS label, count(*) AS cnt FROM public.point_transactions WHERE source_mission_id = ANY(v_ids)
    UNION ALL SELECT 'ranking_modes', count(*) FROM public.ranking_modes WHERE target_mission_id = ANY(v_ids)
    UNION ALL SELECT 'mission_allowed_tribes', count(*) FROM public.mission_allowed_tribes WHERE mission_id = ANY(v_ids)
    UNION ALL SELECT 'mission_item_rewards', count(*) FROM public.mission_item_rewards WHERE mission_id = ANY(v_ids)
    UNION ALL SELECT 'mission_participation_cancellations', count(*) FROM public.mission_participation_cancellations WHERE mission_id = ANY(v_ids)
    UNION ALL SELECT 'mission_rank_snapshots', count(*) FROM public.mission_rank_snapshots WHERE mission_id = ANY(v_ids)) r WHERE r.cnt > 0;
  IF v_refs IS NOT NULL THEN RAISE EXCEPTION '백업 범위 밖 참조(%)', v_refs; END IF;
  SELECT count(*) INTO v_notif FROM public.notifications n WHERE n.payload->>'mission_id' = ANY(v_sids);
  SELECT count(*) INTO v_notif_txt FROM public.notifications n WHERE n::text LIKE ANY (ARRAY(SELECT '%'||x||'%' FROM unnest(v_sids) x));
  SELECT count(*) INTO v_feed FROM public.user_activity_feed f WHERE f.metadata->>'mission_id' = ANY(v_sids);
  SELECT count(*) INTO v_feed_txt FROM public.user_activity_feed f WHERE f::text LIKE ANY (ARRAY(SELECT '%'||x||'%' FROM unnest(v_sids) x));
  IF v_notif <> v_notif_txt OR v_feed <> v_feed_txt THEN RAISE EXCEPTION '키 밖 참조 알림 %/% 소식 %/%', v_notif, v_notif_txt, v_feed, v_feed_txt; END IF;
  IF (SELECT count(*) FROM public.user_mission_participations WHERE mission_id = ANY(v_ids)) <> 6
     OR (SELECT count(*) FROM public.user_mission_completions WHERE mission_id = ANY(v_ids)) <> 4
     OR v_notif <> 9 OR v_feed <> 10 THEN RAISE EXCEPTION '기대 건수와 다름(참가 6, 완료 4, 알림 9, 소식 10)'; END IF;
  SELECT count(*) INTO v_total FROM public.missions;

  CREATE TABLE public.extra_mission_backup_20261031 (
    kind TEXT NOT NULL CHECK (kind IN ('mission','participation','completion','notification','feed','today_card')),
    row_id UUID NOT NULL, snapshot JSONB NOT NULL, backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (kind, row_id));
  ALTER TABLE public.extra_mission_backup_20261031 ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.extra_mission_backup_20261031 FROM anon, authenticated;
  COMMENT ON TABLE public.extra_mission_backup_20261031 IS '299 대상 밖 미션 2건(그루터기 살롱의 겨울 채비, 겹쳐진 도시의 새 얼굴) 삭제 되돌림용 백업. today_card는 mission_id가 비워지기 전 전체 행이다. 오픈 뒤 문제가 없으면 지운다. 서버(service role)만 읽고 쓴다.';
  INSERT INTO public.extra_mission_backup_20261031 SELECT 'mission', m.id, to_jsonb(m), now() FROM public.missions m WHERE m.id = ANY(v_ids);
  INSERT INTO public.extra_mission_backup_20261031 SELECT 'participation', p.id, to_jsonb(p), now() FROM public.user_mission_participations p WHERE p.mission_id = ANY(v_ids);
  INSERT INTO public.extra_mission_backup_20261031 SELECT 'completion', c.id, to_jsonb(c), now() FROM public.user_mission_completions c WHERE c.mission_id = ANY(v_ids);
  INSERT INTO public.extra_mission_backup_20261031 SELECT 'notification', n.id, to_jsonb(n), now() FROM public.notifications n WHERE n.payload->>'mission_id' = ANY(v_sids);
  INSERT INTO public.extra_mission_backup_20261031 SELECT 'feed', f.id, to_jsonb(f), now() FROM public.user_activity_feed f WHERE f.metadata->>'mission_id' = ANY(v_sids);
  INSERT INTO public.extra_mission_backup_20261031 SELECT 'today_card', t.id, to_jsonb(t), now() FROM public.today_cards t WHERE t.mission_id = ANY(v_ids);

  DELETE FROM public.notifications WHERE id IN (SELECT row_id FROM public.extra_mission_backup_20261031 WHERE kind='notification');
  DELETE FROM public.user_activity_feed WHERE id IN (SELECT row_id FROM public.extra_mission_backup_20261031 WHERE kind='feed');
  DELETE FROM public.missions WHERE id = ANY(v_ids);

  IF (SELECT count(*) FROM public.missions) <> v_total - 2
     OR (SELECT count(*) FROM public.user_mission_participations WHERE mission_id = ANY(v_ids)) <> 0
     OR (SELECT count(*) FROM public.user_mission_completions WHERE mission_id = ANY(v_ids)) <> 0
     OR (SELECT count(*) FROM public.notifications n WHERE n.payload->>'mission_id' = ANY(v_sids)) <> 0
     OR (SELECT count(*) FROM public.user_activity_feed f WHERE f.metadata->>'mission_id' = ANY(v_sids)) <> 0
     OR (SELECT count(*) FROM public.today_cards WHERE mission_id = ANY(v_ids)) <> 0
     OR (SELECT count(*) FROM public.extra_mission_backup_20261031) <> 2+6+4+9+10+4 THEN RAISE EXCEPTION '끝 검사 실패'; END IF;
  v_msg := format('끝 검사 통과: 남은 미션 %s, 백업 %s행', (SELECT count(*) FROM public.missions), (SELECT count(*) FROM public.extra_mission_backup_20261031));
  IF v_dry THEN RAISE EXCEPTION '롤백 실측 결과: %', v_msg; END IF;
END $t$;

-- 되돌림 SQL (필요할 때만, 한 번의 호출로 통째로 실행한다. 순서: 미션 → 자식 기록 → today_cards 연결)
-- 그 사이 유저가 새로 만든 기록은 되돌려지지 않는다.
--
-- INSERT INTO public.missions SELECT (jsonb_populate_record(NULL::public.missions, snapshot)).* FROM public.extra_mission_backup_20261031 WHERE kind = 'mission';
-- INSERT INTO public.user_mission_participations SELECT (jsonb_populate_record(NULL::public.user_mission_participations, snapshot)).* FROM public.extra_mission_backup_20261031 WHERE kind = 'participation';
-- INSERT INTO public.user_mission_completions SELECT (jsonb_populate_record(NULL::public.user_mission_completions, snapshot)).* FROM public.extra_mission_backup_20261031 WHERE kind = 'completion';
-- INSERT INTO public.notifications SELECT (jsonb_populate_record(NULL::public.notifications, snapshot)).* FROM public.extra_mission_backup_20261031 WHERE kind = 'notification';
-- INSERT INTO public.user_activity_feed SELECT (jsonb_populate_record(NULL::public.user_activity_feed, snapshot)).* FROM public.extra_mission_backup_20261031 WHERE kind = 'feed';
-- UPDATE public.today_cards t SET mission_id = (s.snapshot->>'mission_id')::uuid FROM public.extra_mission_backup_20261031 s WHERE s.kind = 'today_card' AND s.row_id = t.id;
-- 백업 표가 더 필요 없으면: DROP TABLE IF EXISTS public.extra_mission_backup_20261031;
