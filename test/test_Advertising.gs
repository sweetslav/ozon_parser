// ============================================================
// testAdvertising - ТЕСТ РЕКЛАМЫ OZON
// ============================================================

function testAdvertising() {
  Logger.log('🧪 ===== ТЕСТ РЕКЛАМЫ =====');
  
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('OZON_CLIENT_ID_1');
  var apiKey = props.getProperty('OZON_API_KEY_1');
  
  if (!clientId || !apiKey) {
    Logger.log('❌ Учетные данные не найдены');
    return;
  }
  
  var client = new AdvertTestClient(clientId, apiKey);
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ozon_adv_effectiveness');
  if (!sheet) {
    Logger.log('❌ Лист не найден');
    return;
  }
  
  var dateFrom = new Date(sheet.getRange('B2').getValue());
  var dateTo = new Date(sheet.getRange('C2').getValue());
  
  Logger.log('📅 Период: ' + dateFrom.toISOString().split('T')[0] + ' - ' + dateTo.toISOString().split('T')[0]);
  
  // 1. Получаем список акций (GET)
  testActions(client);
  
  // 2. Получаем расходы по акциям
  testActionCosts(client);
}

// ============================================================
// testActions - ПОЛУЧЕНИЕ СПИСКА АКЦИЙ
// ============================================================

function testActions(client) {
  Logger.log('\n📋 ПОЛУЧЕНИЕ СПИСКА АКЦИЙ:');
  
  try {
    var result = client.get('/v1/actions');
    var actions = result.result || [];
    
    Logger.log('  ✅ Найдено акций: ' + actions.length);
    
    var active = actions.filter(function(a) { 
      return a.is_participating === true;
    });
    
    Logger.log('  📊 Активных акций: ' + active.length);
    
    active.slice(0, 5).forEach(function(action, index) {
      Logger.log('    ' + (index + 1) + '. ' + action.title + 
                 ' (ID: ' + action.id + ', тип: ' + action.action_type + ')');
    });
    
  } catch(e) {
    Logger.log('  ❌ Ошибка: ' + e.message);
  }
}

// ============================================================
// testActionCosts - РАСХОДЫ ПО АКЦИЯМ
// ============================================================

function testActionCosts(client) {
  Logger.log('\n📋 РАСХОДЫ ПО АКЦИЯМ:');
  
  try {
    var result = client.get('/v1/actions');
    var actions = result.result || [];
    var participating = actions.filter(function(a) { 
      return a.is_participating === true;
    });
    
    Logger.log('  📊 Участвуем в ' + participating.length + ' акциях');
    
    var totalCost = 0;
    var productsWithAd = {};
    
    participating.forEach(function(action) {
      try {
        var productsResult = client.post('/v1/actions/products', {
          action_id: action.id,
          limit: 100
        });
        
        var products = productsResult.result?.products || [];
        
        products.forEach(function(product) {
          var productId = product.id;
          var actionPrice = product.action_price || 0;
          var price = product.price || 0;
          var discount = price - actionPrice;
          
          if (discount > 0 && productId) {
            if (!productsWithAd[productId]) {
              productsWithAd[productId] = 0;
            }
            productsWithAd[productId] += discount;
            totalCost += discount;
          }
        });
        
        if (products.length > 0) {
          Logger.log('    Акция "' + action.title + '": ' + products.length + ' товаров');
        }
        
      } catch(e) {
        Logger.log('    ⚠️ Ошибка акции ' + action.id + ': ' + e.message);
      }
    });
    
    Logger.log('  💰 Общий расход по акциям: ' + Math.round(totalCost) + ' ₽');
    Logger.log('  📦 Товаров с рекламой: ' + Object.keys(productsWithAd).length);
    
  } catch(e) {
    Logger.log('  ❌ Ошибка: ' + e.message);
  }
}

// ============================================================
// AdvertTestClient - ТЕСТОВЫЙ КЛИЕНТ
// ============================================================

class AdvertTestClient {
  constructor(clientId, apiKey) {
    this.baseUrl = 'https://api-seller.ozon.ru';
    this.clientId = clientId;
    this.apiKey = apiKey;
  }
  
  get(endpoint) {
    var url = this.baseUrl + endpoint;
    var response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'Client-Id': this.clientId,
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    var code = response.getResponseCode();
    var content = response.getContentText();
    
    if (code !== 200) {
      throw new Error('HTTP ' + code + ': ' + content.substring(0, 200));
    }
    
    return JSON.parse(content);
  }
  
  post(endpoint, body) {
    var url = this.baseUrl + endpoint;
    var response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Client-Id': this.clientId,
        'Api-Key': this.apiKey,
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
