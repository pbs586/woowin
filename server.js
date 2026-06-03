/* 개표방송 대시보드 서버
   - 기본(수동) 모드: 엑셀(개표현황/투표현황) → data.json 변환 + 실시간 감시 + 서빙
   - 크롤링 모드(NO_EXCEL=1): 엑셀 변환 끔. data.json 은 crawler.js 가 NEC에서 갱신.
   - output/ 정적 서버(:8123) + 브라우저 자동 오픈
   실행: 보통은 '개표방송_시작.bat'(수동) 또는 '개표방송_자동크롤링.bat'(자동) 더블클릭 */
const http = require('http'), fs = require('fs'), path = require('path');
const { exec } = require('child_process');
const { convert, startWatch } = require('./xlsx2json.js');

const PORT = 8123;
const URL = 'http://localhost:' + PORT;
const root = path.join(__dirname, 'output');
const types = { '.html':'text/html;charset=utf-8', '.json':'application/json;charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg' };
const openBrowser = () => { if (!process.env.NO_OPEN) exec('start "" ' + URL); };

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(root, p);
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(d);
  });
});

srv.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log('\n  이미 실행 중입니다. 브라우저에서 ' + URL + ' 를 여세요.\n');
    openBrowser();
    process.exit(0);
  } else { console.error(e.message); process.exit(1); }
});

srv.listen(PORT, () => {
  console.log('\n  대시보드 실행 중:  ' + URL);
  if (process.env.NO_EXCEL === '1') {
    console.log('  [자동 크롤링 모드] data.json 은 crawler.js 가 NEC에서 갱신합니다.');
  } else {
    try { convert(); } catch(e){ console.error('초기 변환 오류:', e.message); }   // 최초 1회 변환
    startWatch();                                                                 // 엑셀 실시간 감시
    console.log('  [수동 모드] 개표현황.xlsx 를 저장하면 화면이 자동 갱신됩니다.');
  }
  console.log('  (종료: 이 창 닫기)\n');
  openBrowser();
});
