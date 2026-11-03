// 魂火／升級曲線驗算（docs/02 第 3.1 節）。node scripts/audit/xp-curve.mjs
const T=n=>8+5*n; const need=L=>6+2.5*L;
for (const pick of [1,0.8]) { let xp=0,L=0,out=[];
 for(let n=1;n<=20;n++){ xp+=T(n)*pick; let got=0; while(xp>=need(L+1)){xp-=need(L+1);L++;got++;} out.push(got);}
 console.log('拾取率',pick,'每波升級數',out.join(','),'總級',L);}
