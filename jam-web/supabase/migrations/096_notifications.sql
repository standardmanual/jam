-- 알림(소식) 스키마 — 티켓 20260824_019
-- 스펙: Service Plan/Specs/PRD/Notification/PRD.md + DATA_MODEL.md
--
-- 구성
--   1) notification_type ENUM (28종) — PRD §3의 28종과 1:1 대응
--   2) notifications 테이블 + 인덱스 2개 + RLS(SELECT 본인만, 쓰기는 service_role 전용)
--   3) users.notifications_seen_at — 읽음 지점(유저당 타임스탬프 1개)
--   4) poi_views 테이블 — 소식 #18("내 드랍 지점 활성") 계측용
--   5) create_notification() RPC — 묶음(group_key) UPSERT 병합
--      (payload 병합 3방식: 얕은 덮어쓰기 / p_sum_keys 합산 / p_append_keys 배열 누적+중복제거)
--
-- ⚠️ 이 파일은 티켓 20260824_019(db 유형) 규칙에 따라 **작성만** 하고 실행하지 않았다.
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 🚨 실행 순서 제약 — 반드시 지킬 것
--   **095와 방향이 반대다: DDL 먼저 → 코드 배포.**
--   선행 조건: 이 SQL을 프로덕션에 적용한 **뒤에** 티켓 019의 코드를 배포한다.
--   위반 시(코드 먼저 배포): notifications·poi_views 테이블과 create_notification() RPC가
--           아직 없어 PostgREST가 42P01(테이블 없음)·PGRST202(함수 없음)로 HTTP 404를
--           반환한다. 알림 라이브러리는 "본 트랜잭션을 깨뜨리지 않는다"는 원칙에 따라
--           실패를 삼키고 console.error만 남기도록 설계돼 있으므로, **화면은 멀쩡한데
--           소식이 한 건도 생기지 않는 무증상 상태**가 된다 — 배지 발급·픽업·팔로우 등
--           T1 14개 지점이 전부 조용히 no-op이 되고 로그만 쌓인다.
--   실행 후: `npm run db:types`로 database.generated.ts를 재생성해 이 티켓의 수동 편집분
--           (src/types/database.ts)과 대조한다.
--
-- ↩️ 롤백 DDL (적용 후 되돌려야 할 경우)
--   -- 반드시 **코드 롤백을 먼저** 하고 아래를 실행한다. 코드가 살아 있는 상태로
--   -- DDL만 되돌리면 위의 "무증상 no-op"과 같은 상태가 된다.
--   DROP FUNCTION IF EXISTS public.create_notification(
--     UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[], TEXT[]);
--   DROP FUNCTION IF EXISTS public.jsonb_merge_sum(JSONB, JSONB, TEXT[], TEXT[]);
--   DROP FUNCTION IF EXISTS public.jsonb_as_array(JSONB);
--   DROP TABLE IF EXISTS public.poi_views;
--   DROP TABLE IF EXISTS public.notifications;   -- ⚠️ 쌓인 소식이 함께 사라진다
--   DROP TYPE  IF EXISTS public.notification_type;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS notifications_seen_at;
--
-- 🧪 적용 후 검증: supabase/tests/096_notifications_merge.test.sql
--    (BEGIN…ROLLBACK 안에서 append 중복 제거·actor_count 고유 인원·badge_ids 누적을 확인)

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
-- `actor_count = ...` 같은 증분 갱신이나 배열 누적을 만들 수 없다.
-- DATA_MODEL §4의 병합 규칙을 그대로 구현하려면 DB 함수가 필요하다.

-- 이전 버전(append 미지원 시그니처)이 이미 적용된 환경을 대비해 먼저 제거한다.
-- CREATE OR REPLACE는 인자 개수가 다르면 "교체"가 아니라 "오버로드 추가"라,
-- 남겨두면 인자 생략 호출이 `function is not unique`로 실패한다.
DROP FUNCTION IF EXISTS public.create_notification(
  UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS public.jsonb_merge_sum(JSONB, JSONB, TEXT[]);

-- JSONB 값을 배열로 정규화한다 — 없거나 JSON null이면 빈 배열, 배열이 아니면 1칸 배열.
-- (append 대상 키에 스칼라가 잘못 들어와도 값을 잃지 않게 하는 방어)
CREATE OR REPLACE FUNCTION public.jsonb_as_array(p_value JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_value IS NULL                     THEN '[]'::jsonb
    WHEN jsonb_typeof(p_value) = 'null'      THEN '[]'::jsonb
    WHEN jsonb_typeof(p_value) = 'array'     THEN p_value
    ELSE jsonb_build_array(p_value)
  END;
$$;

-- payload 병합 — DATA_MODEL §4 「payload 병합 3방식」
--   1) 기본        : 얕은 덮어쓰기 (old || new) — 최신 값만 남으면 되는 필드
--   2) p_sum_keys  : 숫자 필드를 더한다 (#5 포인트 적립의 하루 합계)
--   3) p_append_keys: 배열을 이어붙이고 **중복을 제거**한다 (#13 actor_ids·badge_ids, #26 actor_ids)
--
-- append가 없으면 6시간 창의 픽업 3건이 얕은 병합에 밀려 **마지막 배지 하나만** 남는다.
-- 중복 제거는 "같은 사람이 내 드랍 3건을 픽업" → actor_count 3(거짓말)을 막는 장치다.
-- 순서는 먼저 등장한 값이 앞에 오도록 보존한다(기존 묶음 → 이번 이벤트).
CREATE OR REPLACE FUNCTION public.jsonb_merge_sum(
  p_old         JSONB,
  p_new         JSONB,
  p_sum_keys    TEXT[],
  p_append_keys TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_merged  JSONB := COALESCE(p_old, '{}'::jsonb) || COALESCE(p_new, '{}'::jsonb);
  v_key     TEXT;
  v_old_arr JSONB;
  v_new_arr JSONB;
  v_arr     JSONB;
BEGIN
  -- (2) 숫자 합산
  IF p_sum_keys IS NOT NULL AND array_length(p_sum_keys, 1) IS NOT NULL THEN
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
  END IF;

  -- (3) 배열 누적 + 중복 제거
  IF p_append_keys IS NOT NULL AND array_length(p_append_keys, 1) IS NOT NULL THEN
    FOREACH v_key IN ARRAY p_append_keys LOOP
      v_old_arr := public.jsonb_as_array(p_old -> v_key);
      v_new_arr := public.jsonb_as_array(p_new -> v_key);

      -- 양쪽 모두 값이 없으면 키를 만들지 않는다(얕은 병합 결과를 그대로 둔다)
      IF v_old_arr = '[]'::jsonb AND v_new_arr = '[]'::jsonb THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(jsonb_agg(d.val ORDER BY d.ord), '[]'::jsonb)
        INTO v_arr
        FROM (
               SELECT s.val, MIN(s.ord) AS ord
                 FROM (
                        SELECT e.val, e.ord
                          FROM jsonb_array_elements(v_old_arr) WITH ORDINALITY AS e(val, ord)
                        UNION ALL
                        -- 새 값은 항상 기존 값 뒤에 오도록 큰 오프셋을 준다
                        SELECT e.val, e.ord + 1000000000
                          FROM jsonb_array_elements(v_new_arr) WITH ORDINALITY AS e(val, ord)
                      ) s
                GROUP BY s.val
             ) d;

      v_merged := jsonb_set(v_merged, ARRAY[v_key], v_arr);
    END LOOP;
  END IF;

  RETURN v_merged;
END;
$$;

-- p_mode
--   'merge' : 같은 group_key가 있으면 payload 병합 + actor_count 재계산 + updated_at 갱신 (기본)
--   'once'  : 같은 group_key가 이미 있으면 아무것도 하지 않는다.
--             "구간당 1회"(#20 미션 마일스톤)·"컬렉션당 1회"(#10·#11)처럼 재발송이
--             즉시 다크패턴이 되는 소식용. merge로 두면 매 동기화마다 updated_at이
--             갱신돼 dot이 다시 켜진다.
--
-- actor_count는 **병합 횟수가 아니라 고유 인원**이다 (DATA_MODEL §4-1).
--   · payload.actor_ids가 있으면 중복 제거 후 길이를 그대로 쓴다 → 한 사람이 6시간 안에
--     내 드랍 3건을 픽업해도 1명이다("예린님 외 2명"이라는 거짓말을 막는다)
--   · actor_ids를 쓰지 않는데 행위자가 있는 소식은 기존대로 +1 (근사)
--   · 행위자가 아예 없는 묶음 소식(1·3·4·5·34)은 건드리지 않는다 — 1로 남고 렌더에도 쓰지 않는다
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id       UUID,
  p_type          public.notification_type,
  p_payload       JSONB   DEFAULT '{}'::jsonb,
  p_bumps_badge   BOOLEAN DEFAULT TRUE,
  p_actor_user_id UUID    DEFAULT NULL,
  p_group_key     TEXT    DEFAULT NULL,
  p_mode          TEXT    DEFAULT 'merge',
  p_sum_keys      TEXT[]  DEFAULT NULL,
  p_append_keys   TEXT[]  DEFAULT NULL
)
RETURNS public.notifications
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row      public.notifications;
  v_existing public.notifications;
  v_payload  JSONB;
  v_count    INT;
BEGIN
  IF p_mode NOT IN ('merge', 'once') THEN
    RAISE EXCEPTION 'create_notification: p_mode는 merge 또는 once여야 합니다 (받은 값: %)', p_mode;
  END IF;

  -- 최초 삽입분도 append 키를 정규화한다(호출부가 중복이 섞인 배열을 넘겨도 정합성 유지)
  v_payload := public.jsonb_merge_sum('{}'::jsonb, COALESCE(p_payload, '{}'::jsonb), NULL, p_append_keys);
  v_count := CASE
    WHEN jsonb_typeof(v_payload -> 'actor_ids') = 'array'
      THEN GREATEST(jsonb_array_length(v_payload -> 'actor_ids'), 1)
    ELSE 1
  END;

  -- group_key가 NULL이면 묶지 않는 소식 — 항상 새 행
  IF p_group_key IS NULL THEN
    INSERT INTO public.notifications (user_id, type, actor_user_id, actor_count, group_key, payload, bumps_badge)
    VALUES (p_user_id, p_type, p_actor_user_id, v_count, NULL, v_payload, p_bumps_badge)
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

      v_payload := public.jsonb_merge_sum(
        v_existing.payload, COALESCE(p_payload, '{}'::jsonb), p_sum_keys, p_append_keys
      );

      v_count := CASE
        WHEN jsonb_typeof(v_payload -> 'actor_ids') = 'array'
          THEN GREATEST(jsonb_array_length(v_payload -> 'actor_ids'), 1)
        WHEN p_actor_user_id IS NOT NULL
          THEN v_existing.actor_count + 1
        ELSE v_existing.actor_count
      END;

      UPDATE public.notifications n
         SET actor_count   = v_count,
             -- 가장 최근 행위자를 대표로. 단 이번 호출에 행위자가 없으면(시스템 소식)
             -- 기존 대표를 지우지 않는다.
             actor_user_id = COALESCE(p_actor_user_id, n.actor_user_id),
             payload       = v_payload,
             updated_at    = NOW()
       WHERE n.id = v_existing.id
      RETURNING * INTO v_row;

      RETURN v_row;
    END IF;

    BEGIN
      INSERT INTO public.notifications (user_id, type, actor_user_id, actor_count, group_key, payload, bumps_badge)
      VALUES (p_user_id, p_type, p_actor_user_id, v_count, p_group_key, v_payload, p_bumps_badge)
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
REVOKE ALL ON FUNCTION public.create_notification(UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[], TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification(UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[], TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.create_notification(UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[], TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, public.notification_type, JSONB, BOOLEAN, UUID, TEXT, TEXT, TEXT[], TEXT[]) TO service_role;

REVOKE ALL ON FUNCTION public.jsonb_merge_sum(JSONB, JSONB, TEXT[], TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jsonb_merge_sum(JSONB, JSONB, TEXT[], TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.jsonb_merge_sum(JSONB, JSONB, TEXT[], TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_merge_sum(JSONB, JSONB, TEXT[], TEXT[]) TO service_role;

REVOKE ALL ON FUNCTION public.jsonb_as_array(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jsonb_as_array(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.jsonb_as_array(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_as_array(JSONB) TO service_role;
