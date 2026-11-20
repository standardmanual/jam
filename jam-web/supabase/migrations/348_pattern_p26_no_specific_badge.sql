-- 348: 패턴 P26(포인트와 잠긴 아이템 배지)의 «열기 소개» 각도가 특정 배지를 싣지 않게 한다(티켓 20261120_1407).
-- 지금까지 «잠긴 아이템 배지 한 개의 여는 값» 각도가 배지 한 개를 고르게 해, 유저가 이미 연 배지가 «잠긴 채 온 배지, 열어 볼까요» 카드의 그림과 링크로 나왔다.
-- 열기 소개는 배지가 아니라 열기 기능을 알리는 카드라서 content_intro로 /inventory에 연결하고 badge_ids를 싣지 않는다.
-- 바꾸는 칸: angles[0]·angles[1], card_shapes[0].note, pitfalls 끝에 문장 하나. 현재 값이 아니면(이미 바뀌었으면) 아무것도 바꾸지 않는다.
-- 되돌림: 348_pattern_p26_no_specific_badge_down.sql
BEGIN;

UPDATE public.ops_patterns
SET
  angles = jsonb_set(
    jsonb_set(
      angles,
      '{0}',
      $a0${"type": "소개", "needs": [], "title": "잠긴 아이템 배지 열어 보기", "note": "포인트로 잠긴 아이템 배지를 열 수 있다는 소개다. 특정 배지를 싣지 않고(badge_ids 없음) content_intro로 쓰며 target_href는 /inventory다. 등급별 여는 값(50·100·200·400)을 보여 준다"}$a0$::jsonb
    ),
    '{1}',
    $a1${"type": "유도", "needs": [], "title": "포인트가 모였다면 열어 보기", "note": "열 수 있는 잠긴 아이템 배지가 있는 유저에게 권한다(개인화). 특정 배지를 싣지 않고 content_intro, target_href는 /inventory다"}$a1$::jsonb
  ),
  card_shapes = jsonb_set(
    card_shapes,
    '{0,note}',
    to_jsonb('배지 1개(열기 소개 각도는 배지 없이 content_intro)'::text)
  ),
  pitfalls = pitfalls || ' 잠긴 아이템 배지를 포인트로 여는 일을 알리는 카드는 특정 배지를 싣지 않는다(badge_ids를 비우고 content_intro, target_href는 /inventory). 열었는지는 유저마다 달라서 어떤 배지를 골라도 이미 연 유저에게는 맞지 않는다.',
  updated_at = now()
WHERE pattern_no = 'P26'
  AND angles -> 0 ->> 'title' = '잠긴 아이템 배지 한 개의 여는 값'
  AND angles -> 1 ->> 'title' = '포인트가 모였다면 열어 보기';

COMMIT;
