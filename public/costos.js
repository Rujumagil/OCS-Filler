(()=>{
"use strict";
const KEY="ocs_filler_supplier_costs_2026_10_19_v1";
let catalog=[];try{catalog=JSON.parse(localStorage.getItem(KEY)||"[]");if(!Array.isArray(catalog))catalog=[];}catch(_){catalog=[];}
const $=id=>document.getElementById(id);
const money=n=>Number(n||0).toLocaleString("es-MX",{style:"currency",currency:"MXN"});
const normalize=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");
const asNum=v=>typeof v==="number"?v:Number(String(v??"").replace(/[^0-9.\-]/g,""));
const pick=(row,names)=>{for(const name of names){const k=Object.keys(row).find(x=>normalize(x)===normalize(name));if(k!==undefined)return row[k];}return undefined;};
const unit=u=>{const x=normalize(u);if(["KGR","KG","KILO","KILOGRAMO"].includes(x))return"kg";if(["GR","G","GRAMO"].includes(x))return"g";if(["LTR","LT","L","LITRO"].includes(x))return"l";if(["ML","MILILITRO"].includes(x))return"ml";if(["PZA","PZ","PIEZA","PIEZAS","UD","UNIDAD"].includes(x))return"piece";return"";};
function factor(supplier,warehouse){
  const a=unit(supplier),b=unit(warehouse);
  if(!a||!b)return null;
  if(a===b)return 1;
  if(a==="kg"&&b==="g")return .001;
  if(a==="g"&&b==="kg")return 1000;
  if(a==="l"&&b==="ml")return .001;
  if(a==="ml"&&b==="l")return 1000;
  return null;
}
async function parseFile(file,source){
  if(!file)return [];
  if(!window.XLSX)throw Error("No se cargó el lector Excel. Revisa tu conexión.");
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array",raw:true});
  let result=[];
  for(const name of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:"",raw:true});
    for(const row of rows){
      const code=String(pick(row,["LIBRA"])??"").trim();
      const name=String(pick(row,["Descripcion","Descripción"])??"").trim();
      const supplierUnit=String(pick(row,["UD","Unidad"])??"").trim();
      const price=asNum(pick(row,["Precio"]));
      if(!name||!code||!Number.isFinite(price)||price<=0||!unit(supplierUnit))continue;
      result.push({code,name,unit:supplierUnit,price,source});
    }
  }
  return result;
}
function findCost(item){
  const name=normalize(item.name),code=String(item.code??"").trim().replace(/^0+(?=\d)/,"");
  const exactCode=catalog.filter(x=>String(x.code).replace(/^0+(?=\d)/,"")===code);
  const candidates=exactCode.length?exactCode:catalog.filter(x=>normalize(x.name)===name);
  const valid=candidates.filter(x=>factor(x.unit,item.unit)!==null);
  // Never use an ambiguous reference cost or unit.
  if(valid.length!==1)return null;
  const hit=valid[0],f=factor(hit.unit,item.unit);
  return {unitCost:hit.price*f,source:hit.source,code:hit.code};
}
function update(items){
  if(!Array.isArray(items))return;
  let total=0,order=0,missing=0,covered=0,active=0;
  for(const item of items){
    const stock=Number(item.stock)||0;
    const need=Math.max(0,Number(item.suggested)||0);
    if(stock<=0&&need<=0)continue;
    active++;
    const cost=findCost(item);
    if(!cost){missing++;continue;}
    covered++;
    total+=stock*cost.unitCost;
    if(Number(item.min)>0&&stock<=Number(item.min))order+=need*cost.unitCost;
  }
  $("costMatchedValue").textContent=catalog.length?money(total):"—";
  $("costOrderValue").textContent=catalog.length?money(order):"—";
  $("costPending").textContent=catalog.length?String(missing):"—";
  $("costCoverage").textContent=catalog.length?covered+" de "+active+" productos activos conciliados · "+catalog.length+" precios de referencia cargados":"Aún no se importan costos en este navegador.";
  // Do not present a partial inventory valuation as the complete valuation.
  $("stockValue").textContent=catalog.length&&missing===0?money(total):"Incompleto";
  $("stockSpend").textContent="Sin datos";
}
window.OCSCosts={render:update};
$("applyCostsBtn")?.addEventListener("click",async()=>{
  const status=$("costCoverage"),files=[[$("costAbarrotes").files[0],"Abarrotes"],[$("costPerecederos").files[0],"Perecederos"]];
  if(!files.some(([file])=>file)){status.textContent="Selecciona al menos un archivo de costos.";return;}
  status.textContent="Leyendo y validando precios…";
  try{
    const parts=await Promise.all(files.map(([file,source])=>parseFile(file,source)));
    const fresh=parts.flat();
    if(!fresh.length)throw Error("No se encontraron precios positivos con columnas LIBRA, Descripcion, UD y Precio.");
    const sources=new Set(files.filter(([f])=>!!f).map(([,source])=>source));
    catalog=[...catalog.filter(x=>!sources.has(x.source)),...fresh];
    localStorage.setItem(KEY,JSON.stringify(catalog));
    update(window.OCSWarehouseItems||[]);
  }catch(e){status.textContent="Error: "+e.message;}
});
})();
