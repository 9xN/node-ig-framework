const fetch = require("node-fetch");
const fs = require("fs").promises;
const Jimp = require("jimp");

class Attachment {
  /**
   * @param {Buffer|string} data The data for the attachment
   */
  constructor(data) {
    /**
     * The data for the attachment
     * @type {Buffer|string}
     */
    this.data = data;
    /**
     * The processed file
     * @type {Buffer}
     */
    this.file = null;
  }

  /**
   * Verifies and processes the attachment data
   * @returns {Promise<void>}
   * @throws {Error} If the attachment data is empty or unsupported
   */
  async _verify() {
    if (!this.data) {
      throw new Error("Can not create empty attachment!");
    } else if (Buffer.isBuffer(this.data)) {
      await this._handleBuffer(this.data);
    } else if (typeof this.data === "string") {
      if (/http(s)?:\/\//.test(this.data)) {
        await this._handleURL(this.data);
      } else {
        await this._handleFile(this.data);
      }
    } else {
      throw new Error("Unsupported attachment.");
    }
  }

  /**
   * Handles a file attachment
   * @param {string} file The file path
   * @returns {Promise<void>}
   * @throws {Error} If the file cannot be resolved
   */
  async _handleFile(file) {
    try {
      const fileStream = await fs.readFile(file);
      if (file.endsWith(".jpg") || file.endsWith(".jpeg")) {
        this.file = fileStream;
      } else {
        await this._handleBuffer(fileStream);
      }
    } catch (error) {
      throw new Error("Couldn't resolve the file.");
    }
  }

  /**
   * Handles an attachment buffer
   * @param {Buffer} data The attachment buffer
   * @returns {Promise<void>}
   */
  async _handleBuffer(data) {
    const image = await Jimp.read(data);
    this.file = await image.getBufferAsync(Jimp.MIME_JPEG);
  }

  /**
   * Handles an attachment URL
   * @param {string} link The URL link
   * @returns {Promise<void>}
   * @throws {Error} If unable to fetch image from URL
   */
  async _handleURL(link) {
    try {
      const res = await fetch(link);
      await this._handleBuffer(await res.buffer());
    } catch (error) {
      throw new Error("Unable to fetch image from URL.");
    }
  }
}

module.exports = Attachment;
