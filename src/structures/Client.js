const {
    withRealtime,
    withFbns
} = require('instagram_mqtt')
const { GraphQLSubscriptions, SkywalkerSubscriptions } = require('instagram_mqtt/dist/realtime/subscriptions')
const {
    IgApiClient
} = require('instagram-private-api')
const {
    EventEmitter
} = require('events')
const Collection = require('@discordjs/collection').default

const Util = require('../utils/Util')

const ClientUser = require('./ClientUser')
const Message = require('./Message')
const Chat = require('./Chat')
const User = require('./User')

/**
 * Client, the main hub for interacting with the Instagram API.
 * @extends {EventEmitter}
 */
class Client extends EventEmitter {
    /**
     * @typedef {object} ClientOptions
     * @property {boolean} disableReplyPrefix Whether the bot should disable user mention for the Message#reply() method
     */
    /**
     * @param {ClientOptions} options
     */
    constructor(options) {
        super()
        /**
         * @type {?ClientUser}
         * The bot's user object.
         */
        this.user = null
        /**
         * @type {?IgApiClient}
         * @private
         */
        this.ig = null
        /**
         * @type {boolean}
         * Whether the bot is connected and ready.
         */
        this.ready = false
        /**
         * @type {ClientOptions}
         * The options for the client.
         */
        this.options = options || {}

        /**
         * @typedef {Object} Cache
         * @property {Collection<string, Message>} messages The bot's messages cache.
         * @property {Collection<string, User>} users The bot's users cache.
         * @property {Collection<string, Chat>} chats The bot's chats cache.
         * @property {Collection<string, Chat>} pendingChats The bot's pending chats cache.
         */
        /**
         * @type {Cache}
         * The bot's cache.
         */
        this.cache = {
            messages: new Collection(),
            users: new Collection(),
            chats: new Collection(),
            pendingChats: new Collection()
        }

        /**
         * @type {...any[]}
         */
        this.eventsToReplay = []
    }

    /**
     * Create a new user or patch the cache one with the payload
     * @private
     * @param {string} userID The ID of the user to patch
     * @param {object} userPayload The data of the user
     * @returns {User}
     */
    _patchOrCreateUser(userID, userPayload) {
        if (this.cache.users.has(userID)) {
            this.cache.users.get(userID)._patch(userPayload)
        } else {
            this.cache.users.set(userID, new User(this, userPayload))
        }
        return this.cache.users.get(userID)
    }

    /**
     * Create a chat (or return the existing one) between one (a dm chat) or multiple users (a group).
     * @param {string[]} userIDs The users to include in the group
     * @returns {Promise<Chat>} The created chat
     */
    async createChat(userIDs) {
        const threadPayload = await this.ig.direct.createGroupThread(userIDs)
        const chat = new Chat(this, threadPayload.thread_id, threadPayload)
        this.cache.chats.set(chat.id, chat)
        return chat
    }

    /**
     * Fetch a chat and cache it.
     * @param {string} query The ID of the chat to fetch.
     * @param {boolean} [force=false] Whether the cache should be ignored
     * @returns {Promise<Chat>}
     *
     * @example
     * client.fetchChat('340282366841710300949128114477310087639').then((chat) => {
     *   chat.sendMessage('Hey!');
     * });
     */
    async fetchChat(chatID, force = false) {
        if (!this.cache.chats.has(chatID)) {
            const {
                thread: chatPayload
            } = await this.ig.feed.directThread({
                thread_id: chatID
            }).request()
            const chat = new Chat(this, chatID, chatPayload)
            this.cache.chats.set(chatID, chat)
        } else {
            if (force) {
                const {
                    thread: chatPayload
                } = await this.ig.feed.directThread({
                    thread_id: chatID
                }).request()
                this.cache.chats.get(chatID)._patch(chatPayload)
            }
        }
        return this.cache.chats.get(chatID)
    }

    /**
     * Fetch a user and cache it.
     * @param {string} query The ID or the username of the user to fetch.
     * @param {boolean} [force=false] Whether the cache should be ignored
     * @returns {Promise<User>}
     *
     * @example
     * client.fetchUser('pronote_bot').then((user) => {
     *   user.follow();
     * });
     */
    async fetchUser(query, force = false) {
        const userID = Util.isID(query) ? query : await this.ig.user.getIdByUsername(query)
        if (!this.cache.users.has(userID)) {
            const userPayload = await this.ig.user.info(userID)
            const user = new User(this, userPayload)
            this.cache.users.set(userID, user)
        } else {
            if (force) {
                const userPayload = await this.ig.user.info(userID)
                this.cache.users.get(userID)._patch(userPayload)
            }
        }
        return this.cache.users.get(userID)
    }

    /**
     * Handle Realtime messages
     * @param {object} data
     * @private
     */
    handleRealtimeReceive(payload) {
        if (!this.ready) {
            this.eventsToReplay.push([
                'realtime',
                payload
            ])
            return
        }
        this.emit('rawRealtime', payload)
        var message = payload.message
        switch (message.op) {
            case 'replace': {
                const isInboxThreadPath = Util.matchInboxThreadPath(message.path, false)
                if (isInboxThreadPath) {
                    const [threadID] = Util.matchInboxThreadPath(message.path, true)
                    if (this.cache.chats.has(threadID)) {
                        const chat = this.cache.chats.get(threadID)
                        const oldChat = Object.assign(Object.create(chat), chat)
                        this.cache.chats.get(threadID)._patch(message)

                        /* Compare name */
                        if (oldChat.name !== chat.name) {
                            this.emit('chatNameUpdate', chat, oldChat.name, chat.name)
                        }

                        /* Compare calling status */
                        if (!oldChat.calling && chat.calling) {
                            this.emit('callStart', chat)
                        } else if (oldChat.calling && !chat.calling) {
                            this.emit('callEnd', chat)
                        }
                    } else {
                        const chat = new Chat(this, threadID, message)
                        this.cache.chats.set(chat.id, chat)
                    }
                    return
                }
                const isMessagePath = Util.matchMessagePath(message.path, false)
                if (isMessagePath) {
                    const [threadID] = Util.matchMessagePath(message.path, true)
                    this.fetchChat(threadID).then((chat) => {
                        if (chat.messages.has(message.item_id)) {
                            const msg = chat.messages.get(message.item_id)
                            const oldMessage = Object.assign(Object.create(msg), msg)
                            chat.messages.get(message.item_id)._patch(message)

                            /* Compare likes */
                            if (oldMessage.likes.length > msg.likes.length) {
                                const removed = oldMessage.likes.find((like) => !msg.likes.some((l) => l.userID === like.userID))
                                this.fetchUser(removed.userID).then((user) => {
                                    if (removed) this.emit('likeRemove', user, msg)
                                })
                            } else if (msg.likes.length > oldMessage.likes.length) {
                                const added = msg.likes.find((like) => !oldMessage.likes.some((l) => l.userID === like.userID))
                                if (added) {
                                    this.fetchUser(added.userID).then((user) => {
                                        this.emit('likeAdd', user, msg)
                                    })
                                }
                            }
                        }
                    })
                }
                break
            }

            case 'add': {
                const isMessagePath = Util.matchMessagePath(message.path, false)
                if (isMessagePath) {
                    const [threadID] = Util.matchMessagePath(message.path, true)
                    this.fetchChat(threadID).then((chat) => {
                        // Create a new message
                        if (message.item_type === 'action_log' || message.item_type === 'video_call_event') return
                        const msg = new Message(this, threadID, message)
                        chat.messages.set(msg.id, msg)
                        if (Util.isMessageValid(msg)) this.emit('messageCreate', msg)
                    })
                }
                break
            }

            case 'remove': {
                const isMessagePath = Util.matchMessagePath(message.path, false)
                if (isMessagePath) {
                    const [threadID] = Util.matchMessagePath(message.path, true)
                    this.fetchChat(threadID).then((chat) => {
                        // Emit message delete event
                        const messageID = message.item_id
                        const existing = chat.messages.get(messageID)
                        if (existing) this.emit('messageDelete', existing)
                    })
                }
                break
            }

            default:
                break
        }
    }

    /**
     * Handle FBNS messages
     * @param {object} data
     * @private
     */
    async handleFbnsReceive(data) {
        if (!this.ready) {
            this.eventsToReplay.push([
                'fbns',
                data
            ])
            return
        }
        this.emit('rawFbns', data)
        if (data.pushCategory === 'new_follower') {
            const user = await this.fetchUser(data.sourceUserId)
            this.emit('newFollower', user)
        }
        if (data.pushCategory === 'private_user_follow_request') {
            const user = await this.fetchUser(data.sourceUserId)
            this.emit('followRequest', user)
        }
        if (data.pushCategory === 'direct_v2_pending') {
            if (!this.cache.pendingChats.get(data.actionParams.id)) {
                const pendingRequests = await this.ig.feed.directPending().items()
                pendingRequests.forEach((thread) => {
                    const chat = new Chat(this, thread.thread_id, thread)
                    this.cache.chats.set(thread.thread_id, chat)
                    this.cache.pendingChats.set(thread.thread_id, chat)
                })
            }
            const pendingChat = this.cache.pendingChats.get(data.actionParams.id)
            if (pendingChat) {
                this.emit('pendingRequest', pendingChat)
            }
        }
    }

    /**
     * Log the bot out from Instagram
     * @returns {Promise<void>}
     */
    async logout() {
        await this.ig.account.logout();
        await this.ig.realtime.disconnect();
        await this.ig.fbns.disconnect();
    }

    /**
     * Log the bot in to Instagram
     * @param {string} username The username of the Instagram account.
     * @param {string} password The password of the Instagram account.
     */
    async login(username, password) {
        const ig = withFbns(withRealtime(new IgApiClient()))
        ig.request.end$.subscribe(Util.saveFile(ig))
        ig.state.generateDevice(username)

        const state = Util.readFile();
        if (state) {
            await ig.importState(state)
        }
        //await ig.simulate.preLoginFlow()
        const response = await ig.account.login(username, password)
        const userData = await ig.user.info(response.pk)
        this.user = new ClientUser(this, {
            ...response,
            ...userData
        })
        this.cache.users.set(this.user.id, this.user)
        this.emit('debug', 'logged', this.user)

        const threads = [
            ...await ig.feed.directInbox().items(),
            ...await ig.feed.directPending().items()
        ]
        threads.forEach((thread) => {
            const chat = new Chat(this, thread.thread_id, thread)
            this.cache.chats.set(thread.thread_id, chat)
            if (chat.pending) {
                this.cache.pendingChats.set(thread.thread_id, chat)
            }
        })
        ig.realtime.on('message', (data) => this.handleRealtimeReceive(data))
        ig.realtime.on('error', console.error)
        ig.realtime.on('close', () => console.error('RealtimeClient closed'))

        await ig.realtime.connect({
            graphQlSubs: [
                // these are some subscriptions
                GraphQLSubscriptions.getAppPresenceSubscription(),
                GraphQLSubscriptions.getZeroProvisionSubscription(ig.state.phoneId),
                GraphQLSubscriptions.getDirectStatusSubscription(),
                GraphQLSubscriptions.getDirectTypingSubscription(ig.state.cookieUserId),
                GraphQLSubscriptions.getAsyncAdSubscription(ig.state.cookieUserId),
            ],
            // optional
            skywalkerSubs: [
                SkywalkerSubscriptions.directSub(ig.state.cookieUserId),
                SkywalkerSubscriptions.liveSub(ig.state.cookieUserId),
            ],
            irisData: await ig.feed.directInbox().request()
        })
        // PartialObserver<FbnsNotificationUnknown>
        ig.fbns.on('push', (data) => this.handleFbnsReceive(data))

        await ig.fbns.connect({
            autoReconnect: true
        })

        this.ig = ig
        this.ready = true
        this.emit('connected')
        this.eventsToReplay.forEach((event) => {
            const eventType = event.shift()
            if (eventType === 'realtime') {
                this.handleRealtimeReceive(...event)
            } else if (eventType === 'fbns') {
                this.handleFbnsReceive(...event)
            }
        })
    }

    toJSON() {
        const json = {
            ready: this.ready,
            options: this.options,
            id: this.user.id
        }
        return json
    }
}

module.exports = Client

/**
 * Emitted when a message is sent in a chat the bot is in
 * @event Client#messageCreate
 * @param {Message} message The message that was sent
 */

/**
 * Emitted when a message is deleted in a chat the bot is in
 * @event Client#messageDelete
 * @param {Message} message The message that was deleted
 */

/**
 * Emitted when a user adds a like to a message
 * @event Client#likeAdd
 * @param {User} user The user who added the like
 * @param {Message} message The message on which the like was added
 */

/**
 * Emitted when a user removes a like from a message
 * @event Client#likeRemove
 * @param {User} user The user who removed the like
 * @param {Message} message The message on which the like was removed
 */

/**
 * Emitted when someone starts following the bot
 * @event Client#newFollower
 * @param {User} user The user that started following the bot
 */

/**
 * Emitted when someone wants to follow the bot
 * @event Client#followRequest
 * @param {User} user The user who wants to follow the bot
 */

/**
 * Emitted when someone wants to send a message to the bot
 * @event Client#pendingRequest
 * @param {Chat} chat The chat that needs to be approved
 */

/**
 * Emitted when the name of a chat changes
 * @event Client#chatNameUpdate
 * @param {Chat} chat The chat whose name has changed
 * @param {string} oldName The previous name of the chat
 * @param {string} newName The new name of the chat
 */

/**
 * Emitted when a user is added to a chat
 * @event Client#chatUserAdd
 * @param {Chat} chat The chat in which the user has been added
 * @param {User} user The user who has been added
 */

/**
 * Emitted when a user is removed from a chat
 * @event Client#chatUserRemove
 * @param {Chat} chat The chat from which the user has been removed
 * @param {User} user The user who has been removed
 */

/**
 * Emitted when a user becomes an administrator in a chat
 * @event Client#chatAdminAdd
 * @param {Chat} chat The chat in which the user has become an administrator
 * @param {User} user The user who has become admin
 */

/**
 * Emitted when a call starts in a chat
 * @event Client#callStart
 * @param {Chat} chat The chat in which the call has started
 */

/**
 * Emitted when a call ends in a chat
 * @event Client#callEnd
 * @param {Chat} chat The chat in which the call has ended
 */