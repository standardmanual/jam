-- 366_chapter_reward.sql
-- 챕터 보상 지급 기록 표와 보상 설정 표, 챕터별 보상 개수 열 추가 (티켓 20261127_1726, 상위 20261127_1720)
--
-- 확장 단계다(db-migration-rules.md 1절). 새 표 2개와 새 열 1개, 시드 값만 덧붙인다.
-- 옛 함수, 열, 정책, 표는 건드리지 않는다. 함수는 만들지 않는다(추첨·지급은 C3a·C3b).
-- 이 표와 열을 호출하는 곳은 아직 없다. 읽고 쓰는 코드와 함수는 이후 티켓이 만든다.
-- 기존 유저 지급(백필)은 하지 않는다.
--
-- 적용 대상: Supabase는 staging·프로덕션 공용 단일 DB라 적용 즉시 프로덕션에 반영된다.
-- 모든 문장은 다시 실행해도 같은 결과가 나온다(IF NOT EXISTS, IS DISTINCT FROM, ON CONFLICT DO NOTHING).
-- 되돌림은 366_chapter_reward_down.sql.

-- 1. chapter_definitions.reward_count (마지막 챕터 10은 NULL로 남긴다)
ALTER TABLE public.chapter_definitions
  ADD COLUMN IF NOT EXISTS reward_count INTEGER
  CHECK (reward_count IS NULL OR reward_count >= 0);

COMMENT ON COLUMN public.chapter_definitions.reward_count IS
  '이 챕터를 마칠 때(다음 챕터로 오를 때) 받는 아이템 배지 개수. 마지막 챕터는 NULL.';

-- 2. 시드: 마친 챕터 1~3은 3개, 4~6은 4개, 7~9는 5개 (A3 후보 E)
UPDATE public.chapter_definitions AS d
SET reward_count = v.cnt,
    updated_at = now()
FROM (VALUES
  (1, 3),
  (2, 3),
  (3, 3),
  (4, 4),
  (5, 4),
  (6, 4),
  (7, 5),
  (8, 5),
  (9, 5)
) AS v(no, cnt)
WHERE d.chapter_no = v.no
  AND d.reward_count IS DISTINCT FROM v.cnt;

-- 3. chapter_reward_policy — 등급 확률·다른 트라이브 확률·보정 설정 (단일 행, id = 1)
CREATE TABLE IF NOT EXISTS public.chapter_reward_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rarity_common NUMERIC NOT NULL DEFAULT 30 CHECK (rarity_common >= 0),
  rarity_rare NUMERIC NOT NULL DEFAULT 40 CHECK (rarity_rare >= 0),
  rarity_epic NUMERIC NOT NULL DEFAULT 22 CHECK (rarity_epic >= 0),
  rarity_mystic NUMERIC NOT NULL DEFAULT 8 CHECK (rarity_mystic >= 0),
  other_tribe_probability NUMERIC NOT NULL DEFAULT 0.2
    CHECK (other_tribe_probability BETWEEN 0 AND 1),
  pity_epic_threshold INTEGER NOT NULL DEFAULT 15 CHECK (pity_epic_threshold >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (abs(rarity_common + rarity_rare + rarity_epic + rarity_mystic - 100) < 0.001)
);

-- 정책은 만들지 않는다. service_role과 SECURITY DEFINER 함수만 접근한다.
ALTER TABLE public.chapter_reward_policy ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.chapter_reward_policy IS
  '챕터 보상 추첨 설정(단일 행, id = 1). 등급 확률 4개(합 100), 다른 트라이브 확률(0~1), 에픽 보정 임계값. 같은 등급 연속 기준은 jam_policy.common_streak_threshold를 쓴다. 서버만 읽는다.';

-- 4. 시드: 기본값이 A3 후보 E 값이다
INSERT INTO public.chapter_reward_policy (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 5. chapter_reward_grants — (유저, 마친 챕터) 1회 지급 기록
CREATE TABLE IF NOT EXISTS public.chapter_reward_grants (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chapter_no INTEGER NOT NULL REFERENCES public.chapter_definitions(chapter_no),
  reward_count INTEGER NOT NULL CHECK (reward_count >= 0),
  drawn_items JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(drawn_items) = 'array'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, chapter_no),
  CHECK ((status = 'claimed') = (claimed_at IS NOT NULL))
);

-- 6. 색인: 동기화 막힘 판정(유저에게 pending 행이 있는가)
CREATE INDEX IF NOT EXISTS chapter_reward_grants_pending_idx
  ON public.chapter_reward_grants (user_id)
  WHERE status = 'pending';

-- 정책은 만들지 않는다. service_role과 SECURITY DEFINER 함수만 접근한다.
ALTER TABLE public.chapter_reward_grants ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.chapter_reward_grants IS
  '(유저, 마친 챕터) 1회 지급 기록. 같은 키는 한 번만 기록한다(ON CONFLICT DO NOTHING). drawn_items는 처음 뽑은 결과를 저장해 다시 뽑지 못하게 한다. pending이 있으면 동기화를 막는다(Q-c), 칸에 넣으면 claimed.';
