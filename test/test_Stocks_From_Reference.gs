// ============================================================
// testStocksFromReference - ПРОВЕРКА ОСТАТКОВ ИЗ СПРАВОЧНИКА
// ============================================================

function testStocksFromReference() {
  Logger.log('🧪 ===== ПРОВЕРКА ОСТАТКОВ ИЗ СПРАВОЧНИКА =====');
  
  try {
    var SPREADSHEET_ID = '1pP1RlNjgfxcDNw9Icwep0Pl3PyJikNIeQE6bMdCDD70';
    var SHEET_NAME = 'unit расчет';
    
    var stockBook = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = stockBook.getSheetByName(SHEET_NAME);
    if (!sheet) {
      Logger.log('❌ Лист unit расчет не найден');
      return;
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('❌ Нет данных');
      return;
    }
    
    // Берем данные из справочника
    var range = sheet.getRange(2, 1, lastRow - 1, 30);
    var values = range.getValues();
    
    // Артикулы для проверки (из таблицы)
    var targetArticles = ['21210689/9#1', '2020488/1#1', '2027505/9ПР#1', '21210423/9П#1', '20210145/9П#1'];
    
    Logger.log('📋 Проверяем артикулы: ' + targetArticles.join(', '));
    Logger.log('\n📊 РЕЗУЛЬТАТЫ ИЗ СПРАВОЧНИКА:');
    Logger.log('Артикул (АРТ_OZ) | OZON SCU ID | остаток FBW | остаток FBS | ИТОГО');
    Logger.log('----------------------------------------------------------------------');
    
    var found = {};
    
    values.forEach(function(row) {
      var ozonArt = String(row[3] || '').trim(); // столбец D - АРТ_OZ
      if (targetArticles.indexOf(ozonArt) === -1) return;
      
      var ozonScuId = Number(row[8]) || 0; // столбец I - OZON SCU ID
      var fbw = Number(row[25]) || 0; // столбец Z - остаток FBW
      var fbs = Number(row[28]) || 0; // столбец AC - FBS OZ
      
      // Агрегируем по артикулу (суммируем все размеры)
      if (!found[ozonArt]) {
        found[ozonArt] = {
          ozonScuId: ozonScuId,
          fbw: 0,
          fbs: 0,
          total: 0,
          count: 0
        };
      }
      found[ozonArt].fbw += fbw;
      found[ozonArt].fbs += fbs;
      found[ozonArt].total += (fbw + fbs);
      found[ozonArt].count++;
    });
    
    // Выводим результаты
    targetArticles.forEach(function(article) {
      var d = found[article];
      if (d) {
        Logger.log(article + ' | ' + d.ozonScuId + ' | ' + d.fbw + ' | ' + d.fbs + ' | ' + d.total + ' (размеров: ' + d.count + ')');
      } else {
        Logger.log(article + ' | ❌ НЕ НАЙДЕН');
      }
    });
    
    Logger.log('\n✅ Сравните с таблицей:');
    Logger.log('   Столбец I (FBO) = остаток FBW (столбец Z в справочнике)');
    Logger.log('   Столбец J (FBS) = FBS OZ (столбец AC в справочнике)');
    Logger.log('   Столбец K (Остаток всего) = сумма');
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
}
