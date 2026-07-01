// ============================================================
// testAnalyticsFinal - ФИНАЛЬНЫЙ ТЕСТ АНАЛИТИКИ
// ============================================================

function testAnalyticsFinal() {
  Logger.log('🧪 ===== ТЕСТ АНАЛИТИКИ (ФИНАЛЬНЫЙ) =====');
  
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
  
  try {
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
        
        // Проверяем, есть ли этот sku в нашем списке
        if (skus.indexOf(sku) === -1) return;
        
        if (!allData[sku]) {
          allData[sku] = {
            sku: sku,
            article: '',
            hits_view: 0,
            hits_tocart: 0,
            ordered_units: 0,
            revenue: 0
          };
        }
        
        allData[sku].hits_view += Number(metrics[0]) || 0;
        allData[sku].hits_tocart += Number(metrics[1]) || 0;
        allData[sku].ordered_units += Number(metrics[2]) || 0;
        allData[sku].revenue += Number(metrics[3]) || 0;
      });
      
      offset += limit;
      var totals = data.result?.totals || [];
      if (offset >= (totals[0] || 0)) hasMore = false;
      
      if (offset % 1000 === 0) {
        Logger.log('  📄 Загружено ' + totalRecords + ' записей...');
      }
    }
    
    Logger.log('✅ Всего записей: ' + totalRecords);
    Logger.log('✅ Найдено SKU: ' + Object.keys(allData).length);
    
    Logger.log('\n📊 РЕЗУЛЬТАТЫ ПО КАЖДОМУ SKU:');
    Logger.log('SKU | Артикул | Клики | Корзина | CR1 | Заказы | Выручка');
    Logger.log('------------------------------------------------------------------');
    
    skus.forEach(function(sku) {
      var d = allData[sku] || {};
      var article = articles[skus.indexOf(sku)] || '';
      var cr1 = d.hits_view > 0 ? (d.hits_tocart / d.hits_view) * 100 : 0;
      
      Logger.log(sku + ' | ' + article + ' | ' + 
                 d.hits_view + ' | ' + d.hits_tocart + ' | ' + 
                 cr1.toFixed(1) + '% | ' + d.ordered_units + ' | ' + 
                 Math.round(d.revenue) + ' ₽');
    });
    
    Logger.log('\n✅ Сравните с таблицей:');
    Logger.log('   Столбец F (Клики) = hits_view');
    Logger.log('   Столбец G (Корзина) = hits_tocart');
    Logger.log('   Столбец H (CR1) = hits_tocart / hits_view * 100');
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
}
