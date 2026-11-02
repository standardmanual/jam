-- 311: ops_patterns에 주제(topic)와 각도(angles) 칸을 더한다 (티켓 20261102_1600, 사용자 지시 2026-11-02)
--
-- 배경: 홈피드 기획을 «주제를 정해 두고 그날의 상황에 맞춰 세부 컨텐츠를 정한다»는 방식으로 바꾼다. 주제와 각도는 별도 메뉴가 아니라
--   패턴 사전(이름은 «패턴»으로 바꾼다) 안에 통합한다. 기존 패턴 18개는 «왜 재미있는가»를 담은 원리형으로 그대로 두고(topic이 NULL),
--   주제 패턴은 한 주제(체크인과 장소, 드랍과 픽업, 러닝, 동네 한 바퀴 같은 묶음 주제 등)를 한 행으로 두고 샘플 각도를 `angles`에 담는다.
--
-- 설계:
--   - 추가만 하는 확장 마이그레이션이다(`db-migration-rules.md` §1). 기존 행과 코드는 바뀌지 않는다.
--   - `topic`: 주제 이름표. 서비스 기능·종목은 트렌드 자료 폴더의 슬러그(`service/mix`, `sports/run`)를 쓰고, 체크인 장소 전체는 `places`,
--     여러 주제를 묶은 주제는 `bundle/<이름>`이다. NULL이면 원리형 패턴이다.
--   - `angles`: 샘플 각도 목록(JSON 배열). 한 개는 `{ "type": "소개|유도|미션|큐레이션|현황|회고|이야기", "title": "...", "note": "...", "needs": ["places", ...] }`다.
--     목록은 예시일 뿐 닫힌 목록이 아니다(에이전트가 재료와 트렌드로 새 각도를 만든다). `needs`는 윤진이 그 각도를 기획하려면 읽어야 하는 재료다.
--   - `updated_at`은 앱이 직접 갱신한다(트리거 없음, 210과 같다).
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS · CREATE INDEX IF NOT EXISTS.
--
-- 되돌림 SQL(적용 전 확인용, 이 파일이 만든 것만 지운다):
--   DROP INDEX IF EXISTS public.ops_patterns_topic_idx;
--   ALTER TABLE public.ops_patterns DROP CONSTRAINT IF EXISTS ops_patterns_angles_check;
--   ALTER TABLE public.ops_patterns DROP COLUMN IF EXISTS angles, DROP COLUMN IF EXISTS topic;

BEGIN;

ALTER TABLE public.ops_patterns
  ADD COLUMN IF NOT EXISTS topic  TEXT  NULL,
  ADD COLUMN IF NOT EXISTS angles JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.ops_patterns DROP CONSTRAINT IF EXISTS ops_patterns_angles_check;
ALTER TABLE public.ops_patterns
  ADD CONSTRAINT ops_patterns_angles_check CHECK (jsonb_typeof(angles) = 'array');

CREATE INDEX IF NOT EXISTS ops_patterns_topic_idx
  ON public.ops_patterns (topic)
  WHERE topic IS NOT NULL;

COMMENT ON COLUMN public.ops_patterns.topic IS
  '주제 이름표. 서비스 기능·종목은 트렌드 자료 폴더 슬러그(service/mix, sports/run), 체크인 장소 전체는 places, 묶음 주제는 bundle/<이름>. NULL이면 원리형 패턴.';
COMMENT ON COLUMN public.ops_patterns.angles IS
  '샘플 각도 목록(JSON 배열). 각 항목 { type, title, note, needs[] }. 예시일 뿐 닫힌 목록이 아니다.';

COMMIT;
