(()=>{
"use strict";
const $=id=>document.getElementById(id),base=window.OCS_HISTORIC_OCT_2026||null,KEY="ocs_sales_rows_v1";
const money=n=>Number(n||0).toLocaleString("es-MX",{style:"currency",currency:"MXN"}),num=n=>Number(n||0).toLocaleString("es-MX",{maximumFractionDigits:2});
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const escape=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const moneyValue=r=>Number(r.amount)||0,qtyValue=r=>Number(r.qty)||0;
let raw=[];try{let d=JSON.parse(localStorage.getItem(KEY)||"[]");if(Array.isArray(d))raw=d.filter(r=>r?.date&&r?.name&&!["HIST","Consolidado Arrow"].includes(r.code));}catch(_){}
let report=null;
const daily=base?.daily.map(([date,qty,amount])=>({date,qty,amount}))||[];
const products=base?.products.map(([code,name,qty,amount])=>({code,name,qty,amount}))||[];
const detailAvailable=()=>raw.some(r=>r.date&&r.name&&r.code!=="HIST");
const dayKey=v=>{if(v instanceof Date&&!isNaN(v))return v.getFullYear()+"-"+String(v.getMonth()+1).padStart(2,"0")+"-"+String(v.getDate()).padStart(2,"0");if(typeof v==="number"&&window.XLSX){let d=XLSX.SSF.parse_date_code(v);if(d)return [d.y,String(d.m).padStart(2,"0"),String(d.d).padStart(2,"0")].join("-")}let t=String(v||"").trim();let m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");m=t.match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:""};
const field=(r,names)=>{for(let k of Object.keys(r)){if(names.includes(normalize(k)))return r[k]}return undefined};
function parseDateRange(query){const text=normalize(query),year=(text.match(/20\d\d/)||[])[0]||"2026",months=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],month=months.findIndex(m=>text.includes(m))+1,monthText=String(month||10).padStart(2,"0");let m=text.match(/del\s+(\d{1,2})\s+al\s+(\d{1,2})/);if(!m)m=text.match(/(?:entre|desde)\s+(\d{1,2}).*?(?:y|hasta)\s+(\d{1,2})/);if(m)return [year+"-"+monthText+"-"+m[1].padStart(2,"0"),year+"-"+monthText+"-"+m[2].padStart(2,"0")];let one=text.match(/(?:dia\s*)?(\d{1,2})\s+de\s+(?:octubre|septiembre|noviembre|\w+)/);if(one)return [year+"-"+monthText+"-"+one[1].padStart(2,"0"),year+"-"+monthText+"-"+one[1].padStart(2,"0")];return [year+"-"+monthText+"-01",year+"-"+monthText+"-"+String(new Date(Number(year),Number(monthText),0).getDate()).padStart(2,"0")];}
function breadGroup(name){const n=normalize(name);if(/cuernito/.test(n))return"Cuernito";if(/chapata/.test(n))return"Chapata";if(/mollete/.test(n))return"Mollete";if(/torta/.test(n))return"Torta";return null}
function dates(a,b){let out=[];let d=new Date(a+"T12:00:00"),end=new Date(b+"T12:00:00");if(end<d||!Number.isFinite(+d)||out.length>60)return out;while(d<=end&&out.length<62){out.push(dayKey(d));d.setDate(d.getDate()+1)}return out}
function show({title,message,cols=[],rows=[],chart=[],source=""}){report={title,cols,rows};$("reportTitle").textContent=title;$("reportMessage").innerHTML=message;$("sourceInfo").textContent=source;$("downloadCsv").hidden=!rows.length;$("reportTable").innerHTML=rows.length?'<table><thead><tr>'+cols.map(c=>'<th>'+escape(c)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+escape(v)+'</td>').join("")+'</tr>').join("")+'</tbody></table>':"";let max=Math.max(1,...chart.map(x=>x.value));$("reportChart").innerHTML=chart.length?chart.map(x=>'<div><b>'+escape(String(x.labelValue??num(x.value)))+'</b><span class="column" style="height:'+Math.max(3,130*x.value/max)+'px"></span><small>'+escape(x.label)+'</small></div>').join(""):""}
function warn(title,text){show({title,message:'<div class="warning">'+escape(text)+'</div>'})}
function bread(q){const [a,b]=parseDateRange(q),datesWanted=dates(a,b);if(!datesWanted.length){warn("Consumo de pan","Selecciona un rango de fechas válido.");return}if(!detailAvailable()){warn("Consumo diario de pan · "+a+" a "+b,"El histórico de Arrow disponible solo contiene ventas totales por día y totales por producto del mes. No contiene el desglose producto × fecha, por lo que no podemos calcular estas cantidades sin el Excel detallado. Impórtalo arriba para obtener resultados reales.");return}let groups=["Torta","Cuernito","Chapata","Mollete"],rows=[],total=[0,0,0,0];for(let date of datesWanted){let vals=groups.map(group=>raw.filter(r=>r.date===date&&breadGroup(r.name)===group).reduce((s,r)=>s+qtyValue(r),0));vals.forEach((v,i)=>total[i]+=v);rows.push([date,...vals.map(num),num(vals.reduce((s,n)=>s+n,0))])}rows.push(["TOTAL",...total.map(num),num(total.reduce((s,n)=>s+n,0))]);let latest=raw.map(r=>r.date).sort().at(-1);show({title:"Consumo teórico de pan · "+a+" a "+b,message:'<p class="hint">Cantidades netas de platillos vendidos. Se presupone una pieza de pan por platillo; las recetas deberán validar unidades físicas por preparación. Un día sin movimiento no confirma inventario cero.</p>',cols:["Fecha",...groups,"Total"],rows,chart:total.map((value,i)=>({label:groups[i],value})),source:"Origen: movimientos detallados Arrow importados localmente. Última fecha disponible: "+latest})}
function dailySales(q){const[a,b]=parseDateRange(q),dayRows=detailAvailable()?dates(a,b).map(date=>({date,qty:raw.filter(r=>r.date===date).reduce((s,r)=>s+qtyValue(r),0),amount:raw.filter(r=>r.date===date).reduce((s,r)=>s+moneyValue(r),0)})):daily.filter(x=>x.date>=a&&x.date<=b);if(!dayRows.length){warn("Ventas diarias","No hay ventas registradas en ese intervalo.");return}show({title:"Ventas por día · "+a+" a "+b,message:'<p class="hint">Venta neta registrada por fecha; no equivale a consumo físico de insumos.</p>',cols:["Fecha","Unidades","Venta"],rows:dayRows.map(r=>[r.date,num(r.qty),money(r.amount)]),chart:dayRows.map(r=>({label:r.date.slice(-2),value:r.amount})),source:detailAvailable()?"Movimientos Arrow importados en este navegador.":"Histórico compartido de Arrow al 21 de octubre de 2026."})}
function ranking(q){let p=detailAvailable()?Object.values(raw.reduce((acc,r)=>{let code=r.code||r.name;acc[code]??={code,name:r.name,qty:0,amount:0};acc[code].qty+=qtyValue(r);acc[code].amount+=moneyValue(r);return acc},{})):products;const n=normalize(q),onlyKitchen=/cocina|preparado|platillo/.test(n);if(onlyKitchen)p=p.filter(x=>/^(TPV)/.test(x.code));p=[...p].filter(x=>x.qty>0).sort((a,b)=>/menos|menor/.test(n)?a.qty-b.qty:b.qty-a.qty).slice(0,15);show({title:/menos|menor/.test(n)?"Productos con menor movimiento":"Productos más vendidos",message:'<p class="hint">Clasificados por unidades netas registradas, no por margen de utilidad.</p>',cols:["Producto","Unidades","Venta"],rows:p.map(x=>[x.name,num(x.qty),money(x.amount)]),chart:p.slice(0,8).map((x,i)=>({label:String(i+1),value:x.qty})),source:detailAvailable()?"Movimientos importados de Arrow.":"Resumen mensual compartido al 21 de octubre de 2026."})}
function product(q){let n=normalize(q),found=[...products].filter(p=>normalize(p.name).split(" ").some(word=>word.length>4&&n.includes(word)));found.sort((a,b)=>b.qty-a.qty);if(!found.length){warn("Consulta de producto","No encontré una coincidencia clara. Intenta escribir el nombre completo o pide «más vendidos».");return}let p=found.slice(0,12);show({title:"Productos relacionados con la consulta",message:'<p class="hint">El resumen histórico confirma el acumulado mensual; para cantidades por fecha debes importar movimientos detallados.</p>',cols:["Producto","Unidades (octubre)","Venta"],rows:p.map(x=>[x.name,num(x.qty),money(x.amount)]),source:"Histórico Arrow consolidado al 21 de octubre de 2026."})}

let warehouse=null;
const recipeKey="ocs_filler_recetas_v1";
function recipesLocal(){try{let data=JSON.parse(localStorage.getItem(recipeKey)||"null");return Array.isArray(data)?data:[]}catch(_){return []}}
async function warehouseRefresh(){
  const token=sessionStorage.getItem("ocs_filler_warehouse_token")||localStorage.getItem("ocs_filler_warehouse_token")||"";
  const el=$("operationalStatus");
  if(!token){el.textContent="Sin sesión de almacén. Entra primero a Almacén con tu PIN y vuelve a consultar.";warehouse=null;return false;}
  el.textContent="Consultando existencias actuales…";
  try{
    const response=await fetch("/api/inventory",{headers:{authorization:"Bearer "+token},cache:"no-store"});
    if(!response.ok)throw Error(response.status===401?"Sesión caducada: vuelve a entrar en Almacén.":"No se pudo consultar inventario ("+response.status+").");
    const data=await response.json();
    if(!data.ok||!Array.isArray(data.items))throw Error("Respuesta de inventario no válida.");
    warehouse=data.items;el.textContent=warehouse.length+" productos consultados en OCS · "+new Date().toLocaleString("es-MX")+". Recetas locales: "+recipesLocal().length;return true;
  }catch(error){warehouse=null;el.textContent=error.message;return false;}
}
const nstock=r=>Number(r.stock)||0;
function warehouseOrder(question){
  if(!warehouse){warn("Almacén sin conexión","Inicia sesión en Almacén y selecciona «Actualizar existencias» para consultar los datos reales.");return;}
  let q=normalize(question),empty=/sin existencia|agotad|en cero/.test(q);
  let items=warehouse.filter(r=>empty?nstock(r)<=0:Number(r.min)>0&&nstock(r)<=Number(r.min));
  items.sort((a,b)=>a.name.localeCompare(b.name,"es"));
  show({title:empty?"Artículos sin existencia":"Productos por pedir según mínimos OCS",message:'<p class="hint">Existencias reales de OCS. El pedido sugerido se calcula por máximo establecido; revisar manualmente unidades y cantidades antes de comprar.</p>',cols:["Insumo","Existencia","Mínimo","Cantidad sugerida"],rows:items.map(r=>[r.name,num(r.stock)+" "+r.unit,num(r.min)+" "+r.unit,num(Math.max(0,Number(r.suggested)||0))+" "+r.unit]),source:"Consulta en tiempo real a /api/inventory con la sesión del almacén. "+items.length+" referencias detectadas."});
}
function recipePending(){
  const rec=recipesLocal();
  if(!rec.length){warn("Recetas pendientes","No hay recetas guardadas en este navegador. Abre Recetario para completarlas, o importa un respaldo JSON allí.");return;}
  const p=rec.filter(r=>r.status!=="validada"||!(r.ingredients||[]).length);
  show({title:"Recetas por validar",message:'<p class="hint">Solo las recetas validadas con ingredientes confirmados deben utilizarse para calcular consumos teóricos.</p>',cols:["Receta","Clave Arrow","Ingredientes","Estado"],rows:p.map(r=>[r.name,r.code,String((r.ingredients||[]).length),r.status||"pendiente"]),source:p.length+" recetas pendientes de "+rec.length+" recetas guardadas en este dispositivo."});
}
function ingredientQuery(q){
  if(!warehouse)return warehouseOrder(q);
  const text=normalize(q).replace(/(?:cuanto|cuanta|cuantos|cuantas|hay|tenemos|existencia|stock|de|del|en|almacen|producto|ingrediente)/g," ").trim();
  const items=warehouse.filter(r=>normalize(r.name).includes(text)&&text.length>=3).slice(0,30);
  show({title:"Existencia de ingrediente",message:'<p class="hint">Unidades tal como se registran en el inventario OCS, sin conversiones supuestas.</p>',cols:["Producto","Existencia","Mínimo","Unidad"],rows:items.map(r=>[r.name,num(r.stock),num(r.min),r.unit]),source:items.length?"Inventario OCS consultado durante la sesión.":"No se encontró coincidencia exacta; prueba con otro nombre."});
}
function futurePurchases(){
  if(!warehouse){warn("Compra para mañana","Para consultar existencias inicia sesión en Almacén y presiona «Actualizar existencias». No generaré sugerencias sin stock real.");return;}
  const valid=recipesLocal().filter(r=>r.status==="validada"&&r.ingredients?.length);
  const low=warehouse.filter(r=>Number(r.min)>0&&nstock(r)<=Number(r.min));
  if(!valid.length||!detailAvailable()){
    show({title:"Compra de mañana · datos disponibles",message:'<div class="warning">Puedo mostrar lo que está debajo del mínimo, pero para pronosticar ingredientes según la venta necesitaré recetas validadas y movimientos diarios por producto de Arrow. Recetas validadas: '+valid.length+'. Movimientos detallados: '+(detailAvailable()?"sí":"no")+'. No se descontará inventario automáticamente.</div>',cols:["Producto por pedir","Existencia","Cantidad sugerida"],rows:low.map(r=>[r.name,num(r.stock)+" "+r.unit,num(Math.max(0,Number(r.suggested)||0))+" "+r.unit]),source:"OCS: mínimos y existencias reales. No constituye proyección de consumo para mañana."});return;
  }
  show({title:"Compras sugeridas según existencias",message:'<p class="hint">Ya existen recetas validadas y movimientos diarios. Antes de generar una compra basada en consumo se necesita comprobar la correspondencia exacta entre ingrediente y artículo de almacén y las conversiones de unidad.</p>',cols:["Producto por pedir","Existencia","Cantidad sugerida"],rows:low.map(r=>[r.name,num(r.stock)+" "+r.unit,num(Math.max(0,Number(r.suggested)||0))+" "+r.unit]),source:"Recomendación conservadora basada en mínimos OCS; no aplica consumo automático."});
}

function ask(){const q=$("question").value.trim(),n=normalize(q);if(!q){warn("Escribe una pregunta","Prueba con uno de los ejemplos disponibles.");return}if(/comprar mañana|necesito comprar|pedido de mañana|ingredientes.*mañana/.test(n))return futurePurchases();if(/recetas? pendiente|recetas? por validar|completar recetas/.test(n))return recipePending();if(/que.*pedir|por pedir|sin existencia|agotad|en cero/.test(n))return warehouseOrder(q);if(/(?:cuanto|cuanta|cuantos|cuantas).*?(?:tenemos|hay|existencia|stock).*?(?:de |del )/.test(n))return ingredientQuery(q);if(/pan|cuernito|mollete|chapata|torta/.test(n)&&(/consumo|cuanto|por dia|utiliz|gast|necesit/.test(n)))return bread(q);if(/mas vendidos|menos vendidos|mayor venta|menor movimiento|productos top|top 10/.test(n))return ranking(q);if(/venta|vendimos|ingresos|factur/.test(n)&&/por dia|cada dia|del \d|entre \d/.test(n))return dailySales(q);if(/vend|producto/.test(n))return product(q);warn("Consulta aún no disponible","Esta primera versión interpreta consumo de pan por día, ventas diarias, rankings y productos. Para preguntas más abiertas añadiremos el agente de OCS cuando exista una conexión segura al servidor.")}
function status(){let start=raw.map(r=>r.date).sort()[0],end=raw.map(r=>r.date).sort().at(-1);$("dataStatus").textContent=detailAvailable()?raw.length+" movimientos detallados disponibles · "+start+" a "+end+" · guardados en este navegador.":"Disponible: resumen histórico mensual de octubre. Para reportes producto × día necesitas importar los movimientos Arrow detallados."}
$("syncWarehouse").addEventListener("click",warehouseRefresh);
$("ask").addEventListener("click",ask);$("question").addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();ask()}});document.querySelectorAll("[data-example]").forEach(b=>b.addEventListener("click",()=>{$("question").value=b.dataset.example;ask()}));
$("sourceFile").addEventListener("change",async e=>{let f=e.target.files[0];if(!f)return;try{if(!window.XLSX)throw Error("El lector Excel no está disponible.");let book=XLSX.read(await f.arrayBuffer(),{type:"array",cellDates:true});let records=[];for(const tab of book.SheetNames){let rows=XLSX.utils.sheet_to_json(book.Sheets[tab],{defval:""});for(let r of rows){let date=dayKey(field(r,["fecha mov","fecha valor","fecha","date"])),name=String(field(r,["descripcion","articulo descripcion","producto","nombre"])||"").trim(),code=String(field(r,["articulo","codigo","code"])||"").trim(),qty=Number(field(r,["cantidad presentacion","cantidad","unidades","qty"]))||0,price=Number(field(r,["pvp","precio"]))||0;if(date&&name)records.push({date,name,code,qty,amount:qty*price});}}
if(!records.length)throw Error("No encontré columnas válidas de fecha, descripción y cantidad.");raw=records;try{localStorage.setItem(KEY,JSON.stringify(raw))}catch(_){$("dataStatus").textContent="Se cargó el archivo, pero el almacenamiento del navegador está lleno.";}status();$("reportMessage").textContent="Movimientos cargados. Ya puedes generar consultas detalladas."; $("reportTable").innerHTML="";$("reportChart").innerHTML="";}
catch(err){$("dataStatus").textContent="No se pudo importar: "+err.message}finally{e.target.value=""}});
$("downloadCsv").addEventListener("click",()=>{if(!report?.rows?.length)return;let csv=[report.cols,...report.rows].map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(",")).join("\r\n"),blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="OCS_consulta_"+new Date().toISOString().slice(0,10)+".csv";a.click();URL.revokeObjectURL(url)});

function messageToChat(type,text){
  const div=document.createElement("div");
  div.style.cssText="padding:12px;border-radius:12px;font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;max-width:95%;"+(type==="user"?"background:#173b2c;color:#fff;justify-self:end":"background:#edf4ee;color:#173b2c;justify-self:start");
  div.textContent=text;
  $("flyConversation").appendChild(div);$("flyConversation").scrollTop=$("flyConversation").scrollHeight;
}
function agentContext(){
  const imported=detailAvailable();
  const aggregated=imported?Object.values(raw.reduce((acc,r)=>{
    const code=String(r.code||r.name||"");
    if(!acc[code])acc[code]={code,name:r.name,qty:0,amount:0};
    acc[code].qty+=qtyValue(r);acc[code].amount+=moneyValue(r);
    return acc;
  },{})):[...products];
  const byDate=imported?Object.values(raw.reduce((acc,r)=>{
    if(!acc[r.date])acc[r.date]={date:r.date,qty:0,amount:0};
    acc[r.date].qty+=qtyValue(r);acc[r.date].amount+=moneyValue(r);
    return acc;
  },{})).sort((a,b)=>a.date.localeCompare(b.date)):daily;
  const local=recipesLocal();
  return {
    daily:byDate,products:aggregated,recipes:local,
    salesCoverage:imported?"Movimientos por producto y día importados en este navegador; consultar detalles por fecha mediante reportes locales.":"Solo resumen de venta total por día y resumen por producto para todo octubre 1–21; NO hay desglose producto por día.",
    recipeCoverage:"Recetas almacenadas únicamente en este navegador: "+local.length
  };
}
async function sendFlyQuestion(){
  const question=$("flyQuestion").value.trim();
  if(!question)return;
  const token=sessionStorage.getItem("ocs_filler_warehouse_token")||localStorage.getItem("ocs_filler_warehouse_token")||"";
  messageToChat("user",question);$("flyQuestion").value="";
  if(!token){
    messageToChat("assistant","Para consultar el agente con existencias reales es necesario iniciar sesión en Almacén con tu usuario y PIN. Después regresa a Consultas. Mientras tanto puedes utilizar los reportes directos disponibles debajo.");
    return;
  }
  $("flySend").disabled=true;$("flyStatus").textContent="Consultando información OCS…";
  try{
    const response=await fetch("/api/assistant",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:JSON.stringify({question,context:agentContext()})});
    const result=await response.json();
    if(!response.ok||!result.ok){
      if(result.error==="ai_not_configured")throw Error("El servicio conversacional todavía no está activado. Falta configurar GEMINI_API_KEY como secreto del Worker OCS Filler; los reportes directos continúan disponibles.");
      if(response.status===401)throw Error("Tu sesión de Almacén caducó. Vuelve a iniciar sesión para consultar datos protegidos.");
      throw Error(result.message||"No fue posible responder. Prueba los reportes directos.");
    }
    messageToChat("assistant",result.answer+"\n\nFuente: "+result.source+".");
    $("flyStatus").textContent="Respuesta basada en las fuentes disponibles de OCS.";
  }catch(error){
    messageToChat("assistant",String(error.message||"No fue posible conectar con el agente."));
    $("flyStatus").textContent="No se completó la consulta.";
  }finally{$("flySend").disabled=false;}
}
$("flySend").addEventListener("click",sendFlyQuestion);
$("flyQuestion").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendFlyQuestion();}});

status();
if(sessionStorage.getItem("ocs_filler_warehouse_token")||localStorage.getItem("ocs_filler_warehouse_token"))warehouseRefresh();
else $("operationalStatus").textContent="Accede a Almacén con tu PIN para habilitar consultas de existencias. Las recetas se leen en este navegador.";
})();