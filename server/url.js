import https from 'node:https';
import http from 'node:http';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import { AppError } from './errors.js';
export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export async function validateUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new AppError(400, 'INVALID_URL', 'Enter a valid HTTP or HTTPS URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new AppError(400, 'INVALID_URL', 'Use a public HTTP or HTTPS URL without credentials or custom ports.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try { addresses = await lookup(host, { all: true }); } catch { throw new AppError(422, 'URL_UNREACHABLE', 'The website address could not be resolved.'); }
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new AppError(400, 'PRIVATE_URL', 'Only public websites can be saved.');
  return { url, address: addresses[0] };
}
export async function fetchPage(value, redirects = 0) {
  if (redirects > 4) throw new AppError(422, 'URL_REDIRECTS', 'The website redirected too many times.');
  const { url, address } = await validateUrl(value);
  const result = await new Promise((resolve, reject) => {
    // Pin the validated DNS address so the request cannot re-resolve to a private IP.
    const req = (url.protocol === 'https:' ? https : http).get(url, {
      lookup: (_host, options, cb) => options.all ? cb(null, [address]) : cb(null, address.address, address.family),
      headers: { 'User-Agent': 'KnowledgeInbox/1.0', Accept: 'text/html,text/plain', 'Accept-Encoding': 'identity' }
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) { res.resume(); return resolve({ redirect: res.headers.location }); }
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return reject(new AppError(422, 'URL_FETCH_FAILED', `The website returned HTTP ${res.statusCode}.`)); }
      const type = res.headers['content-type'] || '';
      if (!/text\/(html|plain)/i.test(type)) { res.resume(); return reject(new AppError(422, 'UNSUPPORTED_CONTENT', 'Only HTML pages and plain-text URLs are supported.')); }
      let size = 0; const buffers = [];
      res.on('data', data => { size += data.length; if (size > 2_000_000) req.destroy(new AppError(422, 'PAGE_TOO_LARGE', 'This page exceeds the 2 MB limit.')); else buffers.push(data); });
      res.on('end', () => resolve({ raw: Buffer.concat(buffers).toString('utf8'), type }));
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new AppError(504, 'URL_TIMEOUT', 'The website took too long to respond.')), 12000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  }).catch(error => { if (error instanceof AppError) throw error; throw new AppError(422, 'URL_FETCH_FAILED', 'Could not read this website. It may block automated requests.'); });
  if ('redirect' in result) {
    if (!result.redirect) throw new AppError(422, 'URL_REDIRECTS', 'The website returned an invalid redirect.');
    return fetchPage(new URL(result.redirect, url).href, redirects + 1);
  }
  let content = result.raw, title = url.hostname;
  if (result.type.includes('html')) {
    const $ = load(result.raw);
    title = $('title').first().text().trim().slice(0, 180) || title;
    $('script,style,noscript,nav,header,footer,svg,form').remove();
    $('br').replaceWith('\n');
    $('p,div,section,article,h1,h2,h3,li').append('\n');
    content = ($('main').first().text() || $('article').first().text() || $('body').text()).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  }
  if (!content.trim()) throw new AppError(422, 'EMPTY_PAGE', 'No readable text was found. Try pasting a note instead.');
  if (content.length > 50000) throw new AppError(422, 'CONTENT_TOO_LONG', 'This page exceeds 50,000 characters. Save a shorter passage as a note.');
  return { content, rawContent: result.raw, title, url: url.href };
}
