// ============================================================
// ДИАГНОСТИКА ЗАКАЗОВ OZON v1.0
// ============================================================

function test_orders_diagnostic() {
  Logger.log('🧪 ===== ДИАГНОСТИКА ЗАКАЗОВ =====');
  
  // 1. Получаем учетные данные
  const props = PropertiesService.getScriptProperties();
  const client_id = props.getProperty('OZON_CLIENT_ID_1');
  const api_key = props.getProperty('OZON_API_KEY_1');
  
  if (!client_id || !api_key) {
    Logger.log('❌ Учетные данные не найдены');
    return;
  }
  
  const client = new DiagnosticClient(client_id, api_key);
  
  // 2. Тестируем разные форматы дат для FBS
  Logger.log('\n📋 ТЕСТ FBS ЗАКАЗЫ:');
  
  const test_cases = [
    {
      name: 'RFC3339 с +03:00 (наш формат)',
      from: '2026-06-27T00:00:00+03:00',
      to: '2026-06-27T23:59:59+03:00'
    },
    {
      name: 'RFC3339 с Z (UTC)',
      from: '2026-06-27T00:00:00Z',
      to: '2026-06-27T23:59:59Z'
    },
    {
      name: 'Простой ISO (без времени)',
      from: '2026-06-27',
      to: '2026-06-27'
    },
    {
      name: 'RFC3339 с +03:00 (несколько дней)',
      from: '2026-06-25T00:00:00+03:00',
      to: '2026-06-27T23:59:59+03:00'
    },
    {
      name: 'RFC3339 с +03:00 (полный период)',
      from: '2026-06-21T00:00:00+03:00',
      to: '2026-06-27T23:59:59+03:00'
    }
  ];
  
  test_cases.forEach(function(test, index) {
    Logger.log('\n  Тест ' + (index + 1) + ': ' + test.name);
    Logger.log('    from: ' + test.from);
    Logger.log('    to: ' + test.to);
    
    try {
      var result = client.request('/v3/posting/fbs/list', {
        filter: {
          since: test.from,
          to: test.to
        },
        limit: 10,
        offset: 0,
        with: {
          analytics_data: true,
          financial_data: true
        }
      }, { useCache: false, retries: 1 });
      
      var postings = result.result?.postings || [];
      var active = postings.filter(function(p) { return p.status !== 'cancelled'; });
      
      Logger.log('    ✅ Получено: ' + postings.length + ' заказов, активных: ' + active.length);
      
      if (active.length > 0) {
        var first = active[0];
        Logger.log('    📦 Первый активный: ' + (first.order_number || 'без номера'));
        Logger.log('       Статус: ' + first.status);
        if (first.products && first.products.length > 0) {
          var p = first.products[0];
          Logger.log('       SKU: ' + p.sku + ', offer_id: ' + (p.offer_id || 'нет'));
        }
      }
      
    } catch(e) {
      Logger.log('    ❌ Ошибка: ' + e.message);
    }
  });
  
  // 3. Тестируем FBO
  Logger.log('\n📋 ТЕСТ FBO ЗАКАЗЫ:');
  
  var fbo_test = {
    from: '2026-06-27T00:00:00+03:00',
    to: '2026-06-27T23:59:59+03:00'
  };
  
  Logger.log('  from: ' + fbo_test.from);
  Logger.log('  to: ' + fbo_test.to);
  
  try {
    var result = client.request('/v2/posting/fbo/list', {
      filter: {
        since: fbo_test.from,
        to: fbo_test.to
      },
      limit: 10,
      offset: 0,
      with: {
        analytics_data: true,
        financial_data: true
      }
    }, { useCache: false, retries: 1 });
    
    var postings = result.result || [];
    var active = postings.filter(function(p) { return p.status !== 'cancelled'; });
    
    Logger.log('  ✅ Получено: ' + postings.length + ' заказов, активных: ' + active.length);
    
    if (active.length > 0) {
      var first = active[0];
      Logger.log('  📦 Первый активный: ' + (first.order_number || 'без номера'));
      Logger.log('     Статус: ' + first.status);
      if (first.products && first.products.length > 0) {
        var p = first.products[0];
        Logger.log('     SKU: ' + p.sku + ', offer_id: ' + (p.offer_id || 'нет'));
      }
    }
    
  } catch(e) {
    Logger.log('  ❌ Ошибка: ' + e.message);
  }
  
  // 4. Проверяем, есть ли заказы вообще за период
  Logger.log('\n📋 ПРОВЕРКА: есть ли заказы в принципе?');
  
  try {
    var result = client.request('/v3/posting/fbs/list', {
      filter: {
        statuses: ['awaiting_packaging', 'awaiting_deliver', 'delivering', 'delivered']
      },
      limit: 10,
      offset: 0
    }, { useCache: false, retries: 1 });
    
    var postings = result.result?.postings || [];
    Logger.log('  📦 Заказов без фильтра по дате: ' + postings.length);
    
    if (postings.length > 0) {
      Logger.log('  📋 Примеры статусов:');
      var statuses = {};
      postings.forEach(function(p) {
        var s = p.status || 'unknown';
        statuses[s] = (statuses[s] || 0) + 1;
      });
      Object.keys(statuses).forEach(function(s) {
        Logger.log('     ' + s + ': ' + statuses[s]);
      });
    }
    
  } catch(e) {
    Logger.log('  ❌ Ошибка: ' + e.message);
  }
  
  Logger.log('\n✅ ===== ДИАГНОСТИКА ЗАВЕРШЕНА =====');
}

// ============================================================
// ДИАГНОСТИЧЕСКИЙ КЛИЕНТ (без конфликтов имен)
// ============================================================

class DiagnosticClient {
  constructor(client_id, api_key) {
    this.base_url = 'https://api-seller.ozon.ru';
    this.client_id = client_id;
    this.api_key = api_key;
  }
  
  request(endpoint, body, options) {
    var retries = (options && options.retries) || 3;
    var last_error = null;
    
    for (var attempt = 1; attempt <= retries; attempt++) {
      try {
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
        
        if (code === 429) {
          Logger.log('  ⏳ Рейт-лимит, попытка ' + attempt + '/' + retries);
          Utilities.sleep(2000 * attempt);
          continue;
        }
        
        if (code !== 200) {
          throw new Error('HTTP ' + code + ': ' + content);
        }
        
        return JSON.parse(content);
        
      } catch (error) {
        last_error = error;
        if (attempt < retries) {
          Utilities.sleep(1000 * attempt);
        }
      }
    }
    
    throw last_error || new Error('Max retries exceeded');
  }
}
