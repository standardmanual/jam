import React from 'react';

/**
 * MixerSlot — 믹스(크래프팅) 슬롯 카드. 아이템·액티비티·체크인 등 배지 타입 구분 없이
 * 시각적으로 동일하게 그리는 슬롯 UI (티켓 20260917_1655).
 *
 * 상태 3가지:
 *   empty  — 점선 테두리 + 타입 아이콘 + 필요 배지 이름. 탭하면 채울 수 있다.
 *   locked — 후보 배지를 하나도 보유하지 못한 슬롯. 사선 패턴으로 empty와 구분한다.
 *            탭해도 채울 배지가 없다는 뜻이라 상호작용은 호출부가 막는다(이 컴포넌트는
 *            시각만 담당 — onClick 자체는 그대로 전달된다).
 *   filled — 채운 배지 카드(썸네일+이름) + 우상단 제거 버튼(X 서클).
 *
 * 완료 여부는 이 슬롯의 시각 상태만으로 표현한다 — 진행률 텍스트는 이 컴포넌트도,
 * 호출부도 별도로 그리지 않는다(티켓 확정 사항).
 *
 * 배지 드랍·픽업 화면에서도 "빈칸 채우기" 패턴이 재사용될 여지가 있다고 판단해
 * 서비스 전용이 아니라 MODULAR 정식 컴포넌트로 둔다(티켓 20260917_1655 사용자 결정).
 */
export function MixerSlot({
  status = 'empty',
  /** empty/locked일 때 보여줄 타입 아이콘 (예: 아이템/액티비티/체크인 아이콘) */
  icon,
  /** empty/locked일 때 보여줄 안내 문구(필요 배지 이름 등) */
  label,
  /** filled일 때 배지 썸네일 URL */
  imageUrl,
  /** filled일 때 배지 이름 */
  name,
  /** 슬롯 탭 핸들러 — empty/locked 상태에서 가방 시트를 여는 데 쓴다 */
  onClick,
  /** filled일 때만 렌더되는 제거 버튼 핸들러 */
  onRemove,
  removeLabel = '슬롯에서 빼기',
  className = '',
  style = {},
}) {
  const filled = status === 'filled';
  const locked = status === 'locked';

  const baseStyle = {
    position: 'relative',
    aspectRatio: '1 / 1',
    width: '100%',
    borderRadius: 'var(--radius-card)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--spacing-4)',
    padding: 'var(--spacing-8)',
    boxSizing: 'border-box',
    textAlign: 'center',
    fontFamily: 'var(--font-family-base)',
    border: filled ? 'none' : '1px dashed var(--color-border)',
    background: filled
      ? 'var(--color-surface-elevated)'
      : locked
        ? 'repeating-linear-gradient(135deg, var(--color-surface-elevated) 0px, var(--color-surface-elevated) 6px, var(--color-surface) 6px, var(--color-surface) 12px)'
        : 'var(--color-surface)',
    color: 'var(--color-text)',
    opacity: locked ? 0.5 : 1,
    cursor: onClick ? 'pointer' : undefined,
    ...style,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={baseStyle}
      aria-label={filled ? name : label}
    >
      {filled ? (
        <>
          <div style={{ width: '68%', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {imageUrl ? (
              <img src={imageUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span aria-hidden="true" style={{ opacity: 0.3 }}>{icon}</span>
            )}
          </div>
          <p
            style={{
              fontSize: 'var(--text-caption)',
              lineHeight: 'var(--leading-caption)',
              color: 'var(--color-text)',
              width: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </p>
          {onRemove && (
            <span
              role="button"
              tabIndex={0}
              aria-label={removeLabel}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  onRemove();
                }
              }}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 22,
                height: 22,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--color-surface-inverse)',
                color: 'var(--color-text-inverse)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              ✕
            </span>
          )}
        </>
      ) : (
        <>
          <span aria-hidden="true" style={{ opacity: 0.4 }}>{icon}</span>
          {label && (
            <p
              style={{
                fontSize: 'var(--text-caption)',
                lineHeight: 'var(--leading-caption)',
                color: 'var(--color-text)',
                opacity: 0.6,
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </p>
          )}
        </>
      )}
    </button>
  );
}
