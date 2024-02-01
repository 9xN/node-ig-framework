const fetch = require("node-fetch");
const fs = require("fs").promises;
const Jimp = require("jimp");

class Attachment {
  constructor(data) {
    this.data = data;
    this.file = null;
  }

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

  async _handleBuffer(data) {
    const image = await Jimp.read(data);
    this.file = await image.getBufferAsync(Jimp.MIME_JPEG);
  }

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
