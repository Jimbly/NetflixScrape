const fs = require('fs');
const https = require('https');
const request = require('request');
const { asyncEachSeries } = require('glov-async');
const headers = require('./headers');

let agent = new https.Agent();
agent.maxSockets = 1;

let dirdone = {};
function mkdir(dir) {
  if (dirdone[dir]) {
    return;
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  dirdone[dir] = true;
}

mkdir('data/reviews');


console.log('Enumerating movie IDs...');
let files = fs.readdirSync('data/movies');

console.log('Processing...');
asyncEachSeries(files, function (filename1, next) {
  let data = JSON.parse(fs.readFileSync(`data/movies/${filename1}`, 'utf8'));
  if (!data.numRatings) {
    // skip for now
    return void next();
  }
  let movie_id = Number(filename1.match(/(\d+)\.json/)[1]);
  if (data.id !== movie_id) {
    // console.log(`${movie_id}: ID mismatch, skipping (${data.id})`);
    return void next();
  }

  let reviews = {};
  function getReviews(id, page, next) {
    let filename = `data/reviews/${id}.json`;
    if (fs.existsSync(filename)) {
      // let data2 = JSON.parse(fs.readFileSync(filename, 'utf8'));
      // console.log(`Reviews for ${id} (${data.name}) skipped (${data2.reviews.length} reviews found previously)`);
      return next();
    }
    let url = `https://portal.dvd.netflix.com/reviews/reviewdetail?titleId=${movie_id}&pageNum=${page}&pageSize=20`;
    request({
      url,
      json: true,
      headers,
      agent,
    }, function (err, res) {
      if (!err && res && (res.statusCode !== 200 || !res.body)) {
        err = `Error: statusCode=${res.statusCode} body=${JSON.stringify(res.body)}`;
      }
      if (err) {
        console.error(`Error getting ${id}: ${err}`);
        return void next();
      }
      let { body } = res;
      let { recentReviews, helpfulReviews } = body;
      let any_new = false;
      [recentReviews, helpfulReviews].forEach((list) => {
        if (list) {
          for (let ii = 0; ii < list.length; ++ii) {
            let review = list[ii];
            if (!reviews[review.reviewId]) {
              reviews[review.reviewId] = review;
              any_new = true;
            }
          }
        }
      });

      console.log(`Movie ${id} (${data.name}) page ${page}, ${Object.keys(reviews).length} reviews`);
      if (!any_new || page === 10) {
        fs.writeFileSync(filename, JSON.stringify({
          name: data.name,
          reviews: Object.values(reviews),
        }));
        setTimeout(next, 1000);
      } else {
        setTimeout(function () {
          getReviews(id, page + 1, next);
        }, 250);
      }
    });
  }
  getReviews(movie_id, 1, next);
}, function (err) {
  if (err) {
    throw err;
  }
  console.log('Done.');
});
