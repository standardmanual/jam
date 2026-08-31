---
id: 20260831_2008
category: Service
status: CLOSED
created: 2026-08-31
closed: 2026-08-31
---

# [Service] Windows Chrome 네이티브 select 옵션 흰색 텍스트 대비 문제

## 배경 / 문제 정의

Windows OS + Chrome 브라우저에서 미션 페이지의 정렬/필터 드롭다운(예: "오래된순", "자전거")을
열면 옵션 팝업 텍스트가 흰색으로 보여 거의 안 보인다(사용자 스크린샷 확인됨).

**원인**: 미션·배지 페이지의 정렬/필터 드롭다운은 모두 네이티브 HTML `<select>`/`<option>`을
Tailwind 클래스만으로 스타일링해 쓰고 있고, `<option>` 요소에 `color`를 명시적으로 지정하는
곳이 프로젝트 어디에도 없다. 전역 `globals.css`에 `html { color-scheme: dark }`만 걸려있는데,
Windows Chrome은 네이티브 select 팝업 리스트의 배경색을 이 프로퍼티만으로 항상 다크로 렌더링
하지 않는 경우가 있다. 이때 `<select className="... text-text">`에 걸린 `--color-text`(흰색,
`design-system/tokens/colors.css:55`)가 옵션까지 그대로 상속되어 "흰 배경 + 흰 글씨"가 된다.

**동일 결함 발생 위치 (조사 완료, 총 6곳)**:
1. `jam-web/src/app/(main)/missions/MissionsListClient.tsx:264~284` — 정렬(`SORT_OPTIONS`) +
   액티비티 필터(`ACTIVITY_TYPES`) select 2곳
2. `jam-web/src/app/(main)/badges/BadgesClient.tsx:214~281` — 액티비티 배지 필터, 희귀도 필터,
   체크인 카테고리 필터, 체크인 정렬 select 4곳

모두 클래스 문자열이 `bg-white/10 ... text-text`로 동일하고 `<option>` color 미지정도 동일하다.
MODULAR 공용 `design-system/components/forms/Select.jsx`도 같은 구조적 취약점을 갖고 있으나,
현재 두 페이지 모두 이 공용 컴포넌트를 쓰지 않고 raw `<select>`를 중복 구현 중이라 이번 티켓
범위에서는 다루지 않는다(별도 판단 필요 — 미도입 컴포넌트, `/jam-docs` 1.6절 참고).

## 상세 요구사항

### 서비스/코드베이스 관점
- 6곳의 `<option>`에 명시적 `color`(다크 배경 대비 밝은 텍스트)를 지정하거나, 전역 CSS에
  `select`/`option` 타깃 규칙을 추가해 한 번에 해결하는 방향 중 더 안전한 쪽을 택한다.
  전역 규칙 쪽이 향후 추가되는 select에도 자동 적용되어 재발을 막는다는 장점이 있다.
- `color-scheme: dark`가 Windows Chrome 네이티브 select 팝업에 기대대로 적용되지 않는 경우를
  전제로, 팝업 배경색도 함께 명시하는 것을 고려한다(옵션 텍스트만 밝게 하고 배경을 흰색인
  채로 두면 대비는 되지만 다른 문제가 생길 수 있음 — 배경까지 다크로 고정하는 편이 안전).
- 6곳 모두 동일 원인이므로 한 곳을 고치는 방식을 정하면 나머지 5곳에 동일하게 적용한다.

### UI/UX 관점 (해당 시)
- 실제 대비가 확보되는지 스타일 값 기준으로 검증한다(Mac 로컬 환경이라 Windows Chrome 자체
  재현은 불가 — 코드 레벨에서 원인 규명이 끝났으므로 수정 후 dev 서버에서 스타일 적용 여부를
  확인하는 선에서 검증).

## 구현 계획
1. `jam-web/src/app/globals.css`에 `select`/`option` 대상 전역 규칙 추가 검토 (배경·텍스트
   색상 명시) — 6곳 개별 수정보다 재발 방지 효과가 큼
2. 전역 규칙만으로 부족하면 6곳 각 `<select>`/`<option>`에 개별 스타일 보강
3. 로컬 dev 서버에서 미션·배지 페이지 드롭다운 렌더링 스타일 확인
4. `npx tsc --noEmit` / 관련 테스트 통과 확인

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`jam-web/src/app/globals.css`의 `body` 블록 바로 뒤에 전역 규칙 `select option { background-color:
var(--color-surface-elevated); color: var(--color-text); }`를 추가했다. `--color-surface-elevated`
(`#1f1f1f`, `design-system/tokens/colors.css`)는 어드민 스코프(`[data-admin-theme]`) 밖 `:root`에
정의돼 있어 미션·배지 페이지를 포함한 서비스 전역에서 항상 해석된다. `color-scheme: dark`가
Windows Chrome 네이티브 select 팝업에 기대대로 적용되지 않을 때도 배경·텍스트 색을 CSS가 직접
고정하므로 OS/브라우저 렌더링에 의존하지 않는다. 미션·배지 페이지 6곳의 `<select>`/`<option>`
JSX/클래스는 건드리지 않았다(전역 규칙만으로 6곳 모두 해결).

### 변경된 파일
```
jam-web/src/app/globals.css
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 에러 없음
- [x] `npm run lint` 전체 실행 — 0 errors, 25 warnings (모두 이번 변경과 무관한 기존 경고)
- [x] 로컬 dev 서버(`next dev`, Turbopack) 기동 후 컴파일된 CSS 청크를 curl로 직접 확인:
      `select option { background-color: var(--color-surface-elevated); color: var(--color-text); }`
      규칙이 그대로 컴파일돼 서빙됨, `--color-surface-elevated: #1f1f1f`도 어드민 스코프 밖
      `:root`에 정상 정의됨을 확인. Windows Chrome 실기기 재현은 Mac 로컬 환경 한계로 불가
      (티켓에도 명시된 제약) — 코드 레벨 원인 규명·값 확인까지가 이번 검증 범위.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 해당 없음 (텍스트 문구 변경 없음, 스타일만 수정)

### 배포 정보
- 배포일: 2026-08-31 (staging 반영, 프로덕션 미배포)
- 환경: staging
- 커밋: `claude/jamwork-20260831_2008-select-option-contrast` → staging 병합

### 주요 의사결정 / 핵심 메모
- **전역 CSS 규칙 vs 6곳 개별 수정**: 전역 규칙(`select option { ... }`)을 택했다. 6곳 모두 원인이
  100% 동일(`bg-white/10 ... text-text` 클래스 반복 + `<option>` color 미지정)하고, MODULAR 공용
  `Select.jsx`를 아직 두 페이지가 쓰지 않아 앞으로도 raw `<select>`가 새로 생길 가능성이 있는데,
  전역 규칙은 그 경우에도 자동 적용돼 재발을 막는다. 6곳 개별 수정은 이번엔 해결되지만 다음에
  같은 실수가 그대로 재현된다.
- **배경색까지 명시한 이유**: 옵션 텍스트 색만 밝게 바꾸고 배경을 손대지 않으면 Windows Chrome이
  배경을 흰색으로 렌더링하는 케이스에서 "밝은 배경 + 밝은 글씨"로 대비 문제가 형태만 바뀌어
  재발할 수 있다. 배경·텍스트를 함께 고정해 렌더링 환경에 의존하지 않게 했다(티켓 40행 지침).
- **`--color-surface-elevated` 선택 이유**: `--color-surface`(카드 배경)보다 한 단계 더 어두운
  값(`#1f1f1f`, 카드 톤과 무관하게 항상 뚜렷한 다크 배경)이라 어떤 페이지의 select 위에 팝업이
  뜨더라도 일관되게 도드라진다. `--color-text`(흰색)와의 대비도 충분하다.
- **MODULAR `Select.jsx` 미수정**: 티켓 범위에서 명시적으로 제외됨(29~31행). 이번 전역 CSS 규칙은
  `select option` 셀렉터라 `Select.jsx`가 내부적으로 네이티브 `<select>`를 쓴다면 그쪽에도 동일하게
  적용되지만, 별도로 검증하지는 않았다(범위 밖).

### 잔여 이슈
- 없음
