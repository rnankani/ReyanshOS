
    // ===== STATE =====
    let currentPlatform = 'gmail';
    let currentCategory = 'primary';
    let currentSort = 'priority';
    let currentPriorityFilter = 'all';
    let countdown = 600;
    let allEmails = [];
    let analyzedEmails = new Map();
    let selectedEmailId = null;

    // Per-category cache
    const categoryCache = {};
    const CACHE_TTL_MS = 10 * 60 * 1000;
    function isCacheValid(category) {
      const entry = categoryCache[category];
      if (!entry) return false;
      return (Date.now() - entry.timestamp) < CACHE_TTL_MS;
    }

    // Priority rules (persisted to localStorage)
    let priorityRules = [];
    try { priorityRules = JSON.parse(localStorage.getItem('reyanshOS_rules') || '[]'); } catch(e) {}

    // Theme from localStorage
    const savedTheme = localStorage.getItem('reyanshOS_theme');
    if (savedTheme === 'light') document.body.classList.add('light');
    const savedDensity = localStorage.getItem('reyanshOS_density');
    if (savedDensity === 'compact') document.body.classList.add('compact');
    const savedSidebar = localStorage.getItem('reyanshOS_sidebar');
    if (savedSidebar === 'collapsed') document.getElementById('sidebar').classList.add('collapsed');

    // Update theme icon
    function updateThemeIcon() {
      const isLight = document.body.classList.contains('light');
      const icon = document.getElementById('theme-icon');
      if (icon) icon.innerHTML = isLight
        ? `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`
        : `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
    }
    updateThemeIcon();

    // ===== THEME TOGGLE =====
    function toggleTheme() {
      document.body.classList.toggle('light');
      localStorage.setItem('reyanshOS_theme', document.body.classList.contains('light') ? 'light' : 'dark');
      updateThemeIcon();
    }

    // ===== DENSITY TOGGLE =====
    function toggleDensity() {
      document.body.classList.toggle('compact');
      localStorage.setItem('reyanshOS_density', document.body.classList.contains('compact') ? 'compact' : 'normal');
    }

    // ===== SIDEBAR TOGGLE =====
    function toggleSidebar() {
      const sb = document.getElementById('sidebar');
      sb.classList.toggle('collapsed');
      localStorage.setItem('reyanshOS_sidebar', sb.classList.contains('collapsed') ? 'collapsed' : 'open');
    }

    // ===== PLATFORM SWITCHING =====
    function switchPlatform(platform) {
      currentPlatform = platform;
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      const navEl = document.getElementById('nav-' + platform);
      if (navEl) navEl.classList.add('active');
      document.getElementById('category-tabs').style.display = platform === 'gmail' ? 'flex' : 'none';
      document.getElementById('toolbar').style.display = platform === 'gmail' ? 'flex' : 'none';
      if (platform === 'gmail') {
        document.getElementById('page-title').innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Gmail';
        document.getElementById('page-subtitle').textContent = 'Unread emails sorted by priority';
        resetTimer();
        fetchEmails();
      } else if (platform === 'discord') {
        renderDiscordPage();
      } else if (platform === 'instagram') {
        renderInstagramPage();
      } else if (platform === 'schoology') {
        renderSchoologyPage();
      } else if (platform === 'linkedin') {
        renderLinkedInPage();
      } else if (platform === 'settings') {
        renderSettingsPage();
      } else {
        renderComingSoon(platform);
      }
    }

    // ===== DISCORD PAGE =====
    async function renderDiscordPage() {
      document.getElementById('page-title').innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.434 0 13.5 13.5 0 0 0-.64-1.314.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.36-.49.679-.997.964-1.523a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.09-.065.18-.13.266-.195a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.086.065.176.13.266.195a.077.077 0 0 1-.006.127 12.9 12.9 0 0 1-1.873.892.077.077 0 0 0-.041.107c.285.526.604 1.033.964 1.523a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 5.993-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg> Discord';
      document.getElementById('page-subtitle').textContent = 'Recent messages from your servers and DMs';
      const container = document.getElementById('content');
      container.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading Discord messages...</div>';
      try {
        // Check bot status first
        const statusRes = await fetch('/api/discord/status');
        const status = await statusRes.json();
        if (!status.connected) {
          container.innerHTML = '<div class="error">Discord bot not connected. Make sure the bot token is set in <code>discord_token.txt</code> and restart the server.</div>';
          return;
        }
        const res = await fetch('/api/discord/messages');
        const data = await res.json();
        if (data.error) { container.innerHTML = '<div class="error">' + data.error + '</div>'; return; }
        const allMsgs = [
          ...data.channels.flatMap(c => c.messages.map(m => ({...m, source: c.serverName + ' #' + c.channelName, type: 'channel'}))),
          ...data.dms.flatMap(d => d.messages.map(m => ({...m, source: 'DM: ' + d.recipient, type: 'dm'}))),
        ].sort((a, b) => b.timestamp - a.timestamp);
        const badge = document.getElementById('discord-badge');
        if (badge) { badge.textContent = allMsgs.length; badge.style.display = 'inline'; }
        if (allMsgs.length === 0) { container.innerHTML = '<div class="empty"><p>No recent Discord messages (last 24h)</p></div>'; return; }
        container.innerHTML = '';
        for (const msg of allMsgs) {
          const card = document.createElement('div');
          card.className = 'email-card';
          const time = new Date(msg.timestamp).toLocaleString();
          card.innerHTML =
            '<div class="email-card-main"><div class="email-card-top"><div class="email-card-left">' +
              '<div class="from">' + escapeHtml(msg.author) + ' <span style="color:var(--text-faint);font-weight:400;font-size:0.75rem">in ' + escapeHtml(msg.source) + '</span></div>' +
              '<div class="snippet" style="color:var(--text-secondary);margin-top:4px;font-size:0.85rem">' + escapeHtml(msg.content || '(no text content)') + '</div>' +
            '</div><div class="email-card-right"><span class="date">' + time + '</span></div></div></div>';
          container.appendChild(card);
        }
      } catch (err) {
        container.innerHTML = '<div class="error">Error loading Discord: ' + err.message + '</div>';
      }
    }

    function renderComingSoon(platform) {
      const names = {
        discord: { title: 'Discord', desc: 'Messages, DMs, and server notifications' },
        instagram: { title: 'Instagram', desc: 'DMs, comments, likes, and story mentions' },
        schoology: { title: 'Schoology', desc: 'Assignments, grades, and course updates' },
      };
      const info = names[platform] || { title: platform, desc: '' };
      document.getElementById('page-title').textContent = info.title;
      document.getElementById('page-subtitle').textContent = info.desc;
      document.getElementById('content').innerHTML = '<div class="coming-soon-page"><h3>' + info.title + ' — Coming Soon</h3><p>This integration is under development.</p></div>';
    }

    // ===== INSTAGRAM PAGE =====
    async function renderInstagramPage() {
      document.getElementById('page-title').innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> Instagram';
      document.getElementById('page-subtitle').textContent = 'DMs, comments, likes, and story mentions';
      const container = document.getElementById('content');
      container.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading Instagram...</div>';
      try {
        const statusRes = await fetch('/api/instagram/status');
        const status = await statusRes.json();
        if (!status.configured) {
          container.innerHTML = '<div class="coming-soon-page"><h3>Instagram — Not Configured</h3><p>' + status.note + '</p><p style="margin-top:12px;font-size:13px;color:var(--text-secondary)">To enable: create <code>instagram_token.txt</code> with your Instagram Basic Display API token, or set <code>INSTAGRAM_TOKEN</code> env var.</p></div>';
          return;
        }
        const res = await fetch('/api/instagram/feed');
        const data = await res.json();
        if (!data.media || data.media.length === 0) {
          container.innerHTML = '<div class="coming-soon-page"><h3>Instagram</h3><p>No media found.</p></div>';
          return;
        }
        container.innerHTML = '<div class="email-list">' + data.media.map(item => '<div class="email-card"><div class="email-header"><span class="email-from">' + (item.caption || 'Instagram').slice(0, 60) + '</span><span class="email-date">' + new Date(item.timestamp).toLocaleDateString() + '</span></div><div class="email-subject">' + item.media_type + '</div><div class="email-snippet"><a href="' + item.permalink + '" target="_blank">View on Instagram</a></div></div>').join('') + '</div>';
      } catch (err) {
        container.innerHTML = '<div class="error">Error loading Instagram: ' + err.message + '</div>';
      }
    }

    // ===== SCHOOLOGY PAGE =====
    async function renderSchoologyPage() {
      document.getElementById('page-title').innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg> Schoology';
      document.getElementById('page-subtitle').textContent = 'Assignments, grades, and course updates';
      const container = document.getElementById('content');
      container.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading Schoology...</div>';
      try {
        const statusRes = await fetch('/api/schoology/status');
        const status = await statusRes.json();
        if (!status.configured) {
          container.innerHTML = '<div class="coming-soon-page"><h3>Schoology — Not Configured</h3><p>' + status.note + '</p><p style="margin-top:12px;font-size:13px;color:var(--text-secondary)">To enable: create <code>schoology_key.txt</code> and <code>schoology_secret.txt</code> with your Schoology API credentials.</p></div>';
          return;
        }
        const res = await fetch('/api/schoology/dashboard');
        const data = await res.json();
        container.innerHTML = '<div class="coming-soon-page"><h3>Schoology</h3><p>Connected! User: ' + (data.user?.name || 'Unknown') + '</p><p style="margin-top:8px">Courses and assignments will appear here once the Schoology API OAuth flow is complete.</p></div>';
      } catch (err) {
        container.innerHTML = '<div class="error">Error loading Schoology: ' + err.message + '</div>';
      }
    }

    // ===== LINKEDIN PAGE =====
    async function renderLinkedInPage() {
      document.getElementById('page-title').innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> LinkedIn';
      document.getElementById('page-subtitle').textContent = 'Messages, connections, and activity';
      const container = document.getElementById('content');
      container.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading LinkedIn...</div>';
      try {
        const statusRes = await fetch('/api/linkedin/status');
        const status = await statusRes.json();
        if (!status.configured) {
          container.innerHTML = '<div class="coming-soon-page"><h3>LinkedIn — Not Configured</h3><p>' + status.note + '</p><p style="margin-top:12px;font-size:13px;color:var(--text-secondary)">To enable: create <code>linkedin_token.txt</code> with your LinkedIn OAuth2 token, or set <code>LINKEDIN_TOKEN</code> env var.</p></div>';
          return;
        }
        const res = await fetch('/api/linkedin/feed');
        const data = await res.json();
        container.innerHTML = '<div class="coming-soon-page"><h3>LinkedIn</h3><p>Connected! Profile: ' + (data.profile?.localizedFirstName + ' ' + data.profile?.localizedLastName || 'Unknown') + '</p><p style="margin-top:8px">Posts and messages will appear here once the LinkedIn API OAuth flow is complete.</p></div>';
      } catch (err) {
        container.innerHTML = '<div class="error">Error loading LinkedIn: ' + err.message + '</div>';
      }
    }

    // ===== SETTINGS PAGE =====
    async function renderSettingsPage() {
      document.getElementById('page-title').innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/></svg> Settings';
      document.getElementById('page-subtitle').textContent = 'Platform status and configuration';
      const container = document.getElementById('content');
      container.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading settings...</div>';
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        const platforms = [
          { key: 'gmail', name: 'Gmail', icon: '✉', desc: 'Email, priority scoring, categories' },
          { key: 'discord', name: 'Discord', icon: '💬', desc: 'Messages, DMs, server notifications' },
          { key: 'instagram', name: 'Instagram', icon: '📷', desc: 'DMs, comments, likes' },
          { key: 'schoology', name: 'Schoology', icon: '🎓', desc: 'Assignments, grades, courses' },
          { key: 'linkedin', name: 'LinkedIn', icon: '💼', desc: 'Messages, connections, activity' },
        ];
        let html = '<div style="max-width:600px">';
        for (const p of platforms) {
          const status = data[p.key];
          const badge = status?.configured
            ? '<span style="background:#238636;color:#fff;padding:2px 8px;border-radius:10px;font-size:12px">Connected</span>'
            : '<span style="background:#6e7681;color:#fff;padding:2px 8px;border-radius:10px;font-size:12px">Not Configured</span>';
          html += '<div style="display:flex;align-items:center;gap:12px;padding:14px;border-bottom:1px solid var(--border)"><span style="font-size:22px">' + p.icon + '</span><div style="flex:1"><div style="font-weight:600">' + p.name + ' ' + badge + '</div><div style="font-size:12px;color:var(--text-secondary);margin-top:2px">' + p.desc + '</div>' + (status?.note ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">' + status.note + '</div>' : '') + '</div></div>';
        }
        html += '<div style="margin-top:20px;padding:14px;background:var(--card);border-radius:8px"><h4 style="margin:0 0 8px">Gmail Re-Authentication</h4><p style="font-size:13px;color:var(--text-secondary);margin:0 0 10px">If your Gmail token has expired, click below to re-authenticate.</p><a href="/auth" class="btn" style="display:inline-block;text-decoration:none;padding:8px 16px;background:var(--accent);color:#fff;border-radius:6px;font-size:13px">Re-authenticate Gmail</a></div>';
        html += '</div>';
        container.innerHTML = html;
      } catch (err) {
        container.innerHTML = '<div class="error">Error loading settings: ' + err.message + '</div>';
      }
    }

    // ===== CATEGORY SWITCHING (with cache) =====
    function switchCategory(category) {
      if (currentCategory && allEmails.length > 0) {
        categoryCache[currentCategory] = { emails: allEmails, analyzed: new Map(analyzedEmails), timestamp: Date.now() };
      }
      currentCategory = category;
      document.querySelectorAll('.category-tab').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + category).classList.add('active');
      if (isCacheValid(category)) {
        const cached = categoryCache[category];
        allEmails = cached.emails;
        analyzedEmails = new Map(cached.analyzed);
        currentSort = 'priority'; currentPriorityFilter = 'all';
        document.querySelectorAll('.sort-btn').forEach(el => el.classList.remove('active'));
        document.getElementById('sort-priority').classList.add('active');
        document.getElementById('priority-filter').value = 'all';
        renderEmails();
      } else {
        delete categoryCache[category];
        analyzedEmails = new Map();
        allEmails = [];
        fetchEmails();
      }
    }

    // ===== SORT & FILTER =====
    function setSort(sort) {
      currentSort = sort;
      document.querySelectorAll('.sort-btn').forEach(el => el.classList.remove('active'));
      document.getElementById('sort-' + sort).classList.add('active');
      renderEmails();
    }
    function setPriorityFilter(filter) { currentPriorityFilter = filter; renderEmails(); }

    // ===== APPLY PRIORITY RULES =====
    function applyRules(email, analysis) {
      const from = (email.from || '').toLowerCase();
      for (const rule of priorityRules) {
        if (from.includes(rule.sender.toLowerCase())) {
          return { ...analysis, priority: { ...analysis.priority, level: rule.priority, reason: 'Rule match: ' + rule.sender + ' → ' + rule.priority } };
        }
      }
      return analysis;
    }

    // ===== FETCH EMAILS =====
    async function fetchEmails() {
      const container = document.getElementById('content');
      container.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading emails...</div>';
      analyzedEmails.clear();
      try {
        const res = await fetch('/api/emails?category=' + currentCategory);
        if (res.status === 401) {
          container.innerHTML = '<div class="error">Not authenticated. <a href="/auth">Click here to log in with Google</a></div>';
          return;
        }
        const data = await res.json();
        allEmails = data.emails;
        document.getElementById('total-badge').textContent = data.count;
        // Update per-tab counts
        const cats = ['primary','promotions','social','updates','forums'];
        for (const c of cats) {
          const el = document.getElementById('count-' + c);
          if (el) el.textContent = (c === currentCategory) ? data.count : (categoryCache[c]?.emails?.length || 0);
        }
        if (data.count === 0) {
          container.innerHTML = '<div class="empty"><p>No unread emails in this category</p></div>';
          document.getElementById('stats-text').textContent = '0 emails';
          return;
        }
        container.innerHTML = '<div class="loading"><div class="spinner"></div><br>Analyzing priority & actions...</div>';
        await Promise.all(allEmails.map(email => analyzeEmail(email)));
        renderEmails();
      } catch (err) {
        container.innerHTML = '<div class="error">Error: ' + err.message + '</div>';
      }
    }

    async function analyzeEmail(email) {
      try {
        const [priorityRes, actionsRes] = await Promise.all([
          fetch('/api/analyze-priority/' + email.id),
          fetch('/api/extract-actions/' + email.id),
        ]);
        const priority = await priorityRes.json();
        const actionsData = await actionsRes.json();
        const actions = Array.isArray(actionsData) ? actionsData : (actionsData.actions || []);
        let analysis = { priority, actions };
        analysis = applyRules(email, analysis);
        analyzedEmails.set(email.id, analysis);
      } catch (err) {
        analyzedEmails.set(email.id, {
          priority: { score: 0, level: 'medium', reason: 'Analysis failed', signals: [] },
          actions: [{ action: 'No action needed', detail: 'Could not analyze email.', urgency: 'none', deadline: null }],
        });
      }
    }

    // ===== RENDER EMAILS =====
    function renderEmails() {
      const container = document.getElementById('content');
      let emails = [...allEmails];
      if (currentPriorityFilter !== 'all') {
        emails = emails.filter(email => {
          const analysis = analyzedEmails.get(email.id);
          if (!analysis) return true;
          const level = analysis.priority.level;
          if (currentPriorityFilter === 'high') return level === 'high';
          if (currentPriorityFilter === 'medium') return level === 'high' || level === 'medium';
          if (currentPriorityFilter === 'low') return level !== 'ignore';
          return true;
        });
      }
      if (currentSort === 'priority') {
        const po = { high: 0, medium: 1, low: 2, ignore: 3 };
        emails.sort((a, b) => {
          const aA = analyzedEmails.get(a.id), bA = analyzedEmails.get(b.id);
          const aL = aA ? aA.priority.level : 'low', bL = bA ? bA.priority.level : 'low';
          const aO = po[aL] ?? 2, bO = po[bL] ?? 2;
          if (aO !== bO) return aO - bO;
          return (bA?.priority.score || 0) - (aA?.priority.score || 0);
        });
      } else {
        emails.sort((a, b) => new Date(b.date) - new Date(a.date));
      }
      const highCount = emails.filter(e => { const a = analyzedEmails.get(e.id); return a && a.priority.level === 'high'; }).length;
      const medCount = emails.filter(e => { const a = analyzedEmails.get(e.id); return a && a.priority.level === 'medium'; }).length;
      document.getElementById('stats-text').textContent = emails.length + ' emails — ' + highCount + ' high, ' + medCount + ' medium priority';
      if (emails.length === 0) { container.innerHTML = '<div class="empty"><p>No emails match the current filter</p></div>'; return; }
      container.innerHTML = '';
      for (const email of emails) {
        const analysis = analyzedEmails.get(email.id);
        container.appendChild(createEmailCard(email, analysis));
      }
    }

    function createEmailCard(email, analysis) {
      const card = document.createElement('div');
      card.className = 'email-card';
      card.id = 'card-' + email.id;
      const priority = analysis ? analysis.priority : { level: 'medium', reason: 'Analyzing...', score: 0 };
      let actions = analysis ? analysis.actions : [];
      if (!Array.isArray(actions)) actions = (actions && actions.actions) || [];
      const level = priority.level;
      const badgeIcons = {
        high: '<svg class="svg-icon" viewBox="0 0 24 24" style="width:11px;height:11px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        medium: '<svg class="svg-icon" viewBox="0 0 24 24" style="width:11px;height:11px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        low: '<svg class="svg-icon" viewBox="0 0 24 24" style="width:11px;height:11px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        ignore: '<svg class="svg-icon" viewBox="0 0 24 24" style="width:11px;height:11px"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
      };
      const actionItemsHtml = actions.map(action => {
        const uc = action.urgency || 'none';
        const isNo = action.action === 'No action needed';
        return '<div class="action-item' + (isNo ? ' no-action' : '') + '">' +
          '<div class="action-icon ' + uc + '">' + action.action.charAt(0) + '</div>' +
          '<div class="action-content"><div class="action-name">' + escapeHtml(action.action) + '</div>' +
          '<div class="action-detail">' + escapeHtml(action.detail) + '</div>' +
          (action.deadline ? '<div class="action-deadline"><svg class="svg-icon" viewBox="0 0 24 24" style="width:10px;height:10px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' + escapeHtml(action.deadline) + '</div>' : '') +
          '</div></div>';
      }).join('');
      card.innerHTML =
        '<div class="email-card-main"><div class="email-card-top"><div class="email-card-left">' +
          '<div class="from">' + escapeHtml(email.from) + '</div>' +
          '<div class="subject">' + escapeHtml(email.subject) + '</div>' +
          '<div class="snippet">' + escapeHtml(email.snippet) + '</div>' +
          '<div class="priority-reason">' + escapeHtml(priority.reason) + '</div>' +
        '</div><div class="email-card-right">' +
          '<span class="date">' + formatDate(email.date) + '</span>' +
          '<span class="priority-badge ' + level + '">' + (badgeIcons[level] || '') + ' ' + level + '</span>' +
        '</div></div></div>' +
        '<div class="email-card-expanded" id="expanded-' + email.id + '">' +
          '<div class="summary-section"><div class="summary-label">Summary</div><div class="summary-text" id="summary-text-' + email.id + '">Loading...</div></div>' +
          '<div class="action-section"><div class="action-label">Actions</div><div id="actions-' + email.id + '"><div class="action-item no-action"><div class="action-icon none">—</div><div class="action-content"><div class="action-detail">Analyzing...</div></div></div></div></div>' +
        '</div>';
      card.onclick = (e) => { selectEmail(email.id); toggleCard(email.id); };
      return card;
    }

    // ===== EMAIL SELECTION + DETAIL PANEL =====
    function selectEmail(emailId) {
      document.querySelectorAll('.email-card.selected').forEach(c => c.classList.remove('selected'));
      const card = document.getElementById('card-' + emailId);
      if (card) card.classList.add('selected');
      selectedEmailId = emailId;
      // Show detail panel
      const panel = document.getElementById('detail-panel');
      const content = document.getElementById('content');
      if (panel && content) {
        panel.classList.add('open');
        content.classList.add('shrink');
      }
    }

    function closeDetailPanel() {
      document.getElementById('detail-panel').classList.remove('open');
      document.getElementById('content').classList.remove('shrink');
      document.querySelectorAll('.email-card.selected').forEach(c => c.classList.remove('selected'));
      selectedEmailId = null;
    }

    // ===== TOGGLE CARD =====
    async function toggleCard(emailId) {
      const expanded = document.getElementById('expanded-' + emailId);
      const isVisible = expanded.classList.contains('visible');
      expanded.classList.toggle('visible');
      if (isVisible) return;
      // Load summary
      const st = document.getElementById('summary-text-' + emailId);
      st.textContent = 'Loading...';
      try { const r = await fetch('/api/email/' + emailId); const d = await r.json(); st.textContent = generateSummary(d); }
      catch (e) { st.textContent = 'Failed to load.'; }
      // Populate detail panel
      const email = allEmails.find(e => e.id === emailId);
      const analysis = analyzedEmails.get(emailId);
      if (email) populateDetailPanel(email, analysis);
      // Actions
      const ac = document.getElementById('actions-' + emailId);
      if (analysis && analysis.actions) {
        ac.innerHTML = analysis.actions.map(action => {
          const uc = action.urgency || 'none';
          const isNo = action.action === 'No action needed';
          return '<div class="action-item' + (isNo ? ' no-action' : '') + '"><div class="action-icon ' + uc + '">' + action.action.charAt(0) + '</div><div class="action-content"><div class="action-name">' + escapeHtml(action.action) + '</div><div class="action-detail">' + escapeHtml(action.detail) + '</div>' + (action.deadline ? '<div class="action-deadline"><svg class="svg-icon" viewBox="0 0 24 24" style="width:10px;height:10px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' + escapeHtml(action.deadline) + '</div>' : '') + '</div></div>';
        }).join('');
      }
    }

    function populateDetailPanel(email, analysis) {
      const title = document.getElementById('detail-title');
      const body = document.getElementById('detail-body');
      if (title) title.textContent = email.subject || 'Email Detail';
      if (!body) return;
      const priority = analysis?.priority;
      const actions = analysis?.actions || [];
      let html = '<div class="detail-from">' + escapeHtml(email.from) + '</div>' +
        '<div class="detail-subject">' + escapeHtml(email.subject) + '</div>' +
        '<div class="detail-date">' + formatDate(email.date) + '</div>';
      if (priority) {
        html += '<div class="detail-section-title">Priority</div>' +
          '<div style="margin-bottom:12px"><span class="priority-badge ' + priority.level + '">' + priority.level + '</span> ' +
          '<span style="font-size:0.75rem;color:var(--text-faint)">' + escapeHtml(priority.reason) + '</span></div>';
      }
      if (actions.length > 0) {
        html += '<div class="detail-section-title">Actions</div>';
        for (const action of actions) {
          html += '<div style="margin-bottom:8px;padding:8px 10px;background:var(--bg-summary);border-radius:6px">' +
            '<div style="font-size:0.82rem;font-weight:600;color:var(--text-secondary)">' + escapeHtml(action.action) + '</div>' +
            '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">' + escapeHtml(action.detail) + '</div>' +
            (action.deadline ? '<div style="font-size:0.68rem;color:var(--warning);margin-top:3px">Deadline: ' + escapeHtml(action.deadline) + '</div>' : '') +
            '</div>';
        }
      }
      html += '<div class="detail-section-title">Full Body</div>';
      body.innerHTML = html;
      // Fetch full body
      fetch('/api/email/' + email.id).then(r => r.json()).then(d => {
        const pre = document.createElement('div');
        pre.className = 'detail-body-text';
        pre.textContent = d.body || d.snippet || 'No content.';
        body.appendChild(pre);
      }).catch(() => {
        const pre = document.createElement('div');
        pre.className = 'detail-body-text';
        pre.textContent = email.snippet || 'Could not load email body.';
        body.appendChild(pre);
      });
    }

    function generateSummary(email) {
      const text = (email.body || email.snippet || '').replace(/\s+/g, ' ').trim();
      if (!text) return 'No content to summarize.';
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const meaningful = sentences.filter(s => s.trim().length > 20);
      return meaningful.slice(0, 3).join(' ').trim() || text.substring(0, 300);
    }

    // ===== RULES PANEL =====
    function openRulesPanel() {
      document.getElementById('rules-panel').classList.add('open');
      document.getElementById('rules-overlay').classList.add('open');
      renderRules();
    }
    function closeRulesPanel() {
      document.getElementById('rules-panel').classList.remove('open');
      document.getElementById('rules-overlay').classList.remove('open');
    }
    function renderRules() {
      const list = document.getElementById('rules-list');
      if (priorityRules.length === 0) { list.innerHTML = '<div style="color:var(--text-faint);font-size:0.8rem;text-align:center;padding:20px">No rules yet. Add one below.</div>'; return; }
      list.innerHTML = priorityRules.map((rule, i) =>
        '<div class="rule-item">' +
          '<span class="rule-sender" title="' + escapeHtml(rule.sender) + '">' + escapeHtml(rule.sender) + '</span>' +
          '<span class="rule-priority ' + rule.priority + '">' + rule.priority + '</span>' +
          '<button class="rule-del" onclick="deleteRule(' + i + ')"><svg class="svg-icon" viewBox="0 0 24 24" style="width:14px;height:14px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</div>'
      ).join('');
    }
    function addRule() {
      const sender = document.getElementById('rule-sender').value.trim().toLowerCase();
      const priority = document.getElementById('rule-priority').value;
      if (!sender) return;
      priorityRules.push({ sender, priority });
      localStorage.setItem('reyanshOS_rules', JSON.stringify(priorityRules));
      document.getElementById('rule-sender').value = '';
      renderRules();
    }
    function deleteRule(i) {
      priorityRules.splice(i, 1);
      localStorage.setItem('reyanshOS_rules', JSON.stringify(priorityRules));
      renderRules();
    }

    // ===== EXPORT =====
    function openExportModal() {
      document.getElementById('export-modal').classList.add('open');
    }
    function closeExportModal() {
      document.getElementById('export-modal').classList.remove('open');
    }
    function doExport() {
      let md = '# ReyanshOS Priority Report\n\n';
      md += 'Generated: ' + new Date().toLocaleString() + '\n\n';
      md += '## Category: ' + currentCategory + '\n\n';
      const po = { high: 0, medium: 1, low: 2, ignore: 3 };
      const sorted = [...allEmails].sort((a, b) => {
        const aA = analyzedEmails.get(a.id), bA = analyzedEmails.get(b.id);
        return (po[aA?.priority?.level] ?? 2) - (po[bA?.priority?.level] ?? 2);
      });
      for (const email of sorted) {
        const analysis = analyzedEmails.get(email.id);
        const level = analysis?.priority?.level || 'unknown';
        const reason = analysis?.priority?.reason || '';
        const actions = analysis?.actions || [];
        md += '### [' + level.toUpperCase() + '] ' + email.subject + '\n';
        md += '- **From:** ' + email.from + '\n';
        md += '- **Date:** ' + formatDate(email.date) + '\n';
        md += '- **Priority:** ' + level + ' — ' + reason + '\n';
        if (actions.length > 0 && actions[0].action !== 'No action needed') {
          md += '- **Actions:**\n';
          for (const a of actions) md += '  - ' + a.action + ': ' + a.detail + (a.deadline ? ' (by ' + a.deadline + ')' : '') + '\n';
        }
        md += '\n';
      }
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'reyanshos-report-' + currentCategory + '.md';
      a.click(); URL.revokeObjectURL(url);
      closeExportModal();
    }

    // ===== REFRESH =====
    function refresh() {
      delete categoryCache[currentCategory];
      analyzedEmails = new Map(); allEmails = [];
      resetTimer(); fetchEmails();
    }

    // ===== TIMER =====
    function resetTimer() { countdown = 600; updateTimerDisplay(); }
    function updateTimerDisplay() {
      const m = Math.floor(countdown / 60); const s = countdown % 60;
      document.getElementById('timer').textContent = m + ':' + s.toString().padStart(2, '0');
    }
    function startTimer() {
      setInterval(() => {
        countdown--; updateTimerDisplay();
        if (countdown <= 0) { if (currentPlatform === 'gmail') fetchEmails(); resetTimer(); }
      }, 1000);
    }

    // ===== UTILS =====
    function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
    function formatDate(d) { if (!d) return ''; try { return new Date(d).toLocaleString(); } catch { return d; } }

    // ===== INIT =====
    fetchEmails();
    startTimer();
  