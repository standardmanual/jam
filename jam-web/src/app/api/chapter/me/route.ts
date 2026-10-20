/**
 * 내 챕터 이름 조회 API (티켓 20261019_1317 1회)
 *
 * GET /api/chapter/me — 로그인한 유저의 지금 챕터 번호와 그 챕터의 이름.
 * 챕터 오름 축하 카드(`ChapterRiseWatcher`)가 **카드를 띄울 때만** 부른다. 레이아웃은 화면을 열 때마다 돌아 번호만 읽고, 이름 읽기는 여기로 미뤘다.
 *
 * 점수·다음 챕터·진행 비율은 싣지 않는다(운영 로직 12.3절). 응답 키는 `chapterNo`와 `name` 둘뿐이다.
 * `chapterNo`는 화면이 «내가 읽던 챕터의 이름인지» 맞춰 보라고 싣는다(읽는 사이 챕터가 또 오르면 다른 챕터의 이름이다).
 *
 * `user_chapters`는 본인 행만 읽는 정책이라 서비스 클라이언트로 읽고, 대상은 세션 유저뿐이다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getMyChapter } from '@/lib/chapter/read'
import { d } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const chapter = await getMyChapter(createServiceClient(), user.id)
  if (!chapter.ok) {
    return NextResponse.json({ error: d.chapter.loadFailed }, { status: 500 })
  }
  return NextResponse.json({ chapterNo: chapter.chapterNo, name: chapter.name })
}
