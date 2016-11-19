# tumblr-image-archiver
Node script to download/archive and unlike all the images of your liked posts on Tumblr.

## Requirements
* Node.js
* npm

## Usage

* `$ npm install`
* `$ mkdir images`
* `$ touch log.log`
* `$ touch keys.js` and add your Tumblr API key/token + secrets

```javascript
module.exports = {
    consumer_key: '',
    consumer_secret: '',
    token: '',
    token_secret: ''
};
```
    
* `$ node index.js`
