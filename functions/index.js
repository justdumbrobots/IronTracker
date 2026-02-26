// ═════════════════════════════════════════════
// IronTracker / OpenGym — Cloud Functions
// Deploy: firebase deploy --only functions
// ═════════════════════════════════════════════

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ─────────────────────────────────────────────
// Helper: compute PRs from a history array
// Returns Map<exerciseName, bestWeight>
// ─────────────────────────────────────────────
function buildPRMap(historyArray) {
    const bests = new Map();
    for (const workout of (historyArray || [])) {
        for (const ex of (workout.exercises || [])) {
            for (const set of (ex.sets || [])) {
                if (!set.completed) continue;
                const w = parseFloat(set.weight) || 0;
                if (w > (bests.get(ex.name) || 0)) bests.set(ex.name, w);
            }
        }
    }
    return bests;
}

// ─────────────────────────────────────────────
// Helper: recalculate and persist successRate
// ─────────────────────────────────────────────
async function refreshSuccessRate(planId) {
    const planRef = db.collection('community_plans').doc(planId);
    const snap = await planRef.get();
    if (!snap.exists) return;
    const { enrolledCount = 0, completedCount = 0 } = snap.data();
    const successRate = enrolledCount > 0
        ? Math.round((completedCount / enrolledCount) * 100)
        : 0;
    await planRef.update({ successRate });
}

// ═════════════════════════════════════════════
// TRIGGER 1: user workout_data updated
//   • Detect new workout entry (history is newest-first)
//   • Transition enrollment: enrolled → progressing → completed
//   • Detect and record new PRs in plan_prs collection
// ═════════════════════════════════════════════
exports.onWorkoutDataUpdated = functions.firestore
    .document('users/{uid}/data/workout_data')
    .onUpdate(async (change, context) => {
        const { uid } = context.params;
        const before = change.before.data() || {};
        const after = change.after.data() || {};

        const beforeHistory = before.workoutHistory || [];
        const afterHistory = after.workoutHistory || [];

        // Only proceed if a new workout was added (newest-first unshift means index 0 is new)
        if (afterHistory.length <= beforeHistory.length) return null;

        const latestWorkout = afterHistory[0];
        const communityPlanId = latestWorkout?.communityPlanId;
        if (!communityPlanId) return null; // Not a community plan workout

        const planDayCount = await getCommunityPlanDayCount(communityPlanId);

        // Run both tasks concurrently
        await Promise.all([
            updateEnrollmentStatus(uid, communityPlanId, latestWorkout, planDayCount),
            detectAndRecordPRs(uid, communityPlanId, latestWorkout, beforeHistory)
        ]);

        return null;
    });

async function getCommunityPlanDayCount(planId) {
    const planDoc = await db.collection('community_plans').doc(planId).get();
    if (!planDoc.exists) return 0;
    return (planDoc.data().days || []).length;
}

async function updateEnrollmentStatus(uid, communityPlanId, latestWorkout, planDayCount) {
    const enrollmentsRef = db.collection('plan_enrollments');
    const snapshot = await enrollmentsRef
        .where('uid', '==', uid)
        .where('planId', '==', communityPlanId)
        .where('status', 'in', ['enrolled', 'progressing'])
        .limit(1)
        .get();

    if (snapshot.empty) return;

    const enrollmentDoc = snapshot.docs[0];
    const { status } = enrollmentDoc.data();

    const isLastDay = planDayCount > 0 && latestWorkout.dayIndex === planDayCount - 1;

    if (isLastDay) {
        // Mark complete
        await enrollmentDoc.ref.update({
            status: 'completed',
            lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('community_plans').doc(communityPlanId).update({
            completedCount: admin.firestore.FieldValue.increment(1)
        });
        await refreshSuccessRate(communityPlanId);
    } else if (status === 'enrolled') {
        await enrollmentDoc.ref.update({
            status: 'progressing',
            lastActivityAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } else {
        await enrollmentDoc.ref.update({
            lastActivityAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}

async function detectAndRecordPRs(uid, communityPlanId, latestWorkout, previousHistory) {
    const previousPRs = buildPRMap(previousHistory);

    // Resolve display name
    let displayName = 'Athlete';
    try {
        const userRecord = await admin.auth().getUser(uid);
        displayName = userRecord.displayName || userRecord.email?.split('@')[0] || 'Athlete';
    } catch (_) {}

    const writes = [];
    for (const ex of (latestWorkout.exercises || [])) {
        let maxWeight = 0;
        let repsAtMax = 0;
        for (const set of (ex.sets || [])) {
            if (!set.completed) continue;
            const w = parseFloat(set.weight) || 0;
            if (w > maxWeight) {
                maxWeight = w;
                repsAtMax = parseInt(set.reps) || 0;
            }
        }
        const previousBest = previousPRs.get(ex.name) || 0;
        if (maxWeight > previousBest && maxWeight > 0) {
            writes.push(db.collection('plan_prs').add({
                uid,
                planId: communityPlanId,
                exerciseName: ex.name,
                weight: maxWeight,
                reps: repsAtMax,
                previousBest,
                displayName,
                achievedAt: admin.firestore.FieldValue.serverTimestamp()
            }));
        }
    }
    if (writes.length) await Promise.all(writes);
}

// ═════════════════════════════════════════════
// TRIGGER 2: new plan_enrollment document created
//   • Increment enrolledCount on community plan
//   • Recalculate successRate
// ═════════════════════════════════════════════
exports.onEnrollmentCreated = functions.firestore
    .document('plan_enrollments/{enrollmentId}')
    .onCreate(async (snap) => {
        const { planId } = snap.data();
        if (!planId) return null;

        await db.collection('community_plans').doc(planId).update({
            enrolledCount: admin.firestore.FieldValue.increment(1)
        });
        await refreshSuccessRate(planId);
        return null;
    });

// ═════════════════════════════════════════════
// SCHEDULED: check inactive enrolled users
//   • Runs every hour
//   • Sends FCM push notification at 48h and 72h inactivity marks
//   • FCM tokens stored at users/{uid}/tokens/fcm
// ═════════════════════════════════════════════
exports.checkInactiveUsers = functions.pubsub
    .schedule('every 1 hours')
    .onRun(async () => {
        const snapshot = await db.collection('plan_enrollments')
            .where('status', '==', 'progressing')
            .get();

        const notifyPromises = [];

        for (const doc of snapshot.docs) {
            const { uid, lastActivityAt } = doc.data();
            if (!lastActivityAt) continue;

            const lastDate = lastActivityAt.toDate();
            const hoursSince = (Date.now() - lastDate.getTime()) / 3_600_000;

            let body = null;
            if (hoursSince >= 47 && hoursSince < 49) {
                body = "48 hours since your last session — your streak is at risk! 💪";
            } else if (hoursSince >= 71 && hoursSince < 73) {
                body = "72 hours and counting. The Success Wall misses you. 🔴";
            }

            if (!body) continue;

            // Fetch FCM token
            const tokenDoc = await db
                .collection('users').doc(uid)
                .collection('tokens').doc('fcm')
                .get()
                .catch(() => null);

            const fcmToken = tokenDoc?.exists ? tokenDoc.data().token : null;
            if (!fcmToken) continue;

            notifyPromises.push(
                admin.messaging().send({
                    token: fcmToken,
                    notification: { title: 'TIME SINCE LAST PUMP', body },
                    data: { type: 'inactivity_reminder' }
                }).catch(() => {}) // Swallow invalid/expired token errors
            );
        }

        if (notifyPromises.length) await Promise.all(notifyPromises);
        return null;
    });
