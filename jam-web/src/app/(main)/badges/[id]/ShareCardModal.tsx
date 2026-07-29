'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import BottomSheet from '@/components/ui/BottomSheet'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'

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
        toast(d.badges.shareCardGenerateFailed, 'error')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setImageUrl(url)
      setOpen(true)
    } catch {
      toast(d.common.networkError, 'error')
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
      <Button variant="primary" fullWidth loading={generating} onClick={generateCard}>
        {d.badges.shareCardButton}
      </Button>

      {imageUrl && (
        <BottomSheet
          open={open}
          onClose={handleClose}
          title={d.badges.shareCardTitle}
          closeLabel={d.badges.shareCardClose}
        >
          <div className="px-[var(--spacing-24)] pb-[var(--spacing-24)] flex flex-col gap-[var(--spacing-16)]">
            {/* 미리보기 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={d.badges.shareCardAlt} className="w-full rounded-[var(--radius-cards)]" />

            <div className="flex gap-[var(--spacing-16)]">
              <Button variant="outline" surface="sub" fullWidth onClick={handleClose}>
                {d.badges.shareCardClose}
              </Button>
              <Button variant="primary" surface="sub" fullWidth onClick={handleShare}>
                {d.badges.shareCardShare}
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  )
}
