# 모듈러-서비스 연결 범위 표기

> jam-work `ds` 유형(필수) 및 `design-system/`을 건드리는 `ui` 유형에서 참조한다.
> `.claude/skills/jam-work/SKILL.md` 1.6절에서 분리됨(2026-09-08, 토큰 절감).

**용어 정의** — "모듈러"는 `jam-web/design-system/`의 **소스코드**를 가리킨다. Storybook은
그 소스코드를 브라우저에서 훑어보기 위한 뷰어일 뿐 별도 실체가 아니다.

**스토리북은 어디에도 배포하지 않는다** (2026-09-06 확정, 티켓 20260906_1142).
확인은 **로컬에서만** 한다:

```bash
cd jam-web && npm run storybook   # http://localhost:6006
```

`stage.j-a-m.app/storybook`도 `j-a-m.app/storybook`도 **없다.** 예전에는 staging 배포에만
스토리북을 실었지만, 배포 1회당 12초(129초 중 9%)를 먹는 데 비해 그 URL은 dev-login 뒤라
팀 전용이었고 로컬 :6006으로 같은 것을 볼 수 있었다. Vercel Build CPU가 청구의 96%였던
게 계기다.

⚠️ **`build.mjs`에 `storybook build`를 되살리지 말 것.** 되살린다면 무엇을 얻는지 먼저
적어라. 2026-08-27에는 반대 방향의 사고가 있었다 — 판정 기준을 `VERCEL_ENV`로 바꿨다가
`jam-stage`가 `staging`을 자기 production으로 매핑해둔 탓에 staging에서 스토리북이 통째로
사라져 404가 났다. 지금은 **모든 환경에서 일관되게 없는 것**이 규칙이라 "어떤 배포에는 있고
어떤 배포에는 없는" 상태 자체가 생기지 않는다.

> 참고로 `jam-web/vercel.json`의 `ignoreCommand`는 **`VERCEL_ENV`를 쓴다** — 거기서는
> "이 프로젝트가 이 브랜치를 프로덕션으로 보는가"가 정확히 알고 싶은 것이기 때문이다
> (`jam-web/scripts/vercel-ignore.sh` 주석 참고).

**모듈러 변경은 실제 서비스 화면에도 반영된다** *(2026-08-23 실측 기준 — 2026-08-20까지는
"미연결"이었으나 이후 연결 작업이 진행됐다)*. 다만 컴포넌트마다 상태가 달라 **세 부류를
구분해야 한다.**

- **토큰 — 서비스에 즉시 반영.**
  `src/app/globals.css`가 `design-system/tokens/` 6종(colors·typography·spacing·radius·
  motion·materials)을 직접 `@import`한다. 토큰을 고치면 서비스 화면이 바로 따라온다.
  (`colors.light.css`만 의도적으로 제외 — 서비스는 다크 전용)

- **연결된 컴포넌트 9종 — 서비스에 즉시 반영.**
  서비스 27개 파일이 `@ds/*`를 **47건** import한다. 실사용 목록:
  `Button` · `IconButton` · `Card` · `RarityBadge` · `EmptyState` · `ProgressBar` ·
  `WanderingEyesLoader` · `Carousel` · `TopNav`

- **병존 구현 8종 — 스토리북에만 반영. ⚠️ 양쪽을 함께 고쳐야 한다.**
  `TabBar` · `BottomSheet` · `Toast` · `SlidingTabs` · `BadgeGridCard` ·
  `CollectionGridCard` · `ListRowCard` · `Skeleton`
  → `src/components/ui/`에 동명의 서비스 구현이 따로 있고 값만 수동으로 맞춰둔 상태다.
  DS만 고치면 서비스는 따라오지 않는다. 서비스 구현이 DS보다 기능이 많은 경우도 있으므로
  (`BottomSheet`의 드래그-투-클로즈, `Skeleton`의 cross-fade reveal) 단순 스왑도 위험하다.

- **미도입 8종 — 스토리북 전용.**
  `Checkbox` · `Input` · `Select` · `Textarea` · `ModalToast` · `ShapeTag` · `BadgeFrame` · `Accordion`
  → 서비스에 대응 개념이 없다. 티켓 20260820_010에서 "유지/보류"로 확정됐으므로 **새로
  도입하려면 별도 판단이 필요하다** (임의로 서비스에 끌어다 쓰지 말 것).

`ds` 유형 티켓은 완료 기록에 다음을 명시한다:
- 이번 변경이 위 네 부류 중 어디에 해당하는지 (토큰 / 연결된 컴포넌트 / 병존 구현 / 미도입)
- 서비스에 반영된다면 어떤 호출부가 영향받는지
- **병존 구현을 고쳤다면 `src/components/ui/`의 대응 파일도 함께 고쳤는지**

> 이 목록은 연결 작업이 진행될수록 바뀐다. 정확한 현황이 필요하면 실측할 것:
> `grep -rho "@ds/components/[a-zA-Z]*/[A-Za-z]*" src/ | sort -u`
