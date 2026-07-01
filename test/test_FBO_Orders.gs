// ============================================================
// ТЕСТ FBO ЗАКАЗОВ v1.1
// ============================================================

function testFBOOrders() {
  Logger.log('🧪 ===== ТЕСТ FBO ЗАКАЗОВ =====');
  
  // 1. Получаем учетные данные
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('OZON_CLIENT_ID_1');
  const apiKey = props.getProperty('OZON_API_KEY_1');
  
  if (!clientId || !apiKey) {
    Logger.log('❌ Учетные данные не найдены');
    return;
  }
  
  Logger.log(`✅ Client-ID: ${clientId}`);
  Logger.log(`✅ API-Key: ${apiKey.substring(0, 10)}...`);
  
  // 2. Создаем тестовый клиент
  const client = new TestOzonClient(clientId, apiKey);
  
  // 3. Тестируем разные форматы дат
  const testCases = [
    {
      name: 'Только дата (YYYY-MM-DD)',
      from: '2026-06-21',
      to: '2026-06-27'
    },
    {
      name: 'RFC3339 (наш формат)',
      from: formatDateOzonTest(new Date('2026-06-21'), false),
      to: formatDateOzonTest(new Date('2026-06-27'), true)
    },
    {
      name: 'RFC3339 с таймзоной',
      from: '2026-06-21T00:00:00+03:00',
      to: '2026-06-27T23:59:59+03:00'
    },
    {
      name: 'Только 1 день',
      from: '2026-06-27',
      to: '2026-06-27'
    },
    {
      name: 'RFC3339 1 день',
      from: formatDateOzonTest(new Date('2026-06-27'), false),
      to: formatDateOzonTest(new Date('2026-06-27'), true)
    }
  ];
  
  testCases.forEach((test, index) => {
    Logger.log(`\n📋 Тест ${index + 1}: ${test.name}`);
    Logger.log(`   from: ${test.from}`);
    Logger.log(`   to: ${test.to}`);
    
    try {
      const result = client.request('/v2/posting/fbo/list', {
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
      
      const postings = result.result || [];
      Logger.log(`  ✅ Успешно! Получено: ${postings.length} заказов`);
      
      if (postings.length > 0) {
        const first = postings[0];
        Logger.log(`  📦 Первый заказ: ${first.order_number || 'без номера'}`);
        Logger.log(`     Статус: ${first.status || 'неизвестен'}`);
        Logger.log(`     Товаров: ${(first.products || []).length}`);
        
        // Показываем SKU первого товара
        if (first.products && first.products.length > 0) {
          const product = first.products[0];
          Logger.log(`     SKU: ${product.sku || 'нет'}`);
          Logger.log(`     Название: ${(product.name || 'без названия').substring(0, 30)}`);
        }
      }
      
    } catch(e) {
      Logger.log(`  ❌ Ошибка: ${e.message}`);
    }
  });
  
  // 4. Дополнительный тест - с разными лимитами
  Logger.log('\n📋 Тест с разными лимитами');
  
  const limits = [1, 10, 50, 100];
  const workingFormat = testCases[1]; // RFC3339
  
  limits.forEach(limit => {
    try {
      Logger.log(`  Лимит: ${limit}`);
      const result = client.request('/v2/posting/fbo/list', {
        filter: {
          since: workingFormat.from,
          to: workingFormat.to
        },
        limit: limit,
        offset: 0
      }, { useCache: false, retries: 1 });
      
      const postings = result.result || [];
      Logger.log(`    ✅ Получено: ${postings.length} заказов`);
      
    } catch(e) {
      Logger.log(`    ❌ Ошибка: ${e.message}`);
    }
  });
  
  Logger.log('\n✅ ===== ТЕСТ ЗАВЕРШЕН =====');
}

// ============================================================
// ТЕСТОВЫЙ КЛИЕНТ (без конфликтов имен)
// ============================================================

class TestOzonClient {
  constructor(clientId, apiKey) {
    this.baseUrl = 'https://api-seller.ozon.ru';
    this.clientId = clientId;
    this.apiKey = apiKey;
  }
  
  request(endpoint, body = {}, options = {}) {
    const { retries = 3 } = options;
    let lastError = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const url = this.baseUrl + endpoint;
        const response = UrlFetchApp.fetch(url, {
          method: 'POST',
          headers: {
            'Client-Id': this.clientId,
            'Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(body),
          muteHttpExceptions: true
        });
        
        const code = response.getResponseCode();
        const content = response.getContentText();
        
        if (code === 429) {
          Logger.log(`  ⏳ Рейт-лимит, попытка ${attempt}/${retries}`);
          Utilities.sleep(2000 * attempt);
          continue;
        }
        
        if (code !== 200) {
          throw new Error(`HTTP ${code}: ${content}`);
        }
        
        return JSON.parse(content);
        
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          Utilities.sleep(1000 * attempt);
        }
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  }
}

// ============================================================
// ФОРМАТ ДАТЫ ДЛЯ OZON
// ============================================================

function formatDateOzonTest(date, endOfDay = false) {
  if (!date || isNaN(date.getTime())) return '';
  
  const d = new Date(date);
  
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}
