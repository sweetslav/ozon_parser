// ============================================================
// test_analytics - ТЕСТ АНАЛИТИКИ OZON
// ============================================================

function test_analytics() {
  Logger.log('🧪 ===== ТЕСТ АНАЛИТИКИ =====');
  
  // Получаем учетные данные
  var props = PropertiesService.getScriptProperties();
  var client_id = props.getProperty('OZON_CLIENT_ID_1');
  var api_key = props.getProperty('OZON_API_KEY_1');
  
  if (!client_id || !api_key) {
    Logger.log('❌ Учетные данные не найдены');
    return;
  }
  
  var client = new AnalyticsTestClient(client_id, api_key);
  
  // Получаем даты ИЗ ТАБЛИЦЫ (БЕЗ КОРРЕКТИРОВКИ)
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ozon_adv_effectiveness');
  if (!sheet) {
    Logger.log('❌ Лист не найден');
    return;
  }
  
  var date_from_raw = sheet.getRange('B2').getValue();
  var date_to_raw = sheet.getRange('C2').getValue();
  
  var date_from = new Date(date_from_raw);
  var date_to = new Date(date_to_raw);
  
  Logger.log('📅 Период (из таблицы): ' + format_date_test(date_from) + ' - ' + format_date_test(date_to));
  
  // 1. Тестируем аналитику
  test_analytics_request(client, date_from, date_to);
}

// ============================================================
// test_analytics_request - ЗАПРОС К АНАЛИТИКЕ
// ============================================================

function test_analytics_request(client, date_from, date_to) {
  Logger.log('\n📋 ЗАПРОС АНАЛИТИКИ:');
  
  var payload = {
    date_from: format_date_test(date_from),
    date_to: format_date_test(date_to),
    metrics: [
      'hits_view',           // Показы
      'hits_tocart',         // В корзину
      'ordered_units',       // Заказано
      'revenue'              // Выручка
    ],
    dimension: ['sku', 'day'],
    limit: 100,
    offset: 0
  };
  
  Logger.log('  date_from: ' + payload.date_from);
  Logger.log('  date_to: ' + payload.date_to);
  
  try {
    var result = client.request('/v1/analytics/data', payload);
    
    // Анализируем ответ
    var data = result.result?.data || [];
    var totals = result.result?.totals || [];
    
    Logger.log('  ✅ Получено записей: ' + data.length);
    Logger.log('  📊 Итоги: показы=' + totals[0] + ', корзина=' + totals[1] + 
               ', заказы=' + totals[2] + ', выручка=' + totals[3]);
    
    // Считаем НЕ нулевые записи
    var non_zero = data.filter(function(item) {
      return (item.metrics?.hits_view || 0) > 0 || 
             (item.metrics?.hits_tocart || 0) > 0 ||
             (item.metrics?.ordered_units || 0) > 0;
    });
    
    Logger.log('  📊 Ненулевых записей: ' + non_zero.length);
    
    if (non_zero.length > 0) {
      Logger.log('\n  📋 Первые 3 ненулевые записи:');
      non_zero.slice(0, 3).forEach(function(item, index) {
        var dims = item.dimension_values || {};
        var metrics = item.metrics || {};
        Logger.log('    ' + (index + 1) + '. SKU: ' + (dims.sku || 'нет'));
        Logger.log('       Показы: ' + (metrics.hits_view || 0));
        Logger.log('       В корзину: ' + (metrics.hits_tocart || 0));
        Logger.log('       Заказано: ' + (metrics.ordered_units || 0));
        Logger.log('       Выручка: ' + (metrics.revenue || 0));
      });
    } else {
      Logger.log('  ⚠️ Нет данных с ненулевыми показателями');
    }
    
  } catch(e) {
    Logger.log('  ❌ Ошибка: ' + e.message);
  }
}

// ============================================================
// AnalyticsTestClient - ТЕСТОВЫЙ КЛИЕНТ
// ============================================================

class AnalyticsTestClient {
  constructor(client_id, api_key) {
    this.base_url = 'https://api-seller.ozon.ru';
    this.client_id = client_id;
    this.api_key = api_key;
  }
  
  request(endpoint, body) {
    var url = this.base_url + endpoint;
    var response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Client-Id': this.client_id,
        'Api-Key': this.api_key,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    
    var code = response.getResponseCode();
    var content = response.getContentText();
    
    if (code !== 200) {
      throw new Error('HTTP ' + code + ': ' + content.substring(0, 200));
    }
    
    return JSON.parse(content);
  }
}

// ============================================================
// format_date_test - ФОРМАТ ДАТЫ
// ============================================================

function format_date_test(date) {
  if (!date || isNaN(date.getTime())) return '';
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
