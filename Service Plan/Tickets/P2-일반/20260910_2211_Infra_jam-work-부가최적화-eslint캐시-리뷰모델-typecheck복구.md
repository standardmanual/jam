---
id: 20260910_2211
category: Infra
priority: P2
status: CLOSED
created: 2026-09-10
closed: 2026-09-10
---

# [Infra] jam-work 부가 최적화 3종: ESLint 캐시·리뷰 모델 경량화·typecheck 스크립트 복구

## 배경 / 문제 정의

티켓 [20260910_2013](20260910_2013_Infra_jam-work-파이프라인-소요시간-단축.md)로 파이프라인
구조(병렬화·lint 중복 제거·개선 리뷰 생략·경미 수정 확대)를 손본 뒤, 사용자가 "jam-work를
더 최적화할 방안을 고민해봐"라고 요청했다. 구조가 아니라 그 아래 실행 비용을 실측해 세 가지를
발견했다.

1. **ESLint 캐시 미사용**: `npm run lint` 전체 실행이 17.8초 걸리는데 `--cache` 옵션이
   꺼져 있었다.
2. **제안형 리뷰가 게이트와 같은 모델**: progressive-reviewer·interface-reviewer는 승인
   권한이 없는 제안 단계인데도 세션 모델을 그대로 상속하고 있었다. 티켓 20260816_005 감사가
   이미 "progressive-reviewer는 가벼운 모델 후보"라고 지목했으나 미실행 상태였다.
3. **(버그) `npm run typecheck` 스크립트 부재**: conservative-reviewer의 지시문은 이 스크립트
   실행을 예시로 들고 있었지만 `jam-web/package.json`에 그런 스크립트가 없어 실제로는 타입
   체크가 전혀 실행되지 않고 있었다.

사용자가 세 항목 모두 진행을 승인했다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `jam-web/package.json`: `lint`·`lint:ci`에 `--cache` 추가, `typecheck` 스크립트 신설
- `jam-web/.gitignore`: `.eslintcache` 추가
- `.claude/workflows/jam-work.js`: progressive-reviewer·interface-reviewer agent() 호출에
  `model: 'claude-haiku-4-5-20251001'` 추가
- `.claude/agents/conservative-reviewer.md`: 타입체크를 예시가 아닌 필수 단계로 승격 +
  `.next/types` staleness 유령 에러 대응법 명시

### UI/UX 관점 (해당 시)

해당 없음.

### 컨텐츠 관점 (해당 시)

해당 없음.

## 구현 계획

1. `package.json`의 `lint`·`lint:ci`에 `--cache` 추가, `typecheck` 스크립트 추가 후 실측으로
   캐시 효과와 정상 동작을 검증한다.
2. `.gitignore`에 `.eslintcache` 추가(절대 규칙 "gitignore 신규 항목 금지"의 명시적 예외 —
   사용자가 이번 대화에서 1번 항목 진행을 승인하며 함께 승인).
3. `jam-work.js`의 진보 리뷰 2종에 `model` 옵션을 추가하고 구문 검사로 확인한다.
4. `conservative-reviewer.md`에 타입체크 필수화·staleness 대응 지침을 추가한다.

**영향 범위**: `jam-web/package.json`·`.gitignore`(코드베이스, 서비스 로직 무변경) +
`.claude/` 워크플로·에이전트 정의 2개. `jam-web/` 변경이 있으므로 push 시 pre-push lint
게이트가 정상적으로 실행된다.

**리스크**: 낮음. 세 항목 모두 실측 검증 가능하고 되돌리기 쉽다(스크립트 옵션·모델 파라미터
제거로 즉시 원복 가능). typecheck 신설 과정에서 `.next/types` staleness로 인한 유령 에러를
발견해 스크립트 자체에서 선제 정리하도록 보정했다(상세는 완료 기록 참고) — 이건 계획에
없던 발견물이라 별도로 처리했다.

**검증 방법**: lint 캐시는 무캐시/캐시 적중 각각 실행 시간 실측. typecheck는 신규 스크립트
실행 결과(에러 0건)로 확인. 모델 다운그레이드는 `node --check`로 구문만 확인하고 실제
파이프라인 실행 검증은 다음 `jam-work` 호출에 맡긴다(선례: 티켓 20260910_2013과 동일 방침).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

**① ESLint 캐시 활성화**
- `lint`: `eslint` → `eslint --cache`, `lint:ci`: `eslint --max-warnings 26` →
  `eslint --cache --max-warnings 26`
- `.gitignore`에 `.eslintcache` 추가 (기존 "# typescript" 섹션 스타일에 맞춰 "# eslint" 섹션
  신설)
- 실측: 무캐시 전체 실행 17.85초(첫 측정) / 17.85초(재확인) → 캐시 생성 후 재실행 **2.1초**.
  경고 건수(13건, 에러 0건)는 캐시 전후 동일 — 결과 정확도 손실 없음 확인.

**② 진보 리뷰 2종 모델 경량화**
- `jam-work.js`의 `progressive-reviewer`·`interface-reviewer` agent() 호출에
  `model: 'claude-haiku-4-5-20251001'` 추가.
- `korean-writing-reviewer`(humanize-korean 플러그인)는 의도적으로 제외 — 그 플러그인이
  route_hint(light/standard/heavy)로 내부 모델·콜 수를 자체 조절하므로, 여기서 강제로
  덮어쓰면 플러그인 자체 판단을 무력화한다.
- 게이트(`conservative-reviewer`)는 판정 정확도가 핵심이라 그대로 세션 모델을 상속한다
  (변경 없음).

**③ typecheck 스크립트 신설 + staleness 버그 동시 발견·수정**
- `package.json`에 `"typecheck": "tsc --noEmit"` 최초 추가 후 실행했더니 6건의
  `Cannot find module` 에러 발생(`admin/factions` 관련 라우트).
- 조사 결과 해당 라우트는 `src/app/admin/factions`·`src/app/api/admin/factions` 어디에도
  **실제로 존재하지 않았다** — 4일 전(9/6 17:51) 마지막으로 갱신된 `.next/types/` 빌드
  캐시가 이미 삭제된 라우트를 여전히 참조하고 있어 발생한 유령 에러였다.
- 스크립트를 `"typecheck": "rm -rf .next/types .next/dev/types && tsc --noEmit"`로 보정.
  재실행 결과 에러 0건, 종료 코드 0으로 정상 확인.
- `conservative-reviewer.md`에 타입체크를 "예시" 수준에서 린트와 동급의 **필수 단계**로
  승격하고, staleness 유령 에러의 실측 사례(라우트 6건 재현 → 캐시 삭제 후 0건)를 남겨
  향후 리뷰어가 같은 현상을 실제 버그로 오판하지 않게 했다.

### 변경된 파일
```
jam-web/package.json                       (lint --cache, typecheck 스크립트 신설)
jam-web/.gitignore                         (.eslintcache 추가)
.claude/workflows/jam-work.js              (progressive·interface 리뷰 model 지정)
.claude/agents/conservative-reviewer.md    (typecheck 필수화 + staleness 대응 지침)
.claude/skills/jam-work/SKILL.md           (참고 절에 3종 변경 기록)
Service Plan/Tickets/P2-일반/20260910_2211_Infra_jam-work-부가최적화-eslint캐시-리뷰모델-typecheck복구.md  (신규 — 이 파일)
```

### 테스트 결과
- [x] `node --check .claude/workflows/jam-work.js` 구문 검사 통과
- [x] `python3 -c "import json; json.load(...)"`로 `package.json` JSON 유효성 확인
- [x] ESLint 캐시 실측: 무캐시 17.85초 → 캐시 적중 2.1초, 결과(13 warnings, 0 errors) 동일
- [x] typecheck 실측: 보정 전 6 errors(유령) → 보정 후 0 errors, 종료 코드 0
- [ ] 실제 `jam-work` 파이프라인 1회 실행 (모델 다운그레이드·필수 typecheck가 실제
      게이트/개선 리뷰에서 의도대로 동작하는지는 다음 호출에서 확인)

### 배포 정보
- 배포일: 2026-09-10
- 환경: staging (`jam-web/` 코드 변경 있음 — 서비스 로직은 무변경이나 push 시 pre-push
  lint 게이트가 정상 실행됨)
- 커밋: (staging push 직후 해시 기록)

### 주요 의사결정 / 핵심 메모
- `.eslintcache`를 `.gitignore`에 추가한 것은 CLAUDE.md 절대 규칙 4("gitignore에 새 항목
  추가 금지")의 명시적 예외다. 사용자가 최적화 방안 자체를 승인하며 이 트레이드오프를 함께
  받아들인 것으로 처리했다.
- typecheck 스크립트의 `.next/types` 유령 에러는 계획에 없던 발견물이었지만, 방치하면
  "타입체크를 켰더니 게이트가 매번 가짜 이유로 막힌다"는 새로운 회귀를 만들 뻔했다. 스크립트
  자체에서 캐시를 선제 정리하는 방식으로 막았다 — conservative-reviewer의 프롬프트 판단에만
  기대지 않고 스크립트 레벨에서 원천 차단한 것이 더 안정적이라고 판단했다.
- korean-writing-reviewer는 모델 다운그레이드 대상에서 의도적으로 제외했다. humanize-korean
  플러그인이 이미 자체 비용 최적화 로직(route_hint)을 갖고 있어, 외부에서 model을 강제하면
  그 판단과 충돌할 수 있다.

### 잔여 이슈
1. 실제 `jam-work` 파이프라인 실행으로 모델 다운그레이드가 개선 리뷰·인터페이스 리뷰 품질에
   체감할 만한 저하를 주는지 몇 차례 실사용 후 관찰이 필요하다. 저하가 크면
   `claude-sonnet-5`로 한 단계만 낮추는 절충안으로 조정한다.
2. `.next/types` 삭제가 사람이 동시에 `next dev`를 띄워둔 상태와 겹치면 일시적 재생성
   지연이 있을 수 있다(거의 즉시 재생성되므로 실질적 영향은 낮을 것으로 예상하나 실측하지
   않음).
