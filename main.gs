// ============================================================
// OZON ETL v1.0 - ПОЛНЫЙ КОД ДЛЯ БЫСТРОГО СТАРТА
// ============================================================

// ============================================================
// 1. КОНФИГУРАЦИЯ
// ============================================================

const OZON_CONFIG = {
  endpoints: {
    fbsOrders: '/v3/posting/fbs/list',
    fboOrders: '/v2/posting/fbo/list',
    products: '/v3/product/list',
    stocks: '/v4/product/info/stocks',
    finance: '/v3/finance/transaction/list',
    productInfo: '/v3/product/info/list'
  },
  pagination: { limit: 100, maxLimit: 1000 },
  delays: { betweenPages: 500, betweenApis: 1000, afterError: 2000, maxRetries: 3 },
  cache: { ttl: 3600, prefix: 'OZON' }
};

const OZON_CABINETS = {
  cab1: { 
    sheetName: 'ozon_adv_effectiveness', 
    label: 'Магазин "JULE"', 
    id: 1,
    clientIdKey: 'OZON_CLIENT_ID_1',
    apiKeyKey: 'OZON_API_KEY_1'
  },
  cab2: { 
    sheetName: 'ozon_adv_effectiveness_2', 
    label: '"Ювелир Карат"', 
    id: 2,
    clientIdKey: 'OZON_CLIENT_ID_2',
    apiKeyKey: 'OZON_API_KEY_2'
  }
};

// ============================================================
// 2. ХРАНИЛИЩЕ УЧЕТНЫХ ДАННЫХ
// ============================================================

class OzonSecrets {
  static getKeys(cabinetId) {
    const props = PropertiesService.getScriptProperties();
    const config = cabinetId === 1 ? OZON_CABINETS.cab1 : OZON_CABINETS.cab2;
    return {
      clientId: props.getProperty(config.clientIdKey),
      apiKey: props.getProperty(config.apiKeyKey)
    };
  }
  
  static setKeys(cabinetId, clientId, apiKey) {
    const props = PropertiesService.getScriptProperties();
    const config = cabinetId === 1 ? OZON_CABINETS.cab1 : OZON_CABINETS.cab2;
    props.setProperty(config.clientIdKey, clientId);
    props.setProperty(config.apiKeyKey, apiKey);
  }
  
  static hasKeys(cabinetId) {
    const keys = this.getKeys(cabinetId);
    return !!(keys.clientId && keys.apiKey);
  }
}

// ============================================================
// 3. КЭШ-МЕНЕДЖЕР
// ============================================================

class OzonCache {
  constructor(ttl = 3600) {
    this.cache = CacheService.getScriptCache();
    this.ttl = ttl;
    this.prefix = 'OZON';
  }
  
  key(endpoint, params) {
    const sorted = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&');
    return `${this.prefix}:${endpoint}:${sorted}`.substring(0, 250);
  }
  
  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    try { return JSON.parse(cached); } catch (e) { return null; }
  }
  
  set(key, data) {
    this.cache.put(key, JSON.stringify(data), this.ttl);
  }
  
  clear() {
    // CacheService не поддерживает удаление по префиксу
    // Используем TTL для автоматической очистки
  }
}

// ============================================================
// 4. API КЛИЕНТ
// ============================================================

class OzonClient {
  constructor(clientId, apiKey) {
    this.baseUrl = 'https://api-seller.ozon.ru';
    this.clientId = clientId;
    this.apiKey = apiKey;
    this.cache = new OzonCache();
    this.lastRequestTime = 0;
    this.rateLimit = 50;
  }
  
  /**
   * Выполнение запроса с обработкой ошибок и кэшированием
   * @param {string} endpoint - Путь эндпоинта
   * @param {Object} body - Тело запроса
   * @param {Object} options - Настройки запроса
   * @returns {Object} Ответ API
   */
  request(endpoint, body = {}, options = {}) {
    const { useCache = true, retries = 3 } = options;
    const cacheKey = this.cache.key(endpoint, body);
    
    // Проверяем кэш
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        Logger.log(`🔷 КЭШ: ${endpoint}`);
        return cached;
      }
    }
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Rate limiting
        this._throttle();
        
        const url = this.baseUrl + endpoint;
        const response = UrlFetchApp.fetch(url, {
          method: 'POST',
          headers: {
            'Client-Id': this.clientId,
            'Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(body),
          muteHttpExceptions: true
        });
        
        const code = response.getResponseCode();
        const content = response.getContentText();
        
        // Rate limit
        if (code === 429) {
          const waitTime = 2000 * Math.pow(2, attempt);
          Logger.log(`⏳ Рейт-лимит, ждём ${waitTime}ms`);
          Utilities.sleep(waitTime);
          continue;
        }
        
        // Ошибка
        if (code !== 200) {
          throw new Error(`HTTP ${code}: ${content}`);
        }
        
        // Парсим ответ
        const data = JSON.parse(content);
        
        // Сохраняем в кэш
        if (useCache && data) {
          this.cache.set(cacheKey, data);
        }
        
        return data;
        
      } catch (error) {
        lastError = error;
        Logger.log(`❌ Ошибка (${attempt}/${retries}): ${error.message}`);
        
        if (attempt < retries) {
          const waitTime = 1000 * Math.pow(2, attempt);
          Utilities.sleep(waitTime);
        }
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  }
  
  /**
   * Rate limiting - не более 50 запросов в секунду
   */
  _throttle() {
    const now = Date.now();
    const minInterval = 1000 / this.rateLimit;
    const elapsed = now - this.lastRequestTime;
    if (elapsed < minInterval) {
      Utilities.sleep(minInterval - elapsed);
    }
    this.lastRequestTime = Date.now();
  }
}

// ============================================================
// 5. ЛОГГЕР
// ============================================================

class OzonLogger {
  constructor(sheet) {
    this.sheet = sheet;
  }
  
  /**
   * Обновление статуса в строке 3
   */
  status(text, color = '#FFF3CD') {
    try {
      this.sheet.getRange('A3').setValue(`🔄 ${text}`);
      this.sheet.getRange('A3').setBackground(color);
      SpreadsheetApp.flush();
    } catch(e) {
      // Игнорируем ошибки статуса
    }
  }
  
  /**
   * Обновление прогресса
   */
  progress(step, total, text = '') {
    try {
      const percent = Math.round((step / total) * 100);
      const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
      this.sheet.getRange('B3').setValue(`${percent}% ${bar}`);
      if (text) {
        this.sheet.getRange('C3').setValue(text);
      }
      SpreadsheetApp.flush();
    } catch(e) {
      // Игнорируем ошибки прогресса
    }
  }
  
  /**
   * Завершение с успехом
   */
  finish(text, color = '#D4EDDA') {
    try {
      this.sheet.getRange('A3').setValue(`✅ ${text}`);
      this.sheet.getRange('A3').setBackground(color);
      this.sheet.getRange('B3').setValue('✅ Завершено');
      this.sheet.getRange('C3').setValue(new Date().toLocaleTimeString());
      SpreadsheetApp.flush();
    } catch(e) {
      // Игнорируем ошибки финиша
    }
  }
  
  /**
   * Ошибка
   */
  error(text) {
    try {
      this.sheet.getRange('A3').setValue(`❌ ${text}`);
      this.sheet.getRange('A3').setBackground('#F8D7DA');
      SpreadsheetApp.flush();
    } catch(e) {
      // Игнорируем ошибки
    }
  }
}

// ============================================================
// 6. УТИЛИТЫ
// ============================================================

function formatDate(date) {
  if (!date || isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function safeNum(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function safeStr(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

// ============================================================
// 7. ЗАГРУЗКА ЗАКАЗОВ (FBS + FBO)
// ============================================================

function fetchOzonOrders(client, dateFrom, dateTo) {
  Logger.log('📊 Загружаем заказы...');
  const orders = {};
  
  // === FBS ЗАКАЗЫ ===
  try {
    Logger.log('  📦 FBS...');
    const fbsData = client.request('/v3/posting/fbs/list', {
      filter: {
        since: formatDate(dateFrom),
        to: formatDate(dateTo)
      },
      limit: 100,
      offset: 0,
      with: {
        analytics_data: true,
        financial_data: true
      }
    });
    
    const postings = fbsData.result?.postings || [];
    postings.forEach(posting => {
      if (posting.status === 'cancelled') return;
      (posting.products || []).forEach(product => {
        const sku = product.sku;
        if (!sku) return;
        if (!orders[sku]) {
          orders[sku] = {
            sku,
            name: product.name || '',
            orders: 0,
            qty: 0,
            fbs: 0,
            fbo: 0,
            sum: 0
          };
        }
        orders[sku].orders++;
        orders[sku].qty += (product.quantity || 0);
        orders[sku].fbs++;
        if (product.price?.amount) {
          orders[sku].sum += Number(product.price.amount) * (product.quantity || 0);
        }
      });
    });
    
    Logger.log(`  ✅ FBS: ${Object.keys(orders).length} товаров`);
  } catch(e) {
    Logger.log(`  ⚠️ FBS ошибка: ${e.message}`);
  }
  
  // === FBO ЗАКАЗЫ ===
  try {
    Logger.log('  📦 FBO...');
    const fboData = client.request('/v2/posting/fbo/list', {
      filter: {
        since: formatDate(dateFrom),
        to: formatDate(dateTo)
      },
      limit: 100,
      offset: 0,
      with: {
        analytics_data: true,
        financial_data: true
      }
    });
    
    const postings = fboData.result || [];
    postings.forEach(posting => {
      if (posting.status === 'cancelled') return;
      (posting.products || []).forEach(product => {
        const sku = product.sku;
        if (!sku) return;
        if (!orders[sku]) {
          orders[sku] = {
            sku,
            name: product.name || '',
            orders: 0,
            qty: 0,
            fbs: 0,
            fbo: 0,
            sum: 0
          };
        }
        orders[sku].orders++;
        orders[sku].qty += (product.quantity || 0);
        orders[sku].fbo++;
        if (product.price) {
          orders[sku].sum += Number(product.price) * (product.quantity || 0);
        }
      });
    });
    
    Logger.log(`  ✅ FBO: ${Object.keys(orders).length} товаров`);
  } catch(e) {
    Logger.log(`  ⚠️ FBO ошибка: ${e.message}`);
  }
  
  Logger.log(`✅ Итого: ${Object.keys(orders).length} товаров с заказами`);
  return orders;
}

// ============================================================
// 8. ЗАГРУЗКА АРТИКУЛОВ (VENDORCODE)
// ============================================================

function fetchOzonVendorCodes(client) {
  Logger.log('📊 Загружаем артикулы...');
  const result = {};
  let cursor = '';
  let hasNext = true;
  
  try {
    while (hasNext) {
      const data = client.request('/v3/product/list', {
        limit: 1000,
        cursor: cursor,
        filter: { visibility: 'ALL' }
      }, { useCache: true });
      
      const items = data.result?.items || [];
      items.forEach(item => {
        if (item.sku && item.offer_id) {
          result[item.sku] = item.offer_id;
        }
      });
      
      hasNext = data.result?.has_next || false;
      cursor = data.result?.cursor || '';
      
      if (!hasNext || items.length === 0) break;
    }
    
    Logger.log(`✅ Артикулы: ${Object.keys(result).length} товаров`);
  } catch(e) {
    Logger.log(`⚠️ Ошибка: ${e.message}`);
  }
  
  return result;
}

// ============================================================
// 9. ЗАГРУЗКА ОСТАТКОВ
// ============================================================

function fetchOzonStocks(client, skus) {
  Logger.log('📊 Загружаем остатки...');
  const result = {};
  
  // Разбиваем на пачки по 100
  const chunks = [];
  for (let i = 0; i < skus.length; i += 100) {
    chunks.push(skus.slice(i, i + 100));
  }
  
  chunks.forEach((chunk, idx) => {
    try {
      const data = client.request('/v4/product/info/stocks', {
        filter: {
          sku: chunk.map(String)
        },
        limit: 100
      });
      
      (data.items || []).forEach(item => {
        const sku = item.product_id || item.sku;
        if (!sku) return;
        
        let fbw = 0, fbs = 0;
        (item.stocks || []).forEach(stock => {
          if (stock.type === 'fbo') {
            fbw += stock.present || 0;
          } else if (stock.type === 'fbs' || stock.type === 'rfbs') {
            fbs += stock.present || 0;
          }
        });
        
        result[sku] = {
          sku,
          fbw,
          fbs,
          total: fbw + fbs
        };
      });
      
      Logger.log(`  ✅ Пачка ${idx + 1}/${chunks.length}: ${(data.items || []).length} товаров`);
    } catch(e) {
      Logger.log(`  ⚠️ Ошибка пачки ${idx + 1}: ${e.message}`);
    }
  });
  
  Logger.log(`✅ Остатки: ${Object.keys(result).length} товаров`);
  return result;
}

// ============================================================
// 10. ЗАГРУЗКА ФИНАНСОВ
// ============================================================

function fetchOzonFinance(client, dateFrom, dateTo) {
  Logger.log('📊 Загружаем финансы...');
  const result = {};
  let page = 1;
  let hasMore = true;
  
  try {
    while (hasMore) {
      const data = client.request('/v3/finance/transaction/list', {
        filter: {
          date: {
            from: formatDate(dateFrom),
            to: formatDate(dateTo)
          }
        },
        page: page,
        page_size: 100
      }, { useCache: true });
      
      const operations = data.result?.operations || [];
      if (operations.length === 0) break;
      
      operations.forEach(op => {
        const items = op.items || [];
        const sku = items[0]?.sku;
        if (!sku) return;
        
        if (!result[sku]) {
          result[sku] = {
            sku,
            sales: 0,
            returns: 0,
            commission: 0,
            logistics: 0,
            storage: 0,
            penalty: 0,
            deduction: 0,
            acceptance: 0
          };
        }
        
        const d = result[sku];
        const amount = Number(op.amount) || 0;
        const type = op.type || '';
        
        if (type === 'orders') {
          d.sales += Math.abs(amount);
        } else if (type === 'returns') {
          d.returns += Math.abs(amount);
        } else if (type === 'services') {
          d.commission += Math.abs(amount);
        }
      });
      
      const pageCount = data.result?.page_count || 0;
      if (page >= pageCount) hasMore = false;
      page++;
      
      Logger.log(`  ✅ Страница ${page - 1}/${pageCount}`);
    }
    
    Logger.log(`✅ Финансы: ${Object.keys(result).length} товаров`);
  } catch(e) {
    Logger.log(`⚠️ Ошибка: ${e.message}`);
  }
  
  return result;
}

// ============================================================
// 11. ОБЪЕДИНЕНИЕ ДАННЫХ
// ============================================================

function mergeOzonData(orders, vendorCodes, stocks, finance) {
  Logger.log('📊 Объединяем данные...');
  
  // Собираем все SKU
  const allSkus = new Set();
  Object.keys(orders).forEach(k => allSkus.add(Number(k)));
  Object.keys(stocks).forEach(k => allSkus.add(Number(k)));
  Object.keys(finance).forEach(k => allSkus.add(Number(k)));
  
  if (allSkus.size === 0) {
    Logger.log('⚠️ Нет данных для объединения');
    return [];
  }
  
  const result = [];
  
  allSkus.forEach(sku => {
    const order = orders[sku] || {};
    const vendorCode = vendorCodes[sku] || '';
    const stock = stocks[sku] || {};
    const fin = finance[sku] || {};
    
    const totalRealization = fin.sales - fin.returns || 0;
    const totalQuantity = order.qty || 0;
    const shelfPrice = totalQuantity > 0 ? Math.round(totalRealization / totalQuantity) : 0;
    
    const totalCommission = fin.commission || 0;
    const totalLogistics = fin.logistics || 0;
    const totalStorage = fin.storage || 0;
    const totalPenalty = fin.penalty || 0;
    const totalDeduction = fin.deduction || 0;
    const totalAcceptance = fin.acceptance || 0;
    
    const grossMargin = totalRealization 
      - totalCommission 
      - totalLogistics 
      - totalStorage 
      - totalPenalty 
      - totalDeduction 
      - totalAcceptance;
    
    const marginPercent = totalRealization > 0 ? (grossMargin / totalRealization) * 100 : 0;
    
    result.push({
      sku,
      vendorCode,
      ordersSum: order.sum || 0,
      adCost: 0,
      drr: 0,
      clicks: 0,
      cart: 0,
      cr1: 0,
      fbw: stock.fbw || 0,
      fbs: stock.fbs || 0,
      totalStock: stock.total || 0,
      shelfPrice,
      totalSales: fin.sales || 0,
      totalRealization,
      totalQuantitySales: totalQuantity,
      totalCostPrice: 0,
      totalLogistics,
      totalCommission,
      totalPenalty,
      totalStorage,
      totalDeduction,
      totalAcceptance,
      totalCompensations: 0,
      grossMargin,
      marginPercent
    });
  });
  
  // Сортировка по реализации
  result.sort((a, b) => b.totalRealization - a.totalRealization);
  
  Logger.log(`✅ Объединено: ${result.length} товаров`);
  return result;
}

// ============================================================
// 12. ЗАПИСЬ В ТАБЛИЦУ
// ============================================================

function writeOzonData(sheet, data) {
  if (!data || data.length === 0) {
    Logger.log('⚠️ Нет данных для записи');
    const lastRow = sheet.getLastRow();
    if (lastRow >= 5) sheet.deleteRows(5, lastRow - 4);
    return;
  }
  
  const tableData = data.map(item => {
    const marginValue = Math.round(safeNum(item.marginPercent));
    return [
      safeNum(item.sku),
      safeStr(item.vendorCode),
      Math.round(safeNum(item.ordersSum)),
      Math.round(safeNum(item.adCost)),
      safeNum(item.drr) > 0 ? Math.round(safeNum(item.drr)) + '%' : '0%',
      Math.round(safeNum(item.clicks)),
      Math.round(safeNum(item.cart)),
      safeNum(item.cr1) > 0 ? Math.round(safeNum(item.cr1)) + '%' : '0%',
      Math.round(safeNum(item.fbw)),
      Math.round(safeNum(item.fbs)),
      Math.round(safeNum(item.totalStock)),
      Math.round(safeNum(item.shelfPrice)),
      Math.round(safeNum(item.totalSales)),
      Math.round(safeNum(item.totalRealization)),
      Math.round(safeNum(item.totalQuantitySales)),
      Math.round(safeNum(item.totalCostPrice)),
      Math.round(safeNum(item.totalLogistics)),
      Math.round(safeNum(item.totalCommission)),
      Math.round(safeNum(item.totalPenalty)),
      Math.round(safeNum(item.totalStorage)),
      Math.round(safeNum(item.totalDeduction)),
      Math.round(safeNum(item.totalAcceptance)),
      Math.round(safeNum(item.adCost)),
      Math.round(safeNum(item.totalCompensations)),
      Math.round(safeNum(item.grossMargin)),
      String(marginValue) + '%'
    ];
  });
  
  // Очищаем старые данные
  const lastRow = sheet.getLastRow();
  if (lastRow >= 5) sheet.deleteRows(5, lastRow - 4);
  
  // Записываем новые
  sheet.getRange(5, 1, tableData.length, tableData[0].length).setValues(tableData);
  
  Logger.log(`✅ Записано ${tableData.length} строк`);
}

// ============================================================
// 13. ОСНОВНАЯ ФУНКЦИЯ ЗАПУСКА
// ============================================================

function runOzonCabinet(cabinetId) {
  const startTime = new Date();
  const config = cabinetId === 1 ? OZON_CABINETS.cab1 : OZON_CABINETS.cab2;
  
  Logger.log(`🚀 ===== СТАРТ: ${config.label} =====`);
  
  // Получаем лист
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.sheetName);
  if (!sheet) {
    Logger.log(`❌ Лист "${config.sheetName}" не найден`);
    return;
  }
  
  const logger = new OzonLogger(sheet);
  logger.status('Запуск...', '#FFF3CD');
  
  // Получаем учетные данные
  const { clientId, apiKey } = OzonSecrets.getKeys(cabinetId);
  if (!clientId || !apiKey) {
    logger.error('Учетные данные не найдены!');
    Logger.log(`❌ Учетные данные для ${config.label} не найдены`);
    return;
  }
  
  // Создаем клиент
  const client = new OzonClient(clientId, apiKey);
  
  // Получаем даты
  let dateFrom, dateTo;
  try {
    dateFrom = new Date(sheet.getRange('B2').getValue());
    dateTo = new Date(sheet.getRange('C2').getValue());
    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      throw new Error('Неверный формат даты');
    }
    if (dateFrom > dateTo) {
      throw new Error('Дата "с" больше даты "по"');
    }
  } catch (e) {
    logger.error(`Ошибка в датах: ${e.message}`);
    Logger.log(`❌ Ошибка в датах: ${e.message}`);
    return;
  }
  
  Logger.log(`📅 Период: ${formatDate(dateFrom)} - ${formatDate(dateTo)}`);
  
  const totalSteps = 5;
  let currentStep = 0;
  
  try {
    // --- ШАГ 1: ЗАКАЗЫ ---
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Загрузка заказов...');
    logger.status(`Заказы (${currentStep}/${totalSteps})`, '#FFF3CD');
    const orders = fetchOzonOrders(client, dateFrom, dateTo);
    
    // --- ШАГ 2: АРТИКУЛЫ ---
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Загрузка артикулов...');
    logger.status(`Артикулы (${currentStep}/${totalSteps})`, '#FFF3CD');
    const vendorCodes = fetchOzonVendorCodes(client);
    
    // --- ШАГ 3: ОСТАТКИ ---
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Загрузка остатков...');
    logger.status(`Остатки (${currentStep}/${totalSteps})`, '#FFF3CD');
    const allSkus = Object.keys(orders).map(Number);
    const stocks = allSkus.length > 0 ? fetchOzonStocks(client, allSkus) : {};
    
    // --- ШАГ 4: ФИНАНСЫ ---
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Загрузка финансов...');
    logger.status(`Финансы (${currentStep}/${totalSteps})`, '#FFF3CD');
    const finance = fetchOzonFinance(client, dateFrom, dateTo);
    
    // --- ШАГ 5: ОБЪЕДИНЕНИЕ ---
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Объединение...');
    logger.status('Объединение данных...', '#FFF3CD');
    const merged = mergeOzonData(orders, vendorCodes, stocks, finance);
    
    // --- ЗАПИСЬ ---
    logger.status('Запись в таблицу...', '#FFF3CD');
    writeOzonData(sheet, merged);
    
    // --- ФИНИШ ---
    const elapsed = Math.round((new Date() - startTime) / 1000);
    const totalItems = merged.length;
    const totalRealization = merged.reduce((sum, i) => sum + i.totalRealization, 0);
    
    logger.finish(`Готово! ${totalItems} товаров, ${elapsed} сек`, '#D4EDDA');
    
    Logger.log(`✅ ===== ФИНИШ: ${config.label} (${elapsed} сек) =====`);
    Logger.log(`📊 Итог: ${totalItems} товаров, реализация ${Math.round(totalRealization)} ₽`);
    
  } catch (e) {
    logger.error(`Ошибка: ${e.message}`);
    Logger.log(`❌ Ошибка: ${e.message}`);
    Logger.log(e.stack);
  }
}

// ============================================================
// 14. УСТАНОВКА УЧЕТНЫХ ДАННЫХ
// ============================================================

function setOzonCredentials() {
  const ui = SpreadsheetApp.getUi();
  
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 10px;">
      <h3>🔑 Выберите кабинет</h3>
      <p style="color: #666;">Для какого кабинета установить учетные данные?</p>
      <div style="margin: 15px 0;">
        <button onclick="select(1)" style="padding: 10px 20px; margin: 5px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
          🏪 Магазин "JULE"
        </button>
        <button onclick="select(2)" style="padding: 10px 20px; margin: 5px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
          🏪 "Ювелир Карат"
        </button>
      </div>
      <div style="margin-top: 15px; padding: 10px; background: #FFF3CD; border-radius: 4px;">
        <small>⚠️ Client-ID и API-Key в Настройки → Seller API</small>
      </div>
    </div>
    <script>
      function select(cabinet) {
        google.script.run.withSuccessHandler(function() {
          google.script.host.close();
        })._setOzonCredentials(cabinet);
      }
    </script>
  `;
  
  const dialog = HtmlService.createHtmlOutput(html)
    .setWidth(400)
    .setHeight(280);
  ui.showModalDialog(dialog, '🔑 Установка учетных данных');
}

function _setOzonCredentials(cabinetId) {
  const ui = SpreadsheetApp.getUi();
  const config = cabinetId === 1 ? OZON_CABINETS.cab1 : OZON_CABINETS.cab2;
  const cabinetLabel = config.label;
  
  // Client-ID
  const clientIdResponse = ui.prompt(
    `🔑 Client-ID для ${cabinetLabel}`,
    'Client-ID из Настройки → Seller API:\n\nВведите Client-ID:',
    ui.ButtonSet.OK_CANCEL
  );
  if (clientIdResponse.getSelectedButton() !== ui.Button.OK) return;
  const clientId = clientIdResponse.getResponseText().trim();
  
  if (clientId.length < 5) {
    ui.alert('❌ Client-ID слишком короткий.');
    return;
  }
  
  // API-Key
  const apiKeyResponse = ui.prompt(
    `🔑 API-Key для ${cabinetLabel}`,
    '⚠️ Сохраните ключ сразу после генерации!\n\nВведите API-Key:',
    ui.ButtonSet.OK_CANCEL
  );
  if (apiKeyResponse.getSelectedButton() !== ui.Button.OK) return;
  const apiKey = apiKeyResponse.getResponseText().trim();
  
  if (apiKey.length < 20) {
    ui.alert('❌ API-Key слишком короткий.');
    return;
  }
  
  // Сохраняем
  OzonSecrets.setKeys(cabinetId, clientId, apiKey);
  
  ui.alert(`✅ Учетные данные для "${cabinetLabel}" сохранены!\n\n` +
    `Client-ID: ${clientId}\n` +
    `API-Key: ${apiKey.substring(0, 10)}...`);
}

// ============================================================
// 15. ФУНКЦИИ ЗАПУСКА
// ============================================================

function ozonMain() {
  runOzonCabinet(1);
}

function ozonMainCab2() {
  runOzonCabinet(2);
}

function ozonMainAll() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ Внимание!',
    'Будут обновлены оба кабинета.\n' +
    'Магазин "JULE" и "Ювелир Карат"\n\n' +
    'Это может занять до 10 минут.\n\n' +
    'Продолжить?',
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    runOzonCabinet(1);
    runOzonCabinet(2);
    ui.alert('✅ Оба кабинета обновлены!');
  }
}

// ============================================================
// 16. СОЗДАНИЕ ЛИСТА ДЛЯ OZON
// ============================================================

function createOzonSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const name = ui.prompt(
    '📊 Создать лист для Ozon',
    'Введите название нового листа:\n\n' +
    'Для первого кабинета: ozon_adv_effectiveness\n' +
    'Для второго: ozon_adv_effectiveness_2\n\n' +
    'Название:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (name.getSelectedButton() !== ui.Button.OK) return;
  const sheetName = name.getResponseText().trim();
  
  if (!sheetName) {
    ui.alert('❌ Название не может быть пустым.');
    return;
  }
  
  if (ss.getSheetByName(sheetName)) {
    ui.alert(`❌ Лист "${sheetName}" уже существует.`);
    return;
  }
  
  const sheet = ss.insertSheet(sheetName);
  
  // Заголовки (26 столбцов)
  const headers = [
    'SKU', 'Артикул', 'Заказы (сумма)', 'Реклама (расход)', 'DRR',
    'Клики', 'Корзина', 'CR1', 'FBW', 'FBS',
    'Остаток (всего)', 'Цена полки', 'Продажи (retailPrice)',
    'Реализация (retailAmount)', 'Кол-во продаж', 'Себестоимость (всего)',
    'Логистика (всего)', 'Комиссия', 'Штрафы', 'Хранение',
    'Удержания', 'Приемка', 'Реклама (расход)', 'Компенсации',
    'Маржинальность (₽)', 'Маржинальность (%)'
  ];
  
  // Записываем заголовки в строку 4
  sheet.getRange(4, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(4, 1, 1, headers.length).setBackground('#E8F4FD');
  sheet.getRange(4, 1, 1, headers.length).setFontWeight('bold');
  
  // Настраиваем ячейки для дат (строка 2)
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);
  
  sheet.getRange('B2').setValue(monthAgo);
  sheet.getRange('C2').setValue(today);
  sheet.getRange('B2').setNumberFormat('dd.mm.yyyy');
  sheet.getRange('C2').setNumberFormat('dd.mm.yyyy');
  sheet.getRange('B1').setValue('📅 Дата с:');
  sheet.getRange('C1').setValue('📅 Дата по:');
  
  // Настраиваем ячейки для статуса (строка 3)
  sheet.getRange('A3').setValue('🔄 Готов к работе');
  sheet.getRange('A3').setBackground('#FFF3CD');
  sheet.getRange('B3').setValue('0% ░░░░░░░░░░');
  sheet.getRange('C3').setValue('Ожидание запуска');
  
  // Автоширина колонок
  sheet.autoResizeColumns(1, headers.length);
  
  ui.alert(`✅ Лист "${sheetName}" создан!\n\n` +
    'Теперь:\n' +
    '1. Установите учетные данные через меню\n' +
    '2. Настройте даты в ячейках B2 и C2\n' +
    '3. Запустите обновление');
}

// ============================================================
// 17. МЕНЮ
// ============================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('📊 Ozon Отчеты');
  
  menu.addItem('📊 Создать лист для Ozon', 'createOzonSheet');
  menu.addSeparator();
  menu.addItem('🔑 Установить учетные данные', 'setOzonCredentials');
  menu.addSeparator();
  menu.addItem('🔄 Магазин "JULE"', 'ozonMain');
  menu.addItem('🔄 "Ювелир Карат"', 'ozonMainCab2');
  menu.addSeparator();
  menu.addItem('🔄 Обновить все', 'ozonMainAll');
  
  menu.addToUi();
}
