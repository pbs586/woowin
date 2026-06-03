/* ════════════════════════════════════════════════════════════════
   엑셀 → data.json + index.html(베이크) 변환기
   - 개표현황.xlsx           → 시군별 우상호/김진태 득표수 · 개표율
   - 투표현황 …강원도.xlsx   → 시군별 최종 투표자수(turnout, 확정값)
   - 대시보드 스키마 {code:{progress,dpk,ppp,turnout}} 로 변환
   - output/data.json 생성(서버/Pages 폴링용) + index.html LIVE_DATA 주입(file://용)

   사용법:
     node xlsx2json.js            # 1회 변환
     node xlsx2json.js --watch    # 엑셀 저장 시 자동 변환

   ※ 개표현황.xlsx 컬럼: 구시군명|선거인수|투표수|우상호|김진태|계|무효|기권|개표율(%)
      · 득표수=정수, 개표율=퍼센트 숫자(예: 85.34)
   ════════════════════════════════════════════════════════════════ */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const GAP_FILE  = path.join(__dirname, '개표현황.xlsx');
const VOTE_FILE = path.join(__dirname, '투표현황 제9회 지방선거 강원도.xlsx');
const OUT_JSON  = path.join(__dirname, 'data.json');
const INDEX     = path.join(__dirname, 'index.html');

const NAME2CODE = {
  '춘천시':'cw','원주시':'wj','강릉시':'gn','동해시':'dh','태백시':'tb','속초시':'sc',
  '삼척시':'samc','홍천군':'hc','횡성군':'hs','영월군':'yw','평창군':'pc','정선군':'js',
  '철원군':'cwn','화천군':'hch','양구군':'yg','인제군':'ij','고성군':'gs','양양군':'yy'
};
const COL = { name:0, dpk:3, ppp:4, prog:8 };

const toInt  = v => Math.max(0, parseInt(String(v).replace(/[^0-9.-]/g,''),10) || 0);
const toProg = v => Math.min(100, Math.max(0, parseFloat(String(v).replace(/[^0-9.-]/g,'')) || 0)); // 퍼센트 숫자 그대로

function readGae(){
  const wb = XLSX.readFile(GAP_FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1,blankrows:false,defval:''});
  const out={};
  for(const r of rows){
    const code = NAME2CODE[String(r[COL.name]||'').trim()];
    if(!code) continue;
    out[code] = { progress: toProg(r[COL.prog]), dpk: toInt(r[COL.dpk]), ppp: toInt(r[COL.ppp]) };
  }
  return out;
}

function readTurnout(){
  if(!fs.existsSync(VOTE_FILE)) return {};
  const wb = XLSX.readFile(VOTE_FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1,blankrows:false,defval:''});
  // 서브헤더(3번째 행)에서 '계' 컬럼들 중 마지막 = 최종 누계 투표자수
  const sub = rows[2] || [];
  const gyeIdx = []; sub.forEach((c,i)=>{ if(String(c).trim()==='계') gyeIdx.push(i); });
  const last = gyeIdx[gyeIdx.length-1];
  const out={};
  if(last==null) return out;
  for(const r of rows){
    const code = NAME2CODE[String(r[0]||'').trim()];
    if(!code) continue;
    out[code] = toInt(r[last]);
  }
  return out;
}

function convert(){
  const gae = readGae();
  const turn = readTurnout();
  const data = { _updatedAt:new Date().toISOString(), _source:'개표현황.xlsx + 투표현황.xlsx' };
  let n=0;
  for(const code of Object.values(NAME2CODE)){
    const g = gae[code] || {progress:0,dpk:0,ppp:0};
    data[code] = { progress:g.progress, dpk:g.dpk, ppp:g.ppp, turnout: turn[code] || 0 };
    n++;
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(data,null,2));

  if(fs.existsSync(INDEX)){
    let html=fs.readFileSync(INDEX,'utf-8');
    const re=/\/\*LIVE_DATA_START\*\/[\s\S]*?\/\*LIVE_DATA_END\*\//;
    if(re.test(html)){ html=html.replace(re,`/*LIVE_DATA_START*/${JSON.stringify(data)}/*LIVE_DATA_END*/`); fs.writeFileSync(INDEX,html); }
    else console.warn('  ⚠ index.html LIVE_DATA 마커 없음(베이크 건너뜀)');
  }

  const ent=Object.entries(data).filter(([k])=>!k.startsWith('_'));
  const sD=ent.reduce((s,[,v])=>s+v.dpk,0), sP=ent.reduce((s,[,v])=>s+v.ppp,0), sT=ent.reduce((s,[,v])=>s+v.turnout,0);
  console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ${n}시군 · 우상호 ${sD.toLocaleString()} : 김진태 ${sP.toLocaleString()} · 총투표자 ${sT.toLocaleString()} → data.json + index.html`);
}

// 엑셀 저장(파일 교체)에도 안 끊기도록 '폴더'를 감시하고 파일명으로 필터
function startWatch(){
  console.log('● 엑셀 감시 시작 — 개표현황.xlsx 저장 시 자동 반영');
  let t=null; const rerun=()=>{ clearTimeout(t); t=setTimeout(()=>{ try{convert();}catch(e){console.error(e.message);} }, 700); };
  fs.watch(__dirname, (ev, fname)=>{ if(fname && (fname.includes('개표현황') || fname.includes('투표현황'))) rerun(); });
}

module.exports = { convert, startWatch };

// 단독 실행(node xlsx2json.js [--watch])
if(require.main===module){
  try{ convert(); }catch(e){ console.error('변환 오류:', e.message); }
  if(process.argv.includes('--watch')) startWatch();
}
