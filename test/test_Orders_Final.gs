// ============================================================
// testOrdersFinal - ФИНАЛЬНЫЙ ТЕСТ ЗАКАЗОВ
// ============================================================

function testOrdersFinal() {
  Logger.log('🧪 ===== ТЕСТ ЗАКАЗОВ (ФИНАЛЬНЫЙ) =====');
  
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
  var actualTo = new Date(dateTo);
  actualTo.setDate(actualTo.getDate() - 1);
  
  Logger.log('📅 Период: ' + formatDate(dateFrom) + ' - ' + formatDate(actualTo));
  
  // Берем ТОП-3 артикула
  var lastRow = sheet.getLastRow();
  var articles = [];
  for (var i = 5; i <= Math.min(7, lastRow); i++) {
    var val = String(sheet.getRange(i, 2).getValue() || '').trim();
    if (val) articles.push(val);
  }
  
  Logger.log('📋 Проверяем артикулы: ' + articles.join(', '));
  
  var orders = {};
  
  // FBS заказы
  try {
    Logger.log('\n📦 Загружаем FBS заказы...');
    var since = formatDateOzon(dateFrom, false);
    var to = formatDateOzon(actualTo, true);
    var offset = 0;
    var hasMore = true;
    var totalFbs = 0;
    
    while (hasMore) {
      var fbsData = client.request('/v3/posting/fbs/list', {
        filter: { since: since, to: to },
        limit: 100,
        offset: offset,
        with: { analytics_data: true, financial_data: true }
      }, { useCache: false });
      
      var postings = fbsData.result?.postings || [];
      totalFbs += postings.length;
      
      if (postings.length === 0) break;
      
      postings.forEach(function(posting) {
        if (posting.status === 'cancelled') return;
        (posting.products || []).forEach(function(product) {
          var sku = product.sku;
          var offerId = product.offer_id || '';
          if (articles.indexOf(offerId) === -1) return;
          
          if (!orders[offerId]) {
            orders[offerId] = { sum: 0, count: 0, fbs: 0, fbo: 0 };
          }
          if (product.price && product.price.amount) {
            orders[offerId].sum += Number(product.price.amount) * (product.quantity || 0);
          }
          orders[offerId].count++;
          orders[offerId].fbs++;
        });
      });
      
      hasMore = fbsData.result?.has_next || false;
      offset += 100;
    }
    
    Logger.log('  ✅ FBS: ' + totalFbs + ' заказов');
  } catch(e) {
    Logger.log('  ⚠️ FBS ошибка: ' + e.message);
  }
  
  // FBO заказы
  try {
    Logger.log('\n📦 Загружаем FBO заказы...');
    var since = formatDateOzon(dateFrom, false);
    var to = formatDateOzon(actualTo, true);
    var offset = 0;
    var hasMore = true;
    var totalFbo = 0;
    
    while (hasMore) {
      var fboData = client.request('/v2/posting/fbo/list', {
        filter: { since: since, to: to },
        limit: 100,
        offset: offset,
        with: { analytics_data: true, financial_data: true }
      }, { useCache: false });
      
      var postings = fboData.result || [];
      totalFbo += postings.length;
      
      if (postings.length === 0) break;
      
      postings.forEach(function(posting) {
        if (posting.status === 'cancelled') return;
        (posting.products || []).forEach(function(product) {
          var sku = product.sku;
          var offerId = product.offer_id || '';
          if (articles.indexOf(offerId) === -1) return;
          
          if (!orders[offerId]) {
            orders[offerId] = { sum: 0, count: 0, fbs: 0, fbo: 0 };
          }
          if (product.price) {
            orders[offerId].sum += Number(product.price) * (product.quantity || 0);
          }
          orders[offerId].count++;
          orders[offerId].fbo++;
        });
      });
      
      if (postings.length < 100) hasMore = false;
      else offset += 100;
    }
    
    Logger.log('  ✅ FBO: ' + totalFbo + ' заказов');
  } catch(e) {
    Logger.log('  ⚠️ FBO ошибка: ' + e.message);
  }
  
  Logger.log('\n📊 РЕЗУЛЬТАТЫ ПО КАЖДОМУ АРТИКУЛУ:');
  Logger.log('Артикул | Сумма заказов | Кол-во заказов | FBS | FBO');
  Logger.log('------------------------------------------------------------------');
  
  articles.forEach(function(article) {
    var d = orders[article] || {};
    Logger.log(article + ' | ' + Math.round(d.sum) + ' ₽ | ' + 
               d.count + ' | ' + d.fbs + ' | ' + d.fbo);
  });
  
  Logger.log('\n✅ Сравните с таблицей:');
  Logger.log('   Столбец C (Заказы сумма) = sum');
  Logger.log('   Столбец I (FBO) = fbo');
  Logger.log('   Столбец J (FBS) = fbs');
}
