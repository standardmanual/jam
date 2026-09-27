/**
 * 온보딩 퀘스트 1~2단계 연출용 데이터 고정 값 (티켓 20260927_2125, 상위 20260927_2123 T2b).
 *
 * 「황금빛 도토리」이름·이미지·등급이 사용자 확정값과 글자 단위로 같은지, 1단계(RevealBadge)와
 * 2단계(InventoryGridItem)가 같은 배지를 가리키는지를 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { DEMO_SYNC_REVEAL_BADGE, DEMO_INVENTORY_ITEM } from '../demo-data'

const GOLDEN_ACORN_ID = 'dde83b16-b888-4bae-878c-fee01813679b'
const GOLDEN_ACORN_IMAGE_URL =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-09/03-09-1.png?v=1789303162331'

describe('온보딩 퀘스트 연출용 데이터', () => {
  it('1단계 RevealBadge가 「황금빛 도토리」 확정값과 같다', () => {
    expect(DEMO_SYNC_REVEAL_BADGE.id).toBe(GOLDEN_ACORN_ID)
    expect(DEMO_SYNC_REVEAL_BADGE.name).toBe('황금빛 도토리')
    expect(DEMO_SYNC_REVEAL_BADGE.imageUrl).toBe(GOLDEN_ACORN_IMAGE_URL)
    expect(DEMO_SYNC_REVEAL_BADGE.rarity).toBe('common')
  })

  it('2단계 InventoryGridItem이 1단계와 같은 배지(id·이름·이미지·등급)를 가리킨다', () => {
    expect(DEMO_INVENTORY_ITEM.id).toBe(DEMO_SYNC_REVEAL_BADGE.id)
    expect(DEMO_INVENTORY_ITEM.badgeName).toBe(DEMO_SYNC_REVEAL_BADGE.name)
    expect(DEMO_INVENTORY_ITEM.badgeImageUrl).toBe(DEMO_SYNC_REVEAL_BADGE.imageUrl)
    expect(DEMO_INVENTORY_ITEM.badgeRarity).toBe('common')
  })
})
