---
id: DS-010
status: CLOSED
severity: P1
type: REFACTOR
category: Component / Architecture
---

# DS-010 — Button Spinner `@keyframes` 인라인 스타일 주입 문제

## Problem
`Button.jsx`의 `Spinner` 컴포넌트가 `<style>` 태그를 JSX 안에 직접 주입한다. `loading` 상태인 Button이 화면에 여러 개 있을 경우 `@keyframes spin` 정의가 DOM에 중복 누적된다. 서버사이드 렌더링(SSR) 환경에서 스타일 hydration 불일치가 발생할 수 있다.

## Evidence
```jsx
/* Button.jsx L14–25 */
function Spinner() {
  return (
    <svg
      style={{ animation: `spin 0.8s linear infinite` }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* ↑ Spinner 인스턴스마다 <style> 태그가 DOM에 삽입됨 */}
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}
```
3개의 loading Button이 동시에 렌더링되면 동일한 `@keyframes spin` `<style>` 태그가 3개 생성된다.

## Reference
기존 DS(`jam-web/src/`)는 Tailwind의 `animate-spin` 유틸리티 클래스를 사용하므로 이 문제가 없다. v2에서 Tailwind를 제거하면서 대안 없이 인라인으로 처리했다.

## Recommendation
`@keyframes spin`을 `styles.css`로 이동하고, Spinner는 animation 클래스를 참조하거나 CSS 변수 기반 animation 속기를 사용한다.

```css
/* styles.css에 추가 */
@keyframes ds-spin {
  to { transform: rotate(360deg); }
}
```

```jsx
/* Spinner() — <style> 태그 제거 */
function Spinner() {
  return (
    <svg
      style={{ animation: 'ds-spin 0.8s linear infinite' }}
      /* ↑ styles.css의 @keyframes ds-spin 참조 */
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}
```

`ds-` prefix를 붙여 네임스페이스 충돌 방지.

## Impact
- `Button.jsx` Spinner 내 `<style>` 태그 제거
- `styles.css`에 `@keyframes ds-spin` 추가
- WanderingEyesLoader 등 다른 애니메이션도 동일 방식으로 이관 권장

## Risk
- `styles.css`가 로드되지 않은 환경에서 Spinner 애니메이션 미작동 → DS 사용 전제가 `styles.css` 임포트이므로 수용 가능한 수준
- `ds-spin`이라는 이름이 소비자 프로젝트의 기존 `@keyframes ds-spin`과 충돌할 경우 — prefix 변경으로 해결

## Acceptance Criteria
- [ ] loading Button 3개 동시 렌더링 시 DOM에 `@keyframes spin` `<style>` 태그가 1개만 존재 (또는 0개 — styles.css에서 처리)
- [ ] Spinner 애니메이션이 정상 작동
- [ ] `styles.css` 없이 Button을 사용할 경우 경고 또는 문서화

---
## 완료 기록
- **날짜**: 2026-08-14
- **구현**: `Button.jsx` Spinner에서 `<style>` 태그 제거. `animation: 'ds-spin 0.8s linear infinite'`로 변경. `@keyframes ds-spin` + `@keyframes ds-shimmer` (DS-013용)을 `styles.css`에 통합.
- **변경 파일**: `styles.css`, `components/buttons/Button.jsx`
