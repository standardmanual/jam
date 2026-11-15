-- 344 되돌림: activity_badge_templates 표만 지운다. 이 표를 참조하는 다른 객체는 없다.
-- 되돌림 SQL
BEGIN;
DROP TABLE IF EXISTS public.activity_badge_templates;
COMMIT;
