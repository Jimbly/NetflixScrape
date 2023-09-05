/* eslint max-len:off */

// Copy and paste your `Cookie` string from the Chrome debug tools network tab below.
// This is equivalent to your PASSWORD to Netflix, do not share it with anyone!
// It should start with something like "memclid=01234-56789-"
// To find this:
//   Open a Chrome window, sign in to Netflix
//   Go to https://portal.dvd.netflix.com/titles/moviedetail?titleId=70114973
//     It should be a JSON blob starting with {"type":"STANDALONEDISC" if everything is working
//   Then, press F12 to open the developer tools, and navigate to the Network tab
//   Refresh the page (F5), then click on the one entry (should be `moviedetails)
//   Under "Request Headers" (NOT "Response Headers"), find the "Cookie" section
//   Select the entire thing and paste below.  It should be quite large / many lines
const COOKIE = `
memclid=12345-....
`;

module.exports = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
	// 'Accept-Encoding': 'gzip, deflate, br',
	'Accept-Language': 'en-US,en;q=0.9',
	'Cache-Control': 'max-age=0',
	'Connection': 'keep-alive',
	'Cookie': COOKIE.trim(),
	'Host': 'portal.dvd.netflix.com',
	'Sec-Fetch-Dest': 'document',
	'Sec-Fetch-Mode': 'navigate',
	'Sec-Fetch-Site': 'none',
	'Sec-Fetch-User': '?1',
	'Upgrade-Insecure-Requests': '1',
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
	'sec-ch-ua': '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': '"Windows"',
};
