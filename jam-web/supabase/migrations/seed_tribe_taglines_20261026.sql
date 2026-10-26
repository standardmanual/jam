-- seed_tribe_taglines_20261026.sql
-- 새 트라이브 5개의 소개(tribes.tagline)를 넣는다 (티켓 20261022_1140 7-9, 오픈 전후 적용 순서 문서 12절)
-- 형식은 «대주제 · 한 줄»이다(트라이브 고르기 화면이 그대로 보인다). 문구는 윈터 추천안을 사용자가 승인했다(2026-10-26).
-- 2026-10-26 공용 DB에 적용했다(apply_migration 이름 seed_tribe_taglines). 적용 전 5개 모두 NULL이었다.
-- ⚠️ 공용 DB 영향: 적용하는 순간 프로덕션의 트라이브 고르기 화면에도 바로 보인다.
-- 가드: 활성이고 소개가 비어 있는 행이 정확히 5개일 때만 갱신한다. 아니면 예외로 전체가 되돌아간다.
--
-- 되돌림 SQL (이전 값은 모두 NULL이었다):
--   UPDATE public.tribes SET tagline = NULL
--    WHERE name IN ('한입만 연구회','찰칵단','비사이드 레코즈','소나무 잡화점','혼자들');
--
-- 사후 확인:
--   SELECT name, tagline FROM public.tribes WHERE is_active ORDER BY name;   -- 5개 행에 소개, 옛 트라이브 3곳은 NULL

DO $tagline$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.tribes t
     SET tagline = v.tagline
    FROM (VALUES
      ('한입만 연구회',   '미식 · 남은 재료로 차린 시끄러운 식탁'),
      ('찰칵단',         '사진 · 흔들린 한 장도 그대로 두는 사람들'),
      ('비사이드 레코즈', '음악 · 12명이면 꽉 차는 음반 가게 뒷방'),
      ('소나무 잡화점',   '물건 덕후 · 소나무 아래 100개의 유리 칸'),
      ('혼자들',         '내향인 · 필요한 말만 적는 빨래방 단골들')
    ) AS v(name, tagline)
   WHERE t.name = v.name
     AND t.is_active
     AND (t.tagline IS NULL OR t.tagline = '');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 5 THEN
    RAISE EXCEPTION '트라이브 소개를 넣은 행이 %개입니다(5개여야 합니다). 이미 소개가 있거나 이름이 다른 행이 있는지 확인합니다.', v_updated;
  END IF;
END
$tagline$;
