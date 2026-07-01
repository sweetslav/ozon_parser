// ============================================================
// testStocksWithOfferId - ОСТАТКИ С АРТИКУЛОМ
// ============================================================

function testStocksWithOfferId() {
  Logger.log('🧪 ===== ТЕСТ ОСТАТКОВ С АРТИКУЛОМ =====');
  
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
  
  // Берем один артикул из таблицы (столбец B)
  var lastRow = sheet.getLastRow();
  if (lastRow < 6) {
    Logger.log('❌ Нет данных в таблице');
    return;
  }
  
  var offerId = sheet.getRange(5, 2).getValue();
  Logger.log('📋 Проверяем артикул: ' + offerId);
  
  try {
    // Пробуем найти по offer_id
    var data = client.request('/v2/product/info/stocks-by-warehouse/fbs', {
      offer_id: [String(offerId)],
      limit: 10
    });
    
    Logger.log('\n📄 ПОЛНЫЙ ОТВЕТ:');
    Logger.log(JSON.stringify(data, null, 2));
    
    var products = data.products || [];
    if (products.length > 0) {
      var product = products[0];
      Logger.log('\n📋 ПОЛЯ В ОТВЕТЕ:');
      Logger.log('  ' + Object.keys(product).join(', '));
    }
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
  
  Logger.log('\n✅ ===== ТЕСТ ЗАВЕРШЕН =====');
}
