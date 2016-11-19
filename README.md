# tumblr-image-archiver

Small Node script made for fun.

Features
* download all images of a blog
* archive all images of your liked posts

## Requirements

* Node.js
* npm

## Usage

* `$ npm install`
* `$ mkdir images`
* `$ touch log.log`
* `$ touch config.js` and add your Tumblr API key/token + secrets

```javascript
module.exports = {
    consumer_key: '',
    consumer_secret: '',
    token: '',
    token_secret: ''
};
```
    
* `$ node index.js` OR `$node index.js --blog blogId
