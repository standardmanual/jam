/**
 * 온보딩 퀘스트 1~2단계 연출용 데이터 (티켓 20260927_2125, 상위 20260927_2123 T2b)
 *
 * 실제 카탈로그의 아이템배지 「황금빛 도토리」(숲속의 갱단, id `dde83b16-b888-4bae-878c-
 * fee01813679b`, Common) 값을 그대로 빌려 온다 — 이름·이미지는 DB 값을 글자 단위로
 * 복사했다(사용자 2026-09-28 확정). 이 파일의 상수는 클라이언트 전용 연출 데이터라
 * `inventory_items`·`user_activity_badges` 등 실제 테이블에는 저장되지 않는다.
 */
import type { RevealBadge } from '@/components/BadgeRevealOverlay'
import type { InventoryGridItem } from '@/components/inventory/InventoryGrid'
import type { NearbyPoi } from '@/types/drops'
import type { PickupDrop } from '@/app/(main)/drops/BadgeDetailSheet'
import type { RecipeWithSlots, InventoryItemWithBadge } from '@/app/(main)/combine/CombineClient'
import type { InventoryItem } from '@/components/PoiCarouselModal'
import { d } from '@/lib/i18n'

const GOLDEN_ACORN_ID = 'dde83b16-b888-4bae-878c-fee01813679b'
const GOLDEN_ACORN_NAME = '황금빛 도토리'
const GOLDEN_ACORN_DESCRIPTION =
  '일반 도토리 1,000개의 가치를 지닌다는 전설의 화폐. 살롱 VIP룸에 입장할 수 있는 티켓입니다.'
const GOLDEN_ACORN_IMAGE_URL =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-09/03-09-1.png?v=1789303162331'

/** 1단계 `BadgeRevealOverlay` 연출 배지 */
export const DEMO_SYNC_REVEAL_BADGE: RevealBadge = {
  id: GOLDEN_ACORN_ID,
  name: GOLDEN_ACORN_NAME,
  description: GOLDEN_ACORN_DESCRIPTION,
  imageUrl: GOLDEN_ACORN_IMAGE_URL,
  rarity: 'common',
}

/** 2단계 `InventoryGrid` 연출 아이템 — 같은 배지를 인벤토리 카드 형태로 정규화한 값 */
export const DEMO_INVENTORY_ITEM: InventoryGridItem = {
  id: GOLDEN_ACORN_ID,
  badgeName: GOLDEN_ACORN_NAME,
  badgeImageUrl: GOLDEN_ACORN_IMAGE_URL,
  badgeRarity: 'common',
}

/**
 * 3단계(픽업) 연출용 데이터 — 티켓 20260927_2126, 상위 20260927_2123 T3.
 *
 * 실제 카탈로그의 아이템배지 「잃어버린 결혼반지」(숲속의 갱단 03-09, id
 * `708d9af4-3753-4fd0-b7e4-b4efbeda3faf`, Common) 값을 글자 단위로 복사했다(사용자
 * 2026-09-28 확정, 황금빛 도토리 관례). 근거: `jam-web/supabase/migrations/019_seed_worldview.sql:392`,
 * `jam-doc/assets/image-production/02-style-groups/03 숲속의 갱단/briefs/03-09 그루터기 살롱의 VIP/
 * seed_03-09_badge_images.sql:5`.
 */
const LOST_WEDDING_RING_ID = '708d9af4-3753-4fd0-b7e4-b4efbeda3faf'
const LOST_WEDDING_RING_NAME = '잃어버린 결혼반지'
const LOST_WEDDING_RING_IMAGE_URL =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-09/03-09-4.png?v=1789303163662'

/**
 * 가상 지도 POI 마커 — 정지 상태, 이미지 좌하단 1/3 지점(사용자 결정 4, `QuestPickupScene.tsx`가
 * 좌표 자체는 쓰지 않고 화면 비율 위치로만 배치한다). `NearbyPoi`가 `PoiMarker`를 확장해
 * 카멜/스네이크 케이스 필드를 모두 요구하므로 값을 맞춰 채운다.
 */
export const DEMO_PICKUP_POI: NearbyPoi = {
  id: 'quest-demo-poi',
  name: d.onboardingQuest.pickupMarkerLabel,
  latitude: 0,
  longitude: 0,
  availableDrops: 1,
  distance_meters: 30,
  available_drops_count: 1,
  in_drop_range: true,
  poi_tier: 1,
}

/**
 * 가상 지도 POI에 드랍된 연출용 배지 1건 — 「살롱의 장물 시세」 슬롯 2 재료(T4 믹스
 * 실패·성공 공용). `serial`류 필드는 모두 null — `BadgeDetailSheet`가 `drop.serial &&`로
 * 이미 안전 분기하므로 일련번호 코드 블록이 자동으로 숨는다.
 */
export const DEMO_PICKUP_DROP: PickupDrop = {
  id: 'quest-demo-drop',
  badge_id: LOST_WEDDING_RING_ID,
  badge_name: LOST_WEDDING_RING_NAME,
  badge_rarity: 'common',
  badge_image_url: LOST_WEDDING_RING_IMAGE_URL,
  dropper_name: null,
  dropped_at: '2026-01-01T00:00:00.000Z',
  serial: null,
  serial_prefix: null,
  serial_number: null,
  expires_at: null,
}

/**
 * 가상 지도 배경 이미지 경로 — T3(픽업)·T5(드랍) 공용(사용자 결정 2). 사용자가 제공한
 * 지도 스크린샷을 하단 탭바·현재 위치 버튼을 잘라 427×985로 만든 파일을
 * `jam-web/public/onboarding-quest/demo-map.png`로 커밋했다(2026-09-28).
 */
export const VIRTUAL_MAP_IMAGE_SRC = '/onboarding-quest/demo-map.png'

/**
 * 4~5단계(믹스 레시피 확인·성공) 연출용 데이터 — 티켓 20260927_2127, 상위 20260927_2123 T4.
 *
 * 실제 레시피 「살롱의 장물 시세」(recipe id `02a59f9b-bc37-460c-89a7-689e7549c3c7`)의 슬롯·
 * 후보·보상을 글자 단위로 복사했다(사용자 2026-09-28 확정). 슬롯 1·2의 후보 중 하나씩은
 * 위에서 이미 정의한 「황금빛 도토리」·「잃어버린 결혼반지」다 — T3까지 픽업한 연출 재료가
 * 레시피에 정확히 맞으므로 픽업 재료를 늘릴 필요가 없다.
 */
const CATNIP_BUNDLE_ID = '9899913e-e606-457c-a8cb-7b9966579df2'
const CATNIP_BUNDLE_NAME = '최고급 캣닢 뭉치'
const CATNIP_BUNDLE_DESCRIPTION =
  '길고양이 보스들을 단숨에 무장해제시키고 배를 뒤집게 만드는 마약 같은 향기의 허브 뭉치입니다.'
const CATNIP_BUNDLE_IMAGE_URL =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-09/03-09-2.png?v=1789303163061'

const DIAMOND_CUBIC_ID = 'a8849baa-e910-490a-843c-d58a9a1b0887'
const DIAMOND_CUBIC_NAME = '다이아몬드 큐빅'
const DIAMOND_CUBIC_IMAGE_URL =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-09/03-09-3.png?v=1789303163421'

const SMART_KEY_FRAGMENT_ID = '6f479d5b-addc-48bf-993b-95f24f14e738'
const SMART_KEY_FRAGMENT_NAME = '스마트키 조각'
const SMART_KEY_FRAGMENT_IMAGE_URL =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-09/03-09-5.png?v=1789303164299'

const LUXURY_BAG_ZIPPER_ID = '609ebc0f-0af2-4301-b8d2-e0cef059543f'
const LUXURY_BAG_ZIPPER_NAME = '명품 가방의 지퍼'
const LUXURY_BAG_ZIPPER_IMAGE_URL =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-09/03-09-6.png?v=1789303164576'

/** 연출 레시피 「살롱의 장물 시세」 — 실제 `/combine` 레시피 목록·믹서 화면에 그대로 넘긴다. */
export const DEMO_MIX_RECIPE: RecipeWithSlots = {
  id: '02a59f9b-bc37-460c-89a7-689e7549c3c7',
  name: '살롱의 장물 시세',
  reward_points: 20,
  reward_badge_ids: [CATNIP_BUNDLE_ID],
  valid_from: null,
  created_at: '2026-01-01T00:00:00.000Z',
  slots: [
    {
      id: '4d9eda8d-53ff-4e13-b31a-c52a5ce26891',
      slot_order: 1,
      badge_type: 'item',
      candidates: [
        { id: GOLDEN_ACORN_ID, name: GOLDEN_ACORN_NAME, image_url: GOLDEN_ACORN_IMAGE_URL },
        { id: DIAMOND_CUBIC_ID, name: DIAMOND_CUBIC_NAME, image_url: DIAMOND_CUBIC_IMAGE_URL },
      ],
    },
    {
      id: '45d987d6-ebbd-4055-adce-3cadafab4f54',
      slot_order: 2,
      badge_type: 'item',
      candidates: [
        { id: LOST_WEDDING_RING_ID, name: LOST_WEDDING_RING_NAME, image_url: LOST_WEDDING_RING_IMAGE_URL },
        { id: SMART_KEY_FRAGMENT_ID, name: SMART_KEY_FRAGMENT_NAME, image_url: SMART_KEY_FRAGMENT_IMAGE_URL },
        { id: LUXURY_BAG_ZIPPER_ID, name: LUXURY_BAG_ZIPPER_NAME, image_url: LUXURY_BAG_ZIPPER_IMAGE_URL },
      ],
    },
  ],
  rewardBadges: [
    {
      id: CATNIP_BUNDLE_ID,
      name: CATNIP_BUNDLE_NAME,
      image_url: CATNIP_BUNDLE_IMAGE_URL,
      rarity: 'common',
      description: CATNIP_BUNDLE_DESCRIPTION,
    },
  ],
}

/**
 * 6단계(드랍) 연출용 가방 아이템 — 티켓 20260927_2128, 상위 20260927_2123 T5.
 * 5단계 믹스 성공 보상 「최고급 캣닢 뭉치」(`DEMO_MIX_RECIPE.rewardBadges[0]`)를 그대로
 * 가리킨다 — 믹스 결과물을 그대로 드랍하는 연출이라 새 아이템을 만들지 않는다. 인벤토리
 * 개체 id는 실제 테이블에 없는 값이라 `quest-demo-` 접두사를 붙인다(`DEMO_MIX_ITEMS`와 동일
 * 관례). `serial_number`는 `InventoryItem`이 NOT NULL이라 0으로 채운다.
 */
export const DEMO_DROP_ITEM: InventoryItem = {
  id: 'quest-demo-drop-item',
  badge_id: DEMO_MIX_RECIPE.rewardBadges[0].id,
  badge_name: DEMO_MIX_RECIPE.rewardBadges[0].name,
  badge_rarity: DEMO_MIX_RECIPE.rewardBadges[0].rarity ?? 'common',
  badge_image_url: DEMO_MIX_RECIPE.rewardBadges[0].image_url,
  serial_prefix: null,
  serial_number: 0,
  expires_at: null,
}

/**
 * 연출 가방 재료 2개 — 황금빛 도토리(2단계)·잃어버린 결혼반지(3단계)를 그대로 재사용한다.
 * 인벤토리 개체 id는 실제 테이블에 없는 값이라 `quest-demo-` 접두사를 붙인다. `serial_number`는
 * `InventoryItemRow`가 NOT NULL이라 0으로 채우되, `CombineClient`는 badge.name·image_url만
 * 참조해 화면 어디에서도 읽지 않는다.
 */
export const DEMO_MIX_ITEMS: InventoryItemWithBadge[] = [
  {
    id: 'quest-demo-mix-item-1',
    badge_id: GOLDEN_ACORN_ID,
    serial_prefix: null,
    serial_number: 0,
    badge: { id: GOLDEN_ACORN_ID, name: GOLDEN_ACORN_NAME, image_url: GOLDEN_ACORN_IMAGE_URL, rarity: 'common' },
  },
  {
    id: 'quest-demo-mix-item-2',
    badge_id: LOST_WEDDING_RING_ID,
    serial_prefix: null,
    serial_number: 0,
    badge: {
      id: LOST_WEDDING_RING_ID,
      name: LOST_WEDDING_RING_NAME,
      image_url: LOST_WEDDING_RING_IMAGE_URL,
      rarity: 'common',
    },
  },
]
