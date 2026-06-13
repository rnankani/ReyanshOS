const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// --- OAuth2 setup ---
const CREDENTIALS_PATH=path.join(__dirname, 'credentials.json');
const TOKEN_PATH=path.join(__dirname, 'token.json');

let oAuth2Client;

// Gmail category to label ID mapping
const CATEGORY_LABELS = {
  primary:    'CATEGORY_PERSONAL',
  promotions: 'CATEGORY_PROMOTIONS',
  social:     'CATEGORY_SOCIAL',
  updates:    'CATEGORY_UPDATES',
  forums:     'CATEGORY_FORUMS',
};

function loadCredentials() {
  const content = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.web;
  oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

function loadToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return true;
  }
  return false;
}

// ============================================================
// AGENT 1: PRIORITY SCORING ENGINE
// ============================================================
function scorePriority(email) {
  const subject = (email.subject || '').toLowerCase();
  const body = (email.body || '').toLowerCase();
  const snippet = (email.snippet || '').toLowerCase();
  const from = (email.from || '').toLowerCase();
  const text = subject + ' ' + body + ' ' + snippet;

  let score = 0;
  const signals = [];

  // --- HIGH PRIORITY SIGNALS ---
  const highPatterns = [
    { pattern: /\b(interview|interviews)\b/i, reason: 'Interview mentioned', pts: 30 },
    { pattern: /\b(deadline|due date|due by|expires?)\b/i, reason: 'Deadline detected', pts: 28 },
    { pattern: /\b(meeting request|schedule a meeting|calendar invite|zoom link|google meet)\b/i, reason: 'Meeting request', pts: 25 },
    { pattern: /\b(action required|please reply|respond by|reply by|respond asap|urgent)\b/i, reason: 'Action/response required', pts: 25 },
    { pattern: /\b(offer letter|job offer|acceptance|admission|accepted|rejected|decision)\b/i, reason: 'Important decision/offer', pts: 25 },
    { pattern: /\b(payment|invoice|receipt|billing|charged|refund|transaction)\b/i, reason: 'Financial matter', pts: 20 },
    { pattern: /\b(assignment|homework|submission|project due|exam|test|quiz|grade)\b/i, reason: 'School/work task', pts: 22 },
    { pattern: /\b(confirm your|verify your|activate your|security alert|suspicious)\b/i, reason: 'Security/verification needed', pts: 20 },
    { pattern: /\b(today|tomorrow|this morning|this afternoon|by end of day|eod)\b/i, reason: 'Time-sensitive language', pts: 18 },
    { pattern: /\b(asap|immediately|right away|at your earliest convenience)\b/i, reason: 'Urgency language', pts: 18 },
    { pattern: /\b(cancel|cancellation|reschedule|change of plan|update)\b/i, reason: 'Schedule change', pts: 15 },
    { pattern: /\b(application|applied|status update|under review|next steps)\b/i, reason: 'Application status', pts: 15 },
  ];

  for (const hp of highPatterns) {
    if (hp.pattern.test(text)) {
      score += hp.pts;
      signals.push('+' + hp.pts + ' ' + hp.reason);
    }
  }

  // --- MEDIUM PRIORITY SIGNALS ---
  const medPatterns = [
    { pattern: /\b(follow up|following up|just checking|wanted to ask|quick question)\b/i, reason: 'Follow-up message', pts: 10 },
    { pattern: /\b(reminder|don't forget|heads up|fyi|for your information)\b/i, reason: 'Reminder/FYI', pts: 8 },
    { pattern: /\b(document|attachment|review|feedback|sign|signature)\b/i, reason: 'Document/review needed', pts: 10 },
    { pattern: /\b(event|invitation|rsvp|join us|save the date)\b/i, reason: 'Event/invitation', pts: 8 },
    { pattern: /\b(update|newsletter|weekly|monthly|digest)\b/i, reason: 'Update/newsletter', pts: 5 },
    { pattern: /\b(thank you|thanks|appreciate|great job|congratulations)\b/i, reason: 'Acknowledgment', pts: 5 },
  ];

  for (const mp of medPatterns) {
    if (mp.pattern.test(text)) {
      score += mp.pts;
      signals.push('+' + mp.pts + ' ' + mp.reason);
    }
  }

  // --- LOW PRIORITY SIGNALS ---
  const lowPatterns = [
    { pattern: /\b(unsubscribe|opt out|marketing|promo|promotion|sale|discount|deal|coupon)\b/i, reason: 'Promotional content', pts: -15 },
    { pattern: /\b(no reply|noreply|no-reply|don't reply|do not reply)\b/i, reason: 'No-reply address', pts: -10 },
    { pattern: /\b(automated|auto-generated|system notification|alert from)\b/i, reason: 'Automated notification', pts: -8 },
    { pattern: /\b(social|liked your|followed you|commented on|tagged you|shared your)\b/i, reason: 'Social notification', pts: -5 },
    { pattern: /\b(new post|new video|new episode|check out|you might like|recommended for you)\b/i, reason: 'Content recommendation', pts: -10 },
  ];

  for (const lp of lowPatterns) {
    if (lp.pattern.test(text)) {
      score += lp.pts;
      signals.push(lp.pts + ' ' + lp.reason);
    }
  }

  // --- SENDER REPUTATION ---
  const importantSenders = [
    'professor', 'dean', 'principal', 'teacher', 'instructor',
    'hr@', 'careers@', 'recruiting@', 'jobs@', 'hiring@',
    'admin@', 'office@', 'registrar@', 'financial',
    'support@', 'help@', 'billing@', 'noreply@github',
    'no-reply@linkedin', 'notifications@linkedin',
  ];

  for (const sender of importantSenders) {
    if (from.includes(sender)) {
      score += 8;
      signals.push('+8 Sender: ' + sender);
      break;
    }
  }

  // --- QUESTION DETECTION (someone asking you something) ---
  const questionCount = (text.match(/\?/g) || []).length;
  if (questionCount > 0) {
    score += Math.min(questionCount * 3, 12);
    signals.push('+' + Math.min(questionCount * 3, 12) + ' Contains question(s)');
  }

  // --- DETERMINE LEVEL ---
  let level, reason;
  if (score >= 20) {
    level = 'high';
    reason = signals.length > 0
      ? 'High priority: ' + signals.slice(0, 3).join('; ')
      : 'High priority based on content analysis';
  } else if (score >= 8) {
    level = 'medium';
    reason = signals.length > 0
      ? 'Medium priority: ' + signals.slice(0, 3).join('; ')
      : 'Medium priority: some relevant content detected';
  } else if (score <= -5) {
    level = 'ignore';
    reason = signals.length > 0
      ? 'Low relevance: ' + signals.slice(0, 2).join('; ')
      : 'Appears to be promotional/automated content';
  } else {
    level = 'low';
    reason = signals.length > 0
      ? 'Low priority: ' + signals.slice(0, 2).join('; ')
      : 'No urgent signals detected';
  }

  return { score, level, reason, signals };
}

// ============================================================
// AGENT 2: ACTION EXTRACTION ENGINE
// ============================================================
function extractActions(email) {
  const subject = (email.subject || '').toLowerCase();
  const body = (email.body || '').toLowerCase();
  const snippet = (email.snippet || '').toLowerCase();
  const text = subject + ' ' + body + ' ' + snippet;
  const originalBody = email.body || '';
  const originalSubject = email.subject || '';

  const actions = [];

  // --- REPLY NEEDED ---
  const replyPatterns = [
    { pattern: /\b(please reply|reply to this|respond to this|get back to me|let me know|what do you think|your thoughts|your opinion)\b/i, action: 'Reply needed', detail: 'The sender is asking for your response or opinion.' },
    { pattern: /\b(can you|could you|would you|will you|are you able to|do you have time)\b/i, action: 'Reply needed', detail: 'The sender is asking you a question or making a request.' },
    { pattern: /\b(please confirm|confirm that|please verify|verify that|did you receive)\b/i, action: 'Confirm receipt', detail: 'The sender needs you to confirm or verify something.' },
    { pattern: /\b(following up|follow up|just checking in|wanted to follow up)\b/i, action: 'Follow up', detail: 'This is a follow-up to a previous conversation. May need a reply.' },
  ];

  for (const rp of replyPatterns) {
    if (rp.pattern.test(text)) {
      actions.push({
        action: rp.action,
        detail: rp.detail,
        urgency: /\b(asap|urgent|today|immediately|soon)\b/i.test(text) ? 'high' : 'medium',
        deadline: extractDeadline(text),
      });
      break;
    }
  }

  // --- MEETING TO SCHEDULE ---
  const meetingPatterns = [
    { pattern: /\b(schedule a meeting|set up a meeting|book a meeting|meeting request|calendar invite|zoom|google meet|teams call|call at)\b/i, action: 'Schedule meeting', detail: 'A meeting or call needs to be scheduled.' },
    { pattern: /\b(available|availability|when are you free|what time works|find a time)\b/i, action: 'Check availability', detail: 'Someone is asking about your availability for a meeting or call.' },
    { pattern: /\b(reschedule|move the meeting|change the time|can't make it|conflict)\b/i, action: 'Reschedule meeting', detail: 'A meeting needs to be rescheduled or there is a conflict.' },
  ];

  for (const mp of meetingPatterns) {
    if (mp.pattern.test(text)) {
      actions.push({
        action: mp.action,
        detail: mp.detail,
        urgency: /\b(today|tomorrow|asap|this week)\b/i.test(text) ? 'high' : 'medium',
        deadline: extractDeadline(text),
      });
      break;
    }
  }

  // --- FORM TO FILL OUT ---
  if (/\b(form|survey|questionnaire|fill out|complete the|submit your|registration)\b/i.test(text)) {
    actions.push({
      action: 'Fill out form/survey',
      detail: 'A form, survey, or registration needs to be completed.',
      urgency: /\b(deadline|due|by|before)\b/i.test(text) ? 'high' : 'medium',
      deadline: extractDeadline(text),
    });
  }

  // --- FILE TO REVIEW ---
  if (/\b(review|feedback|look at|check out|attached|attachment|document|draft|proposal)\b/i.test(text)) {
    actions.push({
      action: 'Review document',
      detail: 'A document or file needs to be reviewed. Check attachments.',
      urgency: /\b(urgent|asap|today|deadline)\b/i.test(text) ? 'high' : 'medium',
      deadline: extractDeadline(text),
    });
  }

  // --- DEADLINE TO REMEMBER ---
  const deadlinePatterns = [
    { pattern: /\b(deadline|due date|due by|submit by|turn in by|last day|final date|closes on|ends on)\b/i, action: 'Deadline approaching', detail: 'There is a deadline mentioned. Note the date.' },
    { pattern: /\b(expires?|expiration|valid until|offer ends|last chance|final reminder)\b/i, action: 'Expiration/expiry', detail: 'Something is expiring or ending soon.' },
  ];

  for (const dp of deadlinePatterns) {
    if (dp.pattern.test(text)) {
      actions.push({
        action: dp.action,
        detail: dp.detail,
        urgency: 'high',
        deadline: extractDeadline(text),
      });
      break;
    }
  }

  // --- EVENT TO ATTEND ---
  if (/\b(event|webinar|workshop|session|conference|meetup|join us|save the date|rsvp)\b/i.test(text)) {
    actions.push({
      action: 'Event to attend',
      detail: 'An event is mentioned. Check if you need to RSVP or attend.',
      urgency: /\b(today|tomorrow|this week|seats limited|register)\b/i.test(text) ? 'high' : 'low',
      deadline: extractDeadline(text),
    });
  }

  // --- TASK TO COMPLETE ---
  const taskPatterns = [
    { pattern: /\b(assignment|homework|project|task|deliverable|milestone)\b/i, action: 'Task to complete', detail: 'An assignment or task needs to be completed.' },
    { pattern: /\b(payment|pay|invoice|bill|fee|tuition|subscription)\b/i, action: 'Payment needed', detail: 'A payment or fee needs to be handled.' },
    { pattern: /\b(install|update|upgrade|download|setup|configure)\b/i, action: 'Technical task', detail: 'A technical action may be needed (install, update, setup).' },
  ];

  for (const tp of taskPatterns) {
    if (tp.pattern.test(text)) {
      actions.push({
        action: tp.action,
        detail: tp.detail,
        urgency: /\b(urgent|asap|today|deadline|overdue)\b/i.test(text) ? 'high' : 'medium',
        deadline: extractDeadline(text),
      });
      break;
    }
  }

  // --- INTERVIEW ---
  if (/\b(interview|interviews)\b/i.test(text)) {
    actions.push({
      action: 'Interview to attend/prepare',
      detail: 'An interview is mentioned. Prepare and note the time.',
      urgency: 'high',
      deadline: extractDeadline(text),
    });
  }

  // --- NO ACTION ---
  if (actions.length === 0) {
    const noActionReasons = [
      { pattern: /\b(unsubscribe|promo|promotion|sale|discount|deal|coupon|marketing)\b/i, reason: 'Promotional email — no action needed.' },
      { pattern: /\b(no reply|noreply|no-reply|don't reply|do not reply)\b/i, reason: 'Automated no-reply address — informational only.' },
      { pattern: /\b(thank you|thanks|appreciate|great job|congratulations|well done)\b/i, reason: 'Acknowledgment — no response required.' },
      { pattern: /\b(notification|alert|reminder|update|summary|digest|report)\b/i, reason: 'System notification — informational only.' },
      { pattern: /\b(liked|followed|commented|tagged|shared|subscribed)\b/i, reason: 'Social notification — no action needed.' },
    ];

    let noActionReason = 'No specific action detected. Review if needed.';
    for (const nr of noActionReasons) {
      if (nr.pattern.test(text)) {
        noActionReason = nr.reason;
        break;
      }
    }

    actions.push({
      action: 'No action needed',
      detail: noActionReason,
      urgency: 'none',
      deadline: null,
    });
  }

  return actions;
}

// Helper: extract deadline/date mentions from text
function extractDeadline(text) {
  const datePatterns = [
    /by\s+([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
    /by\s+(today|tomorrow|end of day|eod|eod tomorrow)/i,
    /due\s+([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?)/i,
    /before\s+([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?)/i,
    /on\s+([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    /(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday)/i,
  ];

  for (const dp of datePatterns) {
    const match = text.match(dp);
    if (match) {
      return match[1] || match[0];
    }
  }
  return null;
}

// ============================================================
// AUTH ROUTES
// ============================================================
app.get('/auth', (req, res) => {
  loadCredentials();
  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  });
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.redirect('/');
  } catch (err) {
    res.send('Error authenticating: ' + err.message);
  }
});

// ============================================================
// API: Get unread emails with optional category filter
// ============================================================
app.get('/api/emails', async (req, res) => {
  if (!oAuth2Client || !oAuth2Client.credentials.access_token) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const category = req.query.category || 'primary';

    let q = 'is:unread in:inbox';
    const labelId = CATEGORY_LABELS[category];
    if (labelId) {
      q += ` label:${labelId}`;
    }

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: q,
      maxResults: 25,
    });

    const messages = listRes.data.messages || [];
    const emails = [];

    for (const msg of messages) {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const headers = msgRes.data.payload.headers;
      const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

      emails.push({
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader('From'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        snippet: msgRes.data.snippet,
      });
    }

    res.json({ count: emails.length, emails, category });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// API: Get full email body
// ============================================================
app.get('/api/email/:id', async (req, res) => {
  if (!oAuth2Client || !oAuth2Client.credentials.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'full',
    });

    const payload = msgRes.data.payload;
    let body = '';

    function extractBody(part) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body += Buffer.from(part.body.data, 'base64').toString('utf8');
      }
      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    }
    extractBody(payload);

    const headers = payload.headers;
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

    res.json({
      id: req.params.id,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body: body.substring(0, 8000),
      snippet: msgRes.data.snippet,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// API: Analyze priority for an email (AGENT 1)
// ============================================================
app.get('/api/analyze-priority/:id', async (req, res) => {
  if (!oAuth2Client || !oAuth2Client.credentials.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'full',
    });

    const payload = msgRes.data.payload;
    let body = '';

    function extractBody(part) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body += Buffer.from(part.body.data, 'base64').toString('utf8');
      }
      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    }
    extractBody(payload);

    const headers = payload.headers;
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

    const email = {
      id: req.params.id,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body: body.substring(0, 8000),
      snippet: msgRes.data.snippet,
    };

    const analysis = scorePriority(email);
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// API: Extract actions for an email (AGENT 2)
// ============================================================
app.get('/api/extract-actions/:id', async (req, res) => {
  if (!oAuth2Client || !oAuth2Client.credentials.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: req.params.id,
      format: 'full',
    });

    const payload = msgRes.data.payload;
    let body = '';

    function extractBody(part) {
      if (part.mimeType === 'text/plain' && part.body.data) {
        body += Buffer.from(part.body.data, 'base64').toString('utf8');
      }
      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    }
    extractBody(payload);

    const headers = payload.headers;
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

    const email = {
      id: req.params.id,
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body: body.substring(0, 8000),
      snippet: msgRes.data.snippet,
    };

    const actions = extractActions(email);
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Serve static frontend
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));

// --- Init ---
loadCredentials();
loadToken();

app.listen(PORT, () => {
  console.log(`ReyanshOS Dashboard running at http://localhost:${PORT}`);
  console.log('If not authenticated, visit http://localhost:${PORT}/auth');
});
