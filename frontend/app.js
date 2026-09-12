const root = document.getElementById('root');
let dashboard = { capacity: 800, load: 0, remaining: 800, appliances: [] };
let activity = [];
let notice = '';

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || 'Request failed.');
  return body;
}
async function refresh() {
  try { [dashboard, activity] = await Promise.all([api('/api/status'), api('/api/events')]); }
  catch (error) { notice = error.message; }
  render();
}
async function action(url, options) {
  try { const result = await api(url, options); dashboard = result; notice = (result.messages || ['Updated.']).join(' '); activity = await api('/api/events'); }
  catch (error) { notice = error.message; }
  render();
}
function escapeHtml(value) { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; }
function render() {
  const percent = Math.min(100, dashboard.load / dashboard.capacity * 100);
  const appliances = dashboard.appliances.length ? dashboard.appliances.map(a => `<article class="appliance"><div><h3>${escapeHtml(a.name)}</h3><p>${a.wattage}W · Priority ${a.priority}</p></div><span class="state ${a.state}">${a.state}</span><div class="actions"><button class="toggle" data-on="${a.id}" ${a.state === 'running' ? 'disabled' : ''}>ON</button><button class="toggle off" data-off="${a.id}" ${a.state === 'off' ? 'disabled' : ''}>OFF</button><button class="delete" data-delete="${a.id}" data-name="${escapeHtml(a.name)}">Delete</button></div></article>`).join('') : '<p class="empty">No appliances yet. Add your first load.</p>';
  const events = activity.length ? activity.map(e => `<p>${escapeHtml(e.message)}<time>${new Date(e.created_at + 'Z').toLocaleString()}</time></p>`).join('') : '<p class="empty">System activity will appear here.</p>';
  root.innerHTML = `<main><header><div><p class="eyebrow">HOME POWER CONTROL</p><h1>Inverter Load Manager</h1><p>Keep essential power under the 800W limit.</p></div><div class="limit">MAX<br/><strong>${dashboard.capacity}W</strong></div></header><section class="capacity"><div class="cap-head"><span>Live capacity</span><strong>${dashboard.load}W <small>used</small> · ${dashboard.remaining}W free</strong></div><div class="bar"><i style="width:${percent}%"></i></div></section>${notice ? `<div class="notice">${escapeHtml(notice)}<button id="dismiss">×</button></div>` : ''}<div class="grid"><section class="panel"><h2>Appliances <span>${dashboard.appliances.length}</span></h2><div class="list">${appliances}</div></section><aside><section class="panel"><h2>Add appliance</h2><form id="add-form"><label>Name<input required name="name" placeholder="e.g. Fridge"/></label><label>Wattage<input required name="wattage" type="number" min="1" placeholder="300"/></label><label>Priority <em>1 = most important</em><input required name="priority" type="number" min="1" placeholder="1"/></label><button class="add">Register appliance</button></form></section><section class="panel events"><h2>Activity</h2>${events}</section></aside></div></main>`;
  bindEvents();
}
function bindEvents() {
  document.getElementById('dismiss')?.addEventListener('click', () => { notice = ''; render(); });
  document.getElementById('add-form').addEventListener('submit', event => { event.preventDefault(); const form = new FormData(event.currentTarget); action('/api/appliances', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name: form.get('name'), wattage: Number(form.get('wattage')), priority: Number(form.get('priority'))}) }); });
  document.querySelectorAll('[data-on]').forEach(button => button.addEventListener('click', () => action(`/api/appliances/${button.dataset.on}/state`, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{"desired_state":"on"}'})));
  document.querySelectorAll('[data-off]').forEach(button => button.addEventListener('click', () => action(`/api/appliances/${button.dataset.off}/state`, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{"desired_state":"off"}'})));
  document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => { if (confirm(`Delete ${button.dataset.name}?`)) action(`/api/appliances/${button.dataset.delete}`, {method:'DELETE'}); }));
}
refresh();
