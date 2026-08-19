'use client'

import { useRef } from 'react'

interface ImageUploaderProps {
  onFileSelected: (file: File) => void
  fileName: string | null
  isGif: boolean
}

export default function ImageUploader({ onFileSelected, fileName, isGif }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="bg-[#111111] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#333333] transition-colors"
      >
        이미지 업로드
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelected(file)
          e.target.value = ''
        }}
      />
      {fileName ? (
        <span className="text-sm text-[#374151]">
          {fileName} {isGif && <span className="text-[#9333ea] font-medium">(GIF)</span>}
        </span>
      ) : (
        <span className="text-sm text-[#9ca3af]">
          정적 이미지 또는 애니메이션 GIF를 선택하세요. 서버 업로드 없이 브라우저에서만 처리합니다.
        </span>
      )}
    </div>
  )
}
