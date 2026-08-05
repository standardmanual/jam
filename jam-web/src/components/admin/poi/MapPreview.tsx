'use client'

import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'

interface MapPreviewProps {
  latitude: number
  longitude: number
  radius: number
  name: string
}

export default function MapPreview({ latitude, longitude, radius, name }: MapPreviewProps) {
  const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`
  const naverMapsUrl = `https://map.naver.com/?query=${latitude},${longitude}`

  return (
    <div className="flex flex-col items-center justify-center h-full bg-muted p-4 space-y-4">
      <div className="text-center space-y-2">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </p>
        <p className="text-xs text-muted-foreground">
          반경: {radius}m
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full sm:flex-row sm:justify-center">
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="w-full sm:w-auto">
            <ExternalLink className="w-4 h-4 mr-2" />
            Google Maps
          </Button>
        </a>
        <a href={naverMapsUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="w-full sm:w-auto">
            <ExternalLink className="w-4 h-4 mr-2" />
            Naver Map
          </Button>
        </a>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Leaflet 지도는 향후 추가 예정입니다.
      </p>
    </div>
  )
}
