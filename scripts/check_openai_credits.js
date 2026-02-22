#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI;
if (!key) {
  console.error('NO_OPENAI_KEY');
  process.exit(2);
}

(async () => {
  try {
    let text = '';
    if (typeof fetch === 'function') {
      const res = await fetch('https://api.openai.com/v1/dashboard/billing/credit_grants', {
        headers: { Authorization: `Bearer ${key}` },
      });
      text = await res.text();
    } else {
      const https = require('https');
      const options = {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      };
      text = await new Promise((resolve, reject) => {
        const req = https.request('https://api.openai.com/v1/dashboard/billing/credit_grants', options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.end();
      });
    }
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(text);
    }
  } catch (e) {
    console.error('FETCH_ERROR', e && e.message ? e.message : String(e));
    process.exit(1);
  }
})();
