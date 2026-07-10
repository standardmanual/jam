import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import RarityBadge from '@/components/ui/Badge'
import { InventoryItemRow, BadgeRow } from '@/types/database'

type InventoryItemWithBadge = InventoryItemRow & {
  badge: BadgeRow
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

export default async function InventoryItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: itemData } = await supabase
    .from('inventory_items')
    .select('*, badge:badges(*)')
    .eq('id', itemId)
    .single()

  if (!itemData) notFound()

  const item = itemData as InventoryItemWithBadge

  // 인벤토리 소유 확인 (RLS가 커버하지만 명시적으로)
  const { data: inventoryCheck } = await supabase
    .from('inventory')
    .select('id')
    .eq('id', item.inventory_id)
    .eq('user_id', user.id)
    .single()

  if (!inventoryCheck) notFound()

  const expiring = isExpiringSoon(item.expires_at)
  const serial = `${item.serial_prefix ?? '????'}${String(item.serial_number).padStart(6, '0')}`

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-10 min-h-full bg-jam-teal">
      {/* 뒤로가기 */}
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 text-jam-ink font-bold text-sm mb-6"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        인벤토리
      </Link>

      {/* 배지 이미지 */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-32 h-32 rounded-[1.75rem] overflow-hidden bg-white border-[3px] border-jam-ink shadow-[5px_5px_0_0_#161616] flex items-center justify-center mb-4">
          {item.badge.image_url ? (
            <Image
              src={item.badge.image_url}
              alt={item.badge.name}
              width={128}
              height={128}
              className="object-contain w-full h-full p-3"
            />
          ) : (
            <span className="text-6xl">🏷️</span>
          )}
        </div>
        <h1 className="text-xl font-black text-jam-ink text-center mb-2">{item.badge.name}</h1>
        <div className="flex items-center gap-2">
          <RarityBadge rarity={item.badge.rarity} />
          <span className="text-jam-ink/40 text-xs font-mono font-bold">{serial}</span>
        </div>
      </div>

      {/* 정보 카드 */}
      <div className="bg-white border-[3px] border-jam-ink rounded-2xl overflow-hidden mb-4 shadow-[3px_3px_0_0_#161616]">
        <div className="px-4 py-3 border-b-[3px] border-jam-ink">
          <p className="text-xs text-jam-ink/50 uppercase tracking-wider font-black">아이템 정보</p>
        </div>
        <div className="divide-y divide-jam-ink/10">
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-jam-ink/50 font-semibold">일련번호</span>
            <span className="text-sm text-jam-ink font-mono tracking-widest font-bold">{serial}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-jam-ink/50 font-semibold">획득 방법</span>
            <span className="text-sm text-jam-ink font-bold">
              {item.obtained_by === 'drop' ? '활동 드랍' : '시스템 지급'}
            </span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-jam-ink/50 font-semibold">획득일</span>
            <span className="text-sm text-jam-ink font-bold">{formatDate(item.obtained_at)}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-jam-ink/50 font-semibold">만료일</span>
            <span className={`text-sm font-bold ${expiring ? 'text-red-600' : item.expires_at ? 'text-jam-ink' : 'text-jam-ink/40'}`}>
              {item.expires_at ? formatDate(item.expires_at) : '없음'}
              {expiring && ' ⚠️'}
            </span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-jam-ink/50 font-semibold">희귀도</span>
            <RarityBadge rarity={item.badge.rarity} />
          </div>
        </div>
      </div>

      {/* 배지 설명 */}
      <div className="bg-white border-[3px] border-jam-ink rounded-2xl overflow-hidden shadow-[3px_3px_0_0_#161616]">
        <div className="px-4 py-3 border-b-[3px] border-jam-ink">
          <p className="text-xs text-jam-ink/50 uppercase tracking-wider font-black">이 아이템 정보</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-jam-ink/80 leading-relaxed font-semibold">
            {item.badge.description || '설명이 없습니다.'}
          </p>
        </div>
      </div>

      {expiring && (
        <div className="mt-4 bg-red-50 border-[3px] border-red-600 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 font-black">⚠️ 만료 임박</p>
          <p className="text-xs text-red-700/70 mt-0.5 font-semibold">7일 이내에 이 아이템이 만료됩니다.</p>
        </div>
      )}
    </div>
  )
}
