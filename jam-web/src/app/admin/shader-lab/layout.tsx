import '@basementstudio/shader-lab/fonts.css'
import { PRETENDARD_VARIABLE_CSS_URL } from '@/lib/admin/shaderTextDissolve'
import { SHADER_LAB_TEXT_FONT_CSS_VARIABLE } from '@/lib/admin/shaderLab/textFontOptions'

/**
 * `/admin/shader-lab` 전용 레이아웃 (티켓 20260912_1951, 텍스트 레이어 폰트 로드 20260912_2157).
 *
 * `@basementstudio/shader-lab/fonts.css`는 ASCII/텍스트 레이어가 참조하는 `--geist-sans`·
 * `--geist-mono`·`--bsmnt-grotesque` CSS 변수를 선언한다(패키지가 오픈 라이선스로 동봉하는
 * 3종 폰트). 이 라우트에서만 로드해 전역 타이포그래피에 영향을 주지 않는다.
 *
 * 텍스트 레이어는 Pretendard Variable을 쓴다(`/admin/shader-text`, 티켓 20260912_1532가
 * 확립한 CDN URL을 `PRETENDARD_VARIABLE_CSS_URL` 상수로 그대로 재사용 — 값을 다시 베끼지
 * 않는다). 다만 패키지의 텍스트 렌더링 패스는 `fontFamily` 파라미터 값을 자유 문자열로 받지
 * 않고, 내부에 미리 정의된 슬롯 이름(`sans`/`mono`/`bsmnt-grotesque` 등) 중 하나여야만
 * 실제 폰트가 반영된다 — 그 슬롯이 참조하는 CSS 커스텀 프로퍼티를 우리가 여기서 덮어써야
 * 한다. 왜 `--bsmnt-grotesque` 슬롯을 골랐는지, `fontWeight` 범위가 왜 400~900인지는
 * `src/lib/admin/shaderLab/textFontOptions.ts` 상단 주석에 자세히 정리했다.
 *
 * `!important`를 쓴 이유: 위 `fonts.css` import(전역 `:root` 선언)와 아래 `<style>`(역시
 * `:root` 선언)의 브라우저 적용 순서를 빌드 도구(Turbopack/webpack)의 CSS 청크 배치 방식에
 * 기대지 않고 항상 우리 값이 이기도록 보장하기 위해서다.
 */
export default function ShaderLabLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href={PRETENDARD_VARIABLE_CSS_URL} precedence="default" />
      <style>{`:root { ${SHADER_LAB_TEXT_FONT_CSS_VARIABLE}: "Pretendard Variable" !important; }`}</style>
      {children}
    </>
  )
}
