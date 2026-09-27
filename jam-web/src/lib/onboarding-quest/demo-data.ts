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
