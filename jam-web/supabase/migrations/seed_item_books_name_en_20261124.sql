-- seed_item_books_name_en_20261124.sql
-- 공개 중인 컬렉션 10개에 영문 이름(item_books.name_en)을 넣는다 (티켓 20261124_2016, 상위 20261124_1741)
-- 카리나 추천안을 사용자가 그대로 승인했다(2026-11-24). 처음 정한 5개(마이그레이션 363)와 같은 방식: 2~3단어, 대문자.
-- ⚠️ 공용 DB 영향: 적용하는 순간 staging·프로덕션 어드민의 표지 생성기가 이 이름을 기본값으로 쓴다(이미 적용한 표지는 그대로).
-- 가드: 활성이고 영문 이름이 비어 있는 행이 정확히 10개 갱신될 때만 남긴다. 아니면 예외로 전체가 되돌아간다.
--
-- 되돌림 SQL (이전 값은 모두 NULL이었다):
--   UPDATE public.item_books SET name_en = NULL
--    WHERE is_active AND name IN ('배터리 방전의 공포','삼십 초의 소리','유리 칸 닦는 아침','행운의 잡동사니','노을 헌터의 기록',
--                                 '매직 아워','비 오는 날의 기름 냄새','시장 골목의 전설','겨울잠의 안식처','길거리 우체통의 편지');
--
-- 사후 확인:
--   SELECT name, name_en FROM public.item_books WHERE is_active ORDER BY name;   -- 활성 15행 모두 영문 이름이 있다

DO $name_en$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.item_books b
     SET name_en = v.name_en
    FROM (VALUES
      ('배터리 방전의 공포', 'LOW BATTERY PANIC'),
      ('삼십 초의 소리', 'THIRTY SECOND SOUNDS'),
      ('유리 칸 닦는 아침', 'GLASS CASE MORNINGS'),
      ('행운의 잡동사니', 'LUCKY ODDS AND ENDS'),
      ('노을 헌터의 기록', 'SUNSET HUNTER LOG'),
      ('매직 아워', 'MAGIC HOUR'),
      ('비 오는 날의 기름 냄새', 'RAINY DAY SIZZLE'),
      ('시장 골목의 전설', 'MARKET ALLEY LEGENDS'),
      ('겨울잠의 안식처', 'HIBERNATION HIDEOUT'),
      ('길거리 우체통의 편지', 'STREET MAILBOX LETTERS')
    ) AS v(name, name_en)
   WHERE b.name = v.name AND b.is_active AND b.name_en IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 10 THEN
    RAISE EXCEPTION '컬렉션 영문 이름 갱신 대상이 10행이어야 하는데 %행이다', v_updated;
  END IF;
END $name_en$;
