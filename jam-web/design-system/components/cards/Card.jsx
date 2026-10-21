import React from 'react';

/**
 * Card — surface container.
 * tone: 'default' | 'tint' | 'inverse'
 *
 * 면 레시피(JAM 2.0 라이트, 티켓 20261015_2133):
 *   - default: --surface(흰) + 1px --border. 크림 바탕(--background)과 흰 면은 1.05:1이라 테두리가 경계를 맡는다. 그림자는 쓰지 않는다.
 *   - tint:    --background-secondary(테두리 없음). 흰 카드 안 구획용이다. 크림 바탕 위 단독 카드로는 쓰지 않는다.
 *   - inverse: --background-inverse(어두운 반전 면) + --snow 글자 + 1px 테두리(면과 같은 --background-inverse). 서비스 화면에서는
 *              선택 표시 같은 신호 용도뿐이다. 테두리는 색을 더하지 않고 크기만 고정한다: default는 1px --border라서,
 *              inverse에 테두리가 없으면 선택으로 바뀔 때 카드 안쪽이 1px씩 움직인다(티켓 20261021_1247).
 *
 * 그 밖의 약속:
 *   - padding prop 없음 — --layout-card-padding 토큰을 쓴다(호출부는 className·style로 덮는다)
 *   - radius prop 없음 — 항상 --radius-2xl
 *   - ...rest spread로 className, data-*, aria-*를 통과시킨다
 *   - 테두리는 box-sizing: border-box로 그려 padding·너비 계산을 바꾸지 않는다. tint만 테두리가 없다
 */
export function Card({ tone = 'default', children, className = '', style = {}, onClick, ...rest }) {
  const interactive = Boolean(onClick);

  const backgrounds = {
    default: {
      background: 'var(--surface)',
      color: 'var(--foreground)',
      border: '1px solid var(--border)',
    },
    tint: {
      background: 'var(--background-secondary)',
      color: 'var(--foreground)',
    },
    inverse: {
      background: 'var(--background-inverse)',
      color: 'var(--snow)',
      // 면과 같은 색의 1px 테두리 — default(1px --border)와 박스 크기를 같게 맞춘다(티켓 20261021_1247)
      border: '1px solid var(--background-inverse)',
    },
  };

  return (
    <div
      className={className}
      onClick={onClick}
      role={rest.role ?? (interactive ? 'button' : undefined)}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e);
        }
      } : undefined}
      style={{
        borderRadius: 'var(--radius-2xl)',
        padding: 'var(--layout-card-padding)',
        boxSizing: 'border-box',
        cursor: interactive ? 'pointer' : undefined,
        ...backgrounds[tone] ?? backgrounds.default,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
