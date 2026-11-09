// Outbound delivery of briefs. Every channel is optional; with none configured the brief simply waits in the dashboard.
import type { Config } from './config.ts';

export async function notify(cfg: Config, title: string, body: string): Promise<string[]> {
  const results: string[] = [];
  const post = async (label: string, url: string, init: RequestInit) => {
    try {
      const res = await fetch(url, { ...init, method: 'POST', signal: AbortSignal.timeout(10000) });
      results.push(`${label}: ${res.ok ? 'sent' : `HTTP ${res.status}`}`);
    } catch (e) { results.push(`${label}: ${(e as Error).message}`); }
  };
  const n = cfg.notify;
  if (n.ntfyUrl) await post('ntfy', n.ntfyUrl, { headers: { title, markdown: 'yes' }, body });
  if (n.webhookUrl) await post('webhook', n.webhookUrl, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, body }) });
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  if (n.telegramChatId && bot)
    await post('telegram', `https://api.telegram.org/bot${bot}/sendMessage`, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: n.telegramChatId, text: `${title}\n\n${body}`.slice(0, 4000) }),
    });
  return results;
}
