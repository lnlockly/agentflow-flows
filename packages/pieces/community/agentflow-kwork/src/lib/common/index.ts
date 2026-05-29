import {
  HttpMethod,
  HttpRequest,
  httpClient,
} from '@activepieces/pieces-common';
import { PieceAuth, Property } from '@activepieces/pieces-framework';

const DEFAULT_BRIDGE_URL =
  'http://kwork-rest-bridge.franchise-factory.svc:8000';

export const agentflowKworkAuth = PieceAuth.CustomAuth({
  description:
    'Подключение к Kwork через AgentFlow. Учётные данные Kwork хранятся в AgentFlow и подставляются на сервере — сюда их вводить не нужно.',
  required: true,
  props: {
    api_key: PieceAuth.SecretText({
      displayName: 'Ключ AgentFlow API',
      description:
        'Ваш ключ `af_live_...` из настроек AgentFlow. По нему сервер определяет владельца и его привязанный аккаунт Kwork.',
      required: true,
    }),
    bridge_url: Property.ShortText({
      displayName: 'URL моста (необязательно)',
      description:
        'Адрес kwork-rest-bridge. Оставьте пустым для значения по умолчанию внутри кластера.',
      required: false,
    }),
    bridge_secret: PieceAuth.SecretText({
      displayName: 'Секрет моста',
      description: 'Общий секрет платформы (заголовок x-bridge-secret).',
      required: true,
    }),
    owner_user_id: Property.Number({
      displayName: 'ID владельца (необязательно)',
      description:
        'Резервный путь, пока ключ API не резолвится на сервере. Обычно 1 для владельца.',
      required: false,
    }),
  },
});

type KworkAuth = {
  api_key: string;
  bridge_url?: string;
  bridge_secret: string;
  owner_user_id?: number;
};

function buildHeaders(auth: KworkAuth): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-bridge-secret': auth.bridge_secret,
  };
  if (auth.api_key) {
    headers['Authorization'] = `Bearer ${auth.api_key}`;
  }
  return headers;
}

async function callBridge<T>(
  auth: KworkAuth,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const baseUrl = (auth.bridge_url?.trim() || DEFAULT_BRIDGE_URL).replace(
    /\/+$/,
    '',
  );
  const payload: Record<string, unknown> = { ...body };
  if (auth.owner_user_id != null) {
    payload['ownerUserId'] = Number(auth.owner_user_id);
  }
  const request: HttpRequest = {
    method: HttpMethod.POST,
    url: `${baseUrl}${path}`,
    headers: buildHeaders(auth),
    body: payload,
  };
  const response = await httpClient.sendRequest<T>(request);
  return response.body;
}

export const kworkBridge = { callBridge, DEFAULT_BRIDGE_URL };

export type KworkBridgeAuth = KworkAuth;
