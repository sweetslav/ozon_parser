// ============================================================
// testStocksCompare - СРАВНЕНИЕ ОСТАТКОВ ПО АРТИКУЛУ
// ============================================================

function testStocksCompare() {
  Logger.log('🧪 ===== СРАВНЕНИЕ ОСТАТКОВ ПО АРТИКУЛУ =====');
  
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
  
  // Берем первые 5 артикулов из таблицы (столбец B)
  var lastRow = sheet.getLastRow();
  var offerIds = [];
  for (var i = 5; i <= Math.min(9, lastRow); i++) {
    var val = sheet.getRange(i, 2).getValue();
    if (val) offerIds.push(String(val));
  }
  
  Logger.log('📋 Проверяем артикулы: ' + offerIds.join(', '));
  
  try {
    // Пробуем найти по offer_id
    var data = client.request('/v2/product/info/stocks-by-warehouse/fbs', {
      offer_id: offerIds,
      limit: 10
    });
    
    var products = data.products || [];
    
    Logger.log('\n📊 РЕЗУЛЬТАТЫ:');
    Logger.log('Артикул | FBO | FBS | ИТОГО');
    Logger.log('----------------------------------------');
    
    products.forEach(function(product) {
      Logger.log(product.offer_id + ' | ' + 
                 (product.present || 0) + ' | ' + 
                 (product.reserved || 0) + ' | ' + 
                 ((product.present || 0) + (product.reserved || 0)));
    });
    
    Logger.log('\n⚠️ Примечание:');
    Logger.log('   present = доступно к продаже');
    Logger.log('   reserved = зарезервировано');
    Logger.log('   ИТОГО = present + reserved');
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
  
  Logger.log('\n✅ ===== ТЕСТ ЗАВЕРШЕН =====');
}
