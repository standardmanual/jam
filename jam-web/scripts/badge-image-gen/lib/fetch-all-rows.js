/**
 * PostgREST(supabase-js)는 select 결과가 기본 1000행으로 잘린다.
 * config의 dataSource가 대상이 1000행을 넘을 수 있는 경우 이 헬퍼로 페이지네이션한다.
 *
 * 사용:
 *   const rows = await fetchAllRows(() =>
 *     supabase.from('poi').select('name, linked_badge_id').eq('category', 'transit')
 *   )
 */
async function fetchAllRows(queryBuilderFactory, pageSize = 1000) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await queryBuilderFactory().range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

module.exports = { fetchAllRows }
