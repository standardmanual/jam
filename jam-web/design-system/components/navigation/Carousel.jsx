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
 * 카드 높이는 슬라이드마다 다를 수 있다 — 컨테이너를 `alignItems:'flex-start'`로
 * 두어 모든 카드의 상단이 같은 기준선에서 시작하고, 콘텐츠가 많은 카드는
 * 아래로만 자라도록 한다(JAM! POI 캐러셀 카드의 "하단 정렬" 요구사항).
 */
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

  // 외부에서 activeIndex가 바뀌면(예: 다른 POI 마커를 눌러 캐러셀을 다시 연 경우)
  // 그 위치로 스크롤을 맞춘다. 스와이프로 인한 변경은 이미 스크롤이 그 위치에
  // 있으므로 사실상 no-op.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || n === 0) return;
    const width = el.clientWidth;
    const target = extPosition * width;
    if (Math.abs(el.scrollLeft - target) > 1) {
      suppressScrollRef.current = true;
      el.scrollTo({ left: target, behavior: 'auto' });
      requestAnimationFrame(() => {
        suppressScrollRef.current = false;
      });
    }
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
      const width = el2.clientWidth || 1;
      const pos = Math.round(el2.scrollLeft / width);
      const clamped = Math.max(0, Math.min(extended.length - 1, pos));
      const landed = extended[clamped];
      if (!landed) return;
      const real = landed.realIndex;

      const isCloneHead = clamped === 0;
      const isCloneTail = clamped === extended.length - 1;
      if (isCloneHead || isCloneTail) {
        // 클론 슬라이드에 안착 — 애니메이션 없이 실제 슬라이드 위치로 순간 이동
        suppressScrollRef.current = true;
        el2.scrollTo({ left: (real + 1) * width, behavior: 'auto' });
        requestAnimationFrame(() => {
          suppressScrollRef.current = false;
        });
      }

      if (real !== activeIndex) onActiveIndexChange(real);
    }, 90);
  }, [n, extended, activeIndex, onActiveIndexChange]);

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
        alignItems: 'flex-start',
        overflowX: n > 0 ? 'auto' : 'hidden',
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        outline: 'none',
        width: '100%',
        ...style,
      }}
    >
      {extended.map(({ item, key, realIndex }) => (
        <div
          key={key}
          role="group"
          aria-roledescription="slide"
          aria-hidden={realIndex !== activeIndex}
          style={{
            flex: '0 0 100%',
            minWidth: '100%',
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
