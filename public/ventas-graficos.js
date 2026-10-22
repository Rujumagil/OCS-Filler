(()=>{
"use strict";
const root=document.getElementById("ocsCharts"),base=window.OCS_HISTORIC_OCT_2026;
if(!root||!base)return;
const money=n=>Number(n||0).toLocaleString("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0});
const kitchen=/CHILAQUILES|SANDWICH|CUERNITO|TORTA|SINCRONIZADA|ENSALADA|HUEVO|MOLLETE|CROQUE|OVERNIGHT|PARFAIT|AVOCADO TOAST|VASO DE FRUTA|COCTEL DE FRUTA|CHAPATA|CRUDITE|PAN ROLL/;
const drink=/CAFÉ|CAFE|CAPUCHINO|CAPPUCCINO|LATTE|FRAP|SMOOTHIE|JUGO|LICUADO|MOKA|MOCA|CHOCOLATE ABUELITA|CHOCOVAINILLA/;
const buckets={cocina:[],bebidas:[],cerrados:[],otros:[]};
base.products.forEach(([code,name,qty,amount])=>{let category=!code.startsWith("TPV")?"cerrados":kitchen.test(name)?"cocina":drink.test(name)?"bebidas":"otros";buckets[category].push({name,qty,amount});});
const total=items=>items.reduce((a,r)=>a+r.amount,0);
const totalAll=Object.values(buckets).reduce((s,a)=>s+total(a),0);
const top=[...buckets.cocina].filter(p=>p.qty>0).sort((a,b)=>b.qty-a.qty).slice(0,8);
const low=[...buckets.cocina].filter(p=>p.qty>0).sort((a,b)=>a.qty-b.qty).slice(0,6);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function rows(items){let m=Math.max(1,...items.map(x=>x.qty));return items.map(p=>'<div class="ocs-graph-item"><span>'+esc(p.name)+'</span><b>'+p.qty+' uds</b><em>'+money(p.amount)+'</em><div class="ocs-graph-bar"><div style="width:'+(100*p.qty/m)+'%"></div></div></div>').join("");}
let last=base.through,parts=last.split("-"),yy=+parts[0],mm=+parts[1],monthDays=new Date(yy,mm,0).getDate(),remaining=0;
for(let i=+parts[2]+1;i<=monthDays;i++){let d=new Date(yy,mm-1,i).getDay();if(d>=1&&d<=5)remaining++;}
let actual=base.daily.reduce((a,r)=>a+r[2],0),average=actual/base.daily.length,forecast=actual+remaining*average;
let maxDay=Math.max(...base.daily.map(r=>r[2]),1);
const daily=base.daily.map(([date,qty,amount])=>'<div title="'+esc(date)+' · '+money(amount)+'" class="ocs-daily-column"><span style="height:'+Math.max(3,amount/maxDay*135)+'px"></span><small>'+date.slice(-2)+'</small></div>').join("");
const categories=[["Cocina preparada","cocina"],["Bebidas preparadas","bebidas"],["Productos cerrados","cerrados"],["Otros","otros"]];
root.innerHTML='<h2>Indicadores de cocina y proyección</h2><p>Clasificación estimada del reporte Arrow al '+last+'. Se muestran ventas, no utilidad.</p><div class="ocs-graph-kpis">'+categories.map(([name,key])=>'<div><small>'+name+'</small><strong>'+money(total(buckets[key]))+'</strong><small>'+(100*total(buckets[key])/totalAll).toFixed(1)+'% de ingresos</small></div>').join("")+'</div><div class="ocs-graph-pair"><section><h3>Platillos más vendidos</h3>'+rows(top)+'</section><section><h3>Preparados de bajo movimiento</h3>'+rows(low)+'</section></div><div class="ocs-graph-pair"><section><h3>Venta diaria</h3><div class="ocs-daily-bars">'+daily+'</div></section><section><h3>Proyección de cierre · octubre</h3><div class="ocs-forecast">'+money(forecast)+'</div><p>Registrado: '+money(actual)+' · Estimado adicional: '+money(forecast-actual)+'</p><div class="ocs-forecast-track"><span style="width:'+(100*actual/forecast)+'%"></span></div><p>Promedio de '+base.daily.length+' jornadas registradas × '+remaining+' días laborales restantes. Estimación, no garantía.</p></section></div>';
})();
