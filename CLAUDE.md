# JAM! 프로젝트 Claude 운영 규칙

## 절대 규칙 (모든 작업에서 예외 없이 적용)

### 1. 항상 한국어로 출력할 것
대화 응답, 커밋 메시지, 작업 진행 상황 설명, 빌드/배포 상태 요약, 코드 주석 등
사용자에게 보여지는 모든 출력물에 예외 없이 적용한다.
영어 문구를 그대로 노출하지 말고 반드시 한국어로 번역/서술한다.
(예외: 코드 식별자·라이브러리명·API명 등 고유명사는 원문 유지)

### 2. 서비스 로직 변경 시 운영 문서 업데이트
세션이 완료되거나 새로운 기능 추가·로직 변경 등 서비스 변경이 발생하면
전체 서비스 기능정책 문서를 업데이트한다. → 아래 "문서 자동 업데이트 규칙" 참고

### 3. 주요 개발 완료 후 즉시 commit + push
작업이 완료되면 사용자가 별도로 요청하지 않아도 자동으로:
`git add` → `git commit` (한국어 메시지) → `git push origin main`

### 4. 로컬과 git을 항상 동일하게 유지
- 작업 후 `git status`를 확인하여 untracked·modified 파일이 없도록 처리
- .gitignore에 새 항목 추가 금지 (보안 예외: 토큰/시크릿 파일은 gitignore 허용)

### 5. 글로벌 스킬과 프로젝트 스킬을 항상 동일하게 유지
`~/.claude/skills/`(글로벌)와 `.claude/skills/`(프로젝트) 스킬 목록을 항상 동일하게 유지한다.
- 새 스킬 설치 시 양쪽 모두 복사 후 commit + push

---

## 문서 자동 업데이트 규칙 (상시)

**서비스 로직이 변경되는 커밋을 생성할 때마다 반드시 아래를 실행한다.**

### 대상 변경 범위

아래 중 하나라도 해당하면 문서 업데이트 대상이다:

- `jam-web/src/lib/` 내 파일 변경 (뱃지 엔진, 드랍 엔진, Strava 동기화, 미션, 조합, 어뷰징 등 핵심 로직)
- `jam-web/src/app/api/` 내 파일 변경 (API 라우트 추가/변경/삭제)
- `jam-web/supabase/migrations/` 내 신규 마이그레이션 파일
- 신규 서비스 기능 페이지 추가 (`src/app/(main)/` 등)

스타일·UI 수정, 버그 픽스(로직 변경 없음), 설정 파일·문서만 변경하는 경우는 제외.

### 실행 방법

1. 변경된 로직을 파악하여 `Service Plan/Specs/SERVICE_OPERATIONS.md` 내용을 갱신한다.
2. **기존 파일을 수정하지 않는다.** 새 파일로 생성한다.
3. 파일명 형식: `Service Plan/Specs/SERVICE_OPERATIONS_YYYYMMDD_HHMM.md`
   - 예: `Service Plan/Specs/SERVICE_OPERATIONS_20260715_1430.md`
   - 날짜·시간은 커밋 시점 기준 (KST)
4. 내용은 최신 `SERVICE_OPERATIONS_*.md` 파일 기반으로 변경된 섹션만 업데이트한다.
5. 문서 첫 줄 아래에 **변경 이력** 항목을 추가한다:

```markdown
> **이 버전의 변경 내용:** [변경된 기능/로직 한 줄 요약]  
> 이전 버전: SERVICE_OPERATIONS_YYYYMMDD_HHMM.md
```

6. 새 문서를 같은 커밋 또는 별도 커밋에 포함하여 push한다.

---

## 문서 자동 업데이트 루틴 (1시간 주기)

**세션 시작 시 반드시 CronCreate 툴로 아래 크론을 등록한다.**

- cron: `"13 * * * *"` (매 시간 :13분)
- recurring: true

### 크론 동작

1. 지난 1시간 내 아래 경로의 커밋이 있는지 확인:
   - `jam-web/src/lib/`, `jam-web/src/app/api/`, `jam-web/supabase/migrations/`, `jam-web/src/app/(main)/`
2. 변경 없으면 → 종료 (아무것도 하지 않음)
3. 변경 있으면 → 위 "문서 자동 업데이트 규칙"과 동일하게 새 SERVICE_OPERATIONS 파일 생성 + commit + push

> 크론은 세션 종료 시 소멸하므로 매 세션 시작 시 재등록한다.
