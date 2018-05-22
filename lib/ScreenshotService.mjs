import fse from 'fs-extra';
import md5 from 'md5';
import osTmpdir from 'os-tmpdir';
import path from 'path';
import puppeteer from 'puppeteer';

const { join } = path;
const { ensureDir, exists, pathExists, readFile, remove, stat } = fse;

/**
 * A service that spawns an instance of Pupeteer and allows taking screenshots
 * of web pages.
 *
 * Typical usage:
 * ```js
 * async function example() {
 *   const screenshotService = new ScreenshotService({ cacheTimeout: 60*60e3 }); // 1h
 *   await screenshotService.start(); // Spawns a browser instance
 *
 *   const url = 'http://example.org';
 *   const path = await screenshotService.takeScreenshot({ url });
 *   console.log(`Screenshot of ${url} saved at ${path}`);
 *
 *   await screenshotService.stop(); // Destroys the browser instance
 * }
 * ```
 *
 * FIXME Garbage collection
 * TODO Resolution settings
 * TODO Clip settings
 */
export default class ScreenshotService {

  /**
   * Create an instance of `ScreenshotService`
   * @param {string}  [tempDir] Temporary directory to store screenshots.
   * @param {object}  [logger=console] A logger. Should have a `log()` member function.
   * @param {number}  [cacheTimeout=0] Number in milliseconds to retain screenshots. `0` disables cache.
   * @param {string}  [imageType='jpg'] Image format: 'jpeg' or 'png'
   * @param {boolean} [disableSandbox=false] Disable sandboxing
   * @throws An error if `imageType` is not supported
   */
  constructor({
    tempDir = osTmpdir(),
    logger = console,
    cacheTimeout = 0,
    imageType = 'png',
    disableSandbox = false,
  }) {
    if (['jpeg', 'png'].indexOf(imageType) === -1) {
      throw new Error(`Unsupported image type "${imageType}": should be either "jpeg" or "png".`);
    }
    this.settings = { tempDir, logger, cacheTimeout, imageType, disableSandbox };
    this.tempDir = join(tempDir, 'screenshot-service', `${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  }

  /**
   * Spawn a browser instance
   * @return {Promise} [description]
   */
  async start() {
    const args = this.settings.disableSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : undefined;
    this.browser = await puppeteer.launch(args && { args });
    if (await pathExists(this.tempDir)) {
      throw new Exception(`Temporary directory "${this.tempDir}" aleady exists`);
    }
    await ensureDir(this.tempDir);
  }

  /**
   * Destroy the browser instance created during `start()` if any, do nothing
   * otherwise.
   * @return {Promise} [description]
   */
  async stop() {
    if (this.browser) {
      await this.browser.close();
    }
    if (await pathExists(this.tempDir)) {
      await remove(this.tempDir);
    }
  }

  /**
   * Destroy the browser instance created during `start()` if any, and spawns a
   * new one.
   * @return {Promise} [description]
   */
  async restart() {
    await this.stop();
    await this.start();
  }

  /**
   * Generate a unique screenshot path from a screenshot context.
   * @param {object} context Screenshot context (URL and settings)
   * @return {string} Returns the unique path for the given context
   */
  getScreenshotPath(context) {
    const filename = md5(JSON.stringify(context));
    const extension = { jpeg: 'jpg' }[this.settings.imageType] || this.settings.imageType;
    return join(this.tempDir, `${filename}.${extension}`);
  }

  /**
   * Determine whether a valid screenshot file exists in cache.
   * @param {string} path Screenshot path
   * @return {boolean} Returns `true` if a screenshot exists and has not expired
   * regarding to the `cacheTimeout` setting.
   */
  async isScreenshotCacheValid(path) {
    if (! await exists(path)) {
      return false;
    }

    const { mtimeMs } = await stat(path);
    return Date.now() < mtimeMs + this.settings.cacheTimeout;
  }

  /**
   * Open a new browser tab, visit the given URL, and take a screenshot. If a
   * screenshot already exists for the same URL and settings, and has not
   * expired regarding to the `cacheTimeout` setting, then it returns that
   * screenshot instead.
   * @param {object} context Screenshot URL and settings
   * @return {string} Return the path to the screenshot file.
   * @throws An error if the service has not been previously started.
   */
  async takeScreenshot(context) {
    if (!this.browser) {
      throw new Error('Screenshot service is not started');
    }

    const { logger } = this.settings;
    const path = this.getScreenshotPath(context);

    if (await this.isScreenshotCacheValid(path)) {
      logger.log(`Reusing cached screenshot for ${JSON.stringify(context)}: ${path}`);
    }
    else {
      const { url, width, height } = context;

      // Open page and visit URL
      logger.log('Creating tab');
      const page = await this.browser.newPage();

      logger.log(`Setting viewport size to ${width}x${height}`);
      await page.setViewport({ width, height });

      logger.log(`Going to URL ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2' });

      // Take screenshot
      logger.log('Taking screenshot');
      await page.screenshot({ path });

      logger.log('Done');
    }

    return path;
  }
}
