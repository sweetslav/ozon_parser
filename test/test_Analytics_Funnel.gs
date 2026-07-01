// ============================================================
// testAnalyticsFunnel - ТЕСТ ВОРОНКИ ПРОДАЖ
// ============================================================

function testAnalyticsFunnel() {
  Logger.log('🧪 ===== ТЕСТ ВОРОНКИ ПРОДАЖ =====');
  
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('OZON_CLIENT_ID_1');
  var apiKey = props.getProperty('OZON_API_KEY_1');
  
  if (!clientId || !apiKey) {
    Logger.log('❌ Учетные данные не найдены');
    return;
  }
  
  var client = new TestOzonClient(clientId, apiKey);
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ozon_adv_effectiveness');
  if (!sheet) {
    Logger.log('❌ Лист не найден');
    return;
  }
  
  var dateFrom = new Date(sheet.getRange('B2').getValue());
  var dateTo = new Date(sheet.getRange('C2').getValue());
  
  Logger.log('📅 Период: ' + formatDate(dateFrom) + ' - ' + formatDate(dateTo));
  
  // Берем ТОП-5 артикулов из таблицы
  var lastRow = sheet.getLastRow();
  var articles = [];
  var skus = [];
  for (var i = 5; i <= Math.min(9, lastRow); i++) {
    var sku = Number(sheet.getRange(i, 1).getValue());
    var article = String(sheet.getRange(i, 2).getValue() || '').trim();
    if (sku > 0 && article) {
      skus.push(sku);
      articles.push(article);
    }
  }
  
  Logger.log('📋 Проверяем SKU: ' + skus.join(', '));
  Logger.log('📋 Артикулы: ' + articles.join(', '));
  
  // 1. Загружаем аналитику для этих SKU
  Logger.log('\n📊 ЗАГРУЗКА АНАЛИТИКИ:');
  
  var allData = {};
  var offset = 0;
  var limit = 500;
  var hasMore = true;
  var totalRecords = 0;
  
  while (hasMore) {
    var data = client.request('/v1/analytics/data', {
      date_from: formatDate(dateFrom),
      date_to: formatDate(dateTo),
      metrics: ['hits_view', 'hits_tocart', 'ordered_units', 'revenue'],
      dimension: ['sku', 'day'],
      limit: limit,
      offset: offset
    }, { useCache: false });
    
    var items = data.result?.data || [];
    totalRecords += items.length;
    
    if (items.length === 0) break;
    
    items.forEach(function(item) {
      var dimensions = item.dimensions || [];
      var metrics = item.metrics || [];
      var sku = Number(dimensions[0]?.id);
      
      if (skus.indexOf(sku) === -1) return;
      
      if (!allData[sku]) {
        allData[sku] = {
          sku: sku,
          article: '',
          hits_view: 0,      // Показы
          hits_tocart: 0,    // Переходы в карточку
          ordered_units: 0,  // Заказы
          revenue: 0,        // Выручка
          days: 0
        };
      }
      
      allData[sku].hits_view += Number(metrics[0]) || 0;
      allData[sku].hits_tocart += Number(metrics[1]) || 0;
      allData[sku].ordered_units += Number(metrics[2]) || 0;
      allData[sku].revenue += Number(metrics[3]) || 0;
      allData[sku].days++;
    });
    
    offset += limit;
    if (items.length < limit) hasMore = false;
    
    if (offset % 1000 === 0) {
      Logger.log('  📄 Загружено ' + totalRecords + ' записей...');
    }
  }
  
  Logger.log('✅ Всего записей: ' + totalRecords);
  Logger.log('✅ Найдено SKU: ' + Object.keys(allData).length);
  
  // 2. Формируем отчет по воронке
  Logger.log('\n📊 ВОРОНКА ПРОДАЖ (по каждому товару):');
  Logger.log('-----------------------------------------------------------------------------------------------------------------');
  Logger.log('Артикул | Показы | Переходы | CTR% | Корзина | CR1% | Заказы | CR2% | Выручка');
  Logger.log('-----------------------------------------------------------------------------------------------------------------');
  
  skus.forEach(function(sku) {
    var d = allData[sku] || {};
    var article = articles[skus.indexOf(sku)] || '';
    
    var ctr = d.hits_view > 0 ? (d.hits_tocart / d.hits_view) * 100 : 0;
    var cr1 = d.hits_tocart > 0 ? (d.ordered_units / d.hits_tocart) * 100 : 0;
    
    Logger.log(
      article.substring(0, 15) + ' | ' +
      d.hits_view + ' | ' +
      d.hits_tocart + ' | ' +
      ctr.toFixed(1) + '% | ' +
      d.ordered_units + ' | ' +
      cr1.toFixed(1) + '% | ' +
      Math.round(d.revenue) + ' ₽'
    );
  });
  
  // 3. ИТОГОВАЯ ВОРОНКА (по всем товарам)
  Logger.log('\n📊 ИТОГОВАЯ ВОРОНКА (суммарно по всем товарам):');
  
  var totalViews = 0;
  var totalClicks = 0;
  var totalOrders = 0;
  var totalRevenue = 0;
  
  skus.forEach(function(sku) {
    var d = allData[sku] || {};
    totalViews += d.hits_view || 0;
    totalClicks += d.hits_tocart || 0;
    totalOrders += d.ordered_units || 0;
    totalRevenue += d.revenue || 0;
  });
  
  var ctrTotal = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
  var cr1Total = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0;
  
  Logger.log('  Показы (hits_view): ' + totalViews);
  Logger.log('  Переходы в карточку (hits_tocart): ' + totalClicks);
  Logger.log('  CTR (переходы / показы): ' + ctrTotal.toFixed(1) + '%');
  Logger.log('  Заказы (ordered_units): ' + totalOrders);
  Logger.log('  Конверсия из карточки в заказ (CR1): ' + cr1Total.toFixed(1) + '%');
  Logger.log('  Выручка (revenue): ' + Math.round(totalRevenue) + ' ₽');
  
  // 4. Сопоставление с данными из таблицы
  Logger.log('\n📋 СРАВНЕНИЕ С ТАБЛИЦЕЙ:');
  Logger.log('  Столбец F (Клики) = hits_tocart (переходы в карточку)');
  Logger.log('  Столбец G (Корзина) = НЕТ В АНАЛИТИКЕ (это добавления в корзину, отдельная метрика)');
  Logger.log('  Столбец H (CR1) = Конверсия из карточки в заказ (ordered_units / hits_tocart)');
  Logger.log('');
  Logger.log('⚠️ ВНИМАНИЕ:');
  Logger.log('  В Ozon API НЕТ прямой метрики "добавления в корзину"');
  Logger.log('  Ближайшая: hits_tocart — переходы в карточку товара');
  Logger.log('  Рекомендую использовать:');
  Logger.log('    - Клики (F) = hits_tocart (переходы в карточку)');
  Logger.log('    - CR1 (H) = ordered_units / hits_tocart * 100 (конверсия в заказ)');
  
  Logger.log('\n✅ ===== ТЕСТ ЗАВЕРШЕН =====');
}
