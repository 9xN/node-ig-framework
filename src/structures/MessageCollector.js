const { EventEmitter } = require("events");

class MessageCollector extends EventEmitter {
  /**
   * @typedef {object} MessageCollectorOptions
   * @property {Function} filter The filter to apply
   * @property {number} idle How long to stop the collector after inactivity in milliseconds
   */

  /**
   * @param {Chat} chat The chat in which the messages should be collected
   * @param {MessageCollectorOptions} [options={}] The options for the collector
   */
  constructor(chat, options = {}) {
    super();
    this.client = chat.client;
    this.chat = chat;
    this.filter = options.filter || (() => true);
    this.idle = options.idle || 10000;
    this.ended = false;
    this.handleMessage = this.handleMessage.bind(this);
    this.client.on("messageCreate", this.handleMessage);
    if (this.idle) {
      this._idleTimeout = setTimeout(() => this.end("idle"), this.idle);
    }
  }

  handleMessage = async (message) => {
    if (this.ended) return;
    const valid =
      (await this.filter(message)) && message.chatID === this.chat.id;
    if (!valid) return;
    this.emit("message", message);
    if (this._idleTimeout) {
      clearTimeout(this._idleTimeout);
      this._idleTimeout = setTimeout(() => this.end("idle"), this.idle);
    }
  };

  /**
   * End the collector
   * @param {string} reason The reason the collector ended
   */
  end = (reason) => {
    this.ended = true;
    if (this._idleTimeout) clearTimeout(this._idleTimeout);
    this.client.removeListener("messageCreate", this.handleMessage);
    this.emit("end", reason);
  };

  toJSON = () => ({
    client: this.client.toJSON(),
    chatID: this.chat.id,
    ended: this.ended,
  });
}

module.exports = MessageCollector;

/**
 * Emitted when a message is collected by the collector
 * @event MessageCollector#message
 * @param {Message} message The collected message
 */

/**
 * Emitted when the collector ends
 * @event MessageCollector#end
 * @param {string} reason The reason the collector ended
 */
