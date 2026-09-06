-- 138_badge_rarity_descriptions.sql
-- 액티비티 배지 등급별 설명 분화 — 티켓 20260906_1305
--
-- 왜: v5 시딩(seed_v5_activity_badges.sql)은 계열당 설명 1개를 4등급(또는 8레벨) 행에
--     그대로 복사했다. 「오늘의 한 걸음」은 누적 1일도 300일도 같은 문장을 읽는다.
--     DB 실측 2026-09-06: v5 194계열 630행 전 계열이 계열 내 설명 1종이었다.
--
-- 무엇: 2행 이상인 v5 액티비티 계열 131개 · 436행의 description을 등급/레벨별 문장으로
--       바꾼다. **최저 등급(또는 Lv1) 행은 건드리지 않는다** — 현행 문장이
--       라이팅 가이드 §07의 Common 정본이다.
--       정본: Service Plan/Specs/Content/v5_catalog_writing.json 의 「등급별설명」
--       (이 파일은 v5_seed_build.py가 낸 rows.json과 같은 데이터에서 생성했다)
--
-- ⚠️ UPDATE만 한다. DELETE·재시딩을 하지 않는다 —
--    user_activity_badges가 badges.id를 참조하므로 행을 지우면 유저 소유가 끊긴다.
-- ⚠️ 대상은 v5 액티비티 배지뿐이다. v4 레거시 87계열 207행은 폐기 예정이라 손대지 않는다.
--    family_key + (rarity 또는 level)로만 지정하므로 id에 의존하지 않는다(멱등).

BEGIN;

DO $$
DECLARE
  updated_count INT;
BEGIN
  WITH v(family_key, rarity, level, description) AS (
    VALUES
      -- walking:K1
      ('walking:K1'::TEXT, NULL::badge_rarity, 2::INT, '짧은 구간들이 모여 처음 보는 길이가 되었습니다.'),
      ('walking:K1', NULL, 3, '지나온 자리가 이제 하나의 지도로 이어집니다.'),
      ('walking:K1', NULL, 4, '지도 위에 남은 선이 도시의 크기를 넘어섭니다.'),
      ('walking:K1', NULL, 5, '두 발로 닿을 수 있는 범위가 다시 넓어졌습니다.'),
      ('walking:K1', NULL, 6, '여기서부터는 거리를 세는 단위가 달라집니다.'),
      ('walking:K1', NULL, 7, '이 정도는 한 장의 지도에 담기지 않습니다.'),
      ('walking:K1', NULL, 8, '화이트 룸은 이만큼을 남긴 발자국을 압니다.'),
      -- walking:K3
      ('walking:K3', NULL, 2, '달력에 표시된 날들이 서로 이어지기 시작합니다.'),
      ('walking:K3', NULL, 3, '빈 칸보다 채워진 칸이 많아졌습니다.'),
      ('walking:K3', NULL, 4, '날짜를 세는 일보다 세지 않는 일이 편해졌습니다.'),
      ('walking:K3', NULL, 5, '달력은 이미 오래된 습관의 기록입니다.'),
      ('walking:K3', NULL, 6, '이만큼의 날들은 의지만으로 설명되지 않습니다.'),
      -- walking:P1
      ('walking:P1', 'rare', NULL, '하루씩 쌓은 것들이 어느새 무시할 수 없는 부피가 되었습니다.'),
      ('walking:P1', 'epic', NULL, '매일이라는 말은 결심이 아니라 상태가 되었습니다.'),
      ('walking:P1', 'mystic', NULL, '하루를 거르지 않는 일은 재능이 아니라 성품입니다.'),
      -- walking:P2
      ('walking:P2', 'rare', NULL, '지켜진 주가 늘어날수록 약속은 가벼워집니다.'),
      ('walking:P2', 'epic', NULL, '주 단위의 약속을 어긴 기억이 잘 떠오르지 않습니다.'),
      ('walking:P2', 'mystic', NULL, '약속이라 부르지 않아도 지켜지는 일이 있습니다.'),
      -- walking:P3
      ('walking:P3', 'rare', NULL, '월말에 확인하는 총량이 점점 커집니다.'),
      ('walking:P3', 'epic', NULL, '한 달의 합계는 하루의 성실을 숨기지 못합니다.'),
      ('walking:P3', 'mystic', NULL, '달이 바뀌어도 총량이 내려앉는 일이 없습니다.'),
      -- walking:P4
      ('walking:P4', 'rare', NULL, '그루터기 살롱은 계절마다 돌아오는 손님을 압니다.'),
      ('walking:P4', 'epic', NULL, '한 계절을 통째로 넘긴 기록이 여러 겹으로 쌓였습니다.'),
      ('walking:P4', 'mystic', NULL, '계절은 이 사람의 걸음을 막아 세우지 못합니다.'),
      -- walking:A1
      ('walking:A1', 'rare', NULL, '날짜가 바뀌는 자리를 여러 번 지나면 그 틈도 하나의 길이 됩니다.'),
      ('walking:A1', 'epic', NULL, '하루의 이음매는 이제 낯선 시간이 아니라 익숙한 구역입니다.'),
      ('walking:A1', 'mystic', NULL, '화이트 룸은 두 날 사이에 서 있던 사람을 알아봅니다.'),
      -- walking:A2
      ('walking:A2', 'epic', NULL, '아침과 밤을 한 날에 이어 붙이는 일이 익숙해졌습니다.'),
      ('walking:A2', 'mystic', NULL, '하루의 양 끝을 쥔 사람에게 시간은 두 번 흐릅니다.'),
      -- walking:A3
      ('walking:A3', 'epic', NULL, '흔들어 본 시간대가 늘수록 정해진 시간이라는 말이 흐려집니다.'),
      ('walking:A3', 'mystic', NULL, '어느 시간에 나서든 몸이 먼저 준비를 끝냅니다.'),
      -- walking:A4
      ('walking:A4', 'epic', NULL, '하루를 여러 조각으로 나눠 쓰는 방법을 몸이 익혔습니다.'),
      ('walking:A4', 'mystic', NULL, '하루라는 단위가 이 사람 앞에서는 늘 모자랍니다.'),
      -- walking:A5
      ('walking:A5', 'epic', NULL, '평일이라는 틀이 흐트러지지 않은 채 몇 주를 건너갔습니다.'),
      ('walking:A5', 'mystic', NULL, '요일에 기대지 않는 리듬은 쉽게 무너지지 않습니다.'),
      -- walking:A6
      ('walking:A6', 'epic', NULL, '달력의 첫 칸이 비어 있는 달이 좀처럼 없습니다.'),
      ('walking:A6', 'mystic', NULL, '새 달의 첫 자리는 늘 같은 이름으로 채워져 있습니다.'),
      -- walking:A8
      ('walking:A8', 'epic', NULL, '블랙 트랙의 새벽 구간은 이 사람의 발소리로 열립니다.'),
      ('walking:A8', 'mystic', NULL, '해 뜨기 전의 도시에는 주인이 따로 있습니다.'),
      -- walking:A9
      ('walking:A9', 'rare', NULL, '그루터기 살롱의 불빛이 늦은 걸음을 알아봅니다.'),
      ('walking:A9', 'epic', NULL, '블랙 트랙의 밤 구역에 이름이 남습니다.'),
      ('walking:A9', 'mystic', NULL, '화이트 룸은 밤을 지배하는 자를 기억합니다.'),
      -- walking:A10
      ('walking:A10', 'rare', NULL, '점심의 짧은 틈을 매번 되찾아 오는 사람이 있습니다.'),
      ('walking:A10', 'epic', NULL, '하루 한가운데 뚫어 둔 틈을 누구도 건드리지 못합니다.'),
      ('walking:A10', 'mystic', NULL, '정오의 짧은 틈을 온전히 자기 몫으로 만들었습니다.'),
      -- walking:D0
      ('walking:D0', 'rare', NULL, '일요일마다 같은 자리에서 한 주를 정리합니다.'),
      ('walking:D0', 'epic', NULL, '주말의 마지막 칸은 오래전부터 예약되어 있었습니다.'),
      ('walking:D0', 'mystic', NULL, '일요일이라는 요일이 통째로 한 사람에게 넘어갔습니다.'),
      -- walking:D1
      ('walking:D1', 'rare', NULL, '한 주의 첫 칸이 더는 가장 무거운 자리가 아닙니다.'),
      ('walking:D1', 'epic', NULL, '월요일이 가벼워지면 나머지 요일도 따라 가벼워집니다.'),
      ('walking:D1', 'mystic', NULL, '주가 시작되는 자리마다 같은 발자국이 찍혀 있습니다.'),
      -- walking:D2
      ('walking:D2', 'rare', NULL, '금요일 저녁의 선택지는 오래전에 하나로 줄었습니다.'),
      ('walking:D2', 'epic', NULL, '주말로 넘어가는 문턱에서 속도를 늦추는 법이 없습니다.'),
      ('walking:D2', 'mystic', NULL, '흘려보내지 않은 금요일 밤이 촘촘히 쌓여 있습니다.'),
      -- walking:D3
      ('walking:D3', 'epic', NULL, '빠진 요일 없는 한 주가 여러 번 반복되었습니다.'),
      ('walking:D3', 'mystic', NULL, '평일이 통째로 채워진 주는 이제 특별한 일이 아닙니다.'),
      -- walking:S1
      ('walking:S1', 'rare', NULL, '사흘의 고비는 이제 지나가는 지점일 뿐입니다.'),
      ('walking:S1', 'epic', NULL, '시작과 포기 사이의 거리가 아주 멀어졌습니다.'),
      ('walking:S1', 'mystic', NULL, '그만두는 쪽이 오히려 어려운 사람이 있습니다.'),
      -- walking:S2
      ('walking:S2', 'epic', NULL, '한 번 붙은 리듬은 좀처럼 끊기지 않습니다.'),
      ('walking:S2', 'mystic', NULL, '습관이라는 말로는 부족한 자리에 와 있습니다.'),
      -- walking:S3
      ('walking:S3', 'mystic', NULL, '화이트 룸은 궤도를 벗어난 적 없는 사람에게 열립니다.'),
      -- walking:B1
      ('walking:B1', NULL, 2, '최고 기록이 한 번 더 뒤로 밀려났습니다.'),
      ('walking:B1', NULL, 3, '지난 기록을 넘어서는 일이 낯설지 않게 되었습니다.'),
      ('walking:B1', NULL, 4, '이제 겨루는 상대는 기록표의 맨 윗줄뿐입니다.'),
      ('walking:B1', NULL, 5, '기록을 고쳐 쓸 때마다 넘어야 할 선도 함께 올라갑니다.'),
      ('walking:B1', NULL, 6, '블랙 트랙의 기록판이 자주 고쳐 쓰입니다.'),
      ('walking:B1', NULL, 7, '스스로 세운 벽만 남았습니다.'),
      ('walking:B1', NULL, 8, '넘어설 상대가 더는 남아 있지 않습니다.'),
      -- walking:B2
      ('walking:B2', NULL, 2, '멈추고 싶어지는 지점이 조금씩 뒤로 밀립니다.'),
      ('walking:B2', NULL, 3, '오래 견디는 일에도 요령이 생겼습니다.'),
      ('walking:B2', NULL, 4, '시계를 보지 않아도 시간이 늘어납니다.'),
      ('walking:B2', NULL, 5, '길어진 시간은 체력보다 태도에서 나옵니다.'),
      ('walking:B2', NULL, 6, '끝을 정하지 않는 쪽이 더 멀리 갑니다.'),
      ('walking:B2', NULL, 7, '시간은 이제 한계가 아니라 재료입니다.'),
      ('walking:B2', NULL, 8, '머무는 법을 아는 사람에게 끝은 없습니다.'),
      -- walking:B3
      ('walking:B3', NULL, 2, '지난달의 기록이 이번 달의 출발선이 되었습니다.'),
      ('walking:B3', NULL, 3, '달이 바뀔 때마다 기준선도 함께 올라갑니다.'),
      ('walking:B3', NULL, 4, '지난달을 넘기는 일이 계획의 일부가 되었습니다.'),
      ('walking:B3', NULL, 5, '조금씩 올려 둔 선이 어느새 높은 곳에 있습니다.'),
      ('walking:B3', NULL, 6, '뒤를 돌아보면 지난달이 아득합니다.'),
      ('walking:B3', NULL, 7, '견줄 대상은 언제나 한 달 전의 자신뿐입니다.'),
      ('walking:B3', NULL, 8, '이 곡선은 아래로 꺾인 적이 없습니다.'),
      -- walking:B4
      ('walking:B4', NULL, 2, '평소의 폭을 벗어난 날이 한 번 더 생겼습니다.'),
      ('walking:B4', NULL, 3, '평균이라는 말이 점점 헐거워집니다.'),
      ('walking:B4', NULL, 4, '예외였던 날이 이제는 기준을 흔듭니다.'),
      ('walking:B4', NULL, 5, '평균은 더 이상 이 사람을 설명하지 못합니다.'),
      ('walking:B4', NULL, 6, '튀는 날이 잦아지면 그건 예외가 아닙니다.'),
      ('walking:B4', NULL, 7, '블랙 트랙은 평균 밖으로 나온 사람만 받아들입니다.'),
      ('walking:B4', NULL, 8, '평균이 뒤따라오느라 매번 늦습니다.'),
      -- walking:R1
      ('walking:R1', 'epic', NULL, '쉬는 날을 미리 정해 두는 사람이 오래 갑니다.'),
      ('walking:R1', 'mystic', NULL, '비워 둔 하루가 나머지 날들을 지탱합니다.'),
      -- walking:R2
      ('walking:R2', 'rare', NULL, '긴 하루 뒤의 공백이 자연스러운 순서가 되었습니다.'),
      ('walking:R2', 'epic', NULL, '회복은 미루는 일이 아니라 배치하는 일입니다.'),
      ('walking:R2', 'mystic', NULL, '무리와 회복 사이의 간격을 몸이 먼저 계산합니다.'),
      -- walking:R3
      ('walking:R3', 'epic', NULL, '쉬는 날을 지키는 데에도 규율이 필요합니다.'),
      ('walking:R3', 'mystic', NULL, '멈출 줄 아는 사람만 멀리까지 갑니다.'),
      -- walking:R4
      ('walking:R4', 'rare', NULL, '멀어졌다가 돌아오는 길을 이미 알고 있습니다.'),
      ('walking:R4', 'epic', NULL, '몇 번을 떠나도 결국 같은 자리로 돌아옵니다.'),
      -- walking:W1
      ('walking:W1', 'rare', NULL, '더위를 핑계로 삼지 않는 여름이 이어집니다.'),
      ('walking:W1', 'epic', NULL, '블랙 트랙은 한여름의 아스팔트 위에서 가장 선명해집니다.'),
      ('walking:W1', 'mystic', NULL, '폭염은 이 사람의 일정에서 아무것도 지우지 못합니다.'),
      -- walking:W2
      ('walking:W2', 'epic', NULL, '블랙 트랙의 겨울 구간은 견딘 사람만 통과합니다.'),
      ('walking:W2', 'mystic', NULL, '추위가 물러설 때까지 자리를 지킨 사람입니다.'),
      -- walking:W3
      ('walking:W3', 'mystic', NULL, '한 해의 어느 계절에도 빈자리가 없습니다.'),
      -- walking:W4
      ('walking:W4', 'mystic', NULL, '비가 그치기를 기다린 달은 한 번도 없습니다.'),
      -- running:K1
      ('running:K1', NULL, 2, '지나온 길이 지도 위에서 한 뼘쯤 늘었습니다.'),
      ('running:K1', NULL, 3, '익숙한 길만 돌아서는 이 길이가 나오지 않습니다.'),
      ('running:K1', NULL, 4, '도시 하나를 통째로 가로지른 길이입니다.'),
      ('running:K1', NULL, 5, '지도를 펴야 가늠이 되는 거리에 들어섰습니다.'),
      ('running:K1', NULL, 6, '여기부터는 거리를 세는 단위가 달라집니다.'),
      ('running:K1', NULL, 7, '지도 밖으로 나간 거리입니다.'),
      ('running:K1', NULL, 8, '여기까지 온 발에는 설명이 필요 없습니다.'),
      -- running:K3
      ('running:K3', NULL, 2, '나간 날이 안 나간 날보다 많아지기 시작합니다.'),
      ('running:K3', NULL, 3, '나갈지 말지를 고민하는 시간이 사라졌습니다.'),
      ('running:K3', NULL, 4, '이 정도 횟수는 마음이 아니라 몸이 쌓아 올립니다.'),
      ('running:K3', NULL, 5, '반복이 재능을 앞지른 자리입니다.'),
      ('running:K3', NULL, 6, '세는 일을 그만둔 사람만 여기 있습니다.'),
      -- running:P1
      ('running:P1', 'rare', NULL, '반복이 쌓이면 시계가 먼저 달라집니다.'),
      ('running:P1', 'epic', NULL, '블랙 트랙의 기록판은 이런 속도부터 이름을 받아 적습니다.'),
      ('running:P1', 'mystic', NULL, '여기서부터는 속도가 곧 그 사람의 이름입니다.'),
      -- running:L1
      ('running:L1', 'rare', NULL, '그릇의 크기가 한 번 늘어나면 되돌아가지 않습니다.'),
      ('running:L1', 'epic', NULL, '한 번에 이만큼 가는 일은 각오의 문제가 됩니다.'),
      ('running:L1', 'mystic', NULL, '화이트 룸은 끝까지 가본 사람에게만 문을 엽니다.'),
      -- running:C1
      ('running:C1', 'rare', NULL, '하루씩 쌓은 것이 이제 눈에 보이는 크기가 되었습니다.'),
      ('running:C1', 'epic', NULL, '빠짐없이 이어온 하루가 그 사람의 성격이 되었습니다.'),
      ('running:C1', 'mystic', NULL, '여기까지 하루를 지켜낸 이름은 지워지지 않습니다.'),
      -- running:C2
      ('running:C2', 'rare', NULL, '채운 주가 겹치기 시작하면 한 주의 모양이 달라집니다.'),
      ('running:C2', 'epic', NULL, '어떤 주가 와도 흔들리지 않는 리듬을 가졌습니다.'),
      ('running:C2', 'mystic', NULL, '한 주를 채우는 일은 더는 사건이 아닙니다.'),
      -- running:C3
      ('running:C3', 'rare', NULL, '달마다 남는 총량이 조금씩 무거워집니다.'),
      ('running:C3', 'epic', NULL, '한 달 치의 거리를 감당하는 몸은 따로 만들어집니다.'),
      ('running:C3', 'mystic', NULL, '이 정도의 달을 반복하는 몸은 이미 다른 종류입니다.'),
      -- running:C4
      ('running:C4', 'rare', NULL, '계절이 바뀌는 자리마다 같은 발자국이 겹칩니다.'),
      ('running:C4', 'epic', NULL, '여러 계절이 한 줄로 이어진 궤적이 남습니다.'),
      ('running:C4', 'mystic', NULL, '계절이 몇 번을 지나가도 이 기록은 자리를 지킵니다.'),
      -- running:T1
      ('running:T1', 'rare', NULL, '그루터기 살롱의 새벽 손님들은 서로를 알아봅니다.'),
      ('running:T1', 'epic', NULL, '첫차보다 먼저 움직이는 사람은 도시의 다른 얼굴을 봅니다.'),
      ('running:T1', 'mystic', NULL, '해가 뜨기 전의 도시는 이 사람의 것입니다.'),
      -- running:T2
      ('running:T2', 'rare', NULL, '불 꺼진 거리에도 익숙한 코스가 생겼습니다.'),
      ('running:T2', 'epic', NULL, '밤이 깊을수록 발이 가벼워지는 사람이 있습니다.'),
      ('running:T2', 'mystic', NULL, '밤을 자기 편으로 만든 사람은 아침을 기다리지 않습니다.'),
      -- running:T3
      ('running:T3', 'rare', NULL, '하루의 처음과 끝을 같은 신발로 지납니다.'),
      ('running:T3', 'epic', NULL, '낮과 밤 어느 쪽도 이 사람을 비켜 가지 않습니다.'),
      ('running:T3', 'mystic', NULL, '하루의 양 끝이 하나로 이어졌습니다.'),
      -- running:D1
      ('running:D1', 'rare', NULL, '월요일 아침을 두려워하지 않는 쪽이 되었습니다.'),
      ('running:D1', 'epic', NULL, '한 주의 첫날은 이 사람에게 늘 같은 자리입니다.'),
      ('running:D1', 'mystic', NULL, '월요일은 오래전부터 이 사람의 것입니다.'),
      -- running:D2
      ('running:D2', 'rare', NULL, '주말이 오면 어디까지 갈지부터 정합니다.'),
      ('running:D2', 'epic', NULL, '이 사람의 주말은 쉬는 날로 분류되지 않습니다.'),
      ('running:D2', 'mystic', NULL, '주말마다 도시 끝까지 다녀오는 일이 예삿일이 되었습니다.'),
      -- running:N1
      ('running:N1', 'rare', NULL, '무거운 아침이 반복되면 그것도 리듬이 됩니다.'),
      ('running:N1', 'epic', NULL, '사흘을 잇는 일에 더 이상 의지가 들지 않습니다.'),
      ('running:N1', 'mystic', NULL, '이어 붙인 사흘이 셀 수 없이 겹쳤습니다.'),
      -- running:N2
      ('running:N2', 'rare', NULL, '건너뛰지 않은 한 주가 다시 돌아옵니다.'),
      ('running:N2', 'epic', NULL, '하루도 비지 않은 주가 이 사람에게는 기본값입니다.'),
      -- running:N3
      ('running:N3', 'mystic', NULL, '여기서는 쉬었다는 기록조차 남지 않습니다.'),
      -- running:R1
      ('running:R1', NULL, 2, '어제를 한 번 넘어선 사람은 그 자리로 돌아가지 않습니다.'),
      ('running:R1', NULL, 3, '이기는 일이 우연이 아니라는 걸 확인했습니다.'),
      ('running:R1', NULL, 4, '넘어설 대상이 늘 자기 자신뿐입니다.'),
      ('running:R1', NULL, 5, '기록을 갈아 끼우는 일이 일상의 한 줄이 되었습니다.'),
      ('running:R1', NULL, 6, '한계라고 불렀던 자리가 이제 출발선입니다.'),
      ('running:R1', NULL, 7, '화이트 룸의 문은 이 지점에서 열립니다.'),
      ('running:R1', NULL, 8, '넘어설 것이 남아 있지 않습니다.'),
      -- running:R2
      ('running:R2', NULL, 2, '같은 길에서 초 단위가 줄어들기 시작합니다.'),
      ('running:R2', NULL, 3, '한 번 줄어든 시간은 다시 늘어나지 않습니다.'),
      ('running:R2', NULL, 4, '같은 거리가 매번 다른 시간으로 끝납니다.'),
      ('running:R2', NULL, 5, '시계를 이기는 방법을 몸이 외웠습니다.'),
      ('running:R2', NULL, 6, '더 줄일 곳을 찾아내는 눈이 생겼습니다.'),
      ('running:R2', NULL, 7, '같은 거리에서 뺏어올 시간이 얼마 남지 않았습니다.'),
      ('running:R2', NULL, 8, '이 시간을 다시 줄일 사람은 자신뿐입니다.'),
      -- running:R3
      ('running:R3', NULL, 2, '지난달을 넘기는 일이 한 번으로 끝나지 않았습니다.'),
      ('running:R3', NULL, 3, '달이 바뀔 때마다 기준선이 올라갑니다.'),
      ('running:R3', NULL, 4, '지난달의 자신은 이제 상대가 되지 않습니다.'),
      ('running:R3', NULL, 5, '늘어난 만큼을 감당하는 몸이 뒤따라왔습니다.'),
      ('running:R3', NULL, 6, '매달 올라가는 곡선을 스스로 그리고 있습니다.'),
      ('running:R3', NULL, 7, '이 상승을 계속 버티는 쪽이 더 어렵습니다.'),
      ('running:R3', NULL, 8, '비교할 지난달이 남아 있지 않습니다.'),
      -- running:X1
      ('running:X1', 'rare', NULL, '비워 둔 하루가 다음 며칠을 지탱합니다.'),
      ('running:X1', 'epic', NULL, '언제 멈춰야 하는지를 아는 쪽이 오래 갑니다.'),
      ('running:X1', 'mystic', NULL, '이 여백은 실수가 아니라 설계입니다.'),
      -- running:X2
      ('running:X2', 'rare', NULL, '먼 거리를 다녀온 다음 날까지가 하나의 계획에 들어 있습니다.'),
      ('running:X2', 'epic', NULL, '회복까지 계획에 넣은 사람은 무너지지 않습니다.'),
      -- running:X3
      ('running:X3', 'rare', NULL, '그루터기 살롱은 돌아온 사람에게 자리를 비워 둡니다.'),
      ('running:X3', 'epic', NULL, '몇 번을 멈춰도 다시 돌아오는 쪽이 결국 남습니다.'),
      -- running:W1
      ('running:W1', 'rare', NULL, '더위는 핑계 목록에서 빠진 지 오래입니다.'),
      ('running:W1', 'epic', NULL, '블랙 트랙은 폭염 속에서도 문을 닫지 않습니다.'),
      ('running:W1', 'mystic', NULL, '여름은 이 사람을 막지 못했습니다.'),
      -- running:W2
      ('running:W2', 'rare', NULL, '찬 공기에 맞는 옷차림과 시간대를 이미 압니다.'),
      ('running:W2', 'epic', NULL, '한파는 이 사람의 일정표를 바꾸지 못합니다.'),
      ('running:W2', 'mystic', NULL, '겨울이 길수록 이 사람의 기록은 두꺼워집니다.'),
      -- running:W3
      ('running:W3', 'mystic', NULL, '어느 계절도 이 사람을 쉬게 하지 못했습니다.'),
      -- running:H1
      ('running:H1', 'rare', NULL, '견딜 수 있는 자리에 스스로 머무는 법을 익혔습니다.'),
      ('running:H1', 'epic', NULL, '높은 심박을 오래 끌고 가는 일은 훈련의 영역입니다.'),
      ('running:H1', 'mystic', NULL, '화이트 룸은 심장이 한계에 닿는 순간을 기억합니다.'),
      -- running:H2
      ('running:H2', 'rare', NULL, '간격이 흐트러지는 순간을 스스로 알아차립니다.'),
      ('running:H2', 'epic', NULL, '리듬이 무너지지 않는 몸은 소리부터 다릅니다.'),
      ('running:H2', 'mystic', NULL, '이 박자는 이제 의식하지 않아도 유지됩니다.'),
      -- cycling:K1
      ('cycling:K1', NULL, 2, '지도 위에 지나온 자리가 눈에 보이기 시작합니다.'),
      ('cycling:K1', NULL, 3, '익숙한 길이 줄고 처음 보는 길이 늘어납니다.'),
      ('cycling:K1', NULL, 4, '지나온 길이가 도시 하나의 크기를 넘어섭니다.'),
      ('cycling:K1', NULL, 5, '이제 지명을 거리로 기억합니다.'),
      ('cycling:K1', NULL, 6, '지도의 축척을 바꿔야 전부 들어옵니다.'),
      ('cycling:K1', NULL, 7, '남은 길이 지나온 길보다 짧습니다.'),
      ('cycling:K1', NULL, 8, '거리는 더 이상 이 사람을 설명하지 못합니다.'),
      -- cycling:K2
      ('cycling:K2', NULL, 2, '오르막을 골라 나서는 날이 생깁니다.'),
      ('cycling:K2', NULL, 3, '그루터기 살롱의 단골들이 사는 높이에 닿습니다.'),
      ('cycling:K2', NULL, 4, '올라간 높이가 산맥의 단위로 세어집니다.'),
      ('cycling:K2', NULL, 5, '정상은 목적지가 아니라 통과 지점이 됩니다.'),
      ('cycling:K2', NULL, 6, '이 사람 위로 남은 높이가 많지 않습니다.'),
      -- cycling:K3
      ('cycling:K3', NULL, 2, '나서는 일이 결심에서 순서로 바뀝니다.'),
      ('cycling:K3', NULL, 3, '날씨를 확인하는 이유가 취소가 아니라 준비로 바뀝니다.'),
      ('cycling:K3', NULL, 4, '나섰다는 사실만으로 채워진 기록이 두꺼워집니다.'),
      ('cycling:K3', NULL, 5, '결심이라는 단어가 필요 없어집니다.'),
      ('cycling:K3', NULL, 6, '나서지 않은 날을 세는 편이 빠릅니다.'),
      -- cycling:P1
      ('cycling:P1', 'rare', NULL, '감각이 붙으면 속도계를 덜 보게 됩니다.'),
      ('cycling:P1', 'epic', NULL, '바람이 정면일 때에도 평균이 무너지지 않습니다.'),
      ('cycling:P1', 'mystic', NULL, '이 속도는 이제 최고가 아니라 기본값입니다.'),
      -- cycling:V1
      ('cycling:V1', 'rare', NULL, '손가락이 레버에서 떨어져 있는 시간이 길어집니다.'),
      ('cycling:V1', 'epic', NULL, '블랙 트랙의 내리막은 이런 사람에게만 길을 내줍니다.'),
      ('cycling:V1', 'mystic', NULL, '속도계의 맨 윗칸은 이 사람의 자리입니다.'),
      -- cycling:L1
      ('cycling:L1', 'rare', NULL, '하루를 통째로 쓰는 일정에 익숙해집니다.'),
      ('cycling:L1', 'epic', NULL, '해가 지고도 남은 거리를 침착하게 계산합니다.'),
      ('cycling:L1', 'mystic', NULL, '하루의 길이가 이 사람의 거리를 정하지 못합니다.'),
      -- cycling:E1
      ('cycling:E1', 'rare', NULL, '그루터기 살롱의 단골들은 오르막 초입에서 이 사람을 알아봅니다.'),
      ('cycling:E1', 'epic', NULL, '경사도가 아니라 남은 거리만 봅니다.'),
      ('cycling:E1', 'mystic', NULL, '화이트 룸은 정상보다 그 앞의 마지막 굽이를 기억합니다.'),
      -- cycling:C1
      ('cycling:C1', 'rare', NULL, '하루치가 여러 달로 불어나면 그것을 습관이라고 부릅니다.'),
      ('cycling:C1', 'epic', NULL, '달력에 남은 날들이 그대로 기록의 두께가 됩니다.'),
      ('cycling:C1', 'mystic', NULL, '이만큼 쌓인 날수 앞에서는 컨디션이라는 말이 무력합니다.'),
      -- cycling:C2
      ('cycling:C2', 'rare', NULL, '채운 주가 이어지면 일정표가 먼저 자리를 비워둡니다.'),
      ('cycling:C2', 'epic', NULL, '한 주를 무너뜨리지 않는 사람은 계절도 무너지지 않습니다.'),
      ('cycling:C2', 'mystic', NULL, '이제 주간 계획이 이 사람을 따라옵니다.'),
      -- cycling:C3
      ('cycling:C3', 'rare', NULL, '총량이 커질수록 잘 탄 날과 못 탄 날의 차이가 흐려집니다.'),
      ('cycling:C3', 'epic', NULL, '한 달이라는 단위가 이 사람에게는 짧습니다.'),
      ('cycling:C3', 'mystic', NULL, '화이트 룸은 한 달을 통째로 밀어붙인 자를 알아봅니다.'),
      -- cycling:C4
      ('cycling:C4', 'rare', NULL, '지나온 계절이 늘수록 날씨는 변명이 되지 못합니다.'),
      ('cycling:C4', 'epic', NULL, '봄과 겨울을 같은 태도로 지나온 기록이 남습니다.'),
      ('cycling:C4', 'mystic', NULL, '계절은 이 사람 앞에서 배경으로 물러납니다.'),
      -- cycling:D1
      ('cycling:D1', 'rare', NULL, '토요일 아침이 늦잠보다 먼저 정해져 있습니다.'),
      ('cycling:D1', 'epic', NULL, '이틀이라는 짧은 창을 이만큼 크게 쓰는 경우는 드뭅니다.'),
      ('cycling:D1', 'mystic', NULL, '주말이라는 말이 더 이상 휴식과 붙어 다니지 않습니다.'),
      -- cycling:D2
      ('cycling:D2', 'rare', NULL, '무엇을 포기했는지 이제 아무도 묻지 않습니다.'),
      ('cycling:D2', 'epic', NULL, '하루의 절반을 도로에 내주고도 다음 날이 멀쩡합니다.'),
      ('cycling:D2', 'mystic', NULL, '평일과 주말의 경계가 이 사람에게는 없습니다.'),
      -- cycling:N1
      ('cycling:N1', 'rare', NULL, '무너지지 않은 사흘이 여러 번 겹칩니다.'),
      ('cycling:N1', 'epic', NULL, '사흘째의 다리 상태를 미리 아는 사람이 됩니다.'),
      ('cycling:N1', 'mystic', NULL, '연속이라는 말이 더 이상 부담으로 들리지 않습니다.'),
      -- cycling:N2
      ('cycling:N2', 'rare', NULL, '한 주가 통째로 하나의 흐름이 됩니다.'),
      ('cycling:N2', 'epic', NULL, '쉬는 날을 끼워 넣지 않고도 다음 주가 이어집니다.'),
      -- cycling:N3
      ('cycling:N3', 'mystic', NULL, '생활이 된 것은 좀처럼 무너지지 않습니다.'),
      -- cycling:G1
      ('cycling:G1', 'rare', NULL, '약속처럼 돌아오는 간격이 몸에 새겨집니다.'),
      ('cycling:G1', 'epic', NULL, '비어도 이상하지 않았을 칸이 한 번도 비지 않았습니다.'),
      ('cycling:G1', 'mystic', NULL, '이 사람의 간격은 달력보다 정확합니다.'),
      -- cycling:R1
      ('cycling:R1', NULL, 2, '이겨낸 기록이 하나씩 갱신되기 시작합니다.'),
      ('cycling:R1', NULL, 3, '넘어야 할 상대가 언제나 자기 기록입니다.'),
      ('cycling:R1', NULL, 4, '기록판을 자기 이름으로 덮어씁니다.'),
      ('cycling:R1', NULL, 5, '한계라고 불렀던 숫자가 평범해집니다.'),
      ('cycling:R1', NULL, 6, '경신은 사건이 아니라 과정이 됩니다.'),
      ('cycling:R1', NULL, 7, '화이트 룸은 이런 사람 앞에서만 열립니다.'),
      ('cycling:R1', NULL, 8, '더 이길 상대가 남아 있지 않습니다.'),
      -- cycling:R2
      ('cycling:R2', NULL, 2, '지난달의 기록이 이번 달의 최저선이 됩니다.'),
      ('cycling:R2', NULL, 3, '성장이 우연이 아니었다는 것이 증명됩니다.'),
      ('cycling:R2', NULL, 4, '매달 다시 시작하는 사람만 그릴 수 있는 곡선입니다.'),
      ('cycling:R2', NULL, 5, '그래프에 내려가는 구간이 보이지 않습니다.'),
      ('cycling:R2', NULL, 6, '이 곡선을 유지하는 것은 재능이 아니라 축적입니다.'),
      ('cycling:R2', NULL, 7, '지난달은 매번 이 사람에게 집니다.'),
      ('cycling:R2', NULL, 8, '다음 달의 상대도 이미 정해져 있습니다.'),
      -- cycling:X1
      ('cycling:X1', 'rare', NULL, '비워둔 하루가 다음 출발의 일부라는 것을 압니다.'),
      ('cycling:X1', 'epic', NULL, '회복을 계획에 넣는 사람이 결국 오래 갑니다.'),
      -- cycling:X2
      ('cycling:X2', 'rare', NULL, '몇 번을 멈춰도 돌아올 자리가 정해져 있습니다.'),
      ('cycling:X2', 'epic', NULL, '그루터기 살롱은 오래 비운 자리도 치우지 않습니다.'),
      -- cycling:W1
      ('cycling:W1', 'rare', NULL, '더위는 이제 출발을 미룰 이유가 되지 못합니다.'),
      ('cycling:W1', 'epic', NULL, '블랙 트랙은 도시가 가장 뜨거울 때 입구를 드러냅니다.'),
      ('cycling:W1', 'mystic', NULL, '펄펄 끓는 도로 위에서 이 사람은 예외로 남습니다.'),
      -- cycling:W2
      ('cycling:W2', 'rare', NULL, '드문 쪽에 서는 일이 익숙해집니다.'),
      ('cycling:W2', 'epic', NULL, '영하의 도로에 남은 바퀴 자국은 대개 한 사람의 것입니다.'),
      ('cycling:W2', 'mystic', NULL, '블랙 트랙의 생존자 명단에 겨울이 적혀 있습니다.'),
      -- cycling:W3
      ('cycling:W3', 'mystic', NULL, '어떤 계절도 이 사람의 이름을 비워두지 못합니다.'),
      -- cycling:H1
      ('cycling:H1', 'rare', NULL, '숫자가 흔들리지 않는 구간이 점점 길어집니다.'),
      ('cycling:H1', 'epic', NULL, '출력 그래프가 평평한 사람은 흔치 않습니다.'),
      ('cycling:H1', 'mystic', NULL, '파워는 이제 목표가 아니라 이 사람의 평소입니다.'),
      -- cycling:H2
      ('cycling:H2', 'rare', NULL, '그 기관이 한계를 말하는 지점이 조금씩 뒤로 밀립니다.'),
      ('cycling:H2', 'epic', NULL, '심박수가 높은 채로 버티는 시간이 훈련의 전부가 됩니다.'),
      ('cycling:H2', 'mystic', NULL, '화이트 룸의 문은 심장이 가장 크게 뛸 때 열립니다.'),
      -- hiking:K1
      ('hiking:K1', NULL, 2, '쌓인 높이를 확인하는 일이 지도를 펴는 일보다 잦아집니다.'),
      ('hiking:K1', NULL, 3, '이제 산은 높이의 단위로 셈해집니다.'),
      ('hiking:K1', NULL, 4, '누적된 상승이 웬만한 고산 하나를 통째로 삼킵니다.'),
      ('hiking:K1', NULL, 5, '이만한 높이는 하루로 만들어지지 않습니다.'),
      ('hiking:K1', NULL, 6, '쌓아 올린 높이가 지도의 축척을 벗어납니다.'),
      -- hiking:K3
      ('hiking:K3', NULL, 2, '그루터기 살롱의 주민들이 이 발소리를 기억하기 시작합니다.'),
      ('hiking:K3', NULL, 3, '들머리에서 마주치는 얼굴들이 먼저 눈인사를 건넵니다.'),
      ('hiking:K3', NULL, 4, '횟수가 쌓이면 산은 더 이상 특별한 일정이 아닙니다.'),
      ('hiking:K3', NULL, 5, '몇 번째인지 세는 일을 그만둔 지 오래입니다.'),
      ('hiking:K3', NULL, 6, '이 정도는 취미라는 말로 설명되지 않습니다.'),
      -- hiking:P1
      ('hiking:P1', 'rare', NULL, '하루치 상승만으로 산 하나가 통째로 들어갑니다.'),
      ('hiking:P1', 'epic', NULL, '한 번의 오르막에 하루의 고도를 전부 벌어들입니다.'),
      ('hiking:P1', 'mystic', NULL, '화이트 룸의 문은 이런 상승의 끝에서 잠깐 열립니다.'),
      -- hiking:A1
      ('hiking:A1', 'rare', NULL, '구름과 같은 높이에 서 본 사람은 등고선을 다르게 읽습니다.'),
      ('hiking:A1', 'epic', NULL, '여기서부터는 높이를 세는 대신 남은 봉우리를 셉니다.'),
      ('hiking:A1', 'mystic', NULL, '화이트 룸은 가장 멀리 닿았던 숨을 기억합니다.'),
      -- hiking:L1
      ('hiking:L1', 'rare', NULL, '그루터기 살롱은 하루를 통째로 숲에 두고 가는 손님을 반깁니다.'),
      ('hiking:L1', 'epic', NULL, '능선에서 보내는 시간이 도시에서 보내는 하루보다 길어집니다.'),
      ('hiking:L1', 'mystic', NULL, '화이트 룸의 문은 해가 다 지도록 내려오지 않은 사람 앞에서 열립니다.'),
      -- hiking:L2
      ('hiking:L2', 'rare', NULL, '들머리와 날머리가 서로 다른 지도에 실릴 만큼 멀어집니다.'),
      ('hiking:L2', 'epic', NULL, '산맥 하나가 하루의 동선 안에 들어옵니다.'),
      ('hiking:L2', 'mystic', NULL, '능선의 끝을 묻는 사람에게 답할 수 있는 자리입니다.'),
      -- hiking:C1
      ('hiking:C1', 'rare', NULL, '그 하루가 여러 번 반복되면 습관이라는 이름이 붙습니다.'),
      ('hiking:C1', 'epic', NULL, '달력에서 산이 있던 날이 없던 날보다 또렷합니다.'),
      ('hiking:C1', 'mystic', NULL, '이제 일정이 산을 비켜 갑니다.'),
      -- hiking:C3
      ('hiking:C3', 'rare', NULL, '계절이 바뀌어도 벌어들이는 높이는 줄지 않습니다.'),
      ('hiking:C3', 'epic', NULL, '쌓아 올린 높이가 계절의 경계를 지워버립니다.'),
      ('hiking:C3', 'mystic', NULL, '계절은 지나가고 쌓인 높이만 남습니다.'),
      -- hiking:D1
      ('hiking:D1', 'rare', NULL, '토요일 새벽의 들머리에서는 서로 얼굴을 알아봅니다.'),
      ('hiking:D1', 'epic', NULL, '주말의 행선지가 한 번도 바뀌지 않았습니다.'),
      ('hiking:D1', 'mystic', NULL, '도시가 쉬는 이틀을 능선이 통째로 가져갑니다.'),
      -- hiking:N1
      ('hiking:N1', 'rare', NULL, '이튿날 아침의 다리는 무겁지만 방향은 이미 정해져 있습니다.'),
      ('hiking:N1', 'epic', NULL, '회복을 기다리지 않고 이어 붙인 날들이 층층이 쌓입니다.'),
      ('hiking:N1', 'mystic', NULL, '연달아 오르는 일이 예외가 아니라 기본이 되었습니다.'),
      -- hiking:N2
      ('hiking:N2', 'rare', NULL, '셋째 날의 오르막에서 몸은 요령을 배웁니다.'),
      ('hiking:N2', 'epic', NULL, '연속의 끝이 어디인지 아직 확인되지 않았습니다.'),
      -- hiking:N3
      ('hiking:N3', 'mystic', NULL, '한 주를 통째로 능선에 두고 온 기록은 좀처럼 갱신되지 않습니다.'),
      -- hiking:G1
      ('hiking:G1', 'rare', NULL, '간격이 벌어지기 전에 다시 들머리에 서는 버릇이 생겼습니다.'),
      ('hiking:G1', 'epic', NULL, '멀어지지 않았다는 사실이 기록으로 증명됩니다.'),
      ('hiking:G1', 'mystic', NULL, '산과의 거리가 한 번도 벌어진 적이 없습니다.'),
      -- hiking:R1
      ('hiking:R1', NULL, 2, '지난 최고 높이는 이제 기준선이 되었습니다.'),
      ('hiking:R1', NULL, 3, '갱신이 반복되면 한계라는 말이 흐려집니다.'),
      ('hiking:R1', NULL, 4, '조금씩 위로 옮겨 놓은 선이 꽤 멀어졌습니다.'),
      ('hiking:R1', NULL, 5, '예전의 최고 기록이 지금의 몸풀기입니다.'),
      ('hiking:R1', NULL, 6, '한계는 넘는 것이 아니라 옮기는 것임을 압니다.'),
      ('hiking:R1', NULL, 7, '화이트 룸은 스스로를 계속 넘어서는 사람만 부릅니다.'),
      ('hiking:R1', NULL, 8, '그 위는 아직 아무도 밟지 않았습니다.'),
      -- hiking:R2
      ('hiking:R2', NULL, 2, '지난번보다 오래 머문 시간이 몸에 남습니다.'),
      ('hiking:R2', NULL, 3, '버티는 시간을 늘리는 일은 속도를 올리는 일보다 조용합니다.'),
      ('hiking:R2', NULL, 4, '해가 기우는 것을 지켜보는 시간이 점점 길어집니다.'),
      ('hiking:R2', NULL, 5, '체력이 아니라 시간을 관리하는 단계에 들어섰습니다.'),
      ('hiking:R2', NULL, 6, '머무는 시간의 상한을 스스로 정합니다.'),
      ('hiking:R2', NULL, 7, '시간은 이제 변수가 아니라 도구입니다.'),
      ('hiking:R2', NULL, 8, '산에서 흐르는 시간을 지배합니다.'),
      -- hiking:X1
      ('hiking:X1', 'rare', NULL, '다음 날을 비워 두는 것도 산행 계획의 일부입니다.'),
      ('hiking:X1', 'epic', NULL, '물러설 때를 아는 판단이 기록만큼 오래 남습니다.'),
      -- hiking:X2
      ('hiking:X2', 'rare', NULL, '오래 비웠어도 숲은 발소리를 잊지 않습니다.'),
      ('hiking:X2', 'epic', NULL, '떠나 있던 시간이 길수록 돌아온 걸음이 또렷합니다.'),
      -- hiking:W1
      ('hiking:W1', 'rare', NULL, '폭염 경보가 뜬 날의 들머리는 유난히 한산합니다.'),
      ('hiking:W1', 'epic', NULL, '더위가 사람을 걸러낸 자리에 같은 이름이 남습니다.'),
      ('hiking:W1', 'mystic', NULL, '가장 뜨거운 계절이 이 걸음을 멈추지 못했습니다.'),
      -- hiking:W2
      ('hiking:W2', 'rare', NULL, '아이젠 소리에 익숙해질 무렵 겨울 능선이 편해집니다.'),
      ('hiking:W2', 'epic', NULL, '블랙 트랙의 겨울 구역은 판단이 서는 사람만 통과시킵니다.'),
      ('hiking:W2', 'mystic', NULL, '한파와 눈이 이 사람의 일정에서 아무것도 지우지 못합니다.'),
      -- hiking:W3
      ('hiking:W3', 'mystic', NULL, '계절이 몇 바퀴를 돌아도 같은 능선에서 같은 사람을 봅니다.'),
      -- trail_running:K1
      ('trail_running:K1', NULL, 2, '익숙해진 흙길이 하루하루 늘어납니다.'),
      ('trail_running:K1', NULL, 3, '그루터기 살롱의 단골로 불릴 만한 거리입니다.'),
      ('trail_running:K1', NULL, 4, '흙과 돌 위에 쌓은 거리가 도로의 기록을 앞지릅니다.'),
      ('trail_running:K1', NULL, 5, '지도의 등산로가 이 사람에게는 일상 구간입니다.'),
      ('trail_running:K1', NULL, 6, '밟지 않은 산길을 찾는 편이 더 어렵습니다.'),
      ('trail_running:K1', NULL, 7, '흙길의 총량이 한 사람의 정체가 됩니다.'),
      ('trail_running:K1', NULL, 8, '산이 이 거리를 기억합니다.'),
      -- trail_running:K2
      ('trail_running:K2', NULL, 2, '오르막을 피하지 않는 습관이 높이로 쌓입니다.'),
      ('trail_running:K2', NULL, 3, '누적된 높이가 이미 웬만한 봉우리를 넘어섭니다.'),
      ('trail_running:K2', NULL, 4, '오른 높이의 합이 구름 위로 올라갑니다.'),
      ('trail_running:K2', NULL, 5, '고도는 이제 이 사람의 기록 단위입니다.'),
      ('trail_running:K2', NULL, 6, '높이를 세는 단위가 달라집니다.'),
      ('trail_running:K2', NULL, 7, '이제 높이는 목표가 아니라 배경입니다.'),
      -- trail_running:K3
      ('trail_running:K3', NULL, 2, '산으로 향하는 일이 특별한 결심이 아니게 됩니다.'),
      ('trail_running:K3', NULL, 3, '들머리에서 망설이는 시간이 사라졌습니다.'),
      ('trail_running:K3', NULL, 4, '돌아온 횟수가 산에서의 판단력을 만듭니다.'),
      ('trail_running:K3', NULL, 5, '어느 산이든 처음이 아닌 사람이 있습니다.'),
      ('trail_running:K3', NULL, 6, '산은 이 발걸음을 낯설어하지 않습니다.'),
      -- trail_running:P1
      ('trail_running:P1', 'rare', NULL, '두 가지를 동시에 채우는 사람만 이 자리에 섭니다.'),
      ('trail_running:P1', 'epic', NULL, '거리와 고도가 함께 올라가야 비로소 기록이 됩니다.'),
      ('trail_running:P1', 'mystic', NULL, '이 종목의 정의가 한 사람의 이름으로 좁혀집니다.'),
      -- trail_running:L1
      ('trail_running:L1', 'rare', NULL, '하루로 끝낼 수 있는 능선의 길이가 계속 늘어납니다.'),
      ('trail_running:L1', 'epic', NULL, '하루 안에 넘은 능선의 수가 보통의 원정과 맞먹습니다.'),
      ('trail_running:L1', 'mystic', NULL, '하루를 다 쓴 자리에 남는 것은 이름뿐입니다.'),
      -- trail_running:L2
      ('trail_running:L2', 'rare', NULL, '해가 기울어도 산에서 내려올 이유를 찾지 않습니다.'),
      ('trail_running:L2', 'epic', NULL, '하루의 빛이 다 지나가도록 능선 위에 있습니다.'),
      ('trail_running:L2', 'mystic', NULL, '시간의 길이라는 것이 이 사람 앞에서는 의미를 잃습니다.'),
      -- trail_running:E1
      ('trail_running:E1', 'rare', NULL, '한 번의 오름으로 그 높이를 훌쩍 넘겨 둡니다.'),
      ('trail_running:E1', 'epic', NULL, '쉬지 않고 오르는 일이 이 사람에게는 하나의 구간일 뿐입니다.'),
      ('trail_running:E1', 'mystic', NULL, '화이트 룸의 문은 이런 오름의 끝에서 열립니다.'),
      -- trail_running:A1
      ('trail_running:A1', 'rare', NULL, '구름이 걸리는 높이에서도 발이 멈추지 않습니다.'),
      ('trail_running:A1', 'epic', NULL, '지도에 이름만 남은 높이에 발자국이 찍혀 있습니다.'),
      ('trail_running:A1', 'mystic', NULL, '그 높이에서는 숨소리마저 기록으로 남습니다.'),
      -- trail_running:C1
      ('trail_running:C1', 'rare', NULL, '그 하루가 계절을 넘겨 이어지고 있습니다.'),
      ('trail_running:C1', 'epic', NULL, '산에 든 날의 목록이 한 사람의 이력이 됩니다.'),
      ('trail_running:C1', 'mystic', NULL, '그 목록 앞에서는 날씨도 계절도 변명이 되지 않습니다.'),
      -- trail_running:C2
      ('trail_running:C2', 'rare', NULL, '한 달을 넘기면 총량은 습관의 다른 이름이 됩니다.'),
      ('trail_running:C2', 'epic', NULL, '달마다 쌓인 총량이 몸의 기본값을 바꿔 놓습니다.'),
      ('trail_running:C2', 'mystic', NULL, '한 달 치 기록이 남의 한 해를 앞섭니다.'),
      -- trail_running:C3
      ('trail_running:C3', 'rare', NULL, '계절이 바뀌어도 오르는 높이는 줄지 않습니다.'),
      ('trail_running:C3', 'epic', NULL, '한 계절의 누적 고도가 산맥 하나의 높이에 이릅니다.'),
      ('trail_running:C3', 'mystic', NULL, '계절은 이 사람 앞에서 높이를 감추지 못합니다.'),
      -- trail_running:T1
      ('trail_running:T1', 'rare', NULL, '그루터기 살롱은 해뜨기 전에 오는 손님을 알아봅니다.'),
      ('trail_running:T1', 'epic', NULL, '능선에서 맞는 일출이 이 사람에게는 일과입니다.'),
      ('trail_running:T1', 'mystic', NULL, '해뜨기 전의 능선은 이 사람의 발소리로 하루를 시작합니다.'),
      -- trail_running:T2
      ('trail_running:T2', 'rare', NULL, '어둠 속에서도 다음 발 디딜 곳이 먼저 보입니다.'),
      ('trail_running:T2', 'epic', NULL, '어두운 산길에는 이 사람의 발자국이 먼저 나 있습니다.'),
      -- trail_running:N1
      ('trail_running:N1', 'rare', NULL, '연달아 붙는 날들의 뻐근함을 다루는 요령이 생겼습니다.'),
      ('trail_running:N1', 'epic', NULL, '이어 붙인 날들이 회복의 기준을 바꿔 놓습니다.'),
      ('trail_running:N1', 'mystic', NULL, '연속으로 이어진 산길이 이 사람에게는 평일입니다.'),
      -- trail_running:N2
      ('trail_running:N2', 'rare', NULL, '쉬는 날을 끼워 넣지 않는 사람이 있습니다.'),
      ('trail_running:N2', 'epic', NULL, '끊김 없는 날들이 반복되어 하나의 리듬이 됐습니다.'),
      -- trail_running:G1
      ('trail_running:G1', 'rare', NULL, '그루터기 살롱은 잊지 않고 돌아오는 발소리를 알아봅니다.'),
      ('trail_running:G1', 'epic', NULL, '간격이 벌어지지 않는 사람은 산에서 따로 분류됩니다.'),
      ('trail_running:G1', 'mystic', NULL, '산길은 이 사람이 비운 자리를 가져본 적이 없습니다.'),
      -- trail_running:R1
      ('trail_running:R1', NULL, 2, '어제의 최장 거리가 오늘의 출발선이 됩니다.'),
      ('trail_running:R1', NULL, 3, '한계라 여겼던 지점을 이미 지나쳐 왔습니다.'),
      ('trail_running:R1', NULL, 4, '자신의 기록을 넘어서는 일이 습관이 됐습니다.'),
      ('trail_running:R1', NULL, 5, '기록을 갱신할 때마다 다음 목표가 저절로 멀어집니다.'),
      ('trail_running:R1', NULL, 6, '비교할 상대가 과거의 자신밖에 남지 않았습니다.'),
      ('trail_running:R1', NULL, 7, '최장 거리라는 말이 잠깐만 유효합니다.'),
      ('trail_running:R1', NULL, 8, '끝을 정하지 않은 사람에게는 한계가 없습니다.'),
      -- trail_running:R2
      ('trail_running:R2', NULL, 2, '한 번 닿은 높이는 곧 기준선이 됩니다.'),
      ('trail_running:R2', NULL, 3, '올려다보던 능선이 발밑으로 내려옵니다.'),
      ('trail_running:R2', NULL, 4, '새 높이에 닿는 일이 더는 사건이 아닙니다.'),
      ('trail_running:R2', NULL, 5, '오를 곳을 고를 때 높이는 기준에서 빠집니다.'),
      ('trail_running:R2', NULL, 6, '정상이라는 말이 이 사람에게는 통과점입니다.'),
      ('trail_running:R2', NULL, 7, '더 높은 곳을 찾는 일이 어려워졌습니다.'),
      ('trail_running:R2', NULL, 8, '화이트 룸에 닿았다는 소문은 이런 높이에서 시작됩니다.'),
      -- trail_running:R3
      ('trail_running:R3', NULL, 2, '버틸 수 있는 시간이 조금씩 길어지고 있습니다.'),
      ('trail_running:R3', NULL, 3, '지쳐서 멈추던 지점이 점점 뒤로 물러납니다.'),
      ('trail_running:R3', NULL, 4, '시간이 길어질수록 판단이 오히려 또렷해집니다.'),
      ('trail_running:R3', NULL, 5, '오래 머무는 일 자체가 이 사람의 무기입니다.'),
      ('trail_running:R3', NULL, 6, '시계를 보지 않아도 몸이 남은 시간을 압니다.'),
      ('trail_running:R3', NULL, 7, '지구력이라는 말은 이제 설명이 아닙니다.'),
      ('trail_running:R3', NULL, 8, '산 위의 시간은 이 사람을 지치게 하지 못합니다.'),
      -- trail_running:X1
      ('trail_running:X1', 'rare', NULL, '내려온 다리를 다루는 법을 아는 것도 산에서의 실력입니다.'),
      ('trail_running:X1', 'epic', NULL, '무너지지 않는 사람은 회복까지 계획에 넣어 둡니다.'),
      -- trail_running:X2
      ('trail_running:X2', 'rare', NULL, '그루터기 살롱은 오래 비운 자리도 그대로 남겨 둡니다.'),
      ('trail_running:X2', 'epic', NULL, '몇 번을 멀어져도 결국 같은 들머리에 서 있습니다.'),
      -- trail_running:W1
      ('trail_running:W1', 'rare', NULL, '얼음과 눈이 이 사람의 계획을 바꾸지 못합니다.'),
      ('trail_running:W1', 'epic', NULL, '블랙 트랙은 이런 날씨에만 입구를 드러냅니다.'),
      -- trail_running:W2
      ('trail_running:W2', 'mystic', NULL, '계절이 몇 번 바뀌어도 같은 산길에 같은 사람이 있습니다.'),
      -- trail_running:H1
      ('trail_running:H1', 'rare', NULL, '심장이 한계에 가까워질수록 오히려 자세가 정돈됩니다.'),
      ('trail_running:H1', 'epic', NULL, '오르막에서 흔들리지 않는 심박이 그대로 기록이 됩니다.'),
      ('trail_running:H1', 'mystic', NULL, '화이트 룸은 한계 너머에서 뛰는 심장을 부릅니다.')
  )
  UPDATE public.badges b
     SET description = v.description
    FROM v
   WHERE b.family_key = v.family_key
     AND b.rarity IS NOT DISTINCT FROM v.rarity
     AND b.level  IS NOT DISTINCT FROM v.level
     AND b.type = 'activity'
     AND b.deleted_at IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '등급별 설명 갱신: % 행 (기대 436)', updated_count;
  IF updated_count = 0 THEN
    RAISE EXCEPTION '0행이 갱신됐다 — family_key/rarity/level 지정이 DB와 어긋난다';
  END IF;
  IF updated_count <> 436 THEN
    RAISE WARNING '기대 436행과 다르다 (%). 소프트 삭제·중복 행 여부를 확인할 것', updated_count;
  END IF;
END $$;

COMMIT;

-- ── 사후 검증 (실행 후 손으로 돌려본다) ──────────────────────────────────
-- ① 계열 내 설명이 1종인 v5 계열 — 2행 이상 계열은 0행이어야 한다
-- SELECT family_key, count(*) AS rows, count(DISTINCT description) AS descs
--   FROM public.badges
--  WHERE type='activity' AND deleted_at IS NULL
--    AND family_key ~ '^(walking|running|cycling|hiking|trail_running):[A-Z]+[0-9]+$'
--  GROUP BY family_key HAVING count(*) > 1 AND count(DISTINCT description) = 1;
--
-- ② 최저 등급 문장이 그대로인가 — 정본 「설명」과 대조한다
-- SELECT family_key, rarity, level, description FROM public.badges
--  WHERE family_key IN ('walking:C1','walking:K1') AND deleted_at IS NULL
--  ORDER BY family_key, level NULLS FIRST, rarity;
