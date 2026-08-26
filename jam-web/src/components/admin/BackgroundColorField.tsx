'use client'

/**
 * 배경색 피커 + hex 입력 + 스와치 + 지우기 UI 공통 컴포넌트 (20260818_004).
 * BadgeForm에 처음 구현된 UI를 그대로 컴포넌트화해 FactionForm·ItemBookForm에서도 재사용한다.
 * 어드민 전용이라 MODULAR 대상 아님 — 서비스(어드민) 내부 재사용 컴포넌트.
 *
 * 자동 평균컬러 추출은 이 컴포넌트 책임이 아니다(BadgeForm은 ImageUploadField의
 * onAverageColor 콜백으로 이 필드의 value를 직접 채운다). 세계관·컬렉션은 특정 이미지 1장에
 * 종속되지 않으므로 수동 입력만 제공한다.
 */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

interface BackgroundColorFieldProps {
  value: string
  onChange: (value: string) => void
  /** 필드 라벨. 기본 "배경색" */
  label?: string
  /** 입력값 아래 안내 문구. 사용처마다 문구가 달라(자동 프리필 여부 등) 필수로 받는다. */
  helperText: string
}

export default function BackgroundColorField({ value, onChange, label = '배경색', helperText }: BackgroundColorFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={HEX_COLOR_PATTERN.test(value) ? value : '#1a1a1a'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} 색상 피커`}
          className="w-11 h-11 shrink-0 rounded-xl border border-border bg-white p-1 cursor-pointer"
        />
        <div
          aria-hidden="true"
          className="w-11 h-11 shrink-0 rounded-xl border border-dashed border-border"
          style={{ backgroundColor: value || 'transparent' }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-white border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 text-sm font-mono"
          placeholder="#1a1a1a (미지정 시 기본 배경 유지)"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground px-2 py-2.5"
          >
            지우기
          </button>
        )}
      </div>
      <span className="text-xs text-muted-foreground">{helperText}</span>
    </div>
  )
}
