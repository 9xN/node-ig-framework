"use strict";

const fs = require("fs");
const { IgApiClientExt } = require("instagram_mqtt");

/**
 * Multiple static utility function
 */
class Util {
  /**
   * Check if query is an id
   * @param {string} query The query to checked
   * @return {boolean}
   */
  static isID(query) {
    return !isNaN(query);
  }

  /**
   * Match admin path
   * @param {string} query URL path to match
   * @param {boolean} extract Whether it should return the extracted data from the query
   * @return {string[]|boolean}
   */
  static matchAdminPath(query, extract) {
    const isMatched = /\/direct_v2\/threads\/(\d+)\/admin_user_ids\/(\d+)/.test(
      query
    );
    return extract
      ? query
          .match(/\/direct_v2\/threads\/(\d+)\/admin_user_ids\/(\d+)/)
          .slice(1)
      : isMatched;
  }

  /**
   * Match message path
   * @param {string} query URL path to match
   * @param {boolean} extract Whether it should return the extracted data from the query
   * @return {string[]|boolean}
   */
  static matchMessagePath(query, extract) {
    const isMatched = /\/direct_v2\/threads\/(\d+)\/items\/(\d+)/.test(query);
    return extract
      ? query.match(/\/direct_v2\/threads\/(\d+)\/items\/(\d+)/).slice(1)
      : isMatched;
  }

  /**
   * Match inbox thread path
   * @param {string} query URL path to match
   * @param {boolean} extract Whether it should return the extracted data from the query
   * @return {string[]|boolean}
   */
  static matchInboxThreadPath(query, extract) {
    const isMatched = /\/direct_v2\/inbox\/threads\/(\d+)/.test(query);
    return extract
      ? query.match(/\/direct_v2\/inbox\/threads\/(\d+)/).slice(1)
      : isMatched;
  }

  /**
   * Check if message is valid
   * @param {Message} message
   * @return {boolean}
   */
  static isMessageValid(message) {
    return message.timestamp / 1000 + 10000 > Date.now();
  }

  /**
   * Saves the state of the api client to state.json
   * @param {IgApiClientExt} ig the instagram api client
   */
  static async saveFile(ig) {
    const exportedState = await ig.exportState();
    return fs.writeFileSync("state.json", exportedState, {
      encoding: "utf8",
    });
  }
  /**
   * Reads the state of the api client from state.json
   * @returns {string|boolean} the state from file
   */
  static readFile() {
    if (!fs.existsSync("state.json")) return false;
    return fs.readFileSync("state.json", {
      encoding: "utf8",
    });
  }

  static extractCreator(messageData) {
    try {
      return messageData.media_share.user.username;
    } catch (err) {
      console.log(err);
      return undefined;
    }
  }

  static extractImages(messageData) {
    let images = [];
    const postImage = Util.extracteImageFromSinglePost(messageData);
    if (postImage) {
      images.push(postImage);
    }
    const carouselImages = Util.extractImagesFromCarousel(messageData);
    if (carouselImages) {
      images = images.concat(carouselImages);
    }
    return images;
  }

  static extractMediaShareUrl(messageData) {
    try {
      return `https://www.instagram.com/p/${messageData.media_share.code}`;
    } catch (err) {
      // console.log(err)
      return undefined;
    }
  }

  static extracteImageFromSinglePost(messageData) {
    try {
      return messageData.media_share.image_versions2.candidates[0].url;
    } catch (err) {
      // console.log(err)
      return undefined;
    }
  }

  static extractImagesFromCarousel(messageData) {
    try {
      return messageData.media_share.carousel_media.map(
        (mediaObj) => mediaObj.image_versions2.candidates[0].url
      );
    } catch (err) {
      // console.log(err)
      return undefined;
    }
  }

  static extractPostTimestamp(messageData) {
    try {
      return messageData.media_share.taken_at;
    } catch (err) {
      // console.log(err)
      return undefined;
    }
  }

  static extractLocation(messageData) {
    const location = {
      coordinates: Util.extractLocationCoordinates(messageData),
      address: Util.extractLocationAddress(messageData),
      city: Util.extractLocationCity(messageData),
      name: Util.extractLocationName(messageData),
      shortName: Util.extractLocationShortName(messageData),
    };
    if (
      !location.coordinates &&
      !location.address &&
      !location.city &&
      !location.name &&
      !location.shortName
    ) {
      return undefined;
    }
    return location;
  }

  static extractLocationCoordinates(messageData) {
    try {
      return {
        lat:
          messageData.media_share.lat || messageData.media_share.location.lat,
        lng:
          messageData.media_share.lng || messageData.media_share.location.lng,
      };
    } catch (err) {
      // console.log(err)
      return undefined;
    }
  }

  static extractLocationAddress(messageData) {
    try {
      return messageData.media_share.location.address;
    } catch (err) {
      // console.log(err)
      return undefined;
    }
  }

  static extractLocationCity(messageData) {
    try {
      return messageData.media_share.location.city;
    } catch (err) {
      // console.log(err)
      return undefined;
    }
  }

  static extractLocationName(messageData) {
    try {
      return messageData.media_share.location.name;
    } catch (err) {
      // console.log(err)
      return undefined;
    }
  }

  static extractLocationShortName(messageData) {
    try {
      return messageData.media_share.location.short_name;
    } catch (err) {
      // console.log(err)
      return undefined;
    }
  }
}

module.exports = Util;
