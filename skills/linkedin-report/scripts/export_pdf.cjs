#!/usr/bin/env node
// Print the author's actual HTML. Requires playwright and Chromium.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--input', '--output', '--browser', '--expected-pages'].includes(key) || !argv[i + 1]) {
      throw new Error('Usage: export_pdf.cjs --input report.html --output report.pdf [--browser chrome] [--expected-pages N]');
    }
    result[key.slice(2)] = argv[++i];
  }
  if (!result.input || !result.output) throw new Error('--input and --output are required');
  if (result['expected-pages'] && !/^[1-9]\d*$/.test(result['expected-pages'])) throw new Error('--expected-pages must be a positive integer');
  return result;
}

function findBrowser(explicit) {
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`Browser not found: ${explicit}`);
    return explicit;
  }
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    : process.platform === 'win32'
      ? [path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe')]
      : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  return candidates.find(p => fs.existsSync(p)); // Otherwise Playwright's installed Chromium.
}

async function main() {
  const opt = args(process.argv.slice(2));
  const input = path.resolve(opt.input), output = path.resolve(opt.output);
  if (!fs.existsSync(input)) throw new Error(`HTML not found: ${input}`);
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { throw new Error('Install playwright (npm install playwright), or set NODE_PATH to its package directory.'); }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: findBrowser(opt.browser) });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    const response = await page.goto(pathToFileURL(input).href, { waitUntil: 'networkidle' });
    if (response && !response.ok()) throw new Error(`HTML load failed: ${response.status()}`);
    await page.emulateMedia({ media: 'print' });
    const diagnostics = await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, img => img.complete ? Promise.resolve() : new Promise((resolve, reject) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', () => reject(new Error(`Image failed: ${img.src}`)), { once: true });
      })));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const fontFaces = Array.from(document.fonts, font => ({ family: font.family, weight: font.weight, status: font.status }));
      const failedFonts = fontFaces.filter(font => font.status === 'error');
      const brokenImages = Array.from(document.images).filter(img => !img.naturalWidth).map(img => img.src);
      const sheets = Array.from(document.querySelectorAll('.page'));
      const issues = [];
      const pages = sheets.map((sheet, index) => {
        const bound = sheet.getBoundingClientRect();
        if (sheet.scrollHeight > sheet.clientHeight + 2 || sheet.scrollWidth > sheet.clientWidth + 2) {
          issues.push({ page: index + 1, type: 'scroll-overflow', scroll: [sheet.scrollWidth, sheet.scrollHeight], size: [sheet.clientWidth, sheet.clientHeight] });
        }
        const footer = sheet.querySelector('.page-footer');
        const footerTop = footer ? footer.getBoundingClientRect().top : bound.bottom;
        for (const el of sheet.querySelectorAll('*')) {
          if (['SCRIPT', 'STYLE'].includes(el.tagName) || footer?.contains(el) || el === footer) continue;
          const style = getComputedStyle(el), rect = el.getBoundingClientRect();
          if (style.display === 'none' || style.visibility === 'hidden' || !rect.width || !rect.height) continue;
          if (rect.left < bound.left - 2 || rect.right > bound.right + 2 || rect.top < bound.top - 2 || rect.bottom > bound.bottom + 2) {
            issues.push({ page: index + 1, type: 'outside-page', element: el.tagName, class: el.getAttribute('class') });
          }
          if (el.children.length === 0 && rect.bottom > footerTop - 5 && !el.closest('.decoration')) {
            issues.push({ page: index + 1, type: 'footer-collision', element: el.tagName, text: el.textContent.slice(0, 80) });
          }
          // Visible glyph ink can exceed a short line box without clipping.
          // Fail only if scroll overflow is actually constrained by this element.
          if ((style.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 2)
              || (style.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 2)) {
            issues.push({ page: index + 1, type: 'element-overflow', element: el.tagName, class: el.getAttribute('class') });
          }
        }
        return { page: index + 1, width: bound.width, height: bound.height, textCharacters: sheet.innerText.length };
      });
      return { title: document.title, fontStatus: document.fonts.status, fontFaces, failedFonts, brokenImages, pages, issues };
    });
    diagnostics.runtimeErrors = errors;
    diagnostics.expectedPages = opt['expected-pages'] ? Number(opt['expected-pages']) : diagnostics.pages.length || null;
    const diagnosticPath = output.replace(/\.pdf$/i, '') + '.export.json';
    fs.writeFileSync(diagnosticPath, JSON.stringify(diagnostics, null, 2) + '\n');
    if (diagnostics.issues.length || diagnostics.failedFonts.length || diagnostics.brokenImages.length || errors.length) {
      throw new Error(`HTML preflight failed (${diagnostics.issues.length} layout issues, ${diagnostics.failedFonts.length} failed fonts, ${errors.length} load errors); inspect ${diagnosticPath}`);
    }
    if (!diagnostics.pages.length) console.warn('No .page markers: DOM page-boundary checks unavailable. Verify PDF pagination with qa_pdf.py.');
    await page.pdf({ path: output, format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    console.log(JSON.stringify({ pdf: output, diagnostics: diagnosticPath, expectedPages: diagnostics.expectedPages }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
