const User = require("./User");

class ClientUser extends User {
  /**
   * @param {Client} client The instantiating client
   * @param {object} data The data for the client user.
   */
  constructor(client, data) {
    super(client, data);
    this._patch(data);
  }

  _patch(data) {
    super._patch(data);
    this.allowContactsSync = data.allowContactsSync;
    this.phoneNumber = data.phoneNumber;
  }

  /**
   * Change the bot's biography
   * @param {string} content The new biography
   * @returns {Promise<string>} The new biography
   */
  setBiography = async (content) => {
    this.biography = content;
    await this.client.ig.account.setBiography(content);
    return this.biography;
  };

  toJSON = () => ({
    ...super.toJSON(),
    allowContactsSync: this.allowContactsSync,
    phoneNumber: this.phoneNumber,
  });

  // The following properties are unnecessary and can be removed:
  follow = undefined;
  unfollow = undefined;
  block = undefined;
  unblock = undefined;
  approveFollow = undefined;
  denyFollow = undefined;
  removeFollower = undefined;
  send = undefined;
}

module.exports = ClientUser;
