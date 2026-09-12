import { useEffect, useState } from 'react';

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || 'Request failed.');
  return body;
}

export default function App() {
  const [data, setData] = useState({ capacity: 800, load: 0, remaining: 800, appliances: [] });
  const [events, setEvents] = useState([]);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', wattage: '', priority: '' });

  const refresh = async () => {
    try {
      const [nextData, nextEvents] = await Promise.all([api('/api/status'), api('/api/events')]);
      setData(nextData); setEvents(nextEvents);
    } catch (error) { setNotice(error.message); }
  };
  useEffect(() => { refresh(); }, []);

  const action = async (url, options) => {
    try {
      const result = await api(url, options);
      setData(result);
      setNotice((result.messages || ['Updated.']).join(' '));
      setEvents(await api('/api/events'));
    } catch (error) { setNotice(error.message); }
  };
  const changeState = (id, desiredState) => action(`/api/appliances/${id}/state`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desired_state: desiredState }),
  });
  const submit = (event) => {
    event.preventDefault();
    action('/api/appliances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, wattage: Number(form.wattage), priority: Number(form.priority) }) });
    setForm({ name: '', wattage: '', priority: '' });
  };
  const percent = Math.min(100, data.load / data.capacity * 100);

  return <main>
    <header><div><p className="eyebrow">HOME POWER CONTROL</p><h1>Inverter Load Manager</h1><p>Keep essential power under the 800W limit.</p></div><div className="limit">MAX<br /><strong>{data.capacity}W</strong></div></header>
    <section className="capacity"><div className="cap-head"><span>Live capacity</span><strong>{data.load}W <small>used</small> · {data.remaining}W free</strong></div><div className="bar"><i style={{ width: `${percent}%` }} /></div></section>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <div className="grid"><section className="panel"><h2>Appliances <span>{data.appliances.length}</span></h2><div className="list">
      {data.appliances.length ? data.appliances.map(appliance => <article className="appliance" key={appliance.id}><div><h3>{appliance.name}</h3><p>{appliance.wattage}W · Priority {appliance.priority}</p></div><span className={`state ${appliance.state}`}>{appliance.state}</span><div className="actions"><button className="toggle" disabled={appliance.state === 'running'} onClick={() => changeState(appliance.id, 'on')}>ON</button><button className="toggle off" disabled={appliance.state === 'off'} onClick={() => changeState(appliance.id, 'off')}>OFF</button><button className="delete" onClick={() => window.confirm(`Delete ${appliance.name}?`) && action(`/api/appliances/${appliance.id}`, { method: 'DELETE' })}>Delete</button></div></article>) : <p className="empty">No appliances yet. Add your first load.</p>}
    </div></section><aside><section className="panel"><h2>Add appliance</h2><form onSubmit={submit}><label>Name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Fridge" /></label><label>Wattage<input required type="number" min="1" value={form.wattage} onChange={event => setForm({ ...form, wattage: event.target.value })} placeholder="300" /></label><label>Priority <em>1 = most important</em><input required type="number" min="1" value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })} placeholder="1" /></label><button className="add">Register appliance</button></form></section><section className="panel events"><h2>Activity</h2>{events.length ? events.map(event => <p key={event.id}>{event.message}<time>{new Date(`${event.created_at}Z`).toLocaleString()}</time></p>) : <p className="empty">System activity will appear here.</p>}</section></aside></div>
  </main>;
}
