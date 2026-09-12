import { PRETENDARD_VARIABLE_CSS_URL } from '@/lib/admin/shaderTextDissolve'

/**
 * `/admin/shader-text` 전용 레이아웃 (티켓 20260912_1532, 2026-09-12 게이트 재시도
 * "폰트 굵기 결정 변경").
 *
 * 이 라우트에 한해서만 Pretendard **Variable** 웹폰트를 CDN에서 별도로 로드한다. 폰트 굵기를
 * 9단계 고정 드롭다운이 아니라 진짜 가변 축 연속 슬라이더로 조절하려면, `globals.css`가 전역
 * 로드하는 static 배포판(9단계 파일 각각)이 아니라 `wght` 축을 보간하는 가변 폰트 파일 1개가
 * 필요하다. `globals.css`는 그대로 두고 건드리지 않는다 — 사이트 전역 타이포그래피 회귀 위험을
 * 이 화면 하나로 격리하기 위함(티켓 명시).
 *
 * `precedence`를 지정해 React 19가 이 `<link>`를 "스타일시트 리소스"로 인식하고 문서
 * `<head>`로 호이스팅·중복 렌더 방지를 하도록 한다 — 지정하지 않으면 렌더된 위치에 그대로
 * 남아 일반 DOM 링크로만 동작한다(여전히 로드는 되지만 React의 리소스 관리 대상에서 빠진다).
 */
export default function ShaderTextLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href={PRETENDARD_VARIABLE_CSS_URL} precedence="default" />
      {children}
    </>
  )
}
