'use client'

import { useRouter } from 'next/navigation'
import { TopNav as DsTopNav } from '@ds/components/navigation/TopNav'

/**
 * 정책 문서 전용 최소 상단 바 (티켓 20260929_1400): 뒤로가기 + 제목만.
 *
 * 서비스 `@/components/ui/TopNav`는 동기화 버튼·알림 종·아바타를 조건 없이 붙이고
 * `(main)`의 Provider에 기대므로 비로그인 방문자에게 쓸 수 없다. MODULAR `TopNav`를 슬롯 없이
 * 직접 쓰고, 뒤로가기만 채운다. 히스토리가 없으면(링크로 직접 진입) 홈으로 보낸다.
 */
export default function LegalTopNav({ title }: { title: string }) {
  const router = useRouter()

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push('/')
    }
  }

  return <DsTopNav title={title} showBack onBack={handleBack} />
}
