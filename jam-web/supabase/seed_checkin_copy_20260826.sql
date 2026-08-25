-- 체크인 용어 통일에 따른 DB 컨텐츠 문구 정정 (티켓 20260826_004)
--
-- 대상 5건 — 전부 UX Writing 금칙어('방문')를 담고 있거나 '장소' 표기를 쓰고 있다.
--   · missions.title        4건: '지정 스팟 방문 챌린지 A~D'
--   · missions.description  4건: '지정된 장소를 방문해보세요.'
--   · today_cards.subtitle  1건: '가까운 장소에서 픽업해보세요'
--
-- ⚠️ 이 파일은 티켓 20260826_004(db 유형) 규칙에 따라 **작성만** 하고 실행하지 않았다.
--    실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- ⚠️ 범위 밖 (건드리지 않는다)
--   · badges.description 자동생성 문구 1,776건 ("~을(를) 올랐습니다" / "지나갔습니다")
--     → 2026-08-26 사용자 결정으로 이번 티켓 범위 밖. 합쇼체 문체 문제는 별도 티켓.
--   · badges.name/description 28건의 일반명사 '장소'
--     ("박스 숨길 장소 지도", "비둘기들의 회의 장소로 쓰이는 벤치" 등) → 세계관 컨텐츠
--   · poi_categories.label → 지점 정보 (경계 규칙 2)
--
-- ↩️ 롤백: 아래 UPDATE의 SET/WHERE를 뒤집어 실행 (원문은 주석에 그대로 남겨둠)

BEGIN;

-- 1) 미션 제목 4건 — '방문 챌린지' → '체크인 챌린지'
--    A~D 접미사를 보존해야 하므로 문자열 치환(replace)으로 처리한다.
UPDATE public.missions
SET title = replace(title, '방문 챌린지', '체크인 챌린지')
WHERE title LIKE '지정 스팟 방문 챌린지%';

-- 2) 미션 설명 4건 — '지정된 장소를 방문해보세요.' → '지정된 지점에 체크인해보세요.'
UPDATE public.missions
SET description = '지정된 지점에 체크인해보세요.'
WHERE description = '지정된 장소를 방문해보세요.';

-- 3) 투데이 카드 부제 1건 — '가까운 장소에서 픽업해보세요' → '가까운 지점에서 픽업해보세요'
--    (드랍/픽업 지점 문구라 '체크인'이 아니라 '지점'으로 간다 — 경계 규칙 3)
UPDATE public.today_cards
SET subtitle = '가까운 지점에서 픽업해보세요'
WHERE subtitle = '가까운 장소에서 픽업해보세요';

COMMIT;

-- 🧪 적용 후 검증
--   SELECT title, description FROM public.missions WHERE title LIKE '지정 스팟%';
--     → '지정 스팟 체크인 챌린지 A~D' / '지정된 지점에 체크인해보세요.'
--   SELECT subtitle FROM public.today_cards WHERE subtitle LIKE '%픽업해보세요';
--     → '가까운 지점에서 픽업해보세요'
--   SELECT count(*) FROM public.missions WHERE title LIKE '%방문%' OR description LIKE '%방문%';
--     → 0
