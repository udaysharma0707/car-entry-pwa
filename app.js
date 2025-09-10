// app.js - offline-first JSONP client (queueing + sequential flush + uppercase except services)
// IMPORTANT: set ENDPOINT to your Apps Script web app URL and SHARED_TOKEN to the secret above
const ENDPOINT = "https://script.google.com/macros/s/AKfycbynT6LR1VIKwh85RKlGh2YJv6ogbF5Tr_tTkdC8GoXs36-O7LV3XUl-RPMblcG_eNkgww/exec";
const SHARED_TOKEN = "shopSecret2025";

const KEY_QUEUE = "car_entry_queue_v1";
const submitBtn = document.getElementById('submitBtn');
const statusSpan = document.getElementById('status');

function updateStatus(){ statusSpan.textContent = navigator.onLine ? 'online' : 'offline'; console.log('[STATUS]', statusSpan.textContent); }
window.addEventListener('online', ()=>{ updateStatus(); flushQueue(); });
window.addEventListener('offline', ()=>{ updateStatus(); });
updateStatus();

function getQueue(){ try { return JSON.parse(localStorage.getItem(KEY_QUEUE) || "[]"); } catch(e){ console.error('queue parse error', e); return []; } }
function setQueue(q){ localStorage.setItem(KEY_QUEUE, JSON.stringify(q)); }

// uppercase everything except services array
function uppercaseExceptServices(fd) {
  try {
    fd.carRegistrationNo = (fd.carRegistrationNo || "").toString().toUpperCase();
    fd.carName = (fd.carName || "").toString().toUpperCase();
    // services left as-is (array or string)
    if (Array.isArray(fd.modeOfPayment)) {
      fd.modeOfPayment = fd.modeOfPayment.map(s => (s||"").toString().toUpperCase());
    } else {
      fd.modeOfPayment = (fd.modeOfPayment || "").toString().toUpperCase();
    }
    fd.adviceToCustomer = (fd.adviceToCustomer || "").toString().toUpperCase();
    fd.otherInfo = (fd.otherInfo || "").toString().toUpperCase();
  } catch (e) {
    console.warn('uppercaseExceptServices error', e);
  }
  return fd;
}

// JSONP helper that returns a Promise and cleans up callback & script
function jsonpRequest(url, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  return new Promise(function(resolve, reject) {
    var callbackName = "jsonp_cb_" + Date.now() + "_" + Math.floor(Math.random()*1000000);
    window[callbackName] = function(data) {
      try { resolve(data); } finally {
        try { delete window[callbackName]; } catch(e){}
        var s = document.getElementById(callbackName);
        if (s && s.parentNode) s.parentNode.removeChild(s);
      }
    };
    // ensure callback param not present already
    url = url.replace(/(&|\?)?callback=[^&]*/i, "");
    var fullUrl = url + (url.indexOf('?') === -1 ? '?' : '&') + 'callback=' + encodeURIComponent(callbackName);
    var script = document.createElement('script');
    script.id = callbackName;
    script.src = fullUrl;
    script.async = true;
    script.onerror = function(ev) {
      try { delete window[callbackName]; } catch(e){}
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('JSONP script load error'));
    };
    var timer = setTimeout(function(){
      try { delete window[callbackName]; } catch(e){}
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('JSONP timeout'));
    }, timeoutMs);
    // wrap resolve to clear timer
    var origResolve = resolve;
    resolve = function(data) { clearTimeout(timer); origResolve(data); };
    document.body.appendChild(script);
  });
}

// Build JSONP URL and send - returns a Promise resolved with server object
function sendToServerJSONP(formData, clientTs) {
  var params = [];
  function add(k,v){ if (v === undefined || v === null) v=""; params.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v))); }
  add("token", SHARED_TOKEN);
  add("carRegistrationNo", formData.carRegistrationNo || "");
  add("carName", formData.carName || "");
  if (Array.isArray(formData.services)) add("services", formData.services.join(", "));
  else add("services", formData.services || "");
  add("qtyTiresWheelCoverSold", formData.qtyTiresWheelCoverSold || "");
  add("amountPaid", formData.amountPaid || "");
  if (Array.isArray(formData.modeOfPayment)) add("modeOfPayment", formData.modeOfPayment.join(", "));
  else add("modeOfPayment", formData.modeOfPayment || "");
  add("kmsTravelled", formData.kmsTravelled || "");
  add("adviceToCustomer", formData.adviceToCustomer || "");
  add("otherInfo", formData.otherInfo || "");
  if (clientTs) add("clientTs", String(clientTs));

  var base = ENDPOINT;
  var url = base + (base.indexOf('?') === -1 ? '?' : '&') + params.join("&");
  // quick guard: URL length for JSONP should be under ~1900 chars for some browsers/servers
  if (url.length > 1900) {
    return Promise.reject(new Error("Payload too large for JSONP; shorten text or use a POST-based endpoint"));
  }
  console.log("[JSONP] sending:", url);
  return jsonpRequest(url, 20000);
}

function queueSubmission(formData){
  const q = getQueue(); q.push({ ts: Date.now(), data: formData }); setQueue(q);
  console.log('[QUEUE] queued item, new length=', getQueue().length);
}

// flushQueue: sequentially send queued items oldest-first; wait for each to succeed before continuing
async function flushQueue() {
  if (!navigator.onLine) {
    console.log("[FLUSH] offline; abort");
    return;
  }
  let q = getQueue();
  if (!q || q.length === 0) {
    console.log("[FLUSH] queue empty");
    return;
  }
  submitBtn.disabled = true;
  console.log("[FLUSH] starting, length=", q.length);
  while (q.length > 0 && navigator.onLine) {
    const item = q[0];
    try {
      const resp = await sendToServerJSONP(item.data, item.ts);
      console.log("[FLUSH] response:", resp);
      if (resp && resp.success) {
        q.shift();
        setQueue(q);
        // tiny delay
        await new Promise(r => setTimeout(r, 120));
      } else {
        console.warn("[FLUSH] server rejected:", resp);
        break;
      }
    } catch (err) {
      console.error("[FLUSH] send error:", err);
      break;
    }
  }
  submitBtn.disabled = false;
  console.log("[FLUSH] finished, remaining=", getQueue().length);
}

function collectFormData(){
  const services = Array.from(document.querySelectorAll('.service:checked')).map(i=>i.value);
  const mode = Array.from(document.querySelectorAll('.mode:checked')).map(i=>i.value);
  return {
    carRegistrationNo: document.getElementById('carRegistrationNo').value.trim(),
    carName: document.getElementById('carName').value.trim(),
    services: services,
    qtyTiresWheelCoverSold: document.getElementById('qtyTiresWheelCoverSold').value,
    amountPaid: document.getElementById('amountPaid').value,
    modeOfPayment: mode,
    kmsTravelled: document.getElementById('kmsTravelled').value,
    adviceToCustomer: document.getElementById('adviceToCustomer').value.trim(),
    otherInfo: document.getElementById('otherInfo').value.trim(),
    addIfMissing: document.getElementById('addIfMissing') ? document.getElementById('addIfMissing').checked : false
  };
}

function showMessage(text){
  const m = document.getElementById('msg'); if (!m) { console.log('[UI]', text); return; }
  m.textContent = text; m.style.display='block'; console.log('[UI]', text);
  setTimeout(()=>{ if (m) m.style.display='none'; }, 4000);
}
function clearForm(){
  document.getElementById('carRegistrationNo').value='';
  document.getElementById('carName').value='';
  document.querySelectorAll('.service').forEach(ch=>ch.checked=false);
  document.getElementById('qtyTiresWheelCoverSold').value='';
  document.getElementById('amountPaid').value='';
  document.querySelectorAll('.mode').forEach(ch=>ch.checked=false);
  document.getElementById('kmsTravelled').value='';
  document.getElementById('adviceToCustomer').value='';
  document.getElementById('otherInfo').value='';
  if (document.getElementById('addIfMissing')) document.getElementById('addIfMissing').checked=false;
}

// Submit handler: flush queue first (if online), then send the current item
submitBtn.addEventListener('click', async function(){
  try {
    let formData = collectFormData();
    formData = uppercaseExceptServices(formData);
    console.log('[SUBMIT] formData after uppercaseExceptServices:', formData);

    if (!formData.carRegistrationNo) { alert('Please enter Car registration no.'); return; }
    if (!formData.carName) { alert('Please enter Car name'); return; }

    submitBtn.disabled = true; submitBtn.textContent = 'Saving...';

    if (navigator.onLine) {
      try {
        // 1) ensure queued offline items are flushed first
        await flushQueue();

        // 2) send current item, include clientTs so server can preserve correct ordering
        const clientTs = Date.now();
        const res = await sendToServerJSONP(formData, clientTs);

        if (res && res.success) {
          showMessage('Saved — Serial: ' + res.serial);
          clearForm();
          // tiny flush in case something queued meanwhile
          await flushQueue();
        } else {
          queueSubmission(formData);
          showMessage('Saved locally (server busy). Will sync later.');
        }
      } catch (err) {
        console.warn('[SUBMIT] sendToServer error', err);
        queueSubmission(formData);
        showMessage('Network error — saved locally.');
      }
    } else {
      queueSubmission(formData);
      showMessage('Offline — saved locally and will sync when online.');
    }
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = 'Submit';
  }
});

















