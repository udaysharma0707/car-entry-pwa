// app.js - client for Car Entry PWA
// IMPORTANT: replace with your endpoint and token
const ENDPOINT = "https://script.google.com/macros/s/AKfycbwodGN93oP31SK_KK4dxL6LssMhSVEZq0VGaf_r-UN-ERTXFwVYnRVtrjPdCzFf7K0TDg/exec"; // e.g. https://script.google.com/macros/s/xxxx/exec
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

async function sendToServer(formData){
  const body = { token: SHARED_TOKEN, formData: formData, addIfMissing: !!formData.addIfMissing };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

function queueSubmission(formData){
  const q = getQueue(); q.push({ ts: Date.now(), data: formData }); setQueue(q);
}

async function flushQueue(){
  if (!navigator.onLine) return;
  let q = getQueue();
  if (!q || q.length === 0) return;
  submitBtn.disabled = true;
  for (let i=0; i<q.length; i++){
    try {
      const resp = await sendToServer(q[0].data); // always attempt first item
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

// periodic flush
setInterval(flushQueue, 30 * 1000);
