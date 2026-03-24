const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const authToken = process.env.X_AUTH_TOKEN;
  const ct0 = process.env.X_CT0;

  if (!authToken || !ct0) {
    throw new Error('Set X_AUTH_TOKEN and X_CT0 environment variables');
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  const now = Math.floor(Date.now() / 1000);
  const expires = now + 3600 * 24 * 30;

  await context.addCookies([
    {
      name: 'auth_token',
      value: authToken,
      domain: '.x.com',
      path: '/',
      expires,
      httpOnly: true,
      secure: true,
      sameSite: 'None'
    },
    {
      name: 'ct0',
      value: ct0,
      domain: '.x.com',
      path: '/',
      expires,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax'
    }
  ]);

  const page = await context.newPage();
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });

  fs.mkdirSync(path.join('playwright', '.auth'), { recursive: true });
  await context.storageState({ path: path.join('playwright', '.auth', 'x.json') });

  console.log('Saved playwright/.auth/x.json');
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});