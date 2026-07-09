'use client'

interface PoiMapButtonProps {
  lat: number
  lng: number
  poiName: string
}

export default function PoiMapButton({ lat, lng, poiName }: PoiMapButtonProps) {
  const kakaoUrl = `kakaomap://look?p=${lat},${lng}`
  const googleUrl = `https://maps.google.com/?q=${lat},${lng}`

  function handleClick() {
    // 카카오맵 딥링크 시도
    window.location.href = kakaoUrl

    // 300ms 후 앱이 열리지 않으면 구글맵 웹으로 폴백
    setTimeout(() => {
      window.open(googleUrl, '_blank', 'noopener,noreferrer')
    }, 300)
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-center bg-[#FEE500] text-black font-bold py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
    >
      {poiName} 지도에서 보기 ↗
    </button>
  )
}
