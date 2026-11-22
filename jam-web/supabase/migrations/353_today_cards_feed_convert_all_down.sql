-- 353 되돌림: 백업 표의 값으로 카드 유형·시드·색을 되돌린다 (티켓 20261120_2026 후속)
-- 백업 표에 있는 카드만 되돌린다. 그 사이 어드민에서 직접 고친 카드가 있다면 그 값도 백업 값(비어 있음)으로 돌아가니 먼저 확인한다.
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션 DB에 반영된다. 백업 표는 지우지 않는다(되돌린 뒤 사용자가 확인하고 지운다).

BEGIN;

UPDATE public.today_cards t
SET feed_type = b.feed_type,
    feed_seed = b.feed_seed,
    bg_color_key = b.bg_color_key,
    chip_color_key = b.chip_color_key,
    box_color_key = b.box_color_key
FROM public.today_cards_feed_backup_20261122 b
WHERE t.id = b.id;

COMMIT;
