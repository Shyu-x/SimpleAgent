// Create a simple test to verify backend correctly forwards to MiniMax
const http = require('http');

const postData = JSON.stringify({
  model: 'MiniMax-M2.7',
  messages: [{ role: 'user', content: '你好' }],
  stream: false  // Use non-streaming for easier debugging
});

const options = {
  hostname: 'localhost',
  port: 30000,
  path: '/api/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    console.log('Response body length:', body.length);
    console.log('Response body:', body.substring(0, 500));
    console.log('Response body hex:', Buffer.from(body.substring(0, 200)).toString('hex'));
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(postData);
req.end();
