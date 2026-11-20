-- 348 되돌림: 패턴 P26의 각도·카드 모양 설명·주의 문장을 348 이전 값으로 돌린다(티켓 20261120_1407).
-- 새 값(각도 0번 제목이 «잠긴 아이템 배지 열어 보기»)일 때만 바꾼다.
BEGIN;

UPDATE public.ops_patterns
SET
  angles = jsonb_set(
    jsonb_set(
      angles,
      '{0}',
      $a0${"note": "등급별 여는 포인트를 보여 준다", "type": "소개", "needs": ["badges"], "title": "잠긴 아이템 배지 한 개의 여는 값"}$a0$::jsonb
    ),
    '{1}',
    $a1${"note": "열 수 있는 잠긴 아이템 배지가 있는 유저에게 권한다(개인화)", "type": "유도", "needs": ["badges"], "title": "포인트가 모였다면 열어 보기"}$a1$::jsonb
  ),
  card_shapes = jsonb_set(card_shapes, '{0,note}', to_jsonb('배지 1개'::text)),
  pitfalls = replace(pitfalls, ' 잠긴 아이템 배지를 포인트로 여는 일을 알리는 카드는 특정 배지를 싣지 않는다(badge_ids를 비우고 content_intro, target_href는 /inventory). 열었는지는 유저마다 달라서 어떤 배지를 골라도 이미 연 유저에게는 맞지 않는다.', ''),
  updated_at = now()
WHERE pattern_no = 'P26'
  AND angles -> 0 ->> 'title' = '잠긴 아이템 배지 열어 보기';

COMMIT;
