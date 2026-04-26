/**
 * 告警管理器模块
 * @description 提供企业级告警规则管理和触发能力，支持 webhook 通知
 */

const { AlertManager, getAlertManager } = require('./AlertManager');

module.exports = {
  AlertManager,
  getAlertManager,
};
