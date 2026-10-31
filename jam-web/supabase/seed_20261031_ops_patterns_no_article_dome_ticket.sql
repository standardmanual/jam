-- seed_20261031_ops_patterns_no_article_dome_ticket.sql
-- 에이전트 기획에서 기사 방식을 빼고, 카드 모양 돔(dome)·티켓(ticket)을 패턴 사전에 배정한다 (티켓 20261031_2049, 사용자 지시 2026-10-31).
--
-- ⚠️ Supabase는 staging·프로덕션 공용 단일 DB다. 실행하는 순간 다음 주간 루틴(2026-11-03)이 읽는 패턴 사전이 바뀐다.
--   바꾸는 표: ops_patterns 5행(P02, P03, P04, P07, P10)만. 다른 패턴·공통 규칙·취향 신호는 건드리지 않는다.
--   서비스의 기사 카드(editorial_article)와 /today/[id] 화면은 건드리지 않는다. 에이전트가 기획에서 기사를 제안하지 않게만 한다.
--
-- 바꾸는 내용
--   P02 하루 중 짧은 시간에만 열린다   : 카드 모양에 ticket 추가
--   P03 달력의 그날에만 열린다         : 카드 모양에 ticket, dome 추가
--   P04 궂은 날엔 집에서 할 것을 준다   : hero(기사)를 dome으로 바꾸고, 원리·보상·조건의 «서사 읽기»를 «컬렉션 구경»으로 고침
--   P07 놓인 곳을 알려 준다            : hero(기사)를 dome으로 바꾸고, 원리·손잡이·주의점의 «기사»를 «카드»로 고침
--   P10 이야기를 회차로 나눠 푼다       : hero(기사·연재)를 ticket(회차 카드)·poster(에필로그 카드)로 바꾸고, «기사»를 «카드»로 고침
--
-- 백업: ops_patterns_backup_20261031 (위 5행 전체). 되돌림 SQL은 파일 맨 아래.
-- 실행: 한 번의 호출(BEGIN/COMMIT 없음). 가드가 어긋나면 RAISE EXCEPTION으로 전체가 되돌아간다.

DO $seed$
DECLARE
  v_n int;
BEGIN
  -- 가드 ①: 대상 5행이 모두 있고 사용 중이다.
  SELECT count(*) INTO v_n FROM public.ops_patterns
   WHERE pattern_no IN ('P02', 'P03', 'P04', 'P07', 'P10') AND status = 'active';
  IF v_n <> 5 THEN
    RAISE EXCEPTION '가드 ①: 사용 중인 대상 패턴이 5행이어야 해요(지금 %).', v_n;
  END IF;

  -- 가드 ②: 백업 표가 아직 없다(이미 한 번 실행했다면 멈춘다).
  IF to_regclass('public.ops_patterns_backup_20261031') IS NOT NULL THEN
    RAISE EXCEPTION '가드 ②: 백업 표 ops_patterns_backup_20261031이 이미 있어요(이미 실행했는지 확인).';
  END IF;

  -- 가드 ③: 바꿀 문구가 기대한 자리에 그대로 있다.
  IF (SELECT principle FROM public.ops_patterns WHERE pattern_no = 'P07') NOT LIKE '%기사 속 힌트%'
     OR (SELECT knobs #>> '{place,open}' FROM public.ops_patterns WHERE pattern_no = 'P07') NOT LIKE '%기사에는 힌트만 준다%'
     OR (SELECT pitfalls FROM public.ops_patterns WHERE pattern_no = 'P07') NOT LIKE '%기사도 28과 같은%'
     OR (SELECT principle FROM public.ops_patterns WHERE pattern_no = 'P10') NOT LIKE '%홈피드 기사·드랍·미션·믹스%'
     OR (SELECT knobs #>> '{reward,open}' FROM public.ops_patterns WHERE pattern_no = 'P10') NOT LIKE '%에필로그 기사다%'
     OR (SELECT knobs #>> '{condition,open}' FROM public.ops_patterns WHERE pattern_no = 'P10') NOT LIKE '%에필로그(홈피드 기사)%'
     OR (SELECT principle FROM public.ops_patterns WHERE pattern_no = 'P04') NOT LIKE '%인벤토리 정리·믹스·서사 읽기 같은%'
     OR (SELECT knobs #>> '{reward,open}' FROM public.ops_patterns WHERE pattern_no = 'P04') NOT LIKE '%기존 믹스·서사·인벤토리 활동의 결과%'
     OR (SELECT knobs #>> '{condition,open}' FROM public.ops_patterns WHERE pattern_no = 'P04') NOT LIKE '%인벤토리 정리·믹스·서사 읽기다%'
  THEN
    RAISE EXCEPTION '가드 ③: 바꿀 문구가 기대한 자리에 없어요(패턴 사전이 그 사이에 바뀐 것 같아요).';
  END IF;

  -- 백업
  CREATE TABLE public.ops_patterns_backup_20261031 AS
    SELECT * FROM public.ops_patterns WHERE pattern_no IN ('P02', 'P03', 'P04', 'P07', 'P10');
  ALTER TABLE public.ops_patterns_backup_20261031 ENABLE ROW LEVEL SECURITY;

  -- P02: 티켓 추가
  UPDATE public.ops_patterns SET
    card_shapes = card_shapes || '[{"shape":"ticket","note":"시간대가 정해진 미션을 한정 이용권처럼 보일 때"}]'::jsonb,
    updated_at = now()
  WHERE pattern_no = 'P02';

  -- P03: 티켓·돔 추가
  UPDATE public.ops_patterns SET
    card_shapes = card_shapes || '[{"shape":"ticket","note":"그날에만 열리는 미션·드랍을 날짜 이용권처럼 보일 때"},{"shape":"dome","note":"절기 컬렉션 소식, 대표 이미지가 아치 구도에 어울릴 때"}]'::jsonb,
    updated_at = now()
  WHERE pattern_no = 'P03';

  -- P04: 기사(hero) 대신 돔, «서사 읽기»를 «컬렉션 구경»으로
  UPDATE public.ops_patterns SET
    principle = replace(principle, '인벤토리 정리·믹스·서사 읽기 같은', '인벤토리 정리·믹스·컬렉션 구경 같은'),
    knobs = jsonb_set(
              jsonb_set(knobs, '{reward,open}', to_jsonb(replace(knobs #>> '{reward,open}', '기존 믹스·서사·인벤토리 활동의 결과', '기존 믹스·컬렉션·인벤토리 활동의 결과'))),
              '{condition,open}', to_jsonb(replace(knobs #>> '{condition,open}', '인벤토리 정리·믹스·서사 읽기다', '인벤토리 정리·믹스·컬렉션 구경이다'))),
    card_shapes = '[{"shape":"brief","note":""},{"shape":"dome","note":"집 안에서 할 것을 이미지로 크게 알릴 때, 창이나 문 같은 아치 구도"}]'::jsonb,
    updated_at = now()
  WHERE pattern_no = 'P04';

  -- P07: 기사(hero) 대신 돔, «기사»를 «카드»로
  UPDATE public.ops_patterns SET
    principle = replace(principle, '기사 속 힌트', '카드 속 힌트'),
    pitfalls = replace(pitfalls, '기사도 28과 같은', '카드도 28과 같은'),
    knobs = jsonb_set(knobs, '{place,open}', to_jsonb(replace(knobs #>> '{place,open}', '기사에는 힌트만 준다', '카드에는 힌트만 준다'))),
    card_shapes = '[{"shape":"brief","note":"드랍·예보"},{"shape":"dome","note":"힌트나 목격담을 이미지로 알릴 때, 문을 여는 아치 구도"}]'::jsonb,
    updated_at = now()
  WHERE pattern_no = 'P07';

  -- P10: 기사(hero) 대신 회차 카드(ticket)·에필로그 카드(poster), «기사»를 «카드»로
  UPDATE public.ops_patterns SET
    principle = replace(principle, '홈피드 기사·드랍·미션·믹스', '홈피드 카드·드랍·미션·믹스'),
    knobs = jsonb_set(
              jsonb_set(knobs, '{reward,open}', to_jsonb(replace(knobs #>> '{reward,open}', '에필로그 기사다', '에필로그 카드다'))),
              '{condition,open}', to_jsonb(replace(knobs #>> '{condition,open}', '에필로그(홈피드 기사)', '에필로그(홈피드 카드)'))),
    card_shapes = '[{"shape":"ticket","note":"회차 카드, 막마다 한 장씩 이용권처럼"},{"shape":"poster","note":"에필로그 카드"},{"shape":"square","note":"이어지는 자원의 모양(미션 `square`, 레시피 `list`)"},{"shape":"list","note":"이어지는 자원의 모양(미션 `square`, 레시피 `list`)"}]'::jsonb,
    updated_at = now()
  WHERE pattern_no = 'P10';

  -- 사후 확인 ①: 사용 중인 패턴에 «기사»가 남은 곳이 없다(취향 신호 P16 «열독가(82)»는 다른 표라 대상 밖).
  SELECT count(*) INTO v_n FROM public.ops_patterns
   WHERE status <> 'archived'
     AND (principle ILIKE '%기사%' OR user_experience ILIKE '%기사%' OR samples::text ILIKE '%기사%'
          OR knobs::text ILIKE '%기사%' OR pitfalls ILIKE '%기사%' OR card_shapes::text ILIKE '%기사%'
          OR card_shapes::text ILIKE '%hero%');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '사후 확인 ①: 기사·hero가 남은 패턴이 %행이에요.', v_n;
  END IF;

  -- 사후 확인 ②: 모양 값이 모두 허용 7종이다.
  SELECT count(*) INTO v_n FROM public.ops_patterns p, jsonb_array_elements(p.card_shapes) e
   WHERE e->>'shape' NOT IN ('hero', 'poster', 'square', 'brief', 'list', 'dome', 'ticket');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '사후 확인 ②: 허용하지 않는 모양이 %건이에요.', v_n;
  END IF;

  -- 사후 확인 ③: 돔·티켓이 배정된 패턴 수(돔 P03·P04·P07, 티켓 P02·P03·P10).
  SELECT count(*) INTO v_n FROM public.ops_patterns
   WHERE (card_shapes @> '[{"shape":"dome"}]'::jsonb AND pattern_no IN ('P03', 'P04', 'P07'))
      OR (card_shapes @> '[{"shape":"ticket"}]'::jsonb AND pattern_no IN ('P02', 'P03', 'P10'));
  IF v_n <> 5 THEN
    RAISE EXCEPTION '사후 확인 ③: 배정이 기대와 달라요(돔 또는 티켓이 있는 대상 패턴 %행, 기대 5행).', v_n;
  END IF;
END
$seed$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 되돌림 SQL (필요할 때만 실행. 백업 표에서 5행을 원래 값으로 복원한다)
--
-- UPDATE public.ops_patterns p SET
--   principle = b.principle, user_experience = b.user_experience, menus = b.menus, samples = b.samples,
--   card_shapes = b.card_shapes, knobs = b.knobs, pitfalls = b.pitfalls, updated_at = b.updated_at
-- FROM public.ops_patterns_backup_20261031 b WHERE p.pattern_no = b.pattern_no;
-- DROP TABLE public.ops_patterns_backup_20261031;
