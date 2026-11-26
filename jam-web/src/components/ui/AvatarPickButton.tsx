import Avatar from '@/components/ui/Avatar'

/**
 * «사진 고르기» 아바타 버튼 (티켓 20261126_1540, 프로필 편집·온보딩 1단계에서 옮겨 온 정본).
 * 96px 둥근 사각 아바타를 누르는 칸으로 감싼 얇은 버튼이다. 누르면 줄어드는 효과가 있고,
 * 올리는 중(`uploading`)에는 아바타 위에 덮개와 스피너를 얹고 버튼을 비활성으로 만든다.
 * 파일 선택 창은 호출부가 숨긴 `<input type="file">`로 연다(`onClick`에서 `input.click()`).
 *
 * @summary 아바타를 감싼 «사진 고르기» 버튼이다. 올리는 중에는 덮개가 씌워진다. 프로필 편집·온보딩에서 쓴다.
 */
export interface AvatarPickButtonProps {
  /** 지금 사진 주소. 없으면 아바타의 기본 아이콘 */
  src: string | null | undefined
  /** 아바타 이미지 대체 글 */
  alt: string
  /** 버튼의 접근 가능한 이름(스크린리더) */
  label: string
  /** true면 덮개·스피너를 얹고 버튼을 비활성으로 만든다 */
  uploading?: boolean
  onClick: () => void
}

export default function AvatarPickButton({ src, alt, label, uploading = false, onClick }: AvatarPickButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block active:scale-95 transition-transform duration-100 motion-reduce:transition-none"
      disabled={uploading}
      aria-label={label}
    >
      <Avatar src={src} alt={alt} size={96} shape="rounded" iconClassName="w-10 h-10 text-muted" />
      {uploading && (
        <div className="absolute inset-0 rounded-2xl bg-background/70 flex items-center justify-center">
          <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
        </div>
      )}
    </button>
  )
}
