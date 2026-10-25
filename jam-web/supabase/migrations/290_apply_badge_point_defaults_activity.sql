-- 290_apply_badge_point_defaults_activity.sql
-- JAM 2.0 묶음 7 · 7-4: 액티비티 배지의 포인트를 배지 포인트 일괄 값(badge_point_policy)으로 맞춘다 (티켓 20261022_1135 2회, 상위 20261022_1131, 운영 로직 10.5·11.4·14.1절)
--
-- 데이터 변경(UPDATE)이다. 작성만 하고 실행하지 않았다. 실행은 오픈 직전에, 드라이런 결과를 사용자에게 보여 드리고 승인받은 뒤 카리나가 한다(사용자 결정 2026-10-24).
-- 새 칸·새 함수는 없다. 백업 표 1개(badge_point_backup_290)만 덧붙인다. 288(badge_point_policy)이 공용 DB에 먼저 있어야 한다(2026-10-24 적용됨).
--
-- ⚠️ 적용 순서: 244 → 245 → 248 → (245·248의 포인트 합 확인) → 290. 이 파일은 244, 245, 248이 모두 적용된 «뒤에» 실행한다.
--    - 244는 재활용 후보 밖 활동 배지를 끄고(deleted_at 채움) 유지 270개(온보딩 배지 1개 포함)만 남긴다. 이 파일은 deleted_at IS NULL인 행만 다루므로 244 전에 돌리면 꺼질 배지까지 바꾼다.
--    - 245는 새 행 61개(14계열, 포인트 합 1410), 248은 새 행 59개(17계열, 포인트 합 1650)를 규칙 값으로 넣는다. 이 파일은 그 행도 범위에 넣어 정책 표 값으로 다시 쓴다.
--    - 245·248의 포인트 합 확인(두 파일 끝의 «사후 검증 ①», 합 1410과 1650)은 이 파일을 적용하기 «전에» 돌린다. 이 파일을 적용한 뒤에는 정책 표 값에 따라 그 행의 포인트가 다시 쓰일 수 있어, 합이 어긋났을 때 245·248 탓인지 이 파일 탓인지 가를 수 없다.
--    - 선행 조건 가드가 활성(삭제되지 않은) 액티비티 배지 수를 계획 값 390개(244 뒤 270 + 245의 61 + 248의 59)와 대조한다. 다르면 아무것도 바꾸지 않고 멈춘다.
--
-- ⚠️ 공용 DB 영향: Supabase는 staging과 프로덕션이 한 DB를 쓰므로, 적용하는 순간 프로덕션 유저가 받는 포인트가 바로 달라진다.
--    - 이미 받은 배지에는 소급하지 않는다. 액티비티 배지는 받을 때 badges.point_reward를 읽어 한 번 지급한다(받은 기록 user_activity_badges는 건드리지 않는다).
--    - 적용 뒤 처음 받는 배지부터 새 값이 나간다. 레벨형은 레벨마다 지급된다.
--    - 이미 지급된 포인트는 원장(point_transactions)이 불변이라 되돌림 SQL로도 되돌려지지 않는다. 되돌림은 앞으로 지급될 값만 되돌린다.
--
-- 하는 일
--   badges 가운데 범위 안의 행의 point_reward를 일괄 값으로 덮어쓴다(사용자 결정: 기존 값은 규칙으로 덮어쓴다). 바뀐 행의 이전 값은 백업 표에 남긴다.
--
-- 범위
--   type = 'activity' AND deleted_at IS NULL AND is_hidden = false AND id <> 'cd20f271-9445-42cc-ac51-d8a96b25e1c3'
--   - 삭제된(끈) 배지는 제외한다. 244가 끈 배지가 여기에 든다.
--   - 숨김 배지는 제외한다. 숨김은 제약(badges_hidden_no_points)으로 포인트가 0이어야 한다.
--   - 온보딩 완료 배지 «JAM!»은 제외한다. Common인데 포인트가 100이라 등급 기준 일괄 변경에서 빼야 한다.
--     이 id는 src/lib/onboarding-quest/config.ts의 ONBOARDING_COMPLETION_BADGE_ID와 같은 값이고, 시험이 두 값을 대조한다.
--   - 레벨형(등급 없음, 레벨 있음) 행은 leveled_points(레벨마다 지급되는 값)로 맞춘다.
--
-- 값을 읽는 곳과 규칙 (포인트 숫자를 이 파일의 문장에 직접 쓰지 않는다)
--   값은 public.badge_point_policy(id=1)의 칸에서 읽는다. 등급 → 칸:
--     common → common_points, rare → rare_points, epic → epic_points, mystic → mystic_points, 등급 없음(레벨형) → leveled_points
--   이 대응은 src/lib/admin/badge-point-defaults.ts의 defaultPointFor와 같고, 시험(src/lib/badge/__tests__/pointApplySql.test.ts)이 같은 입력으로 대조한다.
--   정책 표의 기본값은 Common 10, Rare 20, Epic 50, Mystic 100, 레벨형 10이다.
--
-- 기대 건수: 바뀔 건수는 파일에 박지 않는다. 244, 245, 248을 적용한 뒤 오픈 직전의 드라이런으로 정하고 사용자가 확인한다.
--   안전은 두 가지로 확보한다. ① 선행 조건 가드(활성 액티비티 배지 수 = 390) ② 동등 가드(바뀔 행 수 = 갱신 행 수 = 백업 행 수).
--   정책 표 값이 기본값과 다르면 그대로 적용되므로 드라이런 ⓪에서 정책 표 값을 눈으로 확인한다.
--
-- 멈추는 조건 (RAISE EXCEPTION으로 한 트랜잭션 전체가 되돌아간다)
--   - 정책 표가 없거나 id=1 행이 없다.
--   - 활성 액티비티 배지 수가 계획 값과 다르다(244, 245, 248 적용 전이거나 건수가 계획과 다르다).
--   - 백업 표에 이미 행이 있다(이미 적용했거나 이전 시도의 기록이 남아 있다. 백업을 덮어쓰지 않는다).
--   - 계획 행이 0건이다. 규칙 값(after)이 NULL인 행이 있다(알 수 없는 등급). 계획에 온보딩 배지가 들어 있다.
--   - 바뀔 행 수, 갱신 행 수, 백업 행 수가 같지 않다. 갱신 뒤 범위 안에 규칙과 다른 행이 남는다.
--
-- 실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다(한 트랜잭션). 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.
--   계획은 임시 표(_badge_point_plan_290)로 한 번 만들어 가드·백업·갱신이 같은 계획을 쓴다. 읽은 뒤 값이 바뀐 행은 갱신하지 않고(b.point_reward = plan.before_pt), 동등 가드가 잡는다.
-- 백업 표 badge_point_backup_290은 badges에 updated_at이 없어 이전 값의 유일한 원본이다. 지우는 시점은 아직 정해지지 않았다(필요 없어지면 따로 지운다).

-- ═══════════════════════════════════════════════════════════════════════════
-- 드라이런 (읽기 전용 SELECT. 244, 245, 248 적용 뒤 오픈 직전에 돌려서 사용자에게 보인다. 데이터를 바꾸지 않는다)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⓪ 선행 조건과 정책 표 값
--   SELECT id, common_points, rare_points, epic_points, mystic_points, leveled_points, updated_at FROM public.badge_point_policy;   -- 1행: 1, 10, 20, 50, 100, 10 (다르면 사용자에게 먼저 알린다)
--   SELECT to_regclass('public.badge_point_backup_290');                                                                             -- NULL (아직 없다)
--   SELECT count(*) AS 활성_액티비티_배지 FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;                         -- 390 (244 뒤 270 + 245의 61 + 248의 59)
--   -- 245·248의 포인트 합: 두 파일 끝의 «사후 검증 ①»을 먼저 돌려 1410과 1650을 확인한다. 한 번에 보려면 두 파일의 family_key가 모두 ':J<숫자>' 꼴이라 아래로 묶어 볼 수 있다.
--   SELECT count(*) AS 행수, COALESCE(sum(point_reward), 0) AS 포인트합, count(*) FILTER (WHERE is_hidden) AS 숨김
--     FROM public.badges WHERE family_key ~ ':J[0-9]';                                                                               -- 120, 3060 (= 1410 + 1650), 0
--   SELECT id, name, rarity::text AS 등급, point_reward, is_hidden, deleted_at FROM public.badges WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';   -- 1행: 온보딩 완료 배지(Common, 100). 이 파일은 건드리지 않는다
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
--        AND b.type = 'activity'
--        AND b.deleted_at IS NULL
--        AND b.is_hidden = false
--        AND b.id <> 'cd20f271-9445-42cc-ac51-d8a96b25e1c3'
--   )
--   SELECT '계획 행 수' AS 지표, count(*)::text AS 값 FROM plan                                                                      -- 활성 390 - 숨김 - 온보딩 1
--   UNION ALL SELECT '바뀔 행 수 (before <> after)', count(*)::text FROM plan WHERE before_pt <> after_pt                            -- 이 값이 갱신 행 수 = 백업 행 수가 된다
--   UNION ALL SELECT '바뀌지 않는 행 수', count(*)::text FROM plan WHERE before_pt = after_pt
--   UNION ALL SELECT 'after가 NULL인 행 수', count(*)::text FROM plan WHERE after_pt IS NULL                                        -- 0
--   UNION ALL SELECT '레벨형(등급 없음) 행 수', count(*)::text FROM plan WHERE rarity IS NULL;
--
-- ② 등급(레벨형은 «레벨형»)·이전 값 → 이후 값별 건수 (위 WITH plan AS (...)를 앞에 붙여 돌린다)
--   SELECT COALESCE(rarity, '레벨형') AS 등급, before_pt, after_pt, count(*) AS 건수 FROM plan GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
--
-- ③ 규칙 밖 값 목록: 이전 값이 0도 아니고 이후 값도 아닌 행 (위 WITH plan AS (...)를 앞에 붙여 돌린다)
--   SELECT p.id, b.name, b.family_key, p.rarity, b.level, p.before_pt, p.after_pt
--     FROM plan p JOIN public.badges b ON b.id = p.id
--    WHERE p.before_pt <> 0 AND p.before_pt <> p.after_pt ORDER BY b.family_key, b.level, p.rarity;                                -- 있으면 이 파일은 그 값도 덮어쓰므로 사용자에게 먼저 보인다
--
-- ④ 범위에서 빠지는 행 (참고)
--   SELECT count(*) FILTER (WHERE deleted_at IS NOT NULL) AS 삭제, count(*) FILTER (WHERE deleted_at IS NULL AND is_hidden) AS 숨김,
--          count(*) FILTER (WHERE deleted_at IS NULL AND id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3') AS 온보딩
--     FROM public.badges WHERE type = 'activity';                                                                                    -- 삭제는 244가 끈 수 + 기존 삭제, 온보딩 1
--
-- ⑤ 포인트 원장 기준값 (사후 검증 ③과 비교한다. 이 파일은 원장을 건드리지 않는다)
--   SELECT count(*) AS 건수, COALESCE(sum(amount), 0) AS 합계 FROM public.point_transactions;
--
-- ⑥ 아이템·체크인 배지 기준값 (사후 검증 ⑤와 비교한다. 이 파일은 건드리지 않는다)
--   SELECT type::text AS 종류, count(*) AS 건수, COALESCE(sum(point_reward), 0) AS 합계 FROM public.badges WHERE type IN ('item', 'checkin') GROUP BY 1 ORDER BY 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- 본문
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS pg_temp._badge_point_plan_290;

-- 1. 정책 표 확인과 선행 조건 가드: 244, 245, 248이 모두 적용된 뒤(활성 액티비티 배지 390개)라야 진행한다
DO $guard$
DECLARE
  v_policy INTEGER;
  v_active INTEGER;
BEGIN
  IF to_regclass('public.badge_point_policy') IS NULL THEN
    RAISE EXCEPTION '정책 표 badge_point_policy가 없습니다. 마이그레이션 288을 먼저 적용합니다.';
  END IF;

  SELECT count(*) INTO v_policy FROM public.badge_point_policy WHERE id = 1;
  IF v_policy <> 1 THEN
    RAISE EXCEPTION '정책 표 badge_point_policy의 id=1 행이 %개입니다(1개여야 합니다).', v_policy;
  END IF;

  SELECT count(*) INTO v_active FROM public.badges WHERE type = 'activity' AND deleted_at IS NULL;
  IF v_active <> 390 THEN
    RAISE EXCEPTION '244, 245, 248 적용 전이거나 건수가 계획과 다릅니다: 활성 액티비티 배지 %개(계획 390개 = 244 뒤 270 + 245의 61 + 248의 59). 아무것도 바꾸지 않고 멈춥니다.', v_active;
  END IF;
END
$guard$;

-- 2. 백업 표: 바뀐 행의 이전 값을 남긴다. 서버 전용(RLS 켜고 정책 없음, 클라이언트 권한 회수, 275 선례)
CREATE TABLE IF NOT EXISTS public.badge_point_backup_290 (
  badge_id      UUID PRIMARY KEY,
  before_point  INTEGER NOT NULL CHECK (before_point >= 0),
  after_point   INTEGER NOT NULL CHECK (after_point >= 0),
  backed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (before_point <> after_point)
);

ALTER TABLE public.badge_point_backup_290 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.badge_point_backup_290 FROM anon, authenticated;

COMMENT ON TABLE public.badge_point_backup_290 IS
  '마이그레이션 290(액티비티 배지 포인트 일괄 적용)이 바꾼 행의 이전 값 백업(티켓 20261022_1135). 되돌림 SQL이 before_point로 되돌린다. 지우는 시점은 아직 정해지지 않았다. 서버(service role)만 읽고 쓴다.';

-- 3. 계획: 범위 안의 행마다 «지금 값(before)»과 «정책 표가 정한 값(after)». 등급 → 칸 대응은 defaultPointFor와 같다
CREATE TEMP TABLE _badge_point_plan_290 AS
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
   AND b.type = 'activity'
   AND b.deleted_at IS NULL
   AND b.is_hidden = false
   AND b.id <> 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';

-- 4. 가드: 백업 표가 비어 있고, 계획이 있고, 규칙 값이 모두 정해졌고, 온보딩 배지가 계획에 없을 때만 진행한다
DO $guard$
DECLARE
  v_backup      INTEGER;
  v_plan        INTEGER;
  v_null_after  INTEGER;
  v_onboarding  INTEGER;
BEGIN
  SELECT count(*) INTO v_backup FROM public.badge_point_backup_290;
  IF v_backup <> 0 THEN
    RAISE EXCEPTION '백업 표 badge_point_backup_290에 이미 %건이 있습니다(0건이어야 합니다). 이미 적용했거나 이전 시도의 기록이 남아 있습니다. 백업을 덮어쓰지 않고 멈춥니다.', v_backup;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE after_pt IS NULL),
         count(*) FILTER (WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3')
    INTO v_plan, v_null_after, v_onboarding
    FROM _badge_point_plan_290;

  IF v_plan = 0 THEN
    RAISE EXCEPTION '계획 행이 0건입니다. 범위 조건이나 선행 적용 상태를 드라이런 ①로 확인합니다.';
  END IF;

  IF v_null_after > 0 THEN
    RAISE EXCEPTION '규칙 값(after)을 정하지 못한 행이 %건 있습니다(0건이어야 합니다). 알 수 없는 등급이 있는지 드라이런 ①로 확인합니다.', v_null_after;
  END IF;

  IF v_onboarding > 0 THEN
    RAISE EXCEPTION '계획에 온보딩 완료 배지가 들어 있습니다(제외해야 합니다).';
  END IF;
END
$guard$;

-- 5. 바뀔 행만 백업 표에 넣는다 (이전 값 before, 이후 값 after)
INSERT INTO public.badge_point_backup_290 (badge_id, before_point, after_point)
SELECT plan.id, plan.before_pt, plan.after_pt
  FROM _badge_point_plan_290 plan
 WHERE plan.before_pt <> plan.after_pt;

-- 6. 갱신과 건수 가드: 계획의 바뀔 행 수 = 갱신 행 수 = 백업 행 수가 아니면 예외로 전체를 되돌린다
DO $apply$
DECLARE
  v_changed  INTEGER;
  v_backup   INTEGER;
  v_updated  INTEGER;
  v_off      INTEGER;
BEGIN
  UPDATE public.badges b
     SET point_reward = plan.after_pt
    FROM _badge_point_plan_290 plan
   WHERE b.id = plan.id
     AND plan.before_pt <> plan.after_pt
     AND b.point_reward = plan.before_pt;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*) INTO v_changed FROM _badge_point_plan_290 WHERE before_pt <> after_pt;
  SELECT count(*) INTO v_backup FROM public.badge_point_backup_290;

  IF v_changed <> v_updated OR v_updated <> v_backup THEN
    RAISE EXCEPTION '건수가 어긋났습니다: 바뀔 행 %건, 갱신 행 %건, 백업 행 %건(셋이 같아야 합니다). 읽은 뒤 값이 바뀐 행이 있는지 확인합니다.', v_changed, v_updated, v_backup;
  END IF;

  SELECT count(*) INTO v_off
    FROM _badge_point_plan_290 plan
    JOIN public.badges b ON b.id = plan.id
   WHERE b.point_reward IS DISTINCT FROM plan.after_pt;
  IF v_off > 0 THEN
    RAISE EXCEPTION '갱신 뒤에도 범위 안에 규칙 값과 다른 행이 %건 남았습니다(0건이어야 합니다).', v_off;
  END IF;
END
$apply$;

DROP TABLE _badge_point_plan_290;

-- ═══════════════════════════════════════════════════════════════════════════
-- 사후 검증 (적용 뒤 읽기 전용 SELECT)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ① 범위 안에서 규칙과 다른 행 (0이어야 한다). 드라이런 ①의 WITH plan AS (...)를 앞에 붙여 돌린다. 적용 뒤에는 before_pt가 «지금 값»이다.
--   SELECT count(*) AS 계획행, count(*) FILTER (WHERE before_pt <> after_pt) AS 규칙과_다른_행 FROM plan;                             -- 드라이런 ①의 계획 행 수와 같다, 0
--
-- ② 등급(레벨형은 «레벨형»)·값 분포 (드라이런 ②와 같은 방식. before_pt가 지금 값이다)
--   SELECT COALESCE(rarity, '레벨형') AS 등급, before_pt AS 지금_값, count(*) FROM plan GROUP BY 1, 2 ORDER BY 1, 2;                    -- 등급마다 한 값(Common 하나, Rare 하나, Epic 하나, Mystic 하나, 레벨형 하나)
--
-- ③ 포인트 원장 건수·합계가 적용 전과 같다 (드라이런 ⑤의 값과 비교한다. 이 파일은 원장을 건드리지 않는다)
--   SELECT count(*) AS 건수, COALESCE(sum(amount), 0) AS 합계 FROM public.point_transactions;
--
-- ④ 백업 표 건수가 드라이런 ①의 바뀔 행 수와 같고, 온보딩 배지는 그대로다
--   SELECT count(*) AS 건수, sum(after_point - before_point) AS 늘어난_합 FROM public.badge_point_backup_290;
--   SELECT id, name, rarity::text AS 등급, point_reward FROM public.badges WHERE id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';          -- 적용 전과 같다(Common, 100)
--   SELECT count(*) FROM public.badge_point_backup_290 WHERE badge_id = 'cd20f271-9445-42cc-ac51-d8a96b25e1c3';                       -- 0
--
-- ⑤ 아이템·체크인 배지는 건드리지 않았다 (드라이런 ⑥의 값과 같아야 한다)
--   SELECT type::text AS 종류, count(*) AS 건수, COALESCE(sum(point_reward), 0) AS 합계 FROM public.badges WHERE type IN ('item', 'checkin') GROUP BY 1 ORDER BY 1;
--
-- ⑥ 숨김 배지는 건드리지 않았다 (제약으로 0이어야 한다)
--   SELECT count(*) FROM public.badges WHERE type = 'activity' AND is_hidden AND point_reward <> 0;                                    -- 0

-- 되돌림 SQL
-- 백업 표의 before_point로 되돌린다. 백업에 있고 현재 값이 after_point인 행만 돌리고, 적용 뒤 어드민이 값을 직접 바꾼 행은 그대로 둔다.
-- (마이그레이션 253의 되돌림은 «값이 10·20·50·100인 행 전부»를 0으로 돌려 어드민이 정한 값까지 덮어쓸 수 있었다. 이 파일은 백업에 있는 행으로만 좁혔다.)
-- 이미 지급된 포인트는 원장이 불변이라 되돌려지지 않는다. 되돌리는 것은 앞으로 지급될 값이다.
-- 245·248을 되돌릴 때(family_key로 행을 지운다)는 이 되돌림을 먼저 실행한다. 지워진 행은 백업 표에 남아도 갱신할 행이 없어 건너뛴다.
-- 1) 되돌릴 행과 건드리지 않을 행을 먼저 센다 (건드리지 않을 행은 적용 뒤 값이 바뀐 행이다):
-- SELECT count(*) FILTER (WHERE b.point_reward = bk.after_point) AS 되돌릴_행, count(*) FILTER (WHERE b.point_reward <> bk.after_point) AS 건드리지_않을_행
--   FROM public.badge_point_backup_290 bk JOIN public.badges b ON b.id = bk.badge_id;
-- 2) 되돌린다:
-- UPDATE public.badges b SET point_reward = bk.before_point
--   FROM public.badge_point_backup_290 bk
--  WHERE b.id = bk.badge_id AND b.point_reward = bk.after_point;
-- 3) 되돌림 결과를 확인한 뒤 백업 표를 지운다:
-- DROP TABLE IF EXISTS public.badge_point_backup_290;
