import type { CanvasGateway } from '../contracts/index.js';
import type { AgentRuntimeOptions } from '../core/runtime.js';
import type { SqliteStore } from '../core/store.js';

/** The model interprets consent; the server verifies its source and business quote. */
export function createNodeApprovalPolicy(canvas: CanvasGateway, store: SqliteStore): Pick<AgentRuntimeOptions, 'beforeToolExecute' | 'onApprovalReply'> {
  return {
    beforeToolExecute: async (request, definition) => {
      if (definition?.effect !== 'external') return;
      if (definition.name !== 'node_run' || !canvas.getQuote) return false;
      const args = request.call.arguments as { quoteId?: unknown; nodeId?: string; expectedRevision?: number; authorization?: { userText?: unknown } };
      if (typeof args?.quoteId !== 'string') return false;
      const quote = await canvas.getQuote(request.session.scope, args.quoteId);
      if (quote.id !== args.quoteId || args.nodeId !== quote.nodeId || args.expectedRevision !== quote.expectedRevision) return false;
      if (quote.expiresAt <= Date.now()) return false;
      if (quote.approved) return;
      const userText = args.authorization?.userText;
      if (typeof userText === 'string' && userText.trim()) {
        const belongsToThisConversation = store.listMessages(request.session.id).some(message => message.role === 'user' && message.content.some(part => part.type === 'text' && part.text.includes(userText)));
        if (belongsToThisConversation && canvas.approveQuote) {
          await canvas.approveQuote(request.session.scope, quote.id);
          return;
        }
      }
      if (quote.price.estimatedPrice === 0 && canvas.approveQuote) {
        await canvas.approveQuote(request.session.scope, quote.id);
        return;
      }
      return { content: [{ type: 'text', text: '等待确认本次节点生成费用' }], wait: {
        kind: 'approval', id: `node-quote:${request.run.id}:${quote.id}`,
        prompt: `生成 1 张图片 · ${quote.model}\n${quote.price.isFreeThisCall ? '本次免费' : typeof quote.price.priceText === 'string' && quote.price.priceText ? quote.price.priceText : `${String(quote.price.estimatedPrice ?? '待确认')} ${String(quote.price.currency ?? 'CNY')}`}`,
        payload: { quoteId: quote.id, nodeId: quote.nodeId, price: quote.price },
      } };
    },
    onApprovalReply: async (run, wait, decision) => {
      if (decision !== 'approve' || wait.kind !== 'approval') return;
      const quoteId = wait.payload?.quoteId;
      if (typeof quoteId !== 'string' || wait.id !== `node-quote:${run.id}:${quoteId}`) return;
      if (!canvas.approveQuote) throw new Error('节点报价不可授权');
      const session = store.getSession(run.sessionId);
      if (!session) throw new Error('画布会话不存在');
      await canvas.approveQuote(session.scope, quoteId);
    },
  };
}
