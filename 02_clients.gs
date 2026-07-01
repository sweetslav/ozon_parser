// ============================================================
// ФАЙЛ 02: API КЛИЕНТЫ
// ============================================================
// Содержит: OzonClient (Seller API) и PerformanceClient
// ============================================================

// ============================================================
// 2.1 OZON SELLER API КЛИЕНТ
// ============================================================

class OzonClient {
  constructor(clientId, apiKey) {
    this.baseUrl = API_CONFIG.seller.baseUrl;
    this.clientId = clientId;
    this.apiKey = apiKey;
    this.cache = new CacheManager('SELLER');
    this.lastRequestTime = 0;
    this.rateLimit = API_CONFIG.seller.rateLimit;
    this.maxRetries = API_CONFIG.seller.maxRetries;
  }

  /**
   * Основной метод запроса к API
   * @param {string} endpoint - путь эндпоинта
   * @param {Object} body - тело запроса
   * @param {Object} options - опции (useCache, retries, logSize)
   * @returns {Object} ответ API
   */
  request(endpoint, body = {}, options = {}) {
    const { useCache = true, retries = this.maxRetries, logSize = false } = options;
    const cacheKey = this.cache.key(endpoint, body);

    // Проверка кэша
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        Logger.log(`🔷 КЭШ: ${endpoint}`);
        return cached;
      }
    }

    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this._throttle();

        const response = UrlFetchApp.fetch(this.baseUrl + endpoint, {
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

        if (logSize && attempt === 1) {
          Logger.log(`📏 Размер ответа: ${Math.round(content.length / 1024)} KB`);
        }

        // Rate limiting
        if (code === 429) {
          const waitTime = 2000 * Math.pow(2, attempt);
          Logger.log(`⏳ Рейт-лимит, ждём ${waitTime}ms`);
          sleep(waitTime);
          continue;
        }

        if (code !== 200) {
          throw new Error(`HTTP ${code}: ${content.substring(0, 200)}`);
        }

        const data = JSON.parse(content);

        if (useCache && data) {
          this.cache.set(cacheKey, data, CACHE_TTL.analytics);
        }

        return data;

      } catch (error) {
        lastError = error;
        Logger.log(`❌ Ошибка (${attempt}/${retries}): ${error.message}`);
        if (attempt < retries) {
          sleep(1000 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /** Rate limiting */
  _throttle() {
    const now = Date.now();
    const minInterval = 1000 / this.rateLimit;
    const elapsed = now - this.lastRequestTime;
    if (elapsed < minInterval) {
      sleep(minInterval - elapsed);
    }
    this.lastRequestTime = Date.now();
  }
}

// ============================================================
// 2.2 OZON PERFORMANCE API КЛИЕНТ
// ============================================================

class PerformanceClient {
  constructor(perfClientId, perfSecret) {
    this.clientId = perfClientId;
    this.secret = perfSecret;
    this.baseUrl = API_CONFIG.performance.baseUrl;
    this.accessToken = null;
    this.tokenExpires = 0;
    this.cache = new CacheManager('PERF');
  }

  /** Форматирование даты для Performance API */
  _formatDate(date) {
    if (!date) return '';
    if (typeof date === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
      date = new Date(date);
    }
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return Utilities.formatDate(date, 'Europe/Moscow', 'yyyy-MM-dd');
  }

  /** Получение токена */
  getToken() {
    const now = Date.now() / 1000;
    if (this.accessToken && this.tokenExpires > now + 60) {
      return this.accessToken;
    }

    try {
      const response = UrlFetchApp.fetch(this.baseUrl + API_CONFIG.performance.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        payload: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.secret,
          grant_type: 'client_credentials'
        }),
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        throw new Error(`Token error: ${response.getContentText()}`);
      }

      const data = JSON.parse(response.getContentText());
      this.accessToken = data.access_token;
      this.tokenExpires = now + data.expires_in;

      Logger.log(`🔑 Performance токен получен, действует ${data.expires_in} сек`);
      return this.accessToken;

    } catch (e) {
      Logger.log(`❌ Ошибка получения токена Performance API: ${e.message}`);
      throw e;
    }
  }

  /** Универсальный запрос */
  request(endpoint, method = 'GET', body = null, useCache = true) {
    const token = this.getToken();
    const url = this.baseUrl + endpoint;
    const cacheKey = `PERF:${endpoint}:${JSON.stringify(body)}`;

    if (useCache && method === 'GET') {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        Logger.log(`🔷 КЭШ Performance: ${endpoint}`);
        return cached;
      }
    }

    try {
      const options = {
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        muteHttpExceptions: true
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        options.payload = JSON.stringify(body);
      }

      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();

      if (code === 429) {
        sleep(2000);
        return this.request(endpoint, method, body, useCache);
      }

      if (code !== 200) {
        throw new Error(`HTTP ${code}: ${response.getContentText()}`);
      }

      const data = JSON.parse(response.getContentText());

      if (useCache && method === 'GET') {
        this.cache.set(cacheKey, data, CACHE_TTL.campaigns);
      }

      return data;

    } catch (e) {
      Logger.log(`❌ Ошибка Performance API (${endpoint}): ${e.message}`);
      throw e;
    }
  }

  /** Получение списка кампаний */
  getCampaigns(page = 1, pageSize = 50) {
    const endpoint = `${API_CONFIG.performance.campaignsEndpoint}?page=${page}&pageSize=${pageSize}`;
    return this.request(endpoint, 'GET', null, true);
  }

  /** Получение расходов по кампаниям (возвращает CSV) */
  getExpenseStats(campaignIds, dateFrom, dateTo) {
    const fromStr = this._formatDate(dateFrom);
    const toStr = this._formatDate(dateTo);

    let endpoint = API_CONFIG.performance.statsExpenseEndpoint;
    const params = [];
    if (campaignIds && campaignIds.length) {
      campaignIds.forEach(id => params.push(`campaignIds=${id}`));
    }
    if (fromStr) params.push(`dateFrom=${fromStr}`);
    if (toStr) params.push(`dateTo=${toStr}`);
    if (params.length) endpoint += '?' + params.join('&');

    return this.request(endpoint, 'GET', null, false);
  }
}
