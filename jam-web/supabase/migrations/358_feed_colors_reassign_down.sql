-- 358 되돌림: 홈피드 카드 색 121장을 백업 표 today_cards_feed_color_backup_20261123의 값으로 복구한다 (티켓 20261122_2224 회차 10)
--
-- 생성 근거: jam-web/scripts/gen-feed-color-reassign.ts (npx tsx scripts/gen-feed-color-reassign.ts down). 백업 표의 bg·chip·box 세 칸을 그대로 되돌린다.
-- 359(옛 10키 제거) 뒤에는 옛 키가 제약에 걸려 복구할 수 없다 — 먼저 359 되돌림을 실행한다.
-- 백업 표는 지우지 않는다. 복구를 화면과 DB로 확인한 뒤 사용자가 아래 DROP을 직접 실행해 삭제한다.
-- 백업 이후 삭제된 카드는 건너뛰고(복구 행 수만 알림으로 남긴다), 백업 표가 없으면 오류로 멈춘다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션 DB에 반영된다.

BEGIN;

DO $$
DECLARE
  restored integer;
BEGIN
  UPDATE public.today_cards t
  SET bg_color_key = b.bg_color_key,
      chip_color_key = b.chip_color_key,
      box_color_key = b.box_color_key
  FROM public.today_cards_feed_color_backup_20261123 b
  WHERE t.id = b.id;

  GET DIAGNOSTICS restored = ROW_COUNT;
  RAISE NOTICE '358 되돌림: % 행을 복구했습니다(백업 121행).', restored;
END
$$;

COMMIT;

-- 복구를 확인한 뒤 백업 표를 지운다(사용자 확인 후 실행):
-- DROP TABLE IF EXISTS public.today_cards_feed_color_backup_20261123;
