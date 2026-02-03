require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

module.exports = {
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'whatsgpt-secret-change-in-production',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  xaiApiKey: process.env.XAI_API_KEY || process.env.GROK_API_KEY || '',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  dataDir: process.env.DATA_DIR || require('path').resolve(__dirname, '../../data'),
  uploadsDir: process.env.UPLOADS_DIR || require('path').resolve(__dirname, '../../uploads'),
  chromiumPath: process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || null,
};
