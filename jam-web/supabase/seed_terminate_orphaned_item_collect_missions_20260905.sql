-- 티켓 20260905_1327: item_collect 미션 6건 종료 처리 (컨텐츠 결정 A. 폐기)
--
-- 배경: seed_phase13_missions_30.sql이 배지를 이름으로 조회해 condition_json.badge_id를
-- 채웠는데(`WHERE type = 'item' AND name = '...'`), 참조한 6종(다운 애로우/레인보우 하트/
-- 오픈 키/아이 오브 더 선/굿 바이브스 온리/러브 세이브)이 소프트 삭제된 행 중에도 없다 —
-- 아이템 배지 카탈로그가 통째로 교체돼 복구 불가능하다(1327 배경 조사, 2026-09-05 실측).
-- 그 결과 condition_json이 {"badge_id": null}로 저장됐고, checker.ts의 calculateProgress()가
-- `condition.badge_id && ownership.ownedBadgeIds.has(...)`에서 항상 false를 반환해 이 6건은
-- 구조적으로 영원히 달성 불가능하다(참가자 19명 / 완료 0명).
--
-- 사용자 결정(1327 ① 컨텐츠 결정 — A. 폐기): 새 배지로 재지정하지 않고 6건을 종료 처리한다.
-- 하드 삭제가 아니라 ends_at을 과거로 돌려 "종료된 미션"으로 남긴다. 참가자 19명의 기존
-- user_mission_participations 등 참가 기록은 그대로 보존한다(삭제하지 않음).
--
-- 대상 식별: mission_type = 'item_collect' AND condition_json->>'badge_id' IS NULL 만으로
-- 충분하다 — 1327 배경 조사(미션 45건 전수 조사)에서 이 조합이 정확히 이 6건('다운 애로우'
-- '레인보우 하트' '오픈 키' '아이 오브 더 선' '굿 바이브스 온리' '러브 세이브' 배지 획득 미션)
-- 유일함을 이미 확인했다. 제목 문자열의 따옴표 표기(직선/곡선)를 확신할 수 없어 WHERE 절에
-- 제목 매치를 넣지 않았다 — 잘못 넣으면 0건 매치로 조용히 아무 일도 안 하는 실패가 더 위험하다.
--
-- 실행 전 확인 쿼리 (영향 범위 — 6건 예상. 제목이 위 6종과 일치하는지 눈으로 대조할 것):
--   SELECT id, title, ends_at, condition_json
--   FROM public.missions
--   WHERE mission_type = 'item_collect'
--     AND (condition_json->>'badge_id') IS NULL;
--
-- 실행 후 확인 (전부 ends_at < now()인지):
--   SELECT id, title, ends_at FROM public.missions
--   WHERE mission_type = 'item_collect' AND (condition_json->>'badge_id') IS NULL;

UPDATE public.missions
SET ends_at = now() - interval '1 day'
WHERE mission_type = 'item_collect'
  AND (condition_json->>'badge_id') IS NULL
  -- 이미 종료된 미션은 건드리지 않는다(재실행 안전 — 어드민이 그 사이 직접 종료했을 수 있다)
  AND (ends_at IS NULL OR ends_at >= now());
