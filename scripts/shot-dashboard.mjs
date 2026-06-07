import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:3090', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);
await p.screenshot({ path: '/home/xu/Develop/longTermProject/SimpleAgent/docs/online/grafana-dashboard.png' });
console.log('截图完成');
await b.close();
