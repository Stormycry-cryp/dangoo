import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AgentClient } from './client';
import { ProviderSettings } from './ProviderSettings';
import type { ProviderSettingsView } from './types';
import { createAgentStore } from './store';
import type {
  AgentStore,
  AssetCardData,
  ChatAttachment,
  ChatMessage,
  FloatingAgentChatProps,
  JobCardData,
  PendingInput,
  ToolStep,
} from './types';
import { assetKey, safeHttpUrl } from './types';

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'spark':
      return <svg {...common}><path d="M12 2.8 13.6 9l5.6 2-5.6 2L12 19.2 10.4 13 4.8 11l5.6-2L12 2.8Z" /><path d="m19.3 16.3.7 2.6 2.2.8-2.2.8-.7 2.6-.7-2.6-2.2-.8 2.2-.8.7-2.6Z" /></svg>;
    case 'chevron':
      return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>;
    case 'close':
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case 'history':
      return <svg {...common}><path d="M4 11a8 8 0 1 1 2.3 5.7" /><path d="M4 5.5V11h5.5" /><path d="M12 7v5l3 1.7" /></svg>;
    case 'settings':
      return <svg {...common}><path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" /><path d="m19.4 13.5 1.2.9-1.5 2.6-1.4-.6a7.7 7.7 0 0 1-1.7 1l-.2 1.5h-3l-.3-1.5a7.7 7.7 0 0 1-1.7-1l-1.4.6-1.5-2.6 1.2-.9a7.2 7.2 0 0 1 0-2.1l-1.2-.9 1.5-2.6 1.4.6a7.7 7.7 0 0 1 1.7-1l.3-1.5h3l.2 1.5a7.7 7.7 0 0 1 1.7 1l1.4-.6 1.5 2.6-1.2.9a7.2 7.2 0 0 1 0 2.1Z" /></svg>;
    case 'send':
      return <svg {...common}><path d="m4 4 16 8-16 8 3.2-8L4 4Z" /><path d="M7.2 12H20" /></svg>;
    case 'stop':
      return <svg {...common}><rect x="6.3" y="6.3" width="11.4" height="11.4" rx="2" /></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case 'paperclip':
      return <svg {...common}><path d="m8.5 12.8 5.9-5.9a3.4 3.4 0 1 1 4.8 4.8l-7.1 7.1a5 5 0 0 1-7.1-7.1l7-7" /></svg>;
    case 'target':
      return <svg {...common}><circle cx="12" cy="12" r="7.2" /><circle cx="12" cy="12" r="2.2" /><path d="M12 2v2.1M22 12h-2.1M12 22v-2.1M2 12h2.1" /></svg>;
    case 'eye':
      return <svg {...common}><path d="M3.3 12s3.1-5 8.7-5 8.7 5 8.7 5-3.1 5-8.7 5-8.7-5-8.7-5Z" /><circle cx="12" cy="12" r="2.2" /></svg>;
    case 'check':
      return <svg {...common}><path d="m5.2 12.4 4.3 4.2 9.3-9.2" /></svg>;
    case 'alert':
      return <svg {...common}><path d="M12 3.5 21 19H3l9-15.5Z" /><path d="M12 9v4.2M12 16.5h.01" /></svg>;
    case 'arrow':
      return <svg {...common}><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
    case 'layers':
      return <svg {...common}><path d="m12 4 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></svg>;
    case 'grid':
      return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
    case 'refresh':
      return <svg {...common}><path d="M20 11a8 8 0 0 0-14.5-3.5L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.5 3.5L20 15" /><path d="M20 20v-5h-5" /></svg>;
    case 'expand':
      return <svg {...common}><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" /><path d="M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5" /></svg>;
    default:
      return null;
  }
}

type IconName = 'spark' | 'chevron' | 'close' | 'history' | 'settings' | 'send' | 'stop' | 'plus' | 'paperclip' | 'target' | 'eye' | 'check' | 'alert' | 'arrow' | 'layers' | 'grid' | 'refresh' | 'expand';

function useAgentState<T>(store: AgentStore, selector: (state: ReturnType<AgentStore['getState']>) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}

function safeInlineNodes(text: string, keyPrefix = 'inline'): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|https?:\/\/[^\s<]+)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-bold-${match.index}`}>{safeInlineNodes(token.slice(2, -2), `${keyPrefix}-bold-${match.index}`)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={`${keyPrefix}-code-${match.index}`}>{token.slice(1, -1)}</code>);
    } else {
      const href = safeHttpUrl(token);
      if (href) nodes.push(<a key={`${keyPrefix}-link-${match.index}`} href={href} target="_blank" rel="noreferrer">{token}</a>);
      else nodes.push(token);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function richTextBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  let code: string[] | undefined;
  let blockIndex = 0;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const linesForBlock = paragraph;
    paragraph = [];
    blocks.push(<p key={`paragraph-${blockIndex++}`}>{linesForBlock.flatMap((line, index) => index === 0 ? safeInlineNodes(line, `paragraph-${blockIndex}`) : [<br key={`break-${blockIndex}-${index}`} />, ...safeInlineNodes(line, `paragraph-${blockIndex}-${index}`)])}</p>);
  };
  const flushList = () => {
    if (!list) return;
    const current = list;
    list = undefined;
    const Tag = current.ordered ? 'ol' : 'ul';
    blocks.push(<Tag key={`list-${blockIndex++}`}>{current.items.map((item, index) => <li key={`item-${index}`}>{safeInlineNodes(item, `list-${blockIndex}-${index}`)}</li>)}</Tag>);
  };
  const flushCode = () => {
    if (code === undefined) return;
    const current = code;
    code = undefined;
    blocks.push(<pre key={`code-block-${blockIndex++}`}><code>{current.join('\n')}</code></pre>);
  };
  for (const line of lines) {
    const fence = /^\s*```(?:[^`]*)\s*$/.test(line);
    if (code !== undefined) {
      if (fence) flushCode();
      else code.push(line);
      continue;
    }
    if (fence) {
      flushParagraph();
      flushList();
      code = [];
      continue;
    }
    const unordered = /^\s*[-*]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const orderedList = Boolean(ordered);
      if (!list || list.ordered !== orderedList) {
        flushList();
        list = { ordered: orderedList, items: [] };
      }
      list.items.push((unordered ?? ordered)![1]!);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (list) flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  flushCode();
  return blocks;
}

function SafeMessageText({ text }: { text: string }) {
  return <div className="agent-rich-text">{richTextBlocks(text)}</div>;
}

function AssetThumb({ asset, compact = false }: { asset: AssetCardData; compact?: boolean }) {
  const url = asset.thumbnailUrl;
  return <div className={`agent-asset-thumb${compact ? ' agent-asset-thumb--compact' : ''}`} aria-hidden="true">
    {url ? <img src={url} alt="" /> : <span className="agent-asset-thumb__shape"><Icon name={asset.kind === 'video' ? 'layers' : 'grid'} size={compact ? 12 : 16} /></span>}
  </div>;
}

function AttachmentPill({ attachment, onRemove }: { attachment: ChatAttachment; onRemove: () => void }) {
  return <span className="agent-attachment-pill">
    <AssetThumb asset={attachment} compact />
    <span className="agent-attachment-pill__name" title={`${attachment.name} · ${attachment.ref.assetId}@${attachment.ref.version}`}>{attachment.name}</span>
    <button type="button" className="agent-icon-button agent-icon-button--tiny" onClick={onRemove} aria-label={`移除引用 ${attachment.name}`}><Icon name="close" size={12} /></button>
  </span>;
}

function MessageAttachments({ attachments }: { attachments: ChatAttachment[] }) {
  if (!attachments.length) return null;
  return <div className="agent-message-assets">{attachments.map((attachment) => <span className="agent-message-asset" key={assetKey(attachment.ref)}><AssetThumb asset={attachment} compact /><span>{attachment.name}</span><small>v{attachment.ref.version}</small></span>)}</div>;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return <article className={`agent-message agent-message--${isUser ? 'user' : 'assistant'}${message.failed ? ' agent-message--failed' : ''}`} aria-label={isUser ? '你的消息' : 'Agent 回复'} aria-live={message.streaming ? 'polite' : undefined}>
    <div className="agent-message__body">
      <div className="agent-message__bubble"><SafeMessageText text={message.text} />{message.streaming ? <span className="agent-caret" aria-label="正在生成" /> : null}</div>
      <MessageAttachments attachments={message.attachments} />
    </div>
  </article>;
}

function ToolStepCard({ step, onLocate }: { step: ToolStep; onLocate?: (nodeId: string) => void }) {
  const running = step.state === 'running';
  const failed = step.state === 'failed';
  return <div className={`agent-tool-step agent-tool-step--${step.state}`}>
    <span className="agent-tool-step__status">{running ? <span className="agent-spinner" /> : failed ? <Icon name="alert" size={13} /> : <Icon name="check" size={13} />}</span>
    <div className="agent-tool-step__content">
      <div className="agent-tool-step__title"><span>{step.label}</span></div>
      {step.target ? <div className="agent-tool-step__target">{step.target}</div> : null}
      {step.error ? <div className="agent-tool-step__error">{step.error}</div> : null}
    </div>
    {step.nodeId && onLocate ? <button type="button" className="agent-text-button" onClick={() => onLocate(step.nodeId!)}><Icon name="target" size={12} />定位</button> : null}
  </div>;
}

function JobStateLabel(state: JobCardData['state']): string {
  switch (state) {
    case 'queued': return '已提交';
    case 'running': return '生成中';
    case 'succeeded': return '已完成';
    case 'failed': return '失败';
    case 'canceled': return '已停止';
    default: return '状态待确认';
  }
}

function JobCard({ job, onLocate, onPreview }: { job: JobCardData; onLocate?: (nodeId: string) => void; onPreview?: (asset: AssetCardData) => void }) {
  const count = job.total ? `${job.index ?? 1}/${job.total}` : undefined;
  return <section className={`agent-job-card agent-job-card--${job.state}`}>
    <div className="agent-job-card__head"><span className="agent-job-card__mark">{job.state === 'running' ? <span className="agent-spinner" /> : job.state === 'succeeded' ? <Icon name="check" size={13} /> : <Icon name="layers" size={13} />}</span><div><strong>{job.label}</strong><small>{count ? `${count} · ` : ''}{JobStateLabel(job.state)}</small></div><span className="agent-job-card__state">{job.state === 'running' ? '处理中' : ''}</span></div>
    {job.state === 'running' ? <div className="agent-job-progress"><span /></div> : null}
    {job.error ? <p className="agent-job-card__error">{job.error}</p> : null}
    {job.resultAssets.length ? <div className="agent-job-results">{job.resultAssets.map((asset) => <button type="button" className="agent-result-card" key={assetKey(asset.ref)} onClick={() => onPreview?.(asset)}><AssetThumb asset={asset} /><span>{asset.name}</span><small>v{asset.ref.version}</small></button>)}</div> : null}
    {job.nodeId && onLocate ? <button type="button" className="agent-text-button agent-job-card__locate" onClick={() => onLocate(job.nodeId!)}><Icon name="target" size={12} />定位节点</button> : null}
  </section>;
}

function WaitCard({ input, onReply }: { input: PendingInput; onReply: (text: string) => void }) {
  const [value, setValue] = useState('');
  const approval = input.kind === 'approval';
  const jobs = input.kind === 'jobs';
  return <section className={`agent-wait-card agent-wait-card--${input.kind}`}>
    <div className="agent-wait-card__eyebrow"><span className="agent-wait-card__dot" />{approval ? '需要确认' : jobs ? '等待任务' : '需要你的选择'}</div>
    <p>{input.prompt}</p>
    {input.options?.length ? <div className="agent-wait-options">{input.options.map((option) => <button type="button" key={option} onClick={() => onReply(option)}>{option}<Icon name="arrow" size={13} /></button>)}</div> : null}
    {approval ? <div className="agent-wait-actions"><button type="button" className="agent-button agent-button--primary" onClick={() => onReply('确认')}>确认</button><button type="button" className="agent-button" onClick={() => onReply('暂不')}>暂不</button></div> : null}
    {!jobs && !input.options?.length && !approval ? <form className="agent-wait-input" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onReply(value.trim()); }}><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="输入简短回复" aria-label="回复 Agent" /><button type="submit" className="agent-icon-button agent-icon-button--accent" disabled={!value.trim()} aria-label="发送回复"><Icon name="send" size={14} /></button></form> : null}
    {jobs ? <small className="agent-wait-card__hint">任务完成后会自动继续，关闭面板不会中断任务。</small> : null}
  </section>;
}

function StatusLine({ state, serviceState, providerName, model }: { state: ReturnType<AgentStore['getState']>; serviceState?: FloatingAgentChatProps['serviceState']; providerName?: string; model?: string }) {
  const active = state.activeRunId ? state.runs[state.activeRunId] : undefined;
  const transportState = state.connection === 'idle' || state.connection === 'connected' ? undefined : state.connection;
  const connection = transportState ?? (serviceState === 'ready' ? 'online' : serviceState === 'checking' ? 'checking' : serviceState === 'unconfigured' ? 'unconfigured' : serviceState === 'unavailable' ? 'offline' : state.connection);
  const label = connection === 'online' || connection === 'connected' ? `${providerName ?? 'Agent 服务'}${model ? ` · ${model}` : ''}` : connection === 'checking' ? '正在连接 Agent 服务' : connection === 'unconfigured' ? 'Agent 服务未配置' : connection === 'offline' ? 'Agent 服务不可用' : connection === 'recovering' ? '正在恢复连接' : connection === 'error' ? '连接中断' : '等待发送';
  return <div className={`agent-status-line agent-status-line--${connection}`} role="status"><span className="agent-status-line__dot" /><span>{label}</span>{active && active.state !== 'completed' && active.state !== 'failed' && active.state !== 'stopped' ? <span className="agent-status-line__run">{active.state === 'waiting_user' ? '等待回复' : active.state === 'waiting_jobs' ? '等待生成' : active.state === 'compacting' ? '整理中' : '运行中'}</span> : null}</div>;
}

export function FloatingAgentChat({
  client,
  hostBridge,
  canvasId = hostBridge.canvasId,
  sessionId,
  defaultOpen = true,
  open,
  onOpenChange,
  serviceConfigured = true,
  serviceState,
  serviceConfig,
  avoidRight = 0,
  initialAttachments,
  onResolveAttachment,
  className,
}: FloatingAgentChatProps) {
  const fallbackClientRef = useRef<AgentClient | undefined>(undefined);
  if (!fallbackClientRef.current) fallbackClientRef.current = new AgentClient();
  const resolvedClient = client ?? fallbackClientRef.current;
  const store = useMemo(() => createAgentStore({ client: resolvedClient, hostBridge, canvasId }), [resolvedClient, hostBridge, canvasId]);
  const state = useAgentState(store, (value) => value);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedSettings, setSavedSettings] = useState<ProviderSettingsView>();
  const configured = savedSettings?.hasKey ?? serviceConfigured;
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [localNotice, setLocalNotice] = useState<string>();
  const [composerFocused, setComposerFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previousMessageCount = useRef(0);

  useEffect(() => {
    store.resume();
    const currentSessionId = store.getState().session?.id;
    if (currentSessionId) store.startEvents(currentSessionId);
    return () => store.destroy();
  }, [store]);
  useEffect(() => {
    if (initialAttachments?.length) initialAttachments.forEach((attachment) => store.addAttachment(attachment));
  }, [initialAttachments, store]);
  useEffect(() => {
    if (!configured) return;
    let active = true;
    void store.ensureSession().catch((error: unknown) => {
      if (active) store.dispatch({ type: 'error.changed', error: error instanceof Error ? error.message : '无法恢复画布对话' });
    });
    return () => { active = false; };
  }, [configured, store]);
  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => composerRef.current?.focus());
  }, [isOpen]);
  useLayoutEffect(() => {
    const element = conversationRef.current;
    if (!element) return;
    const hasNewMessages = state.messages.length !== previousMessageCount.current;
    previousMessageCount.current = state.messages.length;
    if (state.nearBottom || hasNewMessages && state.nearBottom) element.scrollTop = element.scrollHeight;
  }, [state.messages, state.tools, state.jobs, state.pendingInput, state.nearBottom]);

  const setOpen = useCallback((value: boolean) => {
    if (open === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  }, [onOpenChange, open]);

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape' && !settingsOpen) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const sendDraft = useCallback(async () => {
    if (!state.draft.trim() || !configured || attachmentBusy) return;
    await store.sendMessage(state.draft);
  }, [attachmentBusy, configured, state.draft, store]);

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey && !composing) {
      event.preventDefault();
      void sendDraft();
    }
  };

  const resolveFile = async (file: File) => {
    if (!onResolveAttachment) {
      setLocalNotice('请从画布资产库添加素材，或先配置宿主的上传入口。');
      return;
    }
    setAttachmentBusy(true);
    setLocalNotice(undefined);
    try {
      const attachment = await onResolveAttachment(file);
      if (attachment) store.addAttachment(attachment);
      else setLocalNotice('素材登记未完成，未添加本地文件引用。');
    } catch (error) {
      setLocalNotice(error instanceof Error ? error.message : '素材登记失败');
    } finally {
      setAttachmentBusy(false);
    }
  };
  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (file) void resolveFile(file);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData('application/x-dangoo-asset-ref');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<ChatAttachment>;
        const ref = parsed.ref;
        if (ref && typeof ref.assetId === 'string' && typeof ref.version === 'number') {
          store.addAttachment({ ref: { assetId: ref.assetId, version: ref.version, ...(ref.role ? { role: ref.role } : {}) }, name: typeof parsed.name === 'string' ? parsed.name : ref.assetId, kind: parsed.kind, thumbnailUrl: safeHttpUrl(parsed.thumbnailUrl), source: typeof parsed.source === 'string' ? parsed.source : undefined });
          return;
        }
      } catch {
        // Invalid external payloads are ignored; a host must provide a stable ref.
      }
    }
    const file = event.dataTransfer.files?.[0];
    if (file) void resolveFile(file);
  };

  const onConversationScroll = (event: React.UIEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const element = event.currentTarget;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 56;
    store.setNearBottom(nearBottom);
    if (nearBottom) store.clearUnread();
  };

  const activeRun = state.activeRunId ? state.runs[state.activeRunId] : undefined;
  const canStop = Boolean(activeRun && !['completed', 'partial', 'failed', 'stopped'].includes(activeRun.state));
  const panelStyle: CSSProperties = { '--agent-right-offset': `${Math.max(0, avoidRight) + 20}px` } as CSSProperties;

  if (!isOpen) {
    return <button type="button" className={`agent-capsule${className ? ` ${className}` : ''}`} onClick={() => setOpen(true)} aria-label="展开 Agent 对话"><span className="agent-capsule__icon"><Icon name="spark" size={16} /></span><span className="agent-capsule__label">Agent</span><span className={`agent-capsule__state agent-capsule__state--${canStop ? 'busy' : 'idle'}`} />{state.unreadCount > 0 ? <span className="agent-capsule__unread">{state.unreadCount > 9 ? '9+' : state.unreadCount}</span> : null}</button>;
  }

  return <aside className={`agent-panel${className ? ` ${className}` : ''}`} style={panelStyle} onKeyDown={onPanelKeyDown} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={onDrop} aria-label="Agent 悬浮对话">
    <header className="agent-panel__header">
      <div className="agent-brand"><span className="agent-brand__mark"><Icon name="spark" size={16} /></span><div><strong>Agent</strong><span>当前画布</span></div></div>
      <div className="agent-panel__actions"><button type="button" className={`agent-icon-button${settingsOpen ? ' agent-icon-button--active' : ''}`} onClick={() => setSettingsOpen((value) => !value)} aria-label="Agent 设置" aria-pressed={settingsOpen}><Icon name="settings" size={15} /></button><button type="button" className="agent-icon-button agent-icon-button--close" onClick={() => setOpen(false)} aria-label="收起 Agent"><Icon name="close" size={15} /></button></div>
    </header>
    <div className="agent-panel__subhead"><StatusLine state={state} serviceState={savedSettings?.hasKey ? 'ready' : serviceState} providerName={savedSettings?.providerId ?? serviceConfig?.providerName ?? state.session?.providerId} model={savedSettings?.model ?? serviceConfig?.model ?? state.session?.model} /></div>
    {settingsOpen ? <ProviderSettings client={resolvedClient} onSaved={setSavedSettings} onClose={() => setSettingsOpen(false)} /> : null}
    <div className="agent-conversation" ref={conversationRef} onScroll={onConversationScroll} tabIndex={0} aria-label="对话消息">
      {state.messages.length === 0 ? <div className="agent-empty"><span className="agent-empty__mark"><Icon name="spark" size={17} /></span><p>描述你想在画布上完成的创作。</p><div className="agent-suggestions"><button type="button" onClick={() => store.setDraft('整理这组节点的构图')}>整理构图</button><button type="button" onClick={() => store.setDraft('分析当前选中的素材')}>分析选中素材</button></div></div> : null}
      {state.messages.map((message) => <MessageBubble key={message.id} message={message} />)}
      {state.tools.length ? <section className="agent-steps" aria-label="执行步骤"><div className="agent-steps__head"><span>执行步骤</span><small>{state.tools.filter((step) => step.state === 'completed').length}/{state.tools.length}</small></div>{state.tools.slice(-6).map((step) => <ToolStepCard key={step.id} step={step} onLocate={(nodeId) => hostBridge.locateNode(nodeId)} />)}</section> : null}
      {state.jobs.length ? <section className="agent-jobs" aria-label="生成任务">{state.jobs.slice(-4).map((job) => <JobCard key={job.id} job={job} onLocate={(nodeId) => hostBridge.locateNode(nodeId)} onPreview={(asset) => hostBridge.previewAsset(asset.ref)} />)}</section> : null}
      {state.pendingInput ? <WaitCard input={state.pendingInput} onReply={(text) => void store.reply({ text, waitId: state.pendingInput!.id })} /> : null}
      {state.compacting ? <div className="agent-compacting"><span className="agent-spinner" />正在整理对话上下文</div> : null}
      {state.error ? <div className="agent-error" role="alert"><span className="agent-error__icon"><Icon name="alert" size={14} /></span><span>{state.error}</span><button type="button" className="agent-text-button" onClick={() => void store.retryLastMessage()}><Icon name="refresh" size={12} />重试</button></div> : null}
      {!state.nearBottom && state.unreadCount > 0 ? <button type="button" className="agent-unread" onClick={() => { store.setNearBottom(true); conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' }); }}><span>{state.unreadCount} 条新内容</span><Icon name="chevron" size={13} /></button> : null}
    </div>
    <div className={`agent-composer${composerFocused ? ' agent-composer--focused' : ''}`}>
      {state.attachments.length ? <div className="agent-composer__attachments" aria-label="当前引用">{state.attachments.map((attachment) => <AttachmentPill key={assetKey(attachment.ref)} attachment={attachment} onRemove={() => store.removeAttachment(attachment.ref)} />)}</div> : null}
      {localNotice ? <div className="agent-composer__notice" role="status">{localNotice}</div> : null}
      <textarea ref={composerRef} value={state.draft} onChange={(event) => store.setDraft(event.target.value)} onKeyDown={onComposerKeyDown} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onFocus={() => setComposerFocused(true)} onBlur={() => setComposerFocused(false)} placeholder={activeRun ? '补充当前任务…' : '描述你想做的作品…'} rows={3} aria-label="给 Agent 的消息" />
      <div className="agent-composer__footer"><div className="agent-composer__tools"><button type="button" className="agent-tool-button" onClick={() => fileInputRef.current?.click()} disabled={attachmentBusy} aria-label="添加附件"><Icon name="paperclip" size={14} />{attachmentBusy ? '登记中' : '附件'}</button><input ref={fileInputRef} type="file" className="agent-file-input" accept="image/*,video/*,audio/*" onChange={onFileChange} /><button type="button" className="agent-tool-button" onClick={() => void store.compact()} disabled={!state.session || state.compacting} aria-label="整理对话上下文"><Icon name="layers" size={14} />整理</button></div><div className="agent-composer__actions">{canStop ? <button type="button" className="agent-stop-button" onClick={() => void store.stopActiveRun()}><Icon name="stop" size={13} />停止</button> : null}<button type="button" className="agent-send-button" onClick={() => void sendDraft()} disabled={!state.draft.trim() || !configured || attachmentBusy} aria-label={activeRun ? '补充消息' : '发送消息'}><span>{activeRun ? '补充' : '发送'}</span><Icon name="send" size={14} /></button></div></div>
    </div>
  </aside>;
}

export default FloatingAgentChat;
