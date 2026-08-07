'use client'

import { useRef, useState } from 'react'

interface ImageUploadFieldProps {
  value: string
  onChange: (url: string) => void
  folder?: string
  required?: boolean
  label?: string
}

export default function ImageUploadField({
  value,
  onChange,
  folder = 'misc',
  required = false,
  label = '이미지',
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)

      const res = await fetch('/api/admin/upload-image', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '업로드 실패')
      onChange(data.url)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-[#374151]">
        {label} {required && '*'}
      </span>

      <div className="flex items-center gap-3">
        {/* 미리보기 */}
        <div className="w-14 h-14 shrink-0 rounded-xl bg-white border border-[#e5e7eb] flex items-center justify-center overflow-hidden">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="미리보기"
              className="w-full h-full object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="text-[#898989] text-xs">—</span>
          )}
        </div>

        {/* URL 직접 입력 */}
        <input
          type="url"
          required={required}
          value={value}
          onChange={(e) => { setUploadError(null); onChange(e.target.value) }}
          className="flex-1 bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-[#111111] placeholder-[#9ca3af] focus:outline-none focus:border-[#111111]/50 text-sm"
          placeholder="https://... 또는 /badges/001.png"
        />

        {/* 파일 선택 버튼 */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 bg-white border border-[#e5e7eb] rounded-xl px-4 py-2.5 text-sm text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {uploading ? '업로드 중...' : '파일 선택'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {uploadError && (
        <p className="text-xs text-red-600">{uploadError}</p>
      )}
      <p className="text-xs text-[#898989]">
        JPEG · PNG · WebP · GIF · SVG, 최대 5MB
      </p>
    </div>
  )
}
