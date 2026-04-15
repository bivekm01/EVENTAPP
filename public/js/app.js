// API Helpers
const API_URL = '/api';

async function api(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
    };

    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
    }
    return data;
}

// Toast Notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${type === 'success' ? '✅' : '⚠️'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// DOM Elements
const views = {
    auth: document.getElementById('auth-view'),
    student: document.getElementById('student-view'),
    organizer: document.getElementById('organizer-view')
};
const navbar = document.getElementById('navbar');
const userGreeting = document.getElementById('user-greeting');

// State
let currentUser = null;

// Initialization
async function init() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const data = await api('/me');
            currentUser = data.user;
            showViewBasedOnRole();
        } catch (err) {
            localStorage.removeItem('token');
            switchView('auth');
        }
    } else {
        switchView('auth');
    }
    setupEventListeners();
}

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    
    if (viewName === 'auth') {
        navbar.classList.add('hidden');
    } else {
        navbar.classList.remove('hidden');
        userGreeting.textContent = `Hello, ${currentUser.name}`;
    }
}

function showViewBasedOnRole() {
    if (currentUser.role === 'student') {
        switchView('student');
        loadStudentEvents();
    } else {
        switchView('organizer');
        loadOrganizerEvents();
        loadRegistrations();
    }
}

// Auth Handlers
function setupEventListeners() {
    // Auth Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            
            e.target.classList.add('active');
            document.getElementById(`${e.target.dataset.tab}-form`).classList.add('active');
        });
    });

    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('/login', {
                method: 'POST',
                body: JSON.stringify({
                    email: document.getElementById('login-email').value,
                    password: document.getElementById('login-password').value
                })
            });
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            showToast('Logged in successfully!');
            showViewBasedOnRole();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Register Form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('/register', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('reg-name').value,
                    email: document.getElementById('reg-email').value,
                    password: document.getElementById('reg-password').value,
                    role: document.querySelector('input[name="role"]:checked').value
                })
            });
            showToast('Registration successful! Please login.');
            document.querySelector('.tab-btn[data-tab="login"]').click();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await api('/logout', { method: 'POST' });
        } catch(e) {} // ignore error if token invalid
        localStorage.removeItem('token');
        currentUser = null;
        switchView('auth');
    });

    // Modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    });

    // Create Event Button
    document.getElementById('open-create-modal')?.addEventListener('click', () => {
        document.getElementById('manage-event-form').reset();
        document.getElementById('manage-event-id').value = '';
        document.getElementById('manage-event-modal-title').textContent = 'Create New Event';
        document.getElementById('manage-event-modal').classList.add('active');
    });

    // Manage Event Form
    document.getElementById('manage-event-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('manage-event-id').value;
        const payload = {
            title: document.getElementById('event-title').value,
            date: document.getElementById('event-date').value,
            time: document.getElementById('event-time').value,
            venue: document.getElementById('event-venue').value,
            description: document.getElementById('event-desc').value
        };

        try {
            if (id) {
                await api(`/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
                showToast('Event updated successfully');
            } else {
                await api('/events', { method: 'POST', body: JSON.stringify(payload) });
                showToast('Event created successfully');
            }
            document.getElementById('manage-event-modal').classList.remove('active');
            loadOrganizerEvents();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Register Event Form
    document.getElementById('event-register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = document.getElementById('reg-event-id').value;
        try {
            await api(`/events/${eventId}/register`, {
                method: 'POST',
                body: JSON.stringify({
                    phone: document.getElementById('student-phone').value,
                    department: document.getElementById('student-dept').value
                })
            });
            showToast('Successfully registered for event!');
            document.getElementById('register-event-modal').classList.remove('active');
        } catch (err) {
            showToast(err.message, 'error');
            document.getElementById('register-event-modal').classList.remove('active');
        }
    });
}

// View Data Loaders
async function loadStudentEvents() {
    try {
        const events = await api('/events');
        const grid = document.getElementById('student-events-grid');
        grid.innerHTML = events.map(e => createEventCard(e, 'student')).join('');
    } catch (err) {
        showToast('Failed to load events', 'error');
    }
}

async function loadOrganizerEvents() {
    try {
        // Organizer views all their events
        const events = await api('/events');
        const myEvents = events.filter(e => e.organizerId === currentUser.id);
        const grid = document.getElementById('organizer-events-grid');
        grid.innerHTML = myEvents.map(e => createEventCard(e, 'organizer')).join('');
    } catch (err) {
        showToast('Failed to load events', 'error');
    }
}

async function loadRegistrations() {
    try {
        const regs = await api('/registrations');
        const tbody = document.getElementById('registrations-body');
        if (regs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary)">No registrations yet</td></tr>`;
            return;
        }
        tbody.innerHTML = regs.map(r => `
            <tr>
                <td>${r.studentName}</td>
                <td>${r.studentEmail}</td>
                <td>${r.department}</td>
                <td>${r.phone}</td>
            </tr>
        `).join('');
    } catch (err) {
        // Ignore error silently
    }
}

// UI Helpers
function createEventCard(event, role) {
    const formattedDate = new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    let actionHtml = '';
    if (role === 'student') {
        actionHtml = `<button class="btn btn-primary btn-block" onclick="openRegisterModal('${event.id}', '${event.title.replace(/'/g, "\\'")}')">Register Now</button>`;
    } else {
        actionHtml = `
            <button class="btn btn-primary" style="flex: 1" onclick="editEvent('${event.id}')">Edit</button>
            <button class="btn btn-danger" onclick="deleteEvent('${event.id}')">Delete</button>
        `;
    }

    return `
        <div class="glass-panel event-card">
            <div class="event-image-placeholder">
                <span class="event-date-badge">${formattedDate}</span>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
            <div class="event-details">
                <h3>${event.title}</h3>
                <div class="event-meta">
                    <span>📍 ${event.venue}</span>
                    <span>🕒 ${event.time}</span>
                </div>
                <p class="event-desc">${event.description}</p>
                <div class="event-actions">${actionHtml}</div>
            </div>
        </div>
    `;
}

// Global Actions attached to window for inline onclick attributes
window.openRegisterModal = (id, title) => {
    document.getElementById('reg-event-id').value = id;
    document.getElementById('modal-event-title').textContent = `Register: ${title}`;
    document.getElementById('event-register-form').reset();
    document.getElementById('register-event-modal').classList.add('active');
};

window.editEvent = async (id) => {
    try {
        const events = await api('/events');
        const event = events.find(e => e.id === id);
        if (event) {
            document.getElementById('manage-event-id').value = event.id;
            document.getElementById('event-title').value = event.title;
            document.getElementById('event-date').value = event.date;
            document.getElementById('event-time').value = event.time;
            document.getElementById('event-venue').value = event.venue;
            document.getElementById('event-desc').value = event.description;
            
            document.getElementById('manage-event-modal-title').textContent = 'Edit Event';
            document.getElementById('manage-event-modal').classList.add('active');
        }
    } catch(err) {
        showToast('Error editing event', 'error');
    }
};

window.deleteEvent = async (id) => {
    if(confirm('Are you sure you want to delete this event?')) {
        try {
            await api(`/events/${id}`, { method: 'DELETE' });
            showToast('Event deleted successfully');
            loadOrganizerEvents();
            loadRegistrations(); // refresh as event registrations might be gone
        } catch(err) {
            showToast(err.message, 'error');
        }
    }
};

// Start
init();
