import { createServiceClient } from '@/lib/supabase/server'
import { readChapterNamesTable } from '@/lib/chapter/names-table'
import { ChapterNamesTable } from './ChapterNamesTable'

/**
 * 챕터 이름 표 (티켓 20261019_1318 2회, 운영 로직 12.5절).
 * 읽지 못하면 던져 `admin/error.tsx`(다시 시도)가 받는다 — 빈 표처럼 보이면 «이름이 없다»로 오해해 저장하게 된다.
 */
export default async function AdminChapterNamesPage() {
  const data = await readChapterNamesTable(createServiceClient())

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">챕터 이름</h1>
        <p className="text-muted-foreground text-sm mt-1 break-keep wrap-break-word text-pretty">
          트라이브마다 챕터 이름을 정해요. 이름은 사람을 부르는 호칭으로, 가급적 한 단어로 지어요. 이름이 없는 챕터는 유저 화면에 챕터 번호만 보여요.
          트라이브가 바뀌면 챕터 숫자는 그대로이고 이름만 새 트라이브의 것으로 바뀌어요.
        </p>
      </div>
      <ChapterNamesTable tribes={data.tribes} chapterNos={data.chapterNos} cells={data.cells} />
    </div>
  )
}
