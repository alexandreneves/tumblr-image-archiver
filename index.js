const _ = require("lodash");
const request = require("request");
const fs = require("fs");
const tumblr = require("tumblr.js");
const async = require("async");
const yargs = require("yargs");

// region Tumblr client

const config = require("./config.js");
const client = tumblr.createClient(config);

// endregion
// region vars

const name = "Tumblr Image Archiver";
const date = new Date();
const argv = yargs.argv;
const logPath = "log.log";

// fetch
const limit = 50;
const delay = 250;
const fetchBlogPostsConcurrency = 10;
let before = date.getTime();
let offset = 0;
let cycles;

// download
const downloadConcurrency = 25;
const downloadPath = "./images/";

// counters
let countPosts;
let countPostsWithImage = 0;
let countPostsWithNoImage = 0;
let countUnliked = 0;
let countUnlikedErrors = 0;
let countDownloaded = 0;
let countDownloadedErrors = 0;

// arrays
const toDownload = [];
const toUnlike = [];

// endregion
// region run

function run() {
  clearLog();

  log(name);

  if (argv.blog) {
    log(`[ARCHIVE BLOG ${argv.blog}]`);
    archiveBlog();
  } else {
    log("[ARCHIVE LIKES]");
    archiveLikes();
  }
}

// endregion
// region archive blog

function archiveBlog() {
  client.blogPosts(argv.blog, archiveCallback);
}

function fetchBlogPosts() {
  const q = async.queue(function (task, callback) {
    client.blogPosts(
      argv.blog,
      { offset: offset },
      archiveFetchCallback.bind(this, callback)
    );
  }, fetchBlogPostsConcurrency);

  q.drain = archiveDrain;

  for (let i = 0; i < cycles; i++) {
    q.push();
  }
}

// endregion
// region archive likes

function archiveLikes() {
  client.userLikes({ limit: 1 }, archiveCallback);
}

function fetchLikedPosts() {
  const q = async.queue(function (task, callback) {
    client.userLikes(
      { limit: limit, before: before },
      archiveFetchCallback.bind(this, callback)
    );
  });

  q.drain = archiveDrain;

  for (let i = 0; i < cycles; i++) {
    q.push();
  }
}

// endregion
// region archiving methods

function archiveCallback(error, data) {
  if (error !== null) return false;

  const posts = argv.blog ? data.posts : data.liked_posts;
  countPosts = argv.blog ? data.total_posts : data.liked_count;

  if (posts.length > 0) {
    cycles = _.floor(countPosts / limit) + 1;

    log(`~ (${countPosts}) posts to scan`);
    log(`~ starting cycle of (${cycles}) requests of (${limit}) posts at a time`);

    argv.blog ? fetchBlogPosts() : fetchLikedPosts();
  } else {
    log("~ no posts found");
  }
}

function archiveFetchCallback(callback, error, data) {
  if (error !== null) return false;

  const posts = argv.blog ? data.posts : data.liked_posts;

  if (!posts.length) {
    // end of the line
    callback();
    return;
  }

  if (argv.blog) {
    log(`~ cycle offset (${offset})`);
    offset = offset + limit;

    processImageArray(data);
  } else {
    before = data.liked_posts[data.liked_posts.length - 1].liked_timestamp;
    log(`~ cycling before (${before})`);

    processImageArray(data);
    processUnLikeArray(data);
  }

  callback();
}

function archiveDrain() {
  if (countPostsWithImage < 1) {
    log("~ no images to process");
    return false;
  }

  // output counters
  log(`~ (${countPostsWithImage}) posts with images found out of (${countPosts}) posts`);
  log(`~ (${countPostsWithNoImage}) posts did not contain images`);

  // output deleted
  const deleted = countPosts - (countPostsWithImage + countPostsWithNoImage);
  if (deleted > 0) log(`~ (${deleted}) were probably deleted`);

  download();
}

// endregion
// region array

function processImageArray(data) {
  const posts = data.posts ? data.posts : data.liked_posts;

  _.each(posts, function (post) {
    if (post.photos) {
      post.photos.forEach(function (photo) {
        toDownload.push({
          post_url: photo.post_url,
          url: photo.original_size.url,
        });
      });

      countPostsWithImage++;
    } else {
      countPostsWithNoImage++;
      log(`~ not a photos post ${post.post_url})`);
    }
  });
}

function processUnLikeArray(data) {
  _.each(data.liked_posts, function (post) {
    toUnlike.push({
      post_url: post.post_url,
      id: post.id,
      reblog_key: post.reblog_key,
    });
  });
}

// endregion
// region download

function download() {
  log("[DOWNLOAD]");
  log(`~ (${toDownload.length}) images to download`);

  const q = async.queue((img, callback) => {
    const filename = img.url.split("/").pop();
    const r = request(img.url);
    const ws = fs.createWriteStream(downloadPath + filename);

    r.on("data", function (data) {
      ws.write(data);
    });
    r.on("end", function () {
      ws.end();
      countDownloaded++;
      callback();
    });
    r.on("error", function (err) {
      log("~ error saving image");
      log(`~ post (${img.post_url})`);

      ws.close();
      countDownloadedErrors++;
      callback();
    });
  }, downloadConcurrency);

  q.drain = function () {
    log(`~ (${countDownloaded}) images downloaded`);
    log(`~ (${countDownloadedErrors}) errors downloading`);

    if (!argv.blog) unlike();
  };

  q.push(toDownload);
}

// endregion
// region unlike

function unlike() {
  log("[UNLIKE]");
  log("~ go grab a cuppa' coffee, this may take a while");

  const q = async.queue(function (post, callback) {
    setTimeout(function () {
      client.unlikePost(post.id, post.reblog_key, function (error, data) {
        if (error !== null) {
          log(`~ error unliking (${post.post_url})`);
          countUnlikedErrors++;
        } else {
          countUnliked++;
        }

        callback();
      });
    }, delay);
  });

  q.drain = function () {
    log(`~ (${countUnliked}) posts unliked`);
    log(`~ (${countUnlikedErrors}) errors unliking`);
  };

  q.push(toUnlike);
}

// endregion
// region logging

function log(output) {
  const op = output + "\r\n";

  fs.appendFile(logPath, op, function (error) {
    if (error !== null) console.log(error);
  });

  console.log(output);
}

function clearLog() {
  fs.writeFile(logPath, "", function (err) {
    if (err !== null) console.log(err);
  });
}

// endregion

run();
