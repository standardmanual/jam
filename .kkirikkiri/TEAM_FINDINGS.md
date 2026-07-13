# 발견 사항 & 공유 자료

## 프로젝트 구조 요약 (팀원 필독)

**프로젝트 경로**: `/Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/jam-web/`

**핵심 파일 경로**:
- badge-engine: `src/lib/badge-engine/index.ts`
- itembook checker (기존): `src/lib/itembook/checker.ts`
- 아이템북 상세 페이지: `src/app/(main)/itembooks/[id]/page.tsx`
- 아이템북 탭 (BadgesClient): `src/app/(main)/badges/BadgesClient.tsx`
- badges 페이지 서버: `src/app/(main)/badges/page.tsx`
- Supabase 서버 클라이언트: `src/lib/supabase/server.ts`
- 타입 정의: `src/types/database.ts`

**기존 itembook/checker.ts 반드시 읽고 시작할 것** — 완성 체크 로직이 이미 일부 있을 수 있음.

**스택**: Next.js App Router, Supabase, TypeScript, Tailwind CSS
**배포**: Vercel (자동 배포)

---

# DEAD_ENDS (시도했으나 실패한 접근)

(아직 없음 — 작업 시작 전)
