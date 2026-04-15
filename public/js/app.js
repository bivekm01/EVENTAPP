import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot 
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';

// --- Toast Notifications ---
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

// --- DOM Elements ---
const views = {
    auth: document.getElementById('auth-view'),
    dashboard: document.getElementById('dashboard-view'),
    schedule: document.getElementById('schedule-view'),
    announcements: document.getElementById('announcements-view'),
    feedback: document.getElementById('feedback-view')
};
const navbar = document.getElementById('navbar');
const userGreeting = document.getElementById('user-greeting');
const userRoleBadge = document.getElementById('user-role-badge');
const logoutBtn = document.getElementById('logout-btn');

// --- Global State ---
let currentUser = null; // Contains auth + firestore user data (role, name)
let allEvents = [];
let allAnnouncements = [];
let unsubscribeEvents = null;
let unsubscribeAnnouncements = null;

// --- Initialize App ---
function initApp() {
    setupEventListeners();
    
    // Listen for auth state changes
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                // Fetch user role and name from Firestore
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    currentUser = { id: user.uid, email: user.email, ...userDoc.data() };
                } else {
                    console.warn("User role document not found. Defaulting to 'student'.");
                    // Fallback so navigation continues if the document is missing
                    currentUser = { id: user.uid, email: user.email, name: "User", role: 'student' };
                }
            } catch (err) {
                console.error("Database access denied for profile roles. Defaulting to 'student'.", err);
                showToast("Firebase Rules may block read - defaulting to student.", 'warning');
                currentUser = { id: user.uid, email: user.email, name: "User", role: 'student' };
            }

            // Always process to redirect post-login
            userGreeting.textContent = `Hello, ${currentUser.name.split(' ')[0]}`;
            userRoleBadge.textContent = currentUser.role;
            
            // Toggle UI based on role
            if (currentUser.role === 'organizer') {
                document.getElementById('open-create-modal')?.classList.remove('hidden');
                document.getElementById('open-announce-modal')?.classList.remove('hidden');
                document.getElementById('registrations-section')?.classList.remove('hidden');
            } else {
                document.getElementById('open-create-modal')?.classList.add('hidden');
                document.getElementById('open-announce-modal')?.classList.add('hidden');
                document.getElementById('registrations-section')?.classList.add('hidden');
            }
            
            // The crucial redirect to dashboard!
            switchView('dashboard');
            startRealtimeListeners();

        } else {
            currentUser = null;
            stopRealtimeListeners();
            switchView('auth');
        }
    });
}

// --- View Router ---
function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    
    // Highlight nav item
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.dataset.target === `${viewName}-view`) {
            nav.classList.add('active');
        }
    });
    
    if (viewName === 'auth') {
        navbar.classList.add('hidden');
    } else {
        navbar.classList.remove('hidden');
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Mobile Menu
    document.querySelector('.mobile-menu-btn').addEventListener('click', () => {
        document.querySelector('.nav-links').classList.toggle('show');
    });

    // Navigation Links
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.target.dataset.target.replace('-view', '');
            switchView(target);
            document.querySelector('.nav-links').classList.remove('show');
            if(target === 'dashboard' && currentUser?.role === 'organizer') {
                loadOrganizerRegistrations(); // refresh registrations
            }
        });
    });

    // Auth Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(`${e.target.dataset.tab}-form`).classList.add('active');
        });
    });

    // Firebase Auth: Register
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const name = document.getElementById('reg-name').value;
        const role = document.querySelector('input[name="role"]:checked').value;
        
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // Save additional user info in Firestore
            await setDoc(doc(db, 'users', userCredential.user.uid), {
                name: name,
                role: role,
                createdAt: new Date().toISOString()
            });
            showToast('Registration successful!');
            e.target.reset();
        } catch (error) {
            showToast(error.message.replace('Firebase:', ''), 'error');
        }
    });

    // Firebase Auth: Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showToast('Logged in successfully!');
            e.target.reset();
        } catch (error) {
            showToast(error.message.replace('Firebase:', ''), 'error');
        }
    });

    // Firebase Auth: Logout
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            showToast('Logged out');
            switchView('auth');
        } catch (error) {
            console.error(error);
        }
    });

    // Search Events
    document.getElementById('event-search')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allEvents.filter(ev => 
            ev.title.toLowerCase().includes(term) || 
            ev.venue.toLowerCase().includes(term)
        );
        renderEventsGrid(filtered);
    });

    // Modals Close Logic
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        });
    });

    // ============================================
    // ORGANIZER ACTIONS
    // ============================================

    // Open Create Event Modal
    document.getElementById('open-create-modal')?.addEventListener('click', () => {
        document.getElementById('manage-event-form').reset();
        document.getElementById('manage-event-id').value = '';
        document.getElementById('manage-event-modal-title').textContent = 'Create New Event';
        document.getElementById('manage-event-modal').classList.add('active');
    });

    // Create/Edit Event Form Submit
    document.getElementById('manage-event-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('manage-event-id').value;
        const payload = {
            title: document.getElementById('event-title').value,
            date: document.getElementById('event-date').value,
            venue: document.getElementById('event-venue').value,
            description: document.getElementById('event-desc').value,
            imageUrl: document.getElementById('event-image').value || '',
            organizerId: currentUser.id,
            organizerName: currentUser.name,
            updatedAt: new Date().toISOString()
        };

        try {
            if (id) {
                await updateDoc(doc(db, 'events', id), payload);
                showToast('Event updated successfully');
            } else {
                payload.createdAt = new Date().toISOString();
                await addDoc(collection(db, 'events'), payload);
                showToast('Event created successfully');
            }
            document.getElementById('manage-event-modal').classList.remove('active');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Open Announcement Modal
    document.getElementById('open-announce-modal')?.addEventListener('click', () => {
        document.getElementById('manage-announce-form').reset();
        document.getElementById('manage-announce-modal').classList.add('active');
    });

    // Create Announcement Submit
    document.getElementById('manage-announce-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            title: document.getElementById('announce-title').value,
            content: document.getElementById('announce-desc').value,
            urgent: document.getElementById('announce-urgent').checked,
            authorId: currentUser.id,
            authorName: currentUser.name,
            createdAt: new Date().toISOString()
        };
        try {
            await addDoc(collection(db, 'announcements'), payload);
            showToast('Announcement posted!');
            document.getElementById('manage-announce-modal').classList.remove('active');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // ============================================
    // STUDENT ACTIONS
    // ============================================

    // Register Event Submit
    document.getElementById('event-register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = document.getElementById('reg-event-id').value;
        const payload = {
            eventId: eventId,
            studentId: currentUser.id,
            studentName: currentUser.name,
            studentEmail: currentUser.email,
            phone: document.getElementById('student-phone').value,
            department: document.getElementById('student-dept').value,
            registeredAt: new Date().toISOString()
        };

        try {
            // Very simple duplicate check strategy: query where studentId == current and eventId == current
            const duplicateCheck = query(
                collection(db, 'registrations'), 
                where("studentId", "==", currentUser.id),
                where("eventId", "==", eventId)
            );
            
            // Note: Since this is an abstraction for testing without complex indices config, we will handle without getting too complex.
            // But we actually do a read first:
            await onSnapshot(duplicateCheck, async (snapshot) => {
                // only add if no dup exists
                if(snapshot.empty) {
                    await addDoc(collection(db, 'registrations'), payload);
                    showToast('Successfully registered for event!');
                    document.getElementById('register-event-modal').classList.remove('active');
                    // Stop this specific snapshot listener to avoid infinite loops
                    return; 
                } 
            });

        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // ============================================
    // GLOBAL ACTIONS
    // ============================================

    // Feedback Submit
    document.getElementById('feedback-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'feedback'), {
                topic: document.getElementById('feedback-type').value,
                message: document.getElementById('feedback-text').value,
                userId: currentUser.id,
                userName: currentUser.name,
                createdAt: new Date().toISOString()
            });
            showToast('Thank you for your feedback!');
            e.target.reset();
        } catch (error) {
            showToast('Error submitting feedback', 'error');
        }
    });
}

// --- Real-time Firestore Listeners ---
function startRealtimeListeners() {
    // 1. Listen for Events
    const qEvents = query(collection(db, 'events'), orderBy('date', 'asc'));
    unsubscribeEvents = onSnapshot(qEvents, (querySnapshot) => {
        allEvents = [];
        querySnapshot.forEach((doc) => {
            allEvents.push({ id: doc.id, ...doc.data() });
        });
        
        // Filter logic: if student, maybe show all. If organizer, maybe show all or just theirs? 
        // Requirements say "Event Dashboard: Display upcoming events". So let's show all events to everyone.
        renderEventsGrid(allEvents);
        renderSchedule(allEvents);
        
        if(currentUser.role === 'organizer') {
            loadOrganizerRegistrations();
        }
    }, (error) => {
        // If index is missing or permissions error, fallback might fail silently on frontend without warning if we don't catch:
        console.error("Fetch Events Error (Is DB configured correctly?):", error);
    });

    // 2. Listen for Announcements
    const qAnnouncements = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    unsubscribeAnnouncements = onSnapshot(qAnnouncements, (querySnapshot) => {
        allAnnouncements = [];
        querySnapshot.forEach((doc) => {
            allAnnouncements.push({ id: doc.id, ...doc.data() });
        });
        renderAnnouncementsFeed(allAnnouncements);
    }, (error) => {
        console.error("Fetch Announcements Error:", error);
    });
}

function stopRealtimeListeners() {
    if (unsubscribeEvents) unsubscribeEvents();
    if (unsubscribeAnnouncements) unsubscribeAnnouncements();
}

// --- Data Renderers ---

function renderEventsGrid(events) {
    const grid = document.getElementById('events-grid');
    if (events.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No events found.</p>';
        return;
    }
    grid.innerHTML = events.map(e => createEventCard(e)).join('');
}

function createEventCard(event) {
    const formattedDate = new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const bgStyle = event.imageUrl ? `background-image: url('${event.imageUrl}')` : '';

    let actionHtml = '';
    // Define Global Methods for Modals
    if (currentUser.role === 'student') {
        actionHtml = `<button class="btn btn-primary btn-block" onclick="window.openRegister('${event.id}', '${event.title.replace(/'/g, "\\'")}')">Register Now</button>`;
    } else if (currentUser.role === 'organizer' && currentUser.id === event.organizerId) {
        actionHtml = `
            <button class="btn btn-primary" style="flex: 1" onclick="window.editEvent('${event.id}')">Edit</button>
            <button class="btn btn-danger" onclick="window.deleteEvent('${event.id}')">Delete</button>
        `;
    } else {
        // Organizer but didn't create this event
        actionHtml = `<p style="text-align:center;font-size:0.8rem;color:var(--text-secondary);width:100%">Organized by ${event.organizerName}</p>`;
    }

    return `
        <div class="glass-panel event-card">
            <div class="event-image" style="${bgStyle}">
                <span class="event-date-badge">${formattedDate}</span>
            </div>
            <div class="event-details">
                <h3>${event.title}</h3>
                <div class="event-meta">
                    <span>📍 ${event.venue}</span>
                    <span>👤 ${event.organizerName || 'Unknown'}</span>
                </div>
                <p class="event-desc">${event.description}</p>
                <div class="event-actions">${actionHtml}</div>
            </div>
        </div>
    `;
}

function renderSchedule(events) {
    const container = document.getElementById('schedule-container');
    
    // Group events by date
    const grouped = events.reduce((acc, event) => {
        if (!acc[event.date]) acc[event.date] = [];
        acc[event.date].push(event);
        return acc;
    }, {});

    const sortedDates = Object.keys(grouped).sort();

    if (sortedDates.length === 0) {
        container.innerHTML = '<p class="text-center">No upcoming schedules.</p>';
        return;
    }

    container.innerHTML = sortedDates.map(date => {
        const niceDate = new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const dayEvents = grouped[date]
            .map(e => `
                <div class="schedule-item">
                    <div class="schedule-time">${e.title}</div>
                    <div class="schedule-info">
                        <h4>📍 ${e.venue}</h4>
                        <p>${e.description.substring(0, 60)}...</p>
                    </div>
                </div>
            `).join('');

        return `
            <div class="schedule-day">
                <h3 class="schedule-date-header">${niceDate}</h3>
                ${dayEvents}
            </div>
        `;
    }).join('');
}

function renderAnnouncementsFeed(announcements) {
    const feed = document.getElementById('announcements-feed');
    if (announcements.length === 0) {
        feed.innerHTML = '<p class="text-center">No announcements at this time.</p>';
        return;
    }

    feed.innerHTML = announcements.map(a => {
        const dateObj = new Date(a.createdAt);
        const niceTime = isNaN(dateObj) ? 'Recently' : dateObj.toLocaleString('en-US');
        
        return `
            <div class="announcement-card glass-panel ${a.urgent ? 'urgent' : ''}">
                <div class="announcement-meta">
                    <strong>${a.authorName}</strong> &bull; ${niceTime} ${a.urgent ? '🚨 URGENT' : ''}
                </div>
                <h3>${a.title}</h3>
                <p>${a.content}</p>
            </div>
        `;
    }).join('');
}

// Complex queries (registrations) without active real-time snap to save reads
async function loadOrganizerRegistrations() {
    try {
        const myEventIds = allEvents.filter(e => e.organizerId === currentUser.id).map(e => e.id);
        if (myEventIds.length === 0) return;

        // Note: Realistically Firestore limits `in` queries to 10 items.
        // For project scope, we will fetch all registrations and filter locally if too many, or just query.
        const qReg = collection(db, 'registrations');
        
        onSnapshot(qReg, (snapshot) => {
            const tbody = document.getElementById('registrations-body');
            const regs = [];
            snapshot.forEach(doc => regs.push(doc.data()));
            
            const myRegs = regs.filter(r => myEventIds.includes(r.eventId));
            
            if (myRegs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No registrations yet for your events</td></tr>`;
                return;
            }

            tbody.innerHTML = myRegs.map(r => {
                const eventName = allEvents.find(e => e.id === r.eventId)?.title || 'Unknown Event';
                return `
                <tr>
                    <td><strong>${eventName}</strong></td>
                    <td>${r.studentName}<br><small>${r.studentEmail}</small></td>
                    <td>${r.department}</td>
                    <td>${r.phone}</td>
                </tr>
            `}).join('');
        });

    } catch (error) {
        console.error("Error loading registrations", error);
    }
}

// --- Global Actions for Inline HTML OnClick ---
window.openRegister = (id, title) => {
    document.getElementById('reg-event-id').value = id;
    document.getElementById('modal-event-title').textContent = `Register: ${title}`;
    document.getElementById('event-register-form').reset();
    document.getElementById('register-event-modal').classList.add('active');
};

window.editEvent = (id) => {
    const event = allEvents.find(e => e.id === id);
    if (event) {
        document.getElementById('manage-event-id').value = event.id;
        document.getElementById('event-title').value = event.title;
        document.getElementById('event-date').value = event.date;
        document.getElementById('event-venue').value = event.venue;
        document.getElementById('event-image').value = event.imageUrl || '';
        document.getElementById('event-desc').value = event.description;
        
        document.getElementById('manage-event-modal-title').textContent = 'Edit Event';
        document.getElementById('manage-event-modal').classList.add('active');
    }
};

window.deleteEvent = async (id) => {
    if(confirm('Are you certain you want to delete this event? This action will not remove existing registrations.')) {
        try {
            await deleteDoc(doc(db, 'events', id));
            showToast('Event deleted successfully');
        } catch(error) {
            showToast(error.message, 'error');
        }
    }
};

initApp();
