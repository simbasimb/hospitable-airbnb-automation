const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 60000,
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
