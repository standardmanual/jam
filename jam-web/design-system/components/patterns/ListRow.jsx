import React from 'react';
import { Skeleton } from '../feedback/Skeleton.jsx';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from '../icons/IconCatalog.jsx';

/**
 * ListRow — 목록 행 한 골격. 티켓 20261106_1759(2단계 2-2회차, 상위 20261106_1750), 토큰 정식화는 티켓 20261106_2003(3-2회차).
 *
 * 기존 `ListRowCard`(icon·title·subtitle·trailing·children)와 공존한다. 계열마다 마크업을 새로 짜지 않도록
 * 슬롯 구성만 바꿔서 활동(A)·대상(B)·사람(C)·값(D)·체크 목록(E) 다섯 계열을 한 골격에서 만든다.
 * 자유 `children` 경로는 두지 않는다.
 *
 * 구조: [왼쪽 영역: indicator 24 · lead 48] [본문 칸] [오른쪽 영역: value · chevron/체크]  + 행 바깥 trail
 *   - 클릭 영역(href/onClick)은 indicator·lead·본문·value·chevron을 감싼다. trail은 그 바깥 형제라
 *     안에 버튼을 넣어도 마크업이 유효하다. 클릭 영역 안은 전부 <span>(phrasing)이라 <button> 안에서도 유효하다.
 *   - `leadHref`가 있으면 lead(와 indicator)는 클릭 영역 밖 형제로 나가 별도 링크가 된다(알림 아바타의 2단 링크).
 *     링크 안은 장식뿐이라 접근 가능한 이름 `leadLabel`을 함께 넘겨야 한다(aria-label로 연결, 없으면 개발 모드 경고).
 *   - 비활성(disabled)이면 trail 래퍼에 inert를 걸어 키보드로도 trail 버튼이 막힌다.
 *
 * `titleSuffix`는 title 오른쪽에 붙는 줄어들지 않는 인라인 노드(순위 행의 «나» 칩 등)다. title이 말줄임될 때 suffix는 남는다.
 *
 * 글자 위계: eyebrow·time·chip 12px(--text-xs), meta 14px(--text-sm), title·value 16px(--text-base).
 * 굵기는 아래 ROW_WEIGHT 한 곳에서 정한다. 위계는 크기보다 줄 위치·색·굵기로 나눈다.
 *
 * 치수는 `tokens/spacing.css`의 `--list-row-*` 11종, 반전 면 글자·면은 `--muted-on-inverse`·`--surface-on-inverse`,
 * 비활성 투명도는 `--opacity-disabled`에서 나온다. lead 크기는 `--list-row-lead-size` 하나로 정한다(prop 없음).
 * 스토리의 40/48 비교처럼 호출부 style이 같은 이름으로 덮어쓸 수 있다.
 *
 * flat 톤은 면이 없어 가로 여백 0이다. 다만 `selected`가 지정되면(true·false 모두) 선택 링이 글자에 닿지 않도록
 * 좌우 16 + 모서리 `--radius-2xl`을 컴포넌트가 주고 `separator`는 무시한다(선택된 행만 주면 목록이 출렁인다).
 *
 * 스타일 블록(STATIC_CSS)은 React 19 `<style href precedence>`로 문서에 한 번만 들어간다(행마다 렌더해도 1개).
 *
 * 한 행에서 색으로 강조하는 곳은 한 곳 이하다. 그림자·그라디언트·유리질 없음(흰 면은 1px --border만).
 * 칩 글자는 항상 --foreground다(--accent·--warning은 면 채우기만).
 */

/** 굵기 단일 소스. 행 안의 모든 글자 굵기는 여기서 나온다. */
const ROW_WEIGHT = { regular: 400, strong: 700 };

/**
 * 톤별 면. face는 leadBadge 가장자리 선(행 면 색), leadBg는 lead 박스 배경(행 면과 한 단계 다르게),
 * muted는 보조 글자색, ring은 선택 링 색.
 */
const TONES = {
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
};

const STATIC_CSS = `
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
`;

/** 1줄은 말줄임, 2줄 이상은 줄 수로 자른다. `0`은 줄 제한 없음(전체 표시). */
function clamp(lines) {
  if (lines === 0) return { display: 'block', overflowWrap: 'break-word' };
  const n = Math.min(3, Math.max(1, lines | 0));
  if (n === 1) return { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  return { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: n, overflow: 'hidden' };
}

/** flat 톤에서 `selected`가 지정되면(true·false) 좌우 여백과 모서리를 컴포넌트가 준다. */
const hasSelectedFrame = (tone, selected) => tone === 'flat' && selected !== undefined;

/** 문장 속 핵심어를 굵게. 문장형 title(`titleVariant="sentence"`) 안에서 쓴다. */
export function ListRowEm({ children, className = '', style = {} }) {
  return <strong className={className} style={{ fontWeight: ROW_WEIGHT.strong, ...style }}>{children}</strong>;
}

const CHIP_TONES = {
  neutral: 'var(--default-soft)',
  accent: 'var(--accent-soft)',
  warning: 'var(--warning)',
};

/**
 * 행 안 칩 한 크기(12px). 상태·만료·마지막 파편 같은 칩 복제를 대신한다.
 * 글자는 항상 --foreground다. accent·warning은 면 채우기에만 쓴다(선·점으로도 쓰지 않는다).
 */
export function ListRowChip({ tone = 'neutral', children, className = '', style = {} }) {
  if (children == null || children === '') return null;
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
  );
}

function Lead({ lead, shape, badge, tone }) {
  const t = TONES[tone];
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
  );
}

function Indicator({ children }) {
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
  );
}

/**
 * ListRow — 슬롯 구성으로 계열을 만드는 목록 행. 슬롯·prop 전체는 ListRow.d.ts와 ListRow.prompt.md 참고.
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
}) {
  const t = TONES[tone] ?? TONES.default;
  const isMedia = variant === 'media';
  const isSelected = selected === true;
  const isLabel = titleVariant === 'label';
  const interactive = !disabled && !!(href || onClick);
  const hasLead = lead != null;
  const hasIndicator = indicator != null;
  const leadOutside = hasLead && !!leadHref;
  if (leadOutside && !leadLabel && typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
    console.warn('[MODULAR] ListRow: `leadHref`가 있는데 `leadLabel`이 없습니다. lead 링크 안은 장식 요소뿐이라 스크린리더가 «링크, 이름 없음»으로 읽습니다. `leadLabel`에 링크 이름(예: «runner_kim 프로필»)을 넘기세요.');
  }
  const hasTrail = trail != null;
  const align = isMedia ? 'flex-start' : 'center';
  // sentence는 줄 제한이 없다(알림 문장은 정보 손실 금지). strong·label은 1줄 말줄임.
  const lines = titleLines ?? (titleVariant === 'sentence' ? 0 : 1);
  const hasEyebrow = eyebrow != null && eyebrow !== '';
  const hasTime = time != null && time !== '';
  const expandable = ariaExpanded !== undefined;

  // flat + selected 지정: 좌우 16 + 모서리 radius-2xl, separator 무시. selected가 없는 flat은 가로 0·모서리 0.
  const framed = hasSelectedFrame(tone, selected);
  const wrapperStyle = {
    ...(tone === 'flat' && !framed ? { '--list-row-padding-x': '0px' } : null),
    display: 'flex', alignItems: 'stretch', boxSizing: 'border-box', width: '100%',
    background: t.background, border: t.border, borderRadius: framed ? 'var(--radius-2xl)' : t.radius,
    borderBottom: tone === 'flat' && separator && !framed ? '1px solid var(--separator)' : t.border,
    boxShadow: isSelected ? `inset 0 0 0 var(--list-row-selected-ring) ${t.ring}` : 'inset 0 0 0 0 transparent',
    color: t.color, fontFamily: 'var(--font-family-base)',
    wordBreak: 'keep-all', overflowWrap: 'break-word', textAlign: 'left',
    opacity: disabled ? 'var(--opacity-disabled)' : undefined,
    ...style,
  };

  const hitStyle = {
    display: 'flex', alignItems: align, flex: '1 1 auto', minWidth: 0, boxSizing: 'border-box',
    gap: 'var(--list-row-gap)',
    minHeight: 'var(--touch-target-min)',
    padding: `var(--list-row-padding-y) ${hasTrail ? 0 : 'var(--list-row-padding-x)'} var(--list-row-padding-y) ${leadOutside ? 'var(--list-row-gap)' : 'var(--list-row-padding-x)'}`,
    margin: 0, border: 0, background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left',
    textDecoration: 'none', borderRadius: 'inherit', appearance: 'none', WebkitAppearance: 'none',
    cursor: interactive ? 'pointer' : undefined,
    pointerEvents: disabled ? 'none' : undefined,
  };

  const titleStyle = {
    ...clamp(lines),
    minWidth: 0, flex: '1 1 auto',
    fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)',
    fontWeight: titleVariant === 'strong' ? ROW_WEIGHT.strong : ROW_WEIGHT.regular,
    color: isLabel ? t.muted : undefined,
    // `textWrap: undefined`를 넣지 않는다: 값이 비면 `white-space: nowrap`이 함께 만든 text-wrap-mode까지 지워져 1줄 말줄임이 풀린다.
    ...(lines !== 1 ? { textWrap: 'balance' } : null),
  };

  const timeNode = hasTime ? (
    <span
      style={{
        flexShrink: 0, whiteSpace: 'nowrap', color: t.muted,
        fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', fontWeight: ROW_WEIGHT.regular,
      }}
    >
      {time}
    </span>
  ) : null;

  const lineGap = 'var(--list-row-line-gap)';

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
  );

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
        <span aria-hidden="true" style={{ alignSelf: 'center', flexShrink: 0, display: 'flex' }}><CheckIcon width={20} height={20} /></span>
      ) : chevron ? (
        <span aria-hidden="true" style={{ alignSelf: 'center', flexShrink: 0, display: 'flex', color: t.muted }}>
          {expandable ? (
            // 회전은 감싼 span이 맡는다(아이콘 svg에 className을 걸면 IconCatalog의 Svg가 width·height를 지운다).
            <span className="ds-list-row-chevron" data-expanded={ariaExpanded === true || ariaExpanded === 'true' ? 'true' : 'false'} style={{ display: 'flex' }}>
              <ChevronDownIcon width={20} height={20} />
            </span>
          ) : (
            <ChevronRightIcon width={20} height={20} />
          )}
        </span>
      ) : null}
    </>
  );

  const leftArea = (
    <>
      {hasIndicator && !leadOutside && <Indicator>{indicator}</Indicator>}
      {hasLead && !leadOutside && <Lead lead={lead} shape={leadShape} badge={leadBadge} tone={tone} />}
    </>
  );

  const hitContent = (
    <>
      {leftArea}
      {body}
      {rightArea}
    </>
  );

  const ariaProps = { ...rest };
  if (expandable) ariaProps['aria-expanded'] = ariaExpanded;
  if (isSelected && !href && onClick && ariaProps.role === undefined) ariaProps['aria-pressed'] = true;
  else if (selected === false && !href && onClick && ariaProps.role === undefined) ariaProps['aria-pressed'] = false;
  if (isSelected && href) ariaProps['aria-current'] = 'true';

  let hit;
  if (href && !disabled) {
    hit = <a href={href} onClick={onClick} className="ds-list-row-hit" style={hitStyle} {...ariaProps}>{hitContent}</a>;
  } else if (href && disabled) {
    hit = <a role="link" aria-disabled="true" className="ds-list-row-hit" style={hitStyle} {...ariaProps}>{hitContent}</a>;
  } else if (onClick) {
    hit = <button type="button" onClick={onClick} disabled={disabled} className="ds-list-row-hit" style={hitStyle} {...ariaProps}>{hitContent}</button>;
  } else {
    hit = <div className="ds-list-row-hit" style={hitStyle} {...(disabled ? { 'aria-disabled': 'true' } : null)} {...ariaProps}>{hitContent}</div>;
  }

  return (
    <div className={`ds-list-row ${className}`.trim()} data-interactive={interactive ? 'true' : 'false'} style={wrapperStyle}>
      <style href="ds-list-row" precedence="medium">{STATIC_CSS}</style>
      {leadOutside && (
        <div
          style={{
            display: 'flex', alignItems: align, flexShrink: 0, gap: 'var(--list-row-gap)',
            padding: 'var(--list-row-padding-y) 0 var(--list-row-padding-y) var(--list-row-padding-x)',
          }}
        >
          {hasIndicator && <Indicator>{indicator}</Indicator>}
          <a
            href={leadHref}
            className="ds-list-row-lead-link"
            aria-label={leadLabel || undefined}
            tabIndex={disabled ? -1 : undefined}
            style={{ display: 'block', color: 'inherit', textDecoration: 'none', borderRadius: leadShape === 'round' ? 'var(--radius-full)' : 'var(--radius-2xl)', pointerEvents: disabled ? 'none' : undefined }}
          >
            <Lead lead={lead} shape={leadShape} badge={leadBadge} tone={tone} />
          </a>
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
  );
}

/**
 * ListRowSkeleton — 로딩 자리. lead 48 + 세 줄 자리가 실제 행(eyebrow 12 · title 16 · meta 14)과 같은 줄 높이라
 * 로딩이 끝나도 레이아웃이 밀리지 않는다. 막대는 기존 Skeleton의 shimmer를 쓴다. Skeleton은 aria-hidden이므로
 * 로딩 안내는 호출부의 aria-live 영역이 맡는다.
 */
export function ListRowSkeleton({ tone = 'default', separator = false, selected, className = '', style = {} }) {
  const t = TONES[tone] ?? TONES.default;
  const framed = hasSelectedFrame(tone, selected);
  // `Skeleton`의 기본 채움은 `--background`(크림)라 면이 없는 flat 행(크림 바탕 위)에서는 막대가 바탕에 묻힌다. flat만 한 단계 어두운 색으로 채운다.
  const fill = tone === 'flat' ? { background: 'var(--background-secondary)' } : null;
  const lineBox = (height, bar, width) => (
    <span style={{ display: 'flex', alignItems: 'center', height }}>
      <Skeleton width={width} height={bar} borderRadius="var(--radius-full)" style={fill ?? undefined} />
    </span>
  );
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        ...(tone === 'flat' && !framed ? { '--list-row-padding-x': '0px' } : null),
        display: 'flex', alignItems: 'center', boxSizing: 'border-box', width: '100%',
        minHeight: 'var(--touch-target-min)', gap: 'var(--list-row-gap)',
        padding: 'var(--list-row-padding-y) var(--list-row-padding-x)',
        background: t.background, border: t.border, borderRadius: framed ? 'var(--radius-2xl)' : t.radius,
        borderBottom: tone === 'flat' && separator && !framed ? '1px solid var(--separator)' : t.border,
        ...style,
      }}
    >
      <Skeleton
        width="var(--list-row-lead-size)" height="var(--list-row-lead-size)"
        borderRadius="var(--radius-2xl)" style={{ flexShrink: 0, ...fill }}
      />
      <span style={{ display: 'block', flex: '1 1 0%', minWidth: 0 }}>
        {lineBox('calc(var(--text-xs) * var(--text-xs--line-height))', 12, '30%')}
        <span style={{ display: 'block', marginTop: 'var(--list-row-line-gap)' }}>
          {lineBox('calc(var(--text-base) * var(--text-base--line-height))', 16, '65%')}
        </span>
        <span style={{ display: 'block', marginTop: 'var(--list-row-line-gap)' }}>
          {lineBox('calc(var(--text-sm) * var(--text-sm--line-height))', 14, '85%')}
        </span>
      </span>
    </div>
  );
}
