// messaging.js — Phase 4: Direct messaging and workout comments
import { auth, db } from './firebase-config.js';
import {
    collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
    onSnapshot, query, where, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ─── State ────────────────────────────────────────────────────────────────────
let conversations = [];
let activeConvId = null;
let activeConvOtherName = '';
let unsubscribeConvList = null;
let unsubscribeMessages = null;
let totalUnread = 0;

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
function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function el(id) { return document.getElementById(id); }

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initMessaging() {
    listenForConversations();
}

export function loadMessagesView() {
    if (activeConvId) {
        renderMessageThread();
    } else {
        renderConversationList();
    }
}

// ─── Conversation List ────────────────────────────────────────────────────────
function listenForConversations() {
    const uid = getUser()?.uid;
    if (!uid) return;
    if (unsubscribeConvList) unsubscribeConvList();
    const q = query(collection(db, 'conversations'),
        where('participants', 'array-contains', uid), orderBy('lastMessageAt', 'desc'));
    unsubscribeConvList = onSnapshot(q, snap => {
        conversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        totalUnread = conversations.reduce((n, c) => n + (c.unread?.[uid] || 0), 0);
        updateMessageBadge(totalUnread);
        if (!activeConvId) renderConversationList();
    }, e => {
        // Index may not exist yet — query works once index is built
        console.warn('Messages listener error:', e.message);
    });
}

function renderConversationList() {
    const container = el('messages-list');
    if (!container) return;
    const uid = getUser()?.uid;
    container.innerHTML = '';
    el('messages-thread').style.display = 'none';
    el('messages-list-panel').style.display = '';

    if (conversations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <p>NO MESSAGES YET.<br>START A CONVERSATION FROM AN ATHLETE OR TRAINER'S PAGE.</p>
            </div>`;
        return;
    }

    container.innerHTML = conversations.map(c => {
        const otherUid = c.participants.find(p => p !== uid) || '';
        const otherName = c.participantNames?.[otherUid] || 'User';
        const unread = c.unread?.[uid] || 0;
        return `
            <div class="conv-card ${unread ? 'conv-unread' : ''}" onclick="openConversation('${c.id}','${esc(otherUid)}','${esc(otherName)}')">
                <div class="conv-avatar">${otherName.charAt(0).toUpperCase()}</div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
                        <div style="font-weight:700; font-family:'Barlow Condensed',sans-serif; font-size:16px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(otherName)}</div>
                        <div style="font-size:11px; color:var(--text-muted); flex-shrink:0;">${formatTime(c.lastMessageAt)}</div>
                    </div>
                    <div style="font-size:13px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(c.lastMessage || '')}</div>
                </div>
                ${unread ? `<div class="unread-badge">${unread}</div>` : ''}
            </div>`;
    }).join('');
}

// ─── Message Thread ────────────────────────────────────────────────────────────
async function openConversation(convId, otherUid, otherName) {
    activeConvId = convId;
    activeConvOtherName = otherName;
    const uid = getUser()?.uid;

    el('messages-list-panel').style.display = 'none';
    const thread = el('messages-thread');
    thread.style.display = '';
    el('messages-thread-title').textContent = otherName;
    el('messages-feed').innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:20px;">LOADING...</div>';

    // Mark as read
    if (convId) {
        updateDoc(doc(db, 'conversations', convId), { [`unread.${uid}`]: 0 }).catch(() => {});
    }

    if (unsubscribeMessages) unsubscribeMessages();
    const q = query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'asc'));
    unsubscribeMessages = onSnapshot(q, snap => {
        renderMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

function renderMessages(messages) {
    const feed = el('messages-feed');
    if (!feed) return;
    const uid = getUser()?.uid;
    if (messages.length === 0) {
        feed.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:20px;">SEND THE FIRST MESSAGE!</div>';
        return;
    }
    feed.innerHTML = messages.map(m => {
        const isMe = m.senderId === uid;
        return `
            <div style="display:flex; flex-direction:${isMe ? 'row-reverse' : 'row'}; gap:8px; margin-bottom:12px; align-items:flex-end;">
                ${!isMe ? `<div class="conv-avatar" style="width:32px; height:32px; font-size:13px; flex-shrink:0;">${(m.senderName||'?').charAt(0).toUpperCase()}</div>` : ''}
                <div class="msg-bubble ${isMe ? 'msg-mine' : 'msg-theirs'}">
                    <div style="font-size:14px; line-height:1.5;">${esc(m.text)}</div>
                    <div style="font-size:10px; opacity:0.6; margin-top:3px; text-align:${isMe?'right':'left'};">${formatTime(m.createdAt)}</div>
                </div>
            </div>`;
    }).join('');
    feed.scrollTop = feed.scrollHeight;
}

async function sendMessage() {
    const input = el('message-input');
    const text = input?.value.trim();
    if (!text || !activeConvId) return;
    const user = getUser();
    input.value = '';
    try {
        const convRef = doc(db, 'conversations', activeConvId);
        const convSnap = await getDoc(convRef);
        const convData = convSnap.data() || {};
        const otherUid = (convData.participants || []).find(p => p !== user.uid);
        await addDoc(collection(db, 'conversations', activeConvId, 'messages'), {
            senderId: user.uid,
            senderName: user.displayName || user.email,
            text,
            createdAt: new Date().toISOString()
        });
        await updateDoc(convRef, {
            lastMessage: text.slice(0, 80),
            lastMessageAt: new Date().toISOString(),
            [`unread.${otherUid}`]: (convData.unread?.[otherUid] || 0) + 1
        });
    } catch(e) { toast('ERROR SENDING MESSAGE', 'error'); console.error(e); }
}

async function startMessageWithUser(otherUid, otherName) {
    const user = getUser();
    if (!user) return;
    // Find existing conversation
    const existing = conversations.find(c => c.participants.includes(otherUid));
    if (existing) {
        openConversation(existing.id, otherUid, otherName);
        return;
    }
    // Create new conversation
    try {
        const convRef = await addDoc(collection(db, 'conversations'), {
            participants: [user.uid, otherUid],
            participantNames: {
                [user.uid]: user.displayName || user.email,
                [otherUid]: otherName
            },
            lastMessage: '',
            lastMessageAt: new Date().toISOString(),
            unread: { [user.uid]: 0, [otherUid]: 0 }
        });
        openConversation(convRef.id, otherUid, otherName);
    } catch(e) { toast('ERROR STARTING CONVERSATION', 'error'); console.error(e); }
}

function closeThread() {
    if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
    activeConvId = null;
    activeConvOtherName = '';
    el('messages-thread').style.display = 'none';
    el('messages-list-panel').style.display = '';
    renderConversationList();
}

// ─── Badge ─────────────────────────────────────────────────────────────────────
function updateMessageBadge(count) {
    const badge = el('messages-nav-badge');
    if (badge) { badge.textContent = count || ''; badge.style.display = count ? '' : 'none'; }
}

// ─── Window Exports ───────────────────────────────────────────────────────────
window.initMessaging        = initMessaging;
window.loadMessagesView     = loadMessagesView;
window.openConversation     = openConversation;
window.sendMessage          = sendMessage;
window.startMessageWithUser = startMessageWithUser;
window.closeMessageThread   = closeThread;
