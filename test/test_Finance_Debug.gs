// ============================================================
// testFinanceDebug - ДИАГНОСТИКА FINANCE (С ПРАВИЛЬНЫМ SKU)
// ============================================================

function testFinanceDebug() {
  Logger.log('🧪 ===== ДИАГНОСТИКА FINANCE =====');
  
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
  
  // Берем SKU из таблицы (столбец A)
  var targetSku = Number(sheet.getRange(5, 1).getValue()) || 0;
  Logger.log('📋 SKU из таблицы (для поиска в финансах): ' + targetSku);
  
  // Берем артикул для справки
  var article = String(sheet.getRange(5, 2).getValue() || '').trim();
  Logger.log('📋 Артикул: ' + article);
  
  if (!targetSku || targetSku === 0) {
    Logger.log('❌ Нет SKU для поиска');
    return;
  }
  
  try {
    // 1. Проверим, что SKU существует в системе
    Logger.log('\n🔍 ШАГ 1: Проверяем SKU ' + targetSku + ' через /v3/product/info/list...');
    var prodData = client.request('/v3/product/info/list', {
      sku: [String(targetSku)]
    }, { useCache: true });
    
    var items = prodData.items || [];
    if (items.length > 0) {
      var item = items[0];
      Logger.log('  ✅ SKU найден:');
      Logger.log('    SKU: ' + item.sku);
      Logger.log('    offer_id: ' + item.offer_id);
      Logger.log('    product_id: ' + item.id);
      Logger.log('    name: ' + (item.name || '').substring(0, 50));
    } else {
      Logger.log('  ❌ SKU ' + targetSku + ' не найден в системе');
      Logger.log('  💡 Возможно, это product_id, а не sku');
      return;
    }
    
    // 2. Загружаем финансы для SKU
    Logger.log('\n🔍 ШАГ 2: Загружаем финансы для SKU ' + targetSku + '...');
    var allOperations = [];
    var page = 1;
    var hasMore = true;
    var totalPages = 0;
    var totalOps = 0;
    
    while (hasMore) {
      var data = client.request('/v3/finance/transaction/list', {
        filter: {
          date: {
            from: formatDateOzon(dateFrom, false),
            to: formatDateOzon(actualTo, true)
          }
        },
        page: page,
        page_size: 100
      }, { useCache: false });
      
      var operations = data.result?.operations || [];
      if (operations.length === 0) break;
      
      totalPages = data.result?.page_count || 0;
      totalOps += operations.length;
      
      // Ищем операции с нашим SKU
      operations.forEach(function(op) {
        var items = op.items || [];
        var found = false;
        for (var j = 0; j < items.length; j++) {
          if (items[j].sku === targetSku) {
            found = true;
            break;
          }
        }
        // Также проверяем product_id в операции
        if (!found && op.product_id === targetSku) {
          found = true;
        }
        if (found) {
          allOperations.push(op);
        }
      });
      
      if (page >= totalPages) hasMore = false;
      page++;
      
      // Логируем прогресс
      if (page % 10 === 0 || page === 1) {
        Logger.log('  📄 Страница ' + (page - 1) + '/' + totalPages + ', всего операций: ' + totalOps + ', найдено: ' + allOperations.length);
      }
    }
    
    Logger.log('  ✅ Всего найдено операций для SKU: ' + allOperations.length + ' из ' + totalOps);
    
    // 3. Анализируем найденные операции
    if (allOperations.length > 0) {
      Logger.log('\n📄 ПЕРВАЯ ОПЕРАЦИЯ (для SKU ' + targetSku + '):');
      var op = allOperations[0];
      Logger.log('  Ключи в операции: ' + Object.keys(op).join(', '));
      
      if (op.items && op.items.length > 0) {
        var item = op.items[0];
        Logger.log('\n  ПОЛЯ В items[0]:');
        Object.keys(item).forEach(function(key) {
          var val = item[key];
          if (typeof val === 'object') val = JSON.stringify(val);
          Logger.log('    ' + key + ': ' + val);
        });
      }
      
      // 4. Собираем статистику по типам операций
      Logger.log('\n📊 СТАТИСТИКА ПО ТИПАМ ОПЕРАЦИЙ:');
      var typeStats = {};
      var opTypeStats = {};
      var amountByType = {};
      
      allOperations.forEach(function(op) {
        var type = op.type || 'unknown';
        typeStats[type] = (typeStats[type] || 0) + 1;
        
        var opType = op.operation_type || 'unknown';
        opTypeStats[opType] = (opTypeStats[opType] || 0) + 1;
        
        var amount = Number(op.amount) || 0;
        amountByType[type] = (amountByType[type] || 0) + amount;
      });
      
      Logger.log('  type:');
      Object.keys(typeStats).forEach(function(key) {
        Logger.log('    ' + key + ': ' + typeStats[key] + ' | сумма: ' + Math.round(amountByType[key] || 0) + ' ₽');
      });
      
      Logger.log('  operation_type:');
      var opTypeKeys = Object.keys(opTypeStats).sort();
      opTypeKeys.forEach(function(key) {
        Logger.log('    ' + key + ': ' + opTypeStats[key]);
      });
      
      // 5. Итоговые суммы
      Logger.log('\n📊 ИТОГОВЫЕ СУММЫ:');
      var totalSales = 0;
      var totalReturns = 0;
      var totalServices = 0;
      var totalOther = 0;
      
      allOperations.forEach(function(op) {
        var type = op.type || 'unknown';
        var amount = Number(op.amount) || 0;
        if (type === 'orders') totalSales += Math.abs(amount);
        else if (type === 'returns') totalReturns += Math.abs(amount);
        else if (type === 'services') totalServices += Math.abs(amount);
        else totalOther += Math.abs(amount);
      });
      
      Logger.log('  Продажи (orders): ' + Math.round(totalSales) + ' ₽');
      Logger.log('  Возвраты (returns): ' + Math.round(totalReturns) + ' ₽');
      Logger.log('  Услуги (services): ' + Math.round(totalServices) + ' ₽');
      Logger.log('  Прочее: ' + Math.round(totalOther) + ' ₽');
      
      // 6. Сохраняем результат для проверки с таблицей
      Logger.log('\n📋 ДЛЯ СРАВНЕНИЯ С ТАБЛИЦЕЙ:');
      Logger.log('  SKU: ' + targetSku);
      Logger.log('  Артикул: ' + article);
      Logger.log('  Продажи: ' + Math.round(totalSales) + ' ₽');
      Logger.log('  Реализация (sales - returns): ' + Math.round(totalSales - totalReturns) + ' ₽');
      
    } else {
      Logger.log('❌ Нет операций для этого SKU');
      Logger.log('\n💡 Возможные причины:');
      Logger.log('  1. За период не было продаж этого товара');
      Logger.log('  2. SKU в таблице не соответствует реальному SKU');
      Logger.log('  3. Финансы привязаны к другому идентификатору');
    }
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
    Logger.log(e.stack);
  }
  
  Logger.log('\n✅ ===== ДИАГНОСТИКА ЗАВЕРШЕНА =====');
}
