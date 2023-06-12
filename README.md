# tumblr-image-archiver

Small NodeJS script made for fun :)

Features:

- download all images of a blog
- download all your liked posts (images only)

## Requirements

- Node.js
- npm

## Usage

- `$ npm install`
- `$ mkdir images`
- `$ touch log.log`
- `$ touch config.js` and add your Tumblr API keys like so:

```javascript
module.exports = {
  consumer_key: "",
  consumer_secret: "",
  token: "",
  token_secret: "",
};
```

- `$ node index.js` to download your likes OR `$node index.js --blog blogId` to download every images of X `blogId`
