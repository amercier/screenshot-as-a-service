import express from 'express';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import util from 'util';

const { join } = path;
const { promisify } = util;
const readFile = promisify(fs.readFile);

const asyncMiddleware = fn => (request, response, next) => {
  Promise.resolve(fn(request, response, next)).catch(next);
};

async function startApp(config) {
  const { host, port, debug } = config;

  const browser = await puppeteer.launch();

  // await browser.close();

  const app = express();

  app.get('/screenshot', asyncMiddleware(async (request, response) => {

    try {
      const url = 'https://example.com';

      // Open page
      const page = await browser.newPage();
      await page.goto(url);

      // Take screenshot
      const path = join(config.temp, 'screenshot.png');
      await page.screenshot({ path });

      // Write response
      const img = await readFile(path);
      response.writeHead(200, { 'Content-Type': 'image/png' });
      if (config.cors) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Expose-Headers', 'Content-Type');
      }
      response.end(img, 'binary');
    }
    catch (e) {
      response.writeHead(500);
      const body = { error: e.message };
      if (debug) {
        body.trace = e.trace;
      }
      response.end(JSON.stringify(body));
    }
  }));

  // Start listening
  app.listen(port, host, () => {
    config.logger.log(`Server listening on ${host}:${port}${debug ? ' with debugging mode enabled' : ''}`);
  });

  return { app, browser };
}

startApp({
  port: process.env.PORT || 8000,
  host: process.env.HOST || '0.0.0.0',
  debug: process.env.DEBUG === 'true' || false,
  temp: '/tmp',
  logger: console,
});
