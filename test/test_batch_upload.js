const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const data = JSON.stringify([
  {
    title: 'Test Signed Batch Post 1',
    url: 'https://example.com/signed1',
    content: 'Signed Content 1'
  },
  {
    title: 'Test Signed Batch Post 2',
    url: 'https://example.com/signed2',
    content: 'Signed Content 2'
  }
]);

// Sign the data
const privateKey = fs.readFileSync('private.pem', 'utf8');
const signer = crypto.createSign('RSA-SHA256');
signer.update(data);
const signature = signer.sign(privateKey, 'base64');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/batch',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'X-Signature': signature
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(data);
req.end();
