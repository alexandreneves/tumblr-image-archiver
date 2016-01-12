# tumblr-image-archiver
Download and archive your liked images on Tumblr

## Requirements
Node.JS & npm

## Instalation

1.
```sh
$ npm install
$ mkdir logs
$ mkdir images
$ cd logs
$ touch error.log
$ touch log.log
$ touch keys.js
```
2. keys.js should have your tumblr client keys
```
module.exports = {
    consumer_key: '',
    consumer_secret: '',
    token: '',
    token_secret: ''
};
```

## Usage
```sh
$ node index.js
```

## Configurations
1. Unlike (default: false) - this will unlike all your likes

## Known Issues
1. Unliking **will** exceed Tumblr rate limits for a big amount of likes