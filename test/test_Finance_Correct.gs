// ============================================================
// testFinanceCorrect - ТЕСТ ФИНАНСОВ С ПРАВИЛЬНЫМИ ПОЛЯМИ
// ============================================================

function testFinanceCorrect() {
  Logger.log('🧪 ===== ТЕСТ 3: ФИНАНСЫ (ПРАВИЛЬНЫЕ ПОЛЯ) =====');
  
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
  
  // Берем топ-3 артикула из таблицы
  var lastRow = sheet.getLastRow();
  var articles = [];
  for (var i = 5; i <= Math.min(7, lastRow); i++) {
    var val = String(sheet.getRange(i, 2).getValue() || '').trim();
    if (val) articles.push(val);
  }
  
  Logger.log('📋 Проверяем артикулы: ' + articles.join(', '));
  
  try {
    var allData = {};
    var page = 1;
    var hasMore = true;
    var totalOps = 0;
    
    // Для каждого артикула найдем SKU
    var skuMap = {};
    for (var i = 0; i < articles.length; i++) {
      // Пробуем найти SKU через product/list
      try {
        var prodData = client.request('/v3/product/list', {
          filter: { offer_id: [articles[i]] },
          limit: 1
        }, { useCache: true });
        
        var items = prodData.result?.items || [];
        if (items.length > 0 && items[0].sku) {
          skuMap[articles[i]] = items[0].sku;
          Logger.log('  Артикул ' + articles[i] + ' -> SKU: ' + items[0].sku);
        }
      } catch(e) {
        Logger.log('  ⚠️ Не удалось найти SKU для ' + articles[i]);
      }
    }
    
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
      totalOps += operations.length;
      
      if (operations.length === 0) break;
      
      operations.forEach(function(op) {
        var items = op.items || [];
        // Ищем SKU в items
        var sku = null;
        for (var j = 0; j < items.length; j++) {
          if (items[j].sku) {
            sku = items[j].sku;
            break;
          }
        }
        if (!sku) return;
        
        // Проверяем, есть ли этот sku в наших артикулах
        var foundArticle = null;
        for (var art in skuMap) {
          if (skuMap[art] === sku) {
            foundArticle = art;
            break;
          }
        }
        if (!foundArticle) return;
        
        if (!allData[foundArticle]) {
          allData[foundArticle] = {
            sales: 0,
            returns: 0,
            commission: 0,
            logistics: 0,
            storage: 0,
            penalty: 0,
            deduction: 0,
            acceptance: 0,
            amount: 0,
            quantity: 0,
            operationTypes: {}
          };
        }
        
        var d = allData[foundArticle];
        var amount = Number(op.amount) || 0;
        var type = op.type || '';
        var operationType = op.operation_type || '';
        var docType = op.doc_type || '';
        
        // Считаем количество операций по типам
        if (operationType) {
          d.operationTypes[operationType] = (d.operationTypes[operationType] || 0) + 1;
        }
        
        // Количество товара
        items.forEach(function(item) {
          if (item.quantity) {
            d.quantity += Number(item.quantity) || 0;
          }
        });
        
        // Анализируем amount и type
        if (type === 'orders') {
          d.sales += Math.abs(amount);
          d.amount += amount;
        } else if (type === 'returns') {
          d.returns += Math.abs(amount);
        } else if (type === 'services') {
          // В services могут быть комиссии, логистика и т.д.
          if (operationType && operationType.includes('Commission')) {
            d.commission += Math.abs(amount);
          } else if (operationType && operationType.includes('Delivery')) {
            d.logistics += Math.abs(amount);
          } else if (operationType && operationType.includes('Storage')) {
            d.storage += Math.abs(amount);
          } else if (operationType && operationType.includes('Penalty')) {
            d.penalty += Math.abs(amount);
          } else if (operationType && operationType.includes('Deduction')) {
            d.deduction += Math.abs(amount);
          } else if (operationType && operationType.includes('Acceptance')) {
            d.acceptance += Math.abs(amount);
          } else {
            // Если не распознали - добавляем в логистику как общие расходы
            if (amount < 0) {
              d.logistics += Math.abs(amount);
            }
          }
        }
      });
      
      var pageCount = data.result?.page_count || 0;
      if (page >= pageCount) hasMore = false;
      page++;
    }
    
    Logger.log('\n📊 РЕЗУЛЬТАТЫ ПО КАЖДОМУ АРТИКУЛУ:');
    Logger.log('Всего операций в ответе: ' + totalOps);
    
    articles.forEach(function(article) {
      var d = allData[article] || {};
      Logger.log('\n🔹 Артикул: ' + article + ' (SKU: ' + (skuMap[article] || 'неизвестен') + ')');
      Logger.log('   Продажи (sales): ' + Math.round(d.sales) + ' ₽');
      Logger.log('   Возвраты (returns): ' + Math.round(d.returns) + ' ₽');
      Logger.log('   Реализация (sales - returns): ' + Math.round(d.sales - d.returns) + ' ₽');
      Logger.log('   Кол-во продаж (quantity): ' + d.quantity);
      Logger.log('   Комиссия: ' + Math.round(d.commission) + ' ₽');
      Logger.log('   Логистика: ' + Math.round(d.logistics) + ' ₽');
      Logger.log('   Хранение: ' + Math.round(d.storage) + ' ₽');
      Logger.log('   Штрафы: ' + Math.round(d.penalty) + ' ₽');
      Logger.log('   Удержания: ' + Math.round(d.deduction) + ' ₽');
      Logger.log('   Приемка: ' + Math.round(d.acceptance) + ' ₽');
      
      if (Object.keys(d.operationTypes).length > 0) {
        Logger.log('   Типы операций:');
        var sorted = Object.keys(d.operationTypes).sort();
        sorted.forEach(function(key) {
          Logger.log('     ' + key + ': ' + d.operationTypes[key]);
        });
      }
    });
    
    Logger.log('\n⚠️ ВНИМАНИЕ:');
    Logger.log('   Для финансов используется:');
    Logger.log('   - amount с type="orders" = Продажи');
    Logger.log('   - amount с type="returns" = Возвраты');
    Logger.log('   - operation_type содержит "Commission" = Комиссия');
    Logger.log('   - operation_type содержит "Delivery" = Логистика');
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
}
