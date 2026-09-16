import { createRoot, type Root } from 'react-dom/client';
import { AgentClient, type AgentClientOptions } from './client';
import { FloatingAgentChat } from './FloatingAgentChat';
import type { AgentClientLike, FloatingAgentChatProps } from './types';
import uiCss from './ui.css?inline';

interface MountTarget {
  root: ShadowRoot | Element;
  mountNode: HTMLElement;
}

function mountContainer(element: Element): MountTarget {
  if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) {
    const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
    const mountNode = document.createElement('div');
    mountNode.dataset.dangooAgentMount = 'true';
    root.appendChild(mountNode);
    return { root, mountNode };
  }
  const mountNode = document.createElement('div');
  mountNode.dataset.dangooAgentMount = 'true';
  element.appendChild(mountNode);
  return { root: element, mountNode };
}

function installStyles(container: ShadowRoot | Element): void {
  const host = typeof ShadowRoot !== 'undefined' && container instanceof ShadowRoot ? container : document.head;
  if (host.querySelector('style[data-dangoo-agent-ui]')) return;
  const style = document.createElement('style');
  style.dataset.dangooAgentUi = 'true';
  style.textContent = uiCss;
  host.appendChild(style);
}

export interface MountAgentChatOptions extends Omit<FloatingAgentChatProps, 'client' | 'canvasId'> {
  baseUrl?: string;
  token?: string;
  canvasId: string;
  client?: AgentClientLike;
  clientOptions?: Omit<AgentClientOptions, 'baseUrl' | 'getAuthToken'>;
}

/**
 * Mounts the independent chat panel into an existing host element.
 * The token is captured in this in-memory client closure and is never written to storage.
 */
export function mountAgentChat(element: Element, options: MountAgentChatOptions): () => void {
  const target = mountContainer(element);
  installStyles(target.root);
  const client = options.client ?? new AgentClient({
    ...options.clientOptions,
    baseUrl: options.baseUrl ?? '/api',
    getAuthToken: () => options.token,
  });
  const root: Root = createRoot(target.mountNode);
  const { client: _ignoredClient, clientOptions: _ignoredClientOptions, baseUrl: _ignoredBaseUrl, token: _ignoredToken, ...props } = options;
  let disposed = false;
  const render = (state: FloatingAgentChatProps['serviceState'], config = props.serviceConfig) => {
    if (!disposed) root.render(<FloatingAgentChat {...props} client={client} canvasId={options.canvasId} serviceState={state} serviceConfigured={state === 'ready'} serviceConfig={config} />);
  };
  render('checking');
  void Promise.all([client.health(), client.capabilities()]).then(([health, capabilities]) => {
    const status = health as { configured?: boolean } | undefined;
    const provider = (capabilities as { providers?: Array<{ id?: string; model?: string }> } | undefined)?.providers?.[0];
    render(status?.configured === false ? 'unconfigured' : 'ready', {
      providerId: provider?.id, providerName: provider?.id, model: provider?.model, ...props.serviceConfig,
    });
  }).catch(() => render('unavailable'));
  return () => {
    disposed = true;
    root.unmount();
    target.mountNode.remove();
  };
}

export default mountAgentChat;
