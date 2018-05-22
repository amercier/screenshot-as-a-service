screenshot-as-a-service
=======================

> Website screenshot service powered by [Node.js][nodejs] and and [Google Chrome Pupeeteer][pupeeteer].


Requirements
------------

- [Node.js][nodejs] with [NPM][npm] v5+


Installation
------------

```sh
npm install
```

Start server
------------

```sh
npm start
```

This start an Express server listening to port **8000** on all interfaces (**0.0.0.0**). Use `PORT` and `HOST` variable if you need to specify custom values.

Usage
-----

URL: `http://localhost:8000/screenshot`

| Parameter | Required | Type | Description |
| --------- | :------: | ---- | ----------- |
| `url`     | ✓ | URL     | URL of the page to capture |
| `width`   |   | Integer | Viewport width. Defaults to 1280. |
| `height`  |   | Integer | Viewport height. Defaults to 720. |

**Note:** parameters should be URL-encoded. Use [URL Encoder](https://tools.amercier.com/url-encoder) if needed.

### Examples

- `http://example.org/` with default settings:
http://localhost:8000/screenshot?url=http%3A%2F%2Fexample.org%2F

- `https://www.google.com/` at 800x600: http://localhost:8000/screenshot?url=https%3A%2F%2Fgoogle.com%2F&width=800&height=600

### Live examples

- `http://example.org/` with default settings:
https://screenshots.amercier.com/screenshot?url=http%3A%2F%2Fexample.org%2F

- `https://www.google.com/` at 800x600: https://screenshots.amercier.com/screenshot?url=https%3A%2F%2Fgoogle.com%2F&width=800&height=600



License
-------

This project is released under [ISC License](LICENSE.md).


[nodejs]: https://nodejs.org/
[pupeeteer]: https://github.com/GoogleChrome/puppeteer
[npm]: https://www.npmjs.com/
