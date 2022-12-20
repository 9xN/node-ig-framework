# node-ig-framework
Framework for interacting with instagrams private api in a usable manner (forked from andre's work and improved and fixed)


## Installation 

1. Install node.js from https://nodejs.org/
2. Create a new project folder
3. `$ cd` to that directory 
4. Run `$ npm init` and follow prompts
5. Run `$ npm install node-ig-framework` and boom you're done!

## Setup

```js
const Insta = require('node-ig-framework');
const client = new Insta.Client();

client.on('connected', () => {
    console.log(`Logged in as ${client.user.fullName} (${client.user.username})`);
    console.log(`User ID: ${this.client.user.id}`);
    console.log(`Followers: ${this.client.user.followerCount}`);
    console.log(`Following: ${this.client.user.followingCount}`);
    console.log(`Business: ${this.client.user.isBusiness}`);
    console.log(`Verified: ${this.client.user.isVerified}`);
    console.log(`Private: ${this.client.user.isPrivate}`);

});

client.on('messageCreate', (message) => {
    if (message.author.id === client.user.id) return

    message.markSeen();
    
    if (message.content === '!ping') {
        message.reply('!pong');
    }
    
    message.chat.startTyping({ time: 5000 })
});

client.login('username', 'password');
```
