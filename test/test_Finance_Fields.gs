// ============================================================
// testFinanceFields - ПОИСК ПРАВИЛЬНЫХ ПОЛЕЙ В FINANCE
// ============================================================

function testFinanceFields() {
  Logger.log('🧪 ===== ПОИСК ПОЛЕЙ В FINANCE =====');
  
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
  
  try {
    // Загружаем первые 10 операций
    var data = client.request('/v3/finance/transaction/list', {
      filter: {
        date: {
          from: formatDateOzon(dateFrom, false),
          to: formatDateOzon(actualTo, true)
        }
      },
      page: 1,
      page_size: 10
    }, { useCache: false });
    
    var operations = data.result?.operations || [];
    
    if (operations.length === 0) {
      Logger.log('❌ Нет операций');
      return;
    }
    
    Logger.log('\n📄 ПЕРВАЯ ОПЕРАЦИЯ (полный JSON):');
    Logger.log(JSON.stringify(operations[0], null, 2));
    
    Logger.log('\n📋 ПОЛНАЯ СТРУКТУРА ОПЕРАЦИИ:');
    var op = operations[0];
    Logger.log('  Ключи: ' + Object.keys(op).join(', '));
    
    if (op.items && op.items.length > 0) {
      var item = op.items[0];
      Logger.log('\n📋 ПОЛНАЯ СТРУКТУРА items[0]:');
      Logger.log('  Ключи: ' + Object.keys(item).join(', '));
      
      Logger.log('\n📋 ЗНАЧЕНИЯ ПОЛЕЙ items[0]:');
      Object.keys(item).forEach(function(key) {
        var val = item[key];
        if (typeof val === 'object') val = JSON.stringify(val);
        Logger.log('  ' + key + ': ' + val);
      });
    }
    
    // Проверяем наличие нужных полей
    Logger.log('\n🔍 ПОИСК НУЖНЫХ ПОЛЕЙ:');
    var foundRetailPrice = false;
    var foundRetailAmount = false;
    var foundQuantity = false;
    
    operations.forEach(function(op) {
      (op.items || []).forEach(function(item) {
        if (item.retail_price !== undefined) foundRetailPrice = true;
        if (item.retail_amount !== undefined) foundRetailAmount = true;
        if (item.quantity !== undefined) foundQuantity = true;
      });
    });
    
    Logger.log('  retail_price: ' + (foundRetailPrice ? '✅ ЕСТЬ' : '❌ НЕТ'));
    Logger.log('  retail_amount: ' + (foundRetailAmount ? '✅ ЕСТЬ' : '❌ НЕТ'));
    Logger.log('  quantity: ' + (foundQuantity ? '✅ ЕСТЬ' : '❌ НЕТ'));
    
    // Если полей нет, показываем все доступные поля с числами
    Logger.log('\n📊 ВСЕ ЧИСЛОВЫЕ ПОЛЯ В items:');
    var numericFields = {};
    operations.forEach(function(op) {
      (op.items || []).forEach(function(item) {
        Object.keys(item).forEach(function(key) {
          var val = item[key];
          if (typeof val === 'number' || !isNaN(Number(val))) {
            if (!numericFields[key]) numericFields[key] = 0;
            numericFields[key] += Number(val) || 0;
          }
        });
      });
    });
    
    Object.keys(numericFields).forEach(function(key) {
      Logger.log('  ' + key + ': ' + Math.round(numericFields[key]));
    });
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
  
  Logger.log('\n✅ ===== ДИАГНОСТИКА ЗАВЕРШЕНА =====');
}
