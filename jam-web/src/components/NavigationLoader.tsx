'use client'

import { useEffect, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { DotmHex8 } from '@/components/ui/dotm-hex-8'

function Inner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)

  // 라우트 전환 완료 → 로더 숨김
  useEffect(() => {
    setLoading(false)
  }, [pathname, searchParams])

  // 앱 내부 링크 클릭 감지 → 로더 표시
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a[href]')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (
        href.startsWith('http') ||
        href.startsWith('//') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('#')
      ) return
      setLoading(true)
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  if (!loading) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-jam-cream/90 backdrop-blur-sm">
      <DotmHex8
        size={89}
        dotSize={14}
        speed={1.35}
        pattern="full"
        colorPreset="grad-fire"
        animated
        opacityBase={0.12}
        opacityMid={0.42}
        opacityPeak={1}
      />
    </div>
  )
}

export function NavigationLoader() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  )
}
