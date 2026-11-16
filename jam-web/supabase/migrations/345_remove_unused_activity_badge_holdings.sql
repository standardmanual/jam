-- 345: JAM 2.0에서 쓰지 않는 활동 배지(소프트 삭제된 배지)의 유저 보유 기록 삭제
-- 티켓 20261116_2321 — 사용자 지시(2026-11-16): «JAM 2.0 오픈시 사용되지 않는 모든 배지를 유저에게서 제거해. 프로덕션 유저 모두»
--
-- 대상: user_activity_badges 중 badges.deleted_at IS NOT NULL 인 배지의 행.
--   (티켓 20261018_1816에서 재활용 후보 밖 활동 배지를 소프트 삭제했고, 그때는 받은 기록을 남겼다. 이번에 그 기록을 지운다.)
-- 근거(2026-11-16 읽기 전용 실측): 대상 행 81건, 유저 4명, 해당 배지의 point_reward는 모두 0이라 포인트 영향 없음.
--   user_activity_badges를 참조하는 외래 키·트리거 없음. 배지 발급 평가는 deleted_at IS NULL만 읽어 다시 받아지지 않는다.
-- 사용자 추가 지시(2026-11-16): «흐지부지 러닝 클럽과 체크인 배지는 제외». 흐지부지 러닝 클럽은 체크인 배지(ce5d5c21…)이며 이 표에는 보유 행이 없지만,
--   실수로 닿지 않도록 type='activity' 조건과 그 배지 id 제외 조건을 함께 건다.
-- 대상이 아닌 것: 활성 활동 배지 보유 218건, 체크인 배지 획득 기록 205건, 아이템 배지 개체(비활성 컬렉션 쪽은 329번에서 이미 destroyed 처리).
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.
-- 순서: 백업 표 → 건수 대조 → 삭제 → 삭제 건수 대조(어긋나면 전체 롤백).
-- 되돌림: 345_remove_unused_activity_badge_holdings_down.sql (백업 표에서 행을 되살린다).

BEGIN;

CREATE TABLE public.user_activity_badges_backup_20261116 AS
  SELECT u.*
  FROM public.user_activity_badges u
  JOIN public.badges b ON b.id = u.badge_id
  WHERE b.deleted_at IS NOT NULL
    AND b.type = 'activity'
    AND b.id <> 'ce5d5c21-dee4-449c-8e5c-e8b93ccc0ae6';

COMMENT ON TABLE public.user_activity_badges_backup_20261116 IS
  'JAM 2.0에서 쓰지 않는 활동 배지 보유 기록 삭제 전 사본(티켓 20261116_2321). 복구 필요성이 없다고 확인한 뒤 삭제한다.';

ALTER TABLE public.user_activity_badges_backup_20261116 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_target BIGINT;
  v_backup BIGINT;
  v_deleted BIGINT;
BEGIN
  SELECT count(*) INTO v_target
    FROM public.user_activity_badges u JOIN public.badges b ON b.id = u.badge_id
    WHERE b.deleted_at IS NOT NULL
      AND b.type = 'activity'
      AND b.id <> 'ce5d5c21-dee4-449c-8e5c-e8b93ccc0ae6';
  SELECT count(*) INTO v_backup FROM public.user_activity_badges_backup_20261116;
  IF v_target <> v_backup THEN
    RAISE EXCEPTION '백업 행 수 불일치: 대상 %, 백업 %', v_target, v_backup;
  END IF;

  DELETE FROM public.user_activity_badges u
  USING public.badges b
  WHERE b.id = u.badge_id
    AND b.deleted_at IS NOT NULL
    AND b.type = 'activity'
    AND b.id <> 'ce5d5c21-dee4-449c-8e5c-e8b93ccc0ae6';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> v_backup THEN
    RAISE EXCEPTION '삭제 행 수 불일치: 백업 %, 삭제 %', v_backup, v_deleted;
  END IF;
END
$$;

COMMIT;

-- ── 검증 쿼리 (실행 후 읽기 전용) ────────────────────────────────────────────
-- SELECT count(*) FROM public.user_activity_badges u JOIN public.badges b ON b.id=u.badge_id WHERE b.deleted_at IS NOT NULL;  -- 0이어야 정상
-- SELECT count(*) FROM public.user_activity_badges;                                  -- 실행 전 299 → 218
-- SELECT count(*) FROM public.user_activity_badges_backup_20261116;                  -- 81
