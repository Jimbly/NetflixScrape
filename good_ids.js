const assert = require('assert');
const fs = require('fs');
const { asyncEachSeries } = require('glov-async');

console.log('Enumerating movie IDs...');
let files = fs.readdirSync('data/movies');
console.log('Processing...');

function wordMap(sentence) {
  let words = sentence.split(/[ .,;]/g);
  let ret = Object.create(null);
  for (let ii = 0; ii < words.length; ++ii) {
    let word = words[ii];
    if (word.length <= 3) {
      continue;
    }
    ret[word] = true;
  }
  return ret;
}

let lastv1;
let lastv2;
function mapMatch(a, b, srca, srcb) {
  let total = 0;
  let match = 0;
  for (let key in a) {
    ++total;
    if (b[key]) {
      ++match;
    }
  }
  let r = match / total;
  lastv1 = lastv2;
  lastv2 = r;
  let ret = r > 0.6;
  if (ret) {
    // console.log(`Same synopsis\n    ${srca}\n    ${srcb}\n`);
  }
  return ret;
}

function similarSynopsis(a, b) {
  if (a.length < 10 || b.length < 10) {
    return false;
  }
  if (a.startsWith(b.slice(0, Math.floor(b.length/2))) ||
      b.startsWith(a.slice(0, Math.floor(a.length/2)))
  ) {
    return true;
  }
  let wordsa = wordMap(a);
  let wordsb = wordMap(b);
  if (mapMatch(wordsa, wordsb, a, b) || mapMatch(wordsb, wordsa, a, b)) {
    return true;
  }
  return false;
}

let known_same = [[70094800, 70202344]];

function sameMovie(a, b) {
  if (a.year !== b.year) {
    return false;
  }
  if (a.actor?.length && b.actor?.length) {
    return a.actor[0].id === b.actor[0].id;
  } else if (!a.actor?.length !== !b.actor?.length) {
    // One without actors, the other with
    return false;
  } else if (a.director?.length && b.director?.length) {
    // Same actors, how about directors?
    return a.director[0].id === b.director[0].id;
  } else if (a.synopsis && a.synopsis === b.synopsis) {
    return true;
  } else if (similarSynopsis(a.synopsis, b.synopsis)) {
    return true;
  } else {
    for (let ii = 0; ii < known_same.length; ++ii) {
      let entry = known_same[ii];
      if (a.id === entry[0] && b.id === entry[1] ||
        a.id === entry[1] && b.id === entry[0]
      ) {
        return true;
      }
    }
    console.log(a, b);
    console.log(lastv1, lastv2);
    assert(false, 'Unknown similarity');
  }
  return true;
}

function betterRecord(a, b) {
  // Better Netflix data
  if (a.moods.length > b.moods.length) {
    return true;
  } else if (b.moods.length > a.moods.length) {
    return false;
  }
  if (a.length && !b.length) {
    return true;
  } else if (b.length && !a.length) {
    return false;
  }
  if (a.boxarts.length > b.boxarts.length) {
    return true;
  } else if (b.boxarts.length > a.boxarts.length) {
    return true;
  }
  // Better general data
  if (a.numRatings > 1.1 * b.numRatings) {
    return true;
  } else if (b.numRatings > 1.1 * a.numRatings) {
    return false;
  }

  if (a.type !== b.type && a.type === 'STANDALONEDISC') {
    // seems to have better prediction
    return true;
  }
  if (a.type !== b.type && b.type === 'STANDALONEDISC') {
    // seems to have better prediction
    return false;
  }
  console.log(a, b);
  assert(false, 'Unknown betterness');
}

let total = files.length;
let progress = 0;
let id_mismatch = 0;
let no_ratings = 0;
let good = 0;
let last_p = 0;
let by_name = {};
let by_id = {};
asyncEachSeries(files, function (filename, next) {
  fs.readFile(`data/movies/${filename}`, 'utf8', function (err, data) {
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
    let movie_id = Number(filename.match(/(\d+)\.json/)[1]);
    if (data.id !== movie_id) {
      ++id_mismatch;
      return void next();
    }

    if (!data.numRatings) {
      ++no_ratings;
      return void next();
    }
    by_id[movie_id] = data;
    delete data.similars;
    delete data.genres;
    delete data.commonSenseMedia;
    delete data.relatedOrderedSet;
    delete data.relatedCollectionMovies;
    ++good;
    let arr = by_name[data.name] = by_name[data.name] || [];
    arr.push(data.id);
    next();
  });
}, function (err) {
  if (err) {
    throw err;
  }
  let names = Object.keys(by_name);
  let dups = 0;
  names.sort((a, b) => by_name[a].length - by_name[b].length);
  console.log(names.slice(-20).map((a) => `${a} (${by_name[a].length})`).join(', '));
  names.forEach((name) => {
    let arr = by_name[name];
    if (arr.length === 1) {
      return;
    }
    let remove = [];
    for (let ii = 0; ii < arr.length; ++ii) {
      for (let jj = ii+1; jj < arr.length; ++jj) {
        if (sameMovie(by_id[arr[ii]], by_id[arr[jj]])) {
          if (betterRecord(by_id[arr[ii]], by_id[arr[jj]])) {
            remove.push(arr[jj]);
          } else {
            remove.push(arr[ii]);
          }
        }
      }
    }
    for (let ii = 0; ii < remove.length; ++ii) {
      if (by_id[remove[ii]]) {
        // console.log(`Removed duplicate ${name} (${by_id[remove[ii]].year})`);
        delete by_id[remove[ii]];
        ++dups;
      }
    }
  });
  good -= dups;
  console.log({
    total,
    id_mismatch,
    no_ratings,
    good,
    unique_names: names.length,
    dups,
  });
  fs.writeFileSync('data/good_ids.json', JSON.stringify(Object.keys(by_id).map(Number)));
  console.log('Done.');
});