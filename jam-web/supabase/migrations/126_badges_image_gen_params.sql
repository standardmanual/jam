-- 20260902_1613: 액티비티 배지 이미지 생성기 — 저작 파라미터 컬럼 추가
--
-- `/admin/activity-badge-image`가 클라이언트 캔버스로 구운 정사각 PNG를 `badges.image_url`에
-- 반영할 때, **그 이미지를 만든 입력값 전체**를 함께 저장한다.
--
-- 주 용도는 재편집이다. 과거 배경 제너레이터가 "완성 이미지만 저장해 다시 열 수 없다"는 점이
-- 실사용 불편의 주원인이었다(티켓 20260901_1944). 특히 배경 블롭은 애니메이션 중 **일시정지한
-- 한 프레임**을 굽기 때문에, 정지 위상(`background.phase`, rad)을 저장하지 않으면 다시 열었을
-- 때 같은 그림을 재현할 수 없다 — 이 컬럼의 필수 저장 항목이다.
--
-- 부수 효과로 "이 도구로 구운 이미지인가"를 식별할 수 있다(NOT NULL이면 신 포맷). 다만 그
-- 분기를 쓰는 서비스 코드는 이 티켓 범위 밖이라 아직 없다.
--
-- 저장 형태(jsonb):
--   {
--     "version": 1,
--     "rarity": "mystic",
--     "name": "동네 산책러\n레벨업",
--     "condition": "누적 30000회",
--     "background": {
--       "type": "blob",
--       "colors": ["#ff6d30", "#a8aded", "#ffe5d1", "#ff4c00"],
--       "bgColor": "#555555",
--       "speed": 1, "seed": 21, "blur": 0.54, "scale": 0.66,
--       "phase": 12.34
--     }
--   }
-- `rarity`/`name`을 함께 남기는 이유: 나중에 DB의 name·rarity가 바뀌면 구운 이미지가 낡는데,
-- 그때 불일치를 감지할 근거가 된다(감지 UI는 이 티켓 범위 밖).
--
-- `background_animation`(마이그레이션 124)을 재사용하지 않는 이유: 그 컬럼에 값이 들어가면
-- 서비스가 Hero 카드에 라이브 블롭을 **또** 그려 배경이 이중이 된다(구운 이미지 배경 + 라이브
-- 배경). 액티비티 배지는 라이브 애니메이션을 쓰지 않으므로 의미가 다른 값을 얹지 않는다.

ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS image_gen_params JSONB;

COMMENT ON COLUMN public.badges.image_gen_params IS
  '어드민 액티비티 배지 이미지 생성기(/admin/activity-badge-image)가 image_url을 구울 때 쓴 저작 파라미터(jsonb). 재편집용. NULL이면 이 도구로 구운 이미지가 아님. 20260902_1613';
