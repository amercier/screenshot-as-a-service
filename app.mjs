import express from 'express';
import validator from 'express-validator/check';
import fs from 'fs';
import util from 'util';

import ScreenshotService from './lib/ScreenshotService';

const { check, validationResult } = validator;
const { promisify } = util;
const readFile = promisify(fs.readFile);

const asyncMiddleware = fn => (request, response, next) => {
  Promise.resolve(fn(request, response, next)).catch(next);
};

async function startServer(config) {
  const { host, port, debug, logger, cacheTimeout, imageType } = config;

  const app = express();
  const screenshotService = new ScreenshotService({ cacheTimeout, logger, imageType });
  await screenshotService.start();

  app.get('/screenshot', [
    check('url').exists().withMessage('Missing "url" parameter'),
    check('url').isURL().withMessage('Invalid "url" parameter: must be an URL'),
    asyncMiddleware(async (request, response) => {
      const errors = validationResult(request);
      if (!errors.isEmpty()) {
        return response.status(400).json({ errors: errors.mapped() });
      }

      try {
        const url = request.query.url;

        // Take screenshot
        const path = await screenshotService.takeScreenshot({ url });

        // Write response
        const img = await readFile(path);
        response.writeHead(200, { 'Content-Type': `image/${imageType}` });
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
          body.stack = e.stack.split('\n');
        }
        response.end(JSON.stringify(body, null, debug ? 2 : 0));
      }
    }),
  ]);

  // Start listening
  const server = app.listen(port, host, () => {
    logger.log(`Server listening on ${host}:${port}${debug ? ' with debugging mode enabled' : ''}`);
  });

  return { app, server, screenshotService };
}

const env = process.env.NODE_ENV || 'development';

let server, screenshotService;

startServer({
  port: process.env.PORT || 8000,
  host: process.env.HOST || '0.0.0.0',
  debug: env === 'development' || false,
  logger: console,
  cacheTimeout: env === 'development' ? 5000 : 3600000,
  imageType: 'jpeg',
}).then(instances => {
  server = instances.server;
  screenshotService = instances.screenshotService;
});

async function stopApp() {
  if (screenshotService) {
    try {
      await screenshotService.stop();
      console.log('Stopped screenshot service gracefully');
      process.exit(0);
    } catch(error) {
      console.error(`Could not stop screenshot service gracefully: ${error}`);
      process.exit(1);
    }
  }
}

process.on('SIGTERM', stopApp);
process.on('SIGINT', stopApp);
