import React from 'react';
import { LockIcon } from '../icons/IconCatalog.jsx';

/** 타일 안 자물쇠 크기 — 타일 한 변 대비 비율 */
const LOCK_ICON_RATIO = 0.45;

/**
 * LockedTile — 잠긴 아이템 배지의 «잠금 타일». 티켓 20261018_0054 2회 (운영 로직 7.3절).
 *
 * 열기 전의 아이템 배지는 이름·그림을 가린다. 그림 자리에 이 타일이 들어간다. 같은 모양이
 * `BadgeRevealCarousel`(고르기·결과 카드), `BadgeGridCard`(`locked`), 잠긴 상세(`LockedItemDetail`) 세 곳에서
 * 나와 한 컴포넌트로 모았다.
 *
 * 모양 — 한 변이 `size`인 정사각형, `--radius-2xl`, 면 `--background`, 1px `--border`, 가운데 `LockIcon`(`--muted`).
 * 차분한 중립 타일이다. 등급 색·그라데이션·글로우를 더하지 않는다(등급은 `RarityBadge` 칩 하나로만 전달한다).
 * 자물쇠는 장식이라 `aria-hidden`이다 — 잠겼다는 사실은 호출부의 «잠김» 문구가 글자로 전한다.
 *
 * `maxWidth: 100%` + `aspectRatio: 1`이라 부모가 `size`보다 좁으면 정사각형을 유지한 채 줄어든다(3열 그리드의 320px 화면).
 */
export function LockedTile({ size = 90, className = '', style = {} }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        maxWidth: '100%',
        aspectRatio: '1 / 1',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        borderRadius: 'var(--radius-2xl)',
        background: 'var(--background)',
        border: '1px solid var(--border)',
        color: 'var(--muted)',
        ...style,
      }}
    >
      <LockIcon width={Math.round(size * LOCK_ICON_RATIO)} height={Math.round(size * LOCK_ICON_RATIO)} />
    </div>
  );
}
