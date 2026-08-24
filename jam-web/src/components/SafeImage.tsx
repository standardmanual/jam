'use client'

import Image from 'next/image'
import { useCallback, useState, type ReactNode } from 'react'
import { isOptimizableImageSrc } from '@/lib/imageSrc'

type SafeImageProps = {
  /** 이미지 주소. 어드민 자유 입력값이어도 된다(호스트를 사전에 몰라도 안전하다). */
  src: string | null | undefined
  alt: string
  /** 이미지에 적용할 클래스 (예: object-cover) */
  className?: string
  /** 이미지를 감쌀 컨테이너 클래스. 주면 컨테이너째 렌더하고, 로드 실패 시 컨테이너까지 사라진다. */
  containerClassName?: string
  /** 고정 크기로 렌더할 때 지정. 생략하면 컨테이너를 채우는 fill 모드. */
  width?: number
  height?: number
  /** 이미지가 없거나 로드에 실패했을 때 대신 렌더할 내용 (기본: 아무것도 렌더하지 않음) */
  fallback?: ReactNode
}

/**
 * 호스트를 사전에 알 수 없는 이미지를 화면을 죽이지 않고 렌더하는 이미지 컴포넌트 (20260824_004).
 *
 * 두 가지를 함께 처리한다.
 *  1. **최적화 가능한 src만 `next/image`로 보낸다.** 내부 경로·등록된 호스트가 아니면 일반
 *     `<img>`로 렌더한다. `next/image`는 미등록 호스트를 만나면 렌더 시점에 throw하고,
 *     그러면 카드 하나가 아니라 화면 전체가 에러 바운더리로 떨어지기 때문이다.
 *     (프로젝트는 이미 BadgeGridCard·BadgeRevealCarousel에서 `<img>`를 쓴다.)
 *  2. **로드 실패는 fallback으로 흡수한다.** 링크가 죽었거나 404여도 이미지만 빠지고
 *     카드·화면은 정상 렌더된다. 하이드레이션 전에 이미 실패한 이미지는 onError 이벤트를
 *     놓치므로, 마운트 시점에 complete/naturalWidth로 한 번 더 확인한다.
 */
export default function SafeImage({
  src,
  alt,
  className,
  containerClassName,
  width,
  height,
  fallback = null,
}: SafeImageProps) {
  const [failed, setFailed] = useState(false)

  const onError = () => setFailed(true)

  /**
   * 서버 렌더된 이미지가 하이드레이션보다 먼저 로드에 실패하면 React가 onError를 놓친다.
   * 마운트 시점에 "로드가 끝났는데 크기가 0"이면 실패로 간주해 같은 폴백으로 보낸다.
   */
  const detectAlreadyFailed = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setFailed(true)
  }, [])

  const value = src?.trim()
  if (!value || failed) return <>{fallback}</>

  const hasFixedSize = typeof width === 'number' && typeof height === 'number'

  const image = isOptimizableImageSrc(value) ? (
    hasFixedSize ? (
      <Image src={value} alt={alt} width={width} height={height} className={className} onError={onError} ref={detectAlreadyFailed} />
    ) : (
      <Image src={value} alt={alt} fill className={className} onError={onError} ref={detectAlreadyFailed} />
    )
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- 어드민 자유 입력 URL은 호스트를 알 수 없어 next/image에 넘길 수 없다
    <img
      src={value}
      alt={alt}
      width={hasFixedSize ? width : undefined}
      height={hasFixedSize ? height : undefined}
      loading="lazy"
      decoding="async"
      className={hasFixedSize ? className : `absolute inset-0 w-full h-full ${className ?? ''}`}
      onError={onError}
      ref={detectAlreadyFailed}
    />
  )

  if (!containerClassName) return image
  return <div className={containerClassName}>{image}</div>
}
