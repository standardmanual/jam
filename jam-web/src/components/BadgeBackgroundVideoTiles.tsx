'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 배지 상세·컬렉션(아이템북) 상세의 고정 배경 레이어 안에서 반복 영상을 세로로 필요한 만큼
 * 타일링해 재생하는 공용 클라이언트 컴포넌트. — [20260819_017]
 *
 * ## 배경(버그)
 * 영상은 어드민 배경 제너레이터에서 430×860(정사각 패턴 2장 분량)으로 구워진다. 기존에는
 * `<video>` 엘리먼트 하나만 `top:0, width:100%, height:auto`로 얹었는데, `<video>`는
 * `background-repeat`처럼 CSS로 타일링할 수 없어 실제 렌더링 높이(860px)를 넘는 아래쪽은
 * 영상이 없는 빈 영역이 되어 그 밑에 깔린 CSS 배경(정지 이미지 반복)이 그대로 노출됐다 —
 * 페이지가 860px보다 길면(배지 상세·컬렉션 상세 대부분) 하단이 정지된 채로 보이는 버그.
 *
 * ## 해결
 * 같은 `src`의 `<video>`를 세로로 여러 장 배치해 실제 콘텐츠 높이를 덮는다. 각 타일은
 * `aspectRatio` CSS(기본 1/2 — 430:860과 동일 비율)로 크기를 잡으므로, 폭이 얼마든 항상 원본
 * 비율을 유지한 채 정상 문서 흐름으로 세로 스택된다 — 픽셀 단위로 top 오프셋을 직접 계산할
 * 필요가 없다.
 *
 * ## 타일 수 계산
 * 이 페이지들은 `(main)/layout.tsx`의 `<main class="overflow-y-auto">`가 실제 스크롤
 * 컨테이너이고(문서 자체는 스크롤하지 않는 앱 셸 구조), 배경이 실질적으로 덮어야 하는 높이도
 * 이 컨테이너의 콘텐츠 높이(`scrollHeight`)다. 가장 가까운 `overflow-y: auto|scroll` 조상을
 * 찾아 그 값을 기준으로 타일 수를 계산하고, 못 찾으면 `document.documentElement`로 폴백한다.
 * 초기 렌더(측정 전)에는 `minTiles`(기본 2)로 시작해 레이아웃 시프트를 최소화하고, 마운트 후
 * 측정해 필요한 만큼 늘린다. 콘텐츠가 폭·이미지 로딩 등으로 높이가 바뀔 수 있어 스크롤
 * 컨테이너 리사이즈(ResizeObserver)와 콘텐츠 변경(MutationObserver, 디바운스)에도 재계산한다.
 *
 * ## 상한
 * `<video>`를 여러 개 동시 재생하면 디코딩 비용이 늘어나므로 `maxTiles`(기본 10)로 상한을
 * 둔다. 그 이상 필요한 초장신 페이지는 상한을 넘는 구간만 기존처럼 CSS 배경(정지 이미지 반복)
 * 폴백으로 남는다 — 배경 레이어에 이미 poster용 정적 이미지가 깔려 있으므로 자연스럽다.
 */

interface BadgeBackgroundVideoTilesProps {
  src: string
  /** 영상 로드 전/실패 시 대비한 정지 프레임 — 각 타일에 동일하게 적용 */
  poster?: string | null
  /** 타일 1장의 가로:세로 비율 CSS 값. 기본값은 어드민 배경 제너레이터의 저작 스펙(430:860)과 동일 */
  aspectRatio?: string
  /** 초기 렌더(측정 전) 타일 수 */
  minTiles?: number
  /** 동시 재생 영상 상한 */
  maxTiles?: number
}

function findScrollContainer(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export default function BadgeBackgroundVideoTiles({
  src,
  poster,
  aspectRatio = '1 / 2',
  minTiles = 2,
  maxTiles = 10,
}: BadgeBackgroundVideoTilesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tileCount, setTileCount] = useState(minTiles)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const scrollContainer = findScrollContainer(el)

    let raf = 0
    function recalc() {
      raf = 0
      const width = el!.clientWidth
      if (!width) return
      // aspectRatio는 항상 "가로 / 세로" 형식(예: '1 / 2')으로 온다는 전제로 세로 배수를 역산한다.
      const [w, h] = aspectRatio.split('/').map((n) => parseFloat(n.trim()))
      const ratio = w > 0 ? h / w : 2
      const tileHeight = width * ratio
      if (tileHeight <= 0) return
      const contentHeight = scrollContainer.scrollHeight
      const needed = Math.min(maxTiles, Math.max(minTiles, Math.ceil(contentHeight / tileHeight)))
      setTileCount((prev) => (prev === needed ? prev : needed))
    }

    function scheduleRecalc() {
      if (raf) return
      raf = requestAnimationFrame(recalc)
    }

    scheduleRecalc()

    const resizeObserver = new ResizeObserver(scheduleRecalc)
    resizeObserver.observe(scrollContainer)
    resizeObserver.observe(el)

    const mutationObserver = new MutationObserver(scheduleRecalc)
    mutationObserver.observe(scrollContainer, { childList: true, subtree: true })

    window.addEventListener('resize', scheduleRecalc)
    window.addEventListener('load', scheduleRecalc)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleRecalc)
      window.removeEventListener('load', scheduleRecalc)
    }
  }, [aspectRatio, minTiles, maxTiles])

  return (
    <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%' }}>
      {Array.from({ length: tileCount }, (_, i) => (
        <div key={i} style={{ position: 'relative', width: '100%', aspectRatio }}>
          <video
            className="badge-background-video"
            src={src}
            poster={poster ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload={i === 0 ? 'auto' : 'metadata'}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              pointerEvents: 'none',
            }}
          />
        </div>
      ))}
    </div>
  )
}
