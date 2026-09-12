import '@basementstudio/shader-lab/fonts.css'

/**
 * `/admin/shader-lab` 전용 레이아웃 (티켓 20260912_1951).
 *
 * `@basementstudio/shader-lab/fonts.css`는 ASCII/텍스트 레이어가 참조하는 `--geist-sans`·
 * `--geist-mono`·`--bsmnt-grotesque` CSS 변수를 선언한다(패키지가 오픈 라이선스로 동봉하는
 * 3종 폰트). 이 라우트에서만 로드해 전역 타이포그래피에 영향을 주지 않는다.
 */
export default function ShaderLabLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
