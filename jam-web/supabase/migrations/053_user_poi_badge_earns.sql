-- Phase 16: POI 배지 반복 획득 이력 테이블
-- user_activity_badges(UNIQUE(user_id, badge_id) — 활동/아이템 배지는 평생 1회만 보유)와
-- 완전히 분리된 신규 테이블. POI 배지는 같은 POI를 다시 지나가도 매번 새 행이 쌓인다.
-- 인벤토리(inventory_items)는 쓰지 않는다 — 그건 아이템 배지의 "보유 수량 제한" 전용 개념.

CREATE TABLE public.user_poi_badge_earns (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id                    UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  poi_id                      UUID NOT NULL REFERENCES public.poi(id) ON DELETE CASCADE,
  earned_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  triggered_by_strava_id      BIGINT,
  triggered_by_activity_name  TEXT,
  triggered_by_distance_km    NUMERIC,
  triggered_by_activity_date  TIMESTAMPTZ,

  -- 같은 Strava 활동이 재동기화(웹훅 재전송, 수동 재싱크)돼도 같은 활동에서 같은 POI를
  -- 두 번 발급하지 않기 위한 idempotency 방어선. 다른 날 재방문은 당연히 별도 행 허용.
  UNIQUE (user_id, badge_id, poi_id, triggered_by_strava_id)
);

CREATE INDEX idx_user_poi_badge_earns_user_badge ON public.user_poi_badge_earns (user_id, badge_id);
CREATE INDEX idx_user_poi_badge_earns_earned_at ON public.user_poi_badge_earns (badge_id, user_id, earned_at DESC);

ALTER TABLE public.user_poi_badge_earns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_poi_badge_earns: 본인만 읽기"
  ON public.user_poi_badge_earns FOR SELECT
  USING (auth.uid() = user_id);

-- 삽입은 서버 사이드(service_role, Strava 동기화)에서만 — 별도 authenticated INSERT 정책 없음
