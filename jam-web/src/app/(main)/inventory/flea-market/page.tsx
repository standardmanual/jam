import Link from 'next/link'
import Card from '@/components/ui/card'
import { d, t } from '@/lib/i18n'

export default function FleaMarketPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full bg-surface text-text px-[var(--spacing-24)] text-center pt-[env(safe-area-inset-top)] pb-[var(--spacing-32)]">
      <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] mb-[var(--spacing-16)]">{d.inventory.fleaMarketComingTitle}</h1>

      <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/70 mb-2">
        {t(d.inventory.fleaMarketComingBody1, { count: '3만명' })}
      </p>
      <p className="text-[11px] text-text/50">
        {d.inventory.fleaMarketComingBody2}
      </p>

      <Card className="mt-[var(--spacing-32)] w-full max-w-xs">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[11px] text-text-inverse/50">{d.inventory.fleaMarketConditionLabel}</span>
          <span className="text-[11px] text-text-inverse/50">{d.inventory.fleaMarketConditionStatus}</span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
          <div className="h-full bg-text-inverse rounded-full w-0" />
        </div>
        <p className="text-[11px] text-text-inverse/50 mt-2 text-center">{d.inventory.fleaMarketConditionTarget}</p>
      </Card>

      <Link
        href="/inventory"
        className="mt-[var(--spacing-32)] inline-flex items-center min-h-11 rounded-[var(--radius-nav-buttons)] px-[var(--spacing-24)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] shadow-[inset_0_0_0_1px_var(--color-border)]"
      >
        &larr; {d.inventory.backToInventoryLong}
      </Link>
    </div>
  )
}
