-- 120: T23 '그냥 나갔다 옴'에 same_activity 플래그 추가 (티켓 20260831_2100 후속)
--
-- 배경: 마이그레이션 117이 T1 '야생의 첫발'에만 same_activity:true를 설정하고 CLOSED됐다.
-- 하지만 ACTIVITY_BADGES.md(193행)는 T23 '그냥 나갔다 옴'(distance_km:0.6 단독)도
-- "(단일 활동)"으로 명시하고 있어, A-1 목록(단독 distance_km/elevation_gain_m → 누적 합계
-- 전환 대상)에서 T23만 예외로 빠져 있었다(원 티켓 A-3 참고). CHECK 제약의 same_activity 키는
-- 117에서 이미 추가돼 있으므로(badges_condition_json_known_keys), 이 마이그레이션은 T23의
-- condition_json 데이터만 갱신한다 — 배지엔진 코드(src/lib/badge-engine/index.ts)는 T1
-- 적용 시점에 이미 same_activity:true를 필드 개수와 무관하게 제네릭으로 읽도록 구현돼 있어
-- 코드 변경이 필요 없다.
--
-- T23은 T1과 달리 단일 필드(distance_km)만 있어 필드 조합만으로는 "동시 충족 예외"인지
-- 판별할 수 없다 — 그래서 명시적 플래그가 필수다(2026-08-31 사용자 확인).
-- T23은 단일 등급(Epic)만 존재한다(ACTIVITY_BADGES.md 193행).
--
-- ⚠️ 순서 관련 주의는 117과 동일 원칙 적용 — 배지엔진 코드는 이미 same_activity를 제네릭하게
-- 읽으므로 이 마이그레이션 실행 전에는 T23이 "누적 합계"로 평가되고(임계값이 낮아 실질
-- 난이도 차이는 미미), 실행 후에는 "단일 활동 0.6km"로 정확히 평가된다.

BEGIN;

UPDATE public.badges
   SET condition_json = condition_json || '{"same_activity": true}'::jsonb
 WHERE type = 'activity'
   AND name = '그냥 나갔다 옴'
   AND condition_json ? 'distance_km'
   AND NOT (condition_json ? 'elevation_gain_m');

COMMIT;

-- ── 확인용 (실행하지 않음, 참고) ──────────────────────────────────────
-- SELECT rarity, condition_json FROM public.badges
--  WHERE type='activity' AND name='그냥 나갔다 옴';
--    → 1행, condition_json에 "same_activity":true 포함돼야 함
