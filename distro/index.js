// Netflix movie data fetcher and personal recommendation report generator
// Configure options here, place your cookie in `headers.js`

// Whether or not to include things you've rated on Netflix
const INCLUDE_RATED = true;
// Whether or not to include DVDs that are not currently available on Netflix
const INCLUDE_UNAVAILABLE = true;
// How many results to display
const LIST_SIZE = 100;
// How many ratings an entry must have received to consider it for the report
const RATINGS_CUTOFF = 10;
// Minimum average rating for the "Things you'll love" report
const LOVE_MIN_RATING = 2.5;


const fs = require('fs');
const request = require('request');
const https = require('https');
const FileStore = require('fs-store').FileStore;
const headers = require('./headers');
const { asyncEachSeries } = require('glov-async');
let agent = new https.Agent();
agent.maxSockets = 1;

const DELAY_GOT_DATA = 500;

if (!fs.existsSync('data')) {
  fs.mkdirSync('data');
}
if (!fs.existsSync('data/movies')) {
  fs.mkdirSync('data/movies');
}

let my_store = new FileStore('data/report.json');

let good_ids = JSON.parse(fs.readFileSync('data/good_ids.json','utf8'));

// good_ids = good_ids.slice(0, 20);

let processed_ids = my_store.get('processed_ids', {});

function getMovie(movie_id, next) {
  let filename = `data/movies/${movie_id}.json`;
  if (fs.existsSync(filename) && fs.statSync(filename).size > 100) {
    // Skip, already exists
    processed_ids[movie_id] = 1;
    my_store.set('processed_ids', processed_ids);
    return setImmediate(next);
  }

  request({
    url: `https://portal.dvd.netflix.com/titles/moviedetail?titleId=${movie_id}&returnRoot=true&returnRecommendedBy=true`,
    json: true,
    headers,
    agent,
  }, function (err, res) {
    if (!err && res && (res.statusCode !== 200 || !res.body.name)) {
      err = `Error: statusCode=${res.statusCode} body=${JSON.stringify(res.body)}`;
    }
    if (err) {
      console.error(`Error getting movie ${movie_id}: ${err}`);
      if (err.includes && err.includes('Missing cookie')) {
        console.error('\n\n*** SETUP REQUIRED ***\n\n   Please open `headers.js` (in any' +
          ' text editor like Notepad) and enter your Netflix cookie.\n\n');
      }
      //return void next();
      return;
    }
    let { body } = res;
    fs.writeFile(filename, JSON.stringify(body), function (err) {
      if (err) {
        throw err;
      }
      processed_ids[movie_id] = 1;
      my_store.set('processed_ids', processed_ids);
      let progress = Object.keys(processed_ids).length;
      console.log(`${progress} / ${good_ids.length} ` +
        `(${(progress*100/good_ids.length).toFixed(0)}%) (${movie_id}: ${body.name})`);
      setTimeout(next, DELAY_GOT_DATA);
    });
  });
}

function generateReport() {
  console.log('Loading movie data from cache...');

  let files = Object.keys(processed_ids);
  let total = files.length;
  let progress = 0;
  let last_p = 0;
  let by_id = {};
  let movies = [];
  let skipped_rated = 0;
  let skipped_insufficient = 0;
  let skipped_unavail = 0;
  asyncEachSeries(files, function (movie_id, next) {
    fs.readFile(`data/movies/${movie_id}.json`, 'utf8', function (err, data) {
      if (err) {
        return next(err);
      }
      data = JSON.parse(data);
      ++progress;
      let p = progress/total;
      if (p - last_p > 0.1) {
        last_p = p;
        console.log(`${progress}/${total} (${(progress*100/total).toFixed(0)}%)`);
      }

      if (data.numRatings < RATINGS_CUTOFF) {
        skipped_insufficient++;
        return next();
      }

      if (data.rentState === 'UNAVAILABLE' && !INCLUDE_UNAVAILABLE) {
        skipped_unavail++;
        return next();
      }

      if (data.rentState !== 'UNAVAILABLE' && data.rentState !== 'RENT' && data.rentState !== 'SAVE' &&
         data.rentState !== 'IN_QUEUE'
       ) {
        console.log(data.rentState, data.name, data.id);
      }

      if (data.cRating && !INCLUDE_RATED) {
        skipped_rated++;
        return next();
      }

      by_id[movie_id] = data;
      movies.push(data);
      delete data.similars;
      delete data.commonSenseMedia;
      delete data.relatedOrderedSet;
      delete data.relatedCollectionMovies;
      next();
    });
  }, function (err) {
    if (err) {
      throw err;
    }
    if (RATINGS_CUTOFF) {
      console.log(`${skipped_insufficient}/${total} skipped due to having insufficient ratings.`);
    }
    if (!INCLUDE_UNAVAILABLE) {
      console.log(`${skipped_unavail}/${total-skipped_insufficient} skipped due to being unavailable.`);
    }
    if (!INCLUDE_RATED) {
      console.log(`${skipped_rated}/${total-skipped_insufficient-skipped_unavail}` +
        ' skipped due to having been rated by customer.');
    }
    console.log('Generating report...');

    function genres(elem) {
      let ret = [];
      if (elem.primaryGenre) {
        ret.push(elem.primaryGenre);
      }
      if (elem.genres) {
        ret = ret.concat(elem.genres.map((a) => a.name));
      }
      if (elem.moods) {
        ret = ret.concat(elem.moods.map((a) => a.name));
      }
      return ret.join(', ');
    }

    function printList(title, list) {
      console.log(`\n${title}`);
      list.forEach(function (elem) {
        console.log(`  ${elem.prediction.toFixed(1)} (avg ${elem.aRating.toFixed(1)})  -  ${elem.name} (${elem.year})  -  https://dvd.netflix.com/Movie/_/${elem.id}`);
        console.log(`    ${elem.numRatings} total ratings, ${genres(elem)}`);
      });
    }

    movies.sort((a, b) => b.prediction - a.prediction);
    let highest_rated = movies.slice(0, LIST_SIZE);
    printList('Highest Rated for You', highest_rated);

    let love = movies
      .filter((a) => a.aRating >= LOVE_MIN_RATING)
      .sort((a, b) => (b.prediction - b.aRating) - (a.prediction - a.aRating));
    let best_for_you = love.slice(0, LIST_SIZE);
    printList('Things you\'ll love more than anyone else', best_for_you);

    let report = fs.readFileSync('report.html.template', 'utf8').replace('DATADUMP', JSON.stringify({
      highest_rated,
      best_for_you,
    }));
    fs.writeFileSync('report.html', report);

    // Dump all ratings report
    function cleanName(elem) {
      let name = elem.name;
      if (name.startsWith('The ')) {
        name = name.slice(4);
      }
      name = name.replace(/['",.!#$()*[\]-]/g, '');
      name = name.trim();
      name = `${name} (${elem.year})`;
      return name.toLowerCase();
    }
    movies.sort((a, b) => {
      let an = cleanName(a);
      let bn = cleanName(b);
      if (an < bn) {
        return -1;
      } else if (bn < an) {
        return 1;
      } else {
        return a.id - b.id;
      }
    });
    // eslint-disable-next-line arrow-body-style
    let all = movies.map((elem) => {
      return `${elem.prediction.toFixed(1)} (avg ${elem.aRating.toFixed(1)})  -` +
      `  ${elem.name} (${elem.year})  -  ${elem.numRatings} total ratings, ${genres(elem)}, ID:${elem.id}`;
    });
    fs.writeFileSync('report-all.txt', all.join('\n'));

    // fs.writeFileSync('data/good_ids.json', JSON.stringify(Object.keys(by_id).map(Number)));
    console.log('Done.  Wrote pretty report to `report.html`.  Wrote full report to report-all.txt');
  });
}

let walk_idx = 0;
function pump() {
  while (walk_idx < good_ids.length && processed_ids[good_ids[walk_idx]]) {
    walk_idx++;
  }
  if (walk_idx === good_ids.length) {
    console.log('Done retrieving movie data!');
    return generateReport();
  }
  getMovie(good_ids[walk_idx], pump);
}

pump();
