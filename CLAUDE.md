# JAM! 프로젝트 Claude 운영 규칙

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

1. 변경된 로직을 파악하여 `PRD/SERVICE_OPERATIONS.md` 내용을 갱신한다.
2. **기존 파일을 수정하지 않는다.** 새 파일로 생성한다.
3. 파일명 형식: `PRD/SERVICE_OPERATIONS_YYYYMMDD_HHMM.md`
   - 예: `PRD/SERVICE_OPERATIONS_20260715_1430.md`
   - 날짜·시간은 커밋 시점 기준 (KST)
4. 내용은 `PRD/SERVICE_OPERATIONS.md` 기반으로 변경된 섹션만 업데이트한다.
5. 문서 첫 줄 아래에 **변경 이력** 항목을 추가한다:

```markdown
> **이 버전의 변경 내용:** [변경된 기능/로직 한 줄 요약]  
> 이전 버전: SERVICE_OPERATIONS_YYYYMMDD_HHMM.md
```

6. 새 문서를 같은 커밋 또는 별도 커밋에 포함하여 push한다.
