// ============================================================
// ФАЙЛ 03: ETL ПРОЦЕССОРЫ
// ============================================================
// Содержит: загрузку данных, трансформацию и запись в таблицу
// ============================================================

// ============================================================
// 3.1 ЗАГРУЗКА ЗАКАЗОВ
// ============================================================

function fetchOzonOrders(client, dateFrom, dateTo) {
  Logger.log('📊 Загружаем заказы...');
  const orders = {};
  const limit = PAGINATION.ordersLimit;

  const actualTo = new Date(dateTo);
  actualTo.setDate(actualTo.getDate() - 1);

  // FBS (по дням)
  try {
    const currentDate = new Date(dateFrom);
    const endDate = new Date(actualTo);
    let totalFbs = 0, daysProcessed = 0;

    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      let offset = 0, hasMore = true, dayOrders = 0;

      while (hasMore) {
        const fbsData = client.request('/v3/posting/fbs/list', {
          filter: {
            since: formatDateOzon(dayStart, false),
            to: formatDateOzon(dayEnd, true)
          },
          limit,
          offset
        }, { useCache: false, retries: 3, logSize: true });

        const postings = fbsData.result?.postings || [];
        totalFbs += postings.length;
        dayOrders += postings.length;

        postings.forEach(posting => {
          if (posting.status === 'cancelled') return;
          (posting.products || []).forEach(product => {
            const sku = product.sku;
            if (!sku) return;
            if (!orders[sku]) {
              orders[sku] = { sku, offerId: product.offer_id || '', name: product.name || '', orders: 0, qty: 0, fbs: 0, fbo: 0, sum: 0 };
            }
            orders[sku].orders++;
            orders[sku].qty += product.quantity || 0;
            orders[sku].fbs++;
            if (product.price?.amount) {
              orders[sku].sum += Number(product.price.amount) * (product.quantity || 0);
            }
          });
        });

        hasMore = fbsData.result?.has_next || false;
        offset += limit;
      }

      daysProcessed++;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    Logger.log(`    ✅ FBS: ${totalFbs} заказов (${daysProcessed} дней)`);
  } catch (e) {
    Logger.log(`    ⚠️ FBS ошибка: ${e.message}`);
  }

  // FBO (аналогично, но с кэшированием)
  try {
    const since = formatDateOzon(dateFrom, false);
    const to = formatDateOzon(actualTo, true);
    let offset = 0, hasMore = true, totalFbo = 0;

    while (hasMore) {
      const fboData = client.request('/v2/posting/fbo/list', {
        filter: { since, to },
        limit: 50,
        offset
      }, { useCache: true, retries: 3 });

      const postings = fboData.result || [];
      totalFbo += postings.length;

      postings.forEach(posting => {
        if (posting.status === 'cancelled') return;
        (posting.products || []).forEach(product => {
          const sku = product.sku;
          if (!sku) return;
          if (!orders[sku]) {
            orders[sku] = { sku, offerId: product.offer_id || '', name: product.name || '', orders: 0, qty: 0, fbs: 0, fbo: 0, sum: 0 };
          }
          orders[sku].orders++;
          orders[sku].qty += product.quantity || 0;
          orders[sku].fbo++;
          if (product.price) {
            orders[sku].sum += Number(product.price) * (product.quantity || 0);
          }
        });
      });

      hasMore = postings.length >= 50;
      offset += 50;
    }
    Logger.log(`    ✅ FBO: ${totalFbo} заказов`);
  } catch (e) {
    Logger.log(`    ⚠️ FBO ошибка: ${e.message}`);
  }

  Logger.log(`✅ Итого: ${Object.keys(orders).length} товаров с заказами`);
  return orders;
}

// ============================================================
// 3.2 ЗАГРУЗКА АНАЛИТИКИ (ОПТИМИЗИРОВАННАЯ)
// ============================================================

function fetchAnalytics(client, dateFrom, dateTo) {
  Logger.log('📊 Загружаем аналитику...');

  const cacheKey = `ANALYTICS:${formatDate(dateFrom)}:${formatDate(dateTo)}`;
  const cache = new CacheManager();
  const cached = cache.get(cacheKey);
  if (cached) {
    Logger.log('🔷 КЭШ: аналитика за период');
    return cached;
  }

  const result = {};
  let offset = 0;
  const limit = PAGINATION.analyticsLimit;
  let hasMore = true;
  let totalRecords = 0;
  let requestDelay = 2000;

  try {
    while (hasMore) {
      const payload = {
        date_from: formatDate(dateFrom),
        date_to: formatDate(dateTo),
        metrics: [
          'hits_view',      // Показы
          'click',          // Клики по карточке
          'hits_tocart',    // Добавления в корзину
          'ordered_units',  // Заказы
          'revenue'         // Выручка
        ],
        dimension: ['sku', 'day'],
        limit,
        offset
      };

      const data = client.request('/v1/analytics/data', payload, { useCache: false, retries: 3 });
      const items = data.result?.data || [];

      if (items.length === 0) break;

      items.forEach(item => {
        const dimensions = item.dimensions || [];
        const metrics = item.metrics || [];
        const sku = dimensions[0]?.id;
        if (!sku) return;

        if (!result[sku]) {
          result[sku] = { sku: Number(sku), views: 0, clicks: 0, toCart: 0, orders: 0, revenue: 0, days: 0 };
        }

        result[sku].views += Number(metrics[0]) || 0;
        result[sku].clicks += Number(metrics[1]) || 0;
        result[sku].toCart += Number(metrics[2]) || 0;
        result[sku].orders += Number(metrics[3]) || 0;
        result[sku].revenue += Number(metrics[4]) || 0;
        result[sku].days++;
      });

      totalRecords += items.length;
      offset += limit;

      const totals = data.result?.totals || [];
      if (offset >= (totals[0] || 0)) hasMore = false;

      if (offset % 1000 === 0) {
        Logger.log(`  📄 Загружено ${totalRecords} записей...`);
      }

      sleep(requestDelay);
      requestDelay = Math.min(requestDelay + 500, 5000);
    }

    // Расчет конверсий
    Object.keys(result).forEach(sku => {
      const r = result[sku];
      r.ctr = r.views > 0 ? (r.clicks / r.views) * 100 : 0;
      r.cr1 = r.clicks > 0 ? (r.toCart / r.clicks) * 100 : 0;
      r.cr2 = r.toCart > 0 ? (r.orders / r.toCart) * 100 : 0;
      r.crTotal = r.views > 0 ? (r.orders / r.views) * 100 : 0;
    });

    Logger.log(`✅ Аналитика: ${Object.keys(result).length} товаров (${totalRecords} записей)`);

    try {
      const serialized = JSON.stringify(result);
      if (serialized.length < 80000) {
        cache.set(cacheKey, result, CACHE_TTL.analytics);
      }
    } catch (e) { /* ignore */ }

  } catch (e) {
    Logger.log(`⚠️ Ошибка аналитики: ${e.message}`);
  }

  return result;
}

// ============================================================
// 3.3 ЗАГРУЗКА РАСХОДОВ НА РЕКЛАМУ
// ============================================================

function fetchAdCosts(dateFrom, dateTo) {
  Logger.log('📊 Загружаем расходы на рекламу...');

  const keys = SecretsManager.getKeys(1);
  if (!keys.perfClientId || !keys.perfSecret) {
    Logger.log('⚠️ Нет ключей Performance API, пропускаем');
    return {};
  }

  const perfClient = new PerformanceClient(keys.perfClientId, keys.perfSecret);

  try {
    // Получаем расходы в CSV
    const expenseData = perfClient.getExpenseStats(null, dateFrom, dateTo);
    const lines = expenseData.split('\n');

    // Парсим CSV
    const expenses = {};
    let totalExpense = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(';');
      if (cols.length < 6) continue;

      const campaignId = cols[0];
      const expense = parseFloat(cols[3].replace(',', '.')) || 0;
      const bonusExpense = parseFloat(cols[4].replace(',', '.')) || 0;
      const accountExpense = parseFloat(cols[5].replace(',', '.')) || 0;
      const total = expense + bonusExpense + accountExpense;

      if (!expenses[campaignId]) {
        expenses[campaignId] = { total: 0, byDate: {} };
      }
      expenses[campaignId].total += total;
      expenses[campaignId].byDate[cols[1]] = total;
      totalExpense += total;
    }

    Logger.log(`✅ Расходы: ${Object.keys(expenses).length} кампаний, всего ${Math.round(totalExpense)} ₽`);

    // Для распределения по SKU нужны товары кампаний
    // Пока возвращаем пустой объект, так как распределение требует дополнительных запросов
    return {};

  } catch (e) {
    Logger.log(`⚠️ Ошибка рекламы: ${e.message}`);
    return {};
  }
}

// ============================================================
// 3.4 ЗАГРУЗКА ОСТАТКОВ ИЗ СПРАВОЧНИКА
// ============================================================

function fetchStocksFromReference() {
  Logger.log('📊 Загружаем остатки из справочника...');

  try {
    const stockBook = SpreadsheetApp.openById(COST_SPREADSHEET_ID);
    const sheet = stockBook.getSheetByName(COST_SHEET_NAME);
    if (!sheet) {
      Logger.log('⚠️ Лист unit расчет не найден');
      return {};
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return {};

    const range = sheet.getRange(2, 1, lastRow - 1, 30);
    const values = range.getValues();
    const stockMap = {};

    values.forEach(row => {
      const ozonArt = String(row[3] || '').trim();
      if (!ozonArt) return;

      if (!stockMap[ozonArt]) {
        stockMap[ozonArt] = {
          ozonScuId: Number(row[8]) || 0,
          fbw: 0,
          fbs: 0,
          total: 0,
          costPrice: 0,
          count: 0,
          totalCost: 0
        };
      }

      const d = stockMap[ozonArt];
      d.fbw += Number(row[25]) || 0;
      d.fbs += Number(row[28]) || 0;
      d.total += d.fbw + d.fbs;
      d.count++;
      const costPrice = Number(row[24]) || 0;
      if (costPrice > 0) {
        d.totalCost += costPrice;
        d.costPrice = d.totalCost / d.count;
      }
    });

    Logger.log(`✅ Остатки: ${Object.keys(stockMap).length} артикулов`);
    return stockMap;

  } catch (e) {
    Logger.log(`⚠️ Ошибка загрузки остатков: ${e.message}`);
    return {};
  }
}

// ============================================================
// 3.5 ЗАГРУЗКА ФИНАНСОВ
// ============================================================

function fetchFinance(client, dateFrom, dateTo, skuList) {
  Logger.log('📊 Загружаем финансы...');

  const cacheKey = `FINANCE:${formatDate(dateFrom)}:${formatDate(dateTo)}:${skuList.length}`;
  const cache = new CacheManager();
  const cached = cache.get(cacheKey);
  if (cached) {
    Logger.log('🔷 КЭШ: финансы за период');
    return cached;
  }

  const actualTo = new Date(dateTo);
  actualTo.setDate(actualTo.getDate() - 1);

  const result = {};
  let page = 1;
  let hasMore = true;
  let totalPages = 0;
  const skuSet = new Set(skuList.map(String));

  try {
    while (hasMore) {
      const data = client.request('/v3/finance/transaction/list', {
        filter: {
          date: {
            from: formatDateOzon(dateFrom, false),
            to: formatDateOzon(actualTo, true)
          }
        },
        page: page,
        page_size: PAGINATION.financePageSize
      }, { useCache: false, retries: 3 });

      const operations = data.result?.operations || [];
      if (operations.length === 0) break;

      totalPages = data.result?.page_count || 0;

      operations.forEach(op => {
        let opSku = null;
        (op.items || []).forEach(item => {
          if (item.sku && skuSet.has(String(item.sku))) {
            opSku = item.sku;
          }
        });
        if (!opSku) return;

        if (!result[opSku]) {
          result[opSku] = { sku: opSku, sales: 0, returns: 0, commission: 0, acquiring: 0, logistics: 0, storage: 0, penalty: 0, acceptance: 0, compensation: 0, otherDeductions: 0 };
        }

        const d = result[opSku];
        const amount = Number(op.amount) || 0;
        const type = op.type || '';
        const opType = (op.operation_type || '').toLowerCase();

        if (type === 'orders') {
          d.sales += Math.abs(amount);
        } else if (type === 'returns') {
          d.returns += Math.abs(amount);
        } else if (opType.includes('delivery') || opType.includes('logistic') || opType.includes('доставка')) {
          d.logistics += Math.abs(amount);
        } else if (opType.includes('commission') || opType.includes('вознаграждение')) {
          d.commission += Math.abs(amount);
        } else if (opType.includes('эквайринг') || opType.includes('acquiring')) {
          d.acquiring += Math.abs(amount);
        } else if (opType.includes('storage') || opType.includes('хранение')) {
          d.storage += Math.abs(amount);
        } else if (opType.includes('penalty') || opType.includes('штраф')) {
          d.penalty += Math.abs(amount);
        } else if (opType.includes('acceptance') || opType.includes('приемка')) {
          d.acceptance += Math.abs(amount);
        } else if (opType.includes('compensation') || opType.includes('компенсац')) {
          d.compensation += Math.abs(amount);
        } else {
          d.otherDeductions += Math.abs(amount);
        }
      });

      if (page >= totalPages) hasMore = false;
      page++;

      if (page % 10 === 0 || page === 1) {
        Logger.log(`  ✅ Страница ${page - 1} из ${totalPages}, найдено: ${Object.keys(result).length}`);
      }
    }

    Logger.log(`✅ Финансы: ${Object.keys(result).length} товаров (${totalPages} страниц)`);
    cache.set(cacheKey, result, CACHE_TTL.finance);

  } catch (e) {
    Logger.log(`⚠️ Ошибка финансов: ${e.message}`);
  }

  return result;
}

// ============================================================
// 3.6 ОБЪЕДИНЕНИЕ ДАННЫХ
// ============================================================

function mergeData(orders, stocks, finance, analytics) {
  Logger.log('📊 Объединяем данные...');

  const allSkus = new Set();
  Object.keys(orders).forEach(k => allSkus.add(Number(k)));
  Object.keys(finance || {}).forEach(k => allSkus.add(Number(k)));
  Object.keys(analytics || {}).forEach(k => allSkus.add(Number(k)));

  if (allSkus.size === 0) {
    Logger.log('⚠️ Нет данных для объединения');
    return [];
  }

  const result = [];

  allSkus.forEach(sku => {
    const order = orders[sku] || {};
    const stock = stocks[sku] || {};
    const fin = finance[sku] || {};
    const anal = (analytics || {})[sku] || {};

    const vendorCode = order.offerId || '';
    let costPrice = 0, fbw = 0, fbs = 0, totalStock = 0;

    // Ищем себестоимость по артикулу
    if (vendorCode && stocks[vendorCode]) {
      const s = stocks[vendorCode];
      costPrice = s.costPrice || 0;
      fbw = s.fbw || 0;
      fbs = s.fbs || 0;
      totalStock = s.total || 0;
    }

    if (costPrice === 0 && stocks[sku]) {
      const s = stocks[sku];
      costPrice = s.costPrice || 0;
      fbw = s.fbw || 0;
      fbs = s.fbs || 0;
      totalStock = s.total || 0;
    }

    const sales = fin.sales || 0;
    const returns = fin.returns || 0;
    const realization = sales - returns;
    const revenue = anal.revenue || 0;
    const discounts = revenue - sales;

    const views = anal.views || 0;
    const clicks = anal.clicks || 0;
    const toCart = anal.toCart || 0;
    const ordersCount = anal.orders || 0;

    const ctr = views > 0 ? (clicks / views) * 100 : 0;
    const cr1 = clicks > 0 ? (toCart / clicks) * 100 : 0;
    const cr2 = toCart > 0 ? (ordersCount / toCart) * 100 : 0;

    const totalQuantity = order.qty || 0;
    const shelfPrice = totalQuantity > 0 ? Math.round(realization / totalQuantity) : 0;

    const totalCommission = fin.commission + fin.acquiring || 0;
    const totalLogistics = fin.logistics || 0;
    const totalStorage = fin.storage || 0;
    const totalPenalty = fin.penalty || 0;
    const totalDeduction = fin.otherDeductions || 0;
    const totalAcceptance = fin.acceptance || 0;
    const totalCompensations = fin.compensation || 0;

    const adCost = 0; // TODO: из Performance API
    const drr = adCost > 0 && sales > 0 ? (adCost / sales) * 100 : 0;

    const totalCostPrice = costPrice * totalQuantity;

    const grossMargin = realization - totalCostPrice - totalCommission - totalLogistics -
      totalStorage - totalPenalty - totalDeduction - totalAcceptance - adCost + totalCompensations;

    const marginPercent = realization > 0 ? (grossMargin / realization) * 100 : 0;

    result.push({
      sku, vendorCode, ordersSum: order.sum || 0, adCost, drr,
      views, clicks, toCart, orders: ordersCount,
      ctr, cr1, cr2,
      fbw, fbs, totalStock,
      sales, revenue, realization, discounts,
      shelfPrice, totalQuantitySales: totalQuantity,
      totalCostPrice, totalLogistics, totalCommission,
      totalPenalty, totalStorage, totalDeduction,
      totalAcceptance, totalCompensations,
      grossMargin, marginPercent
    });
  });

  result.sort((a, b) => b.realization - a.realization);
  Logger.log(`✅ Объединено: ${result.length} товаров`);
  return result;
}

// ============================================================
// 3.7 ЗАПИСЬ В ТАБЛИЦУ
// ============================================================

function writeData(sheet, data) {
  if (!data || data.length === 0) {
    Logger.log('⚠️ Нет данных для записи');
    const lastRow = sheet.getLastRow();
    if (lastRow >= 5) sheet.deleteRows(5, lastRow - 4);
    return;
  }

  const tableData = data.map(item => [
    safeNum(item.sku),
    safeStr(item.vendorCode),
    Math.round(safeNum(item.ordersSum)),
    Math.round(safeNum(item.adCost)),
    safeNum(item.drr) > 0 ? Math.round(safeNum(item.drr)) + '%' : '0%',
    Math.round(safeNum(item.clicks)),
    Math.round(safeNum(item.toCart)),
    safeNum(item.cr1) > 0 ? Math.round(safeNum(item.cr1)) + '%' : '0%',
    Math.round(safeNum(item.fbw)),
    Math.round(safeNum(item.fbs)),
    Math.round(safeNum(item.totalStock)),
    Math.round(safeNum(item.shelfPrice)),
    Math.round(safeNum(item.sales)),
    Math.round(safeNum(item.realization)),
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
    Math.round(safeNum(item.marginPercent)) + '%'
  ]);

  const lastRow = sheet.getLastRow();
  if (lastRow >= 5) sheet.deleteRows(5, lastRow - 4);

  sheet.getRange(5, 1, tableData.length, tableData[0].length).setValues(tableData);
  Logger.log(`✅ Записано ${tableData.length} строк (26 столбцов)`);
}
