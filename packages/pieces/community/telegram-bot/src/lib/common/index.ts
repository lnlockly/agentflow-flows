import {
  HttpMethod,
  HttpRequest,
  httpClient,
} from '@activepieces/pieces-common';
import { telegramBotAuth } from '../..';
import { AppConnectionValueForAuthProperty } from '@activepieces/pieces-framework';

export type SetWebhookRequest = {
  ip_address: string;
  max_connections: number;
  allowed_updates: string[];
  drop_pending_updates: boolean;
  secret_token: string;
};

const TELEGRAM_PARSE_MODES = ['MarkdownV2', 'HTML', 'Markdown'] as const;

export const telegramCommons = {
  getApiUrl: (auth: AppConnectionValueForAuthProperty<typeof telegramBotAuth>, methodName: string) => {
    return `https://api.telegram.org/bot${auth.secret_text}/${methodName}`;
  },
  // Telegram's sendMessage only accepts an OMITTED parse_mode or one of
  // MarkdownV2/HTML/Markdown. The "Plain Text" dropdown option has value
  // 'None' (truthy) and some seeded flows pass 'text' — both were forwarded
  // verbatim, which Telegram rejects with 400 "unsupported parse_mode" (the
  // 99 FAILED kwork-approval runs on 2026-05-29). Resolve to a valid value or
  // `undefined` so the caller drops the field entirely (plain text).
  resolveParseMode: (value: unknown): 'MarkdownV2' | 'HTML' | 'Markdown' | undefined => {
    return TELEGRAM_PARSE_MODES.find((mode) => mode === value);
  },
  subscribeWebhook: async (
    botToken: string,
    webhookUrl: string,
    overrides?: Partial<SetWebhookRequest>
  ) => {
    const request: HttpRequest = {
      method: HttpMethod.POST,
      url: `https://api.telegram.org/bot${botToken}/setWebhook`,
      body: {
        allowed_updates: [],
        url: webhookUrl,
        ...overrides,
      },
    };

    await httpClient.sendRequest(request);
  },
  unsubscribeWebhook: async (botToken: string) => {
    const request: HttpRequest = {
      method: HttpMethod.GET,
      url: `https://api.telegram.org/bot${botToken}/deleteWebhook`,
    };
    return await httpClient.sendRequest(request);
  },
};
