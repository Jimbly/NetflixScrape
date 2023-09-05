/* eslint max-len:off */

// 19274 from scraping
// 29118 from genres
// 30257 from those two combined
// 30325 from scraping those
// 146956 from scraping +/-10 IDs
// 149537 from scraping +/-15 IDs
// 153583 from scraping +/-30 IDs

const assert = require('assert');
const fs = require('fs');
const request = require('request');
const https = require('https');
const FileStore = require('fs-store').FileStore;
const headers = require('./headers');
let agent = new https.Agent();
agent.maxSockets = 1;

const DELAY_NOT_FOUND = 125;
const DELAY_GOT_DATA = 500;

if (!fs.existsSync('data')) {
	fs.mkdirSync('data');
}
if (!fs.existsSync('data/movies')) {
	fs.mkdirSync('data/movies');
}


let my_store = new FileStore('data/data.json');

// Generates internal server error when queried
let bad_ids = my_store.get('bad_ids', { 70089290: 1, 70307785: 1 });

let known_ids = my_store.get('known_ids', { 60023025: 1 });
let processed_ids = my_store.get('processed_ids', {});

let need_save = false;
['data/genres/all.json', 'data/moods/all.json'].forEach(function (filename) {
	let from_genre = JSON.parse(fs.readFileSync(filename, 'utf8')).ids;
	for (let ii = 0; ii < from_genre.length; ++ii) {
		let key = from_genre[ii];
		if (!known_ids[key]) {
			known_ids[key] = 1;
			need_save = true;
		}
	}
});
if (need_save) {
	my_store.set('known_ids', known_ids);
}

let get_queue = [];
for (let key in known_ids) {
	if (!processed_ids[key]) {
		get_queue.push(key);
	}
}

let random_mode = false;

function getMovie(movie_id, next) {
	request({
		url: `https://portal.dvd.netflix.com/titles/moviedetail?titleId=${movie_id}&returnRoot=true&returnRecommendedBy=true`,
		json: true,
		headers,
		agent,
	}, function (err, res) {
		if (res && res.statusCode === 500) {
			assert(random_mode);
			// Internal server error, presumably from random polling
			bad_ids[movie_id] = 1;
			my_store.set('bad_ids', bad_ids);
			console.log(`${Object.keys(processed_ids).length} / ${Object.keys(known_ids).length} (random ID ${movie_id}: 500: Internal Server Error)`);
			return void setTimeout(next, 5000);
		}
		if (res && res.statusCode === 204) {
			assert(random_mode);
			// No content, from random polling
			processed_ids[movie_id] = 1;
			my_store.set('processed_ids', processed_ids);
			console.log(`${Object.keys(processed_ids).length} / ${Object.keys(known_ids).length} (random ID ${movie_id}: 200: Not Found)`);
			return void setTimeout(next, DELAY_NOT_FOUND);
		}
		if (!err && res && (res.statusCode !== 200 || !res.body.name)) {
			err = `Error: statusCode=${res.statusCode} body=${JSON.stringify(res.body)}`;
		}
		if (err) {
			console.error(`Error getting movie ${movie_id}: ${err}`);
			//return void next();
			return;
		}
		let { body } = res;
		fs.writeFile(`data/movies/${movie_id}.json`, JSON.stringify(body), function (err) {
			if (err) {
				throw err;
			}
			function walk(obj) {
				if (!obj) {
					return;
				}
				if (Array.isArray(obj)) {
					for (let ii = 0; ii < obj.length; ++ii) {
						walk(obj[ii]);
					}
				} else {
					if (obj.id) {
						if (!known_ids[obj.id]) {
							known_ids[obj.id] = 1;
							my_store.set('known_ids', known_ids);
							get_queue.push(obj.id);
						}
					}
				}
			}
			walk(body.relatedCollectionMovies);
			walk(body.relatedOrderedSet);
			walk(body.similars);
			processed_ids[movie_id] = 1;
			my_store.set('processed_ids', processed_ids);
			if (!known_ids[movie_id]) {
				// from random probing
				known_ids[movie_id] = 1;
				my_store.set('known_ids', known_ids);
			}
			console.log(`${Object.keys(processed_ids).length} / ${Object.keys(known_ids).length} (${movie_id}: ${body.name})`);
			setTimeout(next, DELAY_GOT_DATA);
		});
	});
}

let search_range = 1;
function findNextRandoms() {
	let timing = Date.now();
	let todo = 100;
	random_mode = true;
	for (let key in known_ids) {
		let id = Number(key);
		for (let ii = search_range; ii >= -search_range; --ii) {
			let test_id = id + ii;
			if (!processed_ids[test_id] && !get_queue.includes(test_id) && !bad_ids[test_id]) {
				// console.log(`Queuing random ID ${test_id}...`);
				get_queue.push(test_id);
				--todo;
				if (!todo) {
					let dt = Date.now() - timing;
					if (dt > 150) {
						console.log(`Finding IDs took ${dt}ms`);
					}
					return;
				}
			}
		}
	}
}

function pump() {
	if (!get_queue.length) {
		findNextRandoms();
		if (!get_queue.length) {
			console.log('Queue is empty');
			if (search_range < 50) {
				++search_range;
				console.log(`Increased to ${search_range}`);
				pump();
			}
			return;
		}
	}
	getMovie(get_queue.pop(), pump);
}

pump();