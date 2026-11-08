-- 330_gaze_motion_columns_down.sql
-- 330이 더한 '시선과 동작' 칸 두 개를 지운다 (티켓 20261108_1823)
-- 칸을 읽는 코드가 없으므로 지워도 화면과 엔진에 영향이 없다. 문구 원본은 원고 문서에 남아 있다.

BEGIN;
ALTER TABLE public.badges DROP COLUMN IF EXISTS gaze_motion;
ALTER TABLE public.item_books DROP COLUMN IF EXISTS gaze_motion;
COMMIT;
