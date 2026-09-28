/**
 * 온보딩 퀘스트 1~3단계 연출용 데이터 고정 값 (티켓 20260927_2125·20260927_2126, 상위
 * 20260927_2123 T2b·T3).
 *
 * 「황금빛 도토리」·「잃어버린 결혼반지」의 이름·이미지·등급이 사용자 확정값과 글자 단위로
 * 같은지, 1단계(RevealBadge)와 2단계(InventoryGridItem)가 같은 배지를 가리키는지를 고정한다.
 */
import { describe, it, expect } from 'vitest'
import {
  DEMO_SYNC_REVEAL_BADGE,
  DEMO_INVENTORY_ITEM,
  DEMO_PICKUP_POI,
  DEMO_PICKUP_DROP,
  VIRTUAL_MAP_IMAGE_SRC,
} from '../demo-data'
import { d } from '@/lib/i18n'

const GOLDEN_ACORN_ID = 'dde83b16-b888-4bae-878c-fee01813679b'
const GOLDEN_ACORN_IMAGE_URL =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-09/03-09-1.png?v=1789303162331'

const LOST_WEDDING_RING_ID = '708d9af4-3753-4fd0-b7e4-b4efbeda3faf'
const LOST_WEDDING_RING_IMAGE_URL =
  'https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/images/badges/factions/03-09/03-09-4.png?v=1789303163662'

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

  it('3단계 DEMO_PICKUP_DROP이 「잃어버린 결혼반지」 확정값과 같다', () => {
    expect(DEMO_PICKUP_DROP.badge_id).toBe(LOST_WEDDING_RING_ID)
    expect(DEMO_PICKUP_DROP.badge_name).toBe('잃어버린 결혼반지')
    expect(DEMO_PICKUP_DROP.badge_image_url).toBe(LOST_WEDDING_RING_IMAGE_URL)
    expect(DEMO_PICKUP_DROP.badge_rarity).toBe('common')
  })

  it('3단계 DEMO_PICKUP_DROP은 실제 픽업이 아니므로 일련번호 관련 필드가 모두 null이다', () => {
    expect(DEMO_PICKUP_DROP.serial).toBeNull()
    expect(DEMO_PICKUP_DROP.serial_prefix).toBeNull()
    expect(DEMO_PICKUP_DROP.serial_number).toBeNull()
    expect(DEMO_PICKUP_DROP.expires_at).toBeNull()
    expect(DEMO_PICKUP_DROP.dropper_name).toBeNull()
  })

  it('3단계 DEMO_PICKUP_POI는 드랍 범위 안이고 이름이 신규 문구(pickupMarkerLabel)와 같다', () => {
    expect(DEMO_PICKUP_POI.name).toBe(d.onboardingQuest.pickupMarkerLabel)
    expect(DEMO_PICKUP_POI.in_drop_range).toBe(true)
    expect(DEMO_PICKUP_POI.available_drops_count).toBe(1)
  })

  it('가상 지도 이미지 경로가 커밋된 정적 파일 경로와 같다', () => {
    expect(VIRTUAL_MAP_IMAGE_SRC).toBe('/onboarding-quest/demo-map.png')
  })
})
