/* ════════════════════════════════════════════════════════════════
   강원특별자치도지사 개표 실시간 크롤러 (Playwright)
   - info.nec.go.kr 개표진행상황 페이지를 헤드리스 브라우저로 조회
   - 시도지사선거(3) × 강원특별자치도(5200) → 18개 시군 표 스크래핑
   - 내부 스키마 {code:{progress,dpk,ppp}} 로 output/data.json 생성
   - 대시보드(index.html)는 소스=폴링 으로 ./data.json 을 주기적으로 읽음

   실행:
     npm i playwright && npx playwright install chromium   (최초 1회)
     node crawler.js                 # 60초 간격 폴링
     node crawler.js --once          # 1회만
     node crawler.js --show          # 브라우저 보이게(디버깅)
     node crawler.js --interval=30   # 간격(초) 지정
   ════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const URL = 'https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP09';
const ELECTION_CODE = '3';     // 시·도지사선거
const CITY_CODE = '5200';      // 강원특별자치도
const OUT = process.env.OUT || path.join(__dirname, 'data.json');

// NEC 표기 시군명 → 대시보드 코드
const NAME2CODE = {
  '춘천시':'cw','원주시':'wj','강릉시':'gn','동해시':'dh','태백시':'tb','속초시':'sc',
  '삼척시':'samc','홍천군':'hc','횡성군':'hs','영월군':'yw','평창군':'pc','정선군':'js',
  '철원군':'cwn','화천군':'hch','양구군':'yg','인제군':'ij','고성군':'gs','양양군':'yy'
};
// 시군별 최종 투표자수(확정) — 대시보드 예측/승률 계산용 (투표현황 강원도 기준)
const TURNOUT = {
  cw:157330, wj:185486, gn:115761, dh:47110, tb:22671, sc:44102, samc:37601, hc:39965, hs:29256,
  yw:23335, pc:26211, js:23534, cwn:24024, hch:14210, yg:12816, ij:18980, gs:17413, yy:18213
};

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const SHOW = args.includes('--show');
const INTERVAL = (parseInt((args.find(a=>a.startsWith('--interval='))||'').split('=')[1]) || 60) * 1000;

async function selectAndSearch(page){
  // 1) 선거종류=시도지사 세팅 (jQuery 또는 DOM 조작)
  await page.evaluate(c => {
    if (typeof $ === 'function') {
      $('#electionCode').val(c).trigger('change');
    } else {
      const el = document.getElementById('electionCode');
      if (el) { el.value = c; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    if (typeof setElectionCode === 'function') setElectionCode(+c);
  }, ELECTION_CODE);
  await page.waitForTimeout(1500);

  // 2) 시도=강원 세팅 (jQuery 또는 DOM 조작)
  await page.evaluate(c => {
    if (typeof $ === 'function') {
      $('#cityCode').val(c).trigger('change');
    } else {
      const el = document.getElementById('cityCode');
      if (el) { el.value = c; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }, CITY_CODE);
  await page.waitForTimeout(1500);

  // 3) 검색 실행 — 합성클릭이 아니라 '신뢰된 실제 클릭(force)'이어야 사이트 핸들러가 동작
  let ok=false;
  for(const sel of ['#spanSubmit input[type=image]','#spanSubmit img','#spanSubmit a','a[onclick*="fn_commonSearch"]']){
    const el=await page.$(sel);
    if(el){ try{ await el.click({force:true, timeout:3000}); ok=true; break; }catch(e){} }
  }
  if(!ok) await page.evaluate(()=>{ const f=document.getElementById('searchForm'); if(f) f.submit(); });

  // 4) 시군 표가 그려질 때까지 대기
  await page.waitForFunction(() => [...document.querySelectorAll('table')].some(t => /춘천시|원주시/.test(t.innerText)), { timeout: 20000 })
    .catch(() => console.warn('  ⚠ 표 대기 타임아웃(데이터 미개표일 수 있음)'));
}

function num(s){ return parseInt(String(s).replace(/[^0-9]/g,''),10) || 0; }
function pct(s){ const m=String(s).match(/(\d+(\.\d+)?)/); return m?parseFloat(m[1]):0; }

async function extract(page){
  return await page.evaluate(({NAME2CODE})=>{
    const names=Object.keys(NAME2CODE);
    // 시군명이 들어있는 표 찾기
    const table=[...document.querySelectorAll('table')].find(t=>names.some(n=>t.innerText.includes(n)));
    if(!table) return {error:'표 없음', tablesHtml:[...document.querySelectorAll('table')].slice(0,3).map(t=>t.outerHTML.slice(0,400))};
    const rows=[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(c=>c.innerText.trim().replace(/\s+/g,' ')));
    
    // 테이블 헤더가 2단 이상일 수 있으므로 처음 몇 개 행을 수직 결합하여 대표 헤더 생성
    const maxHeaderRows = 3;
    const numCols = Math.max(...rows.slice(0, maxHeaderRows).map(r => r.length));
    const mergedHeader = Array(numCols).fill('');
    
    for (let c = 0; c < numCols; c++) {
      let cellText = '';
      for (let r = 0; r < Math.min(rows.length, maxHeaderRows); r++) {
        // 실제 데이터 행(시군명이 들어간 행)에 도달하면 헤더 병합 중지
        const isDataRow = names.some(n => rows[r].some(val => val.replace(/\s/g,'') === n || val.includes(n)));
        if (isDataRow) break;
        if (rows[r] && rows[r][c]) {
          cellText += (cellText ? ' ' : '') + rows[r][c];
        }
      }
      mergedHeader[c] = cellText;
    }
    
    // NEC 시도지사 개표표는 헤더에 colspan(후보자별 득표수)이 있어 헤더-데이터 컬럼이 어긋난다.
    // 데이터행은 고정 구조: 0시군 1선거인수 2투표수 3우상호 4김진태 5계 6무효 7기권 8개표율
    const idx={ dpk:3, ppp:4, prog:8 };
    
    const out={}, rawRows=[];
    rows.forEach(r=>{
      const nm=names.find(n=>r.some(c=>c.replace(/\s/g,'')===n || c.includes(n)));
      if(!nm) return;
      
      const progVal = idx.prog < r.length ? r[idx.prog] : null;
      const dpkVal = idx.dpk < r.length ? r[idx.dpk] : null;
      const pppVal = idx.ppp < r.length ? r[idx.ppp] : null;
      
      out[NAME2CODE[nm]] = { _row:r, prog:progVal, dpk:dpkVal, ppp:pppVal };
      rawRows.push([nm,...r]);
    });
    return { header: mergedHeader, idx, out, rawRows, tableHtml: table.outerHTML.slice(0,4000) };
  }, {NAME2CODE});
}

async function runOnce(page, debug){
  await selectAndSearch(page);
  const ex = await extract(page);
  if(ex.error){
    console.warn('  ✗ 파싱 실패:', ex.error);
    fs.writeFileSync(path.join(__dirname,'table_debug.html'), JSON.stringify(ex,null,2));
    return null;
  }
  // 디버그: 헤더/인덱스 확인 (개표 첫날 한 번 점검용)
  if(debug){
    console.log('  헤더:', JSON.stringify(ex.header));
    console.log('  컬럼 idx(prog,dpk,ppp):', JSON.stringify(ex.idx));
    fs.writeFileSync(path.join(__dirname,'table_debug.html'), ex.tableHtml);
  }
  const data={ _updatedAt:new Date().toISOString(), _source:'info.nec.go.kr', _election:'0020260603' };
  let n=0;
  for(const [code,v] of Object.entries(ex.out)){
    if(code.startsWith('_')) continue;
    data[code]={ progress: Math.min(100,pct(v.prog)), dpk: num(v.dpk), ppp: num(v.ppp), turnout: TURNOUT[code]||0 };
    n++;
  }
  fs.writeFileSync(OUT, JSON.stringify(data,null,2));
  const tot=Object.entries(data).filter(([k])=>!k.startsWith('_'));
  const sumD=tot.reduce((s,[,r])=>s+r.dpk,0), sumP=tot.reduce((s,[,r])=>s+r.ppp,0);
  console.log(`  ✓ ${n}개 시군 저장 → ${OUT}  | 우상호 ${sumD.toLocaleString()} : 김진태 ${sumP.toLocaleString()}`);
  // GIT_PUSH=1 이면 data.json 을 깃허브로 자동 커밋·푸시 → GitHub Pages 자동 갱신
  if(process.env.GIT_PUSH==='1'){
    try{
      const rel=path.relative(__dirname, OUT).replace(/\\/g,'/');
      execSync(`git add "${rel}"`, {cwd:__dirname, stdio:'ignore'});
      execSync(`git commit -m "data ${new Date().toISOString()}"`, {cwd:__dirname, stdio:'ignore'});
      execSync('git push', {cwd:__dirname, stdio:'ignore'});
      console.log('  ↑ GitHub 푸시 완료 (Pages 자동 갱신)');
    }catch(e){ console.log('  (푸시 생략: 변경 없음 또는 git 인증 확인 필요)'); }
  }
  return data;
}

(async()=>{
  console.log(`[크롤러] 시작 · 간격 ${INTERVAL/1000}s · ${ONCE?'1회':'반복'} · headless ${!SHOW}`);
  const browser=await chromium.launch({headless:!SHOW});
  const ctx=await browser.newContext({locale:'ko-KR', userAgent:'Mozilla/5.0'});
  const page=await ctx.newPage();
  page.on('dialog', async d=>{ console.log('  (검증경고 무시:', d.message().slice(0,40)+')'); await d.accept().catch(()=>{}); });
  await page.goto(URL,{waitUntil:'networkidle',timeout:60000}).catch(e=>console.warn('goto',e.message));

  let first=true;
  async function tick(){
    const t=new Date().toLocaleTimeString('ko-KR');
    console.log(`[${t}] 조회…`);
    try{ await runOnce(page, first); }catch(e){ console.error('  에러:',e.message); }
    first=false;
  }
  await tick();
  if(ONCE){ await browser.close(); return; }
  setInterval(tick, INTERVAL);
  console.log('Ctrl+C 로 종료. 대시보드는 INPUT 패널에서 "폴링(크롤러)" 선택 → ./data.json');
})();
