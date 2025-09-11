// app.js - client with strong validation + JSONP queueing only on network errors
const ENDPOINT = "https://script.google.com/macros/s/AKfycbxmSdEC3-rNn2Jh601kaUckXEXQkXGXUR2jcpOTR4_D9v_F0axkY54Ga9QQ2hR25wD2RQ/exec"; // <-- replace with your web app URL
const SHARED_TOKEN = "shopSecret2025";

const KEY_QUEUE = "car_entry_queue_v1";
const submitBtn = document.getElementById('submitBtn');
const clearBtn = document.getElementById('clearBtn');
const statusSpan = document.getElementById('status');

function updateStatus(){ statusSpan.textContent = navigator.onLine ? 'online' : 'offline'; }
window.addEventListener('online', ()=>{ updateStatus(); flushQueue(); });
window.addEventListener('offline', ()=>{ updateStatus(); });
updateStatus();

function getQueue(){ try { return JSON.parse(localStorage.getItem(KEY_QUEUE) || "[]"); } catch(e){ return []; } }
function setQueue(q){ localStorage.setItem(KEY_QUEUE, JSON.stringify(q)); }

// uppercase helper (except services)
function uppercaseExceptServices(fd) {
  try {
    fd.carRegistrationNo = (fd.carRegistrationNo || "").toString().toUpperCase();
    fd.carName = (fd.carName || "").toString().toUpperCase();
    // services left as-is (array)
    if (Array.isArray(fd.modeOfPayment)) fd.modeOfPayment = fd.modeOfPayment.map(s => (s||"").toString().toUpperCase());
    else fd.modeOfPayment = (fd.modeOfPayment || "").toString().toUpperCase();
    fd.adviceToCustomer = (fd.adviceToCustomer || "").toString().toUpperCase();
    fd.otherInfo = (fd.otherInfo || "").toString().toUpperCase();
  } catch(e){}
  return fd;
}

// JSONP helper
function jsonpRequest(url, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  return new Promise(function(resolve, reject) {
    var cbName = "jsonp_cb_" + Date.now() + "_" + Math.floor(Math.random()*100000);
    window[cbName] = function(data) {
      try { resolve(data); } finally {
        try { delete window[cbName]; } catch(e){}
        var s = document.getElementById(cbName);
        if (s && s.parentNode) s.parentNode.removeChild(s);
      }
    };
    url = url.replace(/(&|\?)?callback=[^&]*/i, "");
    var full = url + (url.indexOf('?') === -1 ? '?' : '&') + 'callback=' + encodeURIComponent(cbName);
    var script = document.createElement('script');
    script.id = cbName;
    script.src = full;
    script.async = true;
    script.onerror = function() {
      try { delete window[cbName]; } catch(e){}
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('JSONP script load error'));
    };
    var timer = setTimeout(function(){
      try { delete window[cbName]; } catch(e){}
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('JSONP timeout'));
    }, timeoutMs);
    document.body.appendChild(script);
  });
}

// Build JSONP URL and call
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
  if (url.length > 1900) return Promise.reject(new Error("Payload too large for JSONP"));
  return jsonpRequest(url, 20000);
}

function queueSubmission(formData){
  var q = getQueue(); q.push({ ts: Date.now(), data: formData }); setQueue(q);
}

async function flushQueue() {
  if (!navigator.onLine) return;
  var q = getQueue();
  if (!q || q.length === 0) return;
  submitBtn.disabled = true;
  while (q.length > 0 && navigator.onLine) {
    var item = q[0];
    try {
      var resp = await sendToServerJSONP(item.data, item.ts);
      if (resp && resp.success) { q.shift(); setQueue(q); await new Promise(r=>setTimeout(r,120)); }
      else {
        // If server returns error (validation), do NOT queue further - show and stop
        if (resp && resp.error) { alert("Server error: " + resp.error); break; }
        // else unknown server failure -> break (we'll try later)
        break;
      }
    } catch (err) {
      console.error("flush error:", err);
      break;
    }
  }
  submitBtn.disabled = false;
}

function collectFormData(){
  var services = Array.from(document.querySelectorAll('.service:checked')).map(i=>i.value);
  var mode = Array.from(document.querySelectorAll('.mode:checked')).map(i=>i.value);
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
  var m = document.getElementById('msg'); if (!m) { alert(text); return; }
  m.textContent = text; m.style.display='block';
  setTimeout(()=>{ m.style.display='none'; }, 4000);
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

// Named submit function used by the click handler
async function submitForm() {
  // client validation: required fields
  var amount = document.getElementById('amountPaid').value.trim();
  var modeChecked = document.querySelectorAll('.mode:checked');
  if (amount === "") { alert("Amount paid by customer is required."); return; }
  if (!modeChecked || modeChecked.length === 0) { alert("Please select at least one mode of payment."); return; }

  // collect and uppercase except services
  var formData = collectFormData();
  formData = uppercaseExceptServices(formData);

  submitBtn.disabled = true; submitBtn.textContent = 'Saving...';

  if (navigator.onLine) {
    try {
      // flush queued first
      await flushQueue();

      // send current item with clientTs (helps server keep order)
      var clientTs = Date.now();
      var resp = await sendToServerJSONP(formData, clientTs);

      if (resp && resp.success) {
        showMessage("Saved — Serial: " + resp.serial);
        clearForm();
        await flushQueue(); // attempt to flush anything left
      } else if (resp && resp.error) {
        // server-side validation error: show to user and DO NOT queue
        alert("Server rejected: " + resp.error);
      } else {
        // unknown server condition: queue locally (but avoid queuing on validation errors above)
        queueSubmission(formData);
        clearForm();
        showMessage("Saved locally (server busy). Will sync later.");
      }
    } catch (err) {
      // network error -> queue locally
      console.warn("Network / JSONP error:", err);
      queueSubmission(formData);
      clearForm();
      showMessage("Network error — saved locally.");
    }
  } else {
    // offline -> queue locally
    queueSubmission(formData);
    clearForm();
    showMessage("Offline — saved locally and will sync when online.");
  }

  submitBtn.disabled = false; submitBtn.textContent = 'Submit';
}

// hook up the UI
if (submitBtn) {
  submitBtn.addEventListener('click', function(e){
    e.preventDefault();
    submitForm();
  });
}
if (clearBtn) {
  clearBtn.addEventListener('click', function(e){
    e.preventDefault();
    clearForm();
    showMessage('Form cleared');
  });
}
