// ============================================================
// ФАЙЛ 01: БАЗОВЫЕ КЛАССЫ
// ============================================================
// Содержит: CacheManager, SecretsManager, Logger, Utilities
// ============================================================

// ============================================================
// 1.1 ХРАНИЛИЩЕ УЧЕТНЫХ ДАННЫХ
// ============================================================

class SecretsManager {
  static getKeys(cabinetId) {
    const props = PropertiesService.getScriptProperties();
    const config = cabinetId === 1 ? OZON_CABINETS.cab1 : OZON_CABINETS.cab2;
    return {
      clientId: props.getProperty(config.clientIdKey),
      apiKey: props.getProperty(config.apiKeyKey),
      perfClientId: props.getProperty(config.performanceClientIdKey),
      perfSecret: props.getProperty(config.performanceSecretKey)
    };
  }

  static setKeys(cabinetId, clientId, apiKey) {
    const props = PropertiesService.getScriptProperties();
    const config = cabinetId === 1 ? OZON_CABINETS.cab1 : OZON_CABINETS.cab2;
    props.setProperty(config.clientIdKey, clientId);
    props.setProperty(config.apiKeyKey, apiKey);
  }

  static setPerformanceKeys(cabinetId, perfClientId, perfSecret) {
    const props = PropertiesService.getScriptProperties();
    const config = cabinetId === 1 ? OZON_CABINETS.cab1 : OZON_CABINETS.cab2;
    props.setProperty(config.performanceClientIdKey, perfClientId);
    props.setProperty(config.performanceSecretKey, perfSecret);
  }

  static hasKeys(cabinetId) {
    const keys = this.getKeys(cabinetId);
    return !!(keys.clientId && keys.apiKey);
  }

  static hasPerformanceKeys(cabinetId) {
    const keys = this.getKeys(cabinetId);
    return !!(keys.perfClientId && keys.perfSecret);
  }
}

// ============================================================
// 1.2 КЭШ-МЕНЕДЖЕР
// ============================================================

class CacheManager {
  constructor(prefix = 'OZON') {
    this.cache = CacheService.getScriptCache();
    this.prefix = prefix;
  }

  /**
   * Генерирует ключ для кэша
   * @param {string} endpoint - название эндпоинта
   * @param {Object} params - параметры запроса
   * @returns {string} ключ кэша
   */
  key(endpoint, params) {
    try {
      const sorted = JSON.stringify(params, Object.keys(params).sort());
      const hash = this._hash(sorted);
      return `${this.prefix}:${endpoint}:${hash}`.substring(0, 250);
    } catch (e) {
      return `${this.prefix}:${endpoint}:${Date.now()}`;
    }
  }

  /** Внутренний хеш для коротких ключей */
  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Получить данные из кэша
   * @param {string} key - ключ
   * @returns {Object|null} данные или null
   */
  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    try { return JSON.parse(cached); } catch (e) { return null; }
  }

  /**
   * Сохранить данные в кэш
   * @param {string} key - ключ
   * @param {Object} data - данные
   * @param {number} ttl - время жизни в секундах
   */
  set(key, data, ttl) {
    try {
      const serialized = JSON.stringify(data);
      if (serialized.length > 90000) return; // лимит CacheService
      this.cache.put(key, serialized, ttl || 300);
    } catch (e) { /* игнорируем ошибки кэша */ }
  }
}

// ============================================================
// 1.3 ЛОГГЕР ДЛЯ ТАБЛИЦЫ
// ============================================================

class LoggerManager {
  constructor(sheet) {
    this.sheet = sheet;
  }

  /** Установить статус */
  status(text, color = '#FFF3CD') {
    try {
      this.sheet.getRange('A3').setValue(`🔄 ${text}`);
      this.sheet.getRange('A3').setBackground(color);
      SpreadsheetApp.flush();
    } catch (e) { /* ignore */ }
  }

  /** Обновить прогресс-бар */
  progress(step, total, text = '') {
    try {
      const percent = Math.round((step / total) * 100);
      const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
      this.sheet.getRange('B3').setValue(`${percent}% ${bar}`);
      if (text) {
        this.sheet.getRange('C3').setValue(text);
      }
      SpreadsheetApp.flush();
    } catch (e) { /* ignore */ }
  }

  /** Завершить успешно */
  finish(text, color = '#D4EDDA') {
    try {
      this.sheet.getRange('A3').setValue(`✅ ${text}`);
      this.sheet.getRange('A3').setBackground(color);
      this.sheet.getRange('B3').setValue('✅ Завершено');
      this.sheet.getRange('C3').setValue(new Date().toLocaleTimeString());
      SpreadsheetApp.flush();
    } catch (e) { /* ignore */ }
  }

  /** Завершить с ошибкой */
  error(text) {
    try {
      this.sheet.getRange('A3').setValue(`❌ ${text}`);
      this.sheet.getRange('A3').setBackground('#F8D7DA');
      SpreadsheetApp.flush();
    } catch (e) { /* ignore */ }
  }
}

// ============================================================
// 1.4 УТИЛИТЫ
// ============================================================

function formatDateOzon(date, endOfDay = false) {
  if (!date || isNaN(date.getTime())) return '';

  const d = new Date(date);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);

  const offset = 3;
  const offsetStr = `+${String(offset).padStart(2, '0')}:00`;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`;
}

function formatDate(date) {
  if (!date || isNaN(date.getTime())) return '';
  return formatDateOzon(date, false);
}

function safeNum(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function safeStr(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

function sleep(ms) {
  Utilities.sleep(ms);
}
