// ============================================================
// ФАЙЛ 04: ТОЧКИ ВХОДА И UI
// ============================================================
// Содержит: главные функции запуска, меню, создание листов
// ============================================================

// ============================================================
// 4.1 ОСНОВНАЯ ФУНКЦИЯ ЗАПУСКА
// ============================================================

function runOzonCabinet(cabinetId) {
  const startTime = new Date();
  const config = cabinetId === 1 ? OZON_CABINETS.cab1 : OZON_CABINETS.cab2;

  Logger.log(`🚀 ===== СТАРТ: ${config.label} =====`);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.sheetName);
  if (!sheet) {
    Logger.log(`❌ Лист "${config.sheetName}" не найден`);
    return;
  }

  const logger = new LoggerManager(sheet);
  logger.status('Запуск...', '#FFF3CD');

  const keys = SecretsManager.getKeys(cabinetId);
  if (!keys.clientId || !keys.apiKey) {
    logger.error('Учетные данные не найдены!');
    return;
  }

  const client = new OzonClient(keys.clientId, keys.apiKey);

  let dateFrom, dateTo;
  try {
    dateFrom = new Date(sheet.getRange('B2').getValue());
    dateTo = new Date(sheet.getRange('C2').getValue());
    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      throw new Error('Неверный формат даты');
    }
    if (dateFrom > dateTo) {
      throw new Error('Дата "с" больше даты "по"');
    }
  } catch (e) {
    logger.error(`Ошибка в датах: ${e.message}`);
    return;
  }

  Logger.log(`📅 Период: ${formatDate(dateFrom)} - ${formatDate(dateTo)}`);

  const totalSteps = 6;
  let currentStep = 0;

  try {
    // Шаг 1: Заказы
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Загрузка заказов...');
    logger.status(`Заказы (${currentStep}/${totalSteps})`, '#FFF3CD');
    const orders = fetchOzonOrders(client, dateFrom, dateTo);

    // Шаг 2: Аналитика
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Загрузка аналитики...');
    logger.status(`Аналитика (${currentStep}/${totalSteps})`, '#FFF3CD');
    const analytics = fetchAnalytics(client, dateFrom, dateTo);

    // Шаг 3: Остатки
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Загрузка справочника...');
    logger.status(`Справочник (${currentStep}/${totalSteps})`, '#FFF3CD');
    const stockRef = fetchStocksFromReference();

    // Шаг 4: Финансы
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Загрузка финансов...');
    logger.status(`Финансы (${currentStep}/${totalSteps})`, '#FFF3CD');
    const allSkus = Object.keys(orders).map(Number);
    const finance = fetchFinance(client, dateFrom, dateTo, allSkus);

    // Шаг 5: Объединение
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Объединение...');
    logger.status(`Объединение (${currentStep}/${totalSteps})`, '#FFF3CD');
    const merged = mergeData(orders, stockRef, finance, analytics);

    // Шаг 6: Запись
    currentStep++;
    logger.progress(currentStep, totalSteps, 'Запись...');
    logger.status(`Запись (${currentStep}/${totalSteps})`, '#FFF3CD');
    writeData(sheet, merged);

    // Финиш
    const elapsed = Math.round((new Date() - startTime) / 1000);
    const totalItems = merged.length;
    const totalRealization = merged.reduce((sum, i) => sum + i.realization, 0);

    logger.finish(`Готово! ${totalItems} товаров, ${elapsed} сек`, '#D4EDDA');

    Logger.log(`✅ ===== ФИНИШ: ${config.label} (${elapsed} сек) =====`);
    Logger.log(`📊 Итог: ${totalItems} товаров, реализация ${Math.round(totalRealization)} ₽`);

  } catch (e) {
    logger.error(`Ошибка: ${e.message}`);
    Logger.log(`❌ Ошибка: ${e.message}`);
    Logger.log(e.stack);
  }
}

// ============================================================
// 4.2 ФУНКЦИИ ЗАПУСКА
// ============================================================

function ozonMain() { runOzonCabinet(1); }
function ozonMainCab2() { runOzonCabinet(2); }

function ozonMainAll() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ Внимание!',
    'Будут обновлены оба кабинета.\nМагазин "JULE" и "Ювелир Карат"\n\nЭто может занять до 10 минут.\n\nПродолжить?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    runOzonCabinet(1);
    runOzonCabinet(2);
    ui.alert('✅ Оба кабинета обновлены!');
  }
}

// ============================================================
// 4.3 МЕНЮ
// ============================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('📊 Ozon Отчеты');

  menu.addItem('📊 Создать лист для Ozon', 'createOzonSheet');
  menu.addSeparator();
  menu.addItem('🔑 Установить учетные данные', 'setOzonCredentials');
  menu.addSeparator();
  menu.addItem('🔄 Магазин "JULE"', 'ozonMain');
  menu.addItem('🔄 "Ювелир Карат"', 'ozonMainCab2');
  menu.addSeparator();
  menu.addItem('🔄 Обновить все', 'ozonMainAll');

  menu.addToUi();
}

// ============================================================
// 4.4 УСТАНОВКА УЧЕТНЫХ ДАННЫХ
// ============================================================

function setOzonCredentials() {
  const ui = SpreadsheetApp.getUi();

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 10px;">
      <h3>🔑 Выберите кабинет</h3>
      <p style="color: #666;">Для какого кабинета установить учетные данные?</p>
      <div style="margin: 15px 0;">
        <button onclick="select(1)" style="padding: 10px 20px; margin: 5px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
          🏪 Магазин "JULE"
        </button>
        <button onclick="select(2)" style="padding: 10px 20px; margin: 5px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
          🏪 "Ювелир Карат"
        </button>
      </div>
      <div style="margin-top: 15px; padding: 10px; background: #FFF3CD; border-radius: 4px;">
        <small>⚠️ Client-ID и API-Key в Настройки → Seller API</small>
      </div>
    </div>
    <script>
      function select(cabinet) {
        google.script.run.withSuccessHandler(function() {
          google.script.host.close();
        })._setOzonCredentials(cabinet);
      }
    </script>
  `;

  const dialog = HtmlService.createHtmlOutput(html)
    .setWidth(400)
    .setHeight(280);
  ui.showModalDialog(dialog, '🔑 Установка учетных данных');
}

function _setOzonCredentials(cabinetId) {
  const ui = SpreadsheetApp.getUi();
  const config = cabinetId === 1 ? OZON_CABINETS.cab1 : OZON_CABINETS.cab2;
  const cabinetLabel = config.label;

  const clientIdResponse = ui.prompt(
    `🔑 Client-ID для ${cabinetLabel}`,
    'Client-ID из Настройки → Seller API:\n\nВведите Client-ID:',
    ui.ButtonSet.OK_CANCEL
  );
  if (clientIdResponse.getSelectedButton() !== ui.Button.OK) return;
  const clientId = clientIdResponse.getResponseText().trim();

  if (clientId.length < 5) {
    ui.alert('❌ Client-ID слишком короткий.');
    return;
  }

  const apiKeyResponse = ui.prompt(
    `🔑 API-Key для ${cabinetLabel}`,
    '⚠️ Сохраните ключ сразу после генерации!\n\nВведите API-Key:',
    ui.ButtonSet.OK_CANCEL
  );
  if (apiKeyResponse.getSelectedButton() !== ui.Button.OK) return;
  const apiKey = apiKeyResponse.getResponseText().trim();

  if (apiKey.length < 20) {
    ui.alert('❌ API-Key слишком короткий.');
    return;
  }

  SecretsManager.setKeys(cabinetId, clientId, apiKey);

  ui.alert(`✅ Учетные данные для "${cabinetLabel}" сохранены!\n\n` +
    `Client-ID: ${clientId}\n` +
    `API-Key: ${apiKey.substring(0, 10)}...`);
}

// ============================================================
// 4.5 СОЗДАНИЕ ЛИСТА
// ============================================================

function createOzonSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const name = ui.prompt(
    '📊 Создать лист для Ozon',
    'Введите название нового листа:\n\n' +
    'Для первого кабинета: ozon_adv_effectiveness\n' +
    'Для второго: ozon_adv_effectiveness_2\n\n' +
    'Название:',
    ui.ButtonSet.OK_CANCEL
  );

  if (name.getSelectedButton() !== ui.Button.OK) return;
  const sheetName = name.getResponseText().trim();

  if (!sheetName) {
    ui.alert('❌ Название не может быть пустым.');
    return;
  }

  if (ss.getSheetByName(sheetName)) {
    ui.alert(`❌ Лист "${sheetName}" уже существует.`);
    return;
  }

  const sheet = ss.insertSheet(sheetName);

  // Заголовки
  sheet.getRange(4, 1, 1, TABLE_COLUMNS.length).setValues([TABLE_COLUMNS]);
  sheet.getRange(4, 1, 1, TABLE_COLUMNS.length).setBackground('#E8F4FD');
  sheet.getRange(4, 1, 1, TABLE_COLUMNS.length).setFontWeight('bold');

  // Даты
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  sheet.getRange('B2').setValue(monthAgo);
  sheet.getRange('C2').setValue(today);
  sheet.getRange('B2').setNumberFormat('dd.mm.yyyy');
  sheet.getRange('C2').setNumberFormat('dd.mm.yyyy');
  sheet.getRange('B1').setValue('📅 Дата с:');
  sheet.getRange('C1').setValue('📅 Дата по:');

  // Статус
  sheet.getRange('A3').setValue('🔄 Готов к работе');
  sheet.getRange('A3').setBackground('#FFF3CD');
  sheet.getRange('B3').setValue('0% ░░░░░░░░░░');
  sheet.getRange('C3').setValue('Ожидание запуска');

  sheet.autoResizeColumns(1, TABLE_COLUMNS.length);

  ui.alert(`✅ Лист "${sheetName}" создан!`);
}
