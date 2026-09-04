-- 130: 배지 스키마 v5 확장 — 레벨·계열·반복 획득 (티켓 20260905_0027, 마스터 20260905_0026)
--
-- 배경: v5의 세 가지 신규 구조가 현재 스키마에서 물리적으로 표현 불가능하다.
--   ① 무한레벨형 — `badges.rarity`가 NOT NULL ENUM 4값이라 "등급 없음"을 담을 자리가 없다.
--      새 enum 값을 넣어도 `RARITY_TIER`에 없는 값은 `?? 0`으로 떨어져
--      `badge-engine/index.ts:700`의 `(RARITY_TIER[badge.rarity] ?? 0) <= highestOwned`에서
--      `0 <= 0`이 되어 후보에서 매번 탈락한다 (마스터 티켓 B-1).
--   ② 반복 획득 — `UNIQUE(user_id, badge_id)`가 막는다 (B-3).
--   ③ 계열 — DB에 계열 키도 표시 순서도 없어 배지 이름 72개를 코드에 하드코딩하고 있다
--      (`src/lib/badgeTree.ts`). 550종에서는 유지 불가능하다.
--   ④ `badges_family_consistency`(migrations/128)가 계열 내 조건 필드 조합 동일성을 강제해
--      무한레벨 계열 INSERT를 EXCEPTION으로 막을 수 있다 (B-4).
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(작업 유형 db)에 따라 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 재실행 가능(idempotent): 전 구간 IF NOT EXISTS / DROP ... IF EXISTS + ADD /
-- CREATE OR REPLACE / 조건부 UPDATE 로 작성했다.

-- ── A. badges — 레벨·계열·표시 순서 ─────────────────────────────────────────

ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS level      INTEGER;
ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS family_key TEXT;
ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.badges.level IS
  '무한레벨형 배지의 레벨(Lv.1~∞). 등급형은 NULL.
   판정 기준은 rarity IS NULL 하나뿐이며(별도 badge_kind 컬럼을 두지 않는다 — 두 개의 판정
   기준은 서로 어긋날 수 있다), badges_rarity_level_exclusive CHECK가 둘의 일치를 강제한다.
   티켓 20260905_0027';
COMMENT ON COLUMN public.badges.family_key IS
  '계열 식별자. 이름 문자열(badges.name) 대신 쓰는 안정적인 키.
   기존 207종은 D절에서 "{activity_type}:{name}" 형태로 백필한다(폐기 예정이나 마이그레이션
   검증용). 활동 배지 외(item/checkin)에는 채우지 않는다. 티켓 20260905_0027';
COMMENT ON COLUMN public.badges.sort_order IS
  '표시 순서(오름차순). badgeTree.ts의 하드코딩 배열 72개(ACTIVITY_BADGE_ORDER 40 +
   INDEPENDENT_BADGE_ORDER 32)를 대체한다.
   규약: 계열 레일 1~99 (계열 안 모든 등급이 같은 값을 공유) / 독립 발급 배지 101~ .
   0은 "아직 설정하지 않음"이며 화면에서 맨 뒤로 밀린다 — 기존 indexOf가 -1을 반환해 목록에
   없는 이름이 그리드 맨 앞으로 튀어나오던 결함(티켓 20260905_0027 문제 ③)을 뒤집은 것이다.
   티켓 20260905_0027';

-- rarity nullable 전환 (2026-09-05 확정, 대안 A).
-- DEFAULT 'common'은 **일부러 남긴다**: 기존 INSERT 경로가 rarity를 생략해도 그대로 동작해야
-- 하고, 레벨형을 넣으면서 rarity를 생략하는 실수는 아래 CHECK가 즉시 EXCEPTION으로 잡는다
-- (조용히 Common이 되는 경로가 없다 — 미채택안 badge_kind의 실패 모드가 바로 그것이었다).
ALTER TABLE public.badges ALTER COLUMN rarity DROP NOT NULL;

COMMENT ON COLUMN public.badges.rarity IS
  '등급형 배지의 등급. **NULL이면 무한레벨형이다** — 이것이 v5의 유일한 배지 종류 판정
   기준이다(티켓 20260905_0027, 2026-09-05 확정). DEFAULT ''common''은 기존 INSERT 경로
   호환을 위해 남아 있으므로, 레벨형을 넣을 때는 rarity를 반드시 NULL로 명시해야 한다.';

-- 종류 판정 기준을 DB가 강제한다: 등급이 비어 있으면 반드시 레벨이 있고, 그 역도 성립.
-- 기존 5,596행은 전부 rarity NOT NULL · level NULL 이라 (false)=(false) 로 즉시 통과한다.
ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_rarity_level_exclusive;
ALTER TABLE public.badges ADD CONSTRAINT badges_rarity_level_exclusive
  CHECK ((rarity IS NULL) = (level IS NOT NULL));

-- 레벨은 1부터 시작한다(마스터 티켓 "등급 없이 Lv.1~∞").
ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_level_positive;
ALTER TABLE public.badges ADD CONSTRAINT badges_level_positive
  CHECK (level IS NULL OR level >= 1);

-- 인덱스. family_key는 값이 있는 행만 조회 대상이라 부분 인덱스로 둔다(item/checkin 배지
-- 5,389행이 전부 NULL).
CREATE INDEX IF NOT EXISTS idx_badges_family_key
  ON public.badges (family_key) WHERE family_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_badges_sort_order
  ON public.badges (sort_order);

-- ── B. user_activity_badges — 반복 획득 누적 ────────────────────────────────
--
-- UNIQUE(user_id, badge_id)는 **그대로 유지한다** (2026-09-05 확정, 대안 B).
-- 행 수가 늘지 않으므로 user_activity_badges를 참조하는 33개 파일이 전부 무변경으로 동작한다
-- (실측 2026-09-05: grep -rln user_activity_badges src/). 회차별 이력은 earn_history에 남는다.
-- 미채택: UNIQUE 해제 + 행 누적(선례 user_checkin_badge_earns, migrations/053) — 활동 배지는
-- "보유 여부"를 행 1개 전제로 판정하는 코드가 33개 파일에 퍼져 있어 전수 점검 비용이 크다.

ALTER TABLE public.user_activity_badges
  ADD COLUMN IF NOT EXISTS earn_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.user_activity_badges
  ADD COLUMN IF NOT EXISTS earn_history JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.user_activity_badges.earn_count IS
  '이 배지를 획득한 총 횟수. 최초 발급이 1이며 반복 획득 시 증가한다(행은 늘지 않는다).
   기존 행은 전부 1로 채워진다. 티켓 20260905_0027';
COMMENT ON COLUMN public.user_activity_badges.earn_history IS
  '회차별 획득 이력(jsonb 배열). 각 원소는 획득 시각과 근거 활동 id를 담는다.
   ⚠️ JSONB라 FK가 없다 — 근거 활동이 삭제되면 참조가 끊긴 채 남는다("끊긴 참조 허용"이
   기본값). 표시 단계(티켓 20260905_0038)에서 결번 처리한다. 티켓 20260905_0027';

ALTER TABLE public.user_activity_badges DROP CONSTRAINT IF EXISTS user_activity_badges_earn_count_positive;
ALTER TABLE public.user_activity_badges ADD CONSTRAINT user_activity_badges_earn_count_positive
  CHECK (earn_count >= 1);

ALTER TABLE public.user_activity_badges DROP CONSTRAINT IF EXISTS user_activity_badges_earn_history_is_array;
ALTER TABLE public.user_activity_badges ADD CONSTRAINT user_activity_badges_earn_history_is_array
  CHECK (jsonb_typeof(earn_history) = 'array');

-- ── C. badges_family_consistency 트리거 조정 ────────────────────────────────
--
-- 128이 건 트리거는 같은 (activity_types, name) 계열의 모든 배지에 동일한
-- MEASURABLE_CONDITION_KEYS 조합을 강제한다. 등급형(Common~Mystic 4장이 같은 지표를 값만
-- 달리해 쓰는 구조)에는 옳지만, 무한레벨형은 레벨마다 다른 필드를 쓸 수 있어(마스터 티켓 ④)
-- 그대로 두면 INSERT 자체가 EXCEPTION으로 실패한다.
--
-- 조정은 두 줄뿐이다 — **등급형에 대한 기존 정합성 보장은 한 글자도 바꾸지 않는다.**
--   ① NEW.level IS NOT NULL 이면 검사 자체를 건너뛴다 (무한레벨형은 대상 아님)
--   ② 형제 조회에서 level IS NOT NULL 인 행을 뺀다 (같은 이름을 쓰는 레벨형 배지가
--      등급형 계열의 "기존 조건 조합"을 오염시키지 않게 한다)
-- 128의 알려진 한계(이름 오타로 계열이 쪼개지면 검사가 스킵된다)는 그대로 남는다.
-- family_key 기준 그룹핑으로 바꾸는 것은 이 티켓 범위 밖이다(어드민 계열 관리, 티켓 0032).
CREATE OR REPLACE FUNCTION public.check_family_condition_consistency()
RETURNS TRIGGER AS $$
DECLARE
  measurable_keys TEXT[] := ARRAY[
    'distance_km','elevation_gain_m','duration_minutes','min_speed_kmh','max_pace_sec_per_km',
    'temperature_min_c','temperature_max_c','weekend_duration_hours','total_count','streak_days',
    'weekly_count','month','monthly_km','season_count','season_count_all','active_days_count','time_range'
  ];
  sibling_keys TEXT[];
  new_keys     TEXT[] := (
    SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(NEW.condition_json) k
    WHERE k = ANY(measurable_keys)
  );
BEGIN
  IF (NEW.condition_json->>'mission_reward')::boolean IS TRUE THEN
    RETURN NEW;  -- mission_reward 배지는 애초에 계열 그룹핑에서 빠진다(badgeTree.ts) — 대상 아님
  END IF;

  -- ① v5 무한레벨형(= rarity IS NULL, badges_rarity_level_exclusive가 둘을 묶어 준다)은
  --    레벨마다 조건 필드가 달라지는 것이 정상 설계다 — 이 검사의 대상이 아니다.
  IF NEW.level IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(DISTINCT k ORDER BY k) INTO sibling_keys
  FROM public.badges, jsonb_object_keys(condition_json) k
  WHERE activity_types = NEW.activity_types  -- activity_type(단수) 컬럼은 없다 — 배열 전체 비교
    AND name = NEW.name
    AND id <> NEW.id
    AND deleted_at IS NULL  -- 소프트 삭제된 형제의 옛 조건 형태가 살아있는 배지 수정을 막지 않게 함
    AND (condition_json->>'mission_reward')::boolean IS NOT TRUE  -- 형제 쪽도 동일 제외
    AND level IS NULL  -- ② v5: 무한레벨형 형제는 등급형 계열의 비교 기준에서 제외
    AND k = ANY(measurable_keys);

  IF sibling_keys IS NOT NULL AND sibling_keys <> new_keys THEN
    RAISE EXCEPTION '"%" 계열(%) 측정 조건 필드 불일치 — 기존 % / 신규 %',
      NEW.name, NEW.activity_types, sibling_keys, new_keys;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 자체(BEFORE INSERT OR UPDATE OF name, activity_types, condition_json / WHEN type='activity')는
-- 128이 만든 것을 그대로 쓴다 — 함수만 교체했다. 128을 실행하지 않은 환경을 위해 없을 때만 만든다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'badges_family_consistency' AND tgrelid = 'public.badges'::regclass
  ) THEN
    CREATE TRIGGER badges_family_consistency
      BEFORE INSERT OR UPDATE OF name, activity_types, condition_json ON public.badges
      FOR EACH ROW
      WHEN (NEW.type = 'activity')
      EXECUTE FUNCTION public.check_family_condition_consistency();
  END IF;
END $$;

-- ── D. 기존 207종 백필 — family_key · sort_order ───────────────────────────
--
-- 목적: badgeTree.ts의 하드코딩 배열 72개를 걷어내도 화면 순서가 **한 칸도 바뀌지 않게** 한다.
-- v5에서 이 207종은 폐기 예정이지만(티켓 0039), 그 전까지의 마이그레이션 검증용으로 필요하다.
--
-- 이 UPDATE는 name/activity_types/condition_json을 건드리지 않으므로 C절 트리거가 발동하지
-- 않는다(트리거 정의가 UPDATE OF 로 세 컬럼에 한정돼 있다).

-- D-1. family_key — 활동 배지 전체에 "{activity_type}:{name}"
UPDATE public.badges
SET family_key = activity_types[1] || ':' || name
WHERE type = 'activity'
  AND array_length(activity_types, 1) = 1
  AND family_key IS DISTINCT FROM (activity_types[1] || ':' || name);

-- D-2. sort_order — 계열 레일(1~8). badgeTree.ts ACTIVITY_BADGE_ORDER를 그대로 옮겼다.
--      같은 계열의 Common~Mystic 4장은 같은 값을 공유한다.
WITH family_order(activity_type, badge_name, ord) AS (
  VALUES
    ('walking','동네 산책러',1),('walking','산책의 명상가',2),('walking','루틴의 수호자',3),
    ('walking','작심삼일의 파괴자',4),('walking','밤의 보행자',5),('walking','이달의 산책왕',6),
    ('walking','새벽 루틴 마스터',7),('walking','점심 산책러',8),
    ('running','첫 숨결',1),('running','리듬의 발견',2),('running','지구력의 전사',3),
    ('running','달리기의 루틴',4),('running','달리기의 연결',5),('running','이달의 주자왕',6),
    ('running','스피드 엔듀러',7),('running','주말 파이터',8),
    ('cycling','두 바퀴의 시작',1),('cycling','페달의 리듬',2),('cycling','장거리 항속',3),
    ('cycling','언덕의 도전자',4),('cycling','사이클 루틴',5),('cycling','이달의 그란폰도',6),
    ('cycling','산악 라이더',7),('cycling','계절 라이더',8),
    ('hiking','첫 고도',1),('hiking','산자락의 첫발',2),('hiking','주말 등산가',3),
    ('hiking','산행의 깊이',4),('hiking','혹한의 등반자',5),('hiking','이달의 정복자',6),
    ('hiking','혹한 장정',7),('hiking','주말 등반자',8),
    ('trail_running','야생의 첫발',1),('trail_running','수직의 도전',2),('trail_running','야생의 주자',3),
    ('trail_running','트레일 루틴',4),('trail_running','혹한의 트레일러',5),('trail_running','이달의 야생왕',6),
    ('trail_running','알파인 트레일러',7),('trail_running','새벽 야생인',8)
)
UPDATE public.badges b
SET sort_order = f.ord
FROM family_order f
WHERE b.type = 'activity'
  AND b.activity_types[1] = f.activity_type
  AND b.name = f.badge_name
  AND b.sort_order IS DISTINCT FROM f.ord;

-- D-3. sort_order — 독립 발급 배지(D01~D11 + 트로피 매트릭스, 걷기 전용 32종)는 101~132.
--      badgeTree.ts INDEPENDENT_BADGE_ORDER를 그대로 옮겼다(T19·T21은 설계 단계 제외로 결번).
--      계열 레일(1~8)보다 뒤 번호를 쓰는 이유: 한 종목의 배지를 sort_order로만 정렬해도
--      "계열 레일 먼저, 독립 배지 그리드 나중"이라는 현재 화면 순서가 그대로 나온다.
WITH independent_order(badge_name, ord) AS (
  VALUES
    -- D01~D11 — 누적 걷기 일수 체크포인트
    ('첫 발자국',101),('일주일의 증인',102),('이주의 리듬',103),('한 달의 산책자',104),
    ('두 달째 걷는 사람',105),('백일의 걸음',106),('반년의 동행',107),('일 년의 발자취',108),
    ('오백일의 산책자',109),('칠백일의 순례자',110),('천일의 방랑자',111),
    -- 트로피 매트릭스 — T01~T18·T20·T22·T23
    ('숫자의 노예',112),('그냥 좀 걸었을 뿐',113),('만보왕',114),('걸음의 구도자',115),
    ('주말의 신도',116),('월요병 극복자',117),('불금은 없다',118),('평일의 성실함',119),
    ('일요일 새벽의 수도승',120),('불타는 금요일 밤 산책',121),('월요일 점심의 도피',122),
    ('폭염 속의 걸음',123),('영하 15도의 산책자',124),('그냥 좀 더웠음',125),
    ('사계절의 발걸음',126),('봄에만 걷는 사람',127),('겨울잠 안 자는 사람',128),
    ('1월의 다짐',129),('장마철의 의지',130),('하루종일 걸었다',131),('그냥 나갔다 옴',132)
)
UPDATE public.badges b
SET sort_order = i.ord
FROM independent_order i
WHERE b.type = 'activity'
  AND b.name = i.badge_name
  AND b.sort_order IS DISTINCT FROM i.ord;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 종류 판정 기준이 어긋난 행이 없어야 한다 (CHECK가 이미 막지만 재확인)
-- SELECT count(*) FROM public.badges WHERE (rarity IS NULL) <> (level IS NOT NULL);  -- 0
--
-- -- ② 활동 배지 중 family_key가 비어 있는 행 (activity_types 길이 1이 아닌 예외만 남아야 함)
-- SELECT id, name, activity_types FROM public.badges
--  WHERE type = 'activity' AND deleted_at IS NULL AND family_key IS NULL;
--
-- -- ③ sort_order가 0으로 남은 활동 배지 = 계열/독립 목록 어디에도 없던 이름
-- --    (mission_reward 15종은 트리에 그리지 않으므로 0으로 남는 것이 정상)
-- SELECT name, (condition_json->>'mission_reward')::boolean AS is_mission_reward, count(*)
--   FROM public.badges
--  WHERE type = 'activity' AND deleted_at IS NULL AND sort_order = 0
--  GROUP BY 1, 2 ORDER BY 1;
--
-- -- ④ 계열 하나가 서로 다른 sort_order를 갖고 있지 않은지 (등급 4장은 같은 값이어야 한다)
-- SELECT family_key, count(DISTINCT sort_order) FROM public.badges
--  WHERE type = 'activity' AND deleted_at IS NULL AND sort_order > 0
--  GROUP BY 1 HAVING count(DISTINCT sort_order) > 1;  -- 0행
--
-- -- ⑤ 기존 획득 이력이 전부 earn_count = 1 인지
-- SELECT earn_count, count(*) FROM public.user_activity_badges GROUP BY 1;  -- 1 하나만

-- ↩️ 롤백 DDL
--    ALTER TABLE public.user_activity_badges DROP CONSTRAINT IF EXISTS user_activity_badges_earn_history_is_array;
--    ALTER TABLE public.user_activity_badges DROP CONSTRAINT IF EXISTS user_activity_badges_earn_count_positive;
--    ALTER TABLE public.user_activity_badges DROP COLUMN IF EXISTS earn_history;
--    ALTER TABLE public.user_activity_badges DROP COLUMN IF EXISTS earn_count;
--    DROP INDEX IF EXISTS public.idx_badges_sort_order;
--    DROP INDEX IF EXISTS public.idx_badges_family_key;
--    ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_level_positive;
--    ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_rarity_level_exclusive;
--    UPDATE public.badges SET rarity = 'common' WHERE rarity IS NULL;  -- ← NOT NULL 복원 전 필수
--    ALTER TABLE public.badges ALTER COLUMN rarity SET NOT NULL;
--    ALTER TABLE public.badges DROP COLUMN IF EXISTS sort_order;
--    ALTER TABLE public.badges DROP COLUMN IF EXISTS family_key;
--    ALTER TABLE public.badges DROP COLUMN IF EXISTS level;
--    -- 트리거 함수는 128의 본문으로 되돌린다(128 파일 재실행).
