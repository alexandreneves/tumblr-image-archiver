/**
 *
 * REQUIREMENTS
 */

var _ = require('lodash');
var request = require('request');
var fs = require('fs');
var tumblr = require('tumblr.js');
var async = require('async');
var yargs = require('yargs');

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
var argv = yargs.argv;
var logPath = 'log.log';

// fetch

var limit = 50;
var offset = 0;
var before = date.getTime();
var cycles;
var delay = 250;
var fetchBlogPostsConcurrency = 10;

// download
var downloadConcurrency = 25;
var downloadPath = "./images/";

// counters
var countPosts;
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

	log(name);

	if (argv.blog) {
		log('~ Archiving blog = '+ argv.blog);
		archiveBlog();
	} else {
		log('~ Archiving likes');
		archiveLikes();
	}
}

 /**
  *
  * ARCHIVE BLOG
  */

var archiveBlog = function() {
	client.blogPosts(argv.blog, archiveCallback);
}

var fecthBlogPosts = function() {
	var q = async.queue(function(task, callback) {
		client.blogPosts(argv.blog, {offset: offset}, archiveFetchCallback.bind(this, callback));
	}, fetchBlogPostsConcurrency);

	q.drain = archiveDrain;

	for (var i = 0; i < cycles; i++) {
		q.push();
	}
}

/**
 *
 * ARCHIVE LIKES
 */

var archiveLikes = function() {
	client.userLikes({limit: 1}, archiveCallback);
}

var fetchLikedPosts = function() {
	var q = async.queue(function(task, callback) {
		client.userLikes({limit: limit, before: before}, archiveFetchCallback.bind(this, callback));
	});

	q.drain = archiveDrain;

	for (var i = 0; i < cycles; i++) {
		q.push();
	}
}

/**
 *
 * ARCHIVING METHODS
 */

 var archiveCallback = function(error, data) {
	if (error !== null) return false;

	const posts = argv.blog ? data.posts : data.liked_posts;
	countPosts = argv.blog ? data.total_posts : data.liked_count;

	if (posts.length > 0) {
		cycles = _.floor(countPosts/limit) + 1;

		log('~ ~ '+ countPosts +' posts to scan')
		log('~ ~ starting cycle of '+ cycles +' requests of ' + limit + ' posts at a time');

		argv.blog ? fecthBlogPosts() : fetchLikedPosts();
	} else {
		log('~ ~ no posts found');
	}
 }

 var archiveFetchCallback = function(callback, error, data) {
	if (error !== null) return false;

	const posts = argv.blog ? data.posts : data.liked_posts;

	if (!posts.length) { // end of the line
		callback();
		return;
	}

	if (argv.blog) {
		log('~ ~ cycle info: offset = '+ offset);
		offset = offset + limit;

		processImageArray(data);
	} else {
		before = data.liked_posts[data.liked_posts.length - 1].liked_timestamp;
		log('~ ~ cycle info: before = '+ before);

		processImageArray(data);
		processUnLikeArray(data)
	}
	
	callback();
}

var archiveDrain = function() {
	if (countPostsWithImage < 1) {
		log('~ no images to process');
		return false;
	}

	// output counters
	log('~ ~ '+ countPostsWithImage +' posts with images found out of '+ countPosts +' posts');
	log('~ ~ '+ countPostsWithNoImage +' posts did not contain images');

	// output deleted
	var deleted = countPosts - (countPostsWithImage + countPostsWithNoImage);
	if (deleted > 0) log('~ ~ '+ deleted +' were probably deleted');
		
	download();
}

/**
 *
 * ARRAYS
 */

var processImageArray = function(data) {
	const posts = data.posts ? data.posts : data.liked_posts;

	_.each(posts, function(post) {
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

var processUnLikeArray = function(data) {
	_.each(data.liked_posts, function(post) {
		toUnlike.push({
			'post_url': post.post_url,
			'id': post.id,
			'reblog_key': post.reblog_key
		});
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
		log('~ ~ ' + countDownloaded + ' images downloaded');
		log('~ ~ ' + countDownloadedErrors + ' errors downloading');

		if (!argv.blog) unlike();
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
		}, delay);
	});

	q.drain = function() {
		log('~ ~ ' + countUnliked + ' posts unliked');
		log('~ ~ ' + countUnlikedErrors + ' errors unliking');
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
