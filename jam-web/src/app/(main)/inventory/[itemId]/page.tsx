import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import RarityBadge from '@/components/ui/Badge'
import TopNav from '@/components/ui/TopNav'
import ListRowCard from '@/components/ui/ListRowCard'
import { MedalIcon, BookIcon, ChevronRightIcon } from '@/components/ui/icons'
import { InventoryItemRow, BadgeRow, ItemBookRow } from '@/types/database'
import LocalDate from '@/components/LocalDate'
import InventoryItemHistorySheet from './InventoryItemHistorySheet'
import { d } from '@/lib/i18n'

type InventoryItemWithBadge = InventoryItemRow & {
  badge: BadgeRow
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

  // 연결된 아이템북 (있으면 상세 화면 링크로 노출)
  let itemBook: ItemBookRow | null = null
  if (item.badge.item_book_id) {
    const { data: itemBookRaw } = await supabase
      .from('item_books')
      .select('*')
      .eq('id', item.badge.item_book_id)
      .maybeSingle()
    itemBook = itemBookRaw as ItemBookRow | null
  }

  const expiring = isExpiringSoon(item.expires_at)
  const serial = `${item.serial_prefix ?? '????'}${String(item.serial_number).padStart(6, '0')}`

  return (
    <div className="min-h-full bg-[var(--color-bg)] text-text">
      <TopNav title={d.common.back} backHref="/inventory" />

      {/* hero-section */}
      <div className="flex flex-col items-center gap-4 pt-[32px] pb-[32px] px-6">
        <div className="w-[200px] h-[200px] rounded-full bg-white overflow-hidden flex items-center justify-center">
          {item.badge.image_url ? (
            <Image
              src={item.badge.image_url}
              alt={item.badge.name}
              width={200}
              height={200}
              className="object-contain w-full h-full p-[var(--spacing-16)]"
            />
          ) : (
            <MedalIcon className="w-20 h-20 text-black/20" />
          )}
        </div>
        <RarityBadge rarity={item.badge.rarity} />
        <Link
          href={`/badges/${item.badge.id}`}
          className="text-[12px] text-[var(--color-text-secondary)] text-center"
        >
          배지 상세
        </Link>
        <h1 className="text-[36px] font-bold text-text text-center leading-tight">{item.badge.name}</h1>
      </div>

      <hr className="border-0 border-t border-[var(--color-border)]" />

      {/* info-section */}
      <div className="flex flex-col gap-1 p-6">
        {/* serial + 획득방법 서브카드 */}
        <div className="bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-border)] rounded-[20px] overflow-hidden mb-1">
          <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)]">
            <span className="text-[14px] text-[var(--color-text-secondary)]">{d.inventory.serialNumber}</span>
            <span className="text-[14px] text-text font-mono tracking-widest">{serial}</span>
          </div>
          <InventoryItemHistorySheet itemId={itemId} obtainedBy={item.obtained_by} />
        </div>

        {/* 메인 정보 카드 */}
        <div className="bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-border)] rounded-[20px] overflow-hidden">
          <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)]">
            <span className="text-[14px] text-[var(--color-text-secondary)]">{d.inventory.obtainedAt}</span>
            <span className="text-[14px] text-text">
              <LocalDate iso={item.obtained_at} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} />
            </span>
          </div>
          <hr className="border-0 border-t border-[var(--color-border)]" />
          <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)]">
            <span className="text-[14px] text-[var(--color-text-secondary)]">{d.inventory.expiresAt}</span>
            <span className="text-[14px] text-text">
              {item.expires_at ? (
                <LocalDate iso={item.expires_at} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} />
              ) : (
                d.inventory.expiresNone
              )}
            </span>
          </div>
          <hr className="border-0 border-t border-[var(--color-border)]" />
          <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)]">
            <span className="text-[14px] text-[var(--color-text-secondary)]">{d.inventory.rarity}</span>
            <RarityBadge rarity={item.badge.rarity} />
          </div>
        </div>
      </div>

      <hr className="border-0 border-t border-[var(--color-border)]" />

      {/* desc-section */}
      <div className="flex flex-col gap-4 px-6 pt-6 pb-[40px]">
        <p className="text-[11px] font-bold uppercase text-[var(--color-text-secondary)] tracking-wider">{d.inventory.descSectionTitle}</p>
        <div className="bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-border)] rounded-[20px] p-6">
          <p className="text-[13px] text-[var(--color-text-secondary)] text-center leading-[1.6]">
            {item.badge.description || d.inventory.noDescription}
          </p>
        </div>

        {/* 연결된 아이템북 */}
        {itemBook && (
          <ListRowCard
            href={`/itembooks/${itemBook.id}?from=badge&itemId=${itemId}`}
            icon={
              itemBook.image_url ? (
                <div className="w-11 h-11 rounded-[var(--radius-cards)] overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border)] shrink-0">
                  <Image src={itemBook.image_url} alt={itemBook.name} width={44} height={44} className="w-full h-full object-contain p-1" />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border)] flex items-center justify-center shrink-0">
                  <BookIcon className="w-5 h-5 text-[var(--color-text-secondary)]" />
                </div>
              )
            }
            title={itemBook.name}
            subtitle={d.inventory.belongsToItembook}
            trailing={<ChevronRightIcon className="w-4 h-4 text-[var(--color-text-secondary)]" />}
          />
        )}

        {/* 만료 임박 안내 */}
        {expiring && (
          <div className="bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-border)] rounded-[var(--radius-cards)] p-6">
            <p className="text-[15px] text-text">{d.inventory.expiringSoonTitle}</p>
            <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">{d.inventory.expiringSoonBody}</p>
          </div>
        )}
      </div>
    </div>
  )
}
