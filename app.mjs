import express from 'express';
import fs from 'fs';
import md5 from 'md5';
import path from 'path';
import puppeteer from 'puppeteer';
import util from 'util';

const { join } = path;
const { promisify } = util;
const readFile = promisify(fs.readFile);
const exists = promisify(fs.exists);
const stat = promisify(fs.stat);

const asyncMiddleware = fn => (request, response, next) => {
  Promise.resolve(fn(request, response, next)).catch(next);
};

function getScreenshotPath(config, options) {
  const filename = md5(JSON.stringify(options));
  return join(config.temp, `${filename}.png`);
}

async function isScreenshotCacheValid(path, { cacheExpire }) {
  if (! await exists(path)) {
    return false;
  }

  const { mtimeMs } = await stat(path);
  return Date.now() < mtimeMs + cacheExpire;
}

async function startApp(config) {
  const { host, port, debug, logger } = config;

  const browser = await puppeteer.launch();

  const app = express();

  app.get('/screenshot', asyncMiddleware(async (request, response) => {

    try {
      const url = 'https://example.com';

      const options = { url };
      const path = getScreenshotPath(config, options);
      if (await isScreenshotCacheValid(path, config)) {
        logger.log(`Reusing cached screenshot for ${JSON.stringify(options)}: ${path}`);
      }
      else {
        // Open page
        logger.log(`Opening ${url}`);
        const page = await browser.newPage();
        await page.goto(url);

        // Take screenshot
        logger.log(`Taking screenshot of ${url}`);
        await page.screenshot({ path });
      }

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
    logger.log(`Server listening on ${host}:${port}${debug ? ' with debugging mode enabled' : ''}`);
  });

  return { app, browser };
}

const env = process.env.NODE_ENV || 'development';

startApp({
  port: process.env.PORT || 8000,
  host: process.env.HOST || '0.0.0.0',
  debug: env === 'development' || false,
  temp: '/tmp',
  logger: console,
  cacheExpire: env === 'development' ? 5000 : 3600000
});
