# tumblr-image-archiver
Download and archive your liked images on Tumblr

## Requirements
Node.JS & npm

## Instalation

1. run $ npm install
2. create a logs folder with log.log and error.log files
3. create an images folder
4. create a keys.js file with
```
module.exports = {
    consumer_key: '',
    consumer_secret: '',
    token: '',
    token_secret: ''
};
```

## Usage
```
$ node index.js
```

## Configurations
1. Unlike (default: false) - this will unlike all your likes

## Known Issues
1. Unliking **will** exceed Tumblr rate limits for a big amount of likes