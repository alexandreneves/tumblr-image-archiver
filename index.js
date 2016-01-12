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

var keys = require('./keys.js');
var client = tumblr.createClient(keys);

/**
 *
 * VARS
 */

var name = 'Tumblr Image Archiver';

// request
var offset = 0;
var limit;
var cycles;
var cyclesConcurrency = 10;

// download
var downloadConcurrency = 50;
var downloadPath = "images/";

// log
var logPath = 'logs/log.log';
var logErrorPath = 'logs/error.log'

// unlike
var unlike = false;

// counters
var countLikes;
var countPostsWithImage = 0;
var countPostsWithNoImage = 0;
var countUnliked = 0;
var countUnlikedErrors = 0;
var countDownloaded = 0;
var countDownloadedErrors = 0;

// images
var images = [];

/**
 *
 * LIKES
 */

var run = function() {
	// clear log
	logsClear();

	// get cycle limit & likes count
	client.likes({limit: 1000, offset: 0}, function (error, data) {
		if (error !== null) {
			log(error, true);
			return false;
		}

		limit = data.liked_posts.length;
		countLikes = data.liked_count;

		if (limit > 0) {
			cycles = new Array(_.floor(countLikes/limit) + 1);

			log(name);
			log('> '+ countLikes +' posts to scan')
			log('> starting cycle of '+ cycles.length +' requests of ' + limit + ' posts at a time');

			likesFetch();
		} else {
			log('> no posts found');
		}
	});
}

var likesFetch = function() {
	var q = async.queue(function(cycle, callback) {
		client.likes({limit: limit, offset: (offset + cycle * limit)}, function (error, data) {
			if (error !== null) {
				log(error, true);
				return false;
			}

			likesArray(data);

			callback();
		});
	}, cyclesConcurrency);

	q.drain = function() {
		if (countPostsWithImage < 1) {
			log('> no images to process');
			return false;
		}

		// output counters
		log('> '+ countPostsWithImage +' images found out of '+ countLikes +' posts');
		log('> '+ countPostsWithNoImage +' were not images');

		// output deleted
		var deleted = countLikes - (countPostsWithImage + countPostsWithNoImage);
		if (deleted > 0) log('> '+ deleted +' were probably deleted');
			
		download();
	};

	_.each(cycles, function(value, cycle) {
		q.push(cycle);
	});
}

var likesArray = function(data) {
	_.each(data.liked_posts, function(post) {
		if (post.photos) {
			images.push({
				'id': post.id,
				'reblog_key': post.reblog_key,
				'post': post.post_url,
				'url': post.photos[0].original_size.url
			});

			countPostsWithImage++;
		} else {
			countPostsWithNoImage++;
			log('~ not a post.photos', true);
			log('~ post id: ' + post.post_url, true);
		}
	});
}

/**
 *
 * DOWNLOAD
 */

var download = function() {
	log('> Downloading images');

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
			log('~ error saving image', true);
			log('~ post: ' + img.post, true);

			ws.close();

			countDownloadedErrors++;
			callback();
		});
	}, downloadConcurrency);

	q.drain = function() {
		log('. ' + countDownloaded + ' images downloaded');
		log('. ' + countDownloadedErrors + ' errors downloading');

		if (unlike) unlikeAll();
	};

	_.each(images, function(img) {
		q.push(img);
	});
}

/**
 *
 * UNLIKE
 */

var unlikeAll = function() {
	log('> Unliking images');

	var q = async.queue(function(img, callback) {
		client.unlike(img.id, img.reblog_key, function (error, data) {
			if (error !== null) {
				log(error, true);
				countUnlikedErrors++;
			} else {
				countUnliked++;
			}

			callback();
		});

	}, cyclesConcurrency);

	q.drain = function() {
		log('> ' + countUnliked + ' posts unliked');
		log('> ' + countUnlikedErrors + ' errors unliking');
	};

	_.each(images, function(img){
		q.push(img);
	});
};

/**
 *
 * LOG
 */

var log = function(output, error) {
	var op = output + "\r\n";

	if (!error) {
		fs.appendFile(logPath, op, function (error) {
			if (error !== null ) console.log(error);
		});
	} else {
		fs.appendFile(logErrorPath, op, function (error) {
			if (error !== null ) console.log(error);
		});
	}

	console.log(output);
};

var logsClear = function() {
	fs.writeFile(logPath, '', function (err) {
		if (err !== null) console.log(err);
	});

	fs.writeFile(logErrorPath, '', function (err) {
		if (err !== null) console.log(err);
	});
}

/**
 *
 * GO!
 */

run();
