'use client'

import { useEffect } from 'react'

/**
 * 서비스 본체는 html/body 배경이 전역적으로 코발트 블루(--background)로
 * 고정되어 있어, admin 진입 시 iOS 오버스크롤 등에서 파란 배경이 그대로
 * 드러난다. admin 전용으로만 흰 배경 + 라이트 color-scheme으로 덮어쓰고,
 * admin을 벗어나면(unmount) 서비스 본체의 원래 값으로 되돌린다.
 */
export function AdminBodyThemeFix() {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body

    const prevHtmlBackground = html.style.background
    const prevBodyBackground = body.style.background
    const prevColorScheme = html.style.colorScheme

    html.style.background = '#ffffff'
    body.style.background = '#ffffff'
    html.style.colorScheme = 'light'

    return () => {
      html.style.background = prevHtmlBackground
      body.style.background = prevBodyBackground
      html.style.colorScheme = prevColorScheme
    }
  }, [])

  return null
}
