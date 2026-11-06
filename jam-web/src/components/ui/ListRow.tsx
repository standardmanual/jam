import Link from 'next/link'
import type { CSSProperties, HTMLAttributes, MouseEventHandler, ReactNode } from 'react'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from './icons'

/**
 * ListRow — 목록 행 한 골격의 서비스 사본 (티켓 20261106_2252, 4단계 1배치).
 *
 * 원본은 `design-system/components/patterns/ListRow.jsx`다. 인라인 스타일 값은 원본과 문자 단위로 같게 둔다 —
 * `scripts/ds-sync-check.mjs`가 매니페스트의 ListRow 쌍으로 기하를 대조한다. 값을 바꾸려면 원본을 먼저 고친다.
 * 슬롯·prop 설명은 `ListRow.d.ts`·`ListRow.prompt.md` 참고.
 *
 * 서비스 쪽 차이(값은 같다):
 *  - 링크는 `<a>` 대신 `next/link`의 `Link`다(`ListRowCard`와 같다). `leadHref`도 같다.
 *  - 아이콘은 서비스 `icons.tsx`다. 크기는 `width`·`height` 대신 `w-5 h-5`(20px)로 맞춘다.
 *  - `ListRowSkeleton`은 서비스에 스켈레톤 부품이 없고 쓰이지 않아 넣지 않았다.
 *
 * 클릭 영역(`<a>`/`<button>`) 안은 전부 `<span>`(phrasing)이다. lead·footer에도 div를 넣지 않는다.
 */

/** 굵기 단일 소스. 행 안의 모든 글자 굵기는 여기서 나온다. */
const ROW_WEIGHT = { regular: 400, strong: 700 }

export type ListRowTone = 'default' | 'tint' | 'inverse' | 'flat'

interface ToneSpec {
  background: string
  border: string
  radius: string | number
  color: string
  muted: string
  face: string
  leadBg: string
  ring: string
}

/**
 * 톤별 면. face는 leadBadge 가장자리 선(행 면 색), leadBg는 lead 박스 배경(행 면과 한 단계 다르게),
 * muted는 보조 글자색, ring은 선택 링 색.
 */
const TONES: Record<ListRowTone, ToneSpec> = {
  default: {
    background: 'var(--surface)', border: '1px solid var(--border)', radius: 'var(--radius-2xl)',
    color: 'var(--foreground)', muted: 'var(--muted)', face: 'var(--surface)', leadBg: 'var(--background-secondary)',
    ring: 'var(--foreground)',
  },
  tint: {
    background: 'var(--background-secondary)', border: '1px solid transparent', radius: 'var(--radius-2xl)',
    color: 'var(--foreground)', muted: 'var(--muted)', face: 'var(--background-secondary)', leadBg: 'var(--surface)',
    ring: 'var(--foreground)',
  },
  inverse: {
    background: 'var(--background-inverse)', border: '1px solid var(--background-inverse)', radius: 'var(--radius-2xl)',
    color: 'var(--snow)', muted: 'var(--muted-on-inverse)', face: 'var(--background-inverse)',
    leadBg: 'var(--surface-on-inverse)', ring: 'var(--snow)',
  },
  flat: {
    background: 'transparent', border: '1px solid transparent', radius: 0,
    color: 'var(--foreground)', muted: 'var(--muted)', face: 'var(--background)', leadBg: 'var(--background-secondary)',
    ring: 'var(--foreground)',
  },
}

export const LIST_ROW_STATIC_CSS = `
.ds-list-row{transition:transform var(--duration-micro,80ms) var(--ease-out,ease-out),box-shadow var(--duration-quick,150ms) var(--ease-out,ease-out)}
.ds-list-row[data-interactive="true"]:has(.ds-list-row-hit:active){transform:scale(var(--scale-press-card,0.98))}
.ds-list-row-hit:focus-visible,.ds-list-row-lead-link:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.ds-list-row-lead img{display:block;width:100%;height:100%;object-fit:cover}
.ds-list-row-chevron{transition:transform var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-list-row-chevron[data-expanded="true"]{transform:rotate(180deg)}
.ds-list-row-trail>:is(button,a,[role="button"]){position:relative}
.ds-list-row-trail>:is(button,a,[role="button"])::after{content:"";position:absolute;left:50%;top:50%;width:max(100%,var(--touch-target-min,44px));height:max(100%,var(--touch-target-min,44px));transform:translate(-50%,-50%)}
@media (prefers-reduced-motion: reduce){
.ds-list-row[data-interactive="true"]:has(.ds-list-row-hit:active){transform:none}
.ds-list-row-chevron[data-expanded="true"]{transform:none}
.ds-list-row,.ds-list-row-chevron{transition:none!important}
}
`

/** 1줄은 말줄임, 2줄 이상은 줄 수로 자른다. `0`은 줄 제한 없음(전체 표시). */
function clamp(lines: number): CSSProperties {
  if (lines === 0) return { display: 'block', overflowWrap: 'break-word' }
  const n = Math.min(3, Math.max(1, lines | 0))
  if (n === 1) return { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  return { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: n, overflow: 'hidden' }
}

/** flat 톤에서 `selected`가 지정되면(true·false) 좌우 여백과 모서리를 컴포넌트가 준다. */
const hasSelectedFrame = (tone: ListRowTone, selected: boolean | undefined) => tone === 'flat' && selected !== undefined

/** 문장 속 핵심어를 굵게. 문장형 title(`titleVariant="sentence"`) 안에서 쓴다. */
export function ListRowEm({ children, className = '', style = {} }: { children?: ReactNode; className?: string; style?: CSSProperties }) {
  return <strong className={className} style={{ fontWeight: ROW_WEIGHT.strong, ...style }}>{children}</strong>
}

const CHIP_TONES = {
  neutral: 'var(--default-soft)',
  accent: 'var(--accent-soft)',
  warning: 'var(--warning)',
}

/**
 * 행 안 칩 한 크기(12px). 상태·만료·마지막 파편 같은 칩 복제를 대신한다.
 * 글자는 항상 --foreground다. accent·warning은 면 채우기에만 쓴다(선·점으로도 쓰지 않는다).
 */
export function ListRowChip({
  tone = 'neutral',
  children,
  className = '',
  style = {},
}: {
  tone?: keyof typeof CHIP_TONES
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  if (children == null || children === '') return null
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
        padding: 'var(--list-row-chip-padding)',
        borderRadius: 'var(--radius-full)',
        background: CHIP_TONES[tone] ?? CHIP_TONES.neutral,
        color: 'var(--foreground)',
        fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', fontWeight: ROW_WEIGHT.regular,
        ...style,
      }}
    >
      {children}
    </span>
  )
}

function Lead({ lead, shape, badge, tone }: { lead: ReactNode; shape: 'tile' | 'round'; badge?: ReactNode; tone: ListRowTone }) {
  const t = TONES[tone]
  return (
    <span
      style={{
        position: 'relative', display: 'block', flexShrink: 0,
        width: 'var(--list-row-lead-size)', height: 'var(--list-row-lead-size)',
      }}
    >
      <span
        className="ds-list-row-lead"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%', overflow: 'hidden', boxSizing: 'border-box',
          borderRadius: shape === 'round' ? 'var(--radius-full)' : 'var(--radius-2xl)',
          background: t.leadBg, color: 'var(--muted)',
        }}
      >
        {lead}
      </span>
      {badge != null && badge !== '' && (
        <span
          style={{
            position: 'absolute', right: 'var(--list-row-lead-badge-offset)', bottom: 'var(--list-row-lead-badge-offset)', boxSizing: 'border-box',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 'var(--list-row-lead-badge-size)', height: 'var(--list-row-lead-badge-size)', padding: '0 var(--list-row-lead-badge-padding-x)', whiteSpace: 'nowrap',
            borderRadius: 'var(--radius-full)',
            background: 'var(--foreground)', color: 'var(--snow)', border: `1px solid ${t.face}`,
            fontSize: 'var(--text-xs)', lineHeight: 1, fontWeight: ROW_WEIGHT.strong, fontVariantNumeric: 'tabular-nums',
          }}
        >
          {badge}
        </span>
      )}
    </span>
  )
}

function Indicator({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: 'var(--list-row-indicator-size)', minHeight: 'var(--list-row-indicator-size)',
        fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)',
        fontWeight: ROW_WEIGHT.strong, fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  )
}

export interface ListRowProps extends Omit<HTMLAttributes<HTMLElement>, 'title' | 'onClick' | 'style' | 'className'> {
  variant?: 'default' | 'media'
  tone?: ListRowTone
  separator?: boolean
  indicator?: ReactNode
  lead?: ReactNode
  leadShape?: 'tile' | 'round'
  leadBadge?: ReactNode
  leadHref?: string
  /** `leadHref`가 있으면 필수에 가깝다 — lead 링크 안은 장식뿐이라 접근 가능한 이름이 된다 */
  leadLabel?: string
  /** 문자열이면 한 덩어리 문장(최대 2줄), ReactNode면 칩 줄이 된다 */
  eyebrow?: ReactNode
  time?: ReactNode
  title?: ReactNode
  titleSuffix?: ReactNode
  titleVariant?: 'strong' | 'regular' | 'label' | 'sentence'
  titleLines?: number
  meta?: ReactNode
  metaLines?: number
  chips?: ReactNode
  footer?: ReactNode
  value?: ReactNode
  chevron?: boolean
  trail?: ReactNode
  selected?: boolean
  disabled?: boolean
  href?: string
  onClick?: MouseEventHandler<HTMLElement>
  'aria-expanded'?: boolean
  'aria-controls'?: string
  className?: string
  style?: CSSProperties
}

/**
 * ListRow — 슬롯 구성으로 계열을 만드는 목록 행.
 *
 * `role`·`aria-*`·`data-*`는 클릭 영역(<a>/<button>)으로 전달된다. `className`·`style`은 행 바깥 면으로 간다.
 */
export function ListRow({
  variant = 'default',
  tone = 'default',
  separator = false,
  indicator,
  lead,
  leadShape = 'tile',
  leadBadge,
  leadHref,
  leadLabel,
  eyebrow,
  time,
  title,
  titleSuffix,
  titleVariant = 'strong',
  titleLines,
  meta,
  metaLines = 1,
  chips,
  footer,
  value,
  chevron = false,
  trail,
  selected,
  disabled = false,
  href,
  onClick,
  'aria-expanded': ariaExpanded,
  className = '',
  style = {},
  ...rest
}: ListRowProps) {
  const t = TONES[tone] ?? TONES.default
  const isMedia = variant === 'media'
  const isSelected = selected === true
  const isLabel = titleVariant === 'label'
  const interactive = !disabled && !!(href || onClick)
  const hasLead = lead != null
  const hasIndicator = indicator != null
  const leadOutside = hasLead && !!leadHref
  if (leadOutside && !leadLabel && process.env.NODE_ENV !== 'production') {
    console.warn('[ListRow] `leadHref`가 있는데 `leadLabel`이 없습니다. lead 링크 안은 장식 요소뿐이라 스크린리더가 «링크, 이름 없음»으로 읽습니다. `leadLabel`에 링크 이름(예: «runner_kim 프로필»)을 넘기세요.')
  }
  const hasTrail = trail != null
  const align = isMedia ? 'flex-start' : 'center'
  // sentence는 줄 제한이 없다(알림 문장은 정보 손실 금지). strong·label은 1줄 말줄임.
  const lines = titleLines ?? (titleVariant === 'sentence' ? 0 : 1)
  const hasEyebrow = eyebrow != null && eyebrow !== ''
  const hasTime = time != null && time !== ''
  const expandable = ariaExpanded !== undefined

  // flat + selected 지정: 좌우 16 + 모서리 radius-2xl, separator 무시. selected가 없는 flat은 가로 0·모서리 0.
  const framed = hasSelectedFrame(tone, selected)
  const wrapperStyle: CSSProperties = {
    ...(tone === 'flat' && !framed ? ({ '--list-row-padding-x': '0px' } as CSSProperties) : null),
    display: 'flex', alignItems: 'stretch', boxSizing: 'border-box', width: '100%',
    background: t.background, border: t.border, borderRadius: framed ? 'var(--radius-2xl)' : t.radius,
    borderBottom: tone === 'flat' && separator && !framed ? '1px solid var(--separator)' : t.border,
    boxShadow: isSelected ? `inset 0 0 0 var(--list-row-selected-ring) ${t.ring}` : 'inset 0 0 0 0 transparent',
    color: t.color, fontFamily: 'var(--font-family-base)',
    wordBreak: 'keep-all', overflowWrap: 'break-word', textAlign: 'left',
    opacity: disabled ? 'var(--opacity-disabled)' : undefined,
    ...style,
  }

  const hitStyle: CSSProperties = {
    display: 'flex', alignItems: align, flex: '1 1 auto', minWidth: 0, boxSizing: 'border-box',
    gap: 'var(--list-row-gap)',
    minHeight: 'var(--touch-target-min)',
    padding: `var(--list-row-padding-y) ${hasTrail ? 0 : 'var(--list-row-padding-x)'} var(--list-row-padding-y) ${leadOutside ? 'var(--list-row-gap)' : 'var(--list-row-padding-x)'}`,
    margin: 0, border: 0, background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left',
    textDecoration: 'none', borderRadius: 'inherit', appearance: 'none', WebkitAppearance: 'none',
    cursor: interactive ? 'pointer' : undefined,
    pointerEvents: disabled ? 'none' : undefined,
  }

  const titleStyle: CSSProperties = {
    ...clamp(lines),
    minWidth: 0, flex: '1 1 auto',
    fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)',
    fontWeight: titleVariant === 'strong' ? ROW_WEIGHT.strong : ROW_WEIGHT.regular,
    color: isLabel ? t.muted : undefined,
    // `textWrap: undefined`를 넣지 않는다: 값이 비면 `white-space: nowrap`이 함께 만든 text-wrap-mode까지 지워져 1줄 말줄임이 풀린다.
    ...(lines !== 1 ? { textWrap: 'balance' } : null),
  }

  const timeNode = hasTime ? (
    <span
      style={{
        flexShrink: 0, whiteSpace: 'nowrap', color: t.muted,
        fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', fontWeight: ROW_WEIGHT.regular,
      }}
    >
      {time}
    </span>
  ) : null

  const lineGap = 'var(--list-row-line-gap)'

  const body = (
    <span style={{ display: 'block', flex: '1 1 0%', minWidth: 0 }}>
      {hasEyebrow && (
        <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--spacing-8)' }}>
          {typeof eyebrow === 'string' ? (
            <span
              style={{
                ...clamp(2), minWidth: 0, flex: '1 1 auto', color: t.muted,
                fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', fontWeight: ROW_WEIGHT.regular,
              }}
            >
              {eyebrow}
            </span>
          ) : (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-4)', minWidth: 0, flex: '1 1 auto' }}>{eyebrow}</span>
          )}
          {timeNode}
        </span>
      )}
      {title != null && (
        <span
          style={{
            display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-8)',
            marginTop: hasEyebrow ? lineGap : undefined,
          }}
        >
          <span style={titleStyle}>{title}</span>
          {titleSuffix != null && titleSuffix !== '' && (
            <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>{titleSuffix}</span>
          )}
          {!hasEyebrow && timeNode}
        </span>
      )}
      {meta != null && meta !== '' && (
        <span
          style={{
            ...clamp(metaLines), marginTop: lineGap, color: t.muted,
            fontSize: 'var(--text-sm)', lineHeight: 'var(--text-sm--line-height)', fontWeight: ROW_WEIGHT.regular,
            ...(metaLines > 1 ? { textWrap: 'balance' } : null),
          }}
        >
          {meta}
        </span>
      )}
      {chips != null && (
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--spacing-4)', marginTop: 'var(--spacing-4)' }}>{chips}</span>
      )}
      {isMedia && footer != null && (
        <span style={{ display: 'block', marginTop: 'var(--spacing-8)' }}>{footer}</span>
      )}
    </span>
  )

  const rightArea = (
    <>
      {value != null && value !== '' && (
        <span
          style={{
            alignSelf: 'center', flexShrink: isLabel ? 1 : 0, minWidth: 0, maxWidth: isLabel ? '60%' : undefined,
            whiteSpace: isLabel ? 'normal' : 'nowrap', textAlign: isLabel ? 'right' : undefined,
            fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', fontWeight: ROW_WEIGHT.strong,
          }}
        >
          {value}
        </span>
      )}
      {isSelected ? (
        <span aria-hidden="true" style={{ alignSelf: 'center', flexShrink: 0, display: 'flex' }}><CheckIcon className="w-5 h-5" /></span>
      ) : chevron ? (
        <span aria-hidden="true" style={{ alignSelf: 'center', flexShrink: 0, display: 'flex', color: t.muted }}>
          {expandable ? (
            // 회전은 감싼 span이 맡는다.
            <span className="ds-list-row-chevron" data-expanded={ariaExpanded === true ? 'true' : 'false'} style={{ display: 'flex' }}>
              <ChevronDownIcon className="w-5 h-5" />
            </span>
          ) : (
            <ChevronRightIcon className="w-5 h-5" />
          )}
        </span>
      ) : null}
    </>
  )

  const leftArea = (
    <>
      {hasIndicator && !leadOutside && <Indicator>{indicator}</Indicator>}
      {hasLead && !leadOutside && <Lead lead={lead} shape={leadShape} badge={leadBadge} tone={tone} />}
    </>
  )

  const hitContent = (
    <>
      {leftArea}
      {body}
      {rightArea}
    </>
  )

  const ariaProps: Record<string, unknown> = { ...rest }
  if (expandable) ariaProps['aria-expanded'] = ariaExpanded
  if (isSelected && !href && onClick && ariaProps.role === undefined) ariaProps['aria-pressed'] = true
  else if (selected === false && !href && onClick && ariaProps.role === undefined) ariaProps['aria-pressed'] = false
  if (isSelected && href) ariaProps['aria-current'] = 'true'

  let hit: ReactNode
  if (href && !disabled) {
    hit = <Link href={href} onClick={onClick} className="ds-list-row-hit" style={hitStyle} {...ariaProps}>{hitContent}</Link>
  } else if (href && disabled) {
    hit = <a role="link" aria-disabled="true" className="ds-list-row-hit" style={hitStyle} {...ariaProps}>{hitContent}</a>
  } else if (onClick) {
    hit = <button type="button" onClick={onClick} disabled={disabled} className="ds-list-row-hit" style={hitStyle} {...ariaProps}>{hitContent}</button>
  } else {
    hit = <div className="ds-list-row-hit" style={hitStyle} {...(disabled ? { 'aria-disabled': 'true' } : null)} {...ariaProps}>{hitContent}</div>
  }

  return (
    <div className={`ds-list-row ${className}`.trim()} data-interactive={interactive ? 'true' : 'false'} style={wrapperStyle}>
      <style href="ds-list-row" precedence="medium">{LIST_ROW_STATIC_CSS}</style>
      {leadOutside && (
        <div
          style={{
            display: 'flex', alignItems: align, flexShrink: 0, gap: 'var(--list-row-gap)',
            padding: 'var(--list-row-padding-y) 0 var(--list-row-padding-y) var(--list-row-padding-x)',
          }}
        >
          {hasIndicator && <Indicator>{indicator}</Indicator>}
          <Link
            href={leadHref}
            className="ds-list-row-lead-link"
            aria-label={leadLabel || undefined}
            tabIndex={disabled ? -1 : undefined}
            style={{ display: 'block', color: 'inherit', textDecoration: 'none', borderRadius: leadShape === 'round' ? 'var(--radius-full)' : 'var(--radius-2xl)', pointerEvents: disabled ? 'none' : undefined }}
          >
            <Lead lead={lead} shape={leadShape} badge={leadBadge} tone={tone} />
          </Link>
        </div>
      )}
      {hit}
      {hasTrail && (
        <div
          className="ds-list-row-trail"
          style={{
            display: 'flex', alignItems: 'center', alignSelf: 'center', flexShrink: 0,
            padding: '0 var(--list-row-padding-x) 0 var(--list-row-gap)',
            pointerEvents: disabled ? 'none' : undefined,
          }}
          // 비활성 행은 키보드(Tab·Enter)로도 trail 버튼이 눌리지 않게 inert로 막는다.
          inert={disabled ? true : undefined}
        >
          {trail}
        </div>
      )}
    </div>
  )
}
