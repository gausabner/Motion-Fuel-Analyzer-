// render.js - headless Chromium helper for build_report.py (Node 18+, Playwright 1.42+).
//   node render.js mermaid <mermaid.min.js> <outDir> <file1.mmd> [file2.mmd ...]  -> <name>.svg + <name>.png (2.5x)
//   node render.js pdf <report.html> <out.pdf> [--no-footer]                      -> A4 PDF with outline (bookmarks)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const THEME = {
  primaryColor: '#EAF2FC', primaryBorderColor: '#2A78D6', primaryTextColor: '#0B0B0B', lineColor: '#52514E',
  secondaryColor: '#FDEEE6', tertiaryColor: '#F9F9F7', fontFamily: 'Inter, Arial, sans-serif', fontSize: '14px',
};

async function mermaidMode(browser, mermaidJs, outDir, files) {
  const page = await browser.newPage({ deviceScaleFactor: 2.5, viewport: { width: 2400, height: 2400 } });
  await page.setContent('<html><body style="margin:0;background:#ffffff"><div id="c" style="display:inline-block;padding:8px;background:#fff"></div></body></html>');
  await page.addScriptTag({ path: mermaidJs });
  await page.evaluate((theme) => {
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: theme,
      flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis', nodeSpacing: 34, rankSpacing: 46 },
      er: { useMaxWidth: false, layoutDirection: 'TB', minEntityWidth: 90, entityPadding: 10 },
    });
  }, THEME);
  const sizes = {};
  for (const f of files) {
    const name = path.basename(f, '.mmd');
    const code = fs.readFileSync(f, 'utf8');
    const svg = await page.evaluate(async ({ id, code }) => (await mermaid.render(id, code)).svg,
      { id: 'mmd_' + name.replace(/\W/g, '_'), code });
    fs.writeFileSync(path.join(outDir, name + '.svg'), svg);
    await page.evaluate((svg) => { document.getElementById('c').innerHTML = svg; }, svg);
    const box = await page.$eval('#c svg', (el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    await (await page.$('#c')).screenshot({ path: path.join(outDir, name + '.png') });
    sizes[name] = { w: Math.round(box.w + 16), h: Math.round(box.h + 16) };
    console.log(`mermaid ${name}: ${sizes[name].w} x ${sizes[name].h}`);
  }
  fs.writeFileSync(path.join(outDir, 'mermaid_sizes.json'), JSON.stringify(sizes, null, 1));
}

async function pdfMode(browser, html, out, noFooter) {
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(html), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const footer = `<div style="width:100%;font-family:Inter,Arial,sans-serif;font-size:7.5px;color:#52514E;padding:0 16mm;display:flex;justify-content:space-between">
      <span>Green Basket cc - Agriculture Division | ABI820S group project | 28 October 2026</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
  await page.pdf({
    path: out, format: 'A4', printBackground: true, outline: true, tagged: true,
    margin: { top: '16mm', bottom: noFooter ? '12mm' : '18mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: !noFooter, headerTemplate: '<div></div>', footerTemplate: noFooter ? '<div></div>' : footer,
  });
  console.log('pdf written', out);
}

(async () => {
  const [mode, ...args] = process.argv.slice(2);
  const browser = await chromium.launch();
  try {
    if (mode === 'mermaid') await mermaidMode(browser, args[0], args[1], args.slice(2));
    else if (mode === 'pdf') await pdfMode(browser, args[0], args[1], args.includes('--no-footer'));
    else throw new Error('usage: render.js mermaid|pdf ...');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
