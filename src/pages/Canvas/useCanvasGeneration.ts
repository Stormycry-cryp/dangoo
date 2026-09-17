import { useCallback, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { CanvasDocumentStore } from './canvasDocumentStore'

export function useCanvasGeneration(documentStore: CanvasDocumentStore) {
  const pendingJobs = useStore(documentStore, state => state.pendingJobs)
  const genLogs = useStore(documentStore, state => state.genLogs)
  const { setPendingJobs, setGenLogs } = documentStore.getState()
  const [logDialogOpen, setLogDialogOpen] = useState(false)

  // 每次进入/切换画布自增。所有延迟异步回写先比对令牌，避免旧画布任务写入新画布。
  const sessionTokenRef = useRef(0)
  const jobAbortsRef = useRef<Set<AbortController>>(new Set())

  const beginJobSignal = useCallback((): AbortSignal => {
    const controller = new AbortController()
    jobAbortsRef.current.add(controller)
    return controller.signal
  }, [])

  const endJobSignal = useCallback((signal: AbortSignal | undefined) => {
    if (!signal) return
    const found = [...jobAbortsRef.current].find(controller => controller.signal === signal)
    if (found) jobAbortsRef.current.delete(found)
  }, [])

  const abortAllJobs = useCallback(() => {
    jobAbortsRef.current.forEach(controller => controller.abort())
    jobAbortsRef.current.clear()
  }, [])

  const aliveForSession = useCallback((token: number): boolean => token === sessionTokenRef.current, [])

  // 必须在任何 await 之前同步占锁，防止双击或连点造成重复提交与重复扣费。
  const inflightRunRef = useRef<Set<string>>(new Set())
  const acquireRunLock = useCallback((key: string): boolean => {
    if (inflightRunRef.current.has(key)) return false
    inflightRunRef.current.add(key)
    return true
  }, [])

  const releaseRunLock = useCallback((key: string) => {
    inflightRunRef.current.delete(key)
  }, [])

  const isRunInflight = useCallback((key: string): boolean => inflightRunRef.current.has(key), [])

  const batchRunInflight = useCallback((): boolean => {
    for (const key of inflightRunRef.current) {
      if (key.startsWith('batch:')) return true
    }
    return false
  }, [])

  return {
    pendingJobs,
    setPendingJobs,
    genLogs,
    setGenLogs,
    logDialogOpen,
    setLogDialogOpen,
    sessionTokenRef,
    beginJobSignal,
    endJobSignal,
    abortAllJobs,
    aliveForSession,
    acquireRunLock,
    releaseRunLock,
    isRunInflight,
    batchRunInflight,
  }
}
