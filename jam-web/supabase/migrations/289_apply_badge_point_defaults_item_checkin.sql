-- 289_apply_badge_point_defaults_item_checkin.sql
-- JAM 2.0 묶음 7 · 7-4: 아이템 배지·체크인 배지의 포인트를 배지 포인트 일괄 값(badge_point_policy)으로 맞춘다 (티켓 20261022_1135 2회, 상위 20261022_1131, 운영 로직 10.5·14.1절)
--
-- 데이터 변경(UPDATE)이다. 작성만 하고 실행하지 않았다. 실행은 아래 드라이런 결과를 사용자에게 보여 드리고 승인받은 뒤 카리나가 한다(사용자 결정 2026-10-24).
-- 새 칸·새 함수는 없다. 백업 표 1개(badge_point_backup_289)만 덧붙인다. 288(badge_point_policy)이 공용 DB에 먼저 있어야 한다(2026-10-24 적용됨).
--
-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 프로덕션 유저가 받는 포인트가 바로 달라진다.
--    - 이미 받은 배지에는 소급하지 않는다. 지급 코드는 배지를 받는 때 badges.point_reward를 읽어 한 번 지급한다.
--    - 다만 아직 열지 않은 잠긴 아이템 개체는 «열 때의 값»을 읽는다. 적용 뒤 그 개체를 열면 새 값을 받는다(아이템 Rare 이상은 0이던 값이 20·50·100이 된다).
--    - 이미 지급된 포인트는 원장(point_transactions)이 불변이라 되돌림 SQL로도 되돌려지지 않는다. 되돌림은 앞으로 지급될 값만 되돌린다.
--
-- 하는 일
--   badges 가운데 범위 안의 행의 point_reward를 일괄 값으로 덮어쓴다(사용자 결정: 기존 값은 규칙으로 덮어쓴다). 바뀐 행의 이전 값은 백업 표에 남긴다.
--
-- 범위
--   type IN ('item', 'checkin') AND deleted_at IS NULL AND is_hidden = false
--   - 삭제된 배지는 제외한다(삭제된 아이템 배지 333개, 2026-10-24 읽기).
--   - 숨김 배지는 제외한다. 숨김은 제약(badges_hidden_activity_only, badges_hidden_no_points)으로 액티비티 배지에만 있고 포인트가 0이어야 하므로 이 범위에서는 해당 행이 없다. 조건은 안전망이다.
--   - 액티비티 배지는 이 파일이 건드리지 않는다. 별도 파일 290이 맡는다(244, 245, 248 적용 뒤).
--
-- 값을 읽는 곳과 규칙 (포인트 숫자를 이 파일의 문장에 직접 쓰지 않는다)
--   값은 public.badge_point_policy(id=1)의 칸에서 읽는다. 등급 → 칸:
--     common → common_points, rare → rare_points, epic → epic_points, mystic → mystic_points, 등급 없음(레벨형) → leveled_points
--   이 대응은 src/lib/admin/badge-point-defaults.ts의 defaultPointFor와 같고, 시험(src/lib/badge/__tests__/pointApplySql.test.ts)이 같은 입력으로 대조한다.
--   정책 표의 기본값은 Common 10, Rare 20, Epic 50, Mystic 100, 레벨형 10이다.
--
-- 기대 건수 (2026-10-25 공용 DB 읽기. 달라지면 아래 가드가 예외를 내고 전체가 되돌아간다)
--   계획 행 3,803개 = 바뀔 행 1,701개 + 바뀌지 않는 행 2,102개. 규칙 값이 없는 행(after NULL) 0개, 등급 없음(레벨형) 행 0개.
--   바뀔 행 1,701개: 아이템 Common 351개 0 → 10, Rare 450개 0 → 20, Epic 450개 0 → 50, Mystic 450개 0 → 100
--   바뀌지 않는 행 2,102개: 아이템 Common 270개(이미 10), 체크인 Common 1,832개(이미 10)
--   정책 표 값이 기본값에서 바뀌어 있으면 바뀔 건수가 달라져 가드가 멈춘다. 기대 건수는 정책 표의 기본값을 전제로 한 숫자다.
--
-- 멈추는 조건 (RAISE EXCEPTION으로 한 트랜잭션 전체가 되돌아간다)
--   - 정책 표가 없거나 id=1 행이 없다.
--   - 백업 표에 이미 행이 있다(이미 적용했거나 이전 시도의 기록이 남아 있다. 백업을 덮어쓰지 않는다).
--   - 규칙 값(after)이 NULL인 행이 있다(알 수 없는 등급). 등급 없음(레벨형) 행이 있다(아이템·체크인에는 없는 것으로 확인했다).
--   - 계획 행·바뀔 행·바뀌지 않는 행·종류와 등급별 바뀔 행의 수가 위 기대 건수와 다르다.
--   - 갱신 행 수, 백업 행 수, 바뀔 행 수가 같지 않다. 갱신 뒤 범위 안에 규칙과 다른 행이 남는다.
--
-- 실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다(한 트랜잭션). 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.
--   계획은 임시 표(_badge_point_plan_289)로 한 번 만들어 가드·백업·갱신이 같은 계획을 쓴다. 읽은 뒤 값이 바뀐 행은 갱신하지 않고(b.point_reward = plan.before_pt), 건수 가드가 잡는다.
-- 백업 표 badge_point_backup_289는 badges에 updated_at이 없어 이전 값의 유일한 원본이다. 지우는 시점은 아직 정해지지 않았다(필요 없어지면 따로 지운다).

-- ═══════════════════════════════════════════════════════════════════════════
-- 드라이런 (읽기 전용 SELECT. 적용 전에 돌려서 «기대값»과 맞는지 본다. 데이터를 바꾸지 않는다)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⓪ 정책 표 값과 백업 표 유무
--   SELECT id, common_points, rare_points, epic_points, mystic_points, leveled_points, updated_at FROM public.badge_point_policy;   -- 1행: 1, 10, 20, 50, 100, 10
--   SELECT to_regclass('public.badge_point_backup_289');                                                                             -- NULL (아직 없다)
--
-- ① 계획 행 수와 바뀔 건수
--   WITH plan AS (
--     SELECT b.id, b.type::text AS badge_type, b.rarity::text AS rarity, b.point_reward AS before_pt,
--            CASE
--              WHEN b.rarity IS NULL          THEN pol.leveled_points
--              WHEN b.rarity::text = 'common' THEN pol.common_points
--              WHEN b.rarity::text = 'rare'   THEN pol.rare_points
--              WHEN b.rarity::text = 'epic'   THEN pol.epic_points
--              WHEN b.rarity::text = 'mystic' THEN pol.mystic_points
--            END AS after_pt
--       FROM public.badges b
--      CROSS JOIN public.badge_point_policy pol
--      WHERE pol.id = 1
--        AND b.type IN ('item', 'checkin')
--        AND b.deleted_at IS NULL
--        AND b.is_hidden = false
--   )
--   SELECT '계획 행 수' AS 지표, count(*)::text AS 값 FROM plan                                                                      -- 3803
--   UNION ALL SELECT '바뀔 행 수 (before <> after)', count(*)::text FROM plan WHERE before_pt <> after_pt                            -- 1701
--   UNION ALL SELECT '바뀌지 않는 행 수', count(*)::text FROM plan WHERE before_pt = after_pt                                       -- 2102
--   UNION ALL SELECT 'after가 NULL인 행 수', count(*)::text FROM plan WHERE after_pt IS NULL                                        -- 0
--   UNION ALL SELECT '등급 없음(레벨형) 행 수', count(*)::text FROM plan WHERE rarity IS NULL;                                      -- 0
--
-- ② 종류·등급·이전 값 → 이후 값별 건수 (위 WITH plan AS (...)를 그대로 앞에 붙여 돌린다)
--   SELECT badge_type, rarity, before_pt, after_pt, count(*) AS 건수 FROM plan GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4;
--     -- 기대 6행: checkin/common 10→10 = 1832, item/common 0→10 = 351, item/common 10→10 = 270, item/epic 0→50 = 450, item/mystic 0→100 = 450, item/rare 0→20 = 450
--
-- ③ 규칙 밖 값 목록: 이전 값이 0도 아니고 이후 값도 아닌 행 (위 WITH plan AS (...)를 앞에 붙여 돌린다)
--   SELECT p.id, b.name, p.badge_type, p.rarity, p.before_pt, p.after_pt FROM plan p JOIN public.badges b ON b.id = p.id
--    WHERE p.before_pt <> 0 AND p.before_pt <> p.after_pt ORDER BY p.badge_type, p.rarity, b.name;                                   -- 0행. 있으면 이 파일은 그 값도 덮어쓰므로 사용자에게 먼저 보인다
--
-- ④ 범위에서 빠지는 행 (참고)
--   SELECT type::text AS 종류, count(*) FILTER (WHERE deleted_at IS NOT NULL) AS 삭제, count(*) FILTER (WHERE deleted_at IS NULL AND is_hidden) AS 숨김
--     FROM public.badges WHERE type IN ('item', 'checkin') GROUP BY 1 ORDER BY 1;                                                    -- 삭제는 참고(item 333), 숨김은 두 종류 모두 0
--
-- ⑤ 포인트 원장 기준값 (사후 검증 ③과 비교한다. 이 파일은 원장을 건드리지 않는다)
--   SELECT count(*) AS 건수, COALESCE(sum(amount), 0) AS 합계 FROM public.point_transactions;
--
-- ⑥ 백업 표에 담길 값의 합 (참고): 바뀔 행마다 «이후 값 - 이전 값»을 모두 더한 값. 배지가 한 번씩 지급될 때 늘어나는 포인트의 합이다.   -- 기대 80010
--   (위 WITH plan AS (...)를 앞에 붙여) SELECT sum(after_pt - before_pt) FROM plan WHERE before_pt <> after_pt;

-- ═══════════════════════════════════════════════════════════════════════════
-- 본문
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS pg_temp._badge_point_plan_289;

-- 1. 정책 표 확인: 표와 id=1 행이 있어야 값을 읽을 수 있다
DO $guard$
DECLARE
  v_policy INTEGER;
BEGIN
  IF to_regclass('public.badge_point_policy') IS NULL THEN
    RAISE EXCEPTION '정책 표 badge_point_policy가 없습니다. 마이그레이션 288을 먼저 적용합니다.';
  END IF;

  SELECT count(*) INTO v_policy FROM public.badge_point_policy WHERE id = 1;
  IF v_policy <> 1 THEN
    RAISE EXCEPTION '정책 표 badge_point_policy의 id=1 행이 %개입니다(1개여야 합니다).', v_policy;
  END IF;
END
$guard$;

-- 2. 백업 표: 바뀐 행의 이전 값을 남긴다. 서버 전용(RLS 켜고 정책 없음, 클라이언트 권한 회수, 275 선례)
CREATE TABLE IF NOT EXISTS public.badge_point_backup_289 (
  badge_id      UUID PRIMARY KEY,
  before_point  INTEGER NOT NULL CHECK (before_point >= 0),
  after_point   INTEGER NOT NULL CHECK (after_point >= 0),
  backed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (before_point <> after_point)
);

ALTER TABLE public.badge_point_backup_289 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.badge_point_backup_289 FROM anon, authenticated;

COMMENT ON TABLE public.badge_point_backup_289 IS
  '마이그레이션 289(아이템·체크인 배지 포인트 일괄 적용)가 바꾼 행의 이전 값 백업(티켓 20261022_1135). 되돌림 SQL이 before_point로 되돌린다. 지우는 시점은 아직 정해지지 않았다. 서버(service role)만 읽고 쓴다.';

-- 3. 계획: 범위 안의 행마다 «지금 값(before)»과 «정책 표가 정한 값(after)». 등급 → 칸 대응은 defaultPointFor와 같다
CREATE TEMP TABLE _badge_point_plan_289 AS
SELECT b.id,
       b.type::text   AS badge_type,
       b.rarity::text AS rarity,
       b.point_reward AS before_pt,
       CASE
         WHEN b.rarity IS NULL          THEN pol.leveled_points
         WHEN b.rarity::text = 'common' THEN pol.common_points
         WHEN b.rarity::text = 'rare'   THEN pol.rare_points
         WHEN b.rarity::text = 'epic'   THEN pol.epic_points
         WHEN b.rarity::text = 'mystic' THEN pol.mystic_points
       END AS after_pt
  FROM public.badges b
 CROSS JOIN public.badge_point_policy pol
 WHERE pol.id = 1
   AND b.type IN ('item', 'checkin')
   AND b.deleted_at IS NULL
   AND b.is_hidden = false;

-- 4. 가드: 계획이 기대 건수와 같을 때만 진행한다
DO $guard$
DECLARE
  v_backup              INTEGER;
  v_plan                INTEGER;
  v_changed             INTEGER;
  v_same                INTEGER;
  v_null_after          INTEGER;
  v_null_rarity         INTEGER;
  v_item_common_changed INTEGER;
  v_item_rare_changed   INTEGER;
  v_item_epic_changed   INTEGER;
  v_item_mystic_changed INTEGER;
  v_item_common_same    INTEGER;
  v_checkin_same        INTEGER;
BEGIN
  SELECT count(*) INTO v_backup FROM public.badge_point_backup_289;
  IF v_backup <> 0 THEN
    RAISE EXCEPTION '백업 표 badge_point_backup_289에 이미 %건이 있습니다(0건이어야 합니다). 이미 적용했거나 이전 시도의 기록이 남아 있습니다. 백업을 덮어쓰지 않고 멈춥니다.', v_backup;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE before_pt <> after_pt),
         count(*) FILTER (WHERE before_pt = after_pt),
         count(*) FILTER (WHERE after_pt IS NULL),
         count(*) FILTER (WHERE rarity IS NULL),
         count(*) FILTER (WHERE badge_type = 'item' AND rarity = 'common' AND before_pt <> after_pt),
         count(*) FILTER (WHERE badge_type = 'item' AND rarity = 'rare' AND before_pt <> after_pt),
         count(*) FILTER (WHERE badge_type = 'item' AND rarity = 'epic' AND before_pt <> after_pt),
         count(*) FILTER (WHERE badge_type = 'item' AND rarity = 'mystic' AND before_pt <> after_pt),
         count(*) FILTER (WHERE badge_type = 'item' AND rarity = 'common' AND before_pt = after_pt),
         count(*) FILTER (WHERE badge_type = 'checkin' AND before_pt = after_pt)
    INTO v_plan, v_changed, v_same, v_null_after, v_null_rarity,
         v_item_common_changed, v_item_rare_changed, v_item_epic_changed, v_item_mystic_changed,
         v_item_common_same, v_checkin_same
    FROM _badge_point_plan_289;

  IF v_null_after > 0 THEN
    RAISE EXCEPTION '규칙 값(after)을 정하지 못한 행이 %건 있습니다(0건이어야 합니다). 알 수 없는 등급이 있는지 드라이런 ①로 확인합니다.', v_null_after;
  END IF;

  IF v_null_rarity > 0 THEN
    RAISE EXCEPTION '아이템·체크인 배지에 등급이 없는(레벨형) 행이 %건 있습니다(0건이어야 합니다).', v_null_rarity;
  END IF;

  IF v_plan <> 3803 OR v_changed <> 1701 OR v_same <> 2102 THEN
    RAISE EXCEPTION '계획 건수가 기대와 다릅니다: 계획 행 %건(기대 3803), 바뀔 행 %건(기대 1701), 바뀌지 않는 행 %건(기대 2102). 정책 표 값이 기본값에서 바뀌었거나 그 사이 배지가 바뀌었는지 드라이런으로 다시 확인합니다.', v_plan, v_changed, v_same;
  END IF;

  IF v_item_common_changed <> 351 OR v_item_rare_changed <> 450 OR v_item_epic_changed <> 450 OR v_item_mystic_changed <> 450
     OR v_item_common_same <> 270 OR v_checkin_same <> 1832 THEN
    RAISE EXCEPTION '종류·등급별 건수가 기대와 다릅니다: 아이템 바뀔 행 Common %(기대 351), Rare %(기대 450), Epic %(기대 450), Mystic %(기대 450), 바뀌지 않는 행 아이템 Common %(기대 270), 체크인 %(기대 1832).',
      v_item_common_changed, v_item_rare_changed, v_item_epic_changed, v_item_mystic_changed, v_item_common_same, v_checkin_same;
  END IF;
END
$guard$;

-- 5. 바뀔 행만 백업 표에 넣는다 (이전 값 before, 이후 값 after)
INSERT INTO public.badge_point_backup_289 (badge_id, before_point, after_point)
SELECT plan.id, plan.before_pt, plan.after_pt
  FROM _badge_point_plan_289 plan
 WHERE plan.before_pt <> plan.after_pt;

-- 6. 갱신과 건수 가드: 바뀔 행 수 = 갱신 행 수 = 백업 행 수가 아니면 예외로 전체를 되돌린다
DO $apply$
DECLARE
  v_changed  INTEGER;
  v_backup   INTEGER;
  v_updated  INTEGER;
  v_off      INTEGER;
BEGIN
  UPDATE public.badges b
     SET point_reward = plan.after_pt
    FROM _badge_point_plan_289 plan
   WHERE b.id = plan.id
     AND plan.before_pt <> plan.after_pt
     AND b.point_reward = plan.before_pt;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*) INTO v_changed FROM _badge_point_plan_289 WHERE before_pt <> after_pt;
  SELECT count(*) INTO v_backup FROM public.badge_point_backup_289;

  IF v_changed <> v_updated OR v_updated <> v_backup OR v_changed <> 1701 THEN
    RAISE EXCEPTION '건수가 어긋났습니다: 바뀔 행 %건, 갱신 행 %건, 백업 행 %건(셋 다 1701이어야 합니다). 읽은 뒤 값이 바뀐 행이 있는지 확인합니다.', v_changed, v_updated, v_backup;
  END IF;

  SELECT count(*) INTO v_off
    FROM _badge_point_plan_289 plan
    JOIN public.badges b ON b.id = plan.id
   WHERE b.point_reward IS DISTINCT FROM plan.after_pt;
  IF v_off > 0 THEN
    RAISE EXCEPTION '갱신 뒤에도 범위 안에 규칙 값과 다른 행이 %건 남았습니다(0건이어야 합니다).', v_off;
  END IF;
END
$apply$;

DROP TABLE _badge_point_plan_289;

-- ═══════════════════════════════════════════════════════════════════════════
-- 사후 검증 (적용 뒤 읽기 전용 SELECT)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ① 범위 안에서 규칙과 다른 행 (0이어야 한다). 드라이런 ①의 WITH plan AS (...)를 앞에 붙여 돌린다. 적용 뒤에는 before_pt가 «지금 값»이다.
--   SELECT count(*) AS 계획행, count(*) FILTER (WHERE before_pt <> after_pt) AS 규칙과_다른_행 FROM plan;                             -- 3803, 0
--
-- ② 종류·등급·값 분포 (드라이런 ②와 같은 방식. before_pt가 지금 값이다)
--   SELECT badge_type, rarity, before_pt AS 지금_값, count(*) FROM plan GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
--     -- 기대 5행: checkin/common/10 = 1832, item/common/10 = 621, item/epic/50 = 450, item/mystic/100 = 450, item/rare/20 = 450
--
-- ③ 포인트 원장 건수·합계가 적용 전과 같다 (드라이런 ⑤의 값과 비교한다. 이 파일은 원장을 건드리지 않는다)
--   SELECT count(*) AS 건수, COALESCE(sum(amount), 0) AS 합계 FROM public.point_transactions;
--
-- ④ 백업 표 건수와 값
--   SELECT count(*) AS 건수, sum(after_point - before_point) AS 늘어난_합 FROM public.badge_point_backup_289;                          -- 1701, 80010
--   SELECT b.type::text AS 종류, b.rarity::text AS 등급, bk.before_point, bk.after_point, count(*)
--     FROM public.badge_point_backup_289 bk JOIN public.badges b ON b.id = bk.badge_id GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4;           -- 4행(아이템 Common 0→10 351, Rare 0→20 450, Epic 0→50 450, Mystic 0→100 450)
--
-- ⑤ 액티비티 배지는 건드리지 않았다 (적용 전과 같아야 한다. 적용 전에 같은 쿼리를 돌려 값을 남긴다)
--   SELECT count(*) AS 건수, COALESCE(sum(point_reward), 0) AS 합계 FROM public.badges WHERE type = 'activity';

-- 되돌림 SQL
-- 백업 표의 before_point로 되돌린다. 백업에 있고 현재 값이 after_point인 행만 돌리고, 적용 뒤 어드민이 값을 직접 바꾼 행은 그대로 둔다.
-- (마이그레이션 253의 되돌림은 «값이 10·20·50·100인 행 전부»를 0으로 돌려 어드민이 정한 값까지 덮어쓸 수 있었다. 이 파일은 백업에 있는 행으로만 좁혔다.)
-- 이미 지급된 포인트는 원장이 불변이라 되돌려지지 않는다. 되돌리는 것은 앞으로 지급될 값이다.
-- 1) 되돌릴 행과 건드리지 않을 행을 먼저 센다 (건드리지 않을 행은 적용 뒤 값이 바뀐 행이다):
-- SELECT count(*) FILTER (WHERE b.point_reward = bk.after_point) AS 되돌릴_행, count(*) FILTER (WHERE b.point_reward <> bk.after_point) AS 건드리지_않을_행
--   FROM public.badge_point_backup_289 bk JOIN public.badges b ON b.id = bk.badge_id;
-- 2) 되돌린다:
-- UPDATE public.badges b SET point_reward = bk.before_point
--   FROM public.badge_point_backup_289 bk
--  WHERE b.id = bk.badge_id AND b.point_reward = bk.after_point;
-- 3) 되돌림 결과를 확인한 뒤 백업 표를 지운다:
-- DROP TABLE IF EXISTS public.badge_point_backup_289;
