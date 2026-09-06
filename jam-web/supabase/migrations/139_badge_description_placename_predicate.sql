-- 139_badge_description_placename_predicate.sql
-- 등급별 설명 — 지명 술어 편중·최상위 화이트 룸 고정·종목 간 문장 틀 다듬기 — 티켓 20260906_1422
--
-- 왜: 138(티켓 20260906_1305)이 넣은 436행 중, 세계관 지명(그루터기 살롱·블랙 트랙·화이트 룸)이
--     쓰인 44행의 술어가 「~을 알아봅니다/기억합니다/압니다」·「~의 문이 열립니다」 계열로
--     23행(52.3%) 쏠렸고, mystic·최상위 레벨의 화이트 룸 등장(15건)이 「최상위=화이트 룸」
--     고정 기호처럼 읽혔다. 자전거 C-C1과 등산 H-C1(둘 다 「하루 1회」)은 rare=습관/epic=달력/
--     mystic=일정 대응이 그대로 겹쳤고, 「돌아온 라이더/러너/트레일러」 3종은 「그루터기 살롱은
--     비운 자리를 …둡니다」류 문장이 종목만 바뀌어 반복됐다.
--
-- 무엇: 위 문제에 해당하는 17행만 다시 쓴다. **전면 재작성이 아니다** — 나머지 419행은
--       138에서 이미 옳게 갱신됐으므로 손대지 않는다.
--       정본: Service Plan/Specs/Content/v5_catalog_writing.json 의 「등급별설명」
--             (_meta.지명_술어_다듬기에 이 티켓의 변경 요약이 있다)
--
-- ⚠️ UPDATE만 한다. DELETE·재시딩을 하지 않는다.
-- ⚠️ 대상은 v5 액티비티 배지뿐이다(type='activity'). family_key + (rarity 또는 level)로만
--    지정하므로 id에 의존하지 않는다(멱등 — 두 번 돌려도 안전).
-- ⚠️ 최저 등급(또는 Lv1) 행은 이 마이그레이션 대상에 없다 — 라이팅 가이드 §07 정본이라
--    이번 티켓에서도 건드리지 않았다.

BEGIN;

DO $$
DECLARE
  updated_count INT;
BEGIN
  WITH v(family_key, rarity, level, description) AS (
    VALUES
      -- 최상위 등급의 화이트 룸 고정 패턴 완화 — 지명 없이 소재로 단정
      ('walking:A1'::TEXT, 'mystic'::badge_rarity, NULL::INT, '두 날 사이의 그 틈은 이제 이 사람만의 고정된 자리입니다.'),
      ('walking:K1', NULL, 8, '지도 밖의 거리 앞에서는 숫자를 세는 일도 그만두게 됩니다.'),
      ('walking:S3', 'mystic', NULL, '한 달 내내 끊이지 않은 궤도, 그 자체가 증거입니다.'),
      ('cycling:C3', 'mystic', NULL, '한 달을 통째로 밀어붙인 페이스에는 더 보탤 설명이 없습니다.'),
      ('cycling:E1', 'mystic', NULL, '정상보다 그 앞의 마지막 굽이가 이 오르막의 진짜 얼굴입니다.'),
      ('hiking:A1', 'mystic', NULL, '가장 멀리 닿았던 숨은 그 자체로 지워지지 않는 흔적입니다.'),
      ('hiking:P1', 'mystic', NULL, '이런 상승의 끝은 누구에게나 허락되지 않습니다.'),
      ('cycling:H2', 'mystic', NULL, '심장이 가장 크게 뛰는 그 순간이 이 사람의 진짜 한계선입니다.'),
      -- 지명은 유지하되 술어를 배경·장애물·거래처로 분산
      ('cycling:E1', 'rare', NULL, '그루터기 살롱도 이 오르막 앞에서는 값을 매기지 못합니다.'),
      ('running:H1', 'mystic', NULL, '화이트 룸도 이 심장 앞에서는 문턱을 낮춥니다.'),
      ('running:L1', 'mystic', NULL, '화이트 룸도 이만큼 가본 사람 앞에서는 값을 다시 매깁니다.'),
      ('trail_running:G1', 'rare', NULL, '그루터기 살롱 앞을 지나는 발소리가 어느새 낯설지 않습니다.'),
      -- 「비운 자리」 3종 변주 해소 — 자전거는 원문 유지, 러닝·트레일러닝만 착상을 튼다
      ('running:X3', 'rare', NULL, '그루터기 살롱은 오래 빠진 손님의 몫도 계속 셈해 둡니다.'),
      ('trail_running:X2', 'rare', NULL, '그루터기 살롱 문턱은 오래 비워도 높아지지 않습니다.'),
      -- 자전거 C-C1 ↔ 등산 H-C1 문장 틀 겹침 해소 — 등산 쪽 착상을 튼다
      ('hiking:C1', 'rare', NULL, '산에 오르는 하루가 특별한 일에서 흔한 일로 바뀌었습니다.'),
      ('hiking:C1', 'epic', NULL, '다리가 먼저 산으로 방향을 잡는 날이 늘었습니다.'),
      ('hiking:C1', 'mystic', NULL, '이제 산에 가지 않는 날이 오히려 낯섭니다.')
  )
  UPDATE public.badges b
     SET description = v.description
    FROM v
   WHERE b.family_key = v.family_key
     AND b.rarity IS NOT DISTINCT FROM v.rarity
     AND b.level  IS NOT DISTINCT FROM v.level
     AND b.type = 'activity'
     AND b.deleted_at IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '지명 술어·화이트 룸·종목 대응 다듬기 갱신: % 행 (기대 17)', updated_count;
  IF updated_count = 0 THEN
    RAISE EXCEPTION '0행이 갱신됐다 — family_key/rarity/level 지정이 DB와 어긋난다';
  END IF;
  IF updated_count <> 17 THEN
    RAISE WARNING '기대 17행과 다르다 (%). 소프트 삭제·중복 행 여부를 확인할 것', updated_count;
  END IF;
END $$;

COMMIT;

-- ── 사후 검증 (실행 후 손으로 돌려본다) ──────────────────────────────────
-- ① 17행이 정확히 바뀌었는가
-- SELECT family_key, rarity, level, description FROM public.badges
--  WHERE (family_key, COALESCE(rarity::text,''), COALESCE(level::text,'')) IN (
--    ('walking:A1','mystic',''), ('walking:K1','','8'), ('walking:S3','mystic',''),
--    ('cycling:C3','mystic',''), ('cycling:E1','mystic',''), ('hiking:A1','mystic',''),
--    ('hiking:P1','mystic',''), ('cycling:H2','mystic',''), ('cycling:E1','rare',''),
--    ('running:H1','mystic',''), ('running:L1','mystic',''), ('trail_running:G1','rare',''),
--    ('running:X3','rare',''), ('trail_running:X2','rare',''),
--    ('hiking:C1','rare',''), ('hiking:C1','epic',''), ('hiking:C1','mystic','')
--  )
--  AND deleted_at IS NULL
--  ORDER BY family_key, level NULLS FIRST, rarity;
--
-- ② 최상위 등급에서 「화이트 룸」으로 끝나는 문장이 절반 이하로 줄었는가 (v5 194계열 기준)
-- SELECT count(*) FROM public.badges
--  WHERE type='activity' AND deleted_at IS NULL
--    AND family_key ~ '^(walking|running|cycling|hiking|trail_running):[A-Z]+[0-9]+$'
--    AND rarity = 'mystic' AND description LIKE '%화이트 룸%';
-- (기대: 7. 138 직후 15에서 8건 감소)
