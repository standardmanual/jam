---
id: 20260812_003
category: Infra
status: CLOSED
created: 2026-08-12
closed: 2026-08-12
---

# [Infra] taste-skill 설치 + jam-developer 프론트엔드 작업에 연동

## 배경 / 문제 정의

사용자가 [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) 저장소(프론트엔드 UI
디자인 품질을 위한 Claude Code 스킬 — "generic AI 슬랍" 방지, 컴포넌트·모션·카피 원칙)를
`/jam-work` 실행 시 프론트엔드 개발 단계(jam-developer/트레일메이커)에서 쓰고 싶다고 요청.

## 상세 요구사항

### 서비스/코드베이스 관점
1. 저장소의 `taste-skill-v2` 브랜치, `skills/taste-skill/`(최신 버전 — v1/gpt/brutalist/minimalist
   등 다른 변형 스킬도 저장소에 있었으나 요청한 건 이 기본 버전)을 프로젝트 스킬로 설치:
   `.claude/skills/taste-skill/SKILL.md` + `references/`(quality·branding·copywriting·layouts·
   components·taste-blocks·motion, 총 7개 참조 문서).
2. CLAUDE.md 규칙 5(글로벌/프로젝트 스킬 동일 유지)에 따라 `~/.claude/skills/taste-skill/`에도
   동일하게 복사.
3. `jam-developer.md`에 새 규칙 8번 추가 — 프론트엔드 UI 작업(신규 화면/컴포넌트/레이아웃·비주얼
   변경)일 때만 이 스킬을 참고하도록 조건부로 연결. 백엔드/API 전용 작업에는 적용 안 함.

### 원본 스킬과 JAM! 적용 범위의 차이 (중요 — 그대로 못 쓰는 부분)
taste-skill은 원래 **신규 랜딩페이지/포트폴리오 전체 구축**을 전제로 설계됨(8개 섹션짜리
스튜디오급 사이트, 히어로부터 푸터까지 처음부터 만드는 워크플로우). JAM!은 이미 존재하는
Next.js 앱이라 그대로 적용하면 안 맞는 부분이 있어 범위를 좁힘:
- "섹션 맵핑·전체 페이지 신규 구축" 같은 단계는 적용 안 함 — JAM!은 기존 화면에 기능을
  추가/수정하는 티켓 단위 작업이 대부분.
- 스킬이 전제하는 동반 도구(`imagegen` 스킬, Taste Blocks MCP, `find-animation-opportunities`,
  `gsap`, `review-animations`, `emil-design-eng`) 중 이 프로젝트에 설치된 게 하나도 없음 —
  해당 스텝은 명시적으로 건너뛰도록 jam-developer.md에 적어둠.
- 실제로 차용하는 부분: `quality.md`의 안티슬랍 감사 기준(제네릭 AI 패턴 피하기), `components.md`
  선택 기준, `motion.md` 원칙, 최종 렌더링 시각 QA 사고방식 — JAM!의 기존 스타일 토큰
  (`var(--...)`)과 `src/components/` 재사용을 우선하는 조건을 명시.

## 구현 계획
1. `gh api`로 `Leonxlnx/taste-skill` 저장소의 `taste-skill-v2` 브랜치에서 SKILL.md + references
   7개 파일을 다운로드해 프로젝트/글로벌 양쪽에 설치.
2. `.claude/agents/jam-developer.md`에 조건부 연동 규칙 추가.
3. 이 티켓으로 문서화, CLAUDE.md 규칙 5에 따라 commit+push.

---
## 완료 기록

### 구현 내용 요약
계획대로 진행. `taste-skill-v2` 브랜치의 SKILL.md(182줄) + references 7개(quality 1181줄
포함 총 2764줄)를 그대로 다운로드해 설치. 내용을 임의로 요약/변형하지 않고 원본 그대로 가져옴 —
스킬 자체의 신뢰성을 위해 원저작자 텍스트를 보존.

### 변경된 파일
```
.claude/skills/taste-skill/SKILL.md (신규, 프로젝트)
.claude/skills/taste-skill/references/{quality,branding,copywriting,layouts,components,taste-blocks,motion}.md (신규, 프로젝트)
~/.claude/skills/taste-skill/SKILL.md (신규, 글로벌)
~/.claude/skills/taste-skill/references/*.md (신규, 글로벌)
.claude/agents/jam-developer.md (규칙 8번 추가)
Service Plan/Tickets/20260812_003_Infra_taste-skill-설치-및-jam-developer-프론트엔드-연동.md
```

### 테스트 결과
- [x] 스킬 목록에 `taste-skill`이 정상 등록됨(시스템 리마인더로 확인)
- [ ] 실제 `/jam-work` 프론트엔드 티켓에서 jam-developer가 이 스킬을 실제로 참고해 결과물
  품질이 달라지는지는 다음 프론트엔드 작업 때 검증 필요 (아직 실사용 검증 전)

### UX Writing 검증
해당 없음 (개발 프로세스/도구 설정, 사용자 노출 텍스트 아님)

### 배포 정보
- 배포일: 2026-08-12
- 환경: 로컬 스킬 설정 (서비스 코드 변경 아님)
- 커밋: `1c730f6`

### 주요 의사결정
- 원본 스킬 텍스트를 요약/각색하지 않고 그대로 설치 — 스킬의 세부 판단 기준(예: "8/10 미만이면
  완료로 보지 않는다")이 원문 그대로 있어야 의미가 있다고 판단.
- 저장소에 있던 다른 변형 스킬(taste-skill-v1, gpt-tasteskill, brutalist-skill, minimalist-skill,
  redesign-skill, stitch-skill, brandkit, output-skill, image-to-code-skill,
  imagegen-frontend-web/mobile)은 요청 범위 밖이라 설치하지 않음 — 필요해지면 추가.
- jam-developer에만 연동하고 conservative-reviewer/progressive-reviewer에는 연동하지 않음 —
  taste-skill은 "만드는" 단계의 가이드라인이지 "검증" 기준이 아니라고 판단. 다만 스카우트
  (progressive-reviewer)가 이후 리뷰에서 관련 개선 제안을 할 때 참고용으로 알 필요가 있다면
  후속 티켓에서 재검토 가능.

### 잔여 이슈
- ~~실사용 검증 전 (다음 프론트엔드 관련 `/jam-work` 티켓에서 확인)~~ → 설치 직후 제거로 해당 없음
- 저장소의 다른 변형 스킬들은 필요 시 별도 요청으로 추가

---
## 제거 기록 (2026-08-12)

설치 직후, 실사용 검증 전에 사용자가 제거를 요청함 (구체적 사유는 제공되지 않음).

### 제거 내용
- `.claude/skills/taste-skill/`(프로젝트), `~/.claude/skills/taste-skill/`(글로벌) 전체 삭제
- `jam-developer.md`의 규칙 8번(taste-skill 연동 조건부 규칙) 삭제 — 나머지 규칙 번호는
  원래대로 1~7 유지(8번을 마지막에 추가했던 것이므로 재번호 매김 불필요)

### 변경된 파일
```
.claude/skills/taste-skill/ (삭제, 프로젝트+글로벌)
.claude/agents/jam-developer.md (규칙 8번 삭제)
Service Plan/Tickets/20260812_003_..._taste-skill-설치-및-jam-developer-프론트엔드-연동.md (이 섹션 추가)
```

### 커밋
`e3db4d9`
