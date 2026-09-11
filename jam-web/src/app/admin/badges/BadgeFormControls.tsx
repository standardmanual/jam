'use client'

/**
 * 배지 폼 입력 부품 — 티켓 20260911_0901
 *
 * 어드민 shadcn 세트(`components/admin/ui`)에 없는 모양 세 가지만 여기서 조립한다.
 * - `SuffixInput`: 단위를 라벨 괄호가 아니라 입력칸 안쪽 오른쪽 접미사로 그린다
 * - `SegmentedControl`: 배지 타입·발급 방식처럼 둘~셋 중 하나를 고르는 칸. 세트에 radio-group이
 *   없어 버튼 + `role="radio"`로 만든다(방향키로 이동 가능)
 * - `FieldMessage`: 입력 아래 보조 설명·빨간 한 줄 안내
 */
import { useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { Input } from '@/components/admin/ui/input'
import { cn } from '@/lib/utils'

/** 입력 라벨 — 필수면 「필수」를 옅게 붙인다 */
export function FieldLabel({
  htmlFor,
  id,
  children,
  required,
}: {
  htmlFor?: string
  id?: string
  children: ReactNode
  required?: boolean
}) {
  const content = (
    <>
      {children}
      {required && <span className="ml-1 text-[11px] font-normal text-muted-foreground">필수</span>}
    </>
  )
  const className = 'text-[13px] font-medium text-foreground/80'
  return htmlFor ? (
    <label htmlFor={htmlFor} id={id} className={className}>
      {content}
    </label>
  ) : (
    <span id={id} className={className}>
      {content}
    </span>
  )
}

/** 입력 아래 한 줄 — `tone="error"`면 빨간 안내 */
export function FieldMessage({ id, tone = 'help', children }: { id?: string; tone?: 'help' | 'error'; children: ReactNode }) {
  return (
    <span id={id} className={cn('text-xs', tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </span>
  )
}

/**
 * 접미사가 붙는 입력칸. 접미사는 `aria-describedby`로 입력과 연결한다(티켓 20260911_0901).
 * `describedBy`에 넘긴 id(보조 설명·오류 안내)는 접미사 id 앞에 이어 붙인다.
 *
 * 접미사가 없으면 shadcn `Input`을 그대로 쓴다. 접미사가 있으면 테두리를 바깥 칸이 갖고 안쪽은
 * 테두리 없는 입력을 둔다 — 이 저장소의 `cn`은 클래스를 병합하지 않고 이어 붙이기만 해서
 * (`lib/utils.ts`) `Input`의 테두리·링을 className으로 덮어쓸 수 없기 때문이다.
 */
export function SuffixInput({
  id,
  suffix,
  describedBy,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'id'> & { id: string; suffix?: string | null; describedBy?: string }) {
  const invalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true'
  if (!suffix) {
    // `aria-invalid:` 변형은 속성 선택자라 기본 테두리색보다 우선한다(클래스 순서와 무관)
    return (
      <Input
        id={id}
        aria-describedby={describedBy || undefined}
        className={cn('tabular-nums aria-invalid:border-destructive', className)}
        {...props}
      />
    )
  }
  const suffixId = `${id}-suffix`
  const describedByValue = [describedBy, suffixId].filter(Boolean).join(' ')
  return (
    <div
      className={cn(
        'flex h-10 w-full items-center overflow-hidden rounded-md border bg-white ring-offset-white focus-within:ring-2 focus-within:ring-neutral-900 focus-within:ring-offset-2',
        invalid ? 'border-destructive' : 'border-neutral-300',
        props.disabled ? 'cursor-not-allowed opacity-50' : undefined,
        className
      )}
    >
      <input
        id={id}
        aria-describedby={describedByValue}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-neutral-900 tabular-nums placeholder:text-neutral-400 focus:outline-none disabled:cursor-not-allowed md:text-sm"
        {...props}
      />
      <span id={suffixId} className="shrink-0 whitespace-nowrap pr-3 pl-1 text-xs text-muted-foreground">
        {suffix}
      </span>
    </div>
  )
}

export interface SegmentOption<V extends string> {
  value: V
  label: string
  description?: string
}

/**
 * 둘~셋 중 하나를 고르는 세그먼트. `role="radiogroup"` + 방향키 이동으로 라디오와 같게 쓴다.
 * 네이티브 라디오를 쓰지 않는 이유는 어드민 UI를 shadcn 세트로 통일한다는 방침 때문이다.
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  wide,
  className,
}: {
  label: string
  value: V
  options: readonly SegmentOption<V>[]
  onChange: (value: V) => void
  /** 칸을 균등 분할해 가득 채운다(배지 타입). 좁은 화면에서는 세로로 쌓인다 */
  wide?: boolean
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  )

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'gap-0.5 rounded-lg bg-muted p-[3px]',
        wide ? 'grid grid-cols-1 sm:grid-cols-3' : 'inline-flex flex-wrap',
        className
      )}
    >
      {options.map((o, i) => {
        const checked = i === selectedIndex
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              wide ? 'py-2 text-center' : 'py-1.5',
              checked
                ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="block">{o.label}</span>
            {o.description && <span className="block text-[11px] font-normal text-muted-foreground">{o.description}</span>}
          </button>
        )
      })}
    </div>
  )
}
