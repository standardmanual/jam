-- 369_probability_chapter_reward_switch_log.sql
-- 확률 안내 «바뀐 날짜» 표에 «받는 보상이 챕터 오름 보상으로 바뀐 날» 한 줄을 넣는다 (티켓 20261127_1738 C8, 상위 20261127_1720)
--
-- 🚨 전환 배포 때 메인 세션이 실행한다. 지금 실행하지 않는다.
--    확률 안내는 이 표에서 `affects_disclosure = true` 행을 읽어 날짜(created_at, 한국 표준시)와 문장을 그대로 보인다.
--    지금 넣으면 전환 전에 «챕터 오름 보상으로 바뀌었다»는 줄이 날짜와 함께 노출된다(DB는 staging·프로덕션 공용 단일 DB).
--    날짜는 이 문장이 실행된 시각(DEFAULT now())이므로 이관 실행(C1b)과 같은 배포 창에서 실행해 전환 날짜와 맞춘다.
--    실행 순서는 이관(C1b) 순서 목록의 «챕터 보상 전환 이력 행 삽입(369)» 한 줄이다.
--
-- 새 행 1개만 더한다. 스키마·옛 행·다른 표는 바꾸지 않는다. 열 구성과 `affects_disclosure` 조건은 마이그레이션 285(`balance_setting_changes`) 정의를 따른다.
--   section_key         'chapter_reward_switch' — 어드민 «챕터 오름 보상» 구역(C9b)의 구역 키 'chapter_reward'와 다르게 둔다. 어드민 구역의 «최근 변경»은 자기 키의 행만 읽으므로
--                       이 한 줄이 그 목록에 칸 정의 없는 행으로 끼어들지 않는다. 확률 안내(`lib/probability/changeLog.ts`)는 두 키를 모두 읽는다.
--   changes             [{ "field": "reward_system", "from": 0, "to": 1 }] — 값은 번호이고 화면 글자는 앱이 붙인다(0 = 이전 보상, 1 = 챕터 오름 보상).
--                       확률 안내에는 «받는 보상을 이전 보상에서 챕터 오름 보상으로 바꿨어요»로 보인다. 이력의 changes는 숫자만 담는다(`parseChanges`).
--   note, changed_by    NULL (확률 안내는 둘 다 읽지 않는다)
--   affects_disclosure  true — 확률 안내에 보이는 행이다
--
-- 다시 실행해도 행이 하나만 남는다(같은 구역 키의 행이 이미 있으면 넣지 않는다).
--
-- 적용 전 확인 쿼리(읽기 전용 SELECT):
--   SELECT count(*) FROM public.balance_setting_changes WHERE section_key = 'chapter_reward_switch';   -- 0
--
-- 적용 후 확인 쿼리(읽기 전용 SELECT):
--   SELECT section_key, changes, affects_disclosure, created_at AT TIME ZONE 'Asia/Seoul' AS created_kst
--     FROM public.balance_setting_changes WHERE section_key = 'chapter_reward_switch';                 -- 1행, changes = [{"to": 1, "from": 0, "field": "reward_system"}], true, 실행한 날짜

INSERT INTO public.balance_setting_changes (section_key, changes, note, affects_disclosure, changed_by)
SELECT 'chapter_reward_switch',
       '[{"field": "reward_system", "from": 0, "to": 1}]'::jsonb,
       NULL,
       true,
       NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.balance_setting_changes WHERE section_key = 'chapter_reward_switch'
);

-- 되돌림 SQL
-- 삽입한 행 한 줄만 지운다. 다른 이력 행은 건드리지 않는다. 지우면 확률 안내 «바뀐 날짜» 표에서 그 줄이 사라진다(표시 코드는 행이 없어도 그대로 동작한다).
-- DELETE FROM public.balance_setting_changes WHERE section_key = 'chapter_reward_switch';
