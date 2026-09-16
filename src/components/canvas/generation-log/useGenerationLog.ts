import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GenLogEntry } from '@/pages/Canvas/canvasTypes'

export const LOG_PAGE_SIZE = 15

/**
 * 生成日志弹窗的本地交互状态: 15 条/页分页。
 * 打开弹窗时重置到第 1 页; 日志更新后当前页超出范围时自动收敛到末页。
 */
export function useGenerationLog(logs: GenLogEntry[], open: boolean) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (open) setPage(1)
  }, [open])

  const totalPages = Math.max(1, Math.ceil(logs.length / LOG_PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageItems = useMemo(() => {
    const start = (page - 1) * LOG_PAGE_SIZE
    return logs.slice(start, start + LOG_PAGE_SIZE)
  }, [logs, page])

  const goPrev = useCallback(() => setPage(p => Math.max(1, p - 1)), [])
  const goNext = useCallback(() => setPage(p => Math.min(totalPages, p + 1)), [totalPages])
  const goPage = useCallback((target: number) => setPage(Math.min(totalPages, Math.max(1, target))), [totalPages])

  return {
    page,
    totalPages,
    pageItems,
    totalCount: logs.length,
    goPrev,
    goNext,
    goPage,
  }
}
