// debug-app.js - JSONP-enabled client with verbose logging & uppercase (except services)
// REPLACE these two lines with your values:
const ENDPOINT = "https://script.google.com/macros/s/AKfycbxzWc1V48rVEPXupAYKeB3V80Z0fkUwKp6aIk9DNuHzzW1q8o8ZsrxKMmSXDdRFYsZTgA/exec";
const SHARED_TOKEN = "shopSecret2025";

// --- UI / queue setup ---
const KEY_QUEUE = "car_entry_queue_v1";
const submitBtn = document.getElementById('submitBtn');
const statusSpan = document.getElementById('status');

function updateStatus(){ statusSpan.textContent = navigator.onLine ? 'online' : 'offline'; console.log('[STATUS]', statusSpan.textContent); }
window.addEventListener('online', ()=>{ updateStatus(); flushQueue(); });
window.addEventListener('offline', ()=>{ updateStatus(); });
updateStatus();

function getQueue(){ try { return JSON.parse(localStorage.getItem(KEY_QUEUE) || "[]"); } catch(e){ console.error('queue parse error', e); return []; } }
function setQueue(q){ localStorage.setItem(KEY_QUEUE, JSON.stringify(q)); }

// --- Uppercase helper (except services) ---
function uppercaseExceptServices(fd) {
  try {
    fd.carRegistrationNo = (fd.carRegistrationNo || "").toString().toUpperCase();
    fd.carName = (fd.carName || "").toString().toUpperCase();
    // services left as-is
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

// --- JSONP helper with strong logging ---
function jsonpRequest(dataObj, cb, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  var callbackName = 'jsonp_cb_' + Date.now() + '_' + Math.floor(Math.random()*100000);
  console.log('[JSONP] creating callback', callbackName);

  window[callbackName] = function(response) {
    try { console.log('[JSONP] callback fired', response); cb(null, response); }
    finally {
      try { delete window[callbackName]; } catch(e){}
      if (script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    }
  };

  var qsParts = [];
  for (var k in dataObj) {
    if (!dataObj.hasOwnProperty(k)) continue;
    var v = dataObj[k];
    if (v === null || v === undefined) v = '';
    qsParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  qsParts.push('callback=' + encodeURIComponent(callbackName));
  var url = ENDPOINT + '?' + qsParts.join('&');
  console.log('[JSONP] injecting script src=', url);

  var script = document.createElement('script');
  script.src = url;
  script.async = true;
  script.onerror = function(ev) {
    console.error('[JSONP] script load error', ev);
    try { delete window[callbackName]; } catch(e){}
    if (script.parentNode) script.parentNode.removeChild(script);
    if (timer) clearTimeout(timer);
    cb(new Error('Script load error'));
  };
  document.head.appendChild(script);

  var timer = setTimeout(function(){
    try { delete window[callbackName]; } catch(e){}
    if (script.parentNode) script.parentNode.removeChild(script);
    console.warn('[JSONP] timeout waiting for callback');
    cb(new Error('Timeout'));
  }, timeoutMs);
}

async function sendToServer(formData, clientTs) {
  // include clientTs if provided (epoch millis)
  const body = { token: SHARED_TOKEN, formData: formData, clientTs: clientTs || null, addIfMissing: !!formData.addIfMissing };

  // We'll still use JSONP GET in your app (existing pattern). If using JSONP,
  // ensure you include clientTs as a parameter instead of body. If you still use fetch POST,
  // keep this body usage. Below example works if you changed to POST endpoint accepting JSON.
  const res = await fetch(ENDPOINT, {
    method: 'POST', // if your endpoint supports POST; otherwise send clientTs as query param for JSONP
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}


    // quick URL-length guard (approx)
    var roughLength = (ENDPOINT + '?' + Object.keys(payload).map(k=>k+'='+payload[k]).join('&')).length;
    console.log('[JSONP] estimated URL length', roughLength);
    if (roughLength > 1900) {
      return reject(new Error('Payload too large for JSONP (try shorter text)'));
    }

    jsonpRequest(payload, function(err, resp){
      if (err) return reject(err);
      if (resp && resp.success) return resolve(resp);
      return reject(new Error((resp && resp.error) ? resp.error : 'Server error'));
    }, 20000);
  });
}

function queueSubmission(formData){
  const q = getQueue(); q.push({ ts: Date.now(), data: formData }); setQueue(q);
  console.log('[QUEUE] queued item, new length=', getQueue().length);
}

async function flushQueue(){
  if (!navigator.onLine) return;
  let q = getQueue();
  if (!q || q.length === 0) return;
  submitBtn.disabled = true;
  while (q.length > 0) {
    try {
      const item = q[0];
      // item = { ts: <epoch>, data: {...} }
      // For JSONP approach, build the injected script URL with &clientTs=item.ts
      const resp = await sendToServer(item.data, item.ts);
      if (resp && resp.success) { q.shift(); setQueue(q); }
      else { break; }
    } catch (err){ break; }
  }
  submitBtn.disabled = false;
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
    addIfMissing: document.getElementById('addIfMissing').checked
  };
}

function showMessage(text){
  const m = document.getElementById('msg'); m.textContent = text; m.style.display='block'; console.log('[UI]', text);
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
  try {
    let formData = collectFormData();
    // Uppercase (except services)
    formData = uppercaseExceptServices(formData);
    console.log('[SUBMIT] formData after uppercaseExceptServices:', formData);

    if (!formData.carRegistrationNo) { alert('Please enter Car registration no.'); return; }
    if (!formData.carName) { alert('Please enter Car name'); return; }

    submitBtn.disabled = true; submitBtn.textContent = 'Saving...';

    if (navigator.onLine) {
      try {
        const res = await sendToServer(formData);
        if (res && res.success) {
          showMessage('Saved — Serial: ' + res.serial);
          clearForm();
          flushQueue();
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






