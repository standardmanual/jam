---
id: 20260816_005
category: Infra
status: CLOSED
created: 2026-08-16
closed: 2026-08-25
---

# [Infra] Claude Code 워크플로 감사 보고서

## 배경 / 문제 정의

> Claude Code 설정(CLAUDE.md·스킬·에이전트·훅·권한)이 프로젝트 성장과 함께 누적되면서
> ① 세션마다 로드되는 고정 토큰 비용, ② 규칙과 실제 워크플로의 드리프트(모순·사문화),
> ③ 프롬프트에만 의존하는 "절대 규칙"의 강제 수단 공백이 생겼는지 전면 감사한다.
> 초기 범위는 "감사 기록만, 제안 사항은 실행하지 않는다"였다. 이후 사용자 승인을 거쳐
> **같은 티켓 안에서 P1~P3 전 항목이 실제로 반영**됐다 — 상세는 아래 「완료 기록」 참고.

감사 방법: 전 설정 파일 실측(읽기 전용) — `wc`로 줄수/문자수, `cmp`로 중복 사본 동일성,
`git ls-files`로 추적 상태 확인. 수치는 전부 2026-08-16 기준 실측값.

---

## 1. 인벤토리

### 1-1. 항상 로드되는 것 (세션 시작 시 컨텍스트 진입)

| 파일 | 규모 | 역할 |
|---|---|---|
| 루트 `CLAUDE.md` | **255줄 / 14,300자** | 절대 규칙 6종 + 문서 체계 ①~⑤ 상세 절차 |
| 글로벌 `~/.claude/CLAUDE.md` | 5줄 / 337자 | 한국어 출력 규칙 (루트와 중복) |
| 메모리 인덱스 `MEMORY.md` | 11항목 / 1,851자 | 프로젝트 메모리 포인터 |
| 스킬 description 목록 | 유니크 23종 | 프로젝트 16종 + 글로벌 전용 7종의 frontmatter 설명 |
| 에이전트 description 3종 | 각 1~2문장 | jam-developer·conservative-reviewer·progressive-reviewer |
| 커맨드 description 4종 | 각 1문장 | accessibility-check·design-system-review·refactor-ui·ui-audit |
| 플러그인 주입분 | 수천 토큰 | vercel(~45)·figma(~15)·anthropic-skills(~10)·impeccable 스킬 설명 + MCP instructions |

### 1-2. 조건부 로드

| 파일 | 규모 | 로드 시점 |
|---|---|---|
| `jam-web/CLAUDE.md` → `@AGENTS.md` | 1줄 + 4줄 / 327자 | jam-web 내 파일 작업 시 (Next.js 신버전 경고 — 적절) |
| 스킬 본문 (SKILL.md + references) | jam-work 82줄 등 | 스킬 호출 시 |
| 에이전트 본문 | 44 / 41 / 34줄 | 서브에이전트 스폰 시 |
| 개별 메모리 파일 10개 | 합 15,434자 | 회상 시 |

### 1-3. 설정·훅·권한

| 항목 | 내용 | 상태 |
|---|---|---|
| `.claude/rules/` | — | **프로젝트·글로벌 모두 없음** (path-scoped rule 미사용) |
| 프로젝트 `settings.json` | impeccable 플러그인 활성화만 | 훅 없음 |
| 프로젝트 `settings.local.json` | 460줄, **permissions.allow ~453항목** | 훅 없음, git 미추적 |
| 글로벌 `settings.json` | vercel·figma 플러그인, 워크플로 활성화 | 훅 없음 |
| 글로벌 `settings.local.json` | **impeccable 훅 2종** (PostToolUse Edit\|Write\|MultiEdit / Stop) | 파일 존재 가드·타임아웃 있음, 적정. 단 전 프로젝트 공통 적용임을 인지 |
| `.githooks/pre-commit` | review 브랜치에서 티켓 `status: CLOSED` 커밋 차단 | 동작 확인. **pre-push는 없음** |
| `.claude/launch.json` | jam-web dev 서버 정의 | 적정 |

### 1-4. 중복 파일 (iCloud 충돌 사본)

`.claude/` 내부에서 **17개 사본 전부 원본과 byte 단위 동일** 확인(`cmp`):

- 에이전트: `conservative-reviewer 2/3/4.md`, `jam-developer 2/3/4.md`, `progressive-reviewer 2/3/4.md` (9개)
- 스킬: `jam-work/SKILL 2/3/4.md`, `brand-naming/SKILL 2/3/4.md` (6개)
- 설정: `settings 2.json`, `settings 3.json` (2개)

이 중 **5개는 git에 커밋되어 있음** (`* 2.md` 계열 — git rm 필요): agents 3종 + brand-naming SKILL 2 + jam-work SKILL 2.
같은 원인(저장소와 `~/.claude` 모두 iCloud 내)으로 저장소 전반에도 사본 다수: `.autosync-test 2/3`, `.impeccable/config 2/3.json`, 서비스플랜 v3.2 `4/5/6/7.md` 등.
**`jam-web/design-system/`도 심하게 오염됨** (추가 감사에서 확인): `SKILL 2/3.md`, `readme 2/3.md`, `_ds_bundle 2/3.js`, `_ds_manifest 2/3.json`, `dashboard 2/3.html` 등 — 디자인 시스템의 "단일 진실 원천" 지위를 위협하는 위치라 정리 우선순위가 높다.

---

## 2. 지시 분류 — 루트 CLAUDE.md 섹션별 판정

기준: (a) 항상 알아야 할 사실 → 유지 / (b) "항상·절대" 규칙 → 훅·권한으로 / (c) 절차 → 스킬로 / (d) 특정 경로 전용 → path-scoped로 / (e) 중복·사문화 → 삭제

| 섹션 (줄수) | 판정 | 근거 및 조치안 |
|---|---|---|
| §1 한국어 출력 (7) | **(a)** 유지·축약 | 글로벌 CLAUDE.md와 중복. 프로젝트엔 고유 예외 조항(식별자 원문) 포함 2줄이면 충분 |
| §2 문서 체계 업데이트 트리거 (4) | **(a)** 유지 | 항상 판단해야 하는 트리거 사실 |
| §2.5 UX Writing 검증 (15) | **(d)+(e)** | 체크리스트가 `UX_WRITING_GUIDELINE.md`에 이미 존재(중복). jam-web 사용자 노출 텍스트에만 해당 → `jam-web/CLAUDE.md`에 2줄 포인터로 이동, 체크리스트 삭제 |
| §3 자동 commit+push (5) | **(a) 단 갱신 필수** | **"`git push origin main`"이 staging 워크플로(main 머지는 사용자 명시 승인)와 정면 모순** — 현재 최대 위험 규칙. staging 기준으로 문구 수정. 자동 push를 훅으로 만드는 것은 비권장(파괴적 동작 자동화) |
| §4 로컬-git 동일 + hooksPath (9) | **(a)+(b)** | 원칙 2줄 유지. `git config core.hooksPath .githooks` 최초 1회 활성화는 SessionStart 훅으로 자동화 가능 |
| §5 글로벌-프로젝트 스킬 동기화 (7) | **(e)** 사문화 | **이미 드리프트**: 글로벌 23종 vs 프로젝트 16종 (글로벌 전용 7종: ask-docs, design-agent, design-task, getting-started, impeccable, transitions-dev, transitions-polish). 프롬프트 규칙으로는 동기화가 유지되지 않음이 실증됨. 폐기(저장소를 진실 원천으로) 또는 동기화 스크립트로 전환 |
| §6 DB 직접 실행·배포 확인·TLS (24) | **(c)+(b)** | 절차 전체 → 스킬. TLS 우회는 settings `env`(NODE_EXTRA_CA_CERTS) + SessionStart 훅으로 cert 생성하면 문단 자체가 불필요. service_role 위험 경고 2줄만 (a)로 유지 |
| 문서 체계 개요 표 + 접수 순서 (35) | **(a)+(e)** | 5행 표는 유지. "접수 시 4단계 순서"는 jam-work 스킬 0단계와 중복 → 삭제 |
| 새 세션 읽기 순서 (18) | **(a)** 유지 | 감사 관점에서 가장 가치 높은 지시 중 하나 (코드 탐색 전 문서 우선). 절반으로 축약 가능 |
| ① PRD 규칙 (14) | **(c)** | 문서 갱신 절차 → 스킬 |
| ② 티켓 규칙 (55) | **(c)** | **최대 단일 덩어리.** 파일명 규칙·카테고리 표·완료 기록 항목·템플릿 안내 → 스킬로. jam-work 스킬이 이미 절반을 수행 중 |
| ③ 컨텐츠 규칙 (17) | **(c)** | 5행 문서 표만 유지, 실행 방법 → 스킬 |
| ④ 배지엔진 규칙 (11) | **(c)** | 단일 진실 원천 포인터 2줄만 유지 |
| ⑤ 서비스플랜 규칙 (19) | **(c)** | 주 소비자가 자정 크론 → 크론 프롬프트/스킬에 있어야 할 내용 |
| 예약 작업 (7) | **(a)** 축약 | 크론 존재 사실 + 관리 URL 2줄 |
| 폐기 크론 섹션 (4) + SERVICE_OPERATIONS 폐기 언급 3곳 | **(e)** 삭제 | 이미 아카이브 완료된 역사 기록. History/티켓이 보존 중 |

**메모리와의 중복**: `project_staging_workflow`(staging 규칙)·`project_design_system_name` 등 메모리가 CLAUDE.md §3과 충돌하는 최신 정보를 담고 있음 — CLAUDE.md가 낡은 쪽. 팀 공유가 필요한 규칙은 CLAUDE.md로 승격하고 메모리는 포인터화하는 방향이 맞다.

---

## 3. 토큰 분석 — 세션 시작 고정 비용

추정 방법: 실측 문자수 기반, 한국어 1자 ≈ 0.5~0.7토큰 혼합비 적용 (±25% 오차 범위).

| 항목 | 실측 | 추정 토큰 |
|---|---|---|
| 루트 CLAUDE.md | 14,300자 | **~8,500** (7k~10k) |
| 글로벌 CLAUDE.md | 337자 | ~250 |
| MEMORY.md 인덱스 | 1,851자 | ~1,100 |
| 커스텀 스킬·에이전트·커맨드 설명 | 23+3+4종 | ~1,900 |
| **사용자 제어분 소계** | | **~11,700** |
| 플러그인분 (vercel·figma·anthropic·impeccable 설명 + MCP instructions) | | +6,000~8,000 (플러그인 on/off로만 통제 가능) |

### 200줄 목표 대비

- **현재 255줄 → 55줄(27%) 초과.**
- 위 분류표대로 (c) 절차 ~150줄을 스킬로, (e) ~15줄을 삭제하면 **루트 CLAUDE.md ≈ 95~110줄 / ~3,500토큰** — 목표 하회, 세션당 **~5,000토큰 절감**.
- 절차를 스킬로 옮겨도 정보는 사라지지 않음: 스킬 본문은 해당 작업 때만 로드되므로 "필요할 때만 비용 지불" 구조로 바뀔 뿐.
- 부가 옵션: vercel 플러그인은 MCP 미인증 상태로 스킬 설명 ~45종만 세션마다 주입 중 — 사용 빈도가 낮다면 프로젝트 단위 비활성화로 수천 토큰 추가 절감 가능.

---

## 4. 오케스트레이터 검토 — /jam-work

### 4-1. 현행 구조와 판정

```
0단계  티켓 검토·생성          ← 메인 세션 모델 턴
1단계  Workflow 스크립트:      ← 코드 (결정론적)
       jam-developer → conservative-reviewer → (PASS 시) progressive-reviewer
2단계  결과 보고·승인 질문      ← 메인 세션 모델 턴
3단계  merge·문서 갱신·CLOSED  ← 메인 세션 모델 턴 (사용자 승인 후)
```

**결론: 서브에이전트 + 동적 워크플로 병행 구조는 올바른 선택이며 유지한다.**

- 라우팅(게이트 분기)·조건 실행(FAIL 시 progressive 스킵)이 이미 **워크플로 스크립트 코드**로 처리됨 — 모델 턴으로 라우팅하는 낭비 없음.
- Agent 툴 순차 호출로 바꾸면: 분기 판단이 모델 턴이 되고, 각 결과가 메인 컨텍스트에 쌓이며, 중단 시 재개 불가. 개선이 아니라 퇴행.
- 0·2·3단계가 모델 턴인 것도 적절: 유사 티켓 판단·사용자 승인·문서 반영은 판단 작업이지 기계적 루프가 아님.

### 4-2. 발견된 취약점 3건

**① 게이트 라우팅이 자유 텍스트 문자열 매칭** — `SKILL.md`의 `gate.includes('PASS')`.
conservative-reviewer가 FAIL 판정문 본문에 "PASS"를 언급만 해도(예: *"PASS 기준을 충족하지 못함"*) progressive-reviewer가 오실행된다. 개선안 — `agent()`의 `schema` 옵션으로 구조화 출력 강제:

```js
const VERDICT = {
  type: 'object',
  properties: {
    verdict: { enum: ['PASS', 'FAIL'] },
    reasons: { type: 'array', items: { type: 'string' } },
    checked: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'reasons'],
}
const gate = await agent(`...판정하라.`, { agentType: 'conservative-reviewer', schema: VERDICT })
// 분기: if (gate.verdict === 'PASS') { ... }
```

**② FAIL 재시도 시 FAIL 사유 미전달** — 스킬 2단계는 "같은 파이프라인을 다시 돌릴지" 물을 뿐, 재실행 시 jam-developer에게 FAIL 사유를 넘기라는 규정이 없어 같은 실수를 반복할 수 있다. "사용자가 재시도 승인 시 게이트의 FAIL 사유를 jam-developer 프롬프트에 포함해 재실행"을 스킬에 명문화. (자동 재시도 금지 자체는 티켓 009~011 이탈 이력에 근거한 의도적 거버넌스 — 유지)

**③ devResult도 자유 텍스트** — 구현 요약 템플릿(원인/변경 파일/브랜치명 등)이 프롬프트 약속일 뿐. schema로 강제하면 리뷰어 입력 품질이 보장된다. (우선순위 낮음 — ①만큼 치명적이지 않음)

### 4-3. 부수 발견

- **jam-work 스킬의 글로벌 사본**(`~/.claude/skills/jam-work/`)은 프로젝트 전용 에이전트(agentType)를 참조하므로 타 프로젝트에서 호출 시 실패한다. CLAUDE.md §5 예외 조항("프로젝트 종속 리소스는 미러링 제외")의 취지와도 어긋남 — 글로벌 사본 삭제 권고.

---

## 5. 서브에이전트·커맨드 최소권한 점검

| 대상 | tools | model | 판정 |
|---|---|---|---|
| jam-developer | Read, Write, Edit, Bash, Grep, Glob | 미지정(상속) | **적정** — Bash는 브랜치·커밋·푸시·타입체크에 필요. Supabase MCP 의도적 제외를 정의 파일에 명시한 점 모범 |
| conservative-reviewer | Read, Grep, Glob, Bash | 미지정(상속) | **적정** — Bash는 typecheck·테스트 근거 실행용. Write/Edit 부재로 "게이트는 코드를 못 고친다"가 도구 수준에서 강제됨 |
| progressive-reviewer | Read, Grep, Glob | 미지정(상속) | **모범** — 읽기 전용. "문서를 직접 수정하지 않는다" 프롬프트 규칙과 도구 구성이 일치 |
| /accessibility-check | Read, Grep | — | 읽기 전용 ✓ |
| /design-system-review | Read, Glob, Grep | — | 읽기 전용 ✓ |
| /ui-audit | Read, Glob, Grep, Bash(git:*) | — | git 한정 Bash ✓ |
| /refactor-ui | Read, Edit, Write | — | 수정이 목적이므로 적정 ✓ |

- `model:` 미지정 3종은 세션 모델 상속 — 게이트 판정 품질이 중요하므로 유지 무방. 비용 최적화가 필요해지면 progressive-reviewer만 sonnet 후보.
- **구조적 공백 1건: main push가 프롬프트로만 방어됨.** jam-developer 정의는 "main에 절대 push 금지"라 하지만, `settings.local.json`에 `Bash(git push *)`가 전역 허용돼 있고 pre-push 훅이 없어 기계적 차단이 전무하다. 티켓 CLOSED 이탈(3회 반복)을 pre-commit으로 막았던 것과 동일한 철학으로 **pre-push 훅 또는 deny 규칙**이 필요하다.

### 권한 허용목록(settings.local.json ~453항목) 감사

- **위험 항목**: ① `Bash(xargs rm -rf)` — 앞 파이프가 무엇을 넘기든 삭제 가능한 사실상 무제한 삭제 권한. ② `Bash(git push *)` — main 포함 전 브랜치 무확인 푸시(위 공백의 원인). ③ **Supabase service_role JWT 평문이 포함된 curl 허용 항목 1건** — 파일이 iCloud로 동기화되므로 키 평문 복제본이 늘어나는 구조. 항목 삭제 권장(키 자체는 `.env.local`로 충분).
- **사문화 항목**: 특정 배포 URL curl ~40건, 특정 절대경로 mkdir ~30건, 1회성 스킬 설치·sed 명령 등 — 전체의 절반 이상이 재사용 가능성 없는 역사 기록. 프롬프트 감소 효과 없이 검토 가능성만 해침(컨텍스트 토큰은 소모하지 않으나 보안 검토가 불가능한 크기).
- 정리 방법: `/fewer-permission-prompts`로 재생성하거나, 위험도 기준으로 패턴화(`Bash(vercel *)` 등 ~40개 수준)해 수동 축약.

---

## 6. 스토리북 활용 거버넌스 검토 (추가 감사 — 2026-08-16)

> 추가 요청: "Storybook을 문서가 아니라 Claude Code의 UI 탐색 입구로 만든다"는 비전
> (핵심 규칙 4종 + 운영 흐름 2종)과 기존 감사 결과를 통합 검토한다.
> §1~5가 "이미 있는 지시의 재배치" 감사라면, 이 절은 "아직 없는 지시의 신규 배치" 감사다.

### 6-1. 실측 현황 — 도구 계층은 예상보다 더 완성돼 있다

| 계층 | 실측 결과 | 판정 |
|---|---|---|
| MODULAR 소스 | `jam-web/design-system/` — components 6개 분류(buttons·cards·feedback·forms·navigation·patterns), foundations, guidelines | 완성 |
| Storybook | `.storybook/` 설정 존재, **스토리 파일 29개**, `docs/storybook/` 산출물 7종(아키텍처·접근성 감사·빌드 리포트 등) | 완성 |
| 기계용 색인 | **`_ds_manifest.json`에 `components` 키 등 구조화 색인 이미 존재**, readme §색인 섹션도 존재 | 완성 (미활용) |
| 탐색 규정 문서 | **`design-system/readme.md:90`에 "1순위 — Storybook, 컴포넌트 확인은 항상 Storybook 기준" 이미 명문화**. `dashboard.html`은 레거시로 강등 명시 | 완성 (미연결) |
| 스킬 파일 | **`design-system/SKILL.md` 실존** (name: `jam-design`, user-invocable) — 단 `.claude/skills/` 밖이라 **Claude Code가 자동 발견 불가(미등록)**. 본문에 Storybook 언급 없음(readme로 위임) | **반쪽** |
| 강제·탐색 규칙 | 루트 CLAUDE.md·jam-web/CLAUDE.md·jam-developer 정의·jam-work 스킬 어디에도 "UI 작업 전 Storybook/MODULAR 탐색" 규칙 없음 | **부재** |

**갭 판정 (이전 분석 대비 정밀화)**: 이전 분석의 갭 3종(탐색 규칙 없음 / SKILL.md 연결 미확인 / 판단 기준 없음)은 모두 실재하나, 갭 2는 실측으로 이렇게 확정된다 — SKILL.md 자체에는 Storybook 정보가 없고 readme에는 있다. 그러나 진짜 문제는 문서 내용이 아니라 **발견 체인의 단절**이다: "Storybook 1순위" 규정도, jam-design 스킬도, 기계용 색인도 전부 존재하지만 **어떤 세션·에이전트도 이들을 로드하도록 배선돼 있지 않다**. 부족한 것은 문서 작성이 아니라 배선(wiring) ~30줄이다.

### 6-2. 핵심 규칙 4종 + 운영 흐름의 (a)~(e) 분류 — "어디에 넣을 것인가"

이전 분석의 결론("CLAUDE.md에 규칙 추가가 답")은 **본 감사의 §2~3 결론(루트 255줄 → ~100줄 감축)과 정면 충돌**한다. 4규칙+의사결정 트리+운영 흐름을 루트에 넣으면 ~40줄이 다시 늘어 200줄 목표가 무너진다. 본 감사의 분류 기준을 적용하면 **루트 CLAUDE.md에는 한 줄도 넣지 않고** 전부 배치 가능하다:

| 원문 규칙/흐름 | 분류 | 배치처 | 근거 |
|---|---|---|---|
| 규칙1: UI 작업 전 Storybook+MODULAR 검색 | **(d)** 경로 스코프 | `jam-web/CLAUDE.md` (+ jam-developer 정의 1줄) | jam-web UI 작업에만 해당 — jam-web 파일을 만질 때만 로드되면 충분. 루트에 두면 문서 작업 세션에서도 토큰 지불 |
| 규칙2: 기존 컴포넌트로 해결 가능하면 신규 UI 금지 | **(d)** 〃 | 〃 | 판단 규칙이라 기계 강제 불가 — 프롬프트 규칙이 맞고, 위치만 경로 스코프 |
| 규칙3: 신규 UI는 MODULAR 추가 가치 먼저 판단 | **(c)** 절차 | `jam-design` 스킬 등록 + 판단 기준(의사결정 트리) 본문 수록 | 재사용/확장/신규 분기 기준은 절차 — 매 세션이 아니라 UI 작업 시에만 필요 |
| 규칙4: 노출 문구는 UX Writing Guide 확인 | 기존 §2.5 | `jam-web/CLAUDE.md` (기존 이동안과 합류) | 이미 §2에서 (d) 판정 — 규칙1·2와 같은 파일에 함께 배치 |
| MODULAR 변경 시 Story 동반 의무 | **(b)** 기계 강제 | `.githooks/pre-commit` 확장 | **4규칙 관련 항목 중 유일하게 기계 강제 가능** — `design-system/components/**` 변경 스테이징 시 대응 `*.stories.*` 변경 없으면 경고(도입기)→차단(안정화 후). 티켓 CLOSED 차단과 동일 철학 |
| Storybook 검증 게이트 | 리뷰어 항목 | conservative-reviewer 확인 항목 +1줄 | "DS 컴포넌트 변경 시 Story 동반 여부"를 게이트 체크리스트에 추가 |
| 서비스 변경 의사결정 트리 | **(c)** 절차 | jam-work 스킬 0.5단계 (티켓 검토 직후) | UI 관련 티켓이면 구현 위임 전에 오케스트레이터가 재사용/확장/신규를 트리로 판정해 티켓에 기록 → jam-developer는 판정 결과를 받아 구현만 |

**의사결정 트리에 반드시 포함할 예외**: admin 화면(`jam-web/src/app/admin/`)은 MODULAR 적용 제외가 기존 정책 결정이다 — 트리의 "Service-specific" 분기로 명시하지 않으면 이 정책과 신규 탐색 규칙이 충돌한다.

### 6-3. "Storybook 검색"의 현실화 — AI에게 검색 입구는 웹 UI가 아니다

원문 비전의 "Storybook 검색"을 문자 그대로(localhost:6006 브라우징) 구현하면 세션마다 dev 서버 기동 비용이 든다. **에이전트에게 실용적인 검색 입구는 이미 존재하는 파일 계층이다**:

1. `_ds_manifest.json` (기계용 — `components` 키로 즉시 목록화)
2. `design-system/readme.md` §색인 + `*.stories.*` 29개 파일 grep (변형·사용례)
3. Storybook 웹 UI는 **사람용 검증 채널**로 위치 지정 (사용자 육안 확인, 접근성 애드온)

따라서 jam-web/CLAUDE.md의 규칙1은 "Storybook을 띄워라"가 아니라 "**manifest·readme 색인·stories 파일을 먼저 검색하라**"로 써야 실행 가능하다. 이 구분이 없으면 규칙이 관행적으로 무시된다 — 비용이 큰 규칙은 지켜지지 않는다는 것이 §5 동기화 규칙 사문화에서 이미 실증된 패턴이다.

### 6-4. 선순환 구조와 기존 워크플로의 접합

```
서비스 변경 요청
  → [jam-work 0단계] 티켓 검토·생성 (기존)
  → [0.5단계 신설] UI 포함 시: manifest/색인 검색 → 재사용/확장/신규 판정 → 티켓에 기록
  → [1단계] jam-developer 구현 (판정 결과 상속, 규칙1·2는 에이전트 정의+경로 스코프로 이중화)
  → [게이트] conservative-reviewer: 스펙 + Story 동반 확인 (+pre-commit 훅이 기계 차단)
  → [개선] progressive-reviewer: "이 service-specific UI, MODULAR 승격 가치 있음" 제안 ← 선순환의 귀환 경로
  → [3단계] 승인 후 merge·문서 갱신 (기존)
```

progressive-reviewer의 제안 관점에 "MODULAR 승격 후보 식별"을 1줄 추가하면 **서비스 → MODULAR 역방향 흐름**(선순환의 나머지 절반)이 기존 파이프라인 안에서 공짜로 확보된다 — 새 에이전트·새 워크플로 불필요.

### 6-5. 결론

이전 분석의 진단("도구는 완성, 사용 규칙 부재")은 정확하나, 처방은 본 감사 기준으로 수정한다:

1. **루트 CLAUDE.md에 넣지 않는다** — 경로 스코프(jam-web/CLAUDE.md) + 에이전트 정의 + 스킬 + 훅으로 분산 배치하면 200줄 목표와 충돌 없이 4규칙 전부 수용된다.
2. **새로 만들 것은 거의 없다** — SKILL.md·readme 규정·manifest 색인이 이미 있으므로, 필요한 것은 등록(스킬)·참조(경로 스코프 ~10줄)·확장(pre-commit ~15줄, 리뷰어 항목 2줄)이다.
3. **기계 강제 가능한 것은 Story 동반 의무 하나뿐** — 나머지는 판단 규칙이므로 프롬프트에 두되, 로드 시점을 UI 작업 시로 한정하는 게 본 감사의 토큰 원칙과 부합한다.

---

## 7. 실행 계획 (통합 — 효과 대비 비용 순, 이 티켓에서는 실행하지 않음)

### P1 — 즉시, 총 ~50분, 낮은 위험

| # | 작업 | 효과 |
|---|---|---|
| 1 | `.claude/` 중복 사본 17개 삭제 (5개 `git rm` + 12개 `rm`, `settings 2/3.json` 포함) — 동일성 검증 완료 상태 | 드리프트·혼동 위험 제거, git status 정화 |
| 2 | CLAUDE.md §3 "push origin main" → staging 워크플로 반영 | **규칙-현실 모순 해소** (오작동 위험 최상위) |
| 3 | jam-work 게이트 schema 라우팅 + FAIL 사유 재전달 문구 (§4-2 ①②) | 오케스트레이터 오라우팅 원천 차단 |
| 4 | 허용목록 위험 3종 제거: `xargs rm -rf` 삭제, `git push *` → `git push origin claude/*`·`git push origin staging*`로 세분화, JWT 포함 항목 삭제 | 보안 공백 봉합 |
| 5 | **UI 탐색 4규칙 배선** (§6-2): `jam-web/CLAUDE.md`에 규칙1·2·4 압축 블록(~10줄, §2.5 UX Writing 이동과 동시 처리), jam-developer 정의에 탐색 규칙 1줄, `jam-design` 스킬 등록(`.claude/skills/jam-design/`에 design-system 참조 씬 파일) | **완성된 Storybook 체계의 잠금 해제** — 도구 100% : 규칙 0% 상태라 효과/비용 비율 전체 최상위 |

### P2 — 구조 개선, 2~3시간

| # | 작업 | 효과 |
|---|---|---|
| 6 | 문서 체계 ①~⑤ 절차를 `jam-docs` 스킬(신설)로 이관, CLAUDE.md는 표+트리거만 유지 | **255줄 → ~100줄, 세션당 ~5k 토큰 절감** — 200줄 목표 달성 |
| 7 | `.githooks/pre-push` 신설 — main 직push 차단 (오케스트레이터의 승인된 merge는 env 변수 게이트로 허용) | "절대 규칙"의 기계적 강제 (pre-commit 전례와 동일 철학) |
| 8 | **Story 동반 의무 강제** (§6-2): pre-commit 확장 — `design-system/components/**` 변경 시 대응 `*.stories.*` 미변경이면 경고(도입기)→차단 + conservative-reviewer 확인 항목 1줄, progressive-reviewer에 MODULAR 승격 제안 관점 1줄 | 선순환 양방향(서비스→MODULAR 귀환 포함)을 기존 파이프라인 안에서 확보 |
| 9 | **재사용/확장/신규 의사결정 트리 문서화** (§6-2·6-4): jam-work 0.5단계 신설 + admin 제외 예외 명시, 판단 기준은 jam-design 스킬 본문에 | "누가 어떻게 판단하는가" 공백 해소 — 선순환의 결정 지점 |
| 10 | §6 TLS·배포 절차 정리 — settings `env`에 NODE_EXTRA_CA_CERTS, SessionStart 훅으로 cert 생성, 절차는 스킬로 | CLAUDE.md 24줄 → 3줄, 우회책의 자동화 |

### P3 — 여유 시, 선택

| # | 작업 | 비고 |
|---|---|---|
| 11 | §5 동기화 규칙 폐기 결정 — 저장소를 진실 원천으로, 글로벌 jam-work 사본 삭제 | 또는 동기화 스크립트 자동화 (둘 중 택일 — 현상 유지가 최악) |
| 12 | 허용목록 전면 재생성 (~453 → ~40 패턴) | `/fewer-permission-prompts` 활용 |
| 13 | 저장소 전반 iCloud " N" 사본 정리 + 재발 감지 (SessionStart 훅에 감지 추가 검토) | **`design-system/` 내 사본(§1-4) 최우선** — SoT 오염, `.impeccable/config 2/3` 등 포함 |
| 14 | progressive-reviewer `model: sonnet` 검토 | 비용 최적화, 선택 |

---

## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

감사 보고서 작성(§1~6) 후, 사용자 승인을 거쳐 **P1~P3 전 항목을 실제로 반영**했다.
주요 의사결정은 인터랙티브 확인 3라운드로 확정(적용 범위·CLAUDE.md 감축·유형 체계·배포 흐름·
Story 강제·권한 강도·수행 방식·반영 범위·동기화·사본 삭제).

**1) 문서 구조 재편**
- 루트 `CLAUDE.md` **255줄 → 87줄** (목표 200줄 대비 113줄 여유). 문서 체계 ①~⑤ 절차를
  `/jam-docs` 스킬로 이관, §2.5 UX Writing은 `jam-web/CLAUDE.md`로 경로 스코프화,
  §5 동기화 규칙·폐기 크론·SERVICE_OPERATIONS 언급 3곳 삭제
- §3의 `git push origin main` 모순을 staging 흐름으로 교정 (감사 최상위 위험)
- `jam-web/CLAUDE.md` 31줄 신설 — UI 탐색 4규칙 + UX Writing (jam-web 작업 시에만 로드)

**2) 워크플로 12종 유형 체계**
- `/jam-work` 전면 개정: 풀 6종(ui·ds·bug·engine·db·api) / 라이트 4종(content·copy·admin·infra) /
  단독 2종(docs·research). 유형은 자동 판정 후 사용자에게 먼저 보고
- 게이트 라우팅을 `gate.includes('PASS')` 문자열 매칭 → **`schema` 구조화 출력**(`gate.verdict`)으로 교체
- FAIL 재시도 시 FAIL 사유를 `retryReason`으로 개발자에게 전달하는 절차 명문화
- `ui`·`ds` 유형에 1.5단계(MODULAR 탐색·재사용 판정) 신설 — 판정 결과를 티켓에 기록 후 구현 위임
- 유형(파이프라인 라우팅)과 티켓 카테고리(문서 분류)는 축을 분리하고 매핑표로 연결

**3) 스토리북 선순환 배선**
- `/jam-design` 스킬 신설 — 탐색 순서(manifest → readme 색인 → stories), 의사결정 트리,
  MODULAR 승격 기준 4종, admin 제외 예외
- `pre-commit` 확장: `design-system/components/**` 변경 시 대응 Story 미갱신을 경고 (차단은
  `EXIT_ON_MISSING=1`로 전환 가능하게 준비)
- conservative-reviewer에 Story 동반·재사용 판정 준수 확인 항목 추가
- progressive-reviewer에 **MODULAR 승격 후보 식별** 관점 추가 → 서비스 → MODULAR 역방향 흐름 확보

**4) 배포·강제 수단**
- `/jam-ship` 스킬 신설 — "배포해줘" 한마디로 사전 확인 → main 승격 → Vercel Ready·alias 검증 → 보고
- `.githooks/pre-push` 신설 — main 직push 차단, `JAM_SHIP=1`(jam-ship 전용)만 통과.
  4가지 경로(main 차단 / staging 통과 / JAM_SHIP 통과 / claude 브랜치 통과) 실측 검증 완료

**5) 정리**
- `.claude/` iCloud 사본 17개 삭제 (git 추적 5개 포함)
- `jam-web/design-system/` 사본 209개 삭제 — **이 중 약 20개는 동일 사본이 아니라 8/14~15자
  구버전 스냅샷**이었다(원본에만 있는 접근성 개선·Storybook 섹션 확인). 삭제 중 패턴 오적용으로
  정상 스크린샷 7개가 함께 지워졌으나 git에서 즉시 복구
- `.claude/sync-skills.sh` 신설 — 프로젝트 → 글로벌 동기화(JAM! 전용 4종 제외), 기본은 미리보기

### 변경된 파일
```
CLAUDE.md                                    (255→87줄 재작성)
jam-web/CLAUDE.md                            (31줄 신설 — 경로 스코프 규칙)
.claude/skills/jam-work/SKILL.md             (12종 유형 체계로 전면 개정)
.claude/skills/jam-docs/SKILL.md             (신규 — 문서 체계 ①~⑤ 절차)
.claude/skills/jam-design/SKILL.md           (신규 — MODULAR 탐색·재사용 판단)
.claude/skills/jam-ship/SKILL.md             (신규 — 프로덕션 배포)
.claude/agents/jam-developer.md              (규칙 8 추가 — MODULAR 탐색·Story 동반)
.claude/agents/conservative-reviewer.md      (schema 판정 + Story·재사용 확인 항목)
.claude/agents/progressive-reviewer.md       (MODULAR 승격 후보 관점 추가)
.claude/settings.json                        (deny 5종 + 상용 allow 패턴 — 영속 정책)
.claude/sync-skills.sh                       (신규 — 스킬 동기화)
.githooks/pre-commit                         (Story 동반 경고 로직 추가)
.githooks/pre-push                           (신규 — main 직push 차단)
.claude/ 중복 사본 17개                        (삭제)
jam-web/design-system/ 사본 209개              (삭제)
~/.claude/skills/                            (깨진 심볼릭 링크 16종 복구·정리, 글로벌 jam-work 사본 제거)
```

### 테스트 결과
- [x] `pre-push` 4경로 실측: main 차단(exit 1) / staging 통과 / `JAM_SHIP=1` 통과 / claude 브랜치 통과
- [x] `pre-commit`·`pre-push`·`sync-skills.sh` bash 문법 검사 통과
- [x] `sync-skills.sh` 미리보기 → 적용 정상 동작, 깨진 링크 10종 실제 파일로 복구
- [x] `settings.json` JSON 문법 검증 통과
- [x] design-system 무결성: 컴포넌트 23·토큰 6·가이드라인 13·스토리 29·readme 107줄 유지
- [x] 스킬 4종 프런트매터 파싱 정상, 에이전트 3종 tools 정의 정상
- [x] 삭제 사고 복구 확인: 스크린샷 7개 git 복원, 삭제 대기 항목 0건

### 배포 정보
- 배포일: 2026-08-16 (staging) → 2026-08-25 확인 시점 main도 동일 상태(diff 없음)로 이미 승격 완료
- 환경: staging + main (설정 변경이라 서비스 배포 영향 없음)
- 커밋: `48953eb1` 등 다수(잔여 이슈 5번의 "main 승격은 사용자 판단"은 이후 실행되어 해소됨)

### 주요 의사결정 / 핵심 메모
- 감사 범위를 "보고서 작성만"으로 한정 (사용자 지시). 커밋·설정 변경·정리 실행 일절 없음.
- jam-work의 Workflow 사용 구조는 교체가 아니라 유지가 결론 — 개선 대상은 구조가 아니라 게이트 라우팅 방식(schema화).
- 자동 재시도 금지·티켓 CLOSED 차단 등 기존 거버넌스 결정(티켓 009~011 근거)은 존중하고 강제 수단만 보강하는 방향.
- **스토리북 4규칙의 배치는 루트 CLAUDE.md가 아니다** — 이전 분석("CLAUDE.md에 추가")의 처방을 수정, 경로 스코프(jam-web/CLAUDE.md)+에이전트 정의+스킬 등록+pre-commit 확장으로 분산 배치. 200줄 목표와 충돌 없이 수용 (§6-2 매트릭스).
- "Storybook 검색"은 웹 UI가 아니라 `_ds_manifest.json`·readme 색인·stories 파일 검색으로 정의해야 실행 가능 — 비용 큰 규칙은 사문화된다는 §5 전례 반영.

### 잔여 이슈

> **2026-08-25 CLOSED 처리 시 재확인**: 1번(JWT 평문)·5번(main 승격)은 해소 확인됨.
> 2~4번은 설계상 의도된 관찰/점진 전환 항목이라 계속 열어둔다(마감 아님).

1. ~~`settings.local.json`의 service_role JWT 평문 1건이 남아 있다~~ — **해소.** 2026-08-25
   재확인 시 `.claude/settings.local.json`에 `eyJhbGciOi` 패턴 0건.
2. **Story 동반 의무는 현재 경고 단계**다. 기존 23개 컴포넌트와 29개 스토리의 대응이 완전해지면
   `.githooks/pre-commit`의 `EXIT_ON_MISSING=0` → `1`로 바꿔 차단으로 전환한다.
3. **12종 유형 체계는 실사용 검증이 필요하다.** 다음 몇 건의 작업에서 유형 자동 판정이
   실제 요청과 맞는지 관찰하고, 어긋나면 분기표를 조정한다.
4. **저장소 전반의 iCloud 사본은 미정리.** 이번엔 `.claude/`와 `design-system/`만 처리했다
   (사용자 선택). 서비스플랜 문서 사본 등은 내용이 다를 수 있어 개별 확인이 필요하다.
5. ~~main 승격 여부는 사용자 판단~~ — **해소.** 2026-08-25 확인 시 main·staging의 `CLAUDE.md`
   diff 없음(이미 승격 완료).
