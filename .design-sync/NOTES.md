# design-sync 진행 기록

## 2026-08-20 — 첫 업로드 (수동, 컨버터 미사용)

`jam-web/design-system/` (MODULAR)이 이미 design-sync 업로드 포맷(`_ds_bundle.js` +
`@ds-bundle` 헤더, `_ds_manifest.json`, 컴포넌트별 `.jsx`/`.d.ts`/`.prompt.md`/`.card.html`,
`tokens/`, `guidelines/`, `styles.css`)으로 구성되어 있음을 확인했다. `jam-web/.storybook`이
있어 스토리북 방식 컨버터(빌드 → 레퍼런스 스토리북 → compare 그레이딩)를 새로 도는 대신,
**이미 만들어진 산출물을 검증 후 그대로 업로드**했다.

- 실제 프로덕션 토큰(`jam-web/src/app/globals.css`)과 `design-system/tokens/colors.css`가
  일치함을 확인 (`--color-surface: #1a1a1a` 등) — 목업이 아니라 실서비스와 동기화된 내용임.
- `_ds_bundle.js`는 `node -c`로 문법 검증만 수행했고, package-validate.mjs 등 정식 컨버터
  검증 스크립트는 돌리지 않았다 (스크립트가 요구하는 `pkg`/`entry`/`node_modules` 설정이
  이 저장소 구조와 맞지 않아 별도 조사가 필요했고, 이미 완성된 산출물이라 우선순위가 낮다고
  판단).
- 업로드에서 **제외**한 것들: `*.stories.tsx`(로컬 Storybook 전용, 앱이 소비하지 않음),
  `Canvas.dc.html`/`dashboard.html`/`thumbnail.html`/`support.js`/`_adherence.oxlintrc.json`
  (별도의 "디자인 캔버스"(.dc.html) 기능 산출물로 보이며 design-system 업로드 계약과 무관),
  `uploads/`(Shopify 리서치 참고자료·스크린샷), iCloud 동기화가 만든 " 2"/" 3" 등 중복 파일.
- `_ds_sync.json`(검증 앵커)은 쓰지 않았다 — 정식 grading을 거치지 않은 수동 업로드이므로
  다음 재동기화가 앵커 없이 전체를 재검증하는 것이 정직한 선택이다.

## Re-sync risks (다음 실행이 주의해야 할 것)

- **카드 HTML이 React/ReactDOM/Babel을 `unpkg.com` CDN에서 로드한다**
  (`components/**/*.card.html` 상단 `<script src="https://unpkg.com/...">`).
  claude.ai/design 런타임이 외부 CDN을 차단하는 샌드박스라면 프리뷰 카드가 빈 화면으로
  뜰 수 있다. 실제 프로젝트에서 카드가 렌더링되는지 확인이 필요하고, 안 되면 React를
  `_vendor/`로 번들링해 로컬 서빙하도록 카드 HTML을 고쳐야 한다 (design-sync 컨버터의
  표준 방식).
- `_ds_bundle.js`/컴포넌트 소스가 실제 `jam-web/src/` 구현과 완전히 동기화된 상태인지는
  검증하지 않았다 (README 기준 TabBar 등 일부만 "1:1 재현"이라고 명시). 컴포넌트 추가/변경
  시 `jam-web/CLAUDE.md`의 "MODULAR 먼저 탐색" 규칙에 따라 `design-system/`이 최신 상태로
  유지된다는 전제 하에 재동기화하면 된다.
- 컴포넌트 소스 폴더(`components/patterns/`)에 iCloud 충돌로 생긴 중복 파일(` 2.jsx` 등)이
  계속 쌓이고 있다 — 다음 동기화 때도 같은 필터(`! -regex '.* [0-9]\.[a-zA-Z]*$'`)로
  제외해야 한다. 근본 원인(iCloud Drive 동기화)은 이 스킬의 범위 밖이다.

## claude.ai/design 프로젝트

- 프로젝트명: MODULAR
- projectId: fd735d58-25c2-4347-95ed-d15ee2b36124
- URL: https://claude.ai/design/p/fd735d58-25c2-4347-95ed-d15ee2b36124
