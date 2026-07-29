'use client'

import { d, t } from '@/lib/i18n'

interface PoiMapButtonProps {
  lat: number
  lng: number
  poiName: string
}

export default function PoiMapButton({ poiName }: PoiMapButtonProps) {
  const naverUrl = `https://map.naver.com/p/search/${encodeURIComponent(poiName)}`

  return (
    <a
      href={naverUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center w-full min-h-11 text-center rounded-[var(--radius-nav-buttons)] px-[var(--spacing-24)] py-[14px] text-[length:var(--text-body)] leading-[var(--leading-body)] text-text-inverse shadow-[inset_0_0_0_1px_var(--color-border-inverse)] active:scale-95 transition-transform duration-100"
    >
      {t(d.badges.viewOnMap, { name: poiName })} ↗
    </a>
  )
}
