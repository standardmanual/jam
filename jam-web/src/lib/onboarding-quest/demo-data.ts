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
