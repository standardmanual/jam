import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import RarityBadge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import TopNav from '@/components/ui/TopNav'
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
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.common.back} backHref="/inventory" />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-32)]">
        {/* 배지 이미지 */}
        <div className="flex flex-col items-center mb-[var(--spacing-24)]">
          <div className="w-32 h-32 rounded-[var(--radius-cards)] overflow-hidden bg-surface-inverse shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center mb-[var(--spacing-16)]">
            {item.badge.image_url ? (
              <Image src={item.badge.image_url} alt={item.badge.name} width={128} height={128} className="object-contain w-full h-full p-3" />
            ) : (
              <MedalIcon className="w-12 h-12 text-text-inverse/40" />
            )}
          </div>
          <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] text-center mb-2">{item.badge.name}</h1>
          <div className="flex items-center gap-2">
            <RarityBadge rarity={item.badge.rarity} />
            <span className="text-text/40 text-[11px] font-mono">{serial}</span>
          </div>
        </div>

        {/* 정보 카드 */}
        <Card className="p-0 overflow-hidden mb-[var(--spacing-16)]">
          <div className="px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
            <p className="text-[10px] uppercase text-text-inverse/50">{d.inventory.infoSectionTitle}</p>
          </div>
          <div>
            <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.serialNumber}</span>
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-mono tracking-widest">{serial}</span>
            </div>
            <InventoryItemHistorySheet itemId={itemId} obtainedBy={item.obtained_by} />
            <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.obtainedAt}</span>
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]"><LocalDate iso={item.obtained_at} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} /></span>
            </div>
            <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.expiresAt}</span>
              <span className={`text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] ${expiring ? '' : item.expires_at ? '' : 'text-text-inverse/40'}`}>
                {item.expires_at ? <LocalDate iso={item.expires_at} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} /> : d.inventory.expiresNone}
                {expiring && ` · ${d.inventory.expiringSoonTitle}`}
              </span>
            </div>
            <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)]">
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.rarity}</span>
              <RarityBadge rarity={item.badge.rarity} />
            </div>
          </div>
        </Card>

        {/* 배지 설명 */}
        <Card className="p-0 overflow-hidden">
          <div className="px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
            <p className="text-[10px] uppercase text-text-inverse/50">{d.inventory.descSectionTitle}</p>
          </div>
          <div className="px-[var(--spacing-16)] py-[var(--spacing-16)]">
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/80">
              {item.badge.description || d.inventory.noDescription}
            </p>
          </div>
        </Card>

        {/* 연결된 아이템북 */}
        {itemBook && (
          <Link href={`/itembooks/${itemBook.id}?from=badge&itemId=${itemId}`}>
            <Card className="mt-[var(--spacing-16)] flex items-center gap-[var(--spacing-16)] active:scale-[0.98] transition-transform duration-100">
              {itemBook.image_url ? (
                <div className="w-11 h-11 rounded-[var(--radius-cards)] overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border-inverse)] shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={itemBook.image_url} alt={itemBook.name} className="w-full h-full object-contain p-1" />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center shrink-0">
                  <BookIcon className="w-5 h-5 text-text-inverse/50" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase text-text-inverse/50">{d.inventory.belongsToItembook}</p>
                <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{itemBook.name}</p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-text-inverse/30 shrink-0" />
            </Card>
          </Link>
        )}

        {expiring && (
          <Card className="mt-[var(--spacing-16)]">
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.inventory.expiringSoonTitle}</p>
            <p className="text-[11px] text-text-inverse/60 mt-0.5">{d.inventory.expiringSoonBody}</p>
          </Card>
        )}
      </div>
    </div>
  )
}
