import asyncMiddleware from 'async-middleware';
import express from 'express';
import validator from 'express-validator/check';
import fs from 'fs';
import util from 'util';

import ScreenshotService from './lib/ScreenshotService';

const { wrap } = asyncMiddleware;
const { check, validationResult } = validator;
const { promisify } = util;
const readFile = promisify(fs.readFile);

/**
 * Create an error response body from an error
 * @param {Error} error An error
 * @param {boolean} showStackTraces Whether to include stack trace in the response
 * @return {Object} Response body
 */
function errorResponseBody(error, showStackTraces) {
  return Object.assign(
    { error: error.message },
    showStackTraces ? { stack: error.stack.split('\n') } : {}
  );
}

/**
 * Wrap a response handler that adds validation results checks and error
 * handling. In case of error, return a JSON response contanin
 * @param {function} handler Actual request handler. Can throw errors or return a Promise.
 * @param {boolean} showStackTraces Whether to display stack traces in case of handler error.
 * @return {function} Returns an Express-compatible middleware.
 */
function jsonRequestHandler(handler, showStackTraces) {
  return wrap(async (request, response) => {
    // If request check failed, returns HTTP 400
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      return response.status(400).json({ errors: errors.mapped() });
    }

    // Delegate request handling to actual handler
    try {
      return await handler(request, response);
    }
    // If actual handler fails, returns HTTP 500
    catch(error) {
      return response.status(500).json(errorResponseBody(error, showStackTraces));
    }
  });
}

async function startServer(config) {
  const { host, port, debug, logger, cacheTimeout, imageType, disableSandbox } = config;

  const app = express();
  if (debug) {
    app.set('json spaces', 2);
  }

  const screenshotService = new ScreenshotService({ cacheTimeout, logger, imageType, disableSandbox });
  await screenshotService.start();

  // /screenshot route
  app.get('/screenshot', [
    check('url').exists().withMessage('Missing "url" parameter'),
    check('url').isURL().withMessage('Invalid "url" parameter: must be an URL'),
    check('width').optional().isInt().withMessage('Invalid "width" parameter: must be an integer').toInt(),
    check('height').optional().isInt().withMessage('Invalid "height" parameter: must be an integer').toInt(),
    jsonRequestHandler(async (request, response) => {
      const { url, width, height } = Object.assign({}, config.defaults, request.query);

      // Take screenshot
      const path = await screenshotService.takeScreenshot({ url, width, height });

      // Write response
      const image = await readFile(path);
      response.writeHead(200, { 'Content-Type': `image/${imageType}` });
      if (config.cors) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Expose-Headers', 'Content-Type');
      }
      response.end(image, 'binary');
    }, debug)
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
  cacheTimeout: env === 'development' ? 1000 : 3600000,
  imageType: 'jpeg',
  disableSandbox: true,
  defaults: {
    width: 1280,
    height: 720,
  },
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
