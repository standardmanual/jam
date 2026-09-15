-- ============================================================
-- 티켓 20260914_1945 후속 — 유출 배지의 피드·알림 잔존 기록 제거 (2026-09-15, 티켓 20260915_1005)
--
-- 20260914_1945/20260915_0912에서 인벤토리는 정리했지만, 드랍 당시 함께 기록된
-- user_activity_feed(피드)·notifications(알림함 activity_recap) 항목은 그대로 남아있었다.
-- notifications.payload.item_badges는 하루 단위로 다른 정상 드랍과 배열로 묶여 있어
-- 행 전체 삭제가 아니라 배열 안에서 대상 6건만 골라 제거해야 한다.
-- ============================================================

-- ① 피드 — 6건 모두 이 6개체 전용 단일 행이라 행 자체를 삭제한다.
DELETE FROM public.user_activity_feed
WHERE metadata->>'inventory_item_id' IN (
  '184bbf52-4de5-4b39-9a22-5e33062381d6',
  'c63a5a44-48a1-4d54-af33-1d9614927bd0',
  'abcec529-f60d-41bf-ab18-556daa3c70b9',
  '8f50e52b-0925-402d-979a-21fa5348de04',
  '938ec269-daef-435e-941d-e469b9f65351',
  'cb55eb76-1d57-4730-a023-ce855ed83b94'
);

-- ② 알림함 activity_recap — payload.item_badges 배열에서 대상 6건만 제거(다른 정상 드랍은 유지)
UPDATE public.notifications
SET payload = jsonb_set(
  payload,
  '{item_badges}',
  COALESCE(
    (SELECT jsonb_agg(elem)
     FROM jsonb_array_elements(payload->'item_badges') elem
     WHERE elem->>'inventory_item_id' NOT IN (
       '184bbf52-4de5-4b39-9a22-5e33062381d6',
       'c63a5a44-48a1-4d54-af33-1d9614927bd0',
       'abcec529-f60d-41bf-ab18-556daa3c70b9',
       '8f50e52b-0925-402d-979a-21fa5348de04',
       '938ec269-daef-435e-941d-e469b9f65351',
       'cb55eb76-1d57-4730-a023-ce855ed83b94'
     )
    ), '[]'::jsonb
  )
)
WHERE type = 'activity_recap'
  AND payload->'item_badges' @> '[]'::jsonb
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload->'item_badges') elem
    WHERE elem->>'inventory_item_id' IN (
      '184bbf52-4de5-4b39-9a22-5e33062381d6',
      'c63a5a44-48a1-4d54-af33-1d9614927bd0',
      'abcec529-f60d-41bf-ab18-556daa3c70b9',
      '8f50e52b-0925-402d-979a-21fa5348de04',
      '938ec269-daef-435e-941d-e469b9f65351',
      'cb55eb76-1d57-4730-a023-ce855ed83b94'
    )
  );
