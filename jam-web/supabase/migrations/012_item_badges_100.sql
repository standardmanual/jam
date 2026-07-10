-- ============================================================
-- Migration 012: 아이템 배지 100개 시드 데이터
-- 이미지: /badges/001.png ~ /badges/100.png (public/badges/ 폴더)
-- 분포: common 50 / rare 35 / legendary 12 / mythic 3
-- ============================================================

INSERT INTO public.badges (name, description, type, rarity, image_url, condition_json, activity_types, patch_available, patch_price_krw, is_wandering) VALUES

-- ── 001–010 ───────────────────────────────────────────────
('다운 애로우',        '아래를 향한 주황빛 화살표. 드랍 포인트를 향해 내려가는 신호.',                              'item', 'common',    '/badges/001.png', NULL, '{}', false, NULL, false),
('스마일 써클',        '파란 원 안의 노란 스마일. 오늘도 기분 좋은 하루의 시작.',                                  'item', 'common',    '/badges/002.png', NULL, '{}', false, NULL, false),
('핸드메이드 스마일',  '손으로 만든 온기가 담긴 핸드메이드 스마일 배지.',                                          'item', 'common',    '/badges/003.png', NULL, '{}', false, NULL, false),
('어메이징',           '블루-옐로 그래피티로 폭발하는 AMAZING. 평범함을 거부한다.',                                 'item', 'rare',      '/badges/004.png', NULL, '{}', false, NULL, false),
('레인보우 하트',      '무지개 빛깔이 겹겹이 쌓인 동심원 하트. 색을 두려워하지 마라.',                              'item', 'rare',      '/badges/005.png', NULL, '{}', false, NULL, false),
('레트로 스타',        '주황-노랑 이중 윤곽선의 클래식 별. 언제나 빛나는 존재.',                                    'item', 'rare',      '/badges/006.png', NULL, '{}', false, NULL, false),
('웨이브스',           '파도 위를 유유히 떠다니는 스마일의 서퍼 배지.',                                            'item', 'common',    '/badges/007.png', NULL, '{}', false, NULL, false),
('선샤인 써클',        '분홍 배경 위에 빛살을 뻗는 오렌지빛 태양 스마일.',                                         'item', 'common',    '/badges/008.png', NULL, '{}', false, NULL, false),
('베스트 그래피티',    '초록빛 거리 예술로 새긴 BEST. 당신이 최고라는 선언.',                                       'item', 'common',    '/badges/009.png', NULL, '{}', false, NULL, false),
('음양',               '파란 음양 심볼. 움직임과 정지, 활동과 휴식의 완전한 균형.',                                 'item', 'rare',      '/badges/010.png', NULL, '{}', false, NULL, false),

-- ── 011–020 ───────────────────────────────────────────────
('익스플로어',         '산 실루엣 너머로 외치는 한 마디 — Explore. 미지의 루트를 찾아라.',                          'item', 'legendary', '/badges/011.png', NULL, '{}', false, NULL, false),
('어썸 오벌',          '별과 꽃눈 문양이 새겨진 노란 타원 배지. Awesome.',                                         'item', 'common',    '/badges/012.png', NULL, '{}', false, NULL, false),
('오픈 키',            '스마일 열쇠가 새로운 문을 여는 연두 아치 배지.',                                            'item', 'common',    '/badges/013.png', NULL, '{}', false, NULL, false),
('낙관주의자',         '"Always Stay Optimistic" — 어떤 날씨에도 웃을 수 있는 자.',                                 'item', 'rare',      '/badges/014.png', NULL, '{}', false, NULL, false),
('멜팅 스마일',        '더위에 녹아내리는 크림빛 스마일. 달리고 녹은 자의 훈장.',                                   'item', 'rare',      '/badges/015.png', NULL, '{}', false, NULL, false),
('포인터 핸드',        '분홍 손이 가리키는 방향을 따라가라. 답은 항상 거기 있다.',                                   'item', 'common',    '/badges/016.png', NULL, '{}', false, NULL, false),
('나이스 데이',        '야자수와 신비로운 눈 구름이 함께하는 아치 배지. Nice Day.',                                  'item', 'common',    '/badges/017.png', NULL, '{}', false, NULL, false),
('레인',               '구름 속 눈에서 빗방울이 떨어지는 파란 아치 배지. 비도 운동이다.',                           'item', 'common',    '/badges/018.png', NULL, '{}', false, NULL, false),
('플라워 스퀘어',      '분홍빛 꽃 스마일이 가득한 복고풍 사각 배지.',                                              'item', 'common',    '/badges/019.png', NULL, '{}', false, NULL, false),
('러브 세이브',        '"Only Love Can Save This World" — 사랑으로만 세상을 구할 수 있다는 신화의 배지.',           'item', 'mythic',    '/badges/020.png', NULL, '{}', false, NULL, true),

-- ── 021–030 ───────────────────────────────────────────────
('스파클 스마일',      '반짝임이 폭발하는 노란 스마일. 오늘 당신은 유독 빛난다.',                                   'item', 'rare',      '/badges/021.png', NULL, '{}', false, NULL, false),
('굿 바이브스 온리',   '"Good Vibes Only" — 나쁜 에너지는 출입 금지.',                                             'item', 'legendary', '/badges/022.png', NULL, '{}', false, NULL, false),
('슈퍼 옐로우',        '노란 삼각형 안의 강렬한 슈퍼 스마일. 에너지 충전 완료.',                                   'item', 'common',    '/badges/023.png', NULL, '{}', false, NULL, false),
('해피 피플 클럽',     '"Always Happy People Club, Just Smile" — 비밀 결사대.',                                     'item', 'legendary', '/badges/024.png', NULL, '{}', false, NULL, false),
('스파클 크로스',      '4개의 빛살을 가진 주황-노랑 반짝이 크로스. 교차로의 에너지.',                              'item', 'rare',      '/badges/025.png', NULL, '{}', false, NULL, false),
('레트로 선 아치',     '크림색 아치 안에 퍼지는 빛살과 태양. 아날로그 감성의 레어.',                               'item', 'rare',      '/badges/026.png', NULL, '{}', false, NULL, false),
('슈퍼 핑크',          '핑크 삼각형 안의 반짝이 슈퍼 스마일. 귀엽지만 강하다.',                                    'item', 'common',    '/badges/027.png', NULL, '{}', false, NULL, false),
('베스트 스타 배너',   '두 별이 반기는 초록 베스트 텍스트 배너. 당신은 최고.',                                     'item', 'common',    '/badges/028.png', NULL, '{}', false, NULL, false),
('써머 스퀘어',        '야자수와 스마일이 가득한 여름 초록 사각 배지.',                                             'item', 'common',    '/badges/029.png', NULL, '{}', false, NULL, false),
('굿 바이브스 뱃지',   '황금빛 더블 스마일의 GOOD VIBES 빈티지 배지. 긍정의 상징.',                                'item', 'legendary', '/badges/030.png', NULL, '{}', false, NULL, false),

-- ── 031–040 ───────────────────────────────────────────────
('버터플라이',         '분홍 윤곽선의 파란 나비. 변화를 두려워하지 않는 자의 배지.',                                'item', 'rare',      '/badges/031.png', NULL, '{}', false, NULL, false),
('스파클 스마일 II',   '별빛 반짝임이 더해진 스마일. 조금 더 특별한 버전.',                                        'item', 'rare',      '/badges/032.png', NULL, '{}', false, NULL, false),
('더블 오벌',          '두 타원이 겹친 흑백 미니멀 배지. 단순함이 아름답다.',                                      'item', 'common',    '/badges/033.png', NULL, '{}', false, NULL, false),
('더블 스마일 하트',   '두 스마일 사이에 놓인 하트. 함께여서 더 빛나는 배지.',                                     'item', 'rare',      '/badges/034.png', NULL, '{}', false, NULL, false),
('타겟 하트',          '하트를 정조준한 보라빛 타겟 써클. 목표는 오직 사랑.',                                       'item', 'rare',      '/badges/035.png', NULL, '{}', false, NULL, false),
('스파클 플러스',      '노랑-주황의 반짝이 플러스. 더하고 또 더하는 에너지.',                                      'item', 'rare',      '/badges/036.png', NULL, '{}', false, NULL, false),
('와이어 글로브',      '격자 선으로 그린 3D 와이어프레임 지구본. 세계가 당신의 무대.',                              'item', 'rare',      '/badges/037.png', NULL, '{}', false, NULL, false),
('레디언트 써클',      '핑크 배경에 주황 빛살이 퍼지는 레디언트 스마일 써클.',                                     'item', 'rare',      '/badges/038.png', NULL, '{}', false, NULL, false),
('선 스마일 써클',     '대담한 노란 태양 스마일 원형 배지. 솔직하고 당당하게.',                                    'item', 'rare',      '/badges/039.png', NULL, '{}', false, NULL, false),
('구글리 아이',        '크고 동그란 두 눈이 당신을 응시하는 흑백 배지. 보고 있다.',                                'item', 'legendary', '/badges/040.png', NULL, '{}', false, NULL, false),

-- ── 041–050 ───────────────────────────────────────────────
('아이 오브 더 선',    '태양 문양 안에 새겨진 모든 것을 꿰뚫는 눈. 신화급 통찰의 상징.',                           'item', 'mythic',    '/badges/041.png', NULL, '{}', false, NULL, true),
('피스 사인',          '파란 피스 사인 써클. 모든 움직임은 평화를 위해.',                                          'item', 'rare',      '/badges/042.png', NULL, '{}', false, NULL, false),
('픽셀 써클',          '빨간-주황 픽셀 아트 스타일의 둥근 배지. 8비트 감성.',                                      'item', 'rare',      '/badges/043.png', NULL, '{}', false, NULL, false),
('스마일 오벌',        '노란-검정 스마일이 웃고 있는 단순하고 강한 타원 배지.',                                    'item', 'rare',      '/badges/044.png', NULL, '{}', false, NULL, false),
('아이 스티커',        '파란 눈 스티커. 날카롭고 예리한 시선으로 세상을 본다.',                                    'item', 'common',    '/badges/045.png', NULL, '{}', false, NULL, false),
('어썸 데이즈 어헤드', '초록 아치형 "Awesome Days Ahead" 스마일 배지. 더 좋은 날이 온다.',                         'item', 'common',    '/badges/046.png', NULL, '{}', false, NULL, false),
('러브 아치',          '분홍 아치 안의 하트들. 사랑을 품고 달리는 자의 뱃지.',                                     'item', 'common',    '/badges/047.png', NULL, '{}', false, NULL, false),
('해브 어 나이스 데이','세 스마일이 반기는 "Have A Nice Day" 사각 배지.',                                          'item', 'common',    '/badges/048.png', NULL, '{}', false, NULL, false),
('온리 러브',          '"Only Love" 하트 배지. 사랑 외에는 아무것도 필요 없다.',                                   'item', 'rare',      '/badges/049.png', NULL, '{}', false, NULL, false),
('드림 아치',          '보라빛 아치 안의 꿈꾸는 스마일 배지. Dream your way.',                                     'item', 'legendary', '/badges/050.png', NULL, '{}', false, NULL, false),

-- ── 051–060 ───────────────────────────────────────────────
('오 트라이앵글',      '"OH" 파란 삼각형 텍스트. 예상치 못한 순간의 탄성.',                                        'item', 'common',    '/badges/051.png', NULL, '{}', false, NULL, false),
('퍼펙트 아치',        '"PERFECT" 파란 아치 배지. 완벽한 퍼포먼스의 기록.',                                        'item', 'rare',      '/badges/052.png', NULL, '{}', false, NULL, false),
('쿨 배지',            '차갑고 쿨한 텍스트 배지. 멋은 힘들이지 않는 데서 나온다.',                                 'item', 'common',    '/badges/053.png', NULL, '{}', false, NULL, false),
('쿨 코일',            '파란-흰 레트로 코일 스프링 배지. 튀어 오르는 에너지.',                                     'item', 'common',    '/badges/054.png', NULL, '{}', false, NULL, false),
('돈트 스탑',          '"Don''t Stop" 레트로 오벌 배지. 멈추는 것만이 실패다.',                                    'item', 'rare',      '/badges/055.png', NULL, '{}', false, NULL, false),
('어메이징 써클',      '"Amazing" 핑크 원형 텍스트 배지. 매일 놀라운 일이 일어난다.',                              'item', 'rare',      '/badges/056.png', NULL, '{}', false, NULL, false),
('저스트 스마일',      '"Just Try To Smile Everyday" — 매일 웃어보려는 의지의 배지.',                              'item', 'rare',      '/badges/057.png', NULL, '{}', false, NULL, false),
('와우 써클',          '"WOW WOW WOW" 스마일들이 가득한 써클 배지.',                                               'item', 'common',    '/badges/058.png', NULL, '{}', false, NULL, false),
('하이하이',           '"Hi Hi" — 스마일이 반기는 대형 써클 배지.',                                               'item', 'common',    '/badges/059.png', NULL, '{}', false, NULL, false),
('그로우 위드 러브',   '"Grow With Love" 꽃 화분 아치 배지. 사랑으로 자라는 것들.',                                'item', 'legendary', '/badges/060.png', NULL, '{}', false, NULL, false),

-- ── 061–070 ───────────────────────────────────────────────
('붐 스타 배지',       '"BOOOM BOOOM" 빈티지 별 배지. 폭발적인 에너지를 담았다.',                                  'item', 'common',    '/badges/061.png', NULL, '{}', false, NULL, false),
('왓 텍스트',          '"WHAT" 파란 그래피티 텍스트 스티커. 당신을 당황하게 하는 배지.',                           'item', 'common',    '/badges/062.png', NULL, '{}', false, NULL, false),
('스마일 기본형',      '가장 기본적인 노란 스마일 써클. 원점에서 다시 시작.',                                      'item', 'common',    '/badges/063.png', NULL, '{}', false, NULL, false),
('라디안트 스마일',    '빛살이 폭발하는 분홍-주황 방사형 스마일 써클.',                                            'item', 'common',    '/badges/064.png', NULL, '{}', false, NULL, false),
('선플라워 스마일',    '꽃이 웃는다. 노란 꽃 스마일 스티커.',                                                     'item', 'rare',      '/badges/065.png', NULL, '{}', false, NULL, false),
('킵 샤이닝',          '"Keep Smiling And Shine" — 계속 웃고 계속 빛나라.',                                        'item', 'rare',      '/badges/066.png', NULL, '{}', false, NULL, false),
('슈퍼 듀퍼',          '"Super Duper" 쌍 스마일 배지. 두 배로 강하고 두 배로 행복.',                               'item', 'rare',      '/badges/067.png', NULL, '{}', false, NULL, false),
('굿 바이브스 보라',   '"Good Vibes" 보라색 스퀘어 배지. 좋은 에너지는 색을 가진다.',                              'item', 'common',    '/badges/068.png', NULL, '{}', false, NULL, false),
('뉴 오렌지',          '"New" 오렌지 오벌 텍스트 배지. 새로운 시작은 항상 설렌다.',                                'item', 'common',    '/badges/069.png', NULL, '{}', false, NULL, false),
('매직 스퀘어',        '"Magic" 보라빛 사각형 스마일 배지. 마법 같은 하루.',                                       'item', 'legendary', '/badges/070.png', NULL, '{}', false, NULL, false),

-- ── 071–080 ───────────────────────────────────────────────
('오케이 그린',        '"Okay" 초록 오벌 텍스트 배지. 괜찮다. 오늘도 괜찮다.',                                     'item', 'common',    '/badges/071.png', NULL, '{}', false, NULL, false),
('굿 씽즈',            '"Good Things" 핑크 오벌 배지. 좋은 일은 반드시 온다.',                                     'item', 'common',    '/badges/072.png', NULL, '{}', false, NULL, false),
('아이 오벌',          '파란 눈동자가 중심에 박힌 눈 오벌 배지. 예리한 관찰자.',                                   'item', 'rare',      '/badges/073.png', NULL, '{}', false, NULL, false),
('오엠지',             '"OMG" 노란 스마일 텍스트 배지. 이건 진짜 대박이다.',                                       'item', 'rare',      '/badges/074.png', NULL, '{}', false, NULL, false),
('헬로 코인',          '"Hello" 코일 텍스트가 새겨진 화이트 코인 배지.',                                           'item', 'common',    '/badges/075.png', NULL, '{}', false, NULL, false),
('헬로 레트로',        '"HELLO" 레트로 핑크 텍스트 배지. 반갑습니다, 세상.',                                       'item', 'common',    '/badges/076.png', NULL, '{}', false, NULL, false),
('와우 버블',          '"WOW" 흰 버블 텍스트 배지. 탄성이 절로 나오는 배지.',                                      'item', 'common',    '/badges/077.png', NULL, '{}', false, NULL, false),
('오케이 스마일',      '"ok ay" 초록 스마일 텍스트 배지. 모든 게 오케이.',                                         'item', 'common',    '/badges/078.png', NULL, '{}', false, NULL, false),
('하이 스타버스트',    '"HI!" 노란 스타버스트 배지. 에너지 넘치는 인사.',                                          'item', 'common',    '/badges/079.png', NULL, '{}', false, NULL, false),
('피스 핸드',          '파란 아웃라인의 브이 핸드 배지. 모든 움직임은 평화를 향해.',                               'item', 'legendary', '/badges/080.png', NULL, '{}', false, NULL, false),

-- ── 081–090 ───────────────────────────────────────────────
('굿 데이 써클',       '"A Good Day To Do Something Cool" — 오늘이 바로 그 날.',                                   'item', 'rare',      '/badges/081.png', NULL, '{}', false, NULL, false),
('나이스 핑크',        '"nice" 핑크 텍스트 배지. 좋다. 그냥 좋다.',                                               'item', 'common',    '/badges/082.png', NULL, '{}', false, NULL, false),
('핑크 스타버스트 스마일','핑크 스타버스트 배경의 웃는 스마일. 눈에 확 띄는 배지.',                               'item', 'common',    '/badges/083.png', NULL, '{}', false, NULL, false),
('해피 그리드',        '스마일 격자로 채워진 해피 스퀘어 배지.',                                                   'item', 'common',    '/badges/084.png', NULL, '{}', false, NULL, false),
('돈트 워리',          '"Don''t Worry And Be Happy" — 걱정 말고 그냥 웃어라.',                                     'item', 'legendary', '/badges/085.png', NULL, '{}', false, NULL, false),
('반짝 스타버스트',    '반짝임이 터지는 노란 스타버스트 스마일 배지.',                                             'item', 'common',    '/badges/086.png', NULL, '{}', false, NULL, false),
('쿨 레드 스퀘어',     '"Cool" 레드 스퀘어 스마일 배지. 차갑게 멋있는 배지.',                                     'item', 'common',    '/badges/087.png', NULL, '{}', false, NULL, false),
('선라이즈',           '"Sunrise" 빈티지 선라이즈 배지. 새벽 첫 루트의 기록.',                                    'item', 'rare',      '/badges/088.png', NULL, '{}', false, NULL, false),
('와우 스타버스트',    '"WOW" 파란 스타버스트 배지. 놀라움을 터뜨려라.',                                           'item', 'common',    '/badges/089.png', NULL, '{}', false, NULL, false),
('핑크 스마일 스타',   '핑크 스타버스트 안의 스마일. 강렬하고 귀엽다.',                                           'item', 'common',    '/badges/090.png', NULL, '{}', false, NULL, false),

-- ── 091–100 ───────────────────────────────────────────────
('어메이징 선 써클',   '"Amazing" 선 스마일 써클 배지. 태양처럼 놀라운 존재.',                                     'item', 'rare',      '/badges/091.png', NULL, '{}', false, NULL, false),
('선샤인 스퀘어',      '빈티지 선샤인 스퀘어 배지. 복고적인 여름의 따뜻함.',                                       'item', 'common',    '/badges/092.png', NULL, '{}', false, NULL, false),
('해브 어 굿 데이',    '"Have A Good Day" 스마일 격자 배지. 좋은 하루가 되길.',                                    'item', 'common',    '/badges/093.png', NULL, '{}', false, NULL, false),
('베스트 오벌',        '"Best" 스마일 레트로 오벌 배지. 최선을 다한 자에게.',                                      'item', 'rare',      '/badges/094.png', NULL, '{}', false, NULL, false),
('서머 팜 빈티지',     '야자수, 태양, 서퍼의 레전더리 여름 빈티지 배지.',                                         'item', 'legendary', '/badges/095.png', NULL, '{}', false, NULL, false),
('아이 오브 더 스톰',  '눈동자들로 뒤덮인 혼돈의 눈. 모든 것을 동시에 본다. 신화급 배지.',                        'item', 'mythic',    '/badges/096.png', NULL, '{}', false, NULL, true),
('헬로 아치',          '"HELLO" 코인 텍스트 아치 배지. 반갑고 반가운 배지.',                                       'item', 'common',    '/badges/097.png', NULL, '{}', false, NULL, false),
('스마일 모어 배너',   '"Smile More" 배너 배지. 웃음은 근육이다. 더 많이 써라.',                                   'item', 'common',    '/badges/098.png', NULL, '{}', false, NULL, false),
('스파클 블랙 스마일', '블랙 배경 위에 반짝이는 스마일. 어둠 속에서도 빛난다.',                                   'item', 'rare',      '/badges/099.png', NULL, '{}', false, NULL, false),
('크리에이트',         '"CREATE" 핑크-노랑 삼각형 배지. 무언가를 만들어내는 자의 레전더리 뱃지.',                 'item', 'legendary', '/badges/100.png', NULL, '{}', false, NULL, false);

-- ── 검증 쿼리 (실행 후 확인용) ───────────────────────────
-- SELECT rarity, COUNT(*) FROM public.badges WHERE type='item' GROUP BY rarity ORDER BY rarity;
-- 예상: common=50, rare=35, legendary=12, mythic=3
