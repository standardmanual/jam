import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import type { UserChapterView } from '@/lib/admin/user-chapter-view'

interface Props {
  view: UserChapterView
}

const READ_FAILED_TEXT = '읽지 못했어요. 화면을 새로 고쳐도 같으면 개발자에게 전달해 주세요.'

function formatScore(value: number): string {
  return value.toLocaleString('ko-KR')
}

/** `subject`는 조사까지 붙여 받는다(예: «오른 기록을»). 읽지 못한 것을 «기록 없음»과 구분해 보인다 */
function ReadFailed({ subject }: { subject: string }) {
  return <p className="text-red-600 text-sm break-keep wrap-break-word">{`${subject} ${READ_FAILED_TEXT}`}</p>
}

/**
 * 유저 상세의 «챕터» 구역 (티켓 20261019_1318 2회, 운영 로직 12.5절). 읽기 전용이다.
 * 지금 챕터와 누적 점수, 오른 기록(오른 시각과 챕터)(`lib/admin/user-chapter-view.ts`)을 보인다. 점수 기록 표는 걷었다(티켓 20261028_1742 2회).
 * 점수 숫자는 어드민에게만 보인다(유저 화면에는 숫자를 보이지 않는다, 12.3절).
 * 읽지 못한 구역은 «기록 없음»과 다른 문구로 보인다.
 */
export function UserChapterSection({ view }: Props) {
  const { current, ups } = view

  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-bold">챕터</h2>
        <p className="text-muted-foreground text-sm mt-1 break-keep wrap-break-word text-pretty">
          점수 숫자는 어드민에게만 보여요.
        </p>
      </div>

      <div className="mb-6 w-full bg-white border border-border rounded-2xl p-5">
        <h3 className="font-bold mb-3">지금 챕터</h3>
        {!current.ok ? (
          <ReadFailed subject="지금 챕터를" />
        ) : (
          <div className="flex items-center gap-8">
            <div>
              <p className="text-muted-foreground text-xs">챕터</p>
              {current.value.chapterNo === null ? (
                <p className="text-foreground break-keep wrap-break-word">챕터 없음 (퀘스트를 마치기 전이에요)</p>
              ) : (
                <p className="text-2xl font-bold text-foreground break-keep wrap-break-word">
                  챕터 {current.value.chapterNo}
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground text-xs">누적 점수</p>
              <p className="text-2xl font-bold text-foreground">{formatScore(current.value.totalScore)}점</p>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold mb-2">오른 기록</h3>
        {!ups.ok ? (
          <ReadFailed subject="오른 기록을" />
        ) : ups.value.length === 0 ? (
          <p className="text-muted-foreground text-sm break-keep wrap-break-word">아직 오른 기록이 없어요.</p>
        ) : (
          <div className="bg-white border border-border rounded-2xl p-2 w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">챕터</TableHead>
                  <TableHead className="whitespace-nowrap">오른 시각</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ups.value.map((up) => (
                  <TableRow key={up.chapterNo}>
                    <TableCell className="whitespace-nowrap">챕터 {up.chapterNo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatKstYmdHm(up.reachedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  )
}
