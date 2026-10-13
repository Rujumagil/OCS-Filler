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
  qrCodeModule:null
};

const $=id=>document.getElementById(id);
const num=v=>Number(v||0).toLocaleString("es-MX",{maximumFractionDigits:3});
const unit=v=>({pieza:"pza",pza:"pza",kg:"kg",g:"g",L:"L",l:"L",ml:"ml",m:"m"}[v]||v||"u");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

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
      google_sheets_failed:"No se pudo leer el Control de Almacén.",
      item_not_found:"Producto no encontrado.",
      insufficient_stock:"La cantidad supera la existencia disponible.",
      movement_capacity_reached:"La bitácora llegó a su capacidad.",
      invalid_count:"El conteo no es válido.",
      barcode_required:"No se detectó un código.",
      barcode_not_linked:"El código todavía no está vinculado.",
      barcode_already_linked:"Ese código ya está vinculado a otro producto.",
      barcode_link_invalid:"No se pudo vincular el código."
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

function isWeightItem(item){
  const u=String(item.unit||"").toLowerCase();
  return ["kg","g","m"].includes(u)||/\bGRANEL\b|\bKG\b/i.test(item.name||"");
}

function isSuggestedQrItem(item){
  return item.family==="Frutas y verduras"||
    item.family==="Productos especiales"||
    isWeightItem(item);
}

function qrLabelVisibleItems(){
  const filter=$("qrLabelFilter").value;
  const q=$("qrLabelSearch").value.trim().toLowerCase();
  let rows=[...state.items];

  if(filter==="suggested")rows=rows.filter(isSuggestedQrItem);
  if(filter==="produce")rows=rows.filter(i=>i.family==="Frutas y verduras");
  if(filter==="weight")rows=rows.filter(isWeightItem);
  if(filter==="special")rows=rows.filter(i=>i.family==="Productos especiales");

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
      </div>
      <span>QR OCS</span>
    </label>
  `).join(""):'<div class="empty-state">No hay productos con ese criterio.</div>';

  document.querySelectorAll("[data-qr-code]").forEach(input=>input.addEventListener("change",()=>{
    if(input.checked)state.qrLabelSelected.add(input.dataset.qrCode);
    else state.qrLabelSelected.delete(input.dataset.qrCode);
    updateQrSelectionCount();
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
  if(q)rows=rows.filter(i=>i.name.toLowerCase().includes(q)||i.code.toLowerCase().includes(q));
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
  openSheet("productSheet");
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

if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));

if(state.name)$("nameInput").value=state.name;
if(state.token){showApp();loadInventory();}else{$("nameInput").focus();}
})();