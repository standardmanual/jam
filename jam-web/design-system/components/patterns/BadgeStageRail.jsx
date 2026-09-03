import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';

/**
 * BadgeStageRail — 계열(같은 이름, 등급별 눈금) 진행 레일. 티켓 20260903_2329 (1차: 구조 전환).
 *
 * 배지 트리는 원래 등급 우선으로 배지를 평탄하게 나열했다 — 같은 계열의 Common~Mystic
 * 4장이 화면 전역에 흩어져 위계·진행 감각이 없었다. 이 컴포넌트는 계열 하나 = 레일 하나로
 * 묶어, 눈금(등급)과 그 사이 연결선(게이트)으로 "지금 어디까지 왔는가"를 한 줄로 보여준다.
 *
 * 눈금 상태는 이번 범위에서 4종만 지원한다:
 *   earned       — 획득. 원본 컬러 + 라임 링 + 체크 마커.
 *   ready        — 조건은 채웠지만 게이트(미션·선행배지)가 안 열림. 그레이스케일 + 라임 링 +
 *                  자물쇠 마커. "조건 충족" 라벨.
 *   locked       — 조건도 게이트도 안 열림. 그레이스케일 + 중성 얇은 링 + 자물쇠 마커.
 *   not-reached  — 게이트가 이미 열려 있고 막고 있는 게 없지만 아직 도달 전. 그레이스케일 +
 *                  중성 얇은 링, 마커 없음. "—" 라벨.
 * ready/locked를 가르는 "조건"은 이 컴포넌트가 계산하지 않는다 — 호출부가 기존
 * evaluateConditionDetailed pass/fail을 넘겨준다. "다음 목표" 강조 링·아크·잔여값은
 * 진행 계산 모듈(computeBadgeProgress)이 필요한 2차에서 붙는다.
 *
 * 배지 이미지 색 규칙(예외 없음): 미획득 = grayscale(1), 획득 = 원본 컬러. 필터는 이미지
 * 요소에만 걸고 링·마커에는 걸지 않는다 — MissionCard.jsx의 잠금 오버레이와 같은 원칙.
 *
 * 인터랙션: 눈금 하나는 상태에 따라 링크(embedded 이동, earned/not-reached) 또는
 * 버튼(잠금 해제 조건 시트 오픈, ready/locked) 둘 중 하나다 — 앵커 안에 버튼을 중첩하지
 * 않기 위한 설계. "레일에는 지금 막는 문 하나만 그린다" — 마지막 획득 눈금 다음(frontier)이
 * ready/locked일 때만 그 앞 연결선에 점선+자물쇠(게이트)를 그린다. 그 뒤 눈금은 각자 코너
 * 마커로만 잠김을 나타내고 연결선은 빈 트랙이다 — 문 여러 개를 한꺼번에 그리면 "어디서
 * 막혔는지"가 오히려 안 읽힌다(원 검토문서 §04).
 */

const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' };
const STATUS_LABEL = { earned: '획득', ready: '조건 충족', locked: '잠김', 'not-reached': '—' };

const STATIC_CSS = `
.ds-rail-header{background:none;border:none;padding:0;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit;transition:opacity var(--duration-quick,150ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-rail-header:active{opacity:0.7}
.ds-rail-chevron{transition:transform var(--duration-fast,250ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))}
.ds-rail-stop{transition:scale var(--duration-quick,150ms) var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1));text-decoration:none;color:inherit}
.ds-rail-stop:active{scale:var(--scale-press,0.96)}
button.ds-rail-stop{background:none;border:none;padding:0;font:inherit;cursor:pointer}
.ds-rail-lock-btn{background:none;border:none;padding:0;color:inherit;font:inherit;cursor:pointer;position:relative}
.ds-rail-lock-btn::after{content:"";position:absolute;inset:-13px}
.ds-rail-gate-link{background:repeating-linear-gradient(90deg, rgba(255,255,255,.26) 0 4px, transparent 4px 8px)}
@media (prefers-reduced-motion: reduce){.ds-rail-header,.ds-rail-chevron,.ds-rail-stop{transition:none!important}}
`;

function LockGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z" />
    </svg>
  );
}
function CheckGlyph({ size = 11 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
    </svg>
  );
}
function ChevronDownGlyph({ size = 20 }) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
    </svg>
  );
}

/** 눈금 하나의 배지 썸네일 — 접힌 레일·펼친 티어 목록이 공유한다. */
function StopThumbnail({ imageUrl, alt, status }) {
  const earned = status === 'earned';
  const ringColor = status === 'earned' || status === 'ready' ? 'var(--status-done-solid)' : 'var(--color-border-light)';
  const ringWidth = status === 'earned' || status === 'ready' ? 2 : 1;
  const showMarker = status === 'earned' || status === 'ready' || status === 'locked';

  return (
    <span
      style={{
        position: 'relative', width: 44, height: 44, flex: 'none',
        borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `inset 0 0 0 ${ringWidth}px ${ringColor}`,
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- DS는 Next.js에 종속되지 않는다(BadgeGridCard.jsx와 동일 컨벤션)
        <img
          src={imageUrl}
          alt={alt}
          style={{
            width: '100%', height: '100%', objectFit: 'contain', padding: 3,
            borderRadius: 'var(--radius-sm)', filter: earned ? 'none' : 'grayscale(1)',
          }}
        />
      ) : (
        <span style={{ width: 20, height: 20, borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-inverse)', opacity: 0.2 }} />
      )}
      {showMarker && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--color-surface-elevated)',
            background: status === 'earned' ? 'var(--status-done-solid)' : 'var(--color-base-grey-700)',
            color: status === 'earned' ? '#000' : 'var(--color-text-secondary)',
          }}
        >
          {status === 'earned' ? <CheckGlyph size={10} /> : <LockGlyph size={10} />}
        </span>
      )}
    </span>
  );
}

/** 상태에 따라 링크(이동) 또는 버튼(잠금 시트 오픈) 중 하나로만 렌더 — 앵커 중첩 버튼 금지. */
function StopHitArea({ status, href, onOpenLock, ariaLabel, children }) {
  if (status === 'ready' || status === 'locked') {
    return (
      <button type="button" className="ds-rail-stop" onClick={onOpenLock} aria-label={ariaLabel}>
        {children}
      </button>
    );
  }
  return (
    <a href={href} className="ds-rail-stop" aria-label={ariaLabel}>
      {children}
    </a>
  );
}

export function BadgeStageRail({
  familyName,
  /** [{ id, rarity, imageUrl, description, status, href }] — Common→Mystic 순, 존재하는 등급만 */
  stops,
  /**
   * 다음으로 노려야 할 등급 라벨("Epic" 등). 전부 획득했으면 null.
   * 기본값을 두지 않는다 — JS 추론 컴포넌트에서 `= null` 기본값은 타입을 정확히 `null`
   * 하나로 좁혀 버려(문자열 값을 넘기는 실제 호출부가 타입 에러가 난다), 항상 명시적으로
   * 넘기는 쪽이 안전하다(호출부는 `nextRarityLabel={family에서 계산한 값 ?? null}` 형태로 넘김).
   */
  nextRarityLabel,
  expanded = false,
  onToggleExpand = () => {},
  /**
   * (stopId) => void — ready/locked 눈금(또는 그 앞 게이트) 탭 시 잠금 해제 조건 시트 요청.
   * 기본값을 두지 않는다 — 0-인자 기본값(`() => {}`)을 두면 JS 추론이 프롭 타입을 정확히
   * `() => void`로 좁혀, `(stopId) => ...` 형태의 실제 호출부가 "인자를 너무 적게 받는
   * 시그니처" 타입 에러가 난다. 항상 명시적으로 넘긴다(잠금 눈금이 없는 스토리는 no-op을 넘김).
   */
  onLockClick,
  className = '',
  style = {},
}) {
  const frontierIndex = stops.findIndex((s) => s.status !== 'earned');
  const earnedCount = stops.filter((s) => s.status === 'earned').length;
  const summarySentence =
    nextRarityLabel == null
      ? `${familyName}, 모두 획득했어요.`
      : `${familyName}, ${stops.length}단계 중 ${earnedCount}단계 획득. 다음 단계 ${nextRarityLabel}.`;

  return (
    <div
      className={className}
      style={{
        position: 'relative', borderRadius: 'var(--radius-card)', padding: 'var(--spacing-16)',
        background: 'linear-gradient(160deg, rgba(255,255,255,.075) 0%, rgba(255,255,255,.018) 58%), var(--color-surface-elevated)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
        ...style,
      }}
    >
      <style>{STATIC_CSS}</style>

      <button type="button" className="ds-rail-header" onClick={onToggleExpand} aria-expanded={expanded}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-12)' }}>
          <span
            style={{
              fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em',
              overflowWrap: 'anywhere', color: 'var(--color-text)',
            }}
          >
            {familyName}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
              {nextRarityLabel ? `다음 ${nextRarityLabel}` : '모두 획득'}
            </span>
            <span className="ds-rail-chevron" style={{ display: 'flex', color: 'var(--color-text-secondary)', transform: expanded ? 'rotate(180deg)' : 'none' }}>
              <ChevronDownGlyph size={20} />
            </span>
          </span>
        </span>
      </button>

      <div role="group" aria-label={summarySentence} style={{ display: 'flex', alignItems: 'flex-start', marginTop: 'var(--spacing-16)' }}>
        {stops.map((stop, i) => {
          const rarityLabel = RARITY_LABEL[stop.rarity] ?? stop.rarity;
          const stopAriaLabel =
            stop.status === 'ready' || stop.status === 'locked'
              ? `${familyName} ${rarityLabel}, ${STATUS_LABEL[stop.status]}. 잠금 해제 조건 보기`
              : `${familyName} ${rarityLabel}, ${STATUS_LABEL[stop.status]}`;
          const isGateBefore = i === frontierIndex && i > 0 && (stop.status === 'locked' || stop.status === 'ready');

          return (
            <React.Fragment key={stop.id}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={isGateBefore ? 'ds-rail-gate-link' : undefined}
                  style={{
                    flex: isGateBefore ? '0 0 36px' : '1 1 14px',
                    minWidth: isGateBefore ? 36 : 14,
                    height: 6,
                    marginTop: 19,
                    borderRadius: 'var(--radius-xs)',
                    background: isGateBefore ? undefined : 'var(--status-idle-track)',
                    display: isGateBefore ? 'flex' : 'block',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isGateBefore && (
                    <button
                      type="button"
                      className="ds-rail-lock-btn"
                      onClick={() => onLockClick?.(stop.id)}
                      aria-label={`${familyName} ${rarityLabel} 잠금 해제 조건 보기`}
                      style={{
                        width: 20, height: 20, borderRadius: '50%', background: 'var(--color-surface-elevated)',
                        boxShadow: 'inset 0 0 0 1px var(--color-border-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)',
                      }}
                    >
                      <LockGlyph size={10} />
                    </button>
                  )}
                </span>
              )}
              <StopHitArea
                status={stop.status}
                href={stop.href}
                onOpenLock={() => onLockClick?.(stop.id)}
                ariaLabel={stopAriaLabel}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 48 }}>
                  <StopThumbnail imageUrl={stop.imageUrl} alt={`${familyName} ${rarityLabel}`} status={stop.status} />
                  <span
                    style={{
                      fontSize: 'var(--text-micro)', lineHeight: 1, whiteSpace: 'nowrap',
                      color: stop.status === 'earned' || stop.status === 'ready' ? 'var(--status-done-solid)' : 'var(--color-text-secondary)',
                      opacity: stop.status === 'not-reached' ? 0.7 : 1,
                    }}
                  >
                    {STATUS_LABEL[stop.status]}
                  </span>
                </span>
              </StopHitArea>
            </React.Fragment>
          );
        })}
      </div>

      {expanded && (
        <div style={{ marginTop: 'var(--spacing-16)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-16)' }}>
          {stops.map((stop) => {
            const rarityLabel = RARITY_LABEL[stop.rarity] ?? stop.rarity;
            const canOpenLock = stop.status === 'ready' || stop.status === 'locked';
            return (
              <div key={stop.id} style={{ display: 'flex', gap: 'var(--spacing-12)', alignItems: 'flex-start' }}>
                <StopThumbnail imageUrl={stop.imageUrl} alt={`${familyName} ${rarityLabel}`} status={stop.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <RarityBadge rarity={stop.rarity} />
                    {canOpenLock && (
                      <button
                        type="button"
                        className="ds-rail-lock-btn"
                        onClick={() => onLockClick?.(stop.id)}
                        aria-label={`${rarityLabel} 잠금 해제 조건 보기`}
                        style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}
                      >
                        <LockGlyph size={14} />
                      </button>
                    )}
                  </div>
                  <p
                    style={{
                      margin: '4px 0 0', fontSize: 'var(--text-small)', fontWeight: 600, lineHeight: 1.4,
                      color: stop.status === 'earned' || stop.status === 'ready' ? 'var(--status-done-solid)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {STATUS_LABEL[stop.status]}
                  </p>
                  {stop.description && (
                    <p
                      style={{
                        margin: '4px 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.5,
                        color: 'var(--color-text-secondary)', whiteSpace: 'pre-line',
                      }}
                    >
                      {stop.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
