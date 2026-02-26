import { EXERCISE_DATABASE } from './EXERCISE_DATABASE.js';
import { auth, db, storage } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {
    ref as storageRef,
    uploadBytes,
    getDownloadURL,
    deleteObject,
    listAll
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

// ═════════════════════════════════════════════
// STATE
// ═════════════════════════════════════════════
let workoutPlans = [];
let workoutHistory = [];
let currentWorkout = null;
let restInterval = null;
let elapsedInterval = null;
let selectedPlanId = null;
let currentRestSeconds = 0;

// Load all 203 exercises from database
let exerciseLibrary = EXERCISE_DATABASE.map(ex => ex.name);

// New features state
let bodyWeightEntries = [];
let bodyWeightGoal = null;
let restTimerSettings = {
    default: 120,
    exerciseOverrides: {}
};
let progressPhotos = [];
let profilePhotoURL = null;

// Library plans
let libraryPlans = [];
let currentPlanDetail = null;

let currentUser = null;
let unsubscribeSnapshot = null;

// Stopwatch state (AMRAP / EMOM)
let stopwatchSeconds = 0;
let stopwatchInterval = null;

// ═════════════════════════════════════════════
// THEME MANAGEMENT
// ═════════════════════════════════════════════
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggle(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggle(newTheme);
}

function updateThemeToggle(theme) {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    
    if (theme === 'dark') {
        toggle.classList.add('active');
        toggle.querySelector('span').textContent = 'DARK MODE';
    } else {
        toggle.classList.remove('active');
        toggle.querySelector('span').textContent = 'LIGHT MODE';
    }
}

// ═════════════════════════════════════════════
// AUTHENTICATION
// ═════════════════════════════════════════════
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadUserData();
        showMainApp();
    } else {
        currentUser = null;
        showAuthScreen();
    }
});

function showAuthScreen() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

function showMainApp() {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    updateProfileUI();
    updateWorkoutHero();
}

async function handleLogin(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('WELCOME BACK! 💪');
    } catch (error) {
        let message = 'LOGIN FAILED';
        if (error.code === 'auth/user-not-found') message = 'NO ACCOUNT FOUND';
        if (error.code === 'auth/wrong-password') message = 'INCORRECT PASSWORD';
        if (error.code === 'auth/invalid-email') message = 'INVALID EMAIL';
        alert(message);
    }
}

async function handleSignup(email, password, confirmPassword) {
    if (password !== confirmPassword) {
        alert('PASSWORDS DO NOT MATCH');
        return;
    }
    if (password.length < 6) {
        alert('PASSWORD MUST BE AT LEAST 6 CHARACTERS');
        return;
    }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await initializeUserData(userCredential.user.uid);
        showToast('ACCOUNT CREATED! 🎉');
    } catch (error) {
        let message = 'SIGNUP FAILED';
        if (error.code === 'auth/email-already-in-use') message = 'EMAIL ALREADY IN USE';
        if (error.code === 'auth/invalid-email') message = 'INVALID EMAIL';
        if (error.code === 'auth/weak-password') message = 'PASSWORD TOO WEAK';
        alert(message);
    }
}

async function handleGoogleAuth() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const userDoc = await getDoc(doc(db, 'users', result.user.uid, 'data', 'workout_data'));
        if (!userDoc.exists()) {
            await initializeUserData(result.user.uid);
        }
        showToast('WELCOME! 💪');
    } catch (error) {
        alert('GOOGLE SIGN-IN FAILED: ' + error.message);
    }
}

async function handleLogout() {
    if (!confirm('ARE YOU SURE YOU WANT TO LOGOUT?')) return;
    try {
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        await signOut(auth);
        workoutPlans = [];
        workoutHistory = [];
        selectedPlanId = null;
        bodyWeightEntries = [];
        progressPhotos = [];
        showToast('LOGGED OUT SUCCESSFULLY');
    } catch (error) {
        alert('LOGOUT FAILED: ' + error.message);
    }
}

async function updateProfileUI() {
    if (!currentUser) return;
    const email = currentUser.email;
    const initial = email.charAt(0).toUpperCase();
    const createdDate = new Date(parseInt(currentUser.metadata.createdAt));
    
    document.getElementById('user-email').textContent = email;
    document.getElementById('user-since').textContent = createdDate.toLocaleDateString('en-US', { 
        month: 'short', 
        year: 'numeric' 
    });
    
    // Load profile photo or show initial
    await loadProfilePhoto();
}

// ═════════════════════════════════════════════
// FIREBASE DATA
// ═════════════════════════════════════════════
async function initializeUserData(uid) {
    const defaultPlans = [
        {
            id: 1, name: 'PUSH/PULL/LEGS', description: '3-DAY SPLIT PROGRAM',
            days: [
                {
                    dayName: 'PUSH DAY',
                    exercises: [
                        { name: 'Barbell Bench Press', sets: 4, targetReps: 8 },
                        { name: 'Incline Dumbbell Press', sets: 3, targetReps: 10 },
                        { name: 'Military Press (AKA Overhead Press)', sets: 3, targetReps: 8 },
                        { name: 'Lateral Raise Machine', sets: 3, targetReps: 15 },
                        { name: 'Rope Tricep Extension', sets: 3, targetReps: 12 }
                    ]
                },
                {
                    dayName: 'PULL DAY',
                    exercises: [
                        { name: 'Pull Up', sets: 4, targetReps: 8 },
                        { name: 'Bent Over Row', sets: 4, targetReps: 8 },
                        { name: 'Lat Pull Down', sets: 3, targetReps: 10 },
                        { name: 'Cable Face Pull', sets: 3, targetReps: 15 },
                        { name: 'Standing Barbell Curl', sets: 3, targetReps: 10 }
                    ]
                },
                {
                    dayName: 'LEG DAY',
                    exercises: [
                        { name: 'Barbell Back Squat', sets: 4, targetReps: 8 },
                        { name: 'Romanian Deadlift (AKA RDL)', sets: 4, targetReps: 8 },
                        { name: 'Leg Press', sets: 3, targetReps: 12 },
                        { name: 'Leg Curl', sets: 3, targetReps: 12 },
                        { name: 'Barbell Hip Thrust', sets: 3, targetReps: 12 }
                    ]
                }
            ]
        }
    ];
    
    await setDoc(doc(db, 'users', uid, 'data', 'workout_data'), {
        workoutPlans: defaultPlans,
        workoutHistory: [],
        exerciseLibrary: exerciseLibrary,
        selectedPlanId: null,
        bodyWeightEntries: [],
        bodyWeightGoal: null,
        restTimerSettings: {
            default: 120,
            exerciseOverrides: {}
        },
        lastUpdated: new Date().toISOString()
    });
}

async function loadUserData() {
    if (!currentUser) return;
    
    const docRef = doc(db, 'users', currentUser.uid, 'data', 'workout_data');
    
    unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            workoutPlans = data.workoutPlans || [];
            workoutHistory = data.workoutHistory || [];
            selectedPlanId = data.selectedPlanId || null;
            bodyWeightEntries = data.bodyWeightEntries || [];
            bodyWeightGoal = data.bodyWeightGoal || null;
            restTimerSettings = data.restTimerSettings || { default: 120, exerciseOverrides: {} };
            
            updateLastSyncTime();
            renderPlans();
            updateWorkoutHero();
            renderProgress();
            renderBodyWeight();
            renderRestTimerSettings();
            loadProgressPhotos();
        } else {
            initializeUserData(currentUser.uid);
        }
    }, (error) => {
        console.error('Error loading data:', error);
        showToast('ERROR LOADING DATA');
    });
}

async function saveToFirebase() {
    if (!currentUser) return;
    
    try {
        await updateDoc(doc(db, 'users', currentUser.uid, 'data', 'workout_data'), {
            workoutPlans,
            workoutHistory,
            exerciseLibrary,
            selectedPlanId,
            bodyWeightEntries,
            bodyWeightGoal,
            restTimerSettings,
            lastUpdated: new Date().toISOString()
        });
        updateLastSyncTime();
    } catch (error) {
        console.error('Error saving:', error);
        showToast('ERROR SAVING DATA');
    }
}

function updateLastSyncTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    document.getElementById('last-sync').textContent = timeStr;
}

// ═════════════════════════════════════════════
// PLAN LIBRARY
// ═════════════════════════════════════════════
async function loadLibraryPlans() {
    if (!currentUser) return;
    
    try {
        const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
        const querySnapshot = await getDocs(collection(db, 'public_plans'));
        
        libraryPlans = [];
        querySnapshot.forEach((doc) => {
            libraryPlans.push({ ...doc.data(), firestoreId: doc.id });
        });
        
        renderLibraryPlans();
    } catch (error) {
        console.error('Error loading library plans:', error);
        document.getElementById('library-grid').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📚</div><p>NO PLANS AVAILABLE. UPLOAD PLANS TO FIREBASE FIRST.</p></div>';
    }
}

function renderLibraryPlans() {
    const grid = document.getElementById('library-grid');
    
    if (!libraryPlans || libraryPlans.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📚</div><p>NO PLANS AVAILABLE</p></div>';
        return;
    }
    
    // Get filter values
    const difficultyFilter = document.getElementById('library-difficulty-filter')?.value || '';
    const daysFilter = document.getElementById('library-days-filter')?.value || '';
    const searchTerm = document.getElementById('library-search')?.value.toLowerCase() || '';
    
    // Filter plans
    let filtered = libraryPlans.filter(plan => {
        const matchesDifficulty = !difficultyFilter || plan.difficulty === difficultyFilter;
        const matchesDays = !daysFilter || plan.daysPerWeek === parseInt(daysFilter);
        const matchesSearch = !searchTerm || 
            plan.name.toLowerCase().includes(searchTerm) ||
            plan.description.toLowerCase().includes(searchTerm) ||
            (plan.tags && plan.tags.some(tag => tag.toLowerCase().includes(searchTerm)));
        
        return matchesDifficulty && matchesDays && matchesSearch;
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><p>NO PLANS MATCH YOUR FILTERS</p></div>';
        return;
    }
    
    grid.innerHTML = filtered.map(plan => {
        const totalExercises = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);
        const totalSets = plan.days.reduce((sum, day) => 
            sum + day.exercises.reduce((s, e) => s + e.sets, 0), 0);
        
        // Check if user already has this plan
        const alreadyAdded = workoutPlans.some(p => p.libraryId === plan.id);
        
        // Get difficulty badge color
        let difficultyColor = 'var(--success)';
        if (plan.difficulty === 'intermediate') difficultyColor = 'var(--warning)';
        if (plan.difficulty === 'advanced') difficultyColor = 'var(--danger)';
        if (plan.difficulty === 'specialized') difficultyColor = 'var(--primary)';
        
        return `
        <div class="plan-card" style="border-left: 4px solid ${difficultyColor};">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <h3>${escapeHtml(plan.name)}</h3>
                <span style="background: ${difficultyColor}; color: white; padding: 4px 12px; font-size: 11px; font-weight: 700; font-family: 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(plan.difficulty)}</span>
            </div>
            <p style="color: var(--text-secondary); margin-bottom: 10px; font-size: 14px;">${escapeHtml(plan.description)}</p>
            
            ${plan.tags && plan.tags.length > 0 ? `
                <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;">
                    ${plan.tags.slice(0, 3).map(tag => `
                        <span style="background: var(--bg-hover); color: var(--text-secondary); padding: 3px 10px; font-size: 11px; font-family: 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: 1px;">
                            🏷️ ${escapeHtml(tag)}
                        </span>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="plan-meta">
                <span>📅 ${plan.days.length} DAY${plan.days.length > 1 ? 'S' : ''}</span>
                <span>📋 ${totalExercises} EXERCISES</span>
                <span>💪 ${totalSets} SETS</span>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;">
                <button class="btn btn-small view-plan-btn" data-plan-id="${escapeHtml(plan.id)}">👁️ VIEW DETAILS</button>
                ${alreadyAdded ? 
                    `<button class="btn btn-small" disabled style="opacity: 0.6;">✓ ADDED</button>` :
                    `<button class="btn btn-secondary btn-small add-library-plan-btn" data-plan-id="${escapeHtml(plan.id)}">➕ ADD TO MY PLANS</button>`
                }
            </div>
        </div>
    `;
    }).join('');
    
    // Add event listeners
    document.querySelectorAll('.view-plan-btn').forEach(btn => {
        btn.addEventListener('click', () => showPlanDetail(btn.dataset.planId));
    });
    document.querySelectorAll('.add-library-plan-btn').forEach(btn => {
        btn.addEventListener('click', () => addLibraryPlanToAccount(btn.dataset.planId));
    });
}

function showPlanDetail(planId) {
    const plan = libraryPlans.find(p => p.id === planId);
    if (!plan) return;
    
    currentPlanDetail = plan;
    
    // Populate modal
    document.getElementById('plan-detail-name').textContent = plan.name;
    document.getElementById('plan-detail-difficulty').textContent = plan.difficulty.toUpperCase();
    document.getElementById('plan-detail-schedule').textContent = `${plan.daysPerWeek} DAYS/WEEK`;
    
    const totalExercises = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);
    const totalSets = plan.days.reduce((sum, day) => 
        sum + day.exercises.reduce((s, e) => s + e.sets, 0), 0);
    document.getElementById('plan-detail-total').textContent = `${totalExercises} EXERCISES · ${totalSets} SETS`;
    document.getElementById('plan-detail-description').textContent = plan.description;
    
    // Tags
    const tagsEl = document.getElementById('plan-detail-tags');
    if (plan.tags && plan.tags.length > 0) {
        tagsEl.innerHTML = plan.tags.map(tag => `
            <span style="background: var(--bg-hover); color: var(--text-secondary); padding: 6px 14px; font-size: 12px; font-family: 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: 1px; border-left: 3px solid var(--accent);">
                🏷️ ${escapeHtml(tag)}
            </span>
        `).join('');
    } else {
        tagsEl.innerHTML = '';
    }
    
    // Days and exercises
    const daysEl = document.getElementById('plan-detail-days');
    daysEl.innerHTML = plan.days.map((day, index) => `
        <div style="background: var(--bg-card); border: 2px solid var(--border); padding: 20px; margin-bottom: 16px; border-left: 4px solid var(--primary);">
            <h4 style="font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 800; text-transform: uppercase; margin-bottom: 16px; letter-spacing: 1px;">
                DAY ${index + 1}: ${escapeHtml(day.dayName)}
            </h4>
            <div style="display: grid; gap: 8px;">
                ${day.exercises.map((ex, exIdx) => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-hover); border-left: 3px solid var(--accent);">
                        <span style="font-weight: 600; font-size: 14px;">${exIdx + 1}. ${escapeHtml(ex.name)}</span>
                        <span style="color: var(--text-secondary); font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 700;">
                            ${ex.sets} × ${ex.targetReps}
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
    
    // Show modal
    document.getElementById('plan-detail-modal').classList.add('active');
}

function addLibraryPlanToAccount(planId) {
    const plan = libraryPlans.find(p => p.id === planId);
    if (!plan) return;
    
    // Check if already added
    if (workoutPlans.some(p => p.libraryId === planId)) {
        showToast('PLAN ALREADY IN YOUR ACCOUNT');
        return;
    }
    
    // Add to user's plans
    const newPlan = {
        id: Date.now(),
        libraryId: planId, // Track which library plan this came from
        name: plan.name,
        description: plan.description,
        days: plan.days
    };
    
    workoutPlans.push(newPlan);
    saveToFirebase();
    renderLibraryPlans();
    
    showToast(`✓ ${plan.name.toUpperCase()} ADDED!`);
    
    // Close detail modal if open
    closeModal();
}

// ═════════════════════════════════════════════
// PWA
// ═════════════════════════════════════════════
let deferredPrompt;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('✅ Service Worker registered'))
            .catch(err => console.log('❌ SW registration failed:', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!localStorage.getItem('pwa-installed')) {
        setTimeout(() => {
            document.getElementById('install-banner').classList.add('show');
        }, 3000);
    }
});

window.addEventListener('appinstalled', () => {
    localStorage.setItem('pwa-installed', 'true');
    document.getElementById('install-banner').classList.remove('show');
});

// ═════════════════════════════════════════════
// BODY WEIGHT TRACKING
// ═════════════════════════════════════════════
function renderBodyWeight() {
    const currentWeightEl = document.getElementById('current-weight');
    const startingWeightEl = document.getElementById('starting-weight');
    const weightChangeEl = document.getElementById('weight-change');
    const goalWeightEl = document.getElementById('goal-weight');
    
    if (bodyWeightEntries.length === 0) {
        currentWeightEl.textContent = '--';
        startingWeightEl.textContent = '--';
        weightChangeEl.textContent = '--';
        goalWeightEl.textContent = bodyWeightGoal ? `${bodyWeightGoal} LBS` : '--';
        renderWeightChart();
        renderWeightEntries();
        return;
    }
    
    const sorted = [...bodyWeightEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
    const current = sorted[0].weight;
    const starting = sorted[sorted.length - 1].weight;
    const change = current - starting;
    
    currentWeightEl.textContent = `${current} LBS`;
    startingWeightEl.textContent = `${starting} LBS`;
    weightChangeEl.textContent = `${change > 0 ? '+' : ''}${change.toFixed(1)} LBS`;
    weightChangeEl.style.color = change < 0 ? 'var(--success)' : change > 0 ? 'var(--danger)' : 'var(--text-primary)';
    goalWeightEl.textContent = bodyWeightGoal ? `${bodyWeightGoal} LBS` : '--';
    
    renderWeightChart();
    renderWeightEntries();
}

function renderWeightChart() {
    const canvas = document.getElementById('weight-chart');
    const ctx = canvas.getContext('2d');
    const data = [...bodyWeightEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = 200;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (data.length === 0) {
        ctx.fillStyle = 'var(--text-secondary)';
        ctx.font = '14px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillText('LOG WEIGHT TO SEE TREND', canvas.width / 2, 100);
        return;
    }
    
    const weights = data.map(e => e.weight);
    const maxWeight = Math.max(...weights, bodyWeightGoal || 0);
    const minWeight = Math.min(...weights, bodyWeightGoal || 999);
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    const stepX = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;
    
    // Draw goal line if set
    if (bodyWeightGoal) {
        const goalY = padding.top + chartHeight - ((bodyWeightGoal - minWeight) / (maxWeight - minWeight)) * chartHeight;
        ctx.strokeStyle = 'var(--warning)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding.left, goalY);
        ctx.lineTo(padding.left + chartWidth, goalY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'var(--warning)';
        ctx.font = '11px Barlow Condensed';
        ctx.textAlign = 'right';
        ctx.fillText(`GOAL: ${bodyWeightGoal}`, padding.left - 6, goalY + 4);
    }
    
    // Draw grid
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border');
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
        
        ctx.fillStyle = 'var(--text-secondary)';
        ctx.font = '11px Work Sans';
        ctx.textAlign = 'right';
        const val = (maxWeight - (maxWeight - minWeight) / 4 * i).toFixed(1);
        ctx.fillText(val, padding.left - 6, y + 4);
    }
    
    // Draw line and points
    ctx.beginPath();
    ctx.strokeStyle = 'var(--primary)';
    ctx.lineWidth = 3;
    weights.forEach((w, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartHeight - ((w - minWeight) / (maxWeight - minWeight)) * chartHeight;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Draw points
    weights.forEach((w, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartHeight - ((w - minWeight) / (maxWeight - minWeight)) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'var(--primary)';
        ctx.fill();
        ctx.strokeStyle = 'var(--bg-primary)';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
    
    // Draw dates
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.font = '11px Work Sans';
    ctx.textAlign = 'center';
    data.forEach((entry, i) => {
        const x = padding.left + i * stepX;
        const date = new Date(entry.date);
        ctx.fillText(`${date.getMonth() + 1}/${date.getDate()}`, x, canvas.height - 8);
    });
}

function renderWeightEntries() {
    const listEl = document.getElementById('weight-entries-list');
    if (bodyWeightEntries.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚖️</div><p>NO WEIGHT ENTRIES YET</p></div>';
        return;
    }
    
    const sorted = [...bodyWeightEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
    listEl.innerHTML = sorted.slice(0, 10).map(entry => {
        const date = new Date(entry.date);
        return `
            <div class="history-row">
                <div class="history-date">${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div class="history-name">${entry.weight} LBS</div>
            </div>
        `;
    }).join('');
}

function showAddWeightModal() {
    document.getElementById('weight-input').value = '';
    document.getElementById('weight-date-input').value = new Date().toISOString().split('T')[0];
    document.getElementById('add-weight-modal').classList.add('active');
}

function saveWeight() {
    const weight = parseFloat(document.getElementById('weight-input').value);
    const date = document.getElementById('weight-date-input').value;
    
    if (!weight || !date) {
        alert('PLEASE ENTER WEIGHT AND DATE');
        return;
    }
    
    // Remove existing entry for same date
    bodyWeightEntries = bodyWeightEntries.filter(e => e.date !== date);
    bodyWeightEntries.push({ date, weight });
    
    saveToFirebase();
    document.getElementById('add-weight-modal').classList.remove('active');
    showToast('WEIGHT SAVED! ⚖️');
}

function saveWeightGoal() {
    const goal = parseFloat(document.getElementById('weight-goal-input').value);
    if (!goal) {
        bodyWeightGoal = null;
    } else {
        bodyWeightGoal = goal;
    }
    saveToFirebase();
    showToast('GOAL SAVED! 🎯');
}

// ═════════════════════════════════════════════
// CSV EXPORT
// ═════════════════════════════════════════════
function exportWorkoutDataToCSV() {
    if (workoutHistory.length === 0) {
        alert('NO WORKOUT DATA TO EXPORT');
        return;
    }
    
    const csvRows = ['Date,Plan,Day,Exercise,Set,Weight,Reps,Volume'];
    
    workoutHistory.forEach(workout => {
        const date = new Date(workout.date).toLocaleDateString('en-US');
        const planName = workout.planName || 'UNKNOWN';
        const dayName = workout.dayName || 'UNKNOWN';
        
        workout.exercises.forEach(exercise => {
            exercise.sets.forEach((set, index) => {
                if (set.completed) {
                    const weight = set.weight || 0;
                    const reps = set.reps || 0;
                    const volume = weight * reps;
                    csvRows.push(`${date},${planName},${dayName},${exercise.name},${index + 1},${weight},${reps},${volume}`);
                }
            });
        });
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iron-track-workouts-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('WORKOUT DATA EXPORTED! 📥');
}

// ═════════════════════════════════════════════
// REST TIMER SETTINGS
// ═════════════════════════════════════════════
function renderRestTimerSettings() {
    const defaultSelect = document.getElementById('default-rest-time');
    if (defaultSelect) {
        defaultSelect.value = restTimerSettings.default;
    }
    
    const overridesEl = document.getElementById('exercise-timer-overrides');
    if (!overridesEl) return;
    
    const overrides = Object.entries(restTimerSettings.exerciseOverrides || {});
    if (overrides.length === 0) {
        overridesEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 14px; margin-top: 12px;">NO EXERCISE-SPECIFIC TIMERS</p>';
        return;
    }
    
    overridesEl.innerHTML = overrides.map(([exercise, seconds]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-hover); margin-top: 8px; border-left: 3px solid var(--accent);">
            <div>
                <div style="font-weight: 600; font-family: 'Barlow Condensed', sans-serif; text-transform: uppercase;">${escapeHtml(exercise)}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${seconds} SECONDS</div>
            </div>
            <button class="btn-remove btn-small" onclick="removeExerciseTimer('${escapeHtml(exercise)}')">DELETE</button>
        </div>
    `).join('');
}

function showAddExerciseTimerModal() {
    document.getElementById('timer-exercise-input').value = '';
    document.getElementById('timer-duration-input').value = '120';
    
    // Populate datalist with all exercises
    const datalist = document.getElementById('timer-exercise-list');
    datalist.innerHTML = exerciseLibrary.map(ex => `<option value="${escapeHtml(ex)}">`).join('');
    
    document.getElementById('add-timer-modal').classList.add('active');
}

function saveExerciseTimer() {
    const exercise = document.getElementById('timer-exercise-input').value.trim();
    const duration = parseInt(document.getElementById('timer-duration-input').value);
    
    if (!exercise) {
        alert('PLEASE ENTER EXERCISE NAME');
        return;
    }
    
    restTimerSettings.exerciseOverrides[exercise] = duration;
    saveToFirebase();
    document.getElementById('add-timer-modal').classList.remove('active');
    showToast('TIMER SAVED! ⏱️');
}

function removeExerciseTimer(exercise) {
    if (!confirm(`REMOVE TIMER FOR ${exercise.toUpperCase()}?`)) return;
    delete restTimerSettings.exerciseOverrides[exercise];
    saveToFirebase();
}

function getRestTimeForExercise(exerciseName) {
    return restTimerSettings.exerciseOverrides[exerciseName] || restTimerSettings.default;
}

// ═════════════════════════════════════════════
// PROGRESS PHOTOS
// ═════════════════════════════════════════════
async function loadProgressPhotos() {
    if (!currentUser) return;
    
    try {
        const photosRef = storageRef(storage, `users/${currentUser.uid}/photos/progress`);
        const result = await listAll(photosRef);
        
        progressPhotos = await Promise.all(
            result.items.map(async (itemRef) => {
                const url = await getDownloadURL(itemRef);
                const fileName = itemRef.name;
                const date = fileName.replace('.jpg', '').replace('.jpeg', '').replace('.png', '');
                return { url, date, ref: itemRef };
            })
        );
        
        progressPhotos.sort((a, b) => new Date(b.date) - new Date(a.date));
        renderProgressPhotos();
    } catch (error) {
        console.error('Error loading photos:', error);
        progressPhotos = [];
        renderProgressPhotos();
    }
}

function renderProgressPhotos() {
    const gridEl = document.getElementById('progress-photos-grid');
    
    if (progressPhotos.length === 0) {
        gridEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📸</div><p>NO PHOTOS YET</p></div>';
        return;
    }
    
    gridEl.innerHTML = progressPhotos.map(photo => {
        const date = new Date(photo.date);
        return `
            <div class="photo-item">
                <img src="${photo.url}" alt="Progress photo">
                <div class="photo-date">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                <button class="photo-delete" onclick="deleteProgressPhoto('${photo.date}')">✕</button>
            </div>
        `;
    }).join('');
}

async function uploadProgressPhoto(file) {
    if (!currentUser) return;
    
    const date = new Date().toISOString().split('T')[0];
    const photoRef = storageRef(storage, `users/${currentUser.uid}/photos/progress/${date}.jpg`);
    
    try {
        await uploadBytes(photoRef, file);
        showToast('PHOTO UPLOADED! 📸');
        await loadProgressPhotos();
    } catch (error) {
        console.error('Error uploading photo:', error);
        alert('PHOTO UPLOAD FAILED');
    }
}

async function deleteProgressPhoto(date) {
    if (!confirm('DELETE THIS PHOTO?')) return;
    
    const photo = progressPhotos.find(p => p.date === date);
    if (!photo) return;
    
    try {
        await deleteObject(photo.ref);
        showToast('PHOTO DELETED');
        await loadProgressPhotos();
    } catch (error) {
        console.error('Error deleting photo:', error);
        alert('DELETE FAILED');
    }
}

// ═════════════════════════════════════════════
// PROFILE PHOTO
// ═════════════════════════════════════════════
async function loadProfilePhoto() {
    if (!currentUser) return;
    
    try {
        const photoRef = storageRef(storage, `users/${currentUser.uid}/photos/profile.jpg`);
        const url = await getDownloadURL(photoRef);
        profilePhotoURL = url;
        
        const avatarContainer = document.getElementById('user-avatar-container');
        if (avatarContainer) {
            avatarContainer.innerHTML = `<img src="${url}" class="profile-photo" alt="Profile" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 4px solid var(--primary); box-shadow: 0 8px 24px rgba(196, 30, 58, 0.4);">`;
        }
    } catch (error) {
        // No profile photo exists, show initial
        const email = currentUser.email;
        const initial = email.charAt(0).toUpperCase();
        const avatarEl = document.getElementById('user-avatar');
        if (avatarEl) {
            avatarEl.textContent = initial;
        }
        profilePhotoURL = null;
    }
}

async function uploadProfilePhoto(file) {
    if (!currentUser) return;
    
    if (!file.type.startsWith('image/')) {
        alert('PLEASE SELECT AN IMAGE FILE');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        alert('IMAGE TOO LARGE (MAX 5MB)');
        return;
    }
    
    const photoRef = storageRef(storage, `users/${currentUser.uid}/photos/profile.jpg`);
    
    try {
        showToast('UPLOADING PHOTO...');
        await uploadBytes(photoRef, file);
        showToast('PROFILE PHOTO UPDATED! 📷');
        await loadProfilePhoto();
    } catch (error) {
        console.error('Error uploading profile photo:', error);
        alert('PHOTO UPLOAD FAILED: ' + error.message);
    }
}

// ═════════════════════════════════════════════
// WORKOUT LOGIC
// ═════════════════════════════════════════════
function getNextWorkoutDay(planId) {
    const plan = workoutPlans.find(p => p.id === planId);
    if (!plan) return null;
    
    const planWorkouts = workoutHistory.filter(w => w.planId === planId);
    if (planWorkouts.length === 0) return { day: plan.days[0], dayIndex: 0 };
    
    const lastWorkout = planWorkouts[0];
    const lastDayIndex = lastWorkout.dayIndex !== undefined ? lastWorkout.dayIndex : 0;
    const nextDayIndex = (lastDayIndex + 1) % plan.days.length;
    
    return { day: plan.days[nextDayIndex], dayIndex: nextDayIndex };
}

function getLastCompletedWorkout() {
    if (workoutHistory.length === 0) return null;
    return workoutHistory[0];
}

function updateInactiveClock() {
    const clockEl = document.getElementById('inactive-clock');
    const timeEl = document.getElementById('inactive-clock-time');
    if (!clockEl || !timeEl) return;

    if (!workoutHistory.length) {
        clockEl.style.display = 'none';
        return;
    }

    const last = workoutHistory[0];
    const diffMs = Date.now() - new Date(last.date).getTime();
    const totalHours = Math.floor(diffMs / 3600000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    let urgency = 'green';
    if (totalHours >= 72) urgency = 'red';
    else if (totalHours >= 48) urgency = 'yellow';

    timeEl.textContent = days > 0 ? `${days}D ${hours}H` : `${hours}H`;
    clockEl.dataset.urgency = urgency;
    clockEl.style.display = 'block';
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) targetView.classList.add('active');
    const targetTab = document.querySelector(`[data-view="${viewName}"]`);
    if (targetTab) targetTab.classList.add('active');
    if (viewName === 'plans') renderPlans();
    if (viewName === 'library') {
        if (libraryPlans.length === 0) loadLibraryPlans();
        else renderLibraryPlans();
    }
    if (viewName === 'progress') renderProgress();
    if (viewName === 'workout') updateWorkoutHero();
}

function updateWorkoutHero() {
    const titleEl = document.getElementById('today-workout-title');
    const descEl = document.getElementById('today-workout-desc');
    const chooseBtnEl = document.getElementById('choose-plan-btn');
    const lastWorkoutEl = document.getElementById('last-workout-info');
    
    if (!selectedPlanId) {
        titleEl.textContent = 'NO PLAN SELECTED';
        descEl.textContent = 'CHOOSE A WORKOUT PLAN TO GET STARTED';
        chooseBtnEl.style.display = 'inline-block';
        if (lastWorkoutEl) lastWorkoutEl.style.display = 'none';
        return;
    }
    
    const plan = workoutPlans.find(p => p.id === selectedPlanId);
    if (!plan) {
        selectedPlanId = null;
        saveToFirebase();
        updateWorkoutHero();
        return;
    }
    
    chooseBtnEl.style.display = 'none';
    
    const nextWorkout = getNextWorkoutDay(selectedPlanId);
    if (nextWorkout) {
        titleEl.textContent = `${plan.name} - ${nextWorkout.day.dayName}`;
        descEl.textContent = `${nextWorkout.day.exercises.length} EXERCISES · ${nextWorkout.day.exercises.reduce((s, e) => s + e.sets, 0)} SETS`;
    }
    
    const lastWorkout = getLastCompletedWorkout();
    if (lastWorkout && lastWorkoutEl) {
        lastWorkoutEl.style.display = 'block';
        const date = new Date(lastWorkout.date);
        const daysAgo = Math.floor((Date.now() - date.getTime()) / 86400000);
        const timeStr = daysAgo === 0 ? 'TODAY' : daysAgo === 1 ? 'YESTERDAY' : `${daysAgo} DAYS AGO`;
        lastWorkoutEl.innerHTML = `
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 10px; font-family: 'Barlow Condensed', sans-serif; text-transform: uppercase;">
                <strong>LAST WORKOUT:</strong> ${escapeHtml(lastWorkout.planName)} - ${escapeHtml(lastWorkout.dayName)} · ${timeStr}
            </div>
        `;
    } else if (lastWorkoutEl) {
        lastWorkoutEl.style.display = 'none';
    }

    updateInactiveClock();
}

function renderPlans() {
    const grid = document.getElementById('plans-grid');
    if (workoutPlans.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>NO PLANS YET. CREATE YOUR FIRST!</p></div>';
        return;
    }
    grid.innerHTML = workoutPlans.map((plan, index) => {
        const totalExercises = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);
        const totalSets = plan.days.reduce((sum, day) => 
            sum + day.exercises.reduce((s, e) => s + e.sets, 0), 0);
        const isSelected = plan.id === selectedPlanId;
        
        return `
        <div class="plan-card ${isSelected ? 'selected-plan' : ''}">
            <h3>${escapeHtml(plan.name)}</h3>
            <p style="color: var(--text-secondary); margin-bottom: 10px; font-size: 14px;">${escapeHtml(plan.description)}</p>
            <div class="plan-meta">
                <span>📅 ${plan.days.length} DAY${plan.days.length > 1 ? 'S' : ''}</span>
                <span>📋 ${totalExercises} EXERCISES</span>
                <span>💪 ${totalSets} SETS</span>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;">
                ${!isSelected ? `<button class="btn btn-small select-plan-btn" data-id="${plan.id}">SELECT</button>` : 
                  `<button class="btn btn-small" disabled style="opacity: 0.6;">✓ SELECTED</button>`}
                <button class="btn btn-secondary btn-small edit-plan-btn" data-index="${index}">EDIT</button>
                <button class="btn-remove btn-small delete-plan-btn" data-index="${index}" style="margin-left: auto;">DELETE</button>
            </div>
        </div>
    `;
    }).join('');
    
    document.querySelectorAll('.select-plan-btn').forEach(btn => {
        btn.addEventListener('click', () => selectPlan(parseInt(btn.dataset.id)));
    });
    document.querySelectorAll('.edit-plan-btn').forEach(btn => {
        btn.addEventListener('click', () => editPlan(parseInt(btn.dataset.index)));
    });
    document.querySelectorAll('.delete-plan-btn').forEach(btn => {
        btn.addEventListener('click', () => deletePlan(parseInt(btn.dataset.index)));
    });
}

function selectPlan(planId) {
    selectedPlanId = planId;
    saveToFirebase();
    updateWorkoutHero();
    switchView('workout');
}

function deletePlan(index) {
    if (!confirm(`DELETE "${workoutPlans[index].name}"?`)) return;
    const planId = workoutPlans[index].id;
    if (selectedPlanId === planId) {
        selectedPlanId = null;
    }
    workoutPlans.splice(index, 1);
    saveToFirebase();
}

function startWorkout() {
    if (!selectedPlanId) {
        alert('PLEASE SELECT A WORKOUT PLAN FIRST.');
        switchView('plans');
        return;
    }
    
    const plan = workoutPlans.find(p => p.id === selectedPlanId);
    if (!plan) {
        alert('SELECTED PLAN NOT FOUND.');
        return;
    }
    
    const nextWorkout = getNextWorkoutDay(selectedPlanId);
    if (!nextWorkout) {
        alert('NO WORKOUT DAY FOUND IN PLAN.');
        return;
    }
    
    currentWorkout = {
        planId: plan.id,
        planName: plan.name,
        dayName: nextWorkout.day.dayName,
        dayIndex: nextWorkout.dayIndex,
        startTime: new Date(),
        date: new Date().toISOString(),
        exercises: nextWorkout.day.exercises.map(ex => ({
            name: ex.name,
            targetReps: ex.targetReps,
            sets: Array.from({ length: ex.sets }, (_, i) => {
                const lastSets = getLastRawSets(ex.name);
                const prev = lastSets?.[i];
                return { weight: prev?.weight || '', reps: prev?.reps || '', completed: false };
            })
        }))
    };
    
    document.getElementById('workout-hero').style.display = 'none';
    document.getElementById('active-workout').style.display = 'block';
    document.getElementById('active-workout-name').textContent = `${plan.name} - ${nextWorkout.day.dayName}`;
    
    startElapsedTimer();
    renderActiveWorkout();
}

function startElapsedTimer() {
    clearInterval(elapsedInterval);
    elapsedInterval = setInterval(() => {
        if (!currentWorkout) return;
        const elapsed = Math.floor((Date.now() - new Date(currentWorkout.startTime)) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        document.getElementById('workout-elapsed').textContent = `⏱ ${mins}:${secs.toString().padStart(2, '0')} ELAPSED`;
    }, 1000);
}

function renderActiveWorkout() {
    const container = document.getElementById('exercise-container');
    container.innerHTML = currentWorkout.exercises.map((ex, exIndex) => {
        const lastPerf = getLastPerformance(ex.name);
        return `
            <div class="exercise-item">
                <div class="exercise-header">
                    <div class="exercise-name">${escapeHtml(ex.name)}</div>
                    ${lastPerf ? `<div class="last-performance">LAST: ${escapeHtml(lastPerf)}</div>` : '<div class="last-performance">FIRST TIME!</div>'}
                </div>
                <div class="sets-grid">
                    ${ex.sets.map((set, setIndex) => `
                        <div class="set-box ${set.completed ? 'completed' : ''}">
                            <div class="set-number">SET ${setIndex + 1}</div>
                            <div class="set-input-group">
                                <input type="number" inputmode="decimal" class="set-input" placeholder="LBS"
                                    value="${set.weight}" data-ex="${exIndex}" data-set="${setIndex}" data-field="weight"
                                    ${set.completed ? 'disabled' : ''}>
                                <input type="number" inputmode="numeric" class="set-input" placeholder="REPS"
                                    value="${set.reps}" data-ex="${exIndex}" data-set="${setIndex}" data-field="reps"
                                    ${set.completed ? 'disabled' : ''}>
                            </div>
                            ${set.completed ?
                                `<div style="color: var(--success); margin-top: 8px; font-weight: 600; font-size: 13px; font-family: 'Barlow Condensed', sans-serif;">✓ DONE - ${set.weight}×${set.reps}</div>` :
                                `<button class="complete-set-btn" data-ex="${exIndex}" data-set="${setIndex}">✓ COMPLETE</button>`
                            }
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
    container.querySelectorAll('.set-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const ex = parseInt(e.target.dataset.ex);
            const set = parseInt(e.target.dataset.set);
            const field = e.target.dataset.field;
            currentWorkout.exercises[ex].sets[set][field] = e.target.value;
        });
    });
    container.querySelectorAll('.complete-set-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ex = parseInt(btn.dataset.ex);
            const set = parseInt(btn.dataset.set);
            completeSet(ex, set);
        });
    });
}

function completeSet(exIndex, setIndex) {
    const set = currentWorkout.exercises[exIndex].sets[setIndex];
    const exerciseName = currentWorkout.exercises[exIndex].name;
    
    if (!set.weight || !set.reps) {
        const lastSets = getLastRawSets(exerciseName);
        if (lastSets && lastSets[setIndex]) {
            if (!set.weight) set.weight = lastSets[setIndex].weight;
            if (!set.reps) set.reps = lastSets[setIndex].reps;
        }
    }
    if (!set.weight || !set.reps) {
        alert('PLEASE ENTER WEIGHT AND REPS FIRST.');
        return;
    }
    set.completed = true;
    renderActiveWorkout();
    
    const restTime = getRestTimeForExercise(exerciseName);
    startRestTimer(restTime);
}

function finishWorkout() {
    const completedSets = currentWorkout.exercises.flatMap(e => e.sets.filter(s => s.completed));
    if (completedSets.length === 0) {
        if (!confirm('NO SETS COMPLETED. FINISH ANYWAY?')) return;
    } else {
        if (!confirm('FINISH WORKOUT?')) return;
    }
    clearInterval(restInterval);
    clearInterval(elapsedInterval);
    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
    stopwatchSeconds = 0;
    currentWorkout.endTime = new Date().toISOString();
    workoutHistory.unshift(currentWorkout);
    saveToFirebase();
    currentWorkout = null;
    document.getElementById('workout-hero').style.display = 'block';
    document.getElementById('active-workout').style.display = 'none';
    document.getElementById('rest-timer').classList.remove('active');
    updateWorkoutHero();
    showToast('WORKOUT SAVED! 💪');
}

function getLastPerformance(exerciseName) {
    const sets = getLastRawSets(exerciseName);
    if (!sets) return null;
    return sets.filter(s => s.completed).map(s => `${s.weight}×${s.reps}`).join(', ');
}

function getLastRawSets(exerciseName) {
    for (const workout of workoutHistory) {
        const ex = workout.exercises.find(e => e.name === exerciseName);
        if (ex) return ex.sets;
    }
    return null;
}

function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) { /* AudioContext not available */ }
}

function startRestTimer(seconds) {
    clearInterval(restInterval);
    const timerEl = document.getElementById('rest-timer');
    const displayEl = document.getElementById('timer-display');
    timerEl.classList.add('active');
    currentRestSeconds = seconds;

    const updateDisplay = () => {
        const mins = Math.floor(currentRestSeconds / 60);
        const secs = currentRestSeconds % 60;
        displayEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    updateDisplay();

    restInterval = setInterval(() => {
        currentRestSeconds--;
        updateDisplay();
        if (currentRestSeconds <= 0) {
            clearInterval(restInterval);
            timerEl.classList.remove('active');
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            playBeep();
            showToast('REST COMPLETE — NEXT SET!');
        }
    }, 1000);
}

function skipRest() {
    clearInterval(restInterval);
    document.getElementById('rest-timer').classList.remove('active');
}

function adjustRestTimer(seconds) {
    currentRestSeconds = Math.max(0, currentRestSeconds + seconds);
    const mins = Math.floor(currentRestSeconds / 60);
    const secs = currentRestSeconds % 60;
    document.getElementById('timer-display').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ═════════════════════════════════════════════
// STOPWATCH (AMRAP / EMOM)
// ═════════════════════════════════════════════
function updateStopwatchDisplay() {
    const mins = Math.floor(stopwatchSeconds / 60);
    const secs = stopwatchSeconds % 60;
    const el = document.getElementById('stopwatch-display');
    if (el) el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function toggleStopwatch() {
    if (stopwatchInterval) {
        clearInterval(stopwatchInterval);
        stopwatchInterval = null;
        document.getElementById('stopwatch-start-btn').textContent = 'START';
    } else {
        stopwatchInterval = setInterval(() => {
            stopwatchSeconds++;
            updateStopwatchDisplay();
        }, 1000);
        document.getElementById('stopwatch-start-btn').textContent = 'PAUSE';
    }
}

function resetStopwatch() {
    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
    stopwatchSeconds = 0;
    updateStopwatchDisplay();
    document.getElementById('stopwatch-start-btn').textContent = 'START';
}

// ═════════════════════════════════════════════
// PLANS MODAL
// ═════════════════════════════════════════════
function showCreatePlan() {
    document.getElementById('modal-title').textContent = 'CREATE WORKOUT PLAN';
    document.getElementById('edit-plan-id').value = '';
    document.getElementById('plan-name').value = '';
    document.getElementById('plan-description').value = '';
    document.getElementById('days-builder').innerHTML = '';
    addDayToBuilder();
    document.getElementById('create-plan-modal').classList.add('active');
}

function editPlan(index) {
    const plan = workoutPlans[index];
    document.getElementById('modal-title').textContent = 'EDIT PLAN';
    document.getElementById('edit-plan-id').value = index;
    document.getElementById('plan-name').value = plan.name;
    document.getElementById('plan-description').value = plan.description;
    const builder = document.getElementById('days-builder');
    builder.innerHTML = '';
    plan.days.forEach(day => addDayToBuilder(day));
    document.getElementById('create-plan-modal').classList.add('active');
}

function addDayToBuilder(prefillDay = null) {
    const builder = document.getElementById('days-builder');
    const dayIndex = builder.children.length;
    
    const dayContainer = document.createElement('div');
    dayContainer.className = 'day-container';
    dayContainer.dataset.dayIndex = dayIndex;
    dayContainer.innerHTML = `
        <div class="day-header">
            <input type="text" class="form-input day-name-input" 
                   placeholder="DAY NAME (E.G., PUSH DAY)" 
                   value="${prefillDay ? escapeHtml(prefillDay.dayName) : ''}"
                   style="flex: 1; margin-right: 12px;">
            <button class="btn-remove remove-day-btn">REMOVE DAY</button>
        </div>
        <div class="exercise-builder" data-day="${dayIndex}"></div>
        <button class="btn btn-secondary btn-small add-exercise-to-day-btn" data-day="${dayIndex}" style="margin-top: 8px;">+ ADD EXERCISE</button>
    `;
    
    builder.appendChild(dayContainer);
    
    dayContainer.querySelector('.remove-day-btn').addEventListener('click', () => {
        if (builder.children.length === 1) {
            alert('PLAN MUST HAVE AT LEAST ONE DAY');
            return;
        }
        dayContainer.remove();
    });
    
    dayContainer.querySelector('.add-exercise-to-day-btn').addEventListener('click', () => {
        addExerciseToDayBuilder(dayIndex);
    });
    
    if (prefillDay && prefillDay.exercises) {
        prefillDay.exercises.forEach(ex => addExerciseToDayBuilder(dayIndex, ex));
    }
}

function addExerciseToDayBuilder(dayIndex, prefill = null) {
    const builder = document.querySelector(`.exercise-builder[data-day="${dayIndex}"]`);
    if (!builder) return;
    
    const exIndex = builder.children.length;
    const item = document.createElement('div');
    item.className = 'exercise-builder-item';
    item.innerHTML = `
        <div style="flex: 1;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="text" class="form-input exercise-name-input" 
                       data-day="${dayIndex}" data-ex="${exIndex}"
                       placeholder="SEARCH EXERCISES..." 
                       value="${prefill ? escapeHtml(prefill.name) : ''}" 
                       style="flex: 1;">
                <button class="btn btn-secondary btn-small browse-exercise-btn" 
                        data-day="${dayIndex}" data-ex="${exIndex}" 
                        style="white-space: nowrap;">BROWSE</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <input type="number" class="form-input" 
                       data-day="${dayIndex}" data-ex="${exIndex}" data-field="sets"
                       placeholder="SETS" value="${prefill ? prefill.sets : ''}" style="width: 80px;">
                <input type="number" class="form-input" 
                       data-day="${dayIndex}" data-ex="${exIndex}" data-field="targetReps"
                       placeholder="TARGET REPS" value="${prefill ? prefill.targetReps : ''}" style="flex: 1;">
            </div>
        </div>
        <button class="btn-remove remove-exercise-btn">✕</button>
    `;
    
    builder.appendChild(item);
    
    item.querySelector('.remove-exercise-btn').addEventListener('click', () => item.remove());
    
    item.querySelector('.browse-exercise-btn').addEventListener('click', () => {
        showExerciseBrowser(dayIndex, exIndex);
    });
}

function showExerciseBrowser(dayIndex, exIndex) {
    const overlay = document.createElement('div');
    overlay.className = 'modal active';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">SELECT EXERCISE</div>
            
            <div style="margin-bottom: 20px;">
                <input type="text" class="form-input" id="exercise-search" 
                       placeholder="🔍 SEARCH EXERCISES..." 
                       style="margin-bottom: 12px;">
                
                <div style="display: flex; gap: 8px;">
                    <select class="form-input" id="muscle-filter" style="flex: 1;">
                        <option value="">ALL MUSCLES</option>
                        <option value="Abs">ABS</option>
                        <option value="Biceps">BICEPS</option>
                        <option value="Calves">CALVES</option>
                        <option value="Chest">CHEST</option>
                        <option value="Forearms">FOREARMS</option>
                        <option value="Glutes">GLUTES</option>
                        <option value="Hamstrings">HAMSTRINGS</option>
                        <option value="Lats">LATS</option>
                        <option value="Lower Back">LOWER BACK</option>
                        <option value="Obliques">OBLIQUES</option>
                        <option value="Quads">QUADS</option>
                        <option value="Shoulders">SHOULDERS</option>
                        <option value="Traps">TRAPS</option>
                        <option value="Triceps">TRICEPS</option>
                        <option value="Upper Back">UPPER BACK</option>
                    </select>
                    
                    <select class="form-input" id="force-filter" style="flex: 1;">
                        <option value="">ALL FORCE TYPES</option>
                        <option value="Push">PUSH</option>
                        <option value="Pull">PULL</option>
                        <option value="Hinge">HINGE</option>
                        <option value="Static">STATIC</option>
                        <option value="Isometric">ISOMETRIC</option>
                    </select>
                </div>
            </div>
            
            <div id="exercise-results" style="max-height: 400px; overflow-y: auto; margin-bottom: 20px;">
            </div>
            
            <button class="btn btn-secondary" id="close-browser">CLOSE</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    function filterExercises() {
        const search = document.getElementById('exercise-search').value.toLowerCase();
        const muscleFilter = document.getElementById('muscle-filter').value;
        const forceFilter = document.getElementById('force-filter').value;
        
        let filtered = EXERCISE_DATABASE.filter(ex => {
            const matchesSearch = ex.name.toLowerCase().includes(search);
            const matchesMuscle = !muscleFilter || ex.muscle === muscleFilter;
            const matchesForce = !forceFilter || ex.force === forceFilter;
            return matchesSearch && matchesMuscle && matchesForce;
        });
        
        const resultsDiv = document.getElementById('exercise-results');
        
        if (filtered.length === 0) {
            resultsDiv.innerHTML = '<div class="empty-state"><p>NO EXERCISES FOUND</p></div>';
            return;
        }
        
        resultsDiv.innerHTML = filtered.slice(0, 50).map(ex => `
            <div class="exercise-result-item" data-exercise="${escapeHtml(ex.name)}">
                <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(ex.name)}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">
                    <span style="background: var(--bg-hover); padding: 2px 8px; border-radius: 0; margin-right: 4px;">
                        💪 ${ex.muscle}
                    </span>
                    <span style="background: var(--bg-hover); padding: 2px 8px; border-radius: 0; margin-right: 4px;">
                        🔨 ${ex.equipment}
                    </span>
                    <span style="background: var(--bg-hover); padding: 2px 8px; border-radius: 0;">
                        ⚡ ${ex.force}
                    </span>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.exercise-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const exerciseName = item.dataset.exercise;
                const input = document.querySelector(`[data-day="${dayIndex}"][data-ex="${exIndex}"].exercise-name-input`);
                if (input) input.value = exerciseName;
                document.body.removeChild(overlay);
            });
        });
    }
    
    filterExercises();
    
    document.getElementById('exercise-search').addEventListener('input', filterExercises);
    document.getElementById('muscle-filter').addEventListener('change', filterExercises);
    document.getElementById('force-filter').addEventListener('change', filterExercises);
    
    document.getElementById('close-browser').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
}

function savePlan() {
    const name = document.getElementById('plan-name').value.trim();
    const description = document.getElementById('plan-description').value.trim();
    
    if (!name) {
        alert('PLAN NAME IS REQUIRED.');
        return;
    }
    
    const daysBuilder = document.getElementById('days-builder');
    const days = [];
    
    daysBuilder.querySelectorAll('.day-container').forEach((dayContainer, dayIdx) => {
        const dayName = dayContainer.querySelector('.day-name-input').value.trim();
        if (!dayName) {
            alert(`DAY ${dayIdx + 1} NEEDS A NAME`);
            return;
        }
        
        const exercises = [];
        dayContainer.querySelectorAll('.exercise-builder-item').forEach((item, exIdx) => {
            const nameInput = item.querySelector(`[data-day="${dayIdx}"][data-ex="${exIdx}"].exercise-name-input`);
            const setsInput = item.querySelector(`[data-day="${dayIdx}"][data-ex="${exIdx}"][data-field="sets"]`);
            const repsInput = item.querySelector(`[data-day="${dayIdx}"][data-ex="${exIdx}"][data-field="targetReps"]`);
            
            const exName = nameInput ? nameInput.value.trim() : '';
            const sets = setsInput ? parseInt(setsInput.value) || 3 : 3;
            const targetReps = repsInput ? parseInt(repsInput.value) || 10 : 10;
            
            if (exName) {
                exercises.push({ name: exName, sets, targetReps });
            }
        });
        
        if (exercises.length > 0) {
            days.push({ dayName, exercises });
        }
    });
    
    if (days.length === 0) {
        alert('ADD AT LEAST ONE DAY WITH EXERCISES.');
        return;
    }
    
    const editIndex = document.getElementById('edit-plan-id').value;
    
    if (editIndex !== '') {
        const index = parseInt(editIndex);
        workoutPlans[index] = { ...workoutPlans[index], name, description, days };
    } else {
        workoutPlans.push({ id: Date.now(), name, description, days });
    }
    
    saveToFirebase();
    closeModal();
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// ═════════════════════════════════════════════
// PROGRESS
// ═════════════════════════════════════════════
function renderProgress() {
    const total = workoutHistory.length;
    const volume = workoutHistory.reduce((sum, w) =>
        sum + w.exercises.reduce((s2, ex) =>
            s2 + ex.sets.filter(s => s.completed).reduce((s3, s) =>
                s3 + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0), 0);
    const weekAgo = Date.now() - 7 * 86400000;
    const weekly = workoutHistory.filter(w => new Date(w.date) > weekAgo).length;
    document.getElementById('total-workouts').textContent = total;
    document.getElementById('total-volume').textContent = volume >= 1000 ? (volume / 1000).toFixed(1) + 'K' : Math.round(volume);
    document.getElementById('weekly-workouts').textContent = weekly;
    document.getElementById('personal-records').textContent = computePRs().size;
    renderVolumeChart();
    renderPRList();
    renderHistory();
    renderBodyWeight();
}

function computePRs() {
    const bests = new Map();
    [...workoutHistory].reverse().forEach(w => {
        w.exercises.forEach(ex => {
            ex.sets.filter(s => s.completed).forEach(s => {
                const weight = parseFloat(s.weight) || 0;
                const reps = parseInt(s.reps) || 0;
                const estimated1RM = weight * (1 + reps / 30);
                if (!bests.has(ex.name) || estimated1RM > bests.get(ex.name).max1RM) {
                    bests.set(ex.name, { weight: s.weight, reps: s.reps, max1RM: estimated1RM });
                }
            });
        });
    });
    return bests;
}

function renderPRList() {
    const bests = computePRs();
    const el = document.getElementById('pr-list');
    if (bests.size === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏆</div><p>COMPLETE WORKOUTS TO SET PRs</p></div>';
        return;
    }
    el.innerHTML = [...bests.entries()].map(([name, data]) => `
        <div class="pr-row">
            <span class="pr-exercise">${escapeHtml(name)}</span>
            <span class="pr-value">${data.weight} × ${data.reps}</span>
        </div>
    `).join('');
}

function renderHistory() {
    const el = document.getElementById('history-list');
    if (workoutHistory.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>NO WORKOUTS YET</p></div>';
        return;
    }
    el.innerHTML = workoutHistory.slice(0, 10).map(w => {
        const sets = w.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.completed).length, 0);
        const vol = w.exercises.reduce((sum, ex) =>
            sum + ex.sets.filter(s => s.completed).reduce((s2, s) =>
                s2 + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0);
        const date = new Date(w.date);
        const workoutTitle = w.dayName ? `${w.planName} - ${w.dayName}` : w.planName;
        return `
            <div class="history-row">
                <div class="history-date">${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div class="history-name">${escapeHtml(workoutTitle)}</div>
                <div class="history-stats">${sets} SETS · ${Math.round(vol).toLocaleString()} LBS VOLUME</div>
            </div>
        `;
    }).join('');
}

function renderVolumeChart() {
    const canvas = document.getElementById('volume-chart');
    const ctx = canvas.getContext('2d');
    const data = workoutHistory.slice(0, 10).reverse();
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = 200;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (data.length === 0) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');
        ctx.font = '14px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillText('COMPLETE WORKOUTS TO SEE YOUR VOLUME TREND', canvas.width / 2, 100);
        return;
    }
    const volumes = data.map(w =>
        w.exercises.reduce((sum, ex) =>
            sum + ex.sets.filter(s => s.completed).reduce((s2, s) =>
                s2 + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0));
    const maxVol = Math.max(...volumes, 1);
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;
    const stepX = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;
    
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border');
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');
        ctx.font = '11px Work Sans';
        ctx.textAlign = 'right';
        const val = Math.round(maxVol - (maxVol / 4) * i);
        ctx.fillText(val.toLocaleString(), padding.left - 6, y + 4);
    }
    
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary');
    gradient.addColorStop(0, primaryColor.replace(')', ', 0.4)').replace('rgb', 'rgba'));
    gradient.addColorStop(1, primaryColor.replace(')', ', 0.02)').replace('rgb', 'rgba'));
    ctx.beginPath();
    volumes.forEach((v, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartHeight - (v / maxVol) * chartHeight;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + (volumes.length - 1) * stepX, padding.top + chartHeight);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    volumes.forEach((v, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartHeight - (v / maxVol) * chartHeight;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    volumes.forEach((v, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartHeight - (v / maxVol) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = primaryColor;
        ctx.fill();
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary');
        ctx.lineWidth = 2;
        ctx.stroke();
    });
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');
    ctx.font = '11px Work Sans';
    ctx.textAlign = 'center';
    data.forEach((w, i) => {
        const x = padding.left + i * stepX;
        const date = new Date(w.date);
        ctx.fillText(`${date.getMonth() + 1}/${date.getDate()}`, x, canvas.height - 8);
    });
}

// ═════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        Object.assign(toast.style, {
            position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
            background: '#333', color: '#fff', padding: '12px 24px', borderRadius: '0',
            fontFamily: "'Barlow Condensed', sans-serif", fontSize: '14px', zIndex: '999',
            transition: 'opacity 0.3s', pointerEvents: 'none', textTransform: 'uppercase',
            letterSpacing: '1px', border: '2px solid var(--primary)'
        });
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => toast.style.opacity = '0', 2500);
}

// Make functions globally accessible for onclick handlers
window.removeExerciseTimer = removeExerciseTimer;
window.deleteProgressPhoto = deleteProgressPhoto;

// ═════════════════════════════════════════════
// EVENT LISTENERS
// ═════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    // Auth listeners
    document.getElementById('show-signup').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('signup-form').style.display = 'block';
    });
    
    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('signup-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    });
    
    document.getElementById('login-btn').addEventListener('click', () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        handleLogin(email, password);
    });
    
    document.getElementById('signup-btn').addEventListener('click', () => {
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-password-confirm').value;
        handleSignup(email, password, confirm);
    });
    
    document.getElementById('google-login-btn').addEventListener('click', handleGoogleAuth);
    document.getElementById('google-signup-btn').addEventListener('click', handleGoogleAuth);
    
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    
    // Navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchView(tab.dataset.view));
    });
    
    // Install banner
    document.getElementById('install-btn').addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') localStorage.setItem('pwa-installed', 'true');
        deferredPrompt = null;
        document.getElementById('install-banner').classList.remove('show');
    });
    
    document.getElementById('close-install').addEventListener('click', () => {
        document.getElementById('install-banner').classList.remove('show');
    });
    
    // Workout controls
    document.getElementById('start-workout-btn').addEventListener('click', startWorkout);
    document.getElementById('choose-plan-btn').addEventListener('click', () => switchView('plans'));
    document.getElementById('finish-workout-btn').addEventListener('click', finishWorkout);
    document.getElementById('skip-rest-btn').addEventListener('click', skipRest);
    document.getElementById('timer-plus-15').addEventListener('click', () => adjustRestTimer(15));
    document.getElementById('timer-minus-15').addEventListener('click', () => adjustRestTimer(-15));
    document.getElementById('stopwatch-start-btn').addEventListener('click', toggleStopwatch);
    document.getElementById('stopwatch-reset-btn').addEventListener('click', resetStopwatch);
    
    // Plan controls
    document.getElementById('create-plan-btn').addEventListener('click', showCreatePlan);
    document.getElementById('add-day-btn').addEventListener('click', () => addDayToBuilder());
    document.getElementById('save-plan-btn').addEventListener('click', savePlan);
    document.getElementById('cancel-plan-btn').addEventListener('click', closeModal);
    
    // Body weight
    document.getElementById('add-weight-btn').addEventListener('click', showAddWeightModal);
    document.getElementById('save-weight-btn').addEventListener('click', saveWeight);
    document.getElementById('cancel-weight-btn').addEventListener('click', closeModal);
    document.getElementById('save-weight-goal-btn').addEventListener('click', saveWeightGoal);
    
    // CSV Export
    document.getElementById('export-csv-btn').addEventListener('click', exportWorkoutDataToCSV);
    
    // Rest timer settings
    document.getElementById('default-rest-time').addEventListener('change', (e) => {
        restTimerSettings.default = parseInt(e.target.value);
        saveToFirebase();
        showToast('DEFAULT REST TIME UPDATED! ⏱️');
    });
    document.getElementById('add-exercise-timer-btn').addEventListener('click', showAddExerciseTimerModal);
    document.getElementById('save-timer-btn').addEventListener('click', saveExerciseTimer);
    document.getElementById('cancel-timer-btn').addEventListener('click', closeModal);
    
    // Progress photos
    document.getElementById('add-progress-photo-btn').addEventListener('click', () => {
        document.getElementById('progress-photo-input').click();
    });
    document.getElementById('progress-photo-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadProgressPhoto(file);
    });
    
    // Profile photo
    document.getElementById('change-profile-photo').addEventListener('click', () => {
        document.getElementById('profile-photo-input').click();
    });
    document.getElementById('profile-photo-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadProfilePhoto(file);
    });
    
    // Library filters
    document.getElementById('library-difficulty-filter').addEventListener('change', renderLibraryPlans);
    document.getElementById('library-days-filter').addEventListener('change', renderLibraryPlans);
    document.getElementById('library-search').addEventListener('input', renderLibraryPlans);
    
    // Plan detail modal
    document.getElementById('close-plan-detail-btn').addEventListener('click', closeModal);
    document.getElementById('add-plan-to-account-btn').addEventListener('click', () => {
        if (currentPlanDetail) {
            addLibraryPlanToAccount(currentPlanDetail.id);
        }
    });
});
