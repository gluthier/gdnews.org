const http = require('http');

console.log('Testing GET /weekly-links...');

const options = {
  hostname: process.env.APP_DOMAIN,
  port: 3001,
  path: '/weekly-links',
  method: 'GET',
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const posts = JSON.parse(data);
      console.log('Response is valid JSON.');
      if (Array.isArray(posts)) {
        console.log(`Received ${posts.length} posts.`);
        posts.forEach(post => {
            if (!post.title || !post.url) {
                console.error('FAIL: Post missing title or url', post);
            }
        });
        if (posts.length > 0) {
             console.log('Sample post:', posts[0]);
        }
      } else {
        console.error('FAIL: Response is not an array.');
      }
    } catch (e) {
      console.error('FAIL: Could not parse response as JSON:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
