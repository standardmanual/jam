-- 알림(소식) 스키마 — 티켓 20260824_019
-- 스펙: Service Plan/Specs/PRD/Notification/PRD.md + DATA_MODEL.md
--
-- 구성
--   1) notification_type ENUM (28종) — PRD §3의 28종과 1:1 대응
--   2) notifications 테이블 + 인덱스 2개 + RLS(SELECT 본인만, 쓰기는 service_role 전용)
--   3) users.notifications_seen_at — 읽음 지점(유저당 타임스탬프 1개)
--   4) poi_views 테이블 — 소식 #18("내 드랍 지점 활성") 계측용
--   5) create_notification() RPC — 묶음(group_key) UPSERT 병합
--
-- ⚠️ 이 파일은 티켓 20260824_019(db 유형) 규칙에 따라 **작성만** 하고 실행하지 않았다.
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.

-- =========================================
-- 1. notification_type ENUM (28종)
-- =========================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE public.notification_type AS ENUM (
      -- ① 보상 획득 (6) — bumps_badge=FALSE 대상
      'badge_earned', 'rare_badge_earned', 'item_badge_earned', 'poi_badge_earned',
      'points_earned', 'first_badge',
      -- ② 컬렉션 (3)
      'collection_slottable', 'collection_near_complete', 'collection_completable',
      -- ③ 내 드랍 (2)
      'drop_picked_up', 'drop_spot_active',
      -- ④ 미션 (5)
      'mission_milestone', 'mission_deadline', 'mission_completed',
      'mission_rank_up', 'mission_ended',
      -- ⑤ 소셜(나에게) (2)
      'followed', 'mutual_follow',
      -- ⑥ 소셜(팔로잉 활동) (4)
      'following_rare_badge', 'following_collection_complete',
      'following_mission_complete', 'following_nearby_drop',
      -- ⑦ 발견 (1)
      'nearby_drops',
      -- ⑧ 계정·시스템 (5)
      'strava_disconnected', 'sync_stalled', 'inventory_full',
      'admin_points_changed', 'announcement'
    );
  END IF;
END $$;

-- =========================================
-- 2. notifications
-- =========================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 받는 사람. 행위자가 아니다
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type          public.notification_type NOT NULL,
  -- 아바타 탭 대상. 팔로우·픽업됨·팔로잉 활동에만 존재, 나머지는 NULL
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- 묶음 인원 — "예린님 외 3명"의 N
  actor_count   INT  NOT NULL DEFAULT 1,
  -- 묶음 병합 키. NULL이면 묶지 않는 소식(항상 새 행)
  group_key     TEXT,
  -- 문구 슬롯 + 착지점 계산에 필요한 ID. 닉네임은 박제하지 않는다(actor_user_id로 조인)
  payload       JSONB NOT NULL DEFAULT '{}',
  -- dot을 켜는가. ① 보상 획득 6종만 FALSE (유저가 동기화 화면에서 이미 봤다)
  bumps_badge   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 정렬·dot 판정의 기준. created_at이 아니다 (묶음 갱신이 즉시 반영돼야 하므로)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 묶음 병합: 같은 유저·같은 group_key는 한 행만 존재
CREATE UNIQUE INDEX IF NOT EXISTS notifications_group_uniq
  ON public.notifications (user_id, group_key)
  WHERE group_key IS NOT NULL;

-- 알림함 조회: 유저별 최신순
CREATE INDEX IF NOT EXISTS notifications_user_updated_idx
  ON public.notifications (user_id, updated_at DESC);

-- updated_at 자동 갱신
--   create_notification()이 UPDATE에서 명시적으로 NOW()를 넣으므로 트리거가 없어도
--   동작하지만, 다른 경로(어드민 수정·배치 보정 등)의 UPDATE에서도 정렬·dot 기준이
--   반드시 따라와야 하므로 트리거로 못박는다. handle_updated_at()은 001에서 정의됨.
DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS — 본인 소식만 읽을 수 있다.
-- 쓰기는 service_role(T1 인라인·T2 배치·어드민) 전용이므로 INSERT/UPDATE 정책을 열지 않는다.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

-- =========================================
-- 3. 읽음 모델 — 타임스탬프 1개
-- =========================================
-- 개별 알림의 read 플래그를 두지 않는다. 알림함 진입 시 전체 읽음 처리이므로
-- 유저당 "어디까지 봤나" 한 점만 알면 충분하다.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notifications_seen_at TIMESTAMPTZ;

-- =========================================
-- 4. poi_views — 소식 #18 전용 계측
-- =========================================
-- #18의 "다녀갔다" = 누군가 그 POI를 열어서 확인한 것(픽업 여부와 무관).
-- 주간 배치가 지난 7일 고유 열람 인원을 세고, 본인 열람은 집계에서 제외한다.
CREATE TABLE IF NOT EXISTS public.poi_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id     UUID NOT NULL REFERENCES public.poi(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- KST 기준 날짜. UTC로 두면 KST 09:00에 날짜가 바뀌어 하루 중복 억제가 어긋난다
  viewed_on  DATE NOT NULL,
  -- 실제 열람 시각 (분석용)
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 같은 유저가 같은 POI를 하루에 여러 번 열어도 1행만 — 볼륨 억제 + 고유 인원 집계
CREATE UNIQUE INDEX IF NOT EXISTS poi_views_daily_uniq
  ON public.poi_views (poi_id, user_id, viewed_on);

-- 주간 집계 조회
CREATE INDEX IF NOT EXISTS poi_views_poi_date_idx
  ON public.poi_views (poi_id, viewed_on DESC);

-- RLS — 계측 테이블이라 유저 화면에서 직접 읽을 일이 없다.
-- engine_decision_log(074)와 동일하게 "RLS 켜고 정책 없음" = service_role 전용.
-- (RLS 자체를 끄면 anon 키로 전체 조회·수정이 가능해진다 — 074 인시던트 참고)
ALTER TABLE public.poi_views ENABLE ROW LEVEL SECURITY;

-- =========================================
-- 5. create_notification() — 묶음 UPSERT 병합
-- =========================================
-- PostgREST(supabase-js)의 .upsert()는 "행 전체 교체"만 표현할 수 있어
-- `actor_count = actor_count + 1` 같은 증분 갱신을 만들 수 없다.
-- DATA_MODEL §4의 병합 규칙을 그대로 구현하려면 DB 함수가 필요하다.

-- payload 병합 헬퍼 — 기본은 얕은 덮어쓰기(||)이고, p_sum_keys에 나열된 키만 숫자로 더한다.
-- (소식 #5 포인트 적립처럼 "하루치 합계"가 필요한 경우에 쓴다)
CREATE OR REPLACE FUNCTION public.jsonb_merge_sum(
  p_old      JSONB,
  p_new      JSONB,
  p_sum_keys TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_merged JSONB := COALESCE(p_old, '{}'::jsonb) || COALESCE(p_new, '{}'::jsonb);
  v_key    TEXT;
BEGIN
  IF p_sum_keys IS NULL OR array_length(p_sum_keys, 1) IS NULL THEN
    RETURN v_merged;
  END IF;

  FOREACH v_key IN ARRAY p_sum_keys LOOP
    IF (p_old ? v_key) AND (p_new ? v_key) THEN
      v_merged := jsonb_set(
        v_merged,
        ARRAY[v_key],
        to_jsonb(
          COALESCE((p_old ->> v_key)::numeric, 0) + COALESCE((p_new ->> v_key)::numeric, 0)
        )
      );
    END IF;
  END LOOP;

  RETURN v_merged;
END;
$$;

-- p_mode
--   'merge' : 같은 group_key가 있으면 actor_count +1, payload 병합, updated_at 갱신 (기본)
--   'once'  : 같은 group_key가 이미 있으면 아무것도 하지 않는다.
--             "구간당 1회"(#20 미션 마일스톤)·"컬렉션당 1회"(#10·#11)처럼 재발송이
--             즉시 다크패턴이 되는 소식용. merge로 두면 매 동기화마다 updated_at이
--             갱신돼 dot이 다시 켜진다.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id       UUID,
  p_type          public.notification_type,
  p_payload       JSONB   DEFAULT '{}'::jsonb,
  p_bumps_badge   BOOLEAN DEFAULT TRUE,
  p_actor_user_id UUID    DEFAULT NULL,
  p_group_key     TEXT    DEFAULT NULL,
  p_mode          TEXT    DEFAULT 'merge',
  p_sum_keys      TEXT[]  DEFAULT NULL
)
RETURNS public.notifications
LANGUAGE plpgsql
AS $$
DECLARE
  v_row      public.notifications;
  v_existing public.notifications;
BEGIN
  IF p_mode NOT IN ('merge', 'once') THEN
    RAISE EXCEPTION 'create_notification: p_mode는 merge 또는 once여야 합니다 (받은 값: %)', p_mode;
  END IF;

  -- group_key가 NULL이면 묶지 않는 소식 — 항상 새 행
  IF p_group_key IS NULL THEN
    INSERT INTO public.notifications (user_id, type, actor_user_id, group_key, payload, bumps_badge)
    VALUES (p_user_id, p_type, p_actor_user_id, NULL, COALESCE(p_payload, '{}'::jsonb), p_bumps_badge)
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  LOOP
    SELECT * INTO v_existing
      FROM public.notifications
     WHERE user_id = p_user_id AND group_key = p_group_key
     FOR UPDATE;

    IF FOUND THEN
      IF p_mode = 'once' THEN
        RETURN v_existing;
      END IF;

      UPDATE public.notifications n
         SET actor_count   = n.actor_count + 1,
             -- 가장 최근 행위자를 대표로. 단 이번 호출에 행위자가 없으면(시스템 소식)
             -- 기존 대표를 지우지 않는다.
             actor_user_id = COALESCE(p_actor_user_id, n.actor_user_id),
             payload       = public.jsonb_merge_sum(n.payload, COALESCE(p_payload, '{}'::jsonb), p_sum_keys),
             updated_at    = NOW()
       WHERE n.id = v_existing.id
      RETURNING * INTO v_row;

      RETURN v_row;
    END IF;

    BEGIN
      INSERT INTO public.notifications (user_id, type, actor_user_id, group_key, payload, bumps_badge)
      VALUES (p_user_id, p_type, p_actor_user_id, p_group_key, COALESCE(p_payload, '{}'::jsonb), p_bumps_badge)
      RETURNING * INTO v_row;
      RETURN v_row;
    EXCEPTION WHEN unique_violation THEN
      -- 동시 삽입 경합 — 루프를 다시 돌아 위의 병합 경로로 합류한다
      NULL;
    END;
  END LOOP;
END;
$$;

-- 쓰기는 service_role 전용 — 함수 실행 권한도 동일하게 제한한다.
-- (PostgreSQL 기본값은 PUBLIC EXECUTE라 명시적으로 회수해야 한다)
REVOKE ALL ON FUNCTION public.create_notification(UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification(UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.create_notification(UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[]) TO service_role;

REVOKE ALL ON FUNCTION public.jsonb_merge_sum(JSONB, JSONB, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jsonb_merge_sum(JSONB, JSONB, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.jsonb_merge_sum(JSONB, JSONB, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_merge_sum(JSONB, JSONB, TEXT[]) TO service_role;
