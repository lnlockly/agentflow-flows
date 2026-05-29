import { createAction, Property } from '@activepieces/pieces-framework';
import { agentflowKworkAuth, kworkBridge, KworkBridgeAuth } from '../common';

export const scanLeads = createAction({
  auth: agentflowKworkAuth,
  name: 'scan_leads',
  displayName: 'Сканировать заявки (проекты)',
  description:
    'Ищет открытые проекты на Kwork по фильтрам — это входящие лиды, на которые можно откликнуться.',
  props: {
    category: Property.ShortText({
      displayName: 'Категория',
      description: 'Фильтр по категории Kwork (необязательно).',
      required: false,
    }),
    min_budget: Property.Number({
      displayName: 'Минимальный бюджет',
      description: 'Отсечь проекты дешевле этой суммы (необязательно).',
      required: false,
    }),
    search: Property.ShortText({
      displayName: 'Поиск',
      description: 'Поисковая строка по тексту проекта (необязательно).',
      required: false,
    }),
  },
  async run(context) {
    const auth = context.auth.props as KworkBridgeAuth;
    const body: Record<string, unknown> = {};
    if (context.propsValue.category) body['category'] = context.propsValue.category;
    if (context.propsValue.min_budget != null)
      body['min_budget'] = context.propsValue.min_budget;
    if (context.propsValue.search) body['search'] = context.propsValue.search;
    return kworkBridge.callBridge(auth, '/kwork/scan-projects', body);
  },
});
