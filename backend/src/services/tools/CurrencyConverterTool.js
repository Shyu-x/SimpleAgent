/**
 * 货币转换工具
 * 支持多种法定货币和加密货币转换
 */

class CurrencyConverterTool {
  constructor(options = {}) {
    this.name = 'currency_converter';
    this.description = '货币转换 - 法定货币和加密货币实时转换';
    this.category = 'finance';
    this.timeout = options.timeout || 15000;

    // 静态汇率（备用）
    this.staticRates = {
      USD: 1,
      CNY: 7.24,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 149.50,
      KRW: 1330,
      HKD: 7.82,
      TWD: 31.50,
      SGD: 1.34,
      AUD: 1.53,
      CAD: 1.36,
      CHF: 0.88,
      INR: 83.12,
      BTC: 0.000016,
      ETH: 0.00032
    };
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: '要转换的金额'
        },
        from: {
          type: 'string',
          description: '源货币代码 (如: USD, CNY, BTC)'
        },
        to: {
          type: 'string',
          description: '目标货币代码 (如: USD, CNY, ETH)'
        }
      },
      required: ['amount', 'from', 'to']
    };
  }

  async execute(params) {
    const { amount, from, to } = params;

    if (!amount || amount <= 0) {
      return { success: false, error: '金额必须大于0' };
    }

    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    try {
      // 尝试获取实时汇率
      const rate = await this.getExchangeRate(fromUpper, toUpper);

      if (rate) {
        const result = amount * rate;
        return {
          success: true,
          from: { amount, currency: fromUpper },
          to: { amount: Number(result.toFixed(4)), currency: toUpper },
          rate,
          source: 'exchange_rate_api'
        };
      }

      // 使用静态汇率
      return this.convertWithStaticRate(amount, fromUpper, toUpper);
    } catch (error) {
      // 备用静态转换
      return this.convertWithStaticRate(amount, fromUpper, toUpper);
    }
  }

  async getExchangeRate(from, to) {
    try {
      // 使用 exchangerate-api.com 的免费接口
      const response = await fetch(
        `https://api.exchangerate-api.com/v4/latest/${from}`,
        { signal: AbortSignal.timeout(this.timeout) }
      );

      if (!response.ok) return null;

      const data = await response.json();
      return data.rates?.[to] || null;
    } catch {
      return null;
    }
  }

  convertWithStaticRate(amount, from, to) {
    const fromRate = this.staticRates[from];
    const toRate = this.staticRates[to];

    if (!fromRate || !toRate) {
      return {
        success: false,
        error: `不支持的货币代码: ${!fromRate ? from : to}，支持的货币: ${Object.keys(this.staticRates).join(', ')}`
      };
    }

    // 转换为 USD，再转换为目标货币
    const usdAmount = amount / fromRate;
    const result = usdAmount * toRate;

    return {
      success: true,
      from: { amount, currency: from },
      to: { amount: Number(result.toFixed(4)), currency: to },
      rate: Number((toRate / fromRate).toFixed(6)),
      source: 'static_rates'
    };
  }

  getSupportedCurrencies() {
    return {
      fiat: ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'HKD', 'TWD', 'SGD', 'AUD', 'CAD', 'CHF', 'INR'],
      crypto: ['BTC', 'ETH'],
      note: '加密货币汇率为示意，请以实际市场价格为准'
    };
  }
}

module.exports = CurrencyConverterTool;
