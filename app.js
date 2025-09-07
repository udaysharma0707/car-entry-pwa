// app.js - JSONP-enabled client for Car Entry PWA (for GitHub Pages)
// Set these to your Apps Script webapp URL and the same secret token in Apps Script
const ENDPOINT = "https://script.google.com/macros/s/AKfycbzWLcZQPoGYEZyBTx9ditY3kUAExXgYl2WGS8PJPYofoAB4h-UI_Lt1VMWH1glgiiqc1Q/exec";
const SHARED_TOKEN = "shopSecret2025";

const KEY_QUEUE = "car_entry_queue_v1";
const submitBtn = document.getElementById('submitBtn');
const statusSpan = document.getElementById('status');

function updateStatus(){ statusSpan.textContent = navigator.onLine ? 'online' : 'offline'; }
window.addEventListener('online', ()=>{ updateStatus(); flushQueue(); });
window.addEventListener('offline', ()=>{ updateStatus(); });
updateStatus();

function getQueue(){ try { return JSON.parse(localStorage.getItem(KEY_QUEUE) || "[]"); } catch(e){ return []; } }
function setQueue(q){ localStorage.setItem(KEY_QUEUE, JSON.stringify(q)); }

/**
 * JSONP helper - injects <script src="..."> and expects a callback name.
 * dataObj: object of key->value that will be serialized into query string.
 * cb(err, resp) - callback invoked on success or error.
 */
function jsonpRequest(dataObj, cb, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  var callbackName = 'jsonp_cb_' + Date.now() + '_' + Math.floor(Math.random()*100000);
  // install callback
  window[callbackName] = function(response) {
    try { cb(null, response); } finally {
      // cleanup
      try { delete window[callbackName]; } catch(e){}
      if (script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    }
  };

  // build query string
  var qsParts = [];
  for (var k in dataObj) {
    if (!dataObj.hasOwnProperty(k)) continue;
    var v = dataObj[k];
    if (v === null || v === undefined) v = '';
    qsParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  qsParts.push('callback=' + encodeURIComponent(callbackName));

  var url = ENDPOINT + '?' + qsParts.join('&');

  var script = document.createElement('script');
  script.src = url;
  script.async = true;
  script.onerror = function() {
    // network error loading script
    try { delete window[callbackName]; } catch(e){}
    if (script.parentNode) script.parentNode.removeChild(script);
    if (timer) clearTimeout(timer);
    cb(new Error('Script load error'));
  };
  document.head.appendChild(script);

  var timer = setTimeout(function(){
    try { delete window[callbackName]; } catch(e){}
    if (script.parentNode) script.parentNode.removeChild(script);
    cb(new Error('Timeout'));
  }, timeoutMs);
}

/**
 * Replacement for previous fetch-based sendToServer.
 * Returns a Promise that resolves with server response object {success: true, ...}
 */
function sendToServer(formData) {
  return new Promise(function(resolve, reject){
    // flatten arrays to comma-separated strings for safe URL usage
    var payload = {
      token: SHARED_TOKEN,
      carRegistrationNo: formData.carRegistrationNo || '',
      carName: formData.carName || '',
      services: Array.isArray(formData.services) ? formData.services.join(', ') : (formData.services || ''),
      qtyTiresWheelCoverSold: formData.qtyTiresWheelCoverSold || '',
      amountPaid: formData.amountPaid || '',
      modeOfPayment: Array.isArray(formData.modeOfPayment) ? formData.modeOfPayment.join(', ') : (formData.modeOfPayment || ''),
      kmsTravelled: formData.kmsTravelled || '',
      adviceToCustomer: formData.adviceToCustomer || '',
      otherInfo: formData.otherInfo || '',
      addIfMissing: formData.addIfMissing ? '1' : ''
    };

    // Use JSONP
    jsonpRequest(payload, function(err, resp){
      if (err) return reject(err);
      if (resp && resp.success) return resolve(resp);
      // server replied but indicates error
      return reject(new Error((resp && resp.error) ? resp.error : 'Server error'));
    }, 20000);
  });
}

function queueSubmission(formData){
  const q = getQueue(); q.push({ ts: Date.now(), data: formData }); setQueue(q);
}

async function flushQueue(){
  if (!navigator.onLine) return;
  let q = getQueue();
  if (!q || q.length === 0) return;
  submitBtn.disabled = true;
  // keep trying to send the first item until failure
  while (q.length > 0) {
    try {
      const resp = await sendToServer(q[0].data);
      if (resp && resp.success) { q.shift(); setQueue(q); }
      else break;
    } catch (err) {
      // stop trying on network/server error
      break;
    }
  }
  submitBtn.disabled = false;
}

function collectFormData()
  formData = uppercaseExceptServices(formData); // convert fields (client-side)
{
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
    addIfMissing: document.getElementById('addIfMissing').checked
  };
}
// Convert fields to UPPERCASE except services (which we keep as-is).
function uppercaseExceptServices(fd) {
  // guard
  fd.carRegistrationNo = (fd.carRegistrationNo || "").toString().toUpperCase();
  fd.carName = (fd.carName || "").toString().toUpperCase();

  // services: leave them exactly as selected (do NOT uppercase)
  // fd.services is an array; we intentionally do nothing to it

  // numeric fields: keep as-is
  // qtyTiresWheelCoverSold, amountPaid, kmsTravelled - keep them unchanged
  // modeOfPayment: it's an array — uppercase its elements (user didn't exclude it)
  if (Array.isArray(fd.modeOfPayment)) {
    fd.modeOfPayment = fd.modeOfPayment.map(function(s){ return (s||"").toString().toUpperCase(); });
  } else {
    fd.modeOfPayment = (fd.modeOfPayment || "").toString().toUpperCase();
  }

  // free-text advice and other info -> uppercase
  fd.adviceToCustomer = (fd.adviceToCustomer || "").toString().toUpperCase();
  fd.otherInfo = (fd.otherInfo || "").toString().toUpperCase();

  return fd;
}


function showMessage(text){
  const m = document.getElementById('msg'); m.textContent = text; m.style.display='block';
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
  document.getElementById('addIfMissing').checked=false;
}

submitBtn.addEventListener('click', async function(){
  const formData = collectFormData();
  if (!formData.carRegistrationNo) { alert('Please enter Car registration no.'); return; }
  if (!formData.carName) { alert('Please enter Car name'); return; }

  submitBtn.disabled = true; submitBtn.textContent = 'Saving...';
  try {
    if (navigator.onLine) {
      const res = await sendToServer(formData);
      if (res && res.success) {
        showMessage('Saved — Serial: ' + res.serial);
        clearForm();
        // attempt flush any queued items too
        flushQueue();
      } else {
        // server rejected — queue locally
        queueSubmission(formData);
        showMessage('Saved locally (server busy). Will sync later.');
      }
    } else {
      queueSubmission(formData);
      showMessage('Offline — saved locally and will sync when online.');
    }
  } catch (err) {
    queueSubmission(formData);
    showMessage('Network error — saved locally.');
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = 'Submit';
  }
});



