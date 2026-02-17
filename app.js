// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let workoutPlans   = [];
let workoutHistory = [];
let currentWorkout = null;
let restInterval   = null;
let elapsedInterval = null;
let currentPlanIndex = 0;

const EXERCISE_DB = [
    'Barbell Bench Press','Incline Dumbbell Press','Chest Fly','Push-ups',
    'Barbell Squat','Romanian Deadlift','Leg Press','Leg Curl','Leg Extension',
    'Barbell Row','Pull-ups','Lat Pulldown','Dumbbell Row','Face Pulls',
    'Overhead Press','Lateral Raises','Front Raises','Shrugs',
    'Barbell Curl','Hammer Curl','Tricep Pushdown','Skull Crushers','Dips',
    'Plank','Russian Twists','Hanging Leg Raises','Deadlift','Hip Thrust',
    'Cable Fly','Preacher Curl','Rope Pushdown','Arnold Press'
];

// ─────────────────────────────────────────────
// PWA
// ─────────────────────────────────────────────
let deferredPrompt;
const installBanner  = document.getElementById('install-banner');
const installBtn     = document.getElementById('install-btn');
const closeInstallBtn = document.getElementById('close-install');

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(r => console.log('SW registered', r))
            .catch(e => console.log('SW failed', e));
    });
}

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (!localStorage.getItem('pwa-installed')) {
        setTimeout(() => installBanner.classList.add('show'), 3000);
    }
});

installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') localStorage.setItem('pwa-installed', 'true');
    deferredPrompt = null;
    installBanner.classList.remove('show');
});

closeInstallBtn.addEventListener('click', () => installBanner.classList.remove('show'));

window.addEventListener('appinstalled', () => {
    localStorage.setItem('pwa-installed', 'true');
    installBanner.classList.remove('show');
});

// ─────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────
function save() {
    localStorage.setItem('it_plans',   JSON.stringify(workoutPlans));
    localStorage.setItem('it_history', JSON.stringify(workoutHistory));
}

function load() {
    const p = localStorage.getItem('it_plans');
    const h = localStorage.getItem('it_history');
    if (p) workoutPlans   = JSON.parse(p);
    if (h) workoutHistory = JSON.parse(h);
}

function seedDefaults() {
    if (workoutPlans.length > 0) return;
    workoutPlans = [
        { id: 1, name: 'Push Day A', description: 'Chest, Shoulders & Triceps', exercises: [
            { name: 'Barbell Bench Press', sets: 4, targetReps: 8 },
            { name: 'Incline Dumbbell Press', sets: 3, targetReps: 10 },
            { name: 'Overhead Press', sets: 3, targetReps: 8 },
            { name: 'Lateral Raises', sets: 3, targetReps: 15 },
            { name: 'Tricep Pushdown', sets: 3, targetReps: 12 }
        ]},
        { id: 2, name: 'Pull Day A', description: 'Back & Biceps', exercises: [
            { name: 'Pull-ups', sets: 4, targetReps: 8 },
            { name: 'Barbell Row', sets: 4, targetReps: 8 },
            { name: 'Lat Pulldown', sets: 3, targetReps: 10 },
            { name: 'Face Pulls', sets: 3, targetReps: 15 },
            { name: 'Barbell Curl', sets: 3, targetReps: 10 }
        ]},
        { id: 3, name: 'Leg Day', description: 'Quads, Hamstrings & Glutes', exercises: [
            { name: 'Barbell Squat', sets: 4, targetReps: 8 },
            { name: 'Romanian Deadlift', sets: 4, targetReps: 8 },
            { name: 'Leg Press', sets: 3, targetReps: 12 },
            { name: 'Leg Curl', sets: 3, targetReps: 12 },
            { name: 'Hip Thrust', sets: 3, targetReps: 12 }
        ]}
    ];
    save();
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function switchView(view, e) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(view + '-view').classList.add('active');
    if (e && e.target) e.target.classList.add('active');
    if (view === 'plans')    renderPlans();
    if (view === 'progress') renderProgress();
}

function navToPlans() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('plans-view').classList.add('active');
    document.querySelectorAll('.nav-tab')[1].classList.add('active');
    renderPlans();
}

// ─────────────────────────────────────────────
// PLANS
// ─────────────────────────────────────────────
function renderPlans() {
    const grid = document.getElementById('plans-grid');
    if (workoutPlans.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No plans yet. Create your first!</p></div>';
        return;
    }
    grid.innerHTML = workoutPlans.map((plan, i) => `
        <div class="plan-card">
            <h3>${plan.name}</h3>
            <p style="color:var(--text-secondary);margin-bottom:10px;font-size:14px;">${plan.description}</p>
            <div class="plan-meta">
                <span>📋 ${plan.exercises.length} exercises</span>
                <span>💪 ${plan.exercises.reduce((s,e) => s + e.sets, 0)} sets</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px;">
                <button class="btn btn-small" onclick="selectPlan(${i})">Select</button>
                <button class="btn btn-secondary btn-small" onclick="editPlan(${i})">Edit</button>
                <button class="btn-remove btn-small" onclick="deletePlan(${i})" style="margin-left:auto;">Delete</button>
            </div>
        </div>
    `).join('');
}

function selectPlan(i) {
    currentPlanIndex = i;
    const plan = workoutPlans[i];
    document.getElementById('today-workout-title').textContent = plan.name;
    document.getElementById('today-workout-desc').textContent  = plan.description;
    switchView('workout', { target: document.querySelectorAll('.nav-tab')[0] });
}

function deletePlan(i) {
    if (!confirm(`Delete "${workoutPlans[i].name}"?`)) return;
    workoutPlans.splice(i, 1);
    save();
    renderPlans();
}

// ─────────────────────────────────────────────
// ACTIVE WORKOUT
// ─────────────────────────────────────────────
function startWorkout() {
    const plan = workoutPlans[currentPlanIndex];
    if (!plan) { alert('Please select a workout plan first.'); navToPlans(); return; }
    currentWorkout = {
        planId: plan.id,
        planName: plan.name,
        startTime: new Date(),
        date: new Date().toISOString(),
        exercises: plan.exercises.map(ex => ({
            name: ex.name,
            targetReps: ex.targetReps,
            sets: Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', completed: false }))
        }))
    };
    document.getElementById('workout-hero').style.display = 'none';
    document.getElementById('active-workout').style.display = 'block';
    document.getElementById('active-workout-name').textContent = plan.name;
    startElapsed();
    renderActiveWorkout();
}

function startElapsed() {
    clearInterval(elapsedInterval);
    elapsedInterval = setInterval(() => {
        if (!currentWorkout) return;
        const s = Math.floor((Date.now() - new Date(currentWorkout.startTime)) / 1000);
        const m = Math.floor(s / 60), sec = s % 60;
        document.getElementById('workout-elapsed').textContent = `⏱ ${m}:${sec.toString().padStart(2,'0')} elapsed`;
    }, 1000);
}

function renderActiveWorkout() {
    document.getElementById('exercise-container').innerHTML = currentWorkout.exercises.map((ex, xi) => {
        const last = getLastPerformance(ex.name);
        return `
            <div class="exercise-item">
                <div class="exercise-header">
                    <div class="exercise-name">${ex.name}</div>
                    ${last ? `<div class="last-performance">Last: ${last}</div>` : '<div class="last-performance">First time!</div>'}
                </div>
                <div class="sets-grid">
                    ${ex.sets.map((set, si) => `
                        <div class="set-box ${set.completed ? 'completed' : ''}">
                            <div class="set-number">Set ${si + 1}</div>
                            <div class="set-input-group">
                                <input type="number" inputmode="decimal" class="set-input" placeholder="lbs"
                                    value="${set.weight}"
                                    onchange="updateSet(${xi},${si},'weight',this.value)"
                                    ${set.completed ? 'disabled' : ''}>
                                <input type="number" inputmode="numeric" class="set-input" placeholder="reps"
                                    value="${set.reps}"
                                    onchange="updateSet(${xi},${si},'reps',this.value)"
                                    ${set.completed ? 'disabled' : ''}>
                            </div>
                            ${set.completed
                                ? `<div style="color:var(--success);margin-top:8px;font-weight:600;font-size:13px;">✓ Done — ${set.weight}lbs × ${set.reps}</div>`
                                : `<button class="complete-set-btn" onclick="completeSet(${xi},${si})">✓ Complete</button>`
                            }
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function updateSet(xi, si, field, value) {
    currentWorkout.exercises[xi].sets[si][field] = value;
}

function completeSet(xi, si) {
    const set = currentWorkout.exercises[xi].sets[si];
    // Auto-fill from last performance if empty
    if (!set.weight || !set.reps) {
        const last = getLastRawSets(currentWorkout.exercises[xi].name);
        if (last && last[si]) {
            if (!set.weight) set.weight = last[si].weight;
            if (!set.reps)   set.reps   = last[si].reps;
        }
    }
    if (!set.weight || !set.reps) { alert('Enter weight and reps first.'); return; }
    set.completed = true;
    renderActiveWorkout();
    startRestTimer(120);
}

function finishWorkout() {
    const completedSets = currentWorkout.exercises.flatMap(e => e.sets.filter(s => s.completed));
    if (completedSets.length === 0 && !confirm('No sets completed. Finish anyway?')) return;
    if (completedSets.length > 0 && !confirm('Finish workout?')) return;
    clearInterval(restInterval);
    clearInterval(elapsedInterval);
    currentWorkout.endTime = new Date().toISOString();
    workoutHistory.unshift(currentWorkout);
    save();
    currentWorkout = null;
    document.getElementById('workout-hero').style.display = 'block';
    document.getElementById('active-workout').style.display = 'none';
    document.getElementById('rest-timer').classList.remove('active');
    showToast('Workout saved! 💪');
}

function getLastPerformance(name) {
    const sets = getLastRawSets(name);
    if (!sets) return null;
    return sets.filter(s => s.completed).map(s => `${s.weight}×${s.reps}`).join(', ');
}

function getLastRawSets(name) {
    for (const w of workoutHistory) {
        const ex = w.exercises.find(e => e.name === name);
        if (ex) return ex.sets;
    }
    return null;
}

// ─────────────────────────────────────────────
// REST TIMER
// ─────────────────────────────────────────────
function startRestTimer(seconds) {
    clearInterval(restInterval);
    const timerEl   = document.getElementById('rest-timer');
    const displayEl = document.getElementById('timer-display');
    timerEl.classList.add('active');
    let remaining = seconds;
    const tick = () => {
        const m = Math.floor(remaining / 60), s = remaining % 60;
        displayEl.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    };
    tick();
    restInterval = setInterval(() => {
        remaining--;
        tick();
        if (remaining <= 0) {
            clearInterval(restInterval);
            timerEl.classList.remove('active');
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            showToast('Rest complete — next set!');
        }
    }, 1000);
}

function skipRest() {
    clearInterval(restInterval);
    document.getElementById('rest-timer').classList.remove('active');
}

// ─────────────────────────────────────────────
// CREATE / EDIT PLAN
// ─────────────────────────────────────────────
function showCreatePlan() {
    document.getElementById('modal-title').textContent = 'Create Workout Plan';
    document.getElementById('edit-plan-id').value = '';
    document.getElementById('plan-name').value = '';
    document.getElementById('plan-description').value = '';
    document.getElementById('exercise-builder').innerHTML = '';
    document.getElementById('create-plan-modal').classList.add('active');
}

function editPlan(i) {
    const plan = workoutPlans[i];
    document.getElementById('modal-title').textContent = 'Edit Plan';
    document.getElementById('edit-plan-id').value = i;
    document.getElementById('plan-name').value = plan.name;
    document.getElementById('plan-description').value = plan.description;
    const builder = document.getElementById('exercise-builder');
    builder.innerHTML = '';
    plan.exercises.forEach(ex => addExerciseToBuilder(ex));
    document.getElementById('create-plan-modal').classList.add('active');
}

function addExerciseToBuilder(prefill) {
    const builder = document.getElementById('exercise-builder');
    const idx = builder.children.length;
    const item = document.createElement('div');
    item.className = 'exercise-builder-item';
    item.innerHTML = `
        <div>
            <input type="text" class="form-input" id="ex-name-${idx}"
                placeholder="Exercise name" list="ex-db"
                value="${prefill ? prefill.name : ''}"
                style="margin-bottom:8px;">
            <datalist id="ex-db">${EXERCISE_DB.map(e => `<option value="${e}">`).join('')}</datalist>
            <div style="display:flex;gap:8px;">
                <input type="number" class="form-input" id="ex-sets-${idx}" placeholder="Sets"
                    value="${prefill ? prefill.sets : ''}" style="width:80px;">
                <input type="number" class="form-input" id="ex-reps-${idx}" placeholder="Target reps"
                    value="${prefill ? prefill.targetReps : ''}" style="flex:1;">
            </div>
        </div>
        <button class="btn-remove" onclick="this.closest('.exercise-builder-item').remove()">✕</button>
    `;
    builder.appendChild(item);
}

function savePlan() {
    const name = document.getElementById('plan-name').value.trim();
    const desc = document.getElementById('plan-description').value.trim();
    if (!name) { alert('Plan name required.'); return; }
    const builder = document.getElementById('exercise-builder');
    const exercises = [];
    for (let i = 0; i < builder.children.length; i++) {
        const n = document.getElementById(`ex-name-${i}`)?.value.trim();
        const s = parseInt(document.getElementById(`ex-sets-${i}`)?.value) || 3;
        const r = parseInt(document.getElementById(`ex-reps-${i}`)?.value) || 10;
        if (n) exercises.push({ name: n, sets: s, targetReps: r });
    }
    if (exercises.length === 0) { alert('Add at least one exercise.'); return; }
    const editIdx = document.getElementById('edit-plan-id').value;
    if (editIdx !== '') {
        workoutPlans[parseInt(editIdx)] = { ...workoutPlans[parseInt(editIdx)], name, description: desc, exercises };
    } else {
        workoutPlans.push({ id: Date.now(), name, description: desc, exercises });
    }
    save();
    closeModal();
    renderPlans();
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// ─────────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────────
function renderProgress() {
    const total   = workoutHistory.length;
    const volume  = workoutHistory.reduce((sum, w) =>
        sum + w.exercises.reduce((s2, ex) =>
            s2 + ex.sets.filter(s => s.completed).reduce((s3, s) =>
                s3 + (parseFloat(s.weight)||0) * (parseInt(s.reps)||0), 0), 0), 0);
    const cutoff  = Date.now() - 7 * 86400000;
    const weekly  = workoutHistory.filter(w => new Date(w.date) > cutoff).length;
    document.getElementById('total-workouts').textContent  = total;
    document.getElementById('total-volume').textContent    = volume >= 1000 ? (volume/1000).toFixed(1)+'k' : Math.round(volume);
    document.getElementById('weekly-workouts').textContent = weekly;
    document.getElementById('personal-records').textContent = computePRs().size;
    renderVolumeChart();
    renderPRList();
    renderHistory();
}

function computePRs() {
    const bests = new Map();
    [...workoutHistory].reverse().forEach(w => {
        w.exercises.forEach(ex => {
            ex.sets.filter(s => s.completed).forEach(s => {
                const max1rm = (parseFloat(s.weight)||0) * (1 + (parseInt(s.reps)||0) / 30);
                if (!bests.has(ex.name) || max1rm > bests.get(ex.name).max1rm) {
                    bests.set(ex.name, { weight: s.weight, reps: s.reps, max1rm });
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
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏆</div><p>Complete workouts to set PRs</p></div>';
        return;
    }
    el.innerHTML = [...bests.entries()].map(([name, v]) => `
        <div class="pr-row">
            <span class="pr-exercise">${name}</span>
            <span class="pr-value">${v.weight} lbs × ${v.reps}</span>
        </div>
    `).join('');
}

function renderHistory() {
    const el = document.getElementById('history-list');
    if (workoutHistory.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No workouts yet</p></div>';
        return;
    }
    el.innerHTML = workoutHistory.slice(0, 10).map(w => {
        const sets  = w.exercises.reduce((s, ex) => s + ex.sets.filter(s => s.completed).length, 0);
        const vol   = w.exercises.reduce((s, ex) => s + ex.sets.filter(s=>s.completed).reduce((s2,s) => s2+(parseFloat(s.weight)||0)*(parseInt(s.reps)||0),0),0);
        const d     = new Date(w.date);
        return `
            <div class="history-row">
                <div class="history-date">${d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</div>
                <div class="history-name">${w.planName}</div>
                <div class="history-stats">${sets} sets · ${Math.round(vol).toLocaleString()} lbs volume</div>
            </div>
        `;
    }).join('');
}

function renderVolumeChart() {
    const canvas = document.getElementById('volume-chart');
    const ctx    = canvas.getContext('2d');
    const data   = workoutHistory.slice(0, 10).reverse();

    canvas.width  = canvas.offsetWidth || 600;
    canvas.height = 200;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data.length === 0) {
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '14px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillText('Complete workouts to see your volume trend', canvas.width / 2, 100);
        return;
    }

    const volumes = data.map(w =>
        w.exercises.reduce((s, ex) =>
            s + ex.sets.filter(s => s.completed).reduce((s2, s) =>
                s2 + (parseFloat(s.weight)||0) * (parseInt(s.reps)||0), 0), 0));

    const maxV   = Math.max(...volumes, 1);
    const pad    = { top: 20, right: 20, bottom: 40, left: 50 };
    const w      = canvas.width  - pad.left - pad.right;
    const h      = canvas.height - pad.top  - pad.bottom;
    const stepX  = data.length > 1 ? w / (data.length - 1) : w;

    // Grid lines
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (h / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke();
        ctx.fillStyle = '#606060'; ctx.font = '11px Work Sans'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxV - (maxV / 4) * i).toLocaleString(), pad.left - 6, y + 4);
    }

    // Area fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
    gradient.addColorStop(0, 'rgba(255,77,0,0.4)');
    gradient.addColorStop(1, 'rgba(255,77,0,0.02)');
    ctx.beginPath();
    volumes.forEach((v, i) => {
        const x = pad.left + i * stepX;
        const y = pad.top + h - (v / maxV) * h;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + (volumes.length - 1) * stepX, pad.top + h);
    ctx.lineTo(pad.left, pad.top + h);
    ctx.closePath();
    ctx.fillStyle = gradient; ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#ff4d00'; ctx.lineWidth = 2.5;
    volumes.forEach((v, i) => {
        const x = pad.left + i * stepX;
        const y = pad.top + h - (v / maxV) * h;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    volumes.forEach((v, i) => {
        const x = pad.left + i * stepX;
        const y = pad.top + h - (v / maxV) * h;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4d00'; ctx.fill();
        ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 2; ctx.stroke();
    });

    // X labels
    ctx.fillStyle = '#606060'; ctx.font = '11px Work Sans'; ctx.textAlign = 'center';
    data.forEach((w, i) => {
        const x = pad.left + i * stepX;
        const d = new Date(w.date);
        ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x, canvas.height - 8);
    });
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        Object.assign(t.style, {
            position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
            background:'#333', color:'#fff', padding:'12px 24px', borderRadius:'6px',
            fontFamily:"'Work Sans',sans-serif", fontSize:'14px', zIndex:'999',
            transition:'opacity .3s', pointerEvents:'none'
        });
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(() => t.style.opacity = '0', 2500);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
load();
seedDefaults();
renderPlans();
