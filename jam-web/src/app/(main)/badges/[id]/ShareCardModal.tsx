'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface ShareCardModalProps {
  badgeId: string
  badgeName: string
}

export default function ShareCardModal({ badgeId, badgeName }: ShareCardModalProps) {
  const [open, setOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const { toast } = useToast()

  async function generateCard() {
    setGenerating(true)
    try {
      const res = await fetch('/api/share-card/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeId }),
      })
      if (!res.ok) {
        toast('카드 생성에 실패했습니다.', 'error')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setImageUrl(url)
      setOpen(true)
    } catch {
      toast('네트워크 오류가 발생했습니다.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleShare() {
    if (!imageUrl) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const res = await fetch(imageUrl)
        const blob = await res.blob()
        const file = new File([blob], `jam-badge-${badgeId}.png`, { type: 'image/png' })
        await navigator.share({
          title: `JAM! 배지 - ${badgeName}`,
          text: '#JAM #JoinAndMove',
          files: [file],
        })
      } catch {
        // 공유 취소 무시
      }
    } else {
      // Web Share API 미지원 시 다운로드
      const a = document.createElement('a')
      a.href = imageUrl
      a.download = `jam-badge-${badgeId}.png`
      a.click()
    }
  }

  function handleClose() {
    setOpen(false)
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
      setImageUrl(null)
    }
  }

  return (
    <>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={generating}
        onClick={generateCard}
      >
        공유 카드 만들기
      </Button>

      {open && imageUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center px-5"
          onClick={handleClose}
        >
          <div
            className="bg-jam-cream text-jam-ink rounded-[2rem] border-[3px] border-jam-ink p-5 w-full max-w-sm flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-black text-lg">공유 카드</h2>
              <button
                onClick={handleClose}
                className="text-jam-ink/40 hover:text-jam-ink text-2xl leading-none font-black"
              >
                ×
              </button>
            </div>

            {/* 미리보기 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="공유 카드 미리보기"
              className="w-full rounded-2xl"
            />

            <div className="flex gap-3">
              <Button variant="ghost" size="md" fullWidth onClick={handleClose}>
                닫기
              </Button>
              <Button variant="primary" size="md" fullWidth onClick={handleShare}>
                공유 / 저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
