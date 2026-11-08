import React from 'react';

/**
 * Card — surface container.
 * tone: 'default' | 'tint' | 'inverse'
 *
 * 면 레시피(JAM 2.0 라이트, 티켓 20261015_2133):
 *   - default: --card-bg(#ffffff) 면, 테두리 없음. #f5f5f5 바탕(--background) 위에서 면 대비로만 구분한다. 그림자는 쓰지 않는다(티켓 20261108_1940).
 *   - tint:    --background-secondary(테두리 없음). 카드 안 구획용이다. 흰 카드 안에 흰 카드를 겹치지 않고 안쪽 구획은 이 tint를 쓴다.
 *   - inverse: --background-inverse(어두운 반전 면) + --snow 글자, 테두리 없음. 서비스 화면에서는
 *              선택 표시 같은 신호 용도뿐이다. default와 같이 테두리가 없어 박스 크기가 같다(티켓 20261108_1940).
 *
 * 그 밖의 약속:
 *   - padding prop 없음 — --card-padding 토큰(16)을 쓴다(호출부는 className·style로 덮는다)
 *   - radius prop 없음 — 항상 --radius-2xl
 *   - ...rest spread로 className, data-*, aria-*를 통과시킨다
 *   - 테두리를 그리지 않는다
 */
export function Card({ tone = 'default', children, className = '', style = {}, onClick, ...rest }) {
  const interactive = Boolean(onClick);

  const backgrounds = {
    default: {
      background: 'var(--card-bg)',
      color: 'var(--foreground)',
    },
    tint: {
      background: 'var(--background-secondary)',
      color: 'var(--foreground)',
    },
    inverse: {
      background: 'var(--background-inverse)',
      color: 'var(--snow)',
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
        padding: 'var(--card-padding)',
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
