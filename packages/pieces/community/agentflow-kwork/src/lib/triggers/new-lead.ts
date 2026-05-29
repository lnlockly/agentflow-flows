import {
  AppConnectionValueForAuthProperty,
  createTrigger,
  StaticPropsValue,
  TriggerStrategy,
  Property,
} from '@activepieces/pieces-framework';
import { DedupeStrategy, Polling, pollingHelper } from '@activepieces/pieces-common';
import { agentflowKworkAuth, kworkBridge, KworkBridgeAuth } from '../common';

const props = {
  category: Property.ShortText({
    displayName: 'Категория',
    description: 'Фильтр по категории Kwork (необязательно).',
    required: false,
  }),
  min_budget: Property.Number({
    displayName: 'Минимальный бюджет',
    description: 'Игнорировать проекты дешевле этой суммы (необязательно).',
    required: false,
  }),
  search: Property.ShortText({
    displayName: 'Поиск',
    description: 'Поисковая строка по тексту проекта (необязательно).',
    required: false,
  }),
};

type WantItem = Record<string, unknown> & {
  want_id?: string | number;
  id?: string | number;
};

const polling: Polling<
  AppConnectionValueForAuthProperty<typeof agentflowKworkAuth>,
  StaticPropsValue<typeof props>
> = {
  strategy: DedupeStrategy.LAST_ITEM,
  items: async ({ auth, propsValue }) => {
    const credentials = auth.props as KworkBridgeAuth;
    const body: Record<string, unknown> = {};
    if (propsValue.category) body['category'] = propsValue.category;
    if (propsValue.min_budget != null) body['min_budget'] = propsValue.min_budget;
    if (propsValue.search) body['search'] = propsValue.search;
    const out = await kworkBridge.callBridge<{ wants?: WantItem[] }>(
      credentials,
      '/kwork/scan-projects',
      body,
    );
    const wants = Array.isArray(out?.wants) ? out.wants : [];
    return wants.map((want) => ({
      id: String(want.want_id ?? want.id ?? JSON.stringify(want)),
      data: want,
    }));
  },
};

export const newLead = createTrigger({
  auth: agentflowKworkAuth,
  name: 'new_lead',
  displayName: 'Новая заявка (лид)',
  description:
    'Срабатывает, когда на Kwork появляется новый проект (лид) по заданным фильтрам.',
  props,
  sampleData: {
    want_id: '1234567',
    title: 'Нужен лендинг для кофейни',
    budget: 5000,
    description: 'Хочу одностраничный сайт для новой кофейни в центре города.',
  },
  type: TriggerStrategy.POLLING,
  async test(context) {
    return pollingHelper.test(polling, context);
  },
  async onEnable(context) {
    await pollingHelper.onEnable(polling, context);
  },
  async onDisable(context) {
    await pollingHelper.onDisable(polling, context);
  },
  async run(context) {
    return pollingHelper.poll(polling, context);
  },
});
