const fs = require('fs');
const http = require('http');
const request = require('request');
const { asyncEachSeries } = require('glov-async');

let agent = new http.Agent();
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

mkdir('data/boxarts');


console.log('Enumerating movie IDs...');
let files = fs.readdirSync('data/movies');

const WIDE_KEYS = ['1024', '650', 'HD1080', 'GHD', '197', 'GSD', '166'];
const LAND_KEYS = ['LAND1056', 'LAND704', 'LAND528', 'LAND352'];
const KEYART_KEYS = ['KEYART', 'KEYART_MOBILE'];

asyncEachSeries(files, function (filename, next) {
	let data = JSON.parse(fs.readFileSync(`data/movies/${filename}`, 'utf8'));
	if (!data.numRatings) {
		// skip for now
		return void next();
	}
	let movie_id = Number(filename.match(/(\d+)\.json/)[1]);
	if (data.id !== movie_id) {
		console.log(`${movie_id}: ID mismatch, skipping (${data.id})`);
		return void next();
	}
	let boxarts = {};
	for (let ii = 0; ii < data.boxarts.length; ++ii) {
		let key = data.boxarts[ii];
		if (key === 'S166') {
			key ='166';
		}
		if (key === 'S197') {
			key ='197';
		}
		if (key === 'W650') {
			key = '650';
		}
		if (key === 'W1024') {
			key = '1024';
		}
		boxarts[key] = true;
	}
	let seen = {};
	function filter(KEYS) {
		let clear = false;
		for (let ii = 0; ii < KEYS.length; ++ii) {
			let key = KEYS[ii];
			if (boxarts[key]) {
				seen[key] = true;
				if (clear) {
					delete boxarts[key];
				} else {
					clear = true;
				}
			}
		}
	}
	filter(WIDE_KEYS);
	filter(LAND_KEYS);
	filter(KEYART_KEYS);
	let unknown = [];
	for (let key in boxarts) {
		if (!seen[key]) {
			unknown[key] = true;
		}
	}

	asyncEachSeries(Object.keys(boxarts), function (type, next) {
		let url = `http://assets.nflxext.com/us/boxshots/${type.toLowerCase()}/${movie_id}.jpg`;
		let outfile = `data/boxarts/${movie_id}.${type}.jpg`;
		if (fs.existsSync(outfile) && fs.statSync(outfile).size > 1024) {
			console.log(`Skipping ${outfile}...`);
			return next();
		}
		request({
			url,
			// headers,
			agent,
			encoding: null,
		}, function (err, res) {
			if (res && res.statusCode === 404) {
				console.error(`Error getting ${url}: 404 Not Found`);
				if (type === 'KEYART_MOBILE' && Object.keys(boxarts).length > 1) {
					// ignore, we've got something useful
					return void next();
				}
				//return void next();
				return;
			}
			if (!err && res && res.statusCode !== 200) {
				err = `Error: statusCode=${res.statusCode} body=${JSON.stringify(res.body)}`;
			}
			if (err) {
				console.error(`Error getting ${url}: ${err}`);
				//return void next();
				return;
			}
			fs.writeFile(outfile, res.body, function (err) {
				if (err) {
					return next(err);
				}
				console.log(`Wrote ${outfile} (${res.body.length} bytes)`);
				next();
			});
		});
	}, function (err) {
		if (err) {
			return next(err);
		}
		if (Object.keys(unknown).length) {
			console.log(movie_id, boxarts);
		} else {
			console.log(`${movie_id}: ${Object.keys(boxarts)} OK`);
			return next();
		}
	});
}, function (err) {
	if (err) {
		throw err;
	}
	console.log('Done.');
});
