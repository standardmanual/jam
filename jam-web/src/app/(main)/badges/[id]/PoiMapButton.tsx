'use client'

import Button from '@/components/ui/Button'
import { d } from '@/lib/i18n'

interface PoiMapButtonProps {
  lat: number
  lng: number
  poiName: string
}

export default function PoiMapButton({ poiName }: PoiMapButtonProps) {
  const naverUrl = `https://map.naver.com/p/search/${encodeURIComponent(poiName)}`

  return (
    <Button
      href={naverUrl}
      external
      variant="secondary"
      fullWidth
      className="bg-surface text-center"
    >
      {d.badges.viewOnMapButton} ↗
    </Button>
  )
}
