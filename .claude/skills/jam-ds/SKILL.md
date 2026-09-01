---
name: jam-ds
description: 서비스 UI ↔ MODULAR 디자인시스템 ↔ Storybook ↔ claude.ai/design 네 층의 정합성을 진단하고 어긋난 곳을 맞춘다. UI 작업을 끝낸 뒤, "디자인시스템 동기화", "스토리북이랑 맞춰줘", "MODULAR 최신화", "업로드본 갱신" 같은 요청에 사용. /jam-work의 UI 작업 마무리 단계에서도 호출한다.
---

# jam-ds — 네 층 동기화

JAM!의 UI는 **네 층**에 나뉘어 존재한다. 층이 갈라지면 `/jam-design`의 "탐색 → 재사용" 선순환이
조용히 깨진다 — 카탈로그가 거짓을 말하는 순간 재사용 판단 자체가 오염되기 때문이다.

| 층 | 위치 | 정체 |
|---|---|---|
| L1 서비스 UI | `jam-web/src/components/ui/*.tsx`, `src/app/**` | 실제 사용자가 보는 화면 |
| L2 MODULAR | `jam-web/design-system/components/**/*.jsx` + `.d.ts`·`.prompt.md`·`.card.html` | 디자인 시스템 |
| L3 Storybook | `design-system/**/*.stories.tsx` | 실행 가능한 카탈로그 |
| L4 업로드본 | claude.ai/design 프로젝트 `MODULAR` | 디자인 협업용 원격 사본 |

L1과 L2는 **같은 컴포넌트를 각각 구현**한다(현재 9쌍: TabBar·Button·Toast·BottomSheet·
SlidingTabs·TopNav·BadgeGridCard·ListRowCard·CollectionGridCard). 표현 방식도 다르다 —
L1은 Tailwind 유틸리티, L2는 인라인 style 객체. **그래서 텍스트 diff는 100% 오탐이다.**
값을 정규화해 비교해야 한다(진단 스크립트가 그 일을 한다).

## 0. 기준값 방향 — 이걸 틀리면 작업이 거꾸로 간다

| 대상 | 기준(SoT) | 동기화 방향 |
|---|---|---|
| 컴포넌트 기하·색·레이아웃 | **L1 서비스 UI** | L1 → L2 |
| props 시그니처 | **L1 서비스 UI** | L1 → L2 `.d.ts` |
| **디자인 토큰** | **L2 `design-system/tokens/*.css`** | **L2 → L1** (방향이 반대) |
| Story | L2 컴포넌트 | L2 → L3 |
| `_ds_manifest.json`·`readme.md` 색인 | 실제 파일 | 파일 → 색인 (자동 재생성) |
| 업로드본 | L2 로컬 | L2 → L4 |

토큰만 방향이 반대인 이유: `src/app/globals.css`가 `design-system/tokens/*.css`를 `@import`해
쓰고 있어 L2가 이미 단일 원천이다. **토큰 값 자체는 이 워크플로우가 판정하지 않는다** —
값을 바꿀 일이면 `/jam-work`로 티켓을 끊는다.

## 1. 진단

```bash
cd jam-web && npm run ds:check
```

`--json`을 붙이면 기계 판독용 출력이 나온다. 검사 항목:

| 검사 | 잡는 것 |
|---|---|
| `PAIR_GEOMETRY` | L1↔L2 정규화 값 차이 (Tailwind ↔ 인라인 style) |
| `PROPS_DRIFT` | L1 props ↔ L2 `.d.ts` |
| `STORY_MISSING`·`STORY_STALE` | Story 결손 / 컴포넌트보다 오래된 Story |
| `MANIFEST_DRIFT` | 색인 ↔ 실제 파일 (미등록 컴포넌트, 깨진 카드 경로, 누락 CSS) |
| `MANIFEST_TOKEN_DRIFT` | manifest에 박제된 토큰 값 ↔ `tokens/*.css` 현재 값 |
| `TOKEN_UNDEFINED` | 정의 없는 `var(--x)` 참조 (렌더가 비어버림) |
| `TOKEN_RAW` | 토큰이 있는데 raw hex로 쓴 색 |
| `UPLOAD_STALE` | 마지막 L4 업로드 이후 L2 변경 |

### 심각도를 그대로 믿지 말 것

- **ERROR** — 한 속성이 양쪽에 값 하나씩만 있어 요소 대응이 확실한 경우다. 거의 진짜다.
- **WARN** — 같은 속성이 여러 요소에 반복돼 어느 짝인지 스크립트가 알 수 없다.
  `height`·`width`·`padding`이 여기 자주 걸린다. **반드시 파일을 열어 눈으로 확인**한다.
- **INFO** — 해석 못 한 Tailwind 클래스 등. 비교에서 빠졌다는 뜻이지 문제라는 뜻이 아니다.

### 알려진 한계 — 이 전제로 읽는다

- **JSX를 AST로 파싱하지 않는다.** 컴포넌트 전체를 값 집합으로 보므로 "서로 다른 요소에 같은
  값이 잘못 붙은" 오배치는 못 잡는다.
- **Tailwind 타이포 스케일을 해석하지 않는다.** 서비스의 `text-sm`·`font-bold`·`leading-*`은
  비교에서 빠지는데 MODULAR의 `fontSize: 14px`·`fontWeight: 700`은 잡힌다. 그래서
  `PAIR_GEOMETRY` WARN의 "MODULAR에만" 목록에 타이포 값이 짝 없이 남는 경우가 많다.
  **대부분 오탐이다.** 색·기하 값을 먼저 보고 타이포는 나중에 본다.
- 레이아웃·장식 속성(`display`·`cursor`·`fontFamily`·`transform` 등)은 양쪽에서 대칭으로
  제외한다. 구조는 두 층이 다르게 표현하는 게 정상이기 때문이다.
- 변수·템플릿 보간(`fontSize: titleSize`, `` `calc(${x}px)` ``)은 정적 비교가 불가능해 제외한다.

## 2. 자동 수선 — 승인 없이 바로 (기계 판독 산출물)

원본이 따로 있고 **기계가 재생성할 수 있는 파생물**은 바로 고친다. 사람이 검토해봐야
얻는 게 없다.

```bash
cd jam-web && npm run ds:manifest          # 무엇이 바뀌는지 먼저 본다 (dry-run)
cd jam-web && npm run ds:manifest -- --write
```

`_ds_manifest.json`의 `tokens`·`brandFonts`·`components`·`globalCssPaths`를 실제 파일에서
재생성한다. 기존 항목의 `kind` 분류는 보존한다 — 손으로 정한 예외(`--color-text`를 font로
두는 등)가 섞여 있어 규칙으로 일괄 재생성하면 그 의도가 지워진다.

아래 둘은 아직 수동이다:
- `readme.md` §색인 — 실제 컴포넌트 목록 기준
- `design-system/SKILL.md`의 frontmatter `description` — 실제 토큰과 어긋나면 갱신

`cards`는 `ds:manifest`가 건드리지 **않는다** — 카드가 가리키는 파일이 없을 때 "카드를 지운다"와
"파일을 만든다"는 판단이 갈린다. 사용자에게 묻는다.

## 3. 코드 수선 — diff 제시 후 승인

L2 `.jsx`·`.d.ts`·L3 `.stories.tsx`는 **의도된 차이일 수 있으므로 고치기 전에 보여준다.**

1. ERROR·WARN 각 건에 대해 L1 원본을 읽고, 차이가 **진짜 드리프트인지 의도된 분화인지** 판단
   - 서비스에만 있는 값이 도메인 결합(배지 id 등) 때문이면 → MODULAR에 옮기지 않는다
   - 서비스가 Tailwind 임의값으로 표현한 것을 L2는 토큰 `var()`로 쓰고 있으면 → **L2가 옳다**.
     오히려 L1을 토큰으로 바꾸는 게 맞는지 검토해 사용자에게 제안한다
2. 고칠 목록을 파일·속성·현재값·목표값 표로 제시
3. 승인받은 것만 수정한다. **L1은 건드리지 않는다** — L1이 기준값이므로 L1을 고치는 건
   디자인 변경이고, 그건 `/jam-work` 티켓의 일이다
4. Story는 컴포넌트 변경을 반영해 갱신한다. `STORY_MISSING`이면 새로 작성한다

## 4. Storybook 검증

```bash
cd jam-web && npm run storybook   # :6006
```

컴포넌트를 고쳤으면 Story가 실제로 뜨는지 확인한다. Browser pane 도구로 직접 열어
확인하고, 사용자에게 "확인해보세요"라고 미루지 않는다.

## 5. claude.ai/design 재업로드 (L4)

`UPLOAD_STALE`이 뜨거나 L2를 고쳤으면 재업로드한다. `DesignSync` 도구를 쓴다.

```
projectId: fd735d58-25c2-4347-95ed-d15ee2b36124   (.design-sync/state.json)
```

1. `list_files`로 원격 파일 목록을 받아 로컬과 **구조 차이**를 만든다
2. 업로드 **제외** 대상 (`.design-sync/NOTES.md` 근거):
   - `*.stories.tsx` — 로컬 Storybook 전용
   - `Canvas.dc.html`·`dashboard.html`·`thumbnail.html`·`support.js`·`_adherence.oxlintrc.json`
   - `uploads/` — 리서치 참고자료
   - iCloud 중복 파일 (`! -regex '.* [0-9]\.[a-zA-Z]*$'`)
3. `finalize_plan`으로 쓰기·삭제 경로를 확정 (사용자가 경로 목록을 직접 본다)
4. `write_files`는 `localPath`로 넘긴다 — 파일 내용이 컨텍스트에 들어오지 않는다
5. 성공하면 `.design-sync/state.json`의 `lastUploadCommit`을 현재 HEAD로,
   `lastUploadAt`을 오늘 날짜로 갱신한다. **이걸 빠뜨리면 다음 진단이 계속 stale로 뜬다**

새 `.card.html`을 만들었다면 CDN이 아니라 `_vendor/`를 참조해야 한다
(claude.ai/design 런타임이 외부 스크립트를 차단한다 — `.design-sync/NOTES.md` 참조).

## 6. 마무리

- `npm run ds:check`를 다시 돌려 ERROR가 0인지 확인한다. 남았으면 왜 남았는지 보고한다
- 커밋 → `git push origin staging` (CLAUDE.md 규칙 3)
- 컴포넌트 스펙이 바뀌었으면 `/jam-docs`로 티켓·PRD 갱신 여부를 판단한다
- `.design-sync/NOTES.md`에 이번 동기화에서 판단이 갈렸던 지점을 남긴다

## 언제 도는가

- `/jam-work`로 UI 작업을 끝낸 직후 (특히 `src/components/ui/*` 또는 `design-system/**` 변경 시)
- `.githooks/pre-commit`이 "Story가 함께 갱신되지 않았다"고 경고했을 때
- 배포 전 점검 — `/jam-ship` 전에 한 번
- 정기 점검 — 드리프트는 조용히 쌓인다

## 하지 않는 것

- **L1(서비스 UI) 수정** — L1은 기준값이다. 여기를 고치는 건 디자인 변경이고 `/jam-work`의 일
- **토큰 값 변경** — 토큰은 L2가 기준이며 값 결정은 티켓 사안
- **어드민 화면** — `src/app/admin/`은 MODULAR 적용 대상이 아니다 (정책, `/jam-design` 참조)
- **이중 구현 통합** — L1↔L2를 하나로 합치는 건 별도 리팩터링 과제다. 이 워크플로우는
  두 층을 유지한 채 값을 맞춘다

## 참고

- `/jam-design` — 재사용 판단·MODULAR 승격 기준 (이 스킬의 앞 단계)
- `jam-web/scripts/ds-sync-check.mjs` — 진단 엔진. 검사 규칙과 한계가 주석에 있다
- `jam-web/scripts/ds-manifest-sync.mjs` — 색인 재생성기 (`npm run ds:manifest`)
- `.design-sync/NOTES.md` — L4 업로드 이력과 주의사항
- `jam-web/design-system/readme.md` — 파운데이션·색인
