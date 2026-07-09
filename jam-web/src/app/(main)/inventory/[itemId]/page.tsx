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

  return (
    <div className="px-4 pt-5 pb-10 min-h-full">
      {/* 뒤로가기 */}
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 text-white/50 text-sm mb-6 active:text-white/80"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        인벤토리
      </Link>

      {/* 배지 이미지 */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-32 h-32 rounded-2xl overflow-hidden bg-white/10 flex items-center justify-center mb-4 shadow-lg">
          {item.badge.image_url ? (
            <Image
              src={item.badge.image_url}
              alt={item.badge.name}
              width={128}
              height={128}
              className="object-cover w-full h-full"
            />
          ) : (
            <span className="text-6xl">🏷️</span>
          )}
        </div>
        <h1 className="text-xl font-bold text-white text-center mb-2">{item.badge.name}</h1>
        <div className="flex items-center gap-2">
          <RarityBadge rarity={item.badge.rarity} />
          <span className="text-white/40 text-xs font-mono">
            #{String(item.serial_number).padStart(4, '0')}
          </span>
        </div>
      </div>

      {/* 정보 카드 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-xs text-white/40 uppercase tracking-wider font-medium">아이템 정보</p>
        </div>
        <div className="divide-y divide-white/5">
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-white/50">시리얼 넘버</span>
            <span className="text-sm text-white font-mono">
              #{String(item.serial_number).padStart(4, '0')}
            </span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-white/50">획득 방법</span>
            <span className="text-sm text-white">
              {item.obtained_by === 'drop' ? '활동 드랍' : '시스템 지급'}
            </span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-white/50">획득일</span>
            <span className="text-sm text-white">{formatDate(item.obtained_at)}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-white/50">만료일</span>
            <span className={`text-sm font-medium ${expiring ? 'text-red-400' : item.expires_at ? 'text-white' : 'text-white/40'}`}>
              {item.expires_at ? formatDate(item.expires_at) : '없음'}
              {expiring && ' ⚠️'}
            </span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-sm text-white/50">희귀도</span>
            <RarityBadge rarity={item.badge.rarity} />
          </div>
        </div>
      </div>

      {/* 배지 설명 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-xs text-white/40 uppercase tracking-wider font-medium">이 아이템 정보</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-white/70 leading-relaxed">
            {item.badge.description || '설명이 없습니다.'}
          </p>
        </div>
      </div>

      {expiring && (
        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <p className="text-sm text-red-400 font-medium">⚠️ 만료 임박</p>
          <p className="text-xs text-red-400/70 mt-0.5">7일 이내에 이 아이템이 만료됩니다.</p>
        </div>
      )}
    </div>
  )
}
