let workoutPlans = [];
let workoutHistory = [];
let currentWorkout = null;
let restInterval = null;
let elapsedInterval = null;
let selectedPlanId = null;
let exerciseLibrary = [
    'Barbell Bench Press', 'Incline Dumbbell Press', 'Chest Fly', 'Push-ups',
    'Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Leg Extension',
    'Barbell Row', 'Pull-ups', 'Lat Pulldown', 'Dumbbell Row', 'Face Pulls',
    'Overhead Press', 'Lateral Raises', 'Front Raises', 'Shrugs',
    'Barbell Curl', 'Hammer Curl', 'Tricep Pushdown', 'Skull Crushers', 'Dips',
    'Plank', 'Russian Twists', 'Hanging Leg Raises', 'Deadlift', 'Hip Thrust'
];

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

function save() {
    localStorage.setItem('irontrack_plans', JSON.stringify(workoutPlans));
    localStorage.setItem('irontrack_history', JSON.stringify(workoutHistory));
    localStorage.setItem('irontrack_exercises', JSON.stringify(exerciseLibrary));
    localStorage.setItem('irontrack_selected_plan', selectedPlanId);
}

function load() {
    const plans = localStorage.getItem('irontrack_plans');
    const history = localStorage.getItem('irontrack_history');
    const exercises = localStorage.getItem('irontrack_exercises');
    const selected = localStorage.getItem('irontrack_selected_plan');
    
    if (plans) workoutPlans = JSON.parse(plans);
    if (history) workoutHistory = JSON.parse(history);
    if (exercises) exerciseLibrary = JSON.parse(exercises);
    if (selected) selectedPlanId = parseInt(selected);
}

function seedDefaults() {
    if (workoutPlans.length > 0) return;
    workoutPlans = [
        {
            id: 1,
            name: 'Push/Pull/Legs',
            description: '3-Day Split Program',
            days: [
                {
                    dayName: 'Push Day',
                    exercises: [
                        { name: 'Barbell Bench Press', sets: 4, targetReps: 8 },
                        { name: 'Incline Dumbbell Press', sets: 3, targetReps: 10 },
                        { name: 'Overhead Press', sets: 3, targetReps: 8 },
                        { name: 'Lateral Raises', sets: 3, targetReps: 15 },
                        { name: 'Tricep Pushdown', sets: 3, targetReps: 12 }
                    ]
                },
                {
                    dayName: 'Pull Day',
                    exercises: [
                        { name: 'Pull-ups', sets: 4, targetReps: 8 },
                        { name: 'Barbell Row', sets: 4, targetReps: 8 },
                        { name: 'Lat Pulldown', sets: 3, targetReps: 10 },
                        { name: 'Face Pulls', sets: 3, targetReps: 15 },
                        { name: 'Barbell Curl', sets: 3, targetReps: 10 }
                    ]
                },
                {
                    dayName: 'Leg Day',
                    exercises: [
                        { name: 'Barbell Squat', sets: 4, targetReps: 8 },
                        { name: 'Romanian Deadlift', sets: 4, targetReps: 8 },
                        { name: 'Leg Press', sets: 3, targetReps: 12 },
                        { name: 'Leg Curl', sets: 3, targetReps: 12 },
                        { name: 'Hip Thrust', sets: 3, targetReps: 12 }
                    ]
                }
            ]
        },
        {
            id: 2,
            name: 'Upper/Lower',
            description: '4-Day Split',
            days: [
                {
                    dayName: 'Upper A',
                    exercises: [
                        { name: 'Barbell Bench Press', sets: 4, targetReps: 6 },
                        { name: 'Barbell Row', sets: 4, targetReps: 6 },
                        { name: 'Overhead Press', sets: 3, targetReps: 8 },
                        { name: 'Barbell Curl', sets: 3, targetReps: 10 }
                    ]
                },
                {
                    dayName: 'Lower A',
                    exercises: [
                        { name: 'Barbell Squat', sets: 4, targetReps: 6 },
                        { name: 'Romanian Deadlift', sets: 3, targetReps: 8 },
                        { name: 'Leg Extension', sets: 3, targetReps: 12 },
                        { name: 'Leg Curl', sets: 3, targetReps: 12 }
                    ]
                },
                {
                    dayName: 'Upper B',
                    exercises: [
                        { name: 'Incline Dumbbell Press', sets: 4, targetReps: 8 },
                        { name: 'Pull-ups', sets: 4, targetReps: 8 },
                        { name: 'Lateral Raises', sets: 3, targetReps: 15 },
                        { name: 'Tricep Pushdown', sets: 3, targetReps: 12 }
                    ]
                },
                {
                    dayName: 'Lower B',
                    exercises: [
                        { name: 'Deadlift', sets: 3, targetReps: 5 },
                        { name: 'Leg Press', sets: 3, targetReps: 10 },
                        { name: 'Hip Thrust', sets: 3, targetReps: 12 }
                    ]
                }
            ]
        }
    ];
    save();
}

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

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) targetView.classList.add('active');
    const targetTab = document.querySelector(`[data-view="${viewName}"]`);
    if (targetTab) targetTab.classList.add('active');
    if (viewName === 'plans') renderPlans();
    if (viewName === 'progress') renderProgress();
    if (viewName === 'workout') updateWorkoutHero();
}

function updateWorkoutHero() {
    const heroEl = document.getElementById('workout-hero');
    const titleEl = document.getElementById('today-workout-title');
    const descEl = document.getElementById('today-workout-desc');
    const chooseBtnEl = document.getElementById('choose-plan-btn');
    const lastWorkoutEl = document.getElementById('last-workout-info');
    
    if (!selectedPlanId) {
        titleEl.textContent = 'No Plan Selected';
        descEl.textContent = 'Choose a workout plan to get started';
        chooseBtnEl.style.display = 'inline-block';
        if (lastWorkoutEl) lastWorkoutEl.style.display = 'none';
        return;
    }
    
    const plan = workoutPlans.find(p => p.id === selectedPlanId);
    if (!plan) {
        selectedPlanId = null;
        save();
        updateWorkoutHero();
        return;
    }
    
    chooseBtnEl.style.display = 'none';
    
    const nextWorkout = getNextWorkoutDay(selectedPlanId);
    if (nextWorkout) {
        titleEl.textContent = `${plan.name} - ${nextWorkout.day.dayName}`;
        descEl.textContent = `${nextWorkout.day.exercises.length} exercises · ${nextWorkout.day.exercises.reduce((s, e) => s + e.sets, 0)} sets`;
    }
    
    const lastWorkout = getLastCompletedWorkout();
    if (lastWorkout && lastWorkoutEl) {
        lastWorkoutEl.style.display = 'block';
        const date = new Date(lastWorkout.date);
        const daysAgo = Math.floor((Date.now() - date.getTime()) / 86400000);
        const timeStr = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
        lastWorkoutEl.innerHTML = `
            <div style="font-size: 14px; color: var(--text-secondary); margin-top: 12px;">
                <strong>Last Workout:</strong> ${escapeHtml(lastWorkout.planName)} - ${escapeHtml(lastWorkout.dayName)} · ${timeStr}
            </div>
        `;
    } else if (lastWorkoutEl) {
        lastWorkoutEl.style.display = 'none';
    }
}

function renderPlans() {
    const grid = document.getElementById('plans-grid');
    if (workoutPlans.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No plans yet. Create your first!</p></div>';
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
                <span>📅 ${plan.days.length} day${plan.days.length > 1 ? 's' : ''}</span>
                <span>📋 ${totalExercises} exercises</span>
                <span>💪 ${totalSets} sets</span>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;">
                ${!isSelected ? `<button class="btn btn-small select-plan-btn" data-id="${plan.id}">Select</button>` : 
                  `<button class="btn btn-small" disabled style="opacity: 0.6;">✓ Selected</button>`}
                <button class="btn btn-secondary btn-small edit-plan-btn" data-index="${index}">Edit</button>
                <button class="btn-remove btn-small delete-plan-btn" data-index="${index}" style="margin-left: auto;">Delete</button>
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
    save();
    updateWorkoutHero();
    switchView('workout');
}

function deletePlan(index) {
    if (!confirm(`Delete "${workoutPlans[index].name}"?`)) return;
    const planId = workoutPlans[index].id;
    if (selectedPlanId === planId) {
        selectedPlanId = null;
    }
    workoutPlans.splice(index, 1);
    save();
    renderPlans();
    updateWorkoutHero();
}

function startWorkout() {
    if (!selectedPlanId) {
        alert('Please select a workout plan first.');
        switchView('plans');
        return;
    }
    
    const plan = workoutPlans.find(p => p.id === selectedPlanId);
    if (!plan) {
        alert('Selected plan not found.');
        return;
    }
    
    const nextWorkout = getNextWorkoutDay(selectedPlanId);
    if (!nextWorkout) {
        alert('No workout day found in plan.');
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
            sets: Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', completed: false }))
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
        document.getElementById('workout-elapsed').textContent = `⏱ ${mins}:${secs.toString().padStart(2, '0')} elapsed`;
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
                    ${lastPerf ? `<div class="last-performance">Last: ${escapeHtml(lastPerf)}</div>` : '<div class="last-performance">First time!</div>'}
                </div>
                <div class="sets-grid">
                    ${ex.sets.map((set, setIndex) => `
                        <div class="set-box ${set.completed ? 'completed' : ''}">
                            <div class="set-number">Set ${setIndex + 1}</div>
                            <div class="set-input-group">
                                <input type="number" inputmode="decimal" class="set-input" placeholder="lbs"
                                    value="${set.weight}" data-ex="${exIndex}" data-set="${setIndex}" data-field="weight"
                                    ${set.completed ? 'disabled' : ''}>
                                <input type="number" inputmode="numeric" class="set-input" placeholder="reps"
                                    value="${set.reps}" data-ex="${exIndex}" data-set="${setIndex}" data-field="reps"
                                    ${set.completed ? 'disabled' : ''}>
                            </div>
                            ${set.completed ?
                                `<div style="color: var(--success); margin-top: 8px; font-weight: 600; font-size: 13px;">✓ Done - ${set.weight}lbs × ${set.reps}</div>` :
                                `<button class="complete-set-btn" data-ex="${exIndex}" data-set="${setIndex}">✓ Complete</button>`
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
    if (!set.weight || !set.reps) {
        const lastSets = getLastRawSets(currentWorkout.exercises[exIndex].name);
        if (lastSets && lastSets[setIndex]) {
            if (!set.weight) set.weight = lastSets[setIndex].weight;
            if (!set.reps) set.reps = lastSets[setIndex].reps;
        }
    }
    if (!set.weight || !set.reps) {
        alert('Please enter weight and reps first.');
        return;
    }
    set.completed = true;
    renderActiveWorkout();
    startRestTimer(120);
}

function finishWorkout() {
    const completedSets = currentWorkout.exercises.flatMap(e => e.sets.filter(s => s.completed));
    if (completedSets.length === 0) {
        if (!confirm('No sets completed. Finish anyway?')) return;
    } else {
        if (!confirm('Finish workout?')) return;
    }
    clearInterval(restInterval);
    clearInterval(elapsedInterval);
    currentWorkout.endTime = new Date().toISOString();
    workoutHistory.unshift(currentWorkout);
    save();
    currentWorkout = null;
    document.getElementById('workout-hero').style.display = 'block';
    document.getElementById('active-workout').style.display = 'none';
    document.getElementById('rest-timer').classList.remove('active');
    updateWorkoutHero();
    showToast('Workout saved! 💪');
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

function startRestTimer(seconds) {
    clearInterval(restInterval);
    const timerEl = document.getElementById('rest-timer');
    const displayEl = document.getElementById('timer-display');
    timerEl.classList.add('active');
    let remaining = seconds;
    const updateDisplay = () => {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        displayEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    updateDisplay();
    restInterval = setInterval(() => {
        remaining--;
        updateDisplay();
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

function showCreatePlan() {
    document.getElementById('modal-title').textContent = 'Create Workout Plan';
    document.getElementById('edit-plan-id').value = '';
    document.getElementById('plan-name').value = '';
    document.getElementById('plan-description').value = '';
    document.getElementById('days-builder').innerHTML = '';
    addDayToBuilder();
    document.getElementById('create-plan-modal').classList.add('active');
}

function editPlan(index) {
    const plan = workoutPlans[index];
    document.getElementById('modal-title').textContent = 'Edit Plan';
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
                   placeholder="Day name (e.g., Push Day)" 
                   value="${prefillDay ? escapeHtml(prefillDay.dayName) : ''}"
                   style="flex: 1; margin-right: 12px;">
            <button class="btn-remove remove-day-btn">Remove Day</button>
        </div>
        <div class="exercise-builder" data-day="${dayIndex}"></div>
        <button class="btn btn-secondary btn-small add-exercise-to-day-btn" data-day="${dayIndex}" style="margin-top: 8px;">+ Add Exercise</button>
    `;
    
    builder.appendChild(dayContainer);
    
    dayContainer.querySelector('.remove-day-btn').addEventListener('click', () => {
        if (builder.children.length === 1) {
            alert('Plan must have at least one day');
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
                       placeholder="Exercise name" 
                       list="exercise-datalist-${dayIndex}-${exIndex}"
                       value="${prefill ? escapeHtml(prefill.name) : ''}" 
                       style="flex: 1;">
                <button class="btn btn-secondary btn-small create-exercise-btn" 
                        data-day="${dayIndex}" data-ex="${exIndex}" 
                        style="white-space: nowrap;">New Exercise</button>
            </div>
            <datalist id="exercise-datalist-${dayIndex}-${exIndex}">
                ${exerciseLibrary.map(ex => `<option value="${escapeHtml(ex)}">`).join('')}
            </datalist>
            <div style="display: flex; gap: 8px;">
                <input type="number" class="form-input" 
                       data-day="${dayIndex}" data-ex="${exIndex}" data-field="sets"
                       placeholder="Sets" value="${prefill ? prefill.sets : ''}" style="width: 80px;">
                <input type="number" class="form-input" 
                       data-day="${dayIndex}" data-ex="${exIndex}" data-field="targetReps"
                       placeholder="Target reps" value="${prefill ? prefill.targetReps : ''}" style="flex: 1;">
            </div>
        </div>
        <button class="btn-remove remove-exercise-btn">✕</button>
    `;
    
    builder.appendChild(item);
    
    item.querySelector('.remove-exercise-btn').addEventListener('click', () => item.remove());
    
    item.querySelector('.create-exercise-btn').addEventListener('click', () => {
        const input = item.querySelector('.exercise-name-input');
        const exerciseName = input.value.trim();
        if (!exerciseName) {
            alert('Enter an exercise name first');
            return;
        }
        if (!exerciseLibrary.includes(exerciseName)) {
            exerciseLibrary.push(exerciseName);
            exerciseLibrary.sort();
            save();
            showToast(`"${exerciseName}" added to library!`);
            
            document.querySelectorAll('datalist').forEach(dl => {
                dl.innerHTML = exerciseLibrary.map(ex => `<option value="${escapeHtml(ex)}">`).join('');
            });
        } else {
            showToast('Exercise already in library');
        }
    });
}

function savePlan() {
    const name = document.getElementById('plan-name').value.trim();
    const description = document.getElementById('plan-description').value.trim();
    
    if (!name) {
        alert('Plan name is required.');
        return;
    }
    
    const daysBuilder = document.getElementById('days-builder');
    const days = [];
    
    daysBuilder.querySelectorAll('.day-container').forEach((dayContainer, dayIdx) => {
        const dayName = dayContainer.querySelector('.day-name-input').value.trim();
        if (!dayName) {
            alert(`Day ${dayIdx + 1} needs a name`);
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
        alert('Add at least one day with exercises.');
        return;
    }
    
    const editIndex = document.getElementById('edit-plan-id').value;
    
    if (editIndex !== '') {
        const index = parseInt(editIndex);
        workoutPlans[index] = { ...workoutPlans[index], name, description, days };
    } else {
        workoutPlans.push({ id: Date.now(), name, description, days });
    }
    
    save();
    closeModal();
    renderPlans();
    updateWorkoutHero();
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function renderProgress() {
    const total = workoutHistory.length;
    const volume = workoutHistory.reduce((sum, w) =>
        sum + w.exercises.reduce((s2, ex) =>
            s2 + ex.sets.filter(s => s.completed).reduce((s3, s) =>
                s3 + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0), 0);
    const weekAgo = Date.now() - 7 * 86400000;
    const weekly = workoutHistory.filter(w => new Date(w.date) > weekAgo).length;
    document.getElementById('total-workouts').textContent = total;
    document.getElementById('total-volume').textContent = volume >= 1000 ? (volume / 1000).toFixed(1) + 'k' : Math.round(volume);
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
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏆</div><p>Complete workouts to set PRs</p></div>';
        return;
    }
    el.innerHTML = [...bests.entries()].map(([name, data]) => `
        <div class="pr-row">
            <span class="pr-exercise">${escapeHtml(name)}</span>
            <span class="pr-value">${data.weight} lbs × ${data.reps}</span>
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
                <div class="history-stats">${sets} sets · ${Math.round(vol).toLocaleString()} lbs volume</div>
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
        ctx.fillStyle = '#a0a0a0';
        ctx.font = '14px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillText('Complete workouts to see your volume trend', canvas.width / 2, 100);
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
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
        ctx.fillStyle = '#606060';
        ctx.font = '11px Work Sans';
        ctx.textAlign = 'right';
        const val = Math.round(maxVol - (maxVol / 4) * i);
        ctx.fillText(val.toLocaleString(), padding.left - 6, y + 4);
    }
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    gradient.addColorStop(0, 'rgba(255,77,0,0.4)');
    gradient.addColorStop(1, 'rgba(255,77,0,0.02)');
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
    ctx.strokeStyle = '#ff4d00';
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
        ctx.fillStyle = '#ff4d00';
        ctx.fill();
        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
    ctx.fillStyle = '#606060';
    ctx.font = '11px Work Sans';
    ctx.textAlign = 'center';
    data.forEach((w, i) => {
        const x = padding.left + i * stepX;
        const date = new Date(w.date);
        ctx.fillText(`${date.getMonth() + 1}/${date.getDate()}`, x, canvas.height - 8);
    });
}

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
            background: '#333', color: '#fff', padding: '12px 24px', borderRadius: '6px',
            fontFamily: "'Work Sans', sans-serif", fontSize: '14px', zIndex: '999',
            transition: 'opacity 0.3s', pointerEvents: 'none'
        });
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => toast.style.opacity = '0', 2500);
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchView(tab.dataset.view));
    });
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
    document.getElementById('start-workout-btn').addEventListener('click', startWorkout);
    document.getElementById('choose-plan-btn').addEventListener('click', () => switchView('plans'));
    document.getElementById('finish-workout-btn').addEventListener('click', finishWorkout);
    document.getElementById('skip-rest-btn').addEventListener('click', skipRest);
    document.getElementById('create-plan-btn').addEventListener('click', showCreatePlan);
    document.getElementById('add-day-btn').addEventListener('click', () => addDayToBuilder());
    document.getElementById('save-plan-btn').addEventListener('click', savePlan);
    document.getElementById('cancel-plan-btn').addEventListener('click', closeModal);
    load();
    seedDefaults();
    renderPlans();
    updateWorkoutHero();
});
