// ============================================================
// testCostPriceByArticle - ТЕСТ СЕБЕСТОИМОСТИ ПО АРТИКУЛУ
// ============================================================

function testCostPriceByArticle() {
  Logger.log('🧪 ===== ТЕСТ 2: СЕБЕСТОИМОСТЬ (ПО АРТИКУЛУ OZ) =====');
  
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
    
    // Берем данные
    var range = sheet.getRange(2, 1, lastRow - 1, 29);
    var values = range.getValues();
    
    // Создаем карту артикул -> себестоимость
    var costMap = {};
    values.forEach(function(row) {
      var ozonArt = String(row[3] || '').trim(); // столбец D - АРТ_OZ
      var costPrice = Number(row[24]) || 0; // столбец Y - себест100
      var ozonScuId = Number(row[8]) || 0; // столбец I - OZON SCU ID
      
      if (ozonArt && costPrice > 0) {
        // Если артикул уже есть, берем среднюю
        if (costMap[ozonArt]) {
          costMap[ozonArt].totalCost += costPrice;
          costMap[ozonArt].count++;
          costMap[ozonArt].avgCost = costMap[ozonArt].totalCost / costMap[ozonArt].count;
        } else {
          costMap[ozonArt] = {
            costPrice: costPrice,
            totalCost: costPrice,
            count: 1,
            avgCost: costPrice,
            ozonScuId: ozonScuId
          };
        }
      }
    });
    
    Logger.log('📊 Загружено артикулов в справочнике: ' + Object.keys(costMap).length);
    
    // Проверяем конкретный артикул из таблицы
    var sheetMain = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ozon_adv_effectiveness');
    if (!sheetMain) {
      Logger.log('❌ Лист ozon_adv_effectiveness не найден');
      return;
    }
    
    var lastRowMain = sheetMain.getLastRow();
    if (lastRowMain < 6) {
      Logger.log('❌ Нет данных в таблице');
      return;
    }
    
    Logger.log('\n🔍 Проверяем ТОП-5 артикулов из таблицы:');
    Logger.log('Артикул (из таблицы) | Себестоимость (из справочника) | OZON SCU ID');
    Logger.log('----------------------------------------------------------------------');
    
    var foundCount = 0;
    for (var i = 5; i <= Math.min(9, lastRowMain); i++) {
      var article = String(sheetMain.getRange(i, 2).getValue() || '').trim();
      if (!article) continue;
      
      var costInfo = costMap[article];
      if (costInfo) {
        Logger.log(article + ' | ' + Math.round(costInfo.avgCost) + ' ₽ | ' + costInfo.ozonScuId);
        foundCount++;
      } else {
        Logger.log(article + ' | ❌ НЕ НАЙДЕН | -');
      }
    }
    
    Logger.log('\n✅ Найдено: ' + foundCount + ' из 5 артикулов');
    Logger.log('\n💡 Сопоставление:');
    Logger.log('   Артикул из таблицы (столбец B) = АРТ_OZ (столбец D)');
    Logger.log('   Себестоимость = столбец Y (себест100)');
    Logger.log('   При наличии нескольких размеров берется средняя');
    
  } catch(e) {
    Logger.log('❌ Ошибка: ' + e.message);
  }
}
