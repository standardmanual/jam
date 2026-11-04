-- 319: 미션 6개와 홈피드 카드 6건의 문구를 새 규칙으로 바꾼다 (티켓 20261104_2314 3-C, 상위 20261104_2146)
--
-- 새 규칙(사용자 결정 2026-11-04):
--   - 미션 설명·카드 설명은 보상(포인트·잼·배지)과 조건 수량을 쓰지 않고 유저 입장의 재미를 쓴다.
--   - 달성 조건은 화면이 조건 데이터와 지표 라벨(`badge_metric_labels`)로 불릿을 만든다. 긴 `condition_text` 문장은 비운다.
--   - 「동기화 1회」는 조건 데이터(`sync_count`)로 둔다(2회차, 티켓 20261104_2234).
--   - 새 문구는 윤진 초안을 사용자가 그대로 확정했다(미션명은 바꾸지 않는다).
--
-- 안전장치:
--   - 갱신 전 옛 행 전체를 `mission_copy_backup_20261104`에 남긴다(되돌림 SQL이 여기서 복원한다).
--   - 행은 «id + 제목 + 옛 문구»가 모두 일치할 때만 갱신한다. 어드민에서 그 사이 고쳤다면 건드리지 않는다.
--   - 갱신 건수가 기대와 다르면 예외로 통째로 되돌린다(미션 6, `sync_count` 1, 카드 6).
-- 실행 순서: 318(라벨 시드)과 3-A 코드(불릿 확장)가 staging에 배포된 **뒤**에 실행한다.
--   먼저 실행하면 `condition_text`가 비어 불릿 없이 기본 문구가 보인다.
-- 대표 이미지에 구워진 문구는 이 SQL이 바꾸지 않는다(이미지 교체는 별도 승인).
-- 실행은 카리나가 한다(롤백 드라이런 → 적용 → 읽기 전용 확인).

BEGIN;

CREATE TABLE IF NOT EXISTS public.mission_copy_backup_20261104 (
  kind TEXT NOT NULL,
  row_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, row_id)
);
ALTER TABLE public.mission_copy_backup_20261104 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.mission_copy_backup_20261104 IS
  '319(미션 카피 개편) 되돌림용 백업(티켓 20261104_2314). kind=mission|today_card, snapshot은 갱신 전 행 전체다. 문제가 없으면 지운다. 서버(service role)만 읽고 쓴다.';

INSERT INTO public.mission_copy_backup_20261104 (kind, row_id, snapshot)
SELECT 'mission', m.id, to_jsonb(m) FROM public.missions m
 WHERE m.id IN (
   '0766b21d-b1e8-419e-ae77-5002ce9b08a3','2998a5bd-87f0-4351-a34a-b15afcc3f4a2','662960dd-6506-4690-871b-8ab1e476622c',
   'e66f802f-dd8c-4d4f-97f2-3cd1cec2a3cf','f44c6284-3961-4ab3-b122-926f8e953bca','492d7cc8-e9c3-47e7-8c80-5f3a601b758a')
ON CONFLICT (kind, row_id) DO NOTHING;

INSERT INTO public.mission_copy_backup_20261104 (kind, row_id, snapshot)
SELECT 'today_card', c.id, to_jsonb(c) FROM public.today_cards c
 WHERE c.id IN (
   '741d421c-6b16-4709-b2ed-7deaa4a28064','391b8638-5bee-4797-af59-3b243f05c5d5','4e3d6299-f314-453e-b975-7580e3f2837b',
   '626c1e62-1726-4b4c-a0e6-235f952e9b85','ab48df93-b5a1-4745-bb04-427888914a3e','6fb9152d-46f8-4e54-ac75-b361f2dba373')
ON CONFLICT (kind, row_id) DO NOTHING;

DO $$
DECLARE n INT;
BEGIN
  -- ① 미션 설명 6건 + 긴 달성 조건 문장 비우기
  WITH upd(id, title, old_desc, new_desc) AS (VALUES
    ('0766b21d-b1e8-419e-ae77-5002ce9b08a3'::uuid, '지하철 역에서 만나는 행운',
     '활동하다가 처음 가는 역 두 곳을 지나가 봐요. 새 체크인 배지 2개를 획득하면 20포인트를 받아요.',
     '무심코 지나치던 노선에서 처음 가는 역을 만나는 날이에요. 활동하다 스친 그 역이 체크인 배지가 돼요.'),
    ('2998a5bd-87f0-4351-a34a-b15afcc3f4a2'::uuid, '처음 오른 산에서의 한 걸음',
     '활동하다가 처음 가는 산 한 곳을 지나가기만 해도 20포인트를 획득해요.',
     '아직 안 가 본 산이 마음에 걸렸다면, 가을빛이 남은 산길을 걸어 봐요. 올라간 길 끝에서 산 체크인 배지가 반겨 줘요.'),
    ('662960dd-6506-4690-871b-8ab1e476622c'::uuid, '쌀쌀한 날의 짧은 산책',
     '날이 쌀쌀해진 요즘 10분 이상 걷고 동기화해 봐요. 3번이면 10포인트를 획득해요.',
     '외투 깃을 올리고 동네를 돌고 오면 몸이 금세 따뜻해져요. 오래 걷지 않아도 충분한 쌀쌀한 날의 산책이에요.'),
    ('e66f802f-dd8c-4d4f-97f2-3cd1cec2a3cf'::uuid, '드랍하고, 픽업하고, 이어가기',
     '아이템 배지를 한 번 드랍하고 한 번 픽업한 뒤 동기화하면 10포인트를 획득해요.',
     '아이템 배지를 장소에 드랍하면 다음에 들를 누군가에게 작은 선물이 돼요. 다른 사람이 드랍한 배지를 픽업하면 내 하루에도 뜻밖의 만남이 이어져요.'),
    ('f44c6284-3961-4ab3-b122-926f8e953bca'::uuid, '활동 두 번이면 충분해요',
     '참가한 뒤 활동을 두 번 동기화하면 10포인트를 획득해요.',
     '바쁜 주에도 짬이 나는 날은 있어요. 걷든 달리든 가볍게 나갔다 오면 내 활동 기록이 차곡차곡 쌓여요.'),
    ('492d7cc8-e9c3-47e7-8c80-5f3a601b758a'::uuid, '걷다 보면 어느새 10km',
     '참가한 뒤 이번 주 걷기 거리를 모아 10km를 채우면 20포인트를 획득해요.',
     '걸음은 말없이 쌓이는 편이에요. 점심 산책도 퇴근길도 더해지면 돌아봤을 때 꽤 멀리 와 있어요.')
  )
  UPDATE public.missions m
     SET description = u.new_desc, condition_text = NULL
    FROM upd u
   WHERE m.id = u.id AND m.title = u.title AND m.description = u.old_desc;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION '319: 미션 갱신 건수가 6이 아니에요(%). 어드민에서 문구가 바뀌었는지 확인해 주세요.', n; END IF;

  -- ② 「드랍하고, 픽업하고, 이어가기」에 동기화 1회 조건을 더한다
  UPDATE public.missions
     SET condition_json = condition_json || '{"sync_count": 1}'::jsonb
   WHERE id = 'e66f802f-dd8c-4d4f-97f2-3cd1cec2a3cf' AND NOT (condition_json ? 'sync_count');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '319: sync_count 추가 건수가 1이 아니에요(%).', n; END IF;

  -- ③ 홈피드 카드 설명 6건
  WITH upd(id, title, old_desc, new_desc) AS (VALUES
    ('741d421c-6b16-4709-b2ed-7deaa4a28064'::uuid, '지하철 역에서 만나는 행운',
     '활동하다가 처음 가는 역 두 곳을 지나가면 20포인트를 획득해요.',
     '평소 안 가던 길에서 처음 만나는 역이 체크인 배지로 남아요.'),
    ('391b8638-5bee-4797-af59-3b243f05c5d5'::uuid, '처음 오른 산에서의 한 걸음',
     '이번 주에 처음 가는 산 한 곳을 지나가면 20포인트를 획득해요.',
     '아직 안 가 본 산길에서 가을빛과 산 체크인 배지를 만나 봐요.'),
    ('4e3d6299-f314-453e-b975-7580e3f2837b'::uuid, '쌀쌀한 날의 짧은 산책',
     '날이 쌀쌀해진 요즘 10분 이상 걷고 동기화를 3번 하면 10포인트를 획득해요.',
     '쌀쌀한 요즘은 외투 깃을 올리고 가볍게 걷는 맛이 있어요.'),
    ('626c1e62-1726-4b4c-a0e6-235f952e9b85'::uuid, '드랍하고, 픽업하고, 이어가기',
     '아이템 배지를 한 번 드랍하고 한 번 픽업한 뒤 동기화하면 10포인트를 획득해요.',
     '아이템 배지를 드랍하고 픽업하며 누군가와 슬쩍 이어지는 하루예요.'),
    ('ab48df93-b5a1-4745-bb04-427888914a3e'::uuid, '이번 주엔 두 번만 나와요',
     '참가한 뒤 활동 두 번을 동기화하면 10포인트를 획득해요.',
     '바쁜 주에도 짬 나는 날엔 가볍게 나갔다 오기 좋아요.'),
    ('6fb9152d-46f8-4e54-ac75-b361f2dba373'::uuid, '10km, 걸어서 채워 볼까요',
     '참가한 뒤 이번 주 걷기 거리를 모아 10km를 채우면 20포인트를 획득해요.',
     '점심 산책도 퇴근길도 모아 보면 꽤 멀리 걸어온 길이 보여요.')
  )
  UPDATE public.today_cards c
     SET description = u.new_desc
    FROM upd u
   WHERE c.id = u.id AND c.title = u.title AND c.description = u.old_desc;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION '319: 카드 갱신 건수가 6이 아니에요(%). 어드민에서 문구가 바뀌었는지 확인해 주세요.', n; END IF;
END $$;

COMMIT;

-- 되돌림 SQL (백업 표에서 복원. 갱신한 칸만 되돌린다)
-- UPDATE public.missions m
--    SET description = b.snapshot->>'description',
--        condition_text = b.snapshot->>'condition_text',
--        condition_json = (b.snapshot->'condition_json')
--   FROM public.mission_copy_backup_20261104 b
--  WHERE b.kind = 'mission' AND b.row_id = m.id;
-- UPDATE public.today_cards c
--    SET description = b.snapshot->>'description'
--   FROM public.mission_copy_backup_20261104 b
--  WHERE b.kind = 'today_card' AND b.row_id = c.id;
-- -- 문제가 없다고 확인된 뒤 백업 표는 지운다: DROP TABLE public.mission_copy_backup_20261104;
