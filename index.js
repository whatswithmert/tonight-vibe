const express = require("express");
const app = express();
app.use(express.json());
const places = require("./places.json");


app.get("/places", (req, res) => { res.json(places); });

app.post("/plan", async (req, res) => {
  try {
    const { input, city } = req.body;
    const placesResult = await pool.query('SELECT * FROM places WHERE city=$1', [city]);
  const cityPlaces = placesResult.rows;
  const eventsResult = await pool.query('SELECT * FROM events WHERE city=$1 ORDER BY date', [city]);
  const cityEvents = eventsResult.rows;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: "You are a nightlife expert. Always respond with raw JSON only, no markdown.",
        messages: [{ role: "user", content: "User wants: " + input + ". First check upcoming events and recommend specific events if they match. Then suggest venues. Always mention specific event names and dates when available. Venues: " + JSON.stringify(cityPlaces) + ". Upcoming events: " + JSON.stringify(cityEvents) + ". If relevant events exist, include them in plan with venue name and date. Return JSON: {story: string, plan: [{name, reason, score}]}" }]
      })
    });
    const data = await response.json();
    const text = data.content[0].text.replace(/```json|```/g, "").trim();
    res.json(JSON.parse(text));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});


const fs = require('fs');

app.use('/admin', (req, res, next) => {
  const pass = req.headers['x-admin-password'];
  if (pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.use(express.static('public'));

app.post('/admin/places', async (req, res) => {
  const { name, city, category, vibe, music, notes, price_level, open_late, pet_friendly } = req.body;
  const result = await pool.query(
    'INSERT INTO places (name, city, category, vibe, music, notes, price_level, open_late, pet_friendly) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [name, city, category||'nightlife', vibe||[], music||[], notes, price_level||2, open_late||false, pet_friendly||false]
  );
  res.json(result.rows[0]);
});

app.delete('/admin/places/:id', async (req, res) => {
  await pool.query('DELETE FROM places WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

const eventsFile = './events.json';
let events = require(eventsFile);

app.get('/events', async (req, res) => {
  const { city, date } = req.query;
  let q = 'SELECT * FROM events WHERE 1=1';
  const params = [];
  if (city) { params.push(city); q += ' AND city=$' + params.length; }
  if (date) { params.push(date); q += ' AND date=$' + params.length; }
  q += ' ORDER BY date';
  const result = await pool.query(q, params);
  res.json(result.rows);
});

app.post('/admin/events', async (req, res) => {
  const { name, venue, city, date, time, artists, description, price, url, location_url } = req.body;
  const result = await pool.query(
    'INSERT INTO events (name, venue, city, date, time, artists, description, price, url, location_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (venue, date, name) DO NOTHING RETURNING *',
    [name, venue, city, date, time||'', artists||[], description||'', price||0, url||'', location_url||'']
  );
  res.json(result.rows[0] || { duplicate: true });
});

app.delete('/admin/events/:id', async (req, res) => {
  await pool.query('DELETE FROM events WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

const multer = require('multer');
const XLSX = require('xlsx');
const upload = multer({ storage: multer.memoryStorage() });

app.post('/admin/upload-events', upload.single('file'), (req, res) => {
  const venue = req.body.venue;
  const city = req.body.city || 'Rotterdam';
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  let added = 0;
  let duplicates = [];
  rows.forEach(row => {
    const date = row['Date (YYYY-MM-DD)'] || row['date'];
    const name = row['Event Name'] || row['name'];
    if (!date || !name) return;
    const duplicate = events.find(e => e.venue === venue && e.date === String(date) && e.name === name);
    if (duplicate) { duplicates.push(name + ' on ' + date); return; }
    const artists = row['Artists'] ? String(row['Artists']).split(',').map(s => s.trim()) : [];
    events.push({ 
      id: Date.now() + added, 
      name, venue, city, 
      date: String(date), 
      time: row['Time'] || '',
      artists, 
      description: row['Description'] || '',
      price: row['Price (€)'] || 0, 
      url: row['Ticket URL'] || '',
      location_url: row['Location'] || ''
    });
    added++;
  });
  fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
  res.json({ added, duplicates });
});
app.listen(3000, () => console.log("Running"));