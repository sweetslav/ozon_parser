// ============================================================
// testStocksStructure - ДИАГНОСТИКА СТРУКТУРЫ ОТВЕТА
// ============================================================

function testStocksStructure() {
  Logger.log('🧪 ===== ДИАГНОСТИКА СТРУКТУРЫ ОСТАТКОВ =====');
  
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('OZON_CLIENT_ID_1');
  var apiKey = props.getProperty('OZON_API_KEY_1');
  
  if (!clientId || !apiKey) {
    Logger.log('❌ Учетные данные не найдены');
    return;
  }
  
  var client = new TestOzonClient(clientId, apiKey);
  
  // Берем один SKU из таблицы для теста
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ozon_adv_effectiveness');
  if (!sheet) {
    Logger.log('❌ Лист не найден');
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 6) {
    Logger.log('❌ Нет данных в таблице');
    return;
  }
  
  // Берем первый SKU из таблицы
  var sku = Number(sheet.getRange(5, 1).getValue());
  Logger.log('📋 Проверяем SKU: ' + sku);
  
  try {
    var data = client.request('/v4/product/info/stocks', {
      filter: { sku: [String(sku)] },
      limit: 10
    });
    
    Logger.log('\n📄 ПОЛНЫЙ ОТВЕТ:');
    Logger.log(JSON.stringify(data, null, 2));
    
    // Проверяем, есть ли offer_id в ответе
    var items = data.items || [];
    if (items.length > 0) {
      var item = items[0];
      Logger.log('\n📋 КЛЮЧИ В ОТВЕТЕ:');
      Logger.log('  ' + Object.keys(item).join(', '));
      
      if (item.offer_id) {
        Logger.log('  ✅ offer_id: ' + item.offer_id);
      } else {
        Logger.log('  ❌ offer_id НЕТ в ответе');
      }
      
      // Проверяем stocks
      if (item.stocks && item.stocks.length > 0) {
        Logger.log('\n📋 КЛЮЧИ В stocks:');
        Logger.log('  ' + Object.keys(item.stocks[0]).join(', '));
      }
    }
    
    // Проверяем, какие еще поля есть
    Logger.log('\n📋 ВСЕ ПОЛЯ В ОТВЕТЕ:');
    Logger.log('  ' + Object.keys(data).join(', '));
    
    if (data.items) {
      Logger.log('  items: ' + data.items.length + ' записей');
    }
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
  
  Logger.log('\n✅ ===== ДИАГНОСТИКА ЗАВЕРШЕНА =====');
}
