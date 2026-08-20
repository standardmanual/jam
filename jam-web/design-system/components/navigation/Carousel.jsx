import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

/**
 * Carousel — 센터 포커스 카드 캐러셀 (무한 루프).
 *
 * 좌우 스와이프(플리킹)로 카드를 전환하며, 항상 중앙에 온 카드가 "선택된" 카드다.
 * 마지막 카드 다음에는 리셋 없이 다시 첫 카드가 자연스럽게 이어진다.
 *
 * 구현 방식: CSS scroll-snap 기반 네이티브 스와이프(터치/트랙패드/마우스 드래그를
 * 브라우저가 직접 처리해 커스텀 제스처 물리 코드가 필요 없다) + 클론 슬라이드
 * ([마지막, ...items, 첫] 확장 배열) 트릭으로 무한 루프를 구현한다. 스크롤이
 * 클론 슬라이드에 안착하면 애니메이션 없이(behavior:'auto') 대응하는 실제
 * 슬라이드 위치로 순간 이동시켜 끊김 없이 이어지는 것처럼 보이게 한다.
 *
 * 카드 높이는 슬라이드마다 다를 수 있다 — 컨테이너를 `alignItems:'flex-end'`로
 * 두어 모든 카드의 하단이 같은 기준선에서 시작하고, 콘텐츠가 많은 카드는
 * 위로만 자라도록 한다(JAM! POI 캐러셀 카드의 "하단 정렬" 요구사항).
 *
 * 슬라이드 폭은 컨테이너의 100%가 아니라 `SLIDE_WIDTH_PERCENT`(peek 레이아웃)로
 * 좁혀, 중앙 카드 좌우로 다음/이전 카드가 부분적으로 보이게 한다(20260820_020).
 * 컨테이너 좌우에 동일한 비율의 padding + scroll-padding을 둬서 첫/마지막
 * 실제 카드도 정확히 중앙까지 스크롤될 수 있게 여백을 만든다. 활성 카드
 * 판정·프로그램적 스크롤 이동은 슬라이드 폭을 고정값으로 가정하지 않고,
 * 실제 렌더된 슬라이드 DOM 요소의 offsetLeft/offsetWidth를 기준으로 계산한다.
 */
const SLIDE_WIDTH_PERCENT = 80; // MODULAR peek 레이아웃 — 78~85% 권장 범위 내
const SLIDE_INSET_PERCENT = (100 - SLIDE_WIDTH_PERCENT) / 2;

export function Carousel({
  items,
  activeIndex,
  onActiveIndexChange,
  renderItem,
  getItemKey,
  ariaLabel = '카드 캐러셀',
  className = '',
  style = {},
}) {
  const n = items.length;
  const containerRef = useRef(null);
  const settleTimerRef = useRef(null);
  // 프로그램적으로 scrollTo를 호출하는 동안에는 onScroll 핸들러가 그 결과를
  // 사용자 스와이프로 오인하지 않도록 억제한다.
  const suppressScrollRef = useRef(false);
  // extended 배열의 각 위치(pos)에 실제로 렌더된 슬라이드 DOM 요소를 보관한다.
  // peek 레이아웃에서는 슬라이드 폭이 컨테이너 폭과 다르므로, "한 스텝"의
  // 스크롤 거리를 폭 곱셈으로 가정하지 않고 이 실측값으로 계산한다.
  const slideElsRef = useRef(new Map());

  const getKey = useCallback(
    (item, i) => (getItemKey ? getItemKey(item, i) : i),
    [getItemKey]
  );

  const extended = useMemo(() => {
    if (n === 1) {
      return [{ item: items[0], key: getKey(items[0], 0), realIndex: 0 }];
    }
    if (n > 1) {
      return [
        { item: items[n - 1], key: `__clone-head__${getKey(items[n - 1], n - 1)}`, realIndex: n - 1 },
        ...items.map((it, i) => ({ item: it, key: getKey(it, i), realIndex: i })),
        { item: items[0], key: `__clone-tail__${getKey(items[0], 0)}`, realIndex: 0 },
      ];
    }
    return [];
  }, [items, n, getKey]);

  const extPosition = n <= 1 ? 0 : activeIndex + 1;

  const registerSlideRef = useCallback(
    (pos) => (el) => {
      if (el) slideElsRef.current.set(pos, el);
      else slideElsRef.current.delete(pos);
    },
    []
  );

  // extended 배열의 위치(pos)에 해당하는 실제 슬라이드 DOM 요소를 기준으로
  // "중앙 정렬" scrollLeft 값을 계산한다. 슬라이드 폭이 컨테이너 폭보다 좁은
  // peek 레이아웃에서도 폭 가정 없이 정확히 동작한다.
  const scrollToPos = useCallback((pos, behavior) => {
    const el = containerRef.current;
    const slideEl = slideElsRef.current.get(pos);
    if (!el || !slideEl) return false;
    const target = slideEl.offsetLeft - (el.clientWidth - slideEl.offsetWidth) / 2;
    if (Math.abs(el.scrollLeft - target) <= 1) return false;
    suppressScrollRef.current = true;
    el.scrollTo({ left: target, behavior });
    requestAnimationFrame(() => {
      suppressScrollRef.current = false;
    });
    return true;
  }, []);

  // 외부에서 activeIndex가 바뀌면(예: 다른 POI 마커를 눌러 캐러셀을 다시 연 경우)
  // 그 위치로 스크롤을 맞춘다. 스와이프로 인한 변경은 이미 스크롤이 그 위치에
  // 있으므로 사실상 no-op.
  useLayoutEffect(() => {
    if (n === 0) return;
    scrollToPos(extPosition, 'auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, n]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || suppressScrollRef.current || n <= 1) return;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    // 스크롤이 멈춘 뒤에만 판정한다 — 스와이프 도중 매 프레임 index를 바꾸면
    // 지도 포커싱(onActiveIndexChange 구독 측)이 카드 전환마다 요동친다.
    settleTimerRef.current = setTimeout(() => {
      const el2 = containerRef.current;
      if (!el2) return;
      // 현재 스크롤 뷰포트 중앙에 가장 가까운 슬라이드를 실측 offsetLeft/
      // offsetWidth로 찾는다(폭 기반 스텝 계산 대신 실제 렌더 결과 기준).
      const viewportCenter = el2.scrollLeft + el2.clientWidth / 2;
      let clamped = 0;
      let minDist = Infinity;
      slideElsRef.current.forEach((slideEl, pos) => {
        const slideCenter = slideEl.offsetLeft + slideEl.offsetWidth / 2;
        const dist = Math.abs(slideCenter - viewportCenter);
        if (dist < minDist) {
          minDist = dist;
          clamped = pos;
        }
      });
      const landed = extended[clamped];
      if (!landed) return;
      const real = landed.realIndex;

      const isCloneHead = clamped === 0;
      const isCloneTail = clamped === extended.length - 1;
      if (isCloneHead || isCloneTail) {
        // 클론 슬라이드에 안착 — 애니메이션 없이 실제 슬라이드 위치로 순간 이동
        scrollToPos(real + 1, 'auto');
      }

      if (real !== activeIndex) onActiveIndexChange(real);
    }, 90);
  }, [n, extended, activeIndex, onActiveIndexChange, scrollToPos]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  const handleKeyDown = (e) => {
    if (n <= 1) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onActiveIndexChange((activeIndex + 1) % n);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onActiveIndexChange((activeIndex - 1 + n) % n);
    }
  };

  return (
    <div
      ref={containerRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className={['ds-carousel', className].filter(Boolean).join(' ')}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        overflowX: n > 0 ? 'auto' : 'hidden',
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        outline: 'none',
        width: '100%',
        gap: 'var(--spacing-16)',
        // peek 레이아웃: 좌우에 동일한 여백을 둬서 첫/마지막 실제 카드도
        // 중앙까지 스크롤될 수 있는 공간을 만든다(scroll-padding과 함께).
        paddingLeft: `${SLIDE_INSET_PERCENT}%`,
        paddingRight: `${SLIDE_INSET_PERCENT}%`,
        scrollPaddingLeft: `${SLIDE_INSET_PERCENT}%`,
        scrollPaddingRight: `${SLIDE_INSET_PERCENT}%`,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {extended.map(({ item, key, realIndex }, pos) => (
        <div
          key={key}
          ref={registerSlideRef(pos)}
          role="group"
          aria-roledescription="slide"
          aria-hidden={realIndex !== activeIndex}
          style={{
            flex: `0 0 ${SLIDE_WIDTH_PERCENT}%`,
            minWidth: `${SLIDE_WIDTH_PERCENT}%`,
            scrollSnapAlign: 'center',
            scrollSnapStop: 'always',
            display: 'flex',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          {renderItem(item, { isActive: realIndex === activeIndex, realIndex })}
        </div>
      ))}
      <style>{`
        .ds-carousel { scrollbar-width: none; -ms-overflow-style: none; }
        .ds-carousel::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
