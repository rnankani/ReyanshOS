const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// DISCORD BOT
let discordClient = null;
let discordReady = false;
const DISCORD_TOKEN_PATH=path.join(__dirname, 'discord_token.txt');
let discordCache = { channels: [], dms: [], lastFetched: 0 };

function startDiscordBot() {
  try {
    if (!fs.existsSync(DISCORD_TOKEN_PATH)) { console.log('Discord: no token file'); return; }
    const token = fs.readFileSync(DISCORD_TOKEN_PATH, 'utf8').trim();
    if (!token || token === 'YOUR_DISCORD_BOT_TOKEN_HERE') { console.log('Discord: token not set'); return; }
    const { Client, GatewayIntentBits } = require('discord.js');
    discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] });
    discordClient.on('ready', () => { discordReady = true; console.log('Discord: logged in as ' + discordClient.user.tag); });
    discordClient.on('error', (err) => { console.error('Discord error:', err.message); discordReady = false; });
    discordClient.login(token).catch(err => console.error('Discord login failed:', err.message));
  } catch (err) { console.error('Discord setup:', err.message); }
}

async function fetchDiscordMessages() {
  if (!discordClient || !discordReady) return { channels: [], dms: [], error: 'Bot not connected' };
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const channelsData = [], dmsData = [];
  try {
    for (const guild of discordClient.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (channel.type !== 0) continue;
        try {
          const messages = await channel.messages.fetch({ limit: 50 });
          const recent = messages.filter(m => m.createdTimestamp > since && !m.author.bot);
          if (recent.size > 0) channelsData.push({ serverName: guild.name, channelName: channel.name, messages: recent.map(m => ({ id: m.id, author: m.author.username, content: m.content, timestamp: m.createdTimestamp })).sort((a, b) => a.timestamp - b.timestamp) });
        } catch(e) {}
      }
    }
    discordCache = { channels: channelsData, dms: dmsData, lastFetched: Date.now() };
    return discordCache;
  } catch (err) { return { channels: [], dms: [], error: err.message }; }
}

app.get('/api/discord/messages', async (req, res) => {
  if (!discordClient) return res.status(503).json({ error: 'Discord bot not configured' });
  if (Date.now() - discordCache.lastFetched < 10 * 60 * 1000) return res.json(discordCache);
  res.json(await fetchDiscordMessages());
});
app.get('/api/discord/status', (req, res) => {
  res.json({ connected: discordReady, username: discordClient?.user?.tag || null, guilds: discordClient?.guilds?.cache?.size || 0 });
});
startDiscordBot();

// GMAIL OAUTH2
const CREDENTIALS_PATH=path.join(__dirname, 'credentials.json');
const TOKEN_PATH=path.join(__dirname, 'token.json');
let oAuth2Client;

const CATEGORY_QUERIES = { primary: 'category:primary', promotions: 'category:promotions', social: 'category:social', updates: 'category:updates', forums: 'category:forums' };

function loadCredentials() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.web;
  oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}
function loadToken() {
  if (fs.existsSync(TOKEN_PATH)) { oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH))); return true; }
  return false;
}

function scorePriority(email) {
  const subject = (email.subject || '').toLowerCase();
  const body = (email.body || email.snippet || '').toLowerCase();
  const from = (email.from || '').toLowerCase();
  const text = subject + ' ' + body;
  let score = 0; const signals = [];
  [{ p:/\b(interview|interviews)\b/i, r:'Interview', pts:30 },{ p:/\b(deadline|due date|due by|expires?)\b/i, r:'Deadline', pts:28 },{ p:/\b(meeting request|schedule a meeting|zoom link|google meet)\b/i, r:'Meeting', pts:25 },{ p:/\b(action required|please reply|respond by|urgent)\b/i, r:'Action required', pts:25 },{ p:/\b(offer letter|job offer|admission|accepted|rejected|decision)\b/i, r:'Decision/offer', pts:25 },{ p:/\b(payment|invoice|receipt|billing|charged|refund)\b/i, r:'Financial', pts:20 },{ p:/\b(assignment|homework|submission|exam|test|quiz|grade)\b/i, r:'School task', pts:22 },{ p:/\b(confirm your|verify your|security alert)\b/i, r:'Security', pts:20 },{ p:/\b(today|tomorrow|by end of day|eod)\b/i, r:'Time-sensitive', pts:18 },{ p:/\b(asap|immediately)\b/i, r:'Urgent', pts:18 }].forEach(hp => { if (hp.p.test(text)) { score += hp.pts; signals.push('+' + hp.pts + ' ' + hp.r); } });
  [{ p:/\b(follow up|following up|quick question)\b/i, r:'Follow-up', pts:10 },{ p:/\b(reminder|don't forget|heads up|fyi)\b/i, r:'Reminder', pts:8 },{ p:/\b(document|attachment|review|feedback|sign)\b/i, r:'Document', pts:10 },{ p:/\b(event|invitation|rsvp)\b/i, r:'Event', pts:8 }].forEach(mp => { if (mp.p.test(text)) { score += mp.pts; signals.push('+' + mp.pts + ' ' + mp.r); } });
  [{ p:/\b(unsubscribe|promo|sale|discount|deal|coupon|marketing)\b/i, r:'Promotional', pts:-15 },{ p:/\b(no reply|noreply|no-reply)\b/i, r:'No-reply', pts:-10 },{ p:/\b(automated|auto-generated|system notification)\b/i, r:'Automated', pts:-8 },{ p:/\b(new post|check out|recommended for you)\b/i, r:'Recommendation', pts:-10 }].forEach(lp => { if (lp.p.test(text)) { score += lp.pts; signals.push(lp.pts + ' ' + lp.r); } });
  ['professor','dean','principal','teacher','hr@','careers@','recruiting@','admin@','office@','registrar@','financial','support@','billing@'].forEach(s => { if (from.includes(s)) { score += 8; signals.push('+8 Sender: ' + s); } });
  const qc = (text.match(/\?/g) || []).length;
  if (qc > 0) { score += Math.min(qc * 3, 12); signals.push('+' + Math.min(qc * 3, 12) + ' Questions'); }
  let level, reason;
  if (score >= 20) { level = 'high'; reason = signals[0] || 'High priority'; }
  else if (score >= 8) { level = 'medium'; reason = signals[0] || 'Medium priority'; }
  else if (score <= -5) { level = 'ignore'; reason = signals[0] || 'Low relevance'; }
  else { level = 'low'; reason = signals[0] || 'No urgent signals'; }
  return { score, level, reason, signals };
}

function extractDeadline(text) {
  const dps = [/by\s+([A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?)/i, /by\s+(today|tomorrow|end of day|eod)/i, /due\s+([A-Z][a-z]+ \d{1,2})/i, /(\d{1,2}\/\d{1,2}\/\d{2,4})/, /(today|tomorrow|this week|monday|tuesday|wednesday|thursday|friday)/i];
  for (const dp of dps) { const m = text.match(dp); if (m) return m[1] || m[0]; }
  return null;
}

function extractActions(email) {
  const text = ((email.subject||'') + ' ' + (email.body||email.snippet||'')).toLowerCase();
  const actions = [];
  [{ p:/\b(please reply|reply to|get back to me|let me know)\b/i, a:'Reply needed', d:'Sender wants a response' },{ p:/\b(can you|could you|would you|will you)\b/i, a:'Reply needed', d:'Sender is asking you something' },{ p:/\b(please confirm|confirm that|verify)\b/i, a:'Confirm receipt', d:'Confirmation needed' }].forEach(r => { if (r.p.test(text)) { actions.push({ action:r.a, detail:r.d, urgency:/\b(asap|urgent|today)\b/i.test(text)?'high':'medium', deadline:extractDeadline(text) }); } });
  if (/\b(schedule a meeting|set up a meeting|zoom|google meet|available|when are you free)\b/i.test(text)) actions.push({ action:'Schedule meeting', detail:'Meeting to schedule', urgency:/\b(today|tomorrow|asap)\b/i.test(text)?'high':'medium', deadline:extractDeadline(text) });
  if (/\b(form|survey|fill out|complete the|registration)\b/i.test(text)) actions.push({ action:'Fill out form', detail:'Form/survey to complete', urgency:/\b(deadline|due|by)\b/i.test(text)?'high':'medium', deadline:extractDeadline(text) });
  if (/\b(review|feedback|attached|attachment|document|draft)\b/i.test(text)) actions.push({ action:'Review document', detail:'Document needs review', urgency:/\b(urgent|asap|today)\b/i.test(text)?'high':'medium', deadline:extractDeadline(text) });
  if (/\b(deadline|due date|due by|submit by|last day|closes on)\b/i.test(text)) actions.push({ action:'Deadline', detail:'Deadline mentioned', urgency:'high', deadline:extractDeadline(text) });
  if (/\b(event|webinar|workshop|session|conference|rsvp)\b/i.test(text)) actions.push({ action:'Event', detail:'Event mentioned', urgency:/\b(today|tomorrow|register)\b/i.test(text)?'high':'low', deadline:extractDeadline(text) });
  if (/\b(assignment|homework|project|task)\b/i.test(text)) actions.push({ action:'Task to complete', detail:'Task/assignment', urgency:/\b(urgent|asap|overdue)\b/i.test(text)?'high':'medium', deadline:extractDeadline(text) });
  if (/\b(payment|pay|invoice|bill|fee|tuition)\b/i.test(text)) actions.push({ action:'Payment needed', detail:'Payment required', urgency:/\b(urgent|asap|overdue)\b/i.test(text)?'high':'medium', deadline:extractDeadline(text) });
  if (/\b(interview)\b/i.test(text)) actions.push({ action:'Interview', detail:'Interview mentioned', urgency:'high', deadline:extractDeadline(text) });
  if (actions.length === 0) {
    let reason = 'No specific action detected';
    if (/\b(unsubscribe|promo|sale|discount|marketing)\b/i.test(text)) reason = 'Promotional - no action';
    else if (/\b(no reply|noreply)\b/i.test(text)) reason = 'Automated - informational';
    else if (/\b(thank you|thanks|congratulations)\b/i.test(text)) reason = 'Acknowledgment - no response';
    actions.push({ action:'No action needed', detail:reason, urgency:'none', deadline:null });
  }
  return actions;
}

app.get('/auth', (req, res) => {
  loadCredentials();
  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  });
  res.redirect(url);
});
app.get('/oauth2callback', async (req, res) => {
  try { const { tokens } = await oAuth2Client.getToken(req.query.code); oAuth2Client.setCredentials(tokens); fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens)); res.redirect('/'); }
  catch (err) { res.send('Error: ' + err.message); }
});

async function ensureAuth(req, res) {
  if (!oAuth2Client?.credentials?.access_token) {
    res.status(401).json({ error: 'Not authenticated. Visit /auth to log in.', needsAuth: true });
    return false;
  }
  if (oAuth2Client.credentials.expiry_date && oAuth2Client.credentials.expiry_date < Date.now()) {
    if (oAuth2Client.credentials.refresh_token) {
      try {
        const { credentials: newCreds } = await oAuth2Client.refreshAccessToken();
        oAuth2Client.setCredentials(newCreds);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(newCreds));
      } catch (e) {
        res.status(401).json({ error: 'Token refresh failed. Visit /auth to re-authenticate.', needsAuth: true });
        return false;
      }
    } else {
      res.status(401).json({ error: 'Token expired. Visit /auth to re-authenticate.', needsAuth: true });
      return false;
    }
  }
  return true;
}

// GMAIL API - PARALLEL (speed fix)
app.get('/api/emails', async (req, res) => {
  if (!await ensureAuth(req, res)) return;
  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const category = req.query.category || 'primary';
    let q = 'is:unread in:inbox';
    if (CATEGORY_QUERIES[category]) q += ' ' + CATEGORY_QUERIES[category];
    const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 25 });
    const messages = listRes.data.messages || [];
    const emails = (await Promise.all(messages.map(async (msg) => {
      try {
        const msgRes = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['From','Subject','Date'] });
        const headers = msgRes.data.payload.headers;
        const getH = (n) => headers.find(h => h.name === n)?.value || '';
        return { id: msg.id, threadId: msg.threadId, from: getH('From'), subject: getH('Subject'), date: getH('Date'), snippet: msgRes.data.snippet };
      } catch(e) { return null; }
    }))).filter(Boolean);
    res.json({ count: emails.length, emails, category });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/email/:id', async (req, res) => {
  if (!await ensureAuth(req, res)) return;
  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const msgRes = await gmail.users.messages.get({ userId: 'me', id: req.params.id, format: 'full' });
    const payload = msgRes.data.payload;
    let body = '';
    function extractBody(part) { if (part.mimeType === 'text/plain' && part.body.data) body += Buffer.from(part.body.data, 'base64').toString('utf8'); if (part.parts) part.parts.forEach(extractBody); }
    extractBody(payload);
    const headers = payload.headers;
    const getH = (n) => headers.find(h => h.name === n)?.value || '';
    res.json({ id: req.params.id, from: getH('From'), subject: getH('Subject'), date: getH('Date'), body: body.substring(0, 8000), snippet: msgRes.data.snippet });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/analyze-priority/:id', async (req, res) => {
  if (!await ensureAuth(req, res)) return;
  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const msgRes = await gmail.users.messages.get({ userId: 'me', id: req.params.id, format: 'metadata', metadataHeaders: ['From','Subject','Date'] });
    const headers = msgRes.data.payload.headers;
    const getH = (n) => headers.find(h => h.name === n)?.value || '';
    res.json(scorePriority({ from: getH('From'), subject: getH('Subject'), snippet: msgRes.data.snippet }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/extract-actions/:id', async (req, res) => {
  if (!await ensureAuth(req, res)) return;
  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    const msgRes = await gmail.users.messages.get({ userId: 'me', id: req.params.id, format: 'metadata', metadataHeaders: ['From','Subject','Date'] });
    const headers = msgRes.data.payload.headers;
    const getH = (n) => headers.find(h => h.name === n)?.value || '';
    res.json({ actions: extractActions({ from: getH('From'), subject: getH('Subject'), snippet: msgRes.data.snippet }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings', (req, res) => {
  res.json({
    discord: { configured: discordReady, username: discordClient?.user?.tag || null, guilds: discordClient?.guilds?.cache?.size || 0 },
    gmail: { configured: !!(oAuth2Client?.credentials?.access_token) },
    instagram: { configured: false, note: 'Instagram Basic Display API — token required' },
    schoology: { configured: false, note: 'Schoology API — consumer key/secret required' },
    linkedin: { configured: false, note: 'LinkedIn API — OAuth2 token required' },
  });
});

// ===== INSTAGRAM (Basic Display API) =====
let instagramToken = process.env.INSTAGRAM_TOKEN || (fs.existsSync('instagram_token.txt') ? fs.readFileSync('instagram_token.txt', 'utf8').trim() : null);
let instagramCache = { media: [], lastFetched: 0 };

app.get('/api/instagram/status', (req, res) => {
  res.json({ configured: !!instagramToken, note: instagramToken ? 'Token set' : 'Set INSTAGRAM_TOKEN env var or create instagram_token.txt' });
});

app.get('/api/instagram/feed', async (req, res) => {
  if (!instagramToken) return res.status(503).json({ error: 'Instagram not configured. Set INSTAGRAM_TOKEN.' });
  if (Date.now() - instagramCache.lastFetched < 10 * 60 * 1000) return res.json(instagramCache);
  try {
    const fetch = require('node-fetch');
    const url = `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&access_token=${instagramToken}&limit=25`;
    const r = await fetch(url);
    const data = await r.json();
    instagramCache = { media: data.data || [], lastFetched: Date.now() };
    res.json(instagramCache);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== SCHOOLOGY (REST API) =====
let schoologyKey = process.env.SCHOOLOGY_KEY || fs.existsSync('schoology_key.txt') ? fs.readFileSync('schoology_key.txt', 'utf8').trim() : null;
let schoologySecret = process.env.SCHOOLOGY_SECRET || fs.existsSync('schoology_secret.txt') ? fs.readFileSync('schoology_secret.txt', 'utf8').trim() : null;
let schoologyCache = { courses: [], assignments: [], lastFetched: 0 };

app.get('/api/schoology/status', (req, res) => {
  res.json({ configured: !!(schoologyKey && schoologySecret), note: (schoologyKey && schoologySecret) ? 'API keys set' : 'Set SCHOOLOGY_KEY and SCHOOLOGY_SECRET env vars or create schoology_key.txt and schoology_secret.txt' });
});

app.get('/api/schoology/dashboard', async (req, res) => {
  if (!schoologyKey || !schoologySecret) return res.status(503).json({ error: 'Schoology not configured.' });
  if (Date.now() - schoologyCache.lastFetched < 10 * 60 * 1000) return res.json(schoologyCache);
  try {
    const fetch = require('node-fetch');
    const oauth = require('oauth-1.0a');
    const crypto = require('crypto');
    const oa = oauth({ consumer: { key: schoologyKey, secret: schoologySecret }, signature_method: 'HMAC-SHA1', hash_function(base, key) { return crypto.createHmac('sha1', key).update(base).digest('base64'); } });
    const tokenReq = { url: 'https://api.schoology.com/v1/users/me', method: 'GET' };
    const headers = oa.toHeader(oa.authorize(tokenReq));
    const r = await fetch(tokenReq.url, { headers });
    const userData = await r.json();
    schoologyCache = { user: userData, courses: [], assignments: [], lastFetched: Date.now() };
    res.json(schoologyCache);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== LINKEDIN (OAuth2 API) =====
let linkedinToken = process.env.LINKEDIN_TOKEN || (fs.existsSync('linkedin_token.txt') ? fs.readFileSync('linkedin_token.txt', 'utf8').trim() : null);
let linkedinCache = { profile: null, posts: [], lastFetched: 0 };

app.get('/api/linkedin/status', (req, res) => {
  res.json({ configured: !!linkedinToken, note: linkedinToken ? 'Token set' : 'Set LINKEDIN_TOKEN env var or create linkedin_token.txt' });
});

app.get('/api/linkedin/feed', async (req, res) => {
  if (!linkedinToken) return res.status(503).json({ error: 'LinkedIn not configured. Set LINKEDIN_TOKEN.' });
  if (Date.now() - linkedinCache.lastFetched < 10 * 60 * 1000) return res.json(linkedinCache);
  try {
    const fetch = require('node-fetch');
    const r = await fetch('https://api.linkedin.com/v2/me', { headers: { 'Authorization': 'Bearer ' + linkedinToken, 'X-Restli-Protocol-Version': '2.0.0' } });
    const profile = await r.json();
    linkedinCache = { profile, posts: [], lastFetched: Date.now() };
    res.json(linkedinCache);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.use(express.static(path.join(__dirname, 'public')));
loadCredentials();
loadToken();
app.listen(PORT, () => { console.log('ReyanshOS running at http://localhost:' + PORT); });
