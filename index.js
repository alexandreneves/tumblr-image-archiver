/**
 *
 * REQUIREMENTS
 */

var _ = require('lodash');
var request = require('request');
var fs = require('fs');
var tumblr = require('tumblr.js');
var async = require('async');

/**
 *
 * TUMBLR CLIENT
 */

var config = require('./config.js');
var client = tumblr.createClient(config);

/**
 *
 * VARS
 */

var name = 'Tumblr Image Archiver';
var date = new Date();

// request
// var offset = 0;
var before = date.getTime();
var limit = 50;
var cycles;

// download
var downloadConcurrency = 25;
var downloadPath = "./images/";

// log
var logPath = 'log.log';

// counters
var countLikes;
var countPostsWithImage = 0;
var countPostsWithNoImage = 0;
var countUnliked = 0;
var countUnlikedErrors = 0;
var countDownloaded = 0;
var countDownloadedErrors = 0;

// arrays
var toDownload = [];
var toUnlike = [];

/**
 *
 * RUN
 * determines the number of cycles necessary to get all the liked posts
 */

var run = function() {
	clearLog();

	client.userLikes({limit: 1}, function (error, data) {
		if (error !== null) {
			log(error);
			return false;
		}

		countLikes = data.liked_count;

		log(name);

		if (data.liked_posts.length > 0) {
			cycles = _.floor(countLikes/limit) + 1;

			log('~ '+ countLikes +' posts to scan')
			log('~ starting cycle of '+ cycles +' requests of ' + limit + ' posts at a time');

			fetchLikes();
		} else {
			log('~ no posts found');
		}
	});
}

/**
 *
 * LIKES
 */

var fetchLikes = function() {
	var q = async.queue(function(task, callback) {
		client.userLikes({limit: limit, before: before}, function (error, data) {
			if (error !== null) {
				log(error);
				return false;
			}

			if (!data.liked_posts.length) { // end of the line
				callback();
				return;
			}

			before = data.liked_posts[data.liked_posts.length - 1].liked_timestamp;

			processArrays(data);

			log('~ cycle info: before = '+ before);
			
			callback();
		});
	});

	q.drain = function() {
		if (countPostsWithImage < 1) {
			log('~ no images to process');
			return false;
		}

		// output counters
		log('~ '+ countPostsWithImage +' posts with images found out of '+ countLikes +' posts');
		log('~ '+ countPostsWithNoImage +' posts did not contain images');

		// output deleted
		var deleted = countLikes - (countPostsWithImage + countPostsWithNoImage);
		if (deleted > 0) log('~ '+ deleted +' were probably deleted');
			
		download();
	};

	for (var i = 0; i < cycles; i++) {
		q.push();
	}
}

var processArrays = function(data) {
	_.each(data.liked_posts, function(post) {
		toUnlike.push({
			'post_url': post.post_url,
			'id': post.id,
			'reblog_key': post.reblog_key
		});

		if (post.photos) {
			post.photos.forEach(function(photo) {
				toDownload.push({
					'post_url': photo.post_url,
					'url': photo.original_size.url
				});
			});

			countPostsWithImage++;
		} else {
			countPostsWithNoImage++;
			log('~ not a post.photos');
			log('~ post id: ' + post.post_url);
		}
	});
}

/**
 *
 * DOWNLOAD
 */

var download = function() {
	log('~ Downloading '+ toDownload.length +' images');

	var q = async.queue(function (img, callback) {
		var filename = img.url.split('/').pop();
		var r = request(img.url);
		var ws = fs.createWriteStream(downloadPath + filename);

		r.on('data', function(data) {
			ws.write(data);
		});
		r.on('end', function() {
			ws.end();
			countDownloaded++;
			callback();
		});
		r.on('error', function(err) {
			log('~ error saving image');
			log('~ post: ' + img.post_url);

			ws.close();
			countDownloadedErrors++;
			callback();
		});
	}, downloadConcurrency);

	q.drain = function() {
		log('~ ' + countDownloaded + ' images downloaded');
		log('~ ' + countDownloadedErrors + ' errors downloading');

		unlike();
	};

	q.push(toDownload);
}

/**
 *
 * UNLIKE
 */

var unlike = function() {
	log('~ Unliking posts');
	log('~ go grab a cuppa\' coffee, this may take a while');

	var interval = 500;

	var q = async.queue(function(post, callback) {
		setTimeout(function() {
			client.unlikePost(post.id, post.reblog_key, function (error, data) {
				if (error !== null) {
					log('~ error unliking '+ post.post_url);
					countUnlikedErrors++;
				} else {
					countUnliked++;
				}

				callback();
			});
		}, interval);
	});

	q.drain = function() {
		log('~ ' + countUnliked + ' posts unliked');
		log('~ ' + countUnlikedErrors + ' errors unliking');
	};

	q.push(toUnlike);
};

/**
 *
 * LOG
 */

var log = function(output) {
	var op = output + "\r\n";

	fs.appendFile(logPath, op, function (error) {
		if (error !== null ) console.log(error);
	});

	console.log(output);
};

var clearLog = function() {
	fs.writeFile(logPath, '', function (err) {
		if (err !== null) console.log(err);
	});
}

/**
 *
 * GO!
 */

run();
