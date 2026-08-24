-- 미션 순위 스냅샷 — 티켓 20260825_002 (알림 소식 T2 배치)
-- 스펙: Service Plan/Specs/PRD/Notification/PRD.md §3 ④ (#23 순위 상승)
--
-- ## 왜 필요한가
--
-- 소식 #23은 **"상승 시만"**이 조건이다. 그런데 미션 순위는 어디에도 저장되지 않고
-- `/api/missions/[id]/status`가 요청마다 계산한다(참가자 진행도 정렬). 직전 순위를 모르면
-- "올라섰다"를 판정할 방법이 없다.
--
-- 기존 `notifications` 행에서 직전 순위를 읽는 방법은 **첫 기준선을 만들 수 없다** —
-- 소식이 있어야 기준선이 생기고 기준선이 있어야 소식이 생기므로 영원히 발화하지 않는다.
-- 그래서 매 배치가 현재 순위를 여기에 남기고, 다음 배치가 그것과 비교한다.
-- **첫 배치는 기준선만 남기고 소식을 만들지 않는다** (오르지도 않은 유저에게
-- "5위로 올라섰어요"가 나가면 거짓말이다).
--
-- ⚠️ 이 파일은 `/jam-work` jam-developer 규칙에 따라 **작성만** 하고 실행하지 않았다.
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 🚨 실행 순서 — **DDL 먼저 → 코드 배포**를 권장하되, 순서가 바뀌어도 안전하다.
--    코드가 먼저 배포되면 `mission_rank_snapshots` 조회가 42P01로 실패하고
--    `runStep()`이 그 단계만 잡아 로그를 남긴다 — **#23만 생성되지 않고 나머지 12종은
--    정상 생성된다.** 무증상이 되지 않도록 `[notifications-batch] 단계 실패 —
--    mission-rank` 로그가 반드시 남는다.
--
-- ↩️ 롤백 DDL
--    DROP TABLE IF EXISTS public.mission_rank_snapshots;
--    (스냅샷이 사라지면 다음 배치가 기준선만 다시 만들고 #23은 하루 쉰다)

CREATE TABLE IF NOT EXISTS public.mission_rank_snapshots (
  mission_id  UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- 1부터. lib/missions/ranking.ts의 정렬(완료자 우선 → 먼저 완료한 순 → 진행도 순)로 계산
  rank        INT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mission_id, user_id)
);

-- 배치는 전체를 한 번에 읽고 UPSERT한다. PK가 그대로 조회·병합 키다.
CREATE INDEX IF NOT EXISTS mission_rank_snapshots_user_idx
  ON public.mission_rank_snapshots (user_id);

-- RLS — 유저 화면에서 직접 읽을 일이 없는 배치 전용 테이블이다.
-- engine_decision_log(074)·poi_views(096)와 동일하게 "RLS 켜고 정책 없음" = service_role 전용.
-- (RLS 자체를 끄면 anon 키로 전체 조회·수정이 가능해진다 — 074 인시던트 참고)
ALTER TABLE public.mission_rank_snapshots ENABLE ROW LEVEL SECURITY;
