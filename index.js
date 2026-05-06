const express = require("express");
const app = express();
app.use(express.json());
const places = require("./places.json");


app.get("/places", (req, res) => { res.json(places); });

app.post("/plan", async (req, res) => {
  try {
    const { input, city } = req.body;
    const cityPlaces = places.filter(p => p.city === city);
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
        messages: [{ role: "user", content: "User wants: " + input + ". Venues: " + JSON.stringify(cityPlaces) + ". Return JSON: {story: string, plan: [{name, reason, score}]}" }]
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

app.post('/admin/places', (req, res) => {
  const data = require('./places.json');
  const newPlace = { ...req.body, id: Date.now() };
  data.push(newPlace);
  fs.writeFileSync('./places.json', JSON.stringify(data, null, 2));
  delete require.cache[require.resolve('./places.json')];
  res.json(newPlace);
});

app.delete('/admin/places/:id', (req, res) => {
  let data = require('./places.json');
  data = data.filter(p => p.id !== parseInt(req.params.id));
  fs.writeFileSync('./places.json', JSON.stringify(data, null, 2));
  delete require.cache[require.resolve('./places.json')];
  res.json({ ok: true });
});

const eventsFile = './events.json';
let events = require(eventsFile);

app.get('/events', (req, res) => {
  const { city, date } = req.query;
  let filtered = events;
  if (city) filtered = filtered.filter(e => e.city === city);
  if (date) filtered = filtered.filter(e => e.date === date);
  res.json(filtered);
});

app.post('/admin/events', (req, res) => {
  const newEvent = { ...req.body, id: Date.now() };
  events.push(newEvent);
  fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
  res.json(newEvent);
});

app.delete('/admin/events/:id', (req, res) => {
  events = events.filter(e => e.id !== parseInt(req.params.id));
  fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
  res.json({ ok: true });
});
app.listen(3000, () => console.log("Running"));