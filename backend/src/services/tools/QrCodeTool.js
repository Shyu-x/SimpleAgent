/**
 * 二维码生成工具
 * 生成 QR Code 图片
 */

class QrCodeTool {
  constructor(options = {}) {
    this.name = 'qrcode';
    this.description = '二维码生成 - 生成URL、文本、WiFi等二维码';
    this.category = 'utility';
    this.timeout = options.timeout || 10000;
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '二维码内容 (URL、文本等)'
        },
        type: {
          type: 'string',
          enum: ['url', 'text', 'wifi', 'vcard', 'email'],
          default: 'text',
          description: '二维码类型'
        },
        options: {
          type: 'object',
          properties: {
            size: { type: 'number', default: 300, description: '二维码大小(px)' },
            margin: { type: 'number', default: 4, description: '白色边距模块数' },
            errorCorrectionLevel: {
              type: 'string',
              enum: ['L', 'M', 'Q', 'H'],
              default: 'M',
              description: '纠错级别'
            }
          }
        }
      },
      required: ['content']
    };
  }

  async execute(params) {
    const { content, type = 'text', options = {} } = params;

    if (!content || content.trim().length === 0) {
      return { success: false, error: '二维码内容不能为空' };
    }

    try {
      const size = options.size || 300;
      const margin = options.margin || 4;
      const errorCorrectionLevel = options.errorCorrectionLevel || 'M';

      // 构建二维码数据
      let qrData = content;
      if (type === 'wifi') {
        qrData = this.formatWifi(content);
      } else if (type === 'vcard') {
        qrData = this.formatVCard(content);
      } else if (type === 'email') {
        qrData = this.formatEmail(content);
      }

      // 使用 QR Server API 生成二维码
      const encodedData = encodeURIComponent(qrData);
      const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&ECC=${errorCorrectionLevel}&data=${encodedData}`;

      return {
        success: true,
        qrCodeUrl: apiUrl,
        content: qrData,
        type,
        options: { size, margin, errorCorrectionLevel },
        downloadUrl: `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&ECC=${errorCorrectionLevel}&data=${encodedData}&format=png`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  formatWifi(config) {
    // 格式: WIFI:T:WPA;S:SSID;P:password;;
    const { ssid, password, encryption = 'WPA' } = config;
    return `WIFI:T:${encryption};S:${ssid};P:${password};;`;
  }

  formatVCard(contact) {
    const { name, phone, email, org, title } = contact;
    return `BEGIN:VCARD
VERSION:3.0
FN:${name || ''}
ORG:${org || ''}
TITLE:${title || ''}
TEL:${phone || ''}
EMAIL:${email || ''}
END:VCARD`;
  }

  formatEmail(emailConfig) {
    const { to, subject, body } = emailConfig;
    let mailto = `mailto:${to}`;
    const params = [];
    if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
    if (body) params.push(`body=${encodeURIComponent(body)}`);
    if (params.length > 0) mailto += '?' + params.join('&');
    return mailto;
  }
}

module.exports = QrCodeTool;
