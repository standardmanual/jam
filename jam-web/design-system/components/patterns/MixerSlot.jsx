import React from 'react';

/**
 * MixerSlot — 믹스(크래프팅) 슬롯 카드. 아이템·액티비티·체크인 등 배지 타입 구분 없이
 * 시각적으로 동일하게 그리는 슬롯 UI (티켓 20260917_1655, 폴리시 수정 티켓 20260917_1828).
 *
 * 상태 3가지:
 *   empty  — 채울 수 있는(후보를 하나 이상 보유한) 슬롯. 중앙에 흰색 화살표 아이콘(추가
 *            가능함을 나타냄, 티켓 20260917_2028 후속 조정)을 표시하고, 테두리를 밝은
 *            그레이(--muted) 3px로 굵게 표현해 잠긴 슬롯과 구분한다(티켓
 *            20260917_1828). 탭하면 채울 수 있다.
 *   locked — 후보 배지를 하나도 보유하지 못한 슬롯. '+' 텍스트를 흐리게 표시하고, 사선
 *            패턴 없이 불투명도만으로 empty와 구분한다(티켓 20260917_1828 — 사선 패턴
 *            제거). 탭해도 채울 배지가 없다는 뜻이라 상호작용은 호출부가 막는다(이
 *            컴포넌트는 시각만 담당 — onClick 자체는 그대로 전달된다).
 *   filled — 채운 배지 카드(썸네일+이름) + 우상단 제거 버튼(X 서클, 작고 어두운 네거티브 배경).
 *
 * 완료 여부는 이 슬롯의 시각 상태만으로 표현한다 — 진행률 텍스트는 이 컴포넌트도,
 * 호출부도 별도로 그리지 않는다(티켓 확정 사항).
 *
 * empty/locked는 타입 아이콘·후보 이름 텍스트를 그리지 않는다(티켓 20260917_1828) — 슬롯이
 * 무엇을 요구하는지는 탭해서 여는 "내 배지" 시트에서 확인한다.
 *
 * 배지 드랍·픽업 화면에서도 "빈칸 채우기" 패턴이 재사용될 여지가 있다고 판단해
 * 서비스 전용이 아니라 MODULAR 정식 컴포넌트로 둔다(티켓 20260917_1655 사용자 결정).
 */
export function MixerSlot({
  status = 'empty',
  /** filled일 때 배지 썸네일 URL */
  imageUrl,
  /** filled일 때 배지 이름 */
  name,
  /** 슬롯 탭 핸들러 — empty/locked 상태에서 가방 시트를 여는 데 쓴다 */
  onClick,
  /** filled일 때만 렌더되는 제거 버튼 핸들러 */
  onRemove,
  removeLabel = '슬롯에서 빼기',
  emptyLabel = '슬롯 채우기',
  className = '',
  style = {},
}) {
  const filled = status === 'filled';
  const locked = status === 'locked';
  const fillable = status === 'empty';

  const baseStyle = {
    position: 'relative',
    aspectRatio: '1 / 1',
    width: '100%',
    borderRadius: 'var(--radius-2xl)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    textAlign: 'center',
    fontFamily: 'var(--font-family-base)',
    border: filled
      ? 'none'
      : fillable
        ? '3px solid var(--muted)'
        : '1px dashed var(--border)',
    background: filled ? 'var(--surface)' : 'var(--background)',
    color: 'var(--foreground)',
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
      aria-label={filled ? name : emptyLabel}
    >
      {filled ? (
        <>
          <div style={{ width: '68%', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {imageUrl && (
              <img src={imageUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}
          </div>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              lineHeight: 'var(--text-xs--line-height)',
              color: 'var(--foreground)',
              width: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: 'var(--spacing-4)',
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
                top: -4,
                right: -4,
                width: 16,
                height: 16,
                borderRadius: 'var(--radius-full)',
                background: 'var(--base-black)',
                color: 'var(--base-white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              ✕
            </span>
          )}
        </>
      ) : fillable ? (
        <svg
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 -960 960 960"
          fill="var(--base-white)"
        >
          <path d="M480-240 240-480l56-56 144 144v-368h80v368l144-144 56 56-240 240Z" />
        </svg>
      ) : (
        <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1, opacity: 0.4, color: 'var(--foreground)' }}>
          +
        </span>
      )}
    </button>
  );
}
