#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const AUTH_DIR = path.join(process.cwd(), 'playwright', '.auth');
const AUTH_FILE = path.join(AUTH_DIR, 'x.json');

function ensureAuthDir() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function normalizeUser(user) {
  return String(user).trim().replace(/^@+/, '').toLowerCase();
}

function toAbsoluteXUrl(input) {
  if (/^https?:\/\//i.test(input)) return input;
  return `https://x.com/${String(input).replace(/^\/+/, '')}`;
}

async function createContext({ headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext(
    fs.existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {}
  );
  const page = await context.newPage();
  return { browser, context, page };
}

async function saveAuthState(context) {
  ensureAuthDir();
  await context.storageState({ path: AUTH_FILE });
}

async function login() {
  const { browser, context, page } = await createContext({ headless: false });
  try {
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded' });

    console.log('');
    console.log('Log in manually in the opened browser window.');
    console.log('When you are fully logged in and the home timeline is visible, press Enter here.');
    console.log('');

    await waitForEnter();

    await saveAuthState(context);
    console.log(`Saved auth state to ${AUTH_FILE}`);
  } finally {
    await browser.close();
  }
}

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => resolve());
  });
}

async function gotoProfile(page, user) {
  const screenName = normalizeUser(user);
  await page.goto(`https://x.com/${screenName}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  return screenName;
}

async function getProfileUserId(page) {
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href').catch(() => null);
  if (!canonical) return null;
  const m = canonical.match(/x\.com\/([^/?#]+)/i);
  return m ? normalizeUser(m[1]) : null;
}

async function userExists(page, user) {
  await gotoProfile(page, user);
  const current = await getProfileUserId(page);
  return current === normalizeUser(user);
}

async function openFollowing(page, user) {
  const screenName = normalizeUser(user);
  await page.goto(`https://x.com/${screenName}/following`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function scrapeVisibleScreenNames(page) {
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('href')).filter(Boolean)
  );

  const names = new Set();
  for (const href of hrefs) {
    const m = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/)?$/);
    if (m) names.add(m[1].toLowerCase());
  }
  return names;
}

async function checkFollowsAll(page, sourceUser, targets, maxScrolls = 20) {
  const wanted = new Set(targets.map(normalizeUser));
  const found = new Set();

  await openFollowing(page, sourceUser);

  for (let i = 0; i < maxScrolls && found.size < wanted.size; i++) {
    const visible = await scrapeVisibleScreenNames(page);
    for (const name of visible) {
      if (wanted.has(name)) found.add(name);
    }

    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(1200);
  }

  const missing = [...wanted].filter((u) => !found.has(u));
  return {
    ok: missing.length === 0,
    found: [...found].sort(),
    missing,
  };
}

async function searchMention(page, sourceUser, targetUser) {
  const source = normalizeUser(sourceUser);
  const target = normalizeUser(targetUser);

  const query = encodeURIComponent(`from:${source} @${target}`);
  await page.goto(`https://x.com/search?q=${query}&src=typed_query&f=live`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const bodyText = await page.locator('body').innerText().catch(() => '');
  const found = bodyText.toLowerCase().includes(`@${target}`);

  return {
    ok: found,
    query: `from:${source} @${target}`,
  };
}

async function checkRepostedTweet(page, sourceUser, tweetUrl, maxScrolls = 12) {
  const source = normalizeUser(sourceUser);
  const url = toAbsoluteXUrl(tweetUrl).replace(/\/$/, '');

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const repostLink = page.locator('a[href*="/retweets"], a[href*="/retweets/with_comments"]').first();
  const count = await repostLink.count();

  if (count === 0) {
    return {
      ok: false,
      reason: 'Could not find the reposts/retweets link on the tweet page.',
    };
  }

  const href = await repostLink.getAttribute('href');
  if (!href) {
    return {
      ok: false,
      reason: 'Found reposts link but could not read its URL.',
    };
  }

  const listUrl = href.startsWith('http') ? href : `https://x.com${href}`;
  await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  for (let i = 0; i < maxScrolls; i++) {
    const visible = await scrapeVisibleScreenNames(page);
    if (visible.has(source)) {
      return { ok: true };
    }

    await page.mouse.wheel(0, 2200);
    await page.waitForTimeout(1200);
  }

  return {
    ok: false,
    reason: 'User not found in the visible reposters list.',
  };
}

function usage() {
  console.log(`
Usage:
  node x-checker.js login
  node x-checker.js follows <sourceUser> <target1,target2,target3>
  node x-checker.js mentioned <sourceUser> <targetUser>
  node x-checker.js reposted <sourceUser> <tweetUrl>

Examples:
  node x-checker.js login
  node x-checker.js follows jack elonmusk,github,vercel
  node x-checker.js mentioned jack github
  node x-checker.js reposted jack https://x.com/someuser/status/1234567890
`.trim());
}

async function main() {
  const [, , cmd, ...args] = process.argv;

  if (!cmd) {
    usage();
    process.exit(1);
  }

  if (cmd === 'login') {
    await login();
    return;
  }

  if (!fs.existsSync(AUTH_FILE)) {
    console.error(`Missing auth file: ${AUTH_FILE}`);
    console.error('Run: node x-checker.js login');
    process.exit(1);
  }

  const { browser, page } = await createContext({ headless: true });

  try {
    if (cmd === 'follows') {
      const [sourceUser, csvTargets] = args;
      if (!sourceUser || !csvTargets) {
        usage();
        process.exit(1);
      }

      const targets = csvTargets.split(',').map((s) => s.trim()).filter(Boolean);
      const result = await checkFollowsAll(page, sourceUser, targets);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (cmd === 'mentioned') {
      const [sourceUser, targetUser] = args;
      if (!sourceUser || !targetUser) {
        usage();
        process.exit(1);
      }

      const result = await searchMention(page, sourceUser, targetUser);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (cmd === 'reposted') {
      const [sourceUser, tweetUrl] = args;
      if (!sourceUser || !tweetUrl) {
        usage();
        process.exit(1);
      }

      const result = await checkRepostedTweet(page, sourceUser, tweetUrl);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    usage();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});