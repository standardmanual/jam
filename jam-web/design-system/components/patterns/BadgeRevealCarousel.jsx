import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RarityBadge, getRarityLabel } from '../cards/RarityBadge.jsx';
import { IconButton } from '../buttons/IconButton.jsx';

/**
 * BadgeRevealCarousel — 배지 획득 연출용 3D 코버플로우 캐러셀 (오버레이 포함 패턴).
 *
 * 역할
 *   동기화 등으로 새로 획득한 배지를 전체 화면 오버레이 위에서 한 장씩 보여준다.
 *   배지 드랍 엔진의 **최종 결과가 나온 뒤에만** 열린다 — 열리면 곧바로 실제 배지 카드다.
 *   (20260824_001: 응답을 기다리는 "빈 카드 스핀" 단계는 폐기했다. 대기 표현은 호출부
 *    버튼의 loading 스피너가 담당한다.)
 *
 * 슬롯 (카드 1장 세로 구성)
 *   배지 이미지 → 등급 pill(RarityBadge) → 이름 → 설명(3줄 클램프)
 *   이미지가 없으면 실루엣 SVG 폴백을 그린다.
 *
 * 개수별 규칙
 *   0장  — 아무것도 렌더하지 않는다(캐러셀 미노출). 호출부가 애초에 열지 않는 것이 정상 경로.
 *   1장  — 이웃 카드 없음, 플리킹 비활성.
 *   2장  — 왼쪽 없음, 오른쪽에만 1장. rel 정규화를 "양수 우선"으로 접어 왼쪽에 붙지 않게 한다.
 *   3장+ — 좌우 1장씩 peek.
 *
 * 인터랙션 모드
 *   - 좌우 포인터 드래그(플리킹): 거리 120px 또는 속도 0.5px·ms 이상이면 한 칸 이동.
 *   - 키보드 ArrowLeft / ArrowRight.
 *   - 중앙 카드 탭으로 넘기는 동작은 **없다**(닫기 버튼 오조작 방지).
 *   - 배경(오버레이) 탭으로 닫는 동작도 **없다**. 닫기는 닫기 버튼과 Escape 두 경로뿐이다
 *     — 카드 밖 영역이 화면 대부분이라 스와이프 중 의도치 않게 닫히는 사고를 막는다.
 *
 * 접근성
 *   role="dialog" / aria-modal / Escape 닫기 / 포커스 트랩(BottomSheet·ModalToast와 동일 패턴).
 *   중앙 카드의 텍스트(등급·이름·설명)는 **오버레이 안에 상시 마운트된 라이브 리전**이
 *   대신 읽는다(20260823_008). 카드 DOM은 3D 변환·순환으로 노드가 옮겨다녀 그 자체를
 *   라이브 리전으로 쓸 수 없기 때문이다. 대신 카드 안쪽 텍스트는 aria-hidden으로 접어
 *   같은 내용이 두 번 읽히지 않게 한다("전체 보기" 버튼은 그대로 초점 이동 대상이다).
 *   ※ 오버레이가 "열렸다"는 사실과 획득 개수 안내는 호출부(서비스 래퍼)가 별도 라이브
 *   리전으로 알린다 — 라이브 리전은 마운트 시점의 초기 내용을 읽지 않기 때문이다.
 *   prefers-reduced-motion이면 3D 틸트(rotateY·translateZ)를 제거하고 단순 페이드로
 *   대체한다(디자인 시스템은 서비스 코드를 import할 수 없어 동일 로직을 내부 구현).
 *
 * 레이아웃 메모
 *   중앙 카드 폭 기본 344px = 서비스 컬럼(430px)의 80%. 이웃 카드는 화면 밖으로 잘려도 된다.
 *   닫기 버튼은 카드 DOM 안이 아니라 **스테이지 기준 절대 위치**에 둔다 — 카드가 preserve-3d
 *   안에서 rotateY/scale 변환을 받기 때문에, 카드 안에 넣으면 버튼도 함께 기울고 축소돼
 *   터치 타겟이 뒤틀린다.
 */

/** 카드 1칸 이동 시간 */
const STEP_MOVE_MS = 340;
/** 플리킹 판정 — 거리(px) / 속도(px·ms). 서비스 BottomSheet 드래그 임계값의 수평 버전 */
const DRAG_DISTANCE_THRESHOLD = 120;
const DRAG_VELOCITY_THRESHOLD = 0.5;
/** 속도 계산에 쓰는 최근 샘플 구간 */
const VELOCITY_SAMPLE_WINDOW_MS = 120;

/** 이웃 카드 가로 간격 = 카드 폭 × 이 비율 */
const NEIGHBOR_OFFSET_RATIO = 0.6;
/** 이웃 카드 Y축 회전 각도 */
const NEIGHBOR_ROTATE_DEG = 34;
/** 이웃 카드 깊이(뒤로 밀기) */
const NEIGHBOR_DEPTH_PX = 130;
/** 이웃 카드 축소 비율 */
const NEIGHBOR_SCALE = 0.84;
/** 이웃 카드 투명도 */
const NEIGHBOR_OPACITY = 0.68;

/** 화면에는 보이지 않고 보조기술만 읽는 영역 */
const SR_ONLY_STYLE = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** moreMessage prop은 문자열 또는 (잔여 개수) => 문자열 */
function resolveMoreMessage(message, count) {
  return typeof message === 'function' ? message(count) : message;
}

const FALLBACK_ICON = (
  <svg
    width="72" height="72" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5"
    style={{ color: 'var(--color-text)', opacity: 0.3 }}
    aria-hidden="true"
  >
    <circle cx="12" cy="8" r="5" />
    <path d="M3 20c0-4 4-7 9-7s9 3 9 7" />
  </svg>
);

/** OS 모션 축소 설정 구독 (design-system은 서비스 lib/motion.ts를 import할 수 없다) */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  return reduced;
}

/**
 * 활성 카드 기준 상대 위치.
 * 0..n-1로 접은 뒤 n/2를 **초과**할 때만 음수로 뒤집는다(양수 우선).
 * n=2에서 나머지 한 장이 왼쪽(-1)이 아니라 오른쪽(+1)에 서는 이유가 이 "초과" 비교다.
 */
function relativeOffset(index, active, count) {
  if (count <= 1) return index - active;
  let rel = (index - active) % count;
  if (rel < 0) rel += count;
  if (rel > count / 2) rel -= count;
  return rel;
}

export function BadgeRevealCarousel({
  open,
  items = [],
  moreCount = 0,
  onMoreClick,
  onClose,
  cardWidth = 344,
  cardHeight,
  closeLabel = '닫기',
  moreLabel = '전체 보기',
  moreMessage = (n) => `배지 ${n}개를 더 획득했어요`,
  ariaLabel = '획득한 배지',
  className = '',
  style = {},
}) {
  const reduced = useReducedMotion();
  const stageRef = useRef(null);
  const closeSlotRef = useRef(null);
  const dragStartRef = useRef(0);
  const draggingRef = useRef(false);
  const velocitySamplesRef = useRef([]);
  /** document 레벨 화살표 핸들러가 참조하는 최신 핸들러 (아래 Escape 이펙트에서 사용) */
  const arrowHandlerRef = useRef(null);

  const [dragX, setDragX] = useState(0);

  const height = cardHeight ?? Math.round(cardWidth * 1.34);

  /** 렌더할 카드 목록 — 배지 N장 + (잔여가 있으면) 전체 보기 카드 1장 */
  const cards = useMemo(() => {
    const list = items.map((item, i) => ({ key: `badge-${item.id ?? i}`, kind: 'badge', item }));
    if (moreCount > 0) list.push({ key: 'more', kind: 'more' });
    return list;
  }, [items, moreCount]);

  const count = cards.length;
  const canFlick = count > 1;

  /* 활성 카드 위치.
     중앙 카드는 두 상황에서 첫 카드(0번)로 돌아와야 한다.
       (1) 카드 수가 바뀔 때 — 열린 채로 목록이 교체되어도 인덱스가 범위를 벗어나지 않게.
       (2) 오버레이가 새로 열릴 때 — 카드 수가 직전과 같아도 "획득 순서 그대로 첫 배지부터".
     (1)은 위치를 "어떤 구성에서 정한 값인지"(token)와 함께 들고 다니다가 구성이 달라지면
     저장값을 무시하고 0으로 파생시켜 처리한다(이펙트 없이 렌더 중 파생). */
  const navToken = count;
  const [nav, setNav] = useState({ token: navToken, index: 0 });

  /* (2) 재오픈 리셋. token만으로는 카드 수가 같은 재오픈(1개 → 1개, 3개 → 3개)에서 직전
     인덱스가 그대로 살아난다 — 20260824_001에서 스핀을 제거하기 전에는 phase 전환이 token을
     갈아치우며 우연히 이 역할을 겸하고 있었다. 이펙트에서 setState하면 렌더가 한 번 더
     커밋되므로, React 공식 "렌더 중 상태 조정" 패턴으로 open 변화를 직접 감지한다.
     https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes */
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setNav({ token: navToken, index: 0 });
  }

  const active = nav.token === navToken ? nav.index : 0;

  const step = useCallback(
    (dir) => {
      if (!canFlick) return;
      setNav((prev) => {
        const base = prev.token === navToken ? prev.index : 0;
        return { token: navToken, index: (base + dir + count) % count };
      });
    },
    [canFlick, count, navToken]
  );

  /* Escape 닫기 + 화살표 전환 + 포커스 트랩 (BottomSheet·ModalToast와 동일 패턴) */
  useEffect(() => {
    if (!open) return;
    const prevFocused = typeof document !== 'undefined' ? document.activeElement : null;
    closeSlotRef.current?.querySelector('button')?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      // 20260823_007: 화살표 전환은 스테이지가 아니라 document에서 받는다. 오버레이가 열리면
      // 초기 포커스가 닫기 버튼으로 가는데, 스테이지에 onKeyDown을 걸어두면 Tab으로 스테이지에
      // 포커스를 옮기기 전까지 좌우 키가 먹지 않았다(개선 리뷰 3번). 스테이지 핸들러는 제거해
      // 중복 step 호출이 생기지 않게 한다.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        arrowHandlerRef.current?.(e);
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = stageRef.current?.parentElement?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      prevFocused?.focus?.();
    };
  }, [open, onClose]);

  /* 카드별 상대 위치.
     카드가 5장 이상이면 |rel| >= 2가 "숨김 링"이 되어(opacity 0) 순환할 때 반대편으로
     건너뛰는 이동이 화면에 보이지 않는다. 3~4장일 때는 숨김 링이 없어 순환하는 한 장이
     중앙 카드 뒤로 가로질러 이동하는데, 이 경우까지 없애려면 렌더 중 이전 rel을 참조해야 해
     (ref 읽기) 오히려 규칙 위반이므로 그대로 둔다 — 뒤쪽(zIndex 낮음·축소·반투명)으로
     지나가 시각적 부담이 크지 않다. */
  const layout = cards.map((card, i) => ({ ...card, rel: relativeOffset(i, active, count) }));
  /** 중앙 카드 — 아래 라이브 리전이 이 카드의 텍스트를 읽는다 */
  const center = layout.find((card) => card.rel === 0);

  function handlePointerDown(e) {
    if (!canFlick) return;
    // 닫기 버튼·CTA 위에서 시작한 포인터는 드래그로 가로채지 않는다.
    // (setPointerCapture가 click 대상을 스테이지로 가져가 버튼이 눌리지 않는 문제 방지)
    if (e.target?.closest?.('button')) return;
    draggingRef.current = true;
    dragStartRef.current = e.clientX;
    velocitySamplesRef.current = [{ t: e.timeStamp, x: e.clientX }];
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!draggingRef.current) return;
    const delta = e.clientX - dragStartRef.current;
    const limit = cardWidth * NEIGHBOR_OFFSET_RATIO;
    setDragX(Math.max(-limit, Math.min(limit, delta)));

    velocitySamplesRef.current.push({ t: e.timeStamp, x: e.clientX });
    const cutoff = e.timeStamp - VELOCITY_SAMPLE_WINDOW_MS;
    velocitySamplesRef.current = velocitySamplesRef.current.filter((s) => s.t >= cutoff);
  }

  function handlePointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    const samples = velocitySamplesRef.current;
    let velocity = 0;
    if (samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      if (dt > 0) velocity = (last.x - first.x) / dt;
    }
    velocitySamplesRef.current = [];

    const distance = dragX;
    setDragX(0);
    if (distance <= -DRAG_DISTANCE_THRESHOLD || velocity <= -DRAG_VELOCITY_THRESHOLD) step(1);
    else if (distance >= DRAG_DISTANCE_THRESHOLD || velocity >= DRAG_VELOCITY_THRESHOLD) step(-1);
  }

  function handleKeyDown(e) {
    if (!canFlick) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    }
  }

  /* 화살표 핸들러를 ref에 최신 상태로 보관 — 위 document 리스너가 매 렌더 재구독하지 않도록.
     (handleKeyDown 선언 이후에 두어야 no-use-before-declare에 걸리지 않는다) */
  useEffect(() => {
    arrowHandlerRef.current = handleKeyDown;
  });

  if (!open) return null;
  // 배지 0개 — 캐러셀을 노출하지 않는다.
  if (count === 0) return null;

  const cardBaseStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: cardWidth,
    height,
    marginTop: -height / 2,
    marginLeft: -cardWidth / 2,
    boxSizing: 'border-box',
    background: 'var(--color-surface-elevated)',
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    transformStyle: 'preserve-3d',
    backfaceVisibility: 'hidden',
    willChange: 'transform, opacity',
  };

  return (
    <div
      className={['ds-badge-reveal', className].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'var(--color-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontFamily: 'var(--font-family-base)',
        ...style,
      }}
    >
      {/* 중앙 카드 텍스트 공지.
          화살표·스와이프로 중앙 카드가 바뀌면 이 노드의 내용만 교체되므로 스크린리더가
          변경을 읽는다. 카드 DOM은 순환하며 노드가 옮겨다녀 라이브 리전으로 쓸 수 없다.
          등급 텍스트는 `<RarityBadge>`가 아니라 `getRarityLabel()`로 얻는다 — RarityBadge는
          common일 때 시각적 칩을 렌더하지 않으므로(20260827_024) 여기서 그대로 재사용하면
          common 등급에서 라이브 리전이 등급을 아예 공지하지 못한다(20260904_1502 회귀). */}
      <div aria-live="polite" aria-atomic="true" style={SR_ONLY_STYLE}>
        {center?.kind === 'badge' && (
          <>
            {getRarityLabel(center.item?.rarity ?? 'common')}{' '}
            {center.item?.name}. {center.item?.description}
          </>
        )}
        {center?.kind === 'more' && resolveMoreMessage(moreMessage, moreCount)}
      </div>

      {/* 스테이지 — 3D 원근의 기준. 카드는 이 안에서만 변환된다. */}
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        tabIndex={canFlick ? 0 : -1}
        /* onKeyDown은 여기 두지 않는다 — 화살표는 document 리스너가 처리한다(위 이펙트 참조).
           양쪽에 걸면 스테이지 포커스 상태에서 이벤트가 버블링돼 step이 두 번 호출된다. */
        onPointerDown={canFlick ? handlePointerDown : undefined}
        onPointerMove={canFlick ? handlePointerMove : undefined}
        onPointerUp={canFlick ? handlePointerUp : undefined}
        onPointerCancel={canFlick ? handlePointerUp : undefined}
        style={{
          position: 'relative',
          width: '100%',
          height,
          perspective: reduced ? undefined : '1100px',
          perspectiveOrigin: '50% 50%',
          touchAction: canFlick ? 'pan-y' : 'auto',
          outline: 'none',
        }}
      >
        {layout.map(({ key, kind, item, rel }) => {
          const distance = Math.abs(rel);
          const visible = distance <= 1;
          const isCenter = rel === 0;
          const offsetX = rel * cardWidth * NEIGHBOR_OFFSET_RATIO + (visible ? dragX : 0);
          const transform = reduced
            ? `translate3d(${offsetX}px, 0, 0)`
            : `translate3d(${offsetX}px, 0, ${-distance * NEIGHBOR_DEPTH_PX}px)` +
              ` rotateY(${-rel * NEIGHBOR_ROTATE_DEG}deg)` +
              ` scale(${isCenter ? 1 : NEIGHBOR_SCALE})`;

          // 드래그 중(dragX !== 0)에는 손가락을 그대로 따라와야 하므로 이동 트랜지션을 끈다.
          // 모션 축소 설정이면 이동 자체를 애니메이션하지 않고 페이드만 남긴다.
          const noTransformTransition = dragX !== 0 || reduced;

          return (
            <div
              key={key}
              aria-hidden={!isCenter}
              style={{
                ...cardBaseStyle,
                transform,
                opacity: visible ? (isCenter ? 1 : NEIGHBOR_OPACITY) : 0,
                zIndex: 10 - distance,
                pointerEvents: isCenter ? 'auto' : 'none',
                transition: [
                  noTransformTransition ? null : `transform ${STEP_MOVE_MS}ms var(--ease-smooth-out)`,
                  `opacity ${reduced ? 200 : STEP_MOVE_MS}ms var(--ease-out)`,
                ]
                  .filter(Boolean)
                  .join(', '),
              }}
            >
              {kind === 'badge' && <BadgeCard item={item} />}
              {kind === 'more' && (
                <MoreCard count={moreCount} label={moreLabel} message={moreMessage} onClick={onMoreClick} />
              )}
            </div>
          );
        })}

        {/* 닫기 — 카드 DOM 밖(스테이지 기준 절대 위치). 3D 변환의 영향을 받지 않는다. */}
        <div
          ref={closeSlotRef}
          style={{
            position: 'absolute',
            top: `calc(50% - ${height / 2}px + 4px)`,
            left: `calc(50% + ${cardWidth / 2 - 48}px)`,
            zIndex: 20,
          }}
        >
          <IconButton icon="close" label={closeLabel} surface="light" onClick={onClose} />
        </div>
      </div>

      <style>{`
        @keyframes ds-badge-reveal-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/** 배지 카드 — 이미지 → 등급 pill → 이름 → 설명(3줄) */
function BadgeCard({ item }) {
  const imageUrl = item?.imageUrl;
  return (
    <div
      /* 같은 내용을 캐러셀의 라이브 리전이 읽는다 — 여기까지 읽히면 두 번 들린다 */
      aria-hidden="true"
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: 'var(--spacing-24)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        // 이미지가 maxHeight에 걸려 슬랙이 남을 때 위로 쏠리지 않도록 세로 중앙 정렬
        justifyContent: 'center',
        gap: 'var(--spacing-12)',
        // 카드 자리는 그대로 두고 내용만 채워지는 짧은 페이드 (전체 화면 크로스페이드 아님)
        animation: 'ds-badge-reveal-in 220ms var(--ease-out) both',
      }}
    >
      {/* 이미지 — 남는 공간을 차지하되 카드 높이의 46%를 넘지 않는다.
          텍스트(등급·이름·설명)는 flexShrink:0이라 절대 눌리지 않고, 이미지가 먼저 양보한다.
          20260824: 이름 2행 + 설명 3행일 때 마지막 행이 잘리던 문제 수정 —
          원인은 텍스트 요소들이 기본 flex-shrink:1이라 이미지에 밀려 높이가 깎이면서
          -webkit-box의 overflow:hidden에 잘려나간 것이었다. */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          maxHeight: '46%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item?.name ?? ''}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          FALLBACK_ICON
        )}
      </div>

      <div style={{ flexShrink: 0 }}>
        <RarityBadge rarity={item?.rarity ?? 'common'} />
      </div>

      <p
        style={{
          margin: 0,
          width: '100%',
          flexShrink: 0,
          textAlign: 'center',
          fontSize: 'var(--text-h4)',
          fontWeight: 700,
          lineHeight: 1.25,
          color: 'var(--color-text)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'keep-all',
        }}
      >
        {item?.name}
      </p>

      <p
        style={{
          margin: 0,
          width: '100%',
          flexShrink: 0,
          textAlign: 'center',
          fontSize: 'var(--text-small)',
          lineHeight: 'var(--leading-small)',
          color: 'var(--color-text-secondary)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'keep-all',
          whiteSpace: 'pre-line',
        }}
      >
        {item?.description}
      </p>
    </div>
  );
}

/**
 * 11번째 "전체 보기" 카드.
 * 시각 구성(중앙 정렬 / 원형 아이콘 / 메시지 / pill CTA)은 feedback/ModalToast를 참조했지만,
 * ModalToast는 도입 보류 컴포넌트(20260820_010)라 import하지 않고 카드 안에 직접 구현한다.
 */
function MoreCard({ count, label, message, onClick }) {
  // 문구는 서비스가 i18n 사전에서 주입할 수 있어야 하므로 prop으로 받는다(20260823_007 개선 리뷰 5번).
  const text = resolveMoreMessage(message, count);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: 'var(--spacing-24)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--spacing-16)',
        textAlign: 'center',
        animation: 'ds-badge-reveal-in 220ms var(--ease-out) both',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-primary)',
          color: 'var(--color-text-on-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          viewBox="0 0 24 24" width={26} height={26} fill="none"
          stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>

      {/* 문구는 캐러셀의 라이브 리전이 읽는다(중복 낭독 방지). 버튼은 그대로 접근 대상이다. */}
      <p aria-hidden="true" style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--color-text)' }}>
        {text}
      </p>

      <button
        type="button"
        onClick={onClick}
        style={{
          padding: '10px 24px',
          borderRadius: 'var(--radius-pill)',
          border: 'none',
          background: 'var(--color-primary)',
          color: 'var(--color-text-on-primary)',
          fontSize: 'var(--text-small)',
          fontWeight: 600,
          fontFamily: 'var(--font-family-base)',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    </div>
  );
}
