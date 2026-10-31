-- seed_20261031_capsule_gauge_sample.sql
-- 캡슐 게이지와 합친 연출을 staging에서 눈으로 확인하기 위한 샘플 데이터 (스테이징 자동 로그인 계정 dev-tester@jam.local 전용)
--
-- Supabase는 staging·프로덕션 공용 단일 DB다. 이 파일은 마이그레이션이 아니라 임시 시험용이며, 확인이 끝나면 아래 «지우기»를 실행한다.
-- 건드리는 곳은 dev-tester(00000000-0000-0000-0000-000000000001) 한 계정의 두 곳뿐이다.
--   1) user_capsules.filled: 홈 캡슐 게이지의 채움 (원래 값 0, required 5)
--   2) capsule_unseen_results: 보지 않은 결과 한 건 (합친 연출 오버레이를 띄운다). payload에 "sample": true 표시를 둬서 지울 때 가려낸다.
-- 샘플 개체는 화면에 보일 이름·그림만 payload에 담은 값이다. 인벤토리 개체를 만들지 않으므로 «배지 보기»의 상세 이동은 열리지 않는다.
-- 희귀 이상 아이템 배지는 아직 그림이 없어, 샘플의 그림은 일반 등급 배지의 그림을 빌려 쓴다(디자인 확인용).
--
-- 합친 연출은 «봤어요»가 눌리면 seen_at이 채워져 다시 뜨지 않는다. 다시 보려면 «넣기»의 2)만 다시 실행한다.

-- ===== 넣기 =====
-- 1) 게이지 60% (3/5). 다른 단계를 보려면 filled를 0~5로 바꾼다
UPDATE public.user_capsules SET filled = 3, updated_at = now()
 WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- 2) 합친 연출: 열기 두 번(첫 열기에 일반·희귀·잠긴 에픽, 둘째 열기에 미스틱)
INSERT INTO public.capsule_unseen_results (user_id, payload)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'version', 1,
    'sample', true,
    'events', jsonb_build_array(
      jsonb_build_object(
        'openId', 'aaaaaaaa-0000-4000-8000-000000000001',
        'items', jsonb_build_array(
          jsonb_build_object('locked', false, 'inventoryItemId', 'bbbbbbbb-0000-4000-8000-000000000001',
            'badgeId', 'e26aee00-eb73-4af4-a4f6-a48089eef9fd', 'name', '각설탕 부스러기',
            'imageUrl', 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/tribes/01-06/item-01-06-8.png?v=1788944147300',
            'rarity', 'common', 'serialNumber', 12),
          jsonb_build_object('locked', false, 'inventoryItemId', 'bbbbbbbb-0000-4000-8000-000000000002',
            'badgeId', '4cf7ce3d-d8a5-49b3-b3d1-581220f093a6', 'name', '삼각김밥 포장지',
            'imageUrl', 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/tribes/01-06/item-01-06-8.png?v=1788944147300',
            'rarity', 'rare', 'serialNumber', 3),
          jsonb_build_object('locked', true, 'inventoryItemId', 'bbbbbbbb-0000-4000-8000-000000000003',
            'rarity', 'epic', 'unlockRequired', 200)
        ),
        'next', jsonb_build_object('required', 5, 'filled', 0),
        'chapterNo', null, 'reachedChapters', '[]'::jsonb, 'chapterCount', null
      ),
      jsonb_build_object(
        'openId', 'aaaaaaaa-0000-4000-8000-000000000002',
        'items', jsonb_build_array(
          jsonb_build_object('locked', false, 'inventoryItemId', 'bbbbbbbb-0000-4000-8000-000000000004',
            'badgeId', '28c688d8-e259-47b5-be63-b28b4cdd505e', 'name', '한 대만 도는 세탁기',
            'imageUrl', 'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/tribes/01-06/item-01-06-8.png?v=1788944147300',
            'rarity', 'mystic', 'serialNumber', 1)
        ),
        'next', jsonb_build_object('required', 5, 'filled', 0),
        'chapterNo', null, 'reachedChapters', '[]'::jsonb, 'chapterCount', null
      )
    )
  )
);

-- ===== 지우기 (확인이 끝나면 실행) =====
-- DELETE FROM public.capsule_unseen_results
--  WHERE user_id = '00000000-0000-0000-0000-000000000001' AND payload->>'sample' = 'true';
-- UPDATE public.user_capsules SET filled = 0, updated_at = now()
--  WHERE user_id = '00000000-0000-0000-0000-000000000001';
