// 文件數字驗算（審查用）：商店總價、波次 HP／敵人數、小妖 DPS、鏡頭視野、日期、稀有度、護甲。node scripts/audit/doc-math.mjs
const P=(l,v)=>console.log(l.padEnd(34),v);
// 1 shop
const price=(b,lv)=>Math.round(b*Math.pow(1.35,lv));
const sum=(b,n)=>Array.from({length:n},(_,i)=>price(b,i)).reduce((a,c)=>a+c,0);
const train=[50,50,50,50,50,60,40,70].map(b=>sum(b,8));
P('修行各項',train.join(','));P('修行合計',train.reduce((a,c)=>a+c));
const secret=[150+400+900,150+400+900,500+1500,300,1000,200+400+800+1600+3200,400,600,600,800];
P('秘術合計(表列)',secret.reduce((a,c)=>a+c));
const pool=600+1500+6000+480+3500;P('卡池合計(含4張延伸+3→4選)',pool);
const total=train.reduce((a,c)=>a+c)+secret.reduce((a,c)=>a+c)+pool;P('商店總計',total);
P('不含終局3500',total-3500);
// 2 wave HP & enemy count
const avgPt=1.8, hpPt=14;
const T=n=>8+5*n;
for(const n of [1,5,10,15,20]){
  const hp=T(n)*hpPt*(1+0.12*(n-1));
  P(`波${n} T=${T(n)} HP`,`${hp.toFixed(0)} 目標DPS(20s)=${(hp*1.4/20).toFixed(0)} 敵人數≈${(T(n)/avgPt).toFixed(0)}（全村人上限${T(n)}）`);
}
let kills=0,sumT=0;for(let n=1;n<=20;n++){sumT+=T(n);}
P('全局T總和',sumT);P('全局擊殺≈',(sumT/avgPt).toFixed(0));
P('通關功德(首次)',12*20+sumT/avgPt/10+100+200);
// 3 DPS budget
const minion={wisp:[6,1.0],spring:[8,1.2],oni:[12,1.3],tanuki:[4,1.0],crow:[10,1.6]};
let base=0;for(const[k,[d,i]] of Object.entries(minion)){const v=d/i;const lv3=v*2.4;base+=lv3;P(`小妖${k} Lv1/Lv3 DPS`,`${v.toFixed(1)} / ${lv3.toFixed(1)}`);}
P('5種小妖全Lv3合計',base.toFixed(0));
P('文件假設 6隻×25',150);
P('領頭DPS 鬼火/水盤/金棒',`${(8/.8).toFixed(1)} / ${(10/1.1).toFixed(1)}(去回2次) / ${(22/1.4).toFixed(1)}`);
// 4 camera footprint
const d=22,fov=35*Math.PI/180,pitch=50*Math.PI/180;
for(const[a,l] of [[16/9,'橫16:9'],[19.5/9,'橫19.5:9'],[9/19.5,'直9:19.5'],[9/16,'直9:16']]){
  const w=2*d*Math.tan(fov/2)*a, h=2*d*Math.tan(fov/2)/Math.sin(pitch);
  P(`鏡頭 ${l}`,`水平可視≈${w.toFixed(1)}m 縱深≈${h.toFixed(1)}m`);
}
// 5 rarity
const w=(L,luck=0)=>{const m=1+luck/100;const c=100,r=Math.min(40,12+1.2*L)*m,e=Math.max(0,Math.min(16,L-4))*m,g=Math.max(0,Math.min(5,(L-10)*.4))*m;const t=c+r+e+g;return[c,r,e,g].map(x=>(100*x/t).toFixed(1)).join('/')};
for(const L of[1,5,10,20,30])P(`稀有度 L=${L}`,w(L));
P('15張無良以上機率 L=1',Math.pow(1-(1-100/ (100+13.2)),15).toFixed(3));
// 6 dates
const start=new Date('2026-11-09');const f=(wk)=>{const s=new Date(start.getTime()+(wk-1)*7*864e5);const e=new Date(s.getTime()+6*864e5);return s.toISOString().slice(5,10)+'–'+e.toISOString().slice(5,10)};
for(const wk of [1,2,3,4,7,8,11,12,15,16,17,20,21,22,23,25,26,27])P(`W${wk}`,f(wk));
// 7 armor
for(const A of [-20,-12,0,15,45,60])P(`護甲${A}倍率`,A>=0?Math.max(.25,1-A/(A+15)).toFixed(3):Math.min(1.8,1+Math.abs(A)/15).toFixed(3));
// 8 ward stone / altar multipliers
for(const[r,v] of [['凡',.2],['良',.32],['妖',.48],['神',.72]])P(`結界石${r} 傷害倍率`,((1+v)**2).toFixed(2));
// 9 speed
P('河童深水極限速度',(4.4*1.8*1.6).toFixed(1)+' m/s');
P('河童淺水淨倍率',(0.8*1.45).toFixed(2));P('赤鬼淺水淨倍率',(0.8*0.85).toFixed(2)+' 絕對速度 '+(3.6*0.68).toFixed(2));
P('河童泥濘淨倍率(乘法)',(0.7*0.9).toFixed(2));
