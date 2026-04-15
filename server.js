const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const dataPath = path.join(__dirname, 'data');

async function readData(file) {
  try {
    const data = await fs.readFile(path.join(dataPath, file), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function writeData(file, data) {
  await fs.writeFile(path.join(dataPath, file), JSON.stringify(data, null, 2));
}

// In-memory token store
const activeSessions = new Map(); // token -> user details

// Middleware to authenticate
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = activeSessions.get(token);
  next();
}

function requireOrganizer(req, res, next) {
  if (req.user.role !== 'organizer') {
    return res.status(403).json({ error: 'Forbidden. Organizer access required.' });
  }
  next();
}

// Auth API
app.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (role !== 'student' && role !== 'organizer') {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const users = await readData('users.json');
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  const user = { id: crypto.randomUUID(), name, email, password, role };
  users.push(user);
  await writeData('users.json', users);

  res.status(201).json({ message: 'User registered successfully' });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const users = await readData('users.json');
  
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = crypto.randomBytes(16).toString('hex');
  activeSessions.set(token, { id: user.id, email: user.email, role: user.role, name: user.name });

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/logout', authenticate, (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  activeSessions.delete(token);
  res.json({ message: 'Logged out successfully' });
});

// GET user info
app.get('/api/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Event API
app.get('/api/events', async (req, res) => {
  const events = await readData('events.json');
  res.json(events); // Everyone can see events
});

app.post('/api/events', authenticate, requireOrganizer, async (req, res) => {
  const { title, date, time, venue, description } = req.body;
  if (!title || !date || !time || !venue || !description) {
    return res.status(400).json({ error: 'All event fields are required' });
  }
  
  const events = await readData('events.json');
  const newEvent = {
    id: crypto.randomUUID(),
    title, date, time, venue, description,
    organizerId: req.user.id
  };
  events.push(newEvent);
  await writeData('events.json', events);
  
  res.status(201).json(newEvent);
});

app.put('/api/events/:id', authenticate, requireOrganizer, async (req, res) => {
  const events = await readData('events.json');
  const index = events.findIndex(e => e.id === req.params.id && e.organizerId === req.user.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Event not found or unauthorized' });
  }
  
  events[index] = { ...events[index], ...req.body, id: req.params.id, organizerId: req.user.id };
  await writeData('events.json', events);
  
  res.json(events[index]);
});

app.delete('/api/events/:id', authenticate, requireOrganizer, async (req, res) => {
  const events = await readData('events.json');
  const newEvents = events.filter(e => !(e.id === req.params.id && e.organizerId === req.user.id));
  
  if (events.length === newEvents.length) {
    return res.status(404).json({ error: 'Event not found or unauthorized' });
  }
  
  await writeData('events.json', newEvents);
  res.json({ message: 'Event deleted' });
});

// Registration API
app.post('/api/events/:id/register', authenticate, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can register for events' });
  }
  
  const { phone, department } = req.body;
  if (!phone || !department) {
    return res.status(400).json({ error: 'Phone and department are required' });
  }
  
  const events = await readData('events.json');
  if (!events.find(e => e.id === req.params.id)) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const registrations = await readData('registrations.json');
  
  // Prevent duplicate registration
  if (registrations.find(r => r.eventId === req.params.id && r.studentId === req.user.id)) {
    return res.status(400).json({ error: 'You are already registered for this event' });
  }
  
  const newReg = {
    id: crypto.randomUUID(),
    eventId: req.params.id,
    studentId: req.user.id,
    studentName: req.user.name,
    studentEmail: req.user.email,
    phone,
    department,
    registeredAt: new Date().toISOString()
  };
  
  registrations.push(newReg);
  await writeData('registrations.json', registrations);
  
  res.status(201).json({ message: 'Registered successfully', registration: newReg });
});

app.get('/api/registrations', authenticate, requireOrganizer, async (req, res) => {
  const events = await readData('events.json');
  const myEvents = events.filter(e => e.organizerId === req.user.id).map(e => e.id);
  
  const registrations = await readData('registrations.json');
  const myRegistrations = registrations.filter(r => myEvents.includes(r.eventId));
  
  res.json(myRegistrations);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
