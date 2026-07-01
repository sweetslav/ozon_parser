// ============================================================
// test_analytics_debug - ДИАГНОСТИКА СТРУКТУРЫ ОТВЕТА
// ============================================================

function test_analytics_debug() {
  Logger.log('🧪 ===== ДИАГНОСТИКА АНАЛИТИКИ =====');
  
  var props = PropertiesService.getScriptProperties();
  var client_id = props.getProperty('OZON_CLIENT_ID_1');
  var api_key = props.getProperty('OZON_API_KEY_1');
  
  if (!client_id || !api_key) {
    Logger.log('❌ Учетные данные не найдены');
    return;
  }
  
  var client = new AnalyticsDebugClient(client_id, api_key);
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ozon_adv_effectiveness');
  if (!sheet) {
    Logger.log('❌ Лист не найден');
    return;
  }
  
  var date_from = new Date(sheet.getRange('B2').getValue());
  var date_to = new Date(sheet.getRange('C2').getValue());
  
  Logger.log('📅 Период: ' + format_date_test(date_from) + ' - ' + format_date_test(date_to));
  
  // Отправляем запрос и смотрим ПОЛНЫЙ ответ
  var payload = {
    date_from: format_date_test(date_from),
    date_to: format_date_test(date_to),
    metrics: ['hits_view', 'hits_tocart', 'ordered_units', 'revenue'],
    dimension: ['sku', 'day'],
    limit: 5,  // Маленький лимит для диагностики
    offset: 0
  };
  
  try {
    var result = client.request('/v1/analytics/data', payload);
    
    // Логируем ВЕСЬ ответ (первые 2000 символов)
    var full_response = JSON.stringify(result, null, 2);
    Logger.log('\n📄 ПОЛНЫЙ ОТВЕТ (первые 2000 символов):');
    Logger.log(full_response.substring(0, 2000));
    
    // Проверяем структуру
    var data = result.result?.data || [];
    Logger.log('\n📊 Количество записей: ' + data.length);
    
    if (data.length > 0) {
      // Показываем структуру первой записи
      var first = data[0];
      Logger.log('\n📋 СТРУКТУРА ПЕРВОЙ ЗАПИСИ:');
      Logger.log('  Ключи: ' + Object.keys(first).join(', '));
      
      // Проверяем, где лежат метрики
      if (first.metrics) {
        Logger.log('  metrics: ' + JSON.stringify(first.metrics));
      }
      if (first.dimension_values) {
        Logger.log('  dimension_values: ' + JSON.stringify(first.dimension_values));
      }
      if (first.values) {
        Logger.log('  values: ' + JSON.stringify(first.values));
      }
      
      // Проверяем, есть ли sku
      var dims = first.dimension_values || first.dimensions || {};
      Logger.log('  sku: ' + (dims.sku || dims.nmId || 'НЕТ'));
    }
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
}

// ============================================================
// AnalyticsDebugClient - КЛИЕНТ ДЛЯ ДИАГНОСТИКИ
// ============================================================

class AnalyticsDebugClient {
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
