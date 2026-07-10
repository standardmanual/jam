'use client'

interface PoiMapButtonProps {
  lat: number
  lng: number
  poiName: string
}

export default function PoiMapButton({ lat, lng, poiName }: PoiMapButtonProps) {
  const googleUrl = `https://maps.google.com/?q=${lat},${lng}`

  return (
    <a
      href={googleUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full text-center bg-jam-ink text-white font-black py-2.5 rounded-xl text-sm border-2 border-jam-ink"
    >
      {poiName} 지도에서 보기 ↗
    </a>
  )
}
