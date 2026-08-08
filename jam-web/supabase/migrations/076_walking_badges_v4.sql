-- ============================================================
-- Migration 076: 걷기 배지 체계 v4 — 누적 활동일수(D01~D11) +
--                트로피 매트릭스(T01~T18/T20/T22/T23) 신규 삽입
--
-- 배경:
--   기존 걷기 배지(W1~W8, migration 033)는 어뷰징(방치·짧은 반복)에
--   취약했다. 축1 게이트(진짜 걷기 판정, badge-engine 레벨) +
--   빈도 조건 하루 1회 상한을 신규 적용하고, 그 위에 신규 걷기 배지
--   31종(엄밀히는 D01~D11 11개 + 트로피 매트릭스 21개 = 32개. 원 기획
--   문서상 "20개"로 표기됐으나 실제 확정 목록은 T01~T18(18개)+T20+T22+T23(3개)
--   = 21개로, 표기 오류로 보임 — TEAM_FINDINGS.md 참고, 목록 자체는 그대로 반영)를 추가한다.
--
--   * 축1 게이트(최소거리 0.5km / 최소이동시간 10분 / 평균속도 2.0~8.0km/h)와
--     하루 1회 상한은 badge-engine 코드 레벨에서 전역 적용되므로
--     이 마이그레이션의 condition_json에는 명시하지 않는다.
--   * image_url은 아직 전용 이미지가 없어 기존 badges/ 폴더의 png를
--     placeholder로 재사용한다(무작위 선정).
--   * W1~W8은 이 마이그레이션에서 건드리지 않는다(이름·설명·조건값 불변).
-- ============================================================

BEGIN;

INSERT INTO public.badges
  (name, description, type, rarity, image_url, condition_json, activity_types, patch_available)
VALUES

-- ════════════════════════════════════════════════════════
-- D01~D11 — 누적 걷기 일수 체크포인트 (독립 배지, 성장티어 그룹 없음)
--   active_days_count = 축1 게이트 통과일의 누적 고유일수 (연속 아님)
-- ════════════════════════════════════════════════════════

  ('첫 발자국',
   '걸은 날이 3일 쌓였어요. 분실물 센터 999에도 아직 등록 안 될 만큼 작은 시작입니다.',
   'activity', 'common', '/badges/005.png',
   '{"activity_type":"walking","active_days_count":3}'::jsonb,
   '{walking}', false),

  ('일주일의 증인',
   '걸은 날 누적 7일. 무명(無名)의 트럭이 슬슬 당신 동선을 외울 때입니다.',
   'activity', 'common', '/badges/037.png',
   '{"activity_type":"walking","active_days_count":7}'::jsonb,
   '{walking}', false),

  ('이주의 리듬',
   '걸은 날 누적 14일. 플레이리스트 하나를 다 외울 만큼의 시간입니다.',
   'activity', 'common', '/badges/090.png',
   '{"activity_type":"walking","active_days_count":14}'::jsonb,
   '{walking}', false),

  ('한 달의 산책자',
   '걸은 날 누적 30일. 그루터기 살롱에 당신 이름이 조용히 오릅니다.',
   'activity', 'common', '/badges/098.png',
   '{"activity_type":"walking","active_days_count":30}'::jsonb,
   '{walking}', false),

  ('두 달째 걷는 사람',
   '걸은 날 누적 60일. 카본 앨리 단골들도 이 정도 꾸준함엔 지갑을 접습니다.',
   'activity', 'rare', '/badges/019.png',
   '{"activity_type":"walking","active_days_count":60}'::jsonb,
   '{walking}', false),

  ('백일의 걸음',
   '걸은 날 누적 100일. 매직 아워 25시를 백 번은 놓쳤어도 걸음은 놓치지 않았습니다.',
   'activity', 'rare', '/badges/060.png',
   '{"activity_type":"walking","active_days_count":100}'::jsonb,
   '{walking}', false),

  ('반년의 동행',
   '걸은 날 누적 180일. 오아시스 자판기 없이도 이만큼 버텼습니다.',
   'activity', 'rare', '/badges/048.png',
   '{"activity_type":"walking","active_days_count":180}'::jsonb,
   '{walking}', false),

  ('일 년의 발자취',
   '걸은 날 누적 365일. 블랙 트랙의 기록에 1년치 걸음이 새겨집니다.',
   'activity', 'legendary', '/badges/086.png',
   '{"activity_type":"walking","active_days_count":365}'::jsonb,
   '{walking}', false),

  ('오백일의 산책자',
   '걸은 날 누적 500일. 섬데이의 결계는 이미 당신에게 의미를 잃었습니다.',
   'activity', 'legendary', '/badges/090.png',
   '{"activity_type":"walking","active_days_count":500}'::jsonb,
   '{walking}', false),

  ('칠백일의 순례자',
   '걸은 날 누적 700일. 러너스 하이 근처에도 안 가고 이 경지에 닿았습니다.',
   'activity', 'mythic', '/badges/013.png',
   '{"activity_type":"walking","active_days_count":700}'::jsonb,
   '{walking}', false),

  ('천일의 방랑자',
   '걸은 날 누적 1000일. 화이트 룸이 마침내 문을 엽니다 — 천일의 방랑자에게.',
   'activity', 'mythic', '/badges/059.png',
   '{"activity_type":"walking","active_days_count":1000}'::jsonb,
   '{walking}', false),

-- ════════════════════════════════════════════════════════
-- 트로피 매트릭스 — 조건 전문 공개, 독립 배지 (성장티어 그룹 없음)
-- ════════════════════════════════════════════════════════

  ('숫자의 노예',
   '누적 10만 번 걷기. 분실물 센터 999도 이 정도 숫자는 처음 접수합니다.',
   'activity', 'common', '/badges/077.png',
   '{"activity_type":"walking","total_count":100000}'::jsonb,
   '{walking}', false),

  ('그냥 좀 걸었을 뿐',
   '누적 1,000번 걷기. 편의점 불빛 아래서만 몇 번을 지나쳤을지 모릅니다.',
   'activity', 'common', '/badges/064.png',
   '{"activity_type":"walking","total_count":1000}'::jsonb,
   '{walking}', false),

  ('만보왕',
   '누적 10,000번 걷기. 그루터기 살롱에서도 이 정도면 알아봅니다.',
   'activity', 'rare', '/badges/078.png',
   '{"activity_type":"walking","total_count":10000}'::jsonb,
   '{walking}', false),

  ('걸음의 구도자',
   '누적 30,000번 걷기. 블랙 트랙이 이 걸음의 무게를 인정합니다.',
   'activity', 'legendary', '/badges/003.png',
   '{"activity_type":"walking","total_count":30000}'::jsonb,
   '{walking}', false),

  ('주말의 신도',
   '일요일마다 걷기, 누적 1,000회. 매직 아워 25시조차 매주 당신을 기다립니다.',
   'activity', 'legendary', '/badges/066.png',
   '{"activity_type":"walking","day_of_week":"sunday","total_count":1000}'::jsonb,
   '{walking}', false),

  ('월요병 극복자',
   '월요일마다 걷기, 누적 500회. 카본 앨리도 월요일은 조용한데, 당신은 아닙니다.',
   'activity', 'rare', '/badges/056.png',
   '{"activity_type":"walking","day_of_week":"monday","total_count":500}'::jsonb,
   '{walking}', false),

  ('불금은 없다',
   '금요일마다 걷기, 누적 100회. 180 BPM 대신 당신의 발소리가 금요일의 비트입니다.',
   'activity', 'common', '/badges/074.png',
   '{"activity_type":"walking","day_of_week":"friday","total_count":100}'::jsonb,
   '{walking}', false),

  ('평일의 성실함',
   '월요일부터 금요일까지 각각 누적 300회 걷기. 화이트 룸이 이 성실함 앞에 문을 엽니다.',
   'activity', 'mythic', '/badges/048.png',
   '{"activity_type":"walking","day_of_week":["monday","tuesday","wednesday","thursday","friday"],"total_count":300}'::jsonb,
   '{walking}', false),

  ('일요일 새벽의 수도승',
   '일요일 새벽 5~8시 걷기, 누적 300회. 섬데이의 결계도 이 시간엔 아직 잠들어 있습니다.',
   'activity', 'common', '/badges/080.png',
   '{"activity_type":"walking","day_of_week":"sunday","time_range":{"start":"05:00","end":"08:00"},"total_count":300}'::jsonb,
   '{walking}', false),

  ('불타는 금요일 밤 산책',
   '금요일 밤 10시~새벽 5시 걷기, 누적 50회. 오아시스 자판기 불빛만이 유일한 동행입니다.',
   'activity', 'rare', '/badges/071.png',
   '{"activity_type":"walking","day_of_week":"friday","time_range":{"start":"22:00","end":"05:00"},"total_count":50}'::jsonb,
   '{walking}', false),

  ('월요일 점심의 도피',
   '월요일 낮 12~2시 걷기, 누적 200회. 무명(無名) 트럭이라도 있었으면 완벽했을 도피입니다.',
   'activity', 'rare', '/badges/097.png',
   '{"activity_type":"walking","day_of_week":"monday","time_range":{"start":"12:00","end":"14:00"},"total_count":200}'::jsonb,
   '{walking}', false),

  ('폭염 속의 걸음',
   '기온 33도 이상에서 걷기 5회. 아스팔트 레인저들이 반색할 인터벌 트레이닝 날씨입니다.',
   'activity', 'rare', '/badges/056.png',
   '{"activity_type":"walking","temperature_min_c":33,"total_count":5}'::jsonb,
   '{walking}', false),

  ('영하 15도의 산책자',
   '기온 영하 15도 이하에서 걷기 3회. 그루터기 살롱의 다람쥐들도 이 추위엔 굴 밖을 안 나옵니다.',
   'activity', 'legendary', '/badges/051.png',
   '{"activity_type":"walking","temperature_max_c":-15,"total_count":3}'::jsonb,
   '{walking}', false),

  ('그냥 좀 더웠음',
   '기온 30도 이상에서 걷기 누적 100회. 전해질 캔디 하나 없이 버틴 여름입니다.',
   'activity', 'common', '/badges/023.png',
   '{"activity_type":"walking","temperature_min_c":30,"total_count":100}'::jsonb,
   '{walking}', false),

  ('사계절의 발걸음',
   '봄·여름·가을·겨울 각 10회씩 걷기. 종이 지도 한 장으로 사계절을 다 돌은 셈입니다.',
   'activity', 'legendary', '/badges/008.png',
   '{"activity_type":"walking","season_count_all":10}'::jsonb,
   '{walking}', false),

  ('봄에만 걷는 사람',
   '봄철에만 누적 200회 걷기. 노을 헌터들이 봄에만 문을 여는 이유를 알 것 같습니다.',
   'activity', 'rare', '/badges/014.png',
   '{"activity_type":"walking","season":"spring","season_count":200}'::jsonb,
   '{walking}', false),

  ('겨울잠 안 자는 사람',
   '겨울철에 누적 100회 걷기. 초경량 패딩 하나면 카본 앨리 사람들도 인정할 겨울입니다.',
   'activity', 'common', '/badges/016.png',
   '{"activity_type":"walking","season":"winter","season_count":100}'::jsonb,
   '{walking}', false),

  ('1월의 다짐',
   '1월 한 달 100km 걷기. 내일의 러너가 되지 않으려는 첫 번째 저항입니다.',
   'activity', 'common', '/badges/049.png',
   '{"activity_type":"walking","month":1,"monthly_km":100}'::jsonb,
   '{walking}', false),

  ('장마철의 의지',
   '장마철(6~7월) 한 달 150km 걷기. 빗소리마저 180 BPM처럼 들리는 한 달이었을 겁니다.',
   'activity', 'legendary', '/badges/020.png',
   '{"activity_type":"walking","month":[6,7],"monthly_km":150}'::jsonb,
   '{walking}', false),

  ('하루종일 걸었다',
   '단일 활동 300분 이상 걷기. 러너스 하이는 몰라도, 그 근처까지는 가봤을 시간입니다.',
   'activity', 'rare', '/badges/013.png',
   '{"activity_type":"walking","duration_minutes":300}'::jsonb,
   '{walking}', false),

  ('그냥 나갔다 옴',
   '단일 활동 0.6km 걷기. 낡은 물건 줍듯 우연히 주운 배지, 이유는 아무도 모릅니다.',
   'activity', 'legendary', '/badges/021.png',
   '{"activity_type":"walking","distance_km":0.6}'::jsonb,
   '{walking}', false);

COMMIT;
