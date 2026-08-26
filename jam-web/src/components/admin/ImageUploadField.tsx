'use client'

import { useRef, useState } from 'react'

interface ImageUploadFieldProps {
  value: string
  onChange: (url: string) => void
  folder?: string
  required?: boolean
  label?: string
  /**
   * URL 직접 입력란 노출 여부. **기본 false — 파일 업로드로만 등록한다.**
   *
   * 원래 기본값은 true였는데, 임의의 외부 호스트 URL이 DB에 들어오면 그 값을 렌더하는
   * 서비스 화면이 통째로 500이 됐다(next/image의 호스트 화이트리스트, 20260824_004).
   * 위험한 쪽이 기본값(fail-open)이었던 셈이라 20260824_005에서 뒤집었다.
   * 자유 입력이 꼭 필요한 화면만 `allowManualUrl`을 명시적으로 켜고, 그 값을 렌더하는
   * 쪽은 반드시 `SafeImage`를 쓴다.
   *
   * 기존에 외부 URL로 등록된 값은 미리보기에 그대로 표시된다.
   */
  allowManualUrl?: boolean
  /**
   * 업로드 성공 시 서버가 계산한 평균 컬러(hex, 실패 시 null)를 전달받는 콜백.
   * (20260818_003 — 배지 배경색 자동 프리필용) 지정하지 않으면 아무 동작도 하지 않는다.
   */
  onAverageColor?: (color: string | null) => void
}

export default function ImageUploadField({
  value,
  onChange,
  folder = 'misc',
  required = false,
  label = '이미지',
  allowManualUrl = false,
  onAverageColor,
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
      onAverageColor?.(data.averageColor ?? null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-foreground">
        {label} {required && '*'}
      </span>

      <div className="flex items-center gap-3">
        {/* 미리보기 */}
        <div className="w-14 h-14 shrink-0 rounded-xl bg-white border border-border flex items-center justify-center overflow-hidden">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="미리보기"
              className="w-full h-full object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </div>

        {/* URL 직접 입력 — 기본값은 false다. 켜는 화면만 이 입력란이 보인다 (20260824_005) */}
        {allowManualUrl && (
          <input
            type="url"
            required={required}
            value={value}
            onChange={(e) => { setUploadError(null); onChange(e.target.value) }}
            className="flex-1 bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 text-sm"
            placeholder="https://... 또는 /badges/001.png"
          />
        )}

        {/* 파일 선택 버튼 */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={[
            'shrink-0 bg-white border border-border rounded-xl px-4 py-2.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 transition-colors whitespace-nowrap',
            allowManualUrl ? '' : 'flex-1',
          ].join(' ')}
        >
          {uploading ? '업로드 중...' : value ? '다른 파일로 교체' : '파일 선택'}
        </button>

        {/* 제거 버튼 — 선택 필드에서 값을 비우는 유일한 수단.
            20260824_005에서 allowManualUrl 기본값을 false로 뒤집으면서 URL 입력란이
            사라졌는데, 그 입력란을 비우는 것이 이미지를 제거하는 방법이었다.
            (게이트 리뷰 WARN 1 — 어드민 기능이 조용히 축소됐다)
            필수 필드에서는 비우면 저장이 막히므로 노출하지 않는다. */}
        {value && !required && !uploading && (
          <button
            type="button"
            onClick={() => { setUploadError(null); onChange('') }}
            className="shrink-0 bg-white border border-border rounded-xl px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors whitespace-nowrap"
          >
            제거
          </button>
        )}

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
      <p className="text-xs text-muted-foreground">
        JPEG · PNG · WebP · GIF · SVG, 최대 5MB
      </p>
    </div>
  )
}
