const { EventEmitter } = require('events');

class TraceEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

global.traceEventEmitter = new TraceEventEmitter();

module.exports = { TraceEventEmitter };