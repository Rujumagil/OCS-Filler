(()=>{
const TOKEN_KEY="ocs_filler_warehouse_token";
const NAME_KEY="ocs_filler_warehouse_name";
const state={
  token:sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||"",
  name:localStorage.getItem(NAME_KEY)||"",
  items:[],
  stats:{},
  history:[],
  delivery:null,
  selected:null,
  pendingMode:null,
  filter:"all",
  scannerStream:null,
  scannerDetector:null,
  scannerTimer:null,
  zxingReader:null,
  zxingControls:null,
  scanBusy:false,
  scanMode:null,
  scannedBarcode:"",
  resumeScanner:false,
  selectionFromScanner:false,
  scanSessionId:"",
  scanSessionMode:null,
  scanSessionCount:0,
  scanSessionLabel:"",
  qrLabelSelected:new Set(),
  qrCodeModule:null,
  reportType:"stock"
};

const $=id=>document.getElementById(id);
const num=v=>Number(v||0).toLocaleString("es-MX",{maximumFractionDigits:3});
const unit=v=>({pieza:"pza",pza:"pza",kg:"kg",g:"g",L:"L",l:"L",ml:"ml",m:"m"}[v]||v||"u");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const LOCATION_ZONES={
  SECO:"Bodega seca",
  REF:"Refrigeración",
  CONG:"Congelación",
  FRUT:"Frutas y verduras",
  LIMP:"Limpieza",
  DESE:"Desechables",
  ESP:"Especiales / proteínas",
  OTRO:"Otra zona"
};

function parseLocation(value){
  const text=String(value||"").trim().toUpperCase();
  const m=text.match(/^([A-Z0-9]{2,6})-([A-Z0-9]{1,8})-(\d{2})$/);
  if(!m)return null;
  return {code:text,zone:m[1],rack:m[2],level:m[3]};
}

function locationLabel(value){
  const p=parseLocation(value);
  if(!p)return String(value||"").trim()||"Sin ubicación";
  return p.code+" · "+(LOCATION_ZONES[p.zone]||p.zone);
}

function normalizedRack(value){
  return String(value||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
}

function buildLocationCode(){
  const zone=$("locationZone").value.trim().toUpperCase();
  const rack=normalizedRack($("locationRack").value);
  const digits=String($("locationLevel").value||"").replace(/\D/g,"").slice(0,2);
  const level=digits?String(Math.max(1,Math.min(99,Number(digits)))).padStart(2,"0"):"";
  if(zone&&rack&&level)return zone+"-"+rack+"-"+level;
  return "";
}

function updateLocationPreview(){
  $("locationRack").value=normalizedRack($("locationRack").value);
  const code=buildLocationCode();
  $("locationInput").value=code;
  if(code){
    const p=parseLocation(code);
    $("locationPreview").textContent=code+" · "+(LOCATION_ZONES[p.zone]||p.zone);
  }else{
    $("locationPreview").textContent="Completa zona, mueble y nivel. Ejemplo: SECO-A-02";
  }
}

function prepareLocationEditor(value){
  const p=parseLocation(value);
  $("locationZone").value=p?.zone||"";
  $("locationRack").value=p?.rack||"";
  $("locationLevel").value=p?.level||"";
  $("locationInput").value=p?.code||"";
  if(p){
    $("locationPreview").textContent=p.code+" · "+(LOCATION_ZONES[p.zone]||p.zone);
  }else if(value){
    $("locationPreview").textContent="Ubicación anterior: "+value+". Asigna el nuevo formato Zona-Mueble-Nivel.";
  }else{
    $("locationPreview").textContent="Completa zona, mueble y nivel. Ejemplo: SECO-A-02";
  }
}

function toast(message){
  const el=$("toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>el.classList.remove("show"),2200);
}
function openSheet(id){
  $(id).classList.add("show");
  document.body.style.overflow="hidden";
}
function closeSheet(id){
  $(id).classList.remove("show");
  if(!document.querySelector(".sheet-backdrop.show"))document.body.style.overflow="";
}
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeSheet(b.dataset.close)));
document.querySelectorAll(".sheet-backdrop").forEach(bg=>bg.addEventListener("click",e=>{if(e.target===bg)closeSheet(bg.id)}));

async function api(path,options={}){
  const headers={"content-type":"application/json",...(options.headers||{})};
  if(state.token)headers.authorization="Bearer "+state.token;
  const response=await fetch(path,{...options,headers,cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(response.status===401&&path!=="/api/login"){logout();throw new Error("Tu sesión terminó. Ingresa nuevamente.");}
  if(!response.ok||data.ok===false){
    const messages={
      invalid_pin:"PIN incorrecto.",
      pin_not_configured:"El PIN no está configurado en el entorno de producción de Cloudflare.",
      name_required:"Escribe tu nombre.",
      unauthorized:"Sesión vencida.",
      google_credentials_missing:"Falta conectar Google Sheets en Cloudflare.",
      google_auth_failed:"No se pudo autenticar con Google.",
      google_sheets_failed:"No se pudo actualizar el Control de Almacén. Intenta nuevamente.",
      item_not_found:"Producto no encontrado.",
      insufficient_stock:"La cantidad supera la existencia disponible.",
      movement_capacity_reached:"La bitácora llegó a su capacidad.",
      invalid_count:"El conteo no es válido.",
      barcode_required:"No se detectó un código.",
      barcode_not_linked:"El código todavía no está vinculado.",
      barcode_already_linked:"Ese código ya está vinculado a otro producto.",
      barcode_link_invalid:"No se pudo vincular el código.",
      location_invalid:"No se pudo guardar la ubicación."
    };
    const err=new Error(messages[data.error]||data.error||"No se pudo completar la operación.");
    err.code=data.error||"request_failed";
    err.data=data;
    throw err;
  }
  return data;
}

async function login(name,pin){
  const data=await api("/api/login",{method:"POST",body:JSON.stringify({name,pin})});
  state.token=data.token;
  state.name=data.user?.name||name;
  sessionStorage.setItem(TOKEN_KEY,state.token);
  localStorage.setItem(TOKEN_KEY,state.token);
  localStorage.setItem(NAME_KEY,state.name);
  showApp();
  await loadInventory();
}
function logout(){
  state.token="";
  state.items=[];
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  $("nameInput").value=state.name||"";
  $("pinInput").value="";
  setTimeout(()=>$("pinInput").focus(),50);
}
function showApp(){
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("userName").textContent=state.name||"Almacenista";
}

async function loadInventory(){
  try{
    const data=await api("/api/inventory");
    state.items=data.items||[];
    state.stats=data.stats||{};
    if(data.user?.name){state.name=data.user.name;localStorage.setItem(NAME_KEY,state.name);}
    $("userName").textContent=state.name||"Almacenista";
    $("productsCount").textContent=state.stats.products||0;
    $("orderCount").textContent=state.stats.needOrder||0;
    $("zeroCount").textContent=state.stats.zero||0;
    $("updatedAt").textContent="Actualizado "+new Date(data.updatedAt||Date.now()).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
    renderProducts();
    loadExpiryAlerts();
    updateWarehouseMapSummary();
    updateReportsSummary();
    loadTodayDelivery();
  }catch(e){toast(e.message);}
}

async function loadTodayDelivery(){
  try{
    const data=await api("/api/delivery/today");
    state.delivery=data.delivery||null;
    renderTodayDelivery();
  }catch(e){
    $("todayDeliverySummary").textContent="No se pudo consultar la entrega del día.";
  }
}

function renderTodayDelivery(){
  const d=state.delivery;
  if(!d||!d.lines){
    $("todayDeliverySummary").textContent="Sin entregas registradas hoy.";
    $("deliveryLines").textContent="0";
    $("deliveryPieces").textContent="0";
    $("deliveryKg").textContent="0";
    $("deliverySource").classList.add("hidden");
    $("deliveryList").innerHTML='<div class="empty-state">Todavía no hay entradas registradas para hoy.</div>';
    return;
  }

  $("todayDeliverySummary").textContent=d.lines+" partidas · "+num(d.pieces)+" pza · "+num(d.kg)+" kg";
  $("deliveryLines").textContent=d.lines;
  $("deliveryPieces").textContent=num(d.pieces);
  $("deliveryKg").textContent=num(d.kg);

  const parts=String(d.date||"").split("-");
  $("deliveryDateLabel").textContent=parts.length===3?parts[2]+"/"+parts[1]+"/"+parts[0]:"Hoy";

  const sources=(d.sources||[]).filter(Boolean);
  $("deliverySource").classList.toggle("hidden",!sources.length);
  $("deliverySource").textContent=sources.length?sources.join(" · "):"";

  $("deliveryList").innerHTML=(d.items||[]).length?(d.items||[]).map(i=>`
    <article class="delivery-item">
      <div>
        <b>${esc(i.name||i.code)}</b>
        <small>${esc(i.code)} · ${esc(i.family||"")}</small>
      </div>
      <strong>+${num(i.quantity)} ${unit(i.unit)}</strong>
    </article>
  `).join(""):'<div class="empty-state">Sin productos recibidos.</div>';
}

function scannerModeCopy(mode){
  return {
    entry:{title:"Escanear para entrada",subtitle:"Escanea el producto que vas a recibir."},
    exit:{title:"Escanear para salida",subtitle:"Escanea el producto que vas a surtir."},
    count:{title:"Escanear para conteo",subtitle:"Escanea el producto que vas a contar."}
  }[mode]||{title:"Escanear producto",subtitle:"Apunta la cámara al código de barras o QR."};
}

function newScanSessionId(){
  const stamp=new Date().toISOString().slice(0,10).replaceAll("-","");
  const tail=(crypto.randomUUID?.()||String(Date.now())).replaceAll("-","").slice(0,6).toUpperCase();
  return "SES-"+stamp+"-"+tail;
}

function ensureScanSession(mode){
  if(!["entry","exit","count"].includes(mode))return;
  if(state.scanSessionId&&state.scanSessionMode===mode)return;
  state.scanSessionId=newScanSessionId();
  state.scanSessionMode=mode;
  state.scanSessionCount=0;
  state.scanSessionLabel="";
}

function clearScanSession(){
  state.scanSessionId="";
  state.scanSessionMode=null;
  state.scanSessionCount=0;
  state.scanSessionLabel="";
  state.selectionFromScanner=false;
  state.resumeScanner=false;
}

function renderScanSession(){
  const active=Boolean(state.scanSessionId&&state.scanSessionMode);
  $("scanSessionBar").classList.toggle("hidden",!active);
  if(!active)return;
  const labels={entry:"Recepción / Entrada",exit:"Surtido / Salida",count:"Conteo físico"};
  $("scanSessionMode").textContent=labels[state.scanSessionMode]||"Sesión";
  $("scanSessionCount").textContent=state.scanSessionCount+" "+(state.scanSessionCount===1?"movimiento":"movimientos");
  $("scanSessionLabel").value=state.scanSessionLabel||"";
  $("scanSessionLabel").placeholder=state.scanSessionMode==="entry"
    ?"Manifiesto o remisión (opcional)"
    :state.scanSessionMode==="exit"
      ?"Destino, área o solicitud (opcional)"
      :"Zona o referencia de conteo (opcional)";
}

function finishScanSession(){
  const count=state.scanSessionCount;
  stopScanner(true);
  clearScanSession();
  closeSheet("scannerSheet");
  toast(count?("Sesión terminada · "+count+" movimientos."):"Sesión terminada.");
}

function stopScanner(clearMode=false){
  clearTimeout(state.scannerTimer);
  state.scannerTimer=null;

  try{state.zxingControls?.stop?.();}catch(_){}
  state.zxingControls=null;
  state.zxingReader=null;

  if(state.scannerStream){
    state.scannerStream.getTracks().forEach(t=>t.stop());
    state.scannerStream=null;
  }

  const video=$("scannerVideo");
  if(video?.srcObject){
    try{video.srcObject.getTracks?.().forEach(t=>t.stop());}catch(_){}
    video.srcObject=null;
  }

  if(clearMode){
    state.scanMode=null;
    state.resumeScanner=false;
  }
}

async function openScanner(mode=null){
  state.scanMode=mode;
  state.scannedBarcode="";
  state.scanBusy=false;
  if(mode)ensureScanSession(mode);
  const copy=scannerModeCopy(mode);
  $("scannerTitle").textContent=copy.title;
  $("scannerSubtitle").textContent=copy.subtitle;
  $("scannerStatus").textContent="Preparando cámara…";
  $("barcodeLinkPanel").classList.add("hidden");
  $("manualBarcodeInput").value="";
  $("linkProductSearch").value="";
  $("linkProductResults").innerHTML="";
  $("restartScannerBtn").classList.add("hidden");
  renderScanSession();
  openSheet("scannerSheet");
  await startScanner();
}

async function startScanner(){
  stopScanner(false);
  state.scanBusy=false;
  state.scannerDetector=null;

  if(!navigator.mediaDevices?.getUserMedia){
    $("scannerStatus").textContent="Este navegador no permite usar la cámara. Puedes escribir el código manualmente.";
    $("restartScannerBtn").classList.remove("hidden");
    return;
  }

  try{
    const video=$("scannerVideo");

    if("BarcodeDetector" in window){
      const supported=await BarcodeDetector.getSupportedFormats().catch(()=>[]);
      const preferred=["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code","data_matrix"];
      const formats=preferred.filter(x=>supported.includes(x));
      state.scannerDetector=formats.length?new BarcodeDetector({formats}):new BarcodeDetector();

      state.scannerStream=await navigator.mediaDevices.getUserMedia({
        audio:false,
        video:{
          facingMode:{ideal:"environment"},
          width:{ideal:1280},
          height:{ideal:720}
        }
      });

      video.srcObject=state.scannerStream;
      await video.play();
      $("scannerStatus").textContent="Cámara activa. Centra el código dentro del recuadro.";
      scanFrame();
      return;
    }

    $("scannerStatus").textContent="Activando lector compatible con tu teléfono…";
    const ZXing=await import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/+esm");
    state.zxingReader=new ZXing.BrowserMultiFormatReader();

    const controls=await state.zxingReader.decodeFromConstraints(
      {
        audio:false,
        video:{
          facingMode:{ideal:"environment"},
          width:{ideal:1280},
          height:{ideal:720}
        }
      },
      video,
      (result)=>{
        if(!result||state.scanBusy)return;
        const value=typeof result.getText==="function"?result.getText():result.text;
        if(value)handleBarcode(value);
      }
    );

    state.zxingControls=controls;
    $("scannerStatus").textContent="Cámara activa. Centra el código dentro del recuadro.";
  }catch(e){
    console.error("Scanner error",e);
    let message="No pudimos abrir la cámara.";
    if(e?.name==="NotAllowedError"||e?.name==="PermissionDeniedError"){
      message="El permiso de cámara está bloqueado. En el navegador, abre permisos del sitio y habilita Cámara.";
    }else if(e?.name==="NotFoundError"||e?.name==="DevicesNotFoundError"){
      message="No encontramos una cámara disponible en este dispositivo.";
    }else if(e?.name==="NotReadableError"||e?.name==="TrackStartError"){
      message="La cámara está siendo usada por otra aplicación. Ciérrala e intenta de nuevo.";
    }else if(location.protocol!=="https:"&&location.hostname!=="localhost"){
      message="La cámara requiere una conexión HTTPS.";
    }
    $("scannerStatus").textContent=message+" También puedes escribir el código manualmente.";
    $("restartScannerBtn").classList.remove("hidden");
  }
}

async function scanFrame(){
  if(!$("scannerSheet").classList.contains("show")||!state.scannerDetector||!state.scannerStream)return;
  if(state.scanBusy){
    state.scannerTimer=setTimeout(scanFrame,250);
    return;
  }

  try{
    const video=$("scannerVideo");
    if(video.readyState>=2){
      const codes=await state.scannerDetector.detect(video);
      if(codes?.length&&codes[0]?.rawValue){
        await handleBarcode(codes[0].rawValue);
        return;
      }
    }
  }catch(_){}

  state.scannerTimer=setTimeout(scanFrame,250);
}

async function handleBarcode(raw){
  const barcode=String(raw||"").trim();
  if(!barcode||state.scanBusy)return;
  state.scanBusy=true;
  state.scannedBarcode=barcode;
  $("scannerStatus").textContent="Código detectado: "+barcode;
  if(navigator.vibrate)navigator.vibrate(60);
  stopScanner(false);

  try{
    const data=await api("/api/barcode/lookup",{
      method:"POST",
      body:JSON.stringify({barcode})
    });
    state.selected=data.item;
    const mode=state.scanMode;
    state.resumeScanner=Boolean(mode);
    state.selectionFromScanner=!mode;
    closeSheet("scannerSheet");
    if(mode)openMovement(mode);
    else selectProduct(data.item.code);
  }catch(err){
    if(err.code==="barcode_not_linked"){
      $("scannerStatus").textContent="Código nuevo. Vincúlalo una sola vez con el producto correcto.";
      $("unknownBarcode").textContent=barcode;
      $("barcodeLinkPanel").classList.remove("hidden");
      renderLinkResults();
      setTimeout(()=>$("linkProductSearch").focus(),80);
    }else{
      toast(err.message);
      $("scannerStatus").textContent="No se pudo leer el código. Intenta nuevamente.";
      $("restartScannerBtn").classList.remove("hidden");
    }
    state.scanBusy=false;
  }
}

function renderLinkResults(){
  const q=$("linkProductSearch").value.trim().toLowerCase();
  if(q.length<2){
    $("linkProductResults").innerHTML='<div class="empty-state">Escribe al menos 2 caracteres para buscar el producto.</div>';
    return;
  }
  const rows=state.items.filter(i=>i.name.toLowerCase().includes(q)||i.code.toLowerCase().includes(q)).slice(0,10);
  $("linkProductResults").innerHTML=rows.length?rows.map(i=>`
    <button type="button" class="link-result" data-link-code="${esc(i.code)}">
      <b>${esc(i.name)}</b>
      <small>${esc(i.code)} · ${num(i.stock)} ${unit(i.unit)}</small>
    </button>
  `).join(""):'<div class="empty-state">No encontramos productos.</div>';
  document.querySelectorAll("[data-link-code]").forEach(b=>b.addEventListener("click",()=>linkBarcodeToProduct(b.dataset.linkCode)));
}

async function linkBarcodeToProduct(code){
  if(!state.scannedBarcode)return;
  try{
    const data=await api("/api/barcode/link",{
      method:"POST",
      body:JSON.stringify({barcode:state.scannedBarcode,code})
    });
    state.selected=data.item;
    const mode=state.scanMode;
    state.resumeScanner=Boolean(mode);
    state.selectionFromScanner=!mode;
    closeSheet("scannerSheet");
    toast("Código vinculado. Ya quedó aprendido.");
    if(mode)openMovement(mode);
    else selectProduct(code);
  }catch(err){
    toast(err.code==="barcode_already_linked"?"Ese código ya está vinculado a otro producto.":err.message);
  }
}

function productsToOrder(){
  return state.items
    .filter(i=>Number(i.min||0)>0 && Number(i.stock||0)<=Number(i.min||0))
    .map(i=>({
      ...i,
      orderQty:Math.max(Number(i.max||0)-Number(i.stock||0),0)
    }))
    .filter(i=>i.orderQty>0)
    .sort((a,b)=>
      String(a.family||"").localeCompare(String(b.family||""),"es")||
      String(a.name||"").localeCompare(String(b.name||""),"es")
    );
}

function updateReportsSummary(){
  const need=productsToOrder().length;
  $("reportsSummary").textContent=state.items.length+" productos · "+need+" por solicitar";
}

function reportDateTime(){
  return new Date().toLocaleString("es-MX",{
    dateStyle:"medium",
    timeStyle:"short"
  });
}

function stockReportRows(){
  return [...state.items].sort((a,b)=>
    String(a.family||"").localeCompare(String(b.family||""),"es")||
    String(a.name||"").localeCompare(String(b.name||""),"es")
  );
}

function reportRows(){
  return state.reportType==="order"?productsToOrder():stockReportRows();
}

function reportColumns(){
  if(state.reportType==="order"){
    return [
      ["Código",i=>i.code],
      ["Producto",i=>i.name],
      ["Familia",i=>i.family||""],
      ["Unidad",i=>unit(i.unit)],
      ["Existencia",i=>num(i.stock),"num"],
      ["Mínimo",i=>num(i.min),"num"],
      ["Máximo",i=>num(i.max),"num"],
      ["Pedir",i=>num(i.orderQty),"num"]
    ];
  }
  return [
    ["Código",i=>i.code],
    ["Producto",i=>i.name],
    ["Familia",i=>i.family||""],
    ["Unidad",i=>unit(i.unit)],
    ["Existencia",i=>num(i.stock),"num"],
    ["Mínimo",i=>num(i.min),"num"],
    ["Máximo",i=>num(i.max),"num"],
    ["Estado",i=>i.status||""],
    ["Ubicación",i=>i.location||""]
  ];
}

function setReportType(type){
  state.reportType=type==="order"?"order":"stock";
  $("stockReportBtn").classList.toggle("active",state.reportType==="stock");
  $("orderReportBtn").classList.toggle("active",state.reportType==="order");
  renderReport();
}

function renderReport(){
  const rows=reportRows();
  const cols=reportColumns();
  const order=productsToOrder();

  $("stockReportCount").textContent=state.items.length;
  $("orderReportCount").textContent=order.length;

  if(state.reportType==="order"){
    $("reportEyebrow").textContent="Compras";
    $("reportTitle").textContent="Pedido sugerido de almacén";
    $("reportSubtitle").textContent=rows.length+" productos con existencia igual o menor al mínimo · "+reportDateTime();
  }else{
    $("reportEyebrow").textContent="Inventario";
    $("reportTitle").textContent="Reporte de existencia en almacén";
    $("reportSubtitle").textContent=rows.length+" productos · "+reportDateTime();
  }

  if(!rows.length){
    $("reportPreview").innerHTML='<div class="report-empty">No hay productos para este reporte.</div>';
    return;
  }

  $("reportPreview").innerHTML=`
    <table class="report-table">
      <thead><tr>${cols.map(c=>`<th>${esc(c[0])}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(i=>`<tr>${cols.map(c=>`<td class="${c[2]||""}">${esc(c[1](i))}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function openReports(){
  $("stockReportCount").textContent=state.items.length;
  $("orderReportCount").textContent=productsToOrder().length;
  setReportType(state.reportType||"stock");
  openSheet("reportsSheet");
}

function csvEscape(value){
  const s=String(value??"");
  return '"'+s.replaceAll('"','""')+'"';
}

function downloadCurrentReportCsv(){
  const rows=reportRows();
  const cols=reportColumns();
  if(!rows.length){toast("No hay datos para descargar.");return;}

  const lines=[
    cols.map(c=>csvEscape(c[0])).join(","),
    ...rows.map(i=>cols.map(c=>csvEscape(c[1](i))).join(","))
  ];
  const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=state.reportType==="order"?"pedido_sugerido_ocs.csv":"existencia_almacen_ocs.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function printCurrentReport(){
  const rows=reportRows();
  const cols=reportColumns();
  if(!rows.length){toast("No hay datos para imprimir.");return;}

  const title=state.reportType==="order"?"Pedido sugerido de almacén":"Existencia actual en almacén";
  const note=state.reportType==="order"
    ?"Incluye productos cuya existencia es igual o menor al mínimo configurado. La cantidad sugerida completa el inventario hasta el máximo."
    :"Existencias actuales registradas en OCS Almacén Filler.";

  $("reportPrintArea").innerHTML=`
    <article class="report-print-doc">
      <header class="report-print-header">
        <div>
          <div class="report-print-brand">OCS · ALMACÉN FILLER</div>
          <h1>${esc(title)}</h1>
          <p>${esc(note)}</p>
        </div>
        <div class="report-print-meta">
          <b>${rows.length} productos</b><br>
          ${esc(reportDateTime())}
        </div>
      </header>
      <table class="report-print-table">
        <thead><tr>${cols.map(c=>`<th>${esc(c[0])}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map(i=>`<tr>${cols.map(c=>`<td class="${c[2]||""}">${esc(c[1](i))}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </article>
  `;

  document.body.classList.add("printing-report");
  $("reportPrintArea").setAttribute("aria-hidden","false");

  const cleanup=()=>{
    document.body.classList.remove("printing-report");
    $("reportPrintArea").setAttribute("aria-hidden","true");
    window.removeEventListener("afterprint",cleanup);
  };
  window.addEventListener("afterprint",cleanup);
  setTimeout(()=>window.print(),120);
}

function locatedItems(){
  return state.items.filter(i=>parseLocation(i.location));
}

function updateWarehouseMapSummary(){
  const located=locatedItems().length;
  const pending=Math.max(0,state.items.length-located);
  $("warehouseMapSummary").textContent=located+" ubicados · "+pending+" pendientes por asignar";
}

function renderWarehouseMap(){
  const valid=locatedItems();
  const unlocated=state.items.filter(i=>!parseLocation(i.location));
  const groups=new Map();

  for(const item of valid){
    const p=parseLocation(item.location);
    if(!groups.has(p.zone))groups.set(p.zone,new Map());
    const racks=groups.get(p.zone);
    if(!racks.has(p.rack))racks.set(p.rack,{items:0,levels:new Set()});
    const rack=racks.get(p.rack);
    rack.items+=1;
    rack.levels.add(p.level);
  }

  $("locatedProductsCount").textContent=valid.length;
  $("unlocatedProductsCount").textContent=unlocated.length;
  $("activeZonesCount").textContent=groups.size;

  const ordered=Object.keys(LOCATION_ZONES).filter(z=>groups.has(z));
  const cards=ordered.map(zone=>{
    const racks=groups.get(zone);
    let zoneItems=0;
    const chips=[...racks.entries()].sort((a,b)=>a[0].localeCompare(b[0],"es")).map(([rack,data])=>{
      zoneItems+=data.items;
      const levels=[...data.levels].sort().join(", ");
      return `<span class="warehouse-rack-chip">${esc(rack)} · ${data.items} prod. · Niv. ${esc(levels)}</span>`;
    }).join("");

    return `
      <article class="warehouse-zone-card">
        <div class="warehouse-zone-head">
          <b>${esc(zone)} · ${esc(LOCATION_ZONES[zone]||zone)}</b>
          <span>${zoneItems} productos</span>
        </div>
        <div class="warehouse-zone-racks">${chips}</div>
        <button type="button" class="text-btn" data-zone-filter="${esc(zone)}">Ver productos de esta zona</button>
      </article>
    `;
  });

  if(unlocated.length){
    cards.push(`
      <article class="warehouse-zone-card">
        <div class="warehouse-zone-head">
          <b>Sin ubicación asignada</b>
          <span>${unlocated.length} productos</span>
        </div>
        <button type="button" class="text-btn" data-open-unlocated>Asignar ubicaciones pendientes</button>
      </article>
    `);
  }

  $("warehouseZoneList").innerHTML=cards.length?cards.join(""):'<div class="empty-state">Todavía no hay ubicaciones estructuradas.</div>';

  document.querySelectorAll("[data-zone-filter]").forEach(btn=>btn.addEventListener("click",()=>{
    $("searchInput").value=btn.dataset.zoneFilter+"-";
    state.filter="all";
    renderProducts();
    closeSheet("warehouseMapSheet");
    window.scrollTo({top:0,behavior:"smooth"});
  }));

  const pendingBtn=document.querySelector("[data-open-unlocated]");
  if(pendingBtn)pendingBtn.addEventListener("click",()=>{
    closeSheet("warehouseMapSheet");
    $("qrLabelFilter").value="unlocated";
    $("qrLabelSearch").value="";
    renderQrLabelList();
    openSheet("qrLabelsSheet");
  });
}

function openWarehouseMap(){
  renderWarehouseMap();
  openSheet("warehouseMapSheet");
}

function isWeightItem(item){
  const u=String(item.unit||"").toLowerCase();
  return ["kg","g","m"].includes(u)||/\bGRANEL\b|\bKG\b/i.test(item.name||"");
}

function isSuggestedQrItem(item){
  return item.family==="Frutas y verduras"||
    item.family==="Productos especiales"||
    /\bGRANEL\b/i.test(item.name||"");
}

function qrLabelVisibleItems(){
  const filter=$("qrLabelFilter").value;
  const q=$("qrLabelSearch").value.trim().toLowerCase();
  let rows=[...state.items];

  if(filter==="suggested")rows=rows.filter(isSuggestedQrItem);
  if(filter==="produce")rows=rows.filter(i=>i.family==="Frutas y verduras");
  if(filter==="weight")rows=rows.filter(isWeightItem);
  if(filter==="special")rows=rows.filter(i=>i.family==="Productos especiales");
  if(filter==="unlocated")rows=rows.filter(i=>!String(i.location||"").trim());

  if(q)rows=rows.filter(i=>
    i.name.toLowerCase().includes(q)||
    i.code.toLowerCase().includes(q)||
    String(i.family||"").toLowerCase().includes(q)
  );

  return rows;
}

function updateQrSelectionCount(){
  const n=state.qrLabelSelected.size;
  $("qrLabelSelectionCount").textContent=n+" "+(n===1?"seleccionada":"seleccionadas");
  $("printQrLabelsBtn").textContent=n
    ? "Generar e imprimir "+n+" "+(n===1?"etiqueta":"etiquetas")
    : "Generar e imprimir etiquetas";
}

function renderQrLabelList(){
  const rows=qrLabelVisibleItems();
  $("qrLabelList").innerHTML=rows.length?rows.map(i=>`
    <label class="qr-label-row">
      <input type="checkbox" data-qr-code="${esc(i.code)}" ${state.qrLabelSelected.has(i.code)?"checked":""}>
      <div>
        <b>${esc(i.name)}</b>
        <small>${esc(i.code)} · ${esc(i.family||"")} · ${unit(i.unit)}</small>
        <em class="qr-label-location">${i.location?("⌖ "+esc(i.location)):"⌖ Sin ubicación"}</em>
      </div>
      <button type="button" class="qr-location-btn" data-location-code="${esc(i.code)}">${i.location?"Editar":"Ubicar"}</button>
    </label>
  `).join(""):'<div class="empty-state">No hay productos con ese criterio.</div>';

  document.querySelectorAll("[data-qr-code]").forEach(input=>input.addEventListener("change",()=>{
    if(input.checked)state.qrLabelSelected.add(input.dataset.qrCode);
    else state.qrLabelSelected.delete(input.dataset.qrCode);
    updateQrSelectionCount();
  }));
  document.querySelectorAll("[data-location-code]").forEach(btn=>btn.addEventListener("click",e=>{
    e.preventDefault();
    e.stopPropagation();
    closeSheet("qrLabelsSheet");
    selectProduct(btn.dataset.locationCode);
    prepareLocationEditor(state.selected?.location||"");
    $("locationEditor").classList.remove("hidden");
    setTimeout(()=>$("locationZone").focus(),80);
  }));
  updateQrSelectionCount();
}

function openQrLabels(){
  if(!state.qrLabelSelected.size){
    state.items.filter(isSuggestedQrItem).forEach(i=>state.qrLabelSelected.add(i.code));
  }
  $("qrLabelFilter").value="suggested";
  $("qrLabelSearch").value="";
  renderQrLabelList();
  openSheet("qrLabelsSheet");
}

async function qrCodeApi(){
  if(state.qrCodeModule)return state.qrCodeModule;
  const mod=await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
  state.qrCodeModule=mod.default||mod;
  return state.qrCodeModule;
}

async function printQrLabels(){
  const selected=state.items.filter(i=>state.qrLabelSelected.has(i.code));
  if(!selected.length){
    toast("Selecciona al menos una etiqueta.");
    return;
  }

  const btn=$("printQrLabelsBtn");
  const previous=btn.textContent;
  btn.disabled=true;
  btn.textContent="Generando QR…";

  try{
    const QRCode=await qrCodeApi();
    const labels=[];
    for(const item of selected){
      const dataUrl=await QRCode.toDataURL(item.code,{
        errorCorrectionLevel:"M",
        margin:1,
        width:256
      });
      labels.push(`
        <article class="print-label-card">
          <div class="print-label-copy">
            <div class="print-brand">OCS · ALMACÉN FILLER</div>
            <h2>${esc(item.name)}</h2>
            <p>${esc(item.family||"Producto")} · ${unit(item.unit)}</p>
            <p class="print-location">Ubicación: ${esc(item.location||"Sin asignar")}</p>
            <strong>${esc(item.code)}</strong>
          </div>
          <img src="${dataUrl}" alt="QR ${esc(item.code)}">
        </article>
      `);
    }

    $("labelPrintArea").innerHTML=labels.join("");
    document.body.classList.add("printing-labels");
    $("labelPrintArea").setAttribute("aria-hidden","false");

    const cleanup=()=>{
      document.body.classList.remove("printing-labels");
      $("labelPrintArea").setAttribute("aria-hidden","true");
      window.removeEventListener("afterprint",cleanup);
    };
    window.addEventListener("afterprint",cleanup);
    setTimeout(()=>window.print(),120);
  }catch(e){
    console.error("QR label error",e);
    toast("No pudimos generar las etiquetas QR. Intenta nuevamente con conexión a internet.");
  }finally{
    btn.disabled=false;
    btn.textContent=previous;
    updateQrSelectionCount();
  }
}

function filteredItems(){
  const q=$("searchInput").value.trim().toLowerCase();
  let rows=[...state.items];
  if(q)rows=rows.filter(i=>
    i.name.toLowerCase().includes(q)||
    i.code.toLowerCase().includes(q)||
    String(i.location||"").toLowerCase().includes(q)
  );
  if(state.filter==="order")rows=rows.filter(i=>i.min>0&&i.stock<=i.min);
  if(state.filter==="zero")rows=rows.filter(i=>i.stock===0);
  return rows;
}
function statusClass(status){
  if(status==="PEDIR")return"order";
  if(status==="POR ACABARSE")return"low";
  if(status==="SOBRESTOCK")return"over";
  return"ok";
}
function renderProducts(){
  const rows=filteredItems();
  const titles={all:"Inventario",order:"Productos por pedir",zero:"Sin existencia"};
  $("listTitle").textContent=titles[state.filter]||"Inventario";
  $("showAllBtn").classList.toggle("hidden",state.filter==="all"&&!$("searchInput").value);
  $("clearSearch").classList.toggle("hidden",!$("searchInput").value);
  $("productList").innerHTML=rows.length?rows.slice(0,100).map(i=>`
    <button class="product-card" data-code="${esc(i.code)}">
      <div class="product-top">
        <div class="product-copy">
          <b>${esc(i.name)}</b>
          <small>${esc(i.code)} · ${esc(i.family||"Sin familia")}</small>
        </div>
        <div class="product-stock">${num(i.stock)} <small>${unit(i.unit)}</small></div>
      </div>
      <div class="product-footer">
        <span class="status-pill ${statusClass(i.status)}">${esc(i.status)}</span>
        <span class="family-pill">mín. ${num(i.min)} · máx. ${num(i.max)} ${unit(i.unit)}</span>
        ${i.location?`<span class="location-pill">⌖ ${esc(i.location)}</span>`:""}
      </div>
    </button>
  `).join(""):`<div class="empty-state">No encontramos productos con ese criterio.</div>`;
  document.querySelectorAll("[data-code]").forEach(b=>b.addEventListener("click",()=>selectProduct(b.dataset.code)));
}

function selectProduct(code){
  const item=state.items.find(i=>i.code===code);
  if(!item)return;
  state.selected=item;
  if(state.pendingMode){
    const mode=state.pendingMode;
    state.pendingMode=null;
    openMovement(mode);
    return;
  }
  $("productName").textContent=item.name;
  $("productCode").textContent=item.code+" · "+(item.family||"");
  $("productStock").textContent=num(item.stock)+" "+unit(item.unit);
  $("productMin").textContent="Mínimo "+num(item.min)+" "+unit(item.unit);
  $("productMax").textContent="Máximo "+num(item.max)+" "+unit(item.unit);
  $("productLocation").textContent=locationLabel(item.location);
  prepareLocationEditor(item.location||"");
  $("locationEditor").classList.add("hidden");
  openSheet("productSheet");
}

async function saveSelectedLocation(){
  if(!state.selected)return;
  updateLocationPreview();
  const location=buildLocationCode();
  if(!location){
    toast("Completa zona, mueble y nivel para generar la ubicación.");
    return;
  }

  const btn=$("saveLocationBtn");
  btn.disabled=true;
  try{
    const data=await api("/api/location",{
      method:"POST",
      body:JSON.stringify({code:state.selected.code,location})
    });

    state.selected={...state.selected,location:data.location||""};
    const idx=state.items.findIndex(i=>i.code===state.selected.code);
    if(idx>=0)state.items[idx]={...state.items[idx],location:data.location||""};

    $("productLocation").textContent=locationLabel(data.location);
    $("locationEditor").classList.add("hidden");
    renderProducts();
    updateWarehouseMapSummary();
    if($("qrLabelsSheet").classList.contains("show"))renderQrLabelList();
    if($("warehouseMapSheet").classList.contains("show"))renderWarehouseMap();
    toast("Ubicación "+data.location+" guardada.");
  }catch(err){
    toast(err.message);
  }finally{
    btn.disabled=false;
  }
}


async function loadExpiryAlerts(){
  try{
    const data=await api("/api/lots");
    const lots=(data.lots||[]).filter(l=>l.available>0&&l.expiry);
    const today=new Date();today.setHours(0,0,0,0);
    const days=iso=>Math.round((new Date(iso+"T00:00:00").getTime()-today.getTime())/86400000);
    const danger=lots.filter(l=>days(l.expiry)<=30).sort((a,b)=>a.expiry.localeCompare(b.expiry));
    state.expiryLots=lots;
    $("expirySummary").textContent=danger.length?danger.length+" lote(s) vencidos o por vencer en 30 días":"Sin lotes con vencimiento en 30 días · revisar fechas pendientes";
    $("expiryList").innerHTML=lots.length?lots.sort((a,b)=>a.expiry.localeCompare(b.expiry)).map(l=>{
      const d=days(l.expiry),label=d<0?"CADUCADO":d<=7?"URGENTE":d<=30?"PRÓXIMO":"VIGENTE";
      return '<article class="expiry-item"><strong>'+esc(l.name)+'</strong><small>Lote '+esc(l.lot)+' · '+esc(l.code)+'</small><div>Caduca '+esc(l.expiry)+' · '+num(l.available)+' '+esc(l.unit)+' · <b>'+label+(d>=0?" · "+d+" días":"")+'</b></div></article>';
    }).join(""):'<p class="empty-state">Sin lotes con fecha de caducidad capturada. Registra lote y fecha al recibir mercancía.</p>';
  }catch(e){$("expirySummary").textContent="No se pudieron consultar los lotes.";}
}
async function showFEFOForItem(code){
  try{
    const d=await api("/api/lots?code="+encodeURIComponent(code));
    const lots=(d.lots||[]).filter(l=>l.available>0);
    $("lotExitHint").textContent=lots.length
      ?"FEFO: primero "+lots[0].lot+" (caduca "+lots[0].expiry+"). Se descontarán primero las unidades del lote con fecha más próxima."
      :"Sin lotes registrados. La salida seguirá descontándose del inventario general.";
  }catch(e){$("lotExitHint").textContent="No fue posible consultar los lotes FEFO.";}
}

function openMovement(mode){
  const item=state.selected;
  if(!item){toast("Selecciona un producto.");return;}
  closeSheet("productSheet");
  state.pendingMode=null;

  if(state.selectionFromScanner&&["entry","exit","count"].includes(mode)){
    ensureScanSession(mode);
    state.resumeScanner=true;
  }
  state.selectionFromScanner=false;
  state.currentMode=mode;
  const config={
    entry:{eyebrow:"Entrada",title:"Recibir producto",label:"Cantidad que entra",button:"Registrar entrada"},
    exit:{eyebrow:"Salida",title:"Surtir producto",label:"Cantidad que sale",button:"Registrar salida"},
    waste:{eyebrow:"Merma",title:"Registrar merma",label:"Cantidad de merma",button:"Registrar merma"},
    count:{eyebrow:"Conteo físico",title:"Actualizar existencia",label:"Existencia física total",button:"Guardar conteo"}
  }[mode];
  $("movementEyebrow").textContent=config.eyebrow;
  $("movementTitle").textContent=config.title;
  $("movementProduct").textContent=item.name+" · "+item.code;
  $("systemStock").textContent=num(item.stock)+" "+unit(item.unit);
  $("quantityLabel").textContent=config.label;
  $("quantityUnit").textContent=unit(item.unit);
  $("saveMovementBtn").textContent=config.button;
  $("quantityInput").value="";
  $("notesInput").value="";
  $("lotInput").value="";
  $("expiryInput").value="";
  $("lotEntryFields").classList.toggle("hidden",mode!=="entry");
  $("lotExitHint").classList.toggle("hidden",mode!=="exit"&&mode!=="waste");
  if(mode==="exit"||mode==="waste")showFEFOForItem(item.code);
  $("countPreview").classList.add("hidden");
  $("countPreview").classList.remove("negative");
  openSheet("movementSheet");
  setTimeout(()=>$("quantityInput").focus(),80);
}

function switchView(view){
  const history=view==="history";
  $("homeView").classList.toggle("hidden",history);
  $("historyView").classList.toggle("hidden",!history);
  document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===view));
  if(history)loadHistory();
}

async function loadHistory(){
  try{
    $("historyList").innerHTML='<div class="empty-state">Cargando movimientos…</div>';
    const data=await api("/api/history");
    state.history=data.movements||[];
    $("historyList").innerHTML=state.history.length?state.history.map(m=>{
      const incoming=m.type==="Entrada";
      const sign=incoming?"+":"−";
      return `<article class="history-card">
        <div>
          <b>${esc(m.name||m.code)} · ${esc(m.type)}</b>
          <p>${esc(m.date||"")} · ${esc(m.responsible||"Sin responsable")}${m.reason?" · "+esc(m.reason):""}</p>
        </div>
        <strong class="history-qty ${incoming?"in":"out"}">${sign}${num(m.quantity)} ${unit(m.unit)}</strong>
      </article>`;
    }).join(""):'<div class="empty-state">Todavía no hay movimientos registrados.</div>';
  }catch(e){$("historyList").innerHTML='<div class="empty-state">'+esc(e.message)+'</div>';}
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const name=$("nameInput").value.trim();
  const pin=$("pinInput").value.trim();
  $("loginError").textContent="";
  try{await login(name,pin);}catch(err){$("loginError").textContent=err.message;}
});

$("searchInput").addEventListener("input",()=>{state.filter="all";renderProducts();});
$("clearSearch").addEventListener("click",()=>{$("searchInput").value="";state.filter="all";renderProducts();$("searchInput").focus();});
$("showAllBtn").addEventListener("click",()=>{$("searchInput").value="";state.filter="all";renderProducts();});
$("kpiProducts").addEventListener("click",()=>{$("searchInput").value="";state.filter="all";renderProducts();});
$("kpiOrder").addEventListener("click",()=>{$("searchInput").value="";state.filter="order";renderProducts();});
$("kpiZero").addEventListener("click",()=>{$("searchInput").value="";state.filter="zero";renderProducts();});
$("refreshBtn").addEventListener("click",loadInventory);
$("todayDeliveryCard").addEventListener("click",()=>{renderTodayDelivery();openSheet("deliverySheet");});
$("qrLabelsCard").addEventListener("click",openQrLabels);
$("warehouseMapCard").addEventListener("click",openWarehouseMap);
$("reportsCard").addEventListener("click",openReports);
$("stockReportBtn").addEventListener("click",()=>setReportType("stock"));
$("orderReportBtn").addEventListener("click",()=>setReportType("order"));
$("downloadReportCsvBtn").addEventListener("click",downloadCurrentReportCsv);
$("printReportBtn").addEventListener("click",printCurrentReport);
$("editLocationBtn").addEventListener("click",()=>{
  if(!state.selected)return;
  prepareLocationEditor(state.selected.location||"");
  $("locationEditor").classList.remove("hidden");
  setTimeout(()=>$("locationZone").focus(),60);
});
$("cancelLocationBtn").addEventListener("click",()=>$("locationEditor").classList.add("hidden"));
$("saveLocationBtn").addEventListener("click",saveSelectedLocation);
["locationZone","locationRack","locationLevel"].forEach(id=>{
  $(id).addEventListener("input",updateLocationPreview);
  $(id).addEventListener("change",updateLocationPreview);
});
$("locationLevel").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();saveSelectedLocation();}});
$("qrLabelFilter").addEventListener("change",renderQrLabelList);
$("qrLabelSearch").addEventListener("input",renderQrLabelList);
$("selectVisibleLabelsBtn").addEventListener("click",()=>{
  qrLabelVisibleItems().forEach(i=>state.qrLabelSelected.add(i.code));
  renderQrLabelList();
});
$("clearLabelSelectionBtn").addEventListener("click",()=>{
  state.qrLabelSelected.clear();
  renderQrLabelList();
});
$("printQrLabelsBtn").addEventListener("click",printQrLabels);
$("scanMovementBtn").addEventListener("click",()=>openScanner(null));
$("restartScannerBtn").addEventListener("click",startScanner);
$("manualBarcodeBtn").addEventListener("click",()=>handleBarcode($("manualBarcodeInput").value));
$("manualBarcodeInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();handleBarcode($("manualBarcodeInput").value);}});
$("scanSessionLabel").addEventListener("input",()=>{state.scanSessionLabel=$("scanSessionLabel").value.trim().slice(0,80);});
$("endScanSessionBtn").addEventListener("click",finishScanSession);
$("scannerManualSearchBtn").addEventListener("click",()=>{
  const mode=state.scanMode;
  stopScanner(false);
  closeSheet("scannerSheet");
  state.resumeScanner=Boolean(mode);
  state.scanMode=null;
  state.pendingMode=mode;
  switchView("home");
  toast(mode==="entry"?"Busca el producto que entra.":mode==="exit"?"Busca el producto que sale.":mode==="count"?"Busca el producto que vas a contar.":"Busca el producto.");
  setTimeout(()=>$("searchInput").focus(),80);
});
$("linkProductSearch").addEventListener("input",renderLinkResults);
$("scannerCloseBtn").addEventListener("click",()=>{
  if(state.scanSessionId)finishScanSession();
  else{stopScanner(true);closeSheet("scannerSheet");}
});
$("scannerSheet").addEventListener("click",e=>{
  if(e.target!==$("scannerSheet"))return;
  if(state.scanSessionId)finishScanSession();
  else{stopScanner(true);closeSheet("scannerSheet");}
});
const movementClose=document.querySelector('[data-close="movementSheet"]');
if(movementClose)movementClose.addEventListener("click",()=>{
  const returnMode=state.resumeScanner&&state.scanSessionMode?state.scanSessionMode:null;
  state.resumeScanner=false;
  state.scanMode=null;
  if(returnMode)setTimeout(()=>openScanner(returnMode),180);
});
$("logoutBtn").addEventListener("click",logout);
$("reloadHistoryBtn").addEventListener("click",loadHistory);

document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>openMovement(b.dataset.action)));

document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>{
  const nav=b.dataset.nav;
  if(nav==="history"){
    stopScanner(true);
    clearScanSession();
    switchView("history");
    return;
  }
  switchView("home");
  if(nav==="home"){
    stopScanner(true);
    clearScanSession();
    state.pendingMode=null;
    return;
  }
  if(["entry","exit","count"].includes(nav)){
    state.pendingMode=null;
    openScanner(nav);
  }
}));

$("quantityInput").addEventListener("input",()=>{
  if(state.currentMode!=="count"||!state.selected)return;
  const raw=$("quantityInput").value;
  if(raw===""){$("countPreview").classList.add("hidden");return;}
  const counted=Number(raw);
  if(!Number.isFinite(counted))return;
  const diff=Number((counted-state.selected.stock).toFixed(3));
  $("countPreview").classList.remove("hidden","negative");
  if(diff===0){
    $("countPreview").textContent="Coincide con el sistema. No se generará ajuste.";
  }else if(diff>0){
    $("countPreview").textContent="Sobran "+num(diff)+" "+unit(state.selected.unit)+". Se generará una entrada de ajuste.";
  }else{
    $("countPreview").classList.add("negative");
    $("countPreview").textContent="Faltan "+num(Math.abs(diff))+" "+unit(state.selected.unit)+". Se generará una salida de ajuste.";
  }
});

$("movementForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!state.selected)return;
  const quantity=Number($("quantityInput").value);
  const notes=$("notesInput").value.trim();
  const lot=state.currentMode==="entry"?$("lotInput").value.trim():"";
  const expiry=state.currentMode==="entry"?$("expiryInput").value:"";
  if(state.currentMode==="entry"&&Boolean(lot)!==Boolean(expiry)){toast("Captura juntos el lote y la fecha de caducidad.");return;}
  if(!Number.isFinite(quantity)||(state.currentMode==="count"?quantity<0:quantity<=0)){toast("Captura una cantidad válida.");return;}
  if((state.currentMode==="exit"||state.currentMode==="waste")&&quantity>state.selected.stock){
    toast("Solo hay "+num(state.selected.stock)+" "+unit(state.selected.unit)+" disponibles.");
    return;
  }
  $("saveMovementBtn").disabled=true;
  try{
    let result;
    if(state.currentMode==="count"){
      result=await api("/api/count",{method:"POST",body:JSON.stringify({
        code:state.selected.code,
        counted:quantity,
        notes,
        sessionId:state.scanSessionId,
        sessionLabel:state.scanSessionLabel
      })});
      toast(result.difference===0?"Conteo correcto. Sin ajuste.":"Conteo guardado y existencia ajustada.");
    }else{
      result=await api("/api/movement",{method:"POST",body:JSON.stringify({
        code:state.selected.code,
        type:state.currentMode,
        quantity,
        reason:notes,
        lot,expiry,
        sessionId:state.scanSessionId,
        sessionLabel:state.scanSessionLabel
      })});
      toast("Movimiento registrado.");
    }
    const completedCode=state.selected.code;
    const resumeMode=state.resumeScanner?state.currentMode:null;
    if(state.scanSessionId)state.scanSessionCount+=1;
    closeSheet("movementSheet");
    await loadInventory();
    state.selected=state.items.find(i=>i.code===completedCode)||null;
    if(resumeMode){
      state.resumeScanner=false;
      setTimeout(()=>openScanner(resumeMode),250);
    }
  }catch(err){toast(err.message);}
  finally{$("saveMovementBtn").disabled=false;}
});

$("expiryCard").addEventListener("click",()=>{loadExpiryAlerts();openSheet("expirySheet");});

if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));

if(state.name)$("nameInput").value=state.name;
if(state.token){showApp();loadInventory();}else{$("nameInput").focus();}
})();