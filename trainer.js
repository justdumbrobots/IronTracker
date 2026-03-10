// trainer.js — Phases 1-3: Trainer/Athlete connection, directory, analytics, plan assignment
import { auth, db } from './firebase-config.js';
import {
    collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
    onSnapshot, query, where, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ─── State ────────────────────────────────────────────────────────────────────
let trainerActivePane = 'athletes';
let myAthletes = [];
let connectionRequests = [];
let myAssignments = [];         // athlete's incoming plan assignments
let selectedAthleteUid = null;
let directoryPage = 0;
let unsubscribeAthletes = null;
let unsubscribeRequests = null;
let unsubscribeAssignments = null;
let unsubscribeCompletions = null;
let completionsBadgeCount = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getUser = () => auth.currentUser;
function esc(text) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(text ?? '')));
    return d.innerHTML;
}
function toast(msg, type = 'info') {
    if (window.showToastGlobal) window.showToastGlobal(msg, type);
}
function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function el(id) { return document.getElementById(id); }

// ─── Module Init ──────────────────────────────────────────────────────────────
export function initTrainer() {
    const role = window.userRole;
    if (role === 'trainer') {
        listenForConnectionRequests();
        listenForMyAthletes();
        listenForWorkoutCompletions();
        loadCoachingPanel();
        ensureTrainerProfile();
    }
    if (role === 'athlete') {
        listenForAssignments();
        loadCoachingPanel();
    }
}

export function loadTrainerView() {
    switchTrainerPane(trainerActivePane);
}

// ─── Pane Router ──────────────────────────────────────────────────────────────
function switchTrainerPane(pane) {
    trainerActivePane = pane;
    document.querySelectorAll('.trainer-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.pane === pane));
    ['athletes', 'requests', 'assign', 'profile'].forEach(p => {
        const el = document.getElementById(`trainer-${p}-pane`);
        if (el) el.style.display = pane === p ? '' : 'none';
    });
    if (pane === 'athletes')  renderAthletesList();
    if (pane === 'requests')  renderConnectionRequests();
    if (pane === 'assign')    renderAssignPane();
    if (pane === 'profile')   renderTrainerProfilePane();
}

// ─── TRAINER: MY ATHLETES ─────────────────────────────────────────────────────
function listenForMyAthletes() {
    const uid = getUser()?.uid;
    if (!uid) return;
    if (unsubscribeAthletes) unsubscribeAthletes();
    const q = query(collection(db, 'users'), where('trainerId', '==', uid));
    unsubscribeAthletes = onSnapshot(q, snap => {
        myAthletes = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        renderAthletesList();
        updateRequestsBadge();
    });
}

function renderAthletesList() {
    const container = el('trainer-athletes-pane');
    if (!container) return;
    if (myAthletes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏋️</div>
                <p>NO ATHLETES YET.<br>SHARE YOUR REFERRAL LINK OR APPROVE CONNECTION REQUESTS.</p>
                <button class="btn btn-small" style="margin-top:16px;" onclick="copyReferralLink()">📋 COPY MY REFERRAL LINK</button>
            </div>`;
        return;
    }
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px;">
            <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; color:var(--text-secondary); letter-spacing:1px;">${myAthletes.length} ATHLETE${myAthletes.length !== 1 ? 'S' : ''}</div>
            <button class="btn btn-small btn-secondary" onclick="copyReferralLink()">📋 SHARE REFERRAL LINK</button>
        </div>
        ${myAthletes.map(a => `
            <div class="trainer-athlete-card" onclick="viewAthleteDetail('${a.uid}','${esc(a.displayName || a.email)}')">
                <div class="trainer-athlete-avatar">${(a.displayName || a.email || '?').charAt(0).toUpperCase()}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-family:'Barlow Condensed',sans-serif; font-size:17px;">${esc(a.displayName || a.email)}</div>
                    <div style="color:var(--text-secondary); font-size:12px;">${esc(a.email || '')}</div>
                    <div style="color:var(--text-muted); font-size:11px; margin-top:2px;">LAST SEEN: ${formatDate(a.lastSeen)}</div>
                </div>
                <div style="color:var(--text-secondary); font-size:20px;">›</div>
            </div>
        `).join('')}`;
}

async function viewAthleteDetail(athleteUid, athleteName) {
    selectedAthleteUid = athleteUid;
    const container = el('trainer-athletes-pane');
    container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-secondary);">LOADING ${esc(athleteName)}...</div>`;

    try {
        const wdSnap = await getDoc(doc(db, 'users', athleteUid, 'data', 'workout_data'));
        const userSnap = await getDoc(doc(db, 'users', athleteUid));
        const data = wdSnap.exists() ? wdSnap.data() : {};
        const profile = userSnap.exists() ? userSnap.data() : {};
        const history = data.workoutHistory || [];
        const bwEntries = (data.bodyWeightEntries || []).slice(-20);

        // Build PRs
        const prMap = {};
        [...history].reverse().forEach(w => {
            (w.exercises || []).forEach(ex => {
                (ex.sets || []).filter(s => s.completed).forEach(s => {
                    const w = parseFloat(s.weight) || 0;
                    if (w > (prMap[ex.name] || 0)) prMap[ex.name] = w;
                });
            });
        });
        const topPRs = Object.entries(prMap).sort((a,b) => b[1]-a[1]).slice(0,8);

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
                <button class="btn btn-secondary btn-small" onclick="renderAthletesList()">← BACK</button>
                <div style="font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:22px;">${esc(athleteName)}</div>
                <button class="btn btn-small" style="margin-left:auto;" onclick="openMessageWith('${athleteUid}','${esc(athleteName)}')">💬 MESSAGE</button>
            </div>

            <!-- Stats row -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; margin-bottom:20px;">
                <div class="stat-chip"><div class="stat-chip-val">${history.length}</div><div class="stat-chip-label">WORKOUTS</div></div>
                <div class="stat-chip"><div class="stat-chip-val">${topPRs.length}</div><div class="stat-chip-label">PRs TRACKED</div></div>
                <div class="stat-chip"><div class="stat-chip-val">${bwEntries.length ? bwEntries[bwEntries.length-1].weight+'lbs' : '—'}</div><div class="stat-chip-label">LAST WEIGHT</div></div>
                <div class="stat-chip"><div class="stat-chip-val">${formatDate(profile.lastSeen)}</div><div class="stat-chip-label">LAST ACTIVE</div></div>
            </div>

            <!-- Body weight chart -->
            ${bwEntries.length >= 2 ? `
            <div class="chart-container" style="margin-bottom:20px;">
                <h3 style="font-family:'Barlow Condensed',sans-serif; font-size:18px; text-transform:uppercase; margin-bottom:12px;">BODY WEIGHT TREND</h3>
                <canvas id="athlete-bw-chart" height="140" style="width:100%;"></canvas>
            </div>` : ''}

            <!-- Top PRs -->
            ${topPRs.length ? `
            <div class="chart-container" style="margin-bottom:20px;">
                <h3 style="font-family:'Barlow Condensed',sans-serif; font-size:18px; text-transform:uppercase; margin-bottom:12px;">TOP PRs</h3>
                ${topPRs.map(([name, w]) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border);">
                        <span style="font-size:14px;">${esc(name)}</span>
                        <span style="font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:18px; color:var(--primary);">${w} LBS</span>
                    </div>`).join('')}
            </div>` : ''}

            <!-- Recent workouts -->
            <div class="chart-container">
                <h3 style="font-family:'Barlow Condensed',sans-serif; font-size:18px; text-transform:uppercase; margin-bottom:12px;">RECENT WORKOUTS</h3>
                ${history.length === 0 ? '<p style="color:var(--text-secondary);">NO WORKOUTS YET.</p>' :
                    history.slice(0,10).map(w => `
                        <div class="workout-history-card" style="cursor:pointer;" onclick="openAthleteWorkoutDetail('${athleteUid}','${esc(w.workoutId || '')}','${esc(athleteName)}')">
                            <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:16px;">${esc(w.dayName || w.planName)}</div>
                            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${formatDate(w.date)} · ${(w.exercises||[]).length} EXERCISES</div>
                        </div>`).join('')
                }
            </div>`;

        // Draw body weight chart
        if (bwEntries.length >= 2) {
            setTimeout(() => drawAthleteChart(bwEntries), 50);
        }
    } catch(e) {
        console.error('viewAthleteDetail error:', e);
        container.innerHTML = `<div style="color:var(--error); padding:20px;">ERROR LOADING ATHLETE DATA</div>`;
    }
}

function drawAthleteChart(entries) {
    const canvas = el('athlete-bw-chart');
    if (!canvas) return;
    canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    canvas.height = 140 * (window.devicePixelRatio || 1);
    canvas.style.height = '140px';
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);
    const W = canvas.offsetWidth, H = 140;
    const weights = entries.map(e => e.weight);
    const minW = Math.min(...weights) - 5, maxW = Math.max(...weights) + 5;
    const xStep = W / (entries.length - 1);
    const yScale = (val) => H - 20 - ((val - minW) / (maxW - minW)) * (H - 40);

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'var(--primary)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    entries.forEach((e, i) => {
        const x = i * xStep, y = yScale(e.weight);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = 'rgba(var(--primary-rgb, 255,255,255), 0.08)';
    ctx.lineTo((entries.length-1)*xStep, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
}

async function openAthleteWorkoutDetail(athleteUid, workoutId, athleteName) {
    // Load workout comments for this workout
    const modal = el('athlete-workout-modal');
    const body = el('athlete-workout-body');
    const title = el('athlete-workout-title');
    if (!modal) return;
    title.textContent = `WORKOUT — ${athleteName}`;
    body.innerHTML = '<p style="color:var(--text-secondary);">LOADING...</p>';
    modal.classList.add('active');

    try {
        const wdSnap = await getDoc(doc(db, 'users', athleteUid, 'data', 'workout_data'));
        const history = wdSnap.data()?.workoutHistory || [];
        const workout = history.find(w => w.workoutId === workoutId) || history[0];
        if (!workout) { body.innerHTML = '<p>NOT FOUND.</p>'; return; }

        const commentsSnap = await getDocs(collection(db, 'users', athleteUid, 'workout_comments', workoutId || 'none', 'comments'));
        const comments = commentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        body.innerHTML = `
            <div style="margin-bottom:16px;">
                <div style="font-family:'Barlow Condensed',sans-serif; font-size:22px; font-weight:800;">${esc(workout.dayName || workout.planName)}</div>
                <div style="color:var(--text-secondary); font-size:13px;">${formatDate(workout.date)}</div>
            </div>
            ${(workout.exercises || []).map(ex => `
                <div style="margin-bottom:12px;">
                    <div style="font-weight:700; margin-bottom:4px;">${esc(ex.name)}</div>
                    ${ex.sets.filter(s=>s.completed).map((s,i) => `
                        <div style="font-size:13px; color:var(--text-secondary); padding:2px 0;">SET ${i+1}: ${s.weight} LBS × ${s.reps} REPS</div>`).join('')}
                    ${ex.effortRating ? `<div style="font-size:12px; margin-top:4px; color:var(--text-muted);">FELT: ${ex.effortRating.toUpperCase()}</div>` : ''}
                </div>`).join('')}

            <div style="border-top:1px solid var(--border); margin-top:20px; padding-top:16px;">
                <div style="font-family:'Barlow Condensed',sans-serif; font-size:16px; font-weight:700; margin-bottom:12px;">TRAINER NOTES</div>
                ${comments.map(c => `
                    <div style="padding:10px; background:var(--bg-hover); border-radius:8px; margin-bottom:8px;">
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">${esc(c.trainerName)} · ${formatDate(c.createdAt)}</div>
                        <div style="font-size:14px;">${esc(c.text)}</div>
                    </div>`).join('')}
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <input type="text" class="form-input" id="trainer-comment-input" placeholder="ADD A NOTE..." maxlength="500" style="flex:1;">
                    <button class="btn btn-small" onclick="submitTrainerComment('${athleteUid}','${esc(workoutId || 'none')}')">POST</button>
                </div>
            </div>`;
    } catch(e) {
        console.error(e);
        body.innerHTML = '<p style="color:var(--error);">ERROR LOADING WORKOUT</p>';
    }
}

async function submitTrainerComment(athleteUid, workoutId) {
    const input = el('trainer-comment-input');
    const text = input?.value.trim();
    if (!text) return;
    const user = getUser();
    try {
        await addDoc(collection(db, 'users', athleteUid, 'workout_comments', workoutId, 'comments'), {
            trainerId: user.uid,
            trainerName: user.displayName || user.email,
            text,
            createdAt: new Date().toISOString()
        });
        input.value = '';
        toast('NOTE POSTED', 'success');
        openAthleteWorkoutDetail(athleteUid, workoutId, '');
    } catch(e) { toast('ERROR POSTING NOTE', 'error'); }
}

// ─── TRAINER: CONNECTION REQUESTS ─────────────────────────────────────────────
function listenForConnectionRequests() {
    const uid = getUser()?.uid;
    if (!uid) return;
    if (unsubscribeRequests) unsubscribeRequests();
    const q = query(collection(db, 'connection_requests'),
        where('trainerId', '==', uid), where('status', '==', 'pending'));
    unsubscribeRequests = onSnapshot(q, snap => {
        connectionRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateRequestsBadge();
        if (trainerActivePane === 'requests') renderConnectionRequests();
    });
}

function updateRequestsBadge() {
    const badge = el('trainer-requests-badge');
    const total = connectionRequests.length + completionsBadgeCount;
    if (badge) { badge.textContent = total || ''; badge.style.display = total ? '' : 'none'; }
}

function renderConnectionRequests() {
    const container = el('trainer-requests-pane');
    if (!container) return;

    const completionItems = completionsBadgeCount > 0 ? `
        <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; color:var(--text-secondary); letter-spacing:1px; margin-bottom:8px;">RECENT COMPLETIONS</div>
        <div id="completions-list" style="margin-bottom:20px;"></div>` : '';

    if (connectionRequests.length === 0 && completionsBadgeCount === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📬</div><p>NO PENDING REQUESTS</p></div>`;
        return;
    }

    container.innerHTML = `
        ${completionItems}
        <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; color:var(--text-secondary); letter-spacing:1px; margin-bottom:8px;">CONNECTION REQUESTS</div>
        ${connectionRequests.length === 0 ? '<p style="color:var(--text-secondary); margin-bottom:20px;">NO PENDING REQUESTS</p>' :
            connectionRequests.map(r => `
            <div class="trainer-athlete-card" style="flex-wrap:wrap; gap:12px;">
                <div class="trainer-athlete-avatar">${(r.athleteDisplayName||'?').charAt(0).toUpperCase()}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-family:'Barlow Condensed',sans-serif; font-size:17px;">${esc(r.athleteDisplayName)}</div>
                    <div style="color:var(--text-secondary); font-size:12px;">${formatDate(r.createdAt)}</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-small" onclick="acceptConnectionRequest('${r.id}','${r.athleteId}','${esc(r.athleteDisplayName)}')">ACCEPT</button>
                    <button class="btn btn-secondary btn-small" onclick="declineConnectionRequest('${r.id}')">DECLINE</button>
                </div>
            </div>`).join('')}`;

    renderCompletionsList();
}

async function renderCompletionsList() {
    const container = el('completions-list');
    if (!container) return;
    try {
        const q = query(collection(db, 'workout_completions'),
            where('trainerId', '==', getUser().uid), orderBy('completedAt', 'desc'), limit(10));
        const snap = await getDocs(q);
        if (snap.empty) { container.innerHTML = '<p style="color:var(--text-secondary);">NONE YET.</p>'; return; }
        container.innerHTML = snap.docs.map(d => {
            const c = d.data();
            return `<div style="padding:10px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:700; font-size:14px;">${esc(c.athleteDisplayName)}</div>
                    <div style="font-size:12px; color:var(--text-secondary);">${esc(c.workoutName)} · ${formatDate(c.completedAt)}</div>
                </div>
                <button class="btn btn-small btn-secondary" onclick="viewAthleteDetail('${c.athleteId}','${esc(c.athleteDisplayName)}'); window.switchView('trainer');">VIEW</button>
            </div>`;
        }).join('');
    } catch(e) { container.innerHTML = '<p style="color:var(--error);">ERROR LOADING</p>'; }
}

function listenForWorkoutCompletions() {
    const uid = getUser()?.uid;
    if (!uid) return;
    if (unsubscribeCompletions) unsubscribeCompletions();
    const q = query(collection(db, 'workout_completions'),
        where('trainerId', '==', uid), orderBy('completedAt', 'desc'), limit(20));
    unsubscribeCompletions = onSnapshot(q, snap => {
        completionsBadgeCount = snap.docs.filter(d => {
            const seenKey = `seen_completion_${d.id}`;
            return !localStorage.getItem(seenKey);
        }).length;
        updateRequestsBadge();
    });
}

async function acceptConnectionRequest(requestId, athleteId, athleteName) {
    try {
        await updateDoc(doc(db, 'connection_requests', requestId), { status: 'accepted' });
        await updateDoc(doc(db, 'users', athleteId), {
            trainerId: getUser().uid,
            trainerDisplayName: getUser().displayName || getUser().email
        });
        toast(`${athleteName.toUpperCase()} CONNECTED!`, 'success');
    } catch(e) { toast('ERROR ACCEPTING REQUEST', 'error'); console.error(e); }
}

async function declineConnectionRequest(requestId) {
    try {
        await updateDoc(doc(db, 'connection_requests', requestId), { status: 'declined' });
        toast('REQUEST DECLINED');
    } catch(e) { toast('ERROR', 'error'); }
}

// ─── TRAINER: ASSIGN PLAN ─────────────────────────────────────────────────────
function renderAssignPane() {
    const container = el('trainer-assign-pane');
    if (!container) return;
    const plans = window.myWorkoutPlans || [];
    if (myAthletes.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><p>ADD ATHLETES FIRST TO ASSIGN PLANS</p></div>`;
        return;
    }
    container.innerHTML = `
        <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; color:var(--text-secondary); letter-spacing:1px; margin-bottom:16px;">ASSIGN A PLAN TO AN ATHLETE</div>
        <div class="form-group">
            <label class="form-label">SELECT ATHLETE</label>
            <select class="form-input" id="assign-athlete-select">
                <option value="">— CHOOSE ATHLETE —</option>
                ${myAthletes.map(a => `<option value="${a.uid}">${esc(a.displayName || a.email)}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">SELECT PLAN (FROM YOUR PLANS)</label>
            <select class="form-input" id="assign-plan-select">
                <option value="">— CHOOSE PLAN —</option>
                ${plans.map((p,i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">NOTE TO ATHLETE (OPTIONAL)</label>
            <textarea class="form-input" id="assign-note" rows="3" placeholder="E.G. START WITH LIGHTER WEIGHTS, FOCUS ON FORM..." maxlength="500"></textarea>
        </div>
        <button class="btn" onclick="assignPlanToAthlete()">ASSIGN PLAN</button>`;
}

async function assignPlanToAthlete() {
    const athleteUid = el('assign-athlete-select')?.value;
    const planIndex = parseInt(el('assign-plan-select')?.value);
    const note = el('assign-note')?.value.trim() || '';
    if (!athleteUid || isNaN(planIndex)) { toast('SELECT ATHLETE AND PLAN FIRST', 'error'); return; }
    const plans = window.myWorkoutPlans || [];
    const plan = plans[planIndex];
    if (!plan) { toast('PLAN NOT FOUND', 'error'); return; }
    const user = getUser();
    try {
        const assignedPlan = {
            ...plan,
            id: Date.now(),
            assignedByTrainer: true,
            assigningTrainerId: user.uid,
            assigningTrainerName: user.displayName || user.email
        };
        await addDoc(collection(db, 'trainer_assignments'), {
            trainerId: user.uid,
            trainerName: user.displayName || user.email,
            athleteId: athleteUid,
            plan: assignedPlan,
            note,
            assignedAt: new Date().toISOString(),
            status: 'pending'
        });
        toast('PLAN ASSIGNED! ATHLETE WILL BE NOTIFIED.', 'success');
        el('assign-note').value = '';
    } catch(e) { console.error(e); toast('ERROR ASSIGNING PLAN', 'error'); }
}

// ─── TRAINER: PROFILE ─────────────────────────────────────────────────────────
async function renderTrainerProfilePane() {
    const container = el('trainer-profile-pane');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-secondary);">LOADING...</p>';
    try {
        const snap = await getDoc(doc(db, 'users', getUser().uid));
        const profile = snap.data()?.trainerProfile || {};
        const specialties = ['STRENGTH', 'HYPERTROPHY', 'POWERLIFTING', 'CARDIO', 'WEIGHT LOSS',
            'SPORTS PERFORMANCE', 'REHABILITATION', 'MOBILITY', 'BODYBUILDING', 'CROSSFIT'];
        const mySpecs = profile.specialties || [];

        container.innerHTML = `
            <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; color:var(--text-secondary); letter-spacing:1px; margin-bottom:16px;">YOUR TRAINER PROFILE</div>
            <div class="form-group">
                <label class="form-label">BIO</label>
                <textarea class="form-input" id="trainer-bio" rows="4" placeholder="TELL ATHLETES ABOUT YOUR COACHING STYLE AND EXPERIENCE..." maxlength="500">${esc(profile.bio || '')}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">LOCATION (OPTIONAL)</label>
                <input type="text" class="form-input" id="trainer-location" placeholder="E.G. AUSTIN, TX" value="${esc(profile.location || '')}">
            </div>
            <div class="form-group">
                <label class="form-label">SPECIALTIES</label>
                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
                    ${specialties.map(s => `
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; font-family:'Barlow Condensed',sans-serif; font-weight:600; letter-spacing:1px;">
                            <input type="checkbox" value="${s}" ${mySpecs.includes(s) ? 'checked' : ''}> ${s}
                        </label>`).join('')}
                </div>
            </div>
            <div class="form-group">
                <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                    <input type="checkbox" id="trainer-listed" ${profile.listedInDirectory ? 'checked' : ''}>
                    <span style="font-family:'Barlow Condensed',sans-serif; font-weight:700; letter-spacing:1px;">LIST ME IN THE TRAINER DIRECTORY</span>
                </label>
                <div style="font-size:12px; color:var(--text-secondary); margin-top:4px; padding-left:26px;">ATHLETES CAN FIND AND REQUEST TO CONNECT WITH YOU</div>
            </div>
            <div class="form-group">
                <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                    <input type="checkbox" id="trainer-accepting" ${profile.acceptingClients !== false ? 'checked' : ''}>
                    <span style="font-family:'Barlow Condensed',sans-serif; font-weight:700; letter-spacing:1px;">ACCEPTING NEW CLIENTS</span>
                </label>
            </div>
            <div style="margin-bottom:20px;">
                <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; letter-spacing:1px; margin-bottom:8px; color:var(--text-secondary);">REFERRAL LINK</div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <code style="flex:1; background:var(--bg-hover); padding:8px 12px; border-radius:6px; font-size:12px; overflow:auto; word-break:break-all;" id="referral-link-display">https://ironsynciq.com/?ref=${getUser().uid}</code>
                    <button class="btn btn-small btn-secondary" onclick="copyReferralLink()">COPY</button>
                </div>
            </div>
            <button class="btn" onclick="saveTrainerProfile()">SAVE PROFILE</button>`;
    } catch(e) {
        container.innerHTML = `<p style="color:var(--error);">ERROR LOADING PROFILE</p>`;
    }
}

async function saveTrainerProfile() {
    const bio = el('trainer-bio')?.value.trim() || '';
    const location = el('trainer-location')?.value.trim() || '';
    const listed = el('trainer-listed')?.checked || false;
    const accepting = el('trainer-accepting')?.checked !== false;
    const specialties = [...document.querySelectorAll('#trainer-profile-pane input[type=checkbox][value]')]
        .filter(cb => cb.checked).map(cb => cb.value);
    try {
        await updateDoc(doc(db, 'users', getUser().uid), {
            trainerProfile: { bio, location, specialties, listedInDirectory: listed, acceptingClients: accepting }
        });
        toast('PROFILE SAVED!', 'success');
    } catch(e) { toast('ERROR SAVING', 'error'); }
}

function copyReferralLink() {
    const uid = getUser()?.uid;
    if (!uid) return;
    const link = `https://ironsynciq.com/?ref=${uid}`;
    navigator.clipboard.writeText(link).then(() => toast('REFERRAL LINK COPIED! 📋', 'success'))
        .catch(() => toast('COPY FAILED — LINK: ' + link, 'error'));
}

// ─── TRAINER: AUTO-INIT PROFILE ───────────────────────────────────────────────
async function ensureTrainerProfile() {
    const user = getUser();
    if (!user) return;
    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.data() || {};
        if (!data.trainerProfile) {
            await updateDoc(doc(db, 'users', user.uid), {
                trainerProfile: { bio: '', specialties: [], location: '', listedInDirectory: true, acceptingClients: true }
            });
        }
    } catch(e) { console.error('ensureTrainerProfile error:', e); }
}

// ─── TRAINER: ATHLETE INVITE SEARCH ───────────────────────────────────────────
function showAthleteInviteSearch() {
    const container = el('coaching-panel');
    if (!container) return;
    container.innerHTML = `
        <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; color:var(--text-secondary); letter-spacing:1px; margin-bottom:14px;">INVITE AN ATHLETE</div>
        <div style="display:flex; gap:8px; margin-bottom:16px;">
            <input type="text" class="form-input" id="athlete-search-input" placeholder="SEARCH BY USERNAME..." style="flex:1;"
                onkeydown="if(event.key==='Enter') doAthleteSearch()">
            <button class="btn btn-small" onclick="doAthleteSearch()">SEARCH</button>
        </div>
        <div id="athlete-search-results"></div>`;
}

async function doAthleteSearch() {
    const q = el('athlete-search-input')?.value.trim();
    if (!q || q.length < 2) { toast('ENTER AT LEAST 2 CHARACTERS', 'error'); return; }
    const results = el('athlete-search-results');
    if (!results) return;
    results.innerHTML = '<p style="color:var(--text-secondary); font-size:13px;">SEARCHING...</p>';
    try {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'athlete')));
        const ql = q.toLowerCase();
        const matches = snap.docs
            .map(d => ({ uid: d.id, ...d.data() }))
            .filter(u => u.uid !== getUser().uid)
            .filter(u =>
                (u.displayName || '').toLowerCase().includes(ql) ||
                (u.username || '').toLowerCase().includes(ql));

        if (matches.length === 0) {
            results.innerHTML = '<p style="color:var(--text-secondary); font-size:13px;">NO ATHLETES FOUND WITH THAT USERNAME</p>';
            return;
        }
        results.innerHTML = matches.map(a => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;
                        background:var(--bg-hover); border:1px solid var(--border); border-radius:8px;
                        padding:12px; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="trainer-athlete-avatar">${(a.displayName || 'A').charAt(0).toUpperCase()}</div>
                    <div style="font-weight:700; font-family:'Barlow Condensed',sans-serif; font-size:17px;">${esc(a.displayName || a.email || 'ATHLETE')}</div>
                </div>
                <button class="btn btn-small" onclick="sendAthleteInvite('${a.uid}','${esc(a.displayName || a.email || 'Athlete')}')">INVITE</button>
            </div>`).join('');
    } catch(e) {
        results.innerHTML = '<p style="color:var(--error); font-size:13px;">SEARCH FAILED</p>';
        console.error(e);
    }
}

async function sendAthleteInvite(athleteUid, athleteDisplayName) {
    const user = getUser();
    try {
        const athleteDoc = await getDoc(doc(db, 'users', athleteUid));
        if (athleteDoc.data()?.trainerId === user.uid) {
            toast('ALREADY LINKED WITH THIS ATHLETE', 'error'); return;
        }
        const existing = await getDocs(query(collection(db, 'connection_requests'),
            where('athleteId', '==', athleteUid),
            where('trainerId', '==', user.uid),
            where('status', '==', 'pending')));
        if (!existing.empty) { toast('INVITE ALREADY SENT', 'error'); return; }

        await addDoc(collection(db, 'connection_requests'), {
            athleteId: athleteUid,
            athleteDisplayName: athleteDisplayName,
            trainerId: user.uid,
            trainerDisplayName: user.displayName || user.email,
            status: 'pending',
            initiatedBy: 'trainer',
            createdAt: new Date().toISOString()
        });
        toast(`INVITE SENT TO ${athleteDisplayName.toUpperCase()}!`, 'success');
        doAthleteSearch();
    } catch(e) { toast('ERROR SENDING INVITE', 'error'); console.error(e); }
}

// ─── ATHLETE: ACCEPT / DECLINE TRAINER INVITE ─────────────────────────────────
async function acceptTrainerInvite(requestId, trainerId, trainerName) {
    try {
        await updateDoc(doc(db, 'connection_requests', requestId), { status: 'accepted' });
        await updateDoc(doc(db, 'users', getUser().uid), { trainerId, trainerDisplayName: trainerName });
        window.userTrainerId = trainerId;
        toast(`CONNECTED WITH ${trainerName.toUpperCase()}!`, 'success');
        loadCoachingPanel();
    } catch(e) { toast('ERROR ACCEPTING INVITE', 'error'); }
}

async function declineTrainerInvite(requestId) {
    try {
        await updateDoc(doc(db, 'connection_requests', requestId), { status: 'declined' });
        toast('INVITE DECLINED');
        loadCoachingPanel();
    } catch(e) { toast('ERROR DECLINING INVITE', 'error'); }
}

// ─── COACHING PANEL ────────────────────────────────────────────────────────────
export async function loadCoachingPanel() {
    const container = el('coaching-panel');
    if (!container) return;
    const user = getUser();
    if (!user) return;

    // Trainers get athlete invite search instead of the athlete coaching panel
    if (window.userRole === 'trainer') {
        showAthleteInviteSearch();
        return;
    }

    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.data() || {};
        const trainerId = data.trainerId;
        const trainerName = data.trainerDisplayName;

        // Count unread assignments
        const assignSnap = await getDocs(query(collection(db, 'trainer_assignments'),
            where('athleteId', '==', user.uid), where('status', '==', 'pending')));
        const pendingCount = assignSnap.size;
        updateAssignmentsBadge(pendingCount);

        if (trainerId) {
            container.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
                    <div>
                        <div style="font-size:12px; color:var(--text-secondary); letter-spacing:1px; font-family:'Barlow Condensed',sans-serif; font-weight:700;">YOUR TRAINER</div>
                        <div style="font-size:20px; font-weight:800; font-family:'Barlow Condensed',sans-serif;">${esc(trainerName || 'Trainer')}</div>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn btn-small" onclick="openMessageWith('${trainerId}','${esc(trainerName || 'Trainer')}')">💬 MESSAGE</button>
                        <button class="btn btn-small btn-secondary" onclick="unlinkFromTrainer()">UNLINK</button>
                    </div>
                </div>
                ${pendingCount > 0 ? `
                <div style="padding:12px; background:rgba(var(--primary-rgb,255,255,255),0.06); border:1px solid var(--primary); border-radius:8px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-family:'Barlow Condensed',sans-serif; font-weight:700;">📋 ${pendingCount} PLAN ASSIGNMENT${pendingCount>1?'S':''} WAITING</span>
                    <button class="btn btn-small" onclick="showAssignments()">REVIEW</button>
                </div>` : ''}`;
        } else {
            // Check for pending trainer-initiated invites
            const inviteSnap = await getDocs(query(collection(db, 'connection_requests'),
                where('athleteId', '==', user.uid),
                where('initiatedBy', '==', 'trainer'),
                where('status', '==', 'pending')));
            const invites = inviteSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            container.innerHTML = `
                ${invites.length > 0 ? `
                <div style="margin-bottom:20px;">
                    <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:13px; color:var(--text-secondary); letter-spacing:1px; margin-bottom:10px;">TRAINER INVITATIONS</div>
                    ${invites.map(inv => `
                        <div style="background:rgba(var(--primary-rgb,255,255,255),0.06); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                            <div>
                                <div style="font-weight:700; font-family:'Barlow Condensed',sans-serif; font-size:16px;">${esc(inv.trainerDisplayName || 'TRAINER')}</div>
                                <div style="font-size:12px; color:var(--text-secondary);">WANTS TO COACH YOU</div>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-small" onclick="acceptTrainerInvite('${inv.id}','${inv.trainerId}','${esc(inv.trainerDisplayName || 'Trainer')}')">ACCEPT</button>
                                <button class="btn btn-small btn-secondary" onclick="declineTrainerInvite('${inv.id}')">DECLINE</button>
                            </div>
                        </div>`).join('')}
                </div>` : ''}
                <div style="text-align:center; padding:20px 0;">
                    <div style="font-size:36px; margin-bottom:8px;">🏋️</div>
                    <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:18px; margin-bottom:4px;">NO TRAINER LINKED</div>
                    <div style="color:var(--text-secondary); font-size:13px; margin-bottom:16px;">FIND A TRAINER TO GET PERSONALISED COACHING</div>
                    <button class="btn" onclick="showTrainerDirectory()">FIND A TRAINER</button>
                </div>`;
        }
    } catch(e) { console.error('loadCoachingPanel error:', e); }
}

function updateAssignmentsBadge(count) {
    const badge = el('assignments-badge');
    if (badge) { badge.textContent = count || ''; badge.style.display = count ? '' : 'none'; }
}

async function unlinkFromTrainer() {
    if (!confirm('UNLINK FROM YOUR TRAINER? YOU WILL KEEP ALL PLANS AND HISTORY.')) return;
    try {
        await updateDoc(doc(db, 'users', getUser().uid), { trainerId: null, trainerDisplayName: null });
        window.userTrainerId = null;
        toast('UNLINKED FROM TRAINER');
        loadCoachingPanel();
    } catch(e) { toast('ERROR UNLINKING', 'error'); }
}

// ─── ATHLETE: TRAINER DIRECTORY ───────────────────────────────────────────────
async function showTrainerDirectory() {
    const container = el('coaching-panel');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-secondary);">LOADING TRAINERS...</p>';
    try {
        const q = query(collection(db, 'users'), where('role', '==', 'trainer'));
        const snap = await getDocs(q);
        const trainers = snap.docs
            .map(d => ({ uid: d.id, ...d.data() }))
            // Show trainers who are listed, or who have no trainerProfile yet (migrated accounts)
            .filter(t => t.trainerProfile ? t.trainerProfile.listedInDirectory : true);

        if (trainers.length === 0) {
            container.innerHTML = `
                <button class="btn btn-secondary btn-small" onclick="loadCoachingPanel()" style="margin-bottom:16px;">← BACK</button>
                <div class="empty-state"><div class="empty-state-icon">🔍</div><p>NO TRAINERS IN DIRECTORY YET</p></div>`;
            return;
        }

        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                <button class="btn btn-secondary btn-small" onclick="loadCoachingPanel()">← BACK</button>
                <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:18px;">TRAINER DIRECTORY</div>
            </div>
            <input type="text" class="form-input" id="trainer-search" placeholder="SEARCH BY NAME..." style="margin-bottom:16px;" oninput="filterTrainers()">
            <div id="trainer-directory-list">
                ${renderTrainerCards(trainers)}
            </div>`;
        container._allTrainers = trainers;
    } catch(e) { container.innerHTML = '<p style="color:var(--error);">ERROR LOADING DIRECTORY</p>'; }
}

function renderTrainerCards(trainers) {
    return trainers.map(t => {
        const p = t.trainerProfile || {};
        return `
            <div class="trainer-athlete-card" style="flex-direction:column; align-items:flex-start; gap:10px;">
                <div style="display:flex; align-items:center; gap:12px; width:100%;">
                    <div class="trainer-athlete-avatar">${(t.displayName||'T').charAt(0).toUpperCase()}</div>
                    <div style="flex:1;">
                        <div style="font-weight:700; font-family:'Barlow Condensed',sans-serif; font-size:17px;">${esc(t.displayName)}</div>
                        ${p.location ? `<div style="color:var(--text-secondary); font-size:12px;">📍 ${esc(p.location)}</div>` : ''}
                        <div style="font-size:12px; color:${p.acceptingClients ? 'var(--success)' : 'var(--error)'}; font-weight:700; margin-top:2px;">${p.acceptingClients ? '✓ ACCEPTING CLIENTS' : '✗ NOT ACCEPTING'}</div>
                    </div>
                </div>
                ${p.bio ? `<div style="font-size:13px; color:var(--text-secondary);">${esc(p.bio)}</div>` : ''}
                ${p.specialties?.length ? `<div style="display:flex; flex-wrap:wrap; gap:6px;">${p.specialties.map(s=>`<span style="background:var(--bg-hover); padding:2px 8px; border-radius:12px; font-size:11px; font-family:'Barlow Condensed',sans-serif; font-weight:700; letter-spacing:1px;">${s}</span>`).join('')}</div>` : ''}
                ${p.acceptingClients ? `<button class="btn btn-small" onclick="requestTrainerConnection('${t.uid}','${esc(t.displayName)}')">REQUEST CONNECTION</button>` : ''}
            </div>`;
    }).join('');
}

function filterTrainers() {
    const q = el('trainer-search')?.value.toLowerCase() || '';
    const list = el('trainer-directory-list');
    const trainers = document.getElementById('coaching-panel')?._allTrainers || [];
    if (!list) return;
    const filtered = trainers.filter(t =>
        (t.displayName||'').toLowerCase().includes(q) ||
        (t.trainerProfile?.specialties||[]).some(s => s.toLowerCase().includes(q)) ||
        (t.trainerProfile?.bio||'').toLowerCase().includes(q));
    list.innerHTML = renderTrainerCards(filtered);
}

async function requestTrainerConnection(trainerId, trainerName) {
    const user = getUser();
    if (!user) return;
    try {
        // Check for existing request
        const existing = await getDocs(query(collection(db, 'connection_requests'),
            where('athleteId', '==', user.uid), where('trainerId', '==', trainerId), where('status', '==', 'pending')));
        if (!existing.empty) { toast('REQUEST ALREADY SENT', 'error'); return; }
        await addDoc(collection(db, 'connection_requests'), {
            athleteId: user.uid,
            athleteDisplayName: user.displayName || user.email,
            trainerId,
            status: 'pending',
            createdAt: new Date().toISOString()
        });
        toast(`CONNECTION REQUEST SENT TO ${trainerName.toUpperCase()}!`, 'success');
    } catch(e) { toast('ERROR SENDING REQUEST', 'error'); console.error(e); }
}

// ─── ATHLETE: PLAN ASSIGNMENTS ─────────────────────────────────────────────────
function listenForAssignments() {
    const uid = getUser()?.uid;
    if (!uid) return;
    if (unsubscribeAssignments) unsubscribeAssignments();
    const q = query(collection(db, 'trainer_assignments'),
        where('athleteId', '==', uid), where('status', '==', 'pending'));
    unsubscribeAssignments = onSnapshot(q, snap => {
        myAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateAssignmentsBadge(myAssignments.length);
    });
}

async function showAssignments() {
    const container = el('coaching-panel');
    if (!container) return;
    if (myAssignments.length === 0) { toast('NO PENDING ASSIGNMENTS'); return; }
    container.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            <button class="btn btn-secondary btn-small" onclick="loadCoachingPanel()">← BACK</button>
            <div style="font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:18px;">PLAN ASSIGNMENTS</div>
        </div>
        ${myAssignments.map(a => `
            <div class="trainer-athlete-card" style="flex-direction:column; align-items:flex-start; gap:10px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%; gap:8px; flex-wrap:wrap;">
                    <div>
                        <div style="font-weight:700; font-family:'Barlow Condensed',sans-serif; font-size:17px;">📋 ${esc(a.plan?.name)}</div>
                        <div style="color:var(--text-secondary); font-size:12px;">FROM ${esc(a.trainerName)} · ${formatDate(a.assignedAt)}</div>
                    </div>
                </div>
                ${a.note ? `<div style="font-size:13px; color:var(--text-secondary); font-style:italic;">"${esc(a.note)}"</div>` : ''}
                <div style="font-size:12px; color:var(--text-secondary);">${(a.plan?.days||[]).length} DAYS · ${(a.plan?.days||[]).reduce((n,d)=>n+(d.exercises||[]).length,0)} EXERCISES TOTAL</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-small" onclick="acceptAssignment('${a.id}')">✓ ACCEPT PLAN</button>
                    <button class="btn btn-secondary btn-small" onclick="declineAssignment('${a.id}')">DECLINE</button>
                </div>
            </div>`).join('')}`;
}

async function acceptAssignment(assignmentId) {
    const assignment = myAssignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    try {
        await updateDoc(doc(db, 'trainer_assignments', assignmentId), { status: 'accepted' });
        if (window.acceptTrainerPlan) window.acceptTrainerPlan(assignment.plan);
        toast('PLAN ADDED TO YOUR PLANS!', 'success');
        loadCoachingPanel();
    } catch(e) { toast('ERROR ACCEPTING PLAN', 'error'); }
}

async function declineAssignment(assignmentId) {
    try {
        await updateDoc(doc(db, 'trainer_assignments', assignmentId), { status: 'declined' });
        toast('PLAN DECLINED');
        loadCoachingPanel();
    } catch(e) { toast('ERROR', 'error'); }
}

// ─── Window Exports ───────────────────────────────────────────────────────────
window.loadTrainerView         = loadTrainerView;
window.switchTrainerPane       = switchTrainerPane;
window.initTrainer             = initTrainer;
window.loadCoachingPanel       = loadCoachingPanel;
window.viewAthleteDetail       = viewAthleteDetail;
window.renderAthletesList      = renderAthletesList;
window.acceptConnectionRequest = acceptConnectionRequest;
window.declineConnectionRequest= declineConnectionRequest;
window.requestTrainerConnection= requestTrainerConnection;
window.unlinkFromTrainer       = unlinkFromTrainer;
window.acceptAssignment        = acceptAssignment;
window.declineAssignment       = declineAssignment;
window.assignPlanToAthlete     = assignPlanToAthlete;
window.saveTrainerProfile      = saveTrainerProfile;
window.copyReferralLink        = copyReferralLink;
window.showTrainerDirectory    = showTrainerDirectory;
window.filterTrainers          = filterTrainers;
window.showAssignments         = showAssignments;
window.submitTrainerComment    = submitTrainerComment;
window.doAthleteSearch         = doAthleteSearch;
window.sendAthleteInvite       = sendAthleteInvite;
window.acceptTrainerInvite     = acceptTrainerInvite;
window.declineTrainerInvite    = declineTrainerInvite;
window.openAthleteWorkoutDetail= openAthleteWorkoutDetail;
window.openMessageWith         = (uid, name) => {
    window.switchView('messages');
    if (window.startMessageWithUser) window.startMessageWithUser(uid, name);
};
