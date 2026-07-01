// ============================================================
// testStocksCorrect - ПРОВЕРКА ОСТАТКОВ (ПРАВИЛЬНЫЙ)
// ============================================================

function testStocksCorrect() {
  Logger.log('🧪 ===== ПРОВЕРКА ОСТАТКОВ =====');
  
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
  
  // Берем ТОП-5 артикулов
  var lastRow = sheet.getLastRow();
  var articles = [];
  for (var i = 5; i <= Math.min(9, lastRow); i++) {
    var val = String(sheet.getRange(i, 2).getValue() || '').trim();
    if (val) articles.push(val);
  }
  
  Logger.log('📋 Проверяем артикулы: ' + articles.join(', '));
  
  try {
    // Ищем остатки по артикулам
    var data = client.request('/v2/product/info/stocks-by-warehouse/fbs', {
      offer_id: articles,
      limit: 10
    }, { useCache: true });
    
    var products = data.products || [];
    
    Logger.log('\n📊 РЕЗУЛЬТАТЫ:');
    Logger.log('Артикул | FBO (FBW) | FBS | ИТОГО');
    Logger.log('----------------------------------------');
    
    products.forEach(function(product) {
      Logger.log(product.offer_id + ' | ' + 
                 (product.present || 0) + ' | ' + 
                 (product.reserved || 0) + ' | ' + 
                 ((product.present || 0) + (product.reserved || 0)));
    });
    
    Logger.log('\n✅ Сравните с таблицей:');
    Logger.log('   Столбец I = FBO (FBW) → present (остаток на складе Ozon)');
    Logger.log('   Столбец J = FBS → reserved (остаток на своём складе)');
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
}
