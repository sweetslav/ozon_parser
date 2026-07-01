// ============================================================
// ТЕСТ FBS ЗАКАЗОВ v1.0
// ============================================================

function testFBSOrders() {
  Logger.log('🧪 ===== ТЕСТ FBS ЗАКАЗОВ =====');
  
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('OZON_CLIENT_ID_1');
  const apiKey = props.getProperty('OZON_API_KEY_1');
  
  if (!clientId || !apiKey) {
    Logger.log('❌ Учетные данные не найдены');
    return;
  }
  
  const client = new TestOzonClient(clientId, apiKey);
  
  // Используем формат с таймзоной
  const from = '2026-06-21T00:00:00+03:00';
  const to = '2026-06-27T23:59:59+03:00';
  
  Logger.log(`📅 Период: ${from} - ${to}`);
  
  try {
    const result = client.request('/v3/posting/fbs/list', {
      filter: {
        since: from,
        to: to
      },
      limit: 50,
      offset: 0,
      with: {
        analytics_data: true,
        financial_data: true
      }
    }, { useCache: false, retries: 2 });
    
    const postings = result.result?.postings || [];
    Logger.log(`✅ Получено FBS заказов: ${postings.length}`);
    
    // Считаем по статусам
    const statuses = {};
    postings.forEach(p => {
      const status = p.status || 'unknown';
      statuses[status] = (statuses[status] || 0) + 1;
    });
    
    Logger.log('📊 Статистика по статусам:');
    Object.keys(statuses).forEach(s => {
      Logger.log(`  ${s}: ${statuses[s]}`);
    });
    
    // Показываем первые 5 активных заказов
    const active = postings.filter(p => p.status !== 'cancelled');
    Logger.log(`\n📦 Активных заказов: ${active.length}`);
    
    if (active.length > 0) {
      active.slice(0, 5).forEach((p, i) => {
        Logger.log(`  ${i + 1}. ${p.order_number || 'без номера'} | статус: ${p.status}`);
        if (p.products && p.products.length > 0) {
          const prod = p.products[0];
          Logger.log(`     SKU: ${prod.sku} | ${(prod.name || '').substring(0, 30)}`);
        }
      });
    }
    
  } catch(e) {
    Logger.log(`❌ Ошибка: ${e.message}`);
  }
  
  Logger.log('\n✅ ===== ТЕСТ ЗАВЕРШЕН =====');
}
