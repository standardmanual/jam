'use client'

import { d } from '@/lib/i18n'

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
      className="inline-flex items-center justify-center w-full min-h-11 text-center rounded-full px-6 py-[14px] text-base text-foreground bg-surface active:scale-95 transition-transform duration-100"
    >
      {d.badges.viewOnMapButton} ↗
    </a>
  )
}
