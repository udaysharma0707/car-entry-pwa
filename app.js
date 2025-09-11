// app.js - client with strong validation + JSONP queueing only on network errors
const ENDPOINT = "https://script.google.com/macros/s/AKfycbw9CPa7Z-sYUhHWhbDC7rW8uAZi9c4Q_fG_eMT3YAs-tSQlfsFMqRMXxr54XAfWiLgctw/exec"; // <-- replace with your web app URL
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
    q = getQueue(); // refresh local copy
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

// Wire Clear button
if (clearBtn) {
  clearBtn.addEventListener('click', function(){
    clearForm();
    showMessage('Form cleared');
  });
}

// New submit behavior: immediate UI feedback + background sending/queueing
submitBtn.addEventListener('click', function() {
  try {
    // client validation: required fields
    var carReg = document.getElementById('carRegistrationNo').value.trim();
    var servicesChecked = document.querySelectorAll('.service:checked');
    var amount = document.getElementById('amountPaid').value.trim();
    var modeChecked = document.querySelectorAll('.mode:checked');

    if (carReg === "") { alert("Car registration number is required."); return; }
    if (!servicesChecked || servicesChecked.length === 0) { alert("Please select at least one service."); return; }
    if (amount === "") { alert("Amount paid by customer is required."); return; }
    if (!modeChecked || modeChecked.length === 0) { alert("Please select at least one mode of payment."); return; }

    // collect and uppercase except services
    var formData = collectFormData();
    formData = uppercaseExceptServices(formData);

    // Immediate UX: inform user, clear form
    showMessage('Submitted — registering...');
    clearForm();

    // briefly disable submit to avoid accidental very-quick duplicates, but keep button label unchanged
    submitBtn.disabled = true;
    setTimeout(()=>{ try { submitBtn.disabled = false; } catch(e){} }, 800);

    // Fire-and-forget send plus background flush
    (async function sendAndHandle() {
      if (navigator.onLine) {
        try {
          // send current item with clientTs (helps server ordering)
          const clientTs = Date.now();
          const resp = await sendToServerJSONP(formData, clientTs).catch(e=>{ throw e; });

          if (resp && resp.success) {
            showMessage("Saved — Serial: " + resp.serial);
          } else if (resp && resp.error) {
            // server-side validation error: show to user (do NOT queue)
            alert("Server rejected: " + resp.error);
            showMessage("Submission rejected by server.");
          } else {
            // unknown server condition -> queue locally
            queueSubmission(formData);
            showMessage("Saved locally (server busy). Will sync later.");
          }
        } catch (err) {
          // network/JSONP error -> queue locally
          console.warn("Background send error:", err);
          queueSubmission(formData);
          showMessage("Network error — saved locally.");
        }

        // attempt to flush older queued items in background (don't await long)
        flushQueue().catch(e=>{ console.warn("Background flush error:", e); });
      } else {
        // offline: queue locally
        queueSubmission(formData);
        showMessage("Offline — saved locally and will sync when online.");
      }
    })();

  } catch (ex) {
    console.error("submit handler error:", ex);
    showMessage("Unexpected error. Try again.");
    submitBtn.disabled = false;
  }
});
