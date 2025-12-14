// Vercel Serverless Function Entry Point
const app = require('../server');

// Vercel은 함수 형태로 export해야 함
module.exports = (req, res) => {
  app(req, res);
};
