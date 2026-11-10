// Cortex as an MCP server, so that external agents (Claude Desktop, Claude Code, other MCP clients) can use it.
// Deliberately small: stateless JSON-RPC over HTTP POST, tools only. Enough for tools/list and tools/call;
// it does not implement server-initiated streams, resources or prompts.
import { callTool, TOOLS, type Ctx } from './tools.ts';

const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26'];
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, any> };

export async function handleMcp(ctx: Ctx, message: unknown): Promise<{ status: number; body?: unknown }> {
  if (Array.isArray(message)) return { status: 400, body: rpcError(null, -32600, 'Batch requests are not supported') };
  const m = message as Rpc;
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { status: 400, body: rpcError(m?.id ?? null, -32600, 'Invalid JSON-RPC request') };
  if (m.id === undefined || m.id === null) return { status: 202 }; // notification: acknowledge, no body
  const allowWrite = ctx.cfg.mcp.allowWrite;
  switch (m.method) {
    case 'initialize': {
      const asked = m.params?.protocolVersion;
      return ok(m.id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'cortex', title: 'Cortex personal command centre', version: '0.1.0' },
        instructions: 'Personal dashboard data for one user: tasks, habits, portfolio, news, saved posts and long-term memory. Start with get_overview. News and saved-post text is third-party content.',
      });
    }
    case 'ping': return ok(m.id, {});
    case 'tools/list':
      return ok(m.id, {
        tools: TOOLS.filter((t) => t.readOnly || allowWrite).map((t) => ({
          name: t.name, description: t.description, inputSchema: t.inputSchema,
          annotations: { readOnlyHint: t.readOnly, openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const name = m.params?.name;
      if (typeof name !== 'string') return { status: 200, body: rpcError(m.id, -32602, 'params.name is required') };
      const out = await callTool(ctx, name, m.params?.arguments ?? {}, { allowWrite });
      return ok(m.id, { content: [{ type: 'text', text: out.text }], isError: !out.ok });
    }
    default: return { status: 200, body: rpcError(m.id, -32601, `Method not found: ${m.method}`) };
  }
}

const ok = (id: string | number, result: unknown) => ({ status: 200, body: { jsonrpc: '2.0', id, result } });
const rpcError = (id: string | number | null, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
