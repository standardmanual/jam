import React, { useState } from 'react';

/**
 * ListCard — 큰 이미지 위에 제목을 얹는 세로 목록 카드. 티켓 20261114_1543.
 *
 * 구조: 흰 카드(--card-bg, --radius-2xl, 안쪽 12) 안에 [이미지 칸(제목 얹힘)] → [칩 줄 + 값] → [설명] → [footer].
 * 클릭 영역(href/onClick)은 카드 전체 하나의 <a>/<button>이고 그 안은 전부 <span>(phrasing)이다.
 * 도메인을 모른다 — 미션이든 이벤트든 이미지·제목·칩·값·설명·footer만 넘긴다. 자유 `children`은 없다.
 *
 * 이미지 칸은 카드 폭에 맞춘 16:9 비율이고 object-fit cover다. 이미지 안에 박힌 글자는 이 컴포넌트가 신경 쓰지 않는다.
 * 제목은 이미지 칸 왼쪽 아래에 --snow 굵은 20px로 얹는다. 어두운 막(그라데이션)·그림자·blur를 쓰지 않는다 —
 * 밝은 이미지 위 대비는 이미지를 고르는 쪽의 책임이다. 다만 이미지가 없거나(자리표시 면) 딤·그레이스케일로 옅어졌을 때는
 * 흰 글자가 묻히므로 제목을 --foreground로 바꾼다.
 * 이미지가 깨져도 «이미지 없음» 상태로 내려간다.
 *
 * 눌림은 --scale-press-card(0.98) 하나, hover 없음. prefers-reduced-motion이면 끈다.
 * 새 색·새 토큰 없음.
 */

const WEIGHT = { regular: 400, strong: 700 };

export const LIST_CARD_STATIC_CSS = `
.ds-list-card{transition:transform var(--duration-micro,80ms) var(--ease-out,ease-out)}
.ds-list-card[data-interactive="true"]:has(.ds-list-card-hit:active){transform:scale(var(--scale-press-card,0.98))}
.ds-list-card-hit:focus-visible{outline:2px solid var(--link);outline-offset:2px}
@media (prefers-reduced-motion: reduce){
.ds-list-card[data-interactive="true"]:has(.ds-list-card-hit:active){transform:none}
.ds-list-card{transition:none!important}
}
`;

/** 2줄 이상은 줄 수로 자른다. */
function clamp(lines) {
  return { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' };
}

/**
 * ListCard — 슬롯 구성의 이미지 카드. prop 전체는 ListCard.d.ts와 ListCard.prompt.md 참고.
 *
 * `role`·`aria-*`·`data-*`는 클릭 영역(<a>/<button>)으로 전달된다. `className`·`style`은 카드 바깥 면으로 간다.
 */
export function ListCard({
  imageUrl,
  imageAlt = '',
  imagePosition = '50% 50%',
  imageDim,
  grayscale = false,
  imageOverlay,
  title,
  chips,
  value,
  description,
  footer,
  disabled = false,
  href,
  onClick,
  className = '',
  style = {},
  ...rest
}) {
  const [failedUrl, setFailedUrl] = useState(null);
  const showImage = !!imageUrl && failedUrl !== imageUrl;
  const interactive = !disabled && !!(href || onClick);
  const hasChips = chips != null && chips !== false && chips !== '';
  const hasValue = value != null && value !== false && value !== '';
  const hasDescription = description != null && description !== '';
  const hasFooter = footer != null && footer !== false && footer !== '';
  // 흰 글자는 옅어지지 않은 이미지 위에서만 읽힌다.
  const faded = grayscale || (imageDim != null && imageDim < 1);
  const titleColor = showImage && !faded ? 'var(--snow)' : 'var(--foreground)';

  const wrapperStyle = {
    display: 'block', boxSizing: 'border-box', width: '100%',
    background: 'var(--card-bg)', borderRadius: 'var(--radius-2xl)',
    color: 'var(--foreground)', fontFamily: 'var(--font-family-base)',
    wordBreak: 'keep-all', overflowWrap: 'break-word', textAlign: 'left',
    opacity: disabled ? 'var(--opacity-disabled)' : undefined,
    ...style,
  };

  const hitStyle = {
    display: 'block', boxSizing: 'border-box', width: '100%', padding: 'var(--spacing-12)',
    margin: 0, border: 0, background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left',
    textDecoration: 'none', borderRadius: 'inherit', appearance: 'none', WebkitAppearance: 'none',
    cursor: interactive ? 'pointer' : undefined,
    pointerEvents: disabled ? 'none' : undefined,
  };

  const content = (
    <>
      <span
        style={{
          position: 'relative', display: 'block', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden',
          boxSizing: 'border-box', borderRadius: 'var(--radius-xl)', background: 'var(--background-secondary)',
        }}
      >
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element -- 외부 이미지 주소를 그대로 쓰는 장식 이미지라 next/image 최적화 대상이 아니다
          <img
            src={imageUrl}
            alt={imageAlt}
            onError={() => setFailedUrl(imageUrl)}
            style={{
              position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: imagePosition,
              filter: grayscale ? 'grayscale(1)' : undefined,
              opacity: imageDim,
            }}
          />
        )}
        {imageOverlay != null && imageOverlay !== false && (
          <span
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--foreground)',
            }}
          >
            {imageOverlay}
          </span>
        )}
        {title != null && title !== '' && (
          <span
            style={{
              ...clamp(2), position: 'absolute', left: 0, right: 0, bottom: 0, boxSizing: 'border-box',
              padding: 'var(--spacing-12)', color: titleColor,
              fontSize: 'var(--text-xl)', lineHeight: 'var(--text-xl--line-height)', fontWeight: WEIGHT.strong,
            }}
          >
            {title}
          </span>
        )}
      </span>
      {(hasChips || hasValue) && (
        <span
          style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 'var(--spacing-8)', marginTop: 'var(--spacing-8)',
          }}
        >
          {hasChips && (
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--spacing-4)', minWidth: 0, flex: '1 1 auto' }}>
              {chips}
            </span>
          )}
          {hasValue && (
            <span
              style={{
                alignSelf: 'flex-start', flexShrink: 0, marginLeft: 'auto', whiteSpace: 'nowrap',
                fontSize: 'var(--text-sm)', lineHeight: 'var(--text-sm--line-height)', fontWeight: WEIGHT.strong,
              }}
            >
              {value}
            </span>
          )}
        </span>
      )}
      {hasDescription && (
        <span
          style={{
            ...clamp(2), marginTop: 'var(--spacing-4)', color: 'var(--muted)',
            fontSize: 'var(--text-sm)', lineHeight: 'var(--text-sm--line-height)', fontWeight: WEIGHT.regular,
            textWrap: 'balance',
          }}
        >
          {description}
        </span>
      )}
      {hasFooter && <span style={{ display: 'block', marginTop: 'var(--spacing-8)' }}>{footer}</span>}
    </>
  );

  let hit;
  if (href && !disabled) {
    hit = <a href={href} onClick={onClick} className="ds-list-card-hit" style={hitStyle} {...rest}>{content}</a>;
  } else if (href && disabled) {
    hit = <a role="link" aria-disabled="true" className="ds-list-card-hit" style={hitStyle} {...rest}>{content}</a>;
  } else if (onClick) {
    hit = <button type="button" onClick={onClick} disabled={disabled} className="ds-list-card-hit" style={hitStyle} {...rest}>{content}</button>;
  } else {
    hit = <span className="ds-list-card-hit" style={hitStyle} {...(disabled ? { 'aria-disabled': 'true' } : null)} {...rest}>{content}</span>;
  }

  return (
    <div className={`ds-list-card ${className}`.trim()} data-interactive={interactive ? 'true' : 'false'} style={wrapperStyle}>
      <style href="ds-list-card" precedence="medium">{LIST_CARD_STATIC_CSS}</style>
      {hit}
    </div>
  );
}
