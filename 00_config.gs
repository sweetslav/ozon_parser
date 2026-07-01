// ============================================================
// ФАЙЛ 00: КОНФИГУРАЦИЯ ПРОЕКТА
// ============================================================
// Содержит: все константы, ID таблиц, настройки API
// ============================================================

// ============================================================
// 0.1 ГЛОБАЛЬНЫЕ КОНСТАНТЫ
// ============================================================

/** ID справочной таблицы с остатками и себестоимостью */
const COST_SPREADSHEET_ID = '1pP1RlNjgfxcDNw9Icwep0Pl3PyJikNIeQE6bMdCDD70';
const COST_SHEET_NAME = 'unit расчет';

/** API настройки */
const API_CONFIG = {
  seller: {
    baseUrl: 'https://api-seller.ozon.ru',
    rateLimit: 50,  // запросов в секунду
    maxRetries: 3,
    defaultLimit: 500
  },
  performance: {
    baseUrl: 'https://api-performance.ozon.ru',
    tokenEndpoint: '/api/client/token',
    campaignsEndpoint: '/api/client/campaign',
    statsExpenseEndpoint: '/api/client/statistics/expense'
  }
};

/** Настройки кэширования (TTL в секундах) */
const CACHE_TTL = {
  analytics: 3600,      // 1 час
  finance: 86400,       // 24 часа
  orders: 900,          // 15 минут
  stocks: 3600,         // 1 час
  campaigns: 300,       // 5 минут
  expense: 3600         // 1 час
};

/** Лимиты пагинации */
const PAGINATION = {
  analyticsLimit: 500,
  financePageSize: 100,
  ordersLimit: 50,
  maxDaysPerRequest: 30
};

// ============================================================
// 0.2 КОНФИГУРАЦИЯ КАБИНЕТОВ
// ============================================================

const OZON_CABINETS = {
  cab1: {
    sheetName: 'ozon_adv_effectiveness',
    label: 'Магазин "JULE"',
    id: 1,
    // Seller API
    clientIdKey: 'OZON_CLIENT_ID_1',
    apiKeyKey: 'OZON_API_KEY_1',
    // Performance API
    performanceClientIdKey: 'OZON_PERF_CLIENT_ID_1',
    performanceSecretKey: 'OZON_PERF_SECRET_1'
  },
  cab2: {
    sheetName: 'ozon_adv_effectiveness_2',
    label: '"Ювелир Карат"',
    id: 2,
    clientIdKey: 'OZON_CLIENT_ID_2',
    apiKeyKey: 'OZON_API_KEY_2',
    performanceClientIdKey: 'OZON_PERF_CLIENT_ID_2',
    performanceSecretKey: 'OZON_PERF_SECRET_2'
  }
};

/** Структура столбцов итоговой таблицы */
const TABLE_COLUMNS = [
  'SKU', 'Артикул', 'Заказы (сумма)', 'Реклама (расход)', 'DRR',
  'Клики', 'Корзина', 'CR1', 'FBO', 'FBS',
  'Остаток (всего)', 'Цена полки', 'Продажи (retailPrice)',
  'Реализация (retailAmount)', 'Кол-во продаж', 'Себестоимость (всего)',
  'Логистика (всего)', 'Комиссия', 'Штрафы', 'Хранение',
  'Удержания', 'Приемка', 'Реклама (расход)', 'Компенсации',
  'Маржинальность (₽)', 'Маржинальность (%)'
];
