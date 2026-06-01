const staticConfig = require('./app.json');

module.exports = {
  ...staticConfig.expo,
  extra: {
    ...staticConfig.expo.extra,
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  },
};
