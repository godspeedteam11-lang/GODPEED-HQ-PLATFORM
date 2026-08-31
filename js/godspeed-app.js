/**
 * GODSPEED HQ - PORTAL 1: Public & Member Portal Controller (PRD v1.1 Architecture)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Fail-Safe Data Store Resolver
  function getStore() {
    if (window.godspeedStore) return window.godspeedStore;
    if (typeof GodspeedStore !== 'undefined') {
      window.godspeedStore = new GodspeedStore();
      return window.godspeedStore;
    }
    return null;
  }

  const store = getStore();

  // Active View Route State
  let currentRoute = '/';

  // Public & Auth Views
  const viewPublicLanding = document.getElementById('view-public-landing');
  const viewPublicLogin = document.getElementById('view-public-login');
  const viewPublicSignup = document.getElementById('view-public-signup');

  // Authenticated Member App Layout
  const viewMemberPortal = document.getElementById('view-member-portal');

  // Member Sub-Views
  const viewMemberDashboard = document.getElementById('view-member-dashboard');
  const viewTeamDashboard = document.getElementById('view-team-dashboard');
  const viewOfficeDashboard = document.getElementById('view-office-dashboard');
  const tabGeneralContent = document.getElementById('view-general-tab');

  // DOM Handles
  const viewTitle = document.getElementById('view-title-heading');
  const viewSubtitle = document.getElementById('view-title-sub');
  const dashboardSwitcherSelect = document.getElementById('dashboard-switcher-select');
  const userIdentitySelect = document.getElementById('user-identity-select');

  // Sidebar Nav Sections
  const navSectionTeam = document.getElementById('nav-section-team');
  const navSectionLeader = document.getElementById('nav-section-leader');

  // Forms
  const formPublicLogin = document.getElementById('form-public-login');
  const formPublicSignup = document.getElementById('form-public-signup');

  // Modals
  const modalAttendance = document.getElementById('modal-attendance');
  const btnOpenAttendance = document.getElementById('btn-open-attendance-modal');
  const btnCloseAttendance = document.getElementById('btn-close-attendance');
  const btnSimulateScan = document.getElementById('btn-simulate-attendance-scan');

  const modalEarning = document.getElementById('modal-earning');
  const btnOpenEarning = document.getElementById('btn-open-earning-modal');
  const btnCloseEarning = document.getElementById('btn-close-earning');
  const formAddEarning = document.getElementById('form-add-earning');

  /* Tenant Subdomain & URL Slug Resolution (SaaS Spec §5) */
  function handleTenantUrlRouting() {
    let slug = null;
    let subAction = null;

    // 1. Check Subdomain (e.g. akure.legacyosapp.com or akure.localhost)
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length >= 3 && !['app', 'www', 'api', 'admin', 'stage', 'preview'].includes(parts[0].toLowerCase())) {
      slug = parts[0].toLowerCase();
    }

    // 2. Check / Fallback to Hash routing (e.g. #/o/:slug or #/o/:slug/join)
    const hash = window.location.hash || '';
    const match = hash.match(/^#\/o\/([^\/]+)(?:\/(join|login))?/);
    if (match) {
      slug = match[1].toLowerCase();
      subAction = match[2];
    }

    if (slug) {
      const office = store.resolveOfficeBySlug(slug);
      if (office) {
        // Apply dynamic tenant branding colors
        if (office.primaryBrandColor) {
          document.documentElement.style.setProperty('--accent-primary', office.primaryBrandColor);
        }
        if (office.secondaryBrandColor) {
          document.documentElement.style.setProperty('--accent-secondary', office.secondaryBrandColor);
        }

        // Apply tenant logo if present
        if (office.logoUrl) {
          const brandLogos = document.querySelectorAll('.public-brand .brand-logo, .brand-header .brand-logo');
          brandLogos.forEach(logoEl => {
            logoEl.innerHTML = `<img src="${escapeHTML(office.logoUrl)}" alt="${escapeHTML(office.name)}" style="width:100%; height:100%; object-fit:contain; border-radius:inherit;">`;
          });
        }

        // Update WhatsApp support button
        const waBtn = document.getElementById('legacyos-whatsapp-floating-btn');
        if (waBtn && office.whatsappNumber) {
          const cleanPhone = office.whatsappNumber.replace(/[^0-9]/g, '');
          waBtn.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hello ${office.name} Support, I need assistance.`)}`;
        }

        // Set signup office select to current tenant office
        const signupOfficeSelect = document.getElementById('signup-office');
        if (signupOfficeSelect) {
          let opt = Array.from(signupOfficeSelect.options).find(o => o.value === office.code || o.value === office.id || o.value === office.slug);
          if (!opt) {
            opt = new Option(office.name, office.id, true, true);
            signupOfficeSelect.add(opt);
          }
          signupOfficeSelect.value = opt.value;
        }

        if (subAction === 'join') {
          routeTo('/signup');
          return true;
        } else if (subAction === 'login') {
          routeTo('/login');
          return true;
        }
        return true;
      }
    }
    return false;
  }

  /* Application Initialization */
  async function init() {
    setupPublicAuthEvents();
    setupNavigationListeners();
    setupEventListeners();
    setupUserIdentitySwitcher();
    setupDashboardSwitcher();
    setupSupabaseAuthListener();
    setupRealtimeSubscriptions();

    window.addEventListener('hashchange', handleTenantUrlRouting);

    // Ensure session is synchronized before checking permissions
    await store.syncSupabaseSession();

    // Trigger non-blocking automated reminders check
    store.runAutomatedReminders().catch(() => {});

    // Check if URL has tenant slug routing
    const routedTenant = handleTenantUrlRouting();
    if (routedTenant) return;

    // Check existing auth session state
    if (store.isAuthenticated && store.currentUserId) {
      const perms = store.getUserPermissions();
      routeTo(perms.defaultRoute || '/dashboard');
    } else {
      routeTo('/');
    }
  }

  /* Listen to Real Supabase Auth State Changes */
  function setupSupabaseAuthListener() {
    if (window.supabaseAuth) {
      window.supabaseAuth.onAuthChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          store.syncSupabaseSession().then(() => {
            const perms = store.getUserPermissions();
            routeTo(perms.defaultRoute || '/dashboard');
          });
        } else if (event === 'SIGNED_OUT') {
          routeTo('/');
        }
      });
    }
  }

  /* Public Authentication Listeners */
  function setupPublicAuthEvents() {
    // Navigation to Public Sign In / Sign Up
    document.querySelectorAll('.btn-to-login').forEach(btn => {
      btn.addEventListener('click', (e) => { e.preventDefault(); routeTo('/login'); });
    });
    document.querySelectorAll('.btn-to-signup').forEach(btn => {
      btn.addEventListener('click', (e) => { e.preventDefault(); routeTo('/signup'); });
    });
    document.querySelectorAll('.btn-to-landing').forEach(btn => {
      btn.addEventListener('click', (e) => { e.preventDefault(); routeTo('/'); });
    });

    // Public Sign In Form Submit
    if (formPublicLogin) {
      formPublicLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = formPublicLogin.querySelector('button[type="submit"]');
        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '<i class="fas fa-sign-in-alt"></i> Sign In';

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
          alert('Please enter your email address and password.');
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
          }

          const activeStore = getStore();
          if (!activeStore) {
            alert('System error: Data store is still initializing. Please wait a moment and try again.');
            return;
          }

          const authRes = await activeStore.authenticateUser(email, password);
          if (authRes.success) {
            const memberName = (authRes.member && authRes.member.name) ? authRes.member.name : 'Member';
            showToast(`Welcome back, ${memberName}!`);
            const targetRoute = (authRes.permissions && authRes.permissions.defaultRoute) ? authRes.permissions.defaultRoute : '/dashboard';
            routeTo(targetRoute);
          } else {
            alert('Sign In Failed: ' + authRes.message);
          }
        } catch (err) {
          console.error('Sign in submit exception:', err);
          alert('Sign In Failed: ' + (err.message || err));
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
          }
        }
      });
    }

    // Public Sign Up Handler (Form Submit + Direct Button Click Support)
    async function handleSignupExecution(e) {
      if (e) e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-signup') || formPublicSignup?.querySelector('button[type="submit"]');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '<i class="fas fa-check-circle"></i> Create Member Account';
      
      const nameInput = document.getElementById('signup-name');
      const emailInput = document.getElementById('signup-email');
      const phoneInput = document.getElementById('signup-phone');
      const passwordInput = document.getElementById('signup-password');
      const sponsorInput = document.getElementById('signup-sponsor');
      const officeSelect = document.getElementById('signup-office');

      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const sponsor = sponsorInput ? sponsorInput.value.trim() : '';
      const office = officeSelect ? officeSelect.value : 'HQ-AKR';

      console.log('Initiating member signup:', { name, email, phone, office });

      if (!name) {
        alert('Please enter your Full Name.');
        if (nameInput) nameInput.focus();
        return;
      }
      if (!email || !email.includes('@')) {
        alert('Please enter a valid Email Address.');
        if (emailInput) emailInput.focus();
        return;
      }
      if (!password || password.length < 6) {
        alert('Password must be at least 6 characters long.');
        if (passwordInput) passwordInput.focus();
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
        }

        const activeStore = getStore();
        if (!activeStore) {
          alert('System error: Data store is still initializing. Please wait 2 seconds and click again.');
          return;
        }

        const regRes = await activeStore.registerMember(name, email, phone, password, sponsor, office);
        console.log('registerMember response:', regRes);
        
        if (regRes.success) {
          if (formPublicSignup) formPublicSignup.reset();
          if (regRes.requiresConfirmation) {
            alert(regRes.message);
            routeTo('/login');
          } else {
            showToast(`Account created! Welcome to GODSPEED HQ, ${name}.`);
            const perms = activeStore.getUserPermissions();
            routeTo(perms.defaultRoute || '/dashboard');
          }
        } else {
          alert('Create Account Failed: ' + regRes.message);
        }
      } catch (err) {
        console.error('Sign up unexpected error:', err);
        alert('Account creation error: ' + (err.message || err));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
        }
      }
    }

    if (formPublicSignup) {
      formPublicSignup.addEventListener('submit', handleSignupExecution);
    }

    const btnSubmitSignup = document.getElementById('btn-submit-signup');
    if (btnSubmitSignup) {
      btnSubmitSignup.addEventListener('click', (e) => {
        // If button is inside form, submit event handles it; otherwise invoke directly
        if (!formPublicSignup) handleSignupExecution(e);
      });
    }

    // Logout button
    document.querySelectorAll('.btn-member-logout').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await store.logout();
        showToast('Logged out successfully.');
        routeTo('/');
      });
    });
  }

  /* User Identity Switcher (Simulating Login as Different Users) */
  function setupUserIdentitySwitcher() {
    if (!userIdentitySelect) return;
    if (store.currentUserId) userIdentitySelect.value = store.currentUserId;

    userIdentitySelect.addEventListener('change', (e) => {
      const newUserId = e.target.value;
      store.setCurrentUser(newUserId);
      store.isAuthenticated = true;

      const perms = store.getUserPermissions(newUserId);
      showToast(`Switched login context to: ${perms.member.name} (${perms.role.toUpperCase()})`);

      updateSidebarNavigation();
      updateDashboardSwitcher();
      routeTo(perms.defaultRoute);
    });
  }

  /* Controlled Dashboard Switcher Header Control */
  function setupDashboardSwitcher() {
    if (!dashboardSwitcherSelect) return;

    dashboardSwitcherSelect.addEventListener('change', (e) => {
      const targetRoute = e.target.value;
      routeTo(targetRoute);
    });
  }

  function updateDashboardSwitcher() {
    if (!dashboardSwitcherSelect) return;

    const options = store.getAuthorizedSwitcherOptions();
    dashboardSwitcherSelect.innerHTML = options.map(opt => `
      <option value="${opt.route}" ${currentRoute === opt.route ? 'selected' : ''}>
        ${escapeHTML(opt.label)}
      </option>
    `).join('');
  }

  /* Permission-Aware Navigation Builder */
  function updateSidebarNavigation() {
    const perms = store.getUserPermissions();

    const userAvatar = document.getElementById('sidebar-user-avatar');
    const userName = document.getElementById('sidebar-user-name');
    const userRole = document.getElementById('sidebar-user-role');

    if (perms.member) {
      if (userAvatar) userAvatar.innerText = perms.member.name.split(' ').map(n=>n[0]).join('');
      if (userName) userName.innerText = perms.member.name;
      if (userRole) userRole.innerText = `${perms.role.toUpperCase()} • ${formatRank(perms.member.rank)}`;
    }

    if (navSectionTeam) navSectionTeam.style.display = perms.canAccessTeam ? 'block' : 'none';
    if (navSectionLeader) navSectionLeader.style.display = perms.canAccessOffice ? 'block' : 'none';

    const navSectionNetwork = document.getElementById('nav-section-network');
    const isDirectorOrHigher = ['director', 'emerald_director', 'ruby_director', 'diamond_director'].includes(perms.member?.rank) || 
      perms.isSuperAdmin || 
      store.directorNetworks.some(n => n.directorId === store.currentUserId);
    if (navSectionNetwork) navSectionNetwork.style.display = isDirectorOrHigher ? 'block' : 'none';

    document.querySelectorAll('.nav-link').forEach(link => {
      const linkRoute = link.getAttribute('data-route') || link.getAttribute('data-tab');
      if (linkRoute === currentRoute || link.getAttribute('data-tab') === currentRoute.replace('/', '')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  function setupNavigationListeners() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetRoute = link.getAttribute('data-route') || link.getAttribute('data-tab');
        routeTo(targetRoute.startsWith('/') ? targetRoute : `/${targetRoute}`);
      });
    });
  }

  /* Permission Boundary Router */
  function routeTo(targetRoute) {
    // Explicit Public Routes Handling
    if (targetRoute === '/signup') {
      if (viewMemberPortal) viewMemberPortal.style.display = 'none';
      if (viewPublicLanding) viewPublicLanding.style.display = 'none';
      if (viewPublicLogin) viewPublicLogin.style.display = 'none';
      if (viewPublicSignup) viewPublicSignup.style.display = 'flex';
      currentRoute = '/signup';
      return;
    }

    if (targetRoute === '/login') {
      if (viewMemberPortal) viewMemberPortal.style.display = 'none';
      if (viewPublicLanding) viewPublicLanding.style.display = 'none';
      if (viewPublicSignup) viewPublicSignup.style.display = 'none';
      if (viewPublicLogin) viewPublicLogin.style.display = 'flex';
      currentRoute = '/login';
      return;
    }

    if (targetRoute === '/') {
      if (viewMemberPortal) viewMemberPortal.style.display = 'none';
      if (viewPublicLogin) viewPublicLogin.style.display = 'none';
      if (viewPublicSignup) viewPublicSignup.style.display = 'none';
      if (viewPublicLanding) viewPublicLanding.style.display = 'flex';
      currentRoute = '/';
      return;
    }

    // Unauthenticated user attempting to access private routes
    if (!store.isAuthenticated) {
      if (viewMemberPortal) viewMemberPortal.style.display = 'none';
      if (viewPublicLogin) viewPublicLogin.style.display = 'none';
      if (viewPublicSignup) viewPublicSignup.style.display = 'none';
      if (viewPublicLanding) viewPublicLanding.style.display = 'flex';
      currentRoute = '/';
      return;
    }

    // Authenticated Routes
    if (viewPublicLanding) viewPublicLanding.style.display = 'none';
    if (viewPublicLogin) viewPublicLogin.style.display = 'none';
    if (viewPublicSignup) viewPublicSignup.style.display = 'none';
    if (viewMemberPortal) viewMemberPortal.style.display = 'flex';

    const perms = store.getUserPermissions();

    // Security Boundary Check
    if (!store.canAccessRoute(store.currentUserId, targetRoute)) {
      showToast(`Security Boundary Blocked: Access to ${targetRoute} requires higher permissions.`);
      currentRoute = perms.defaultRoute;
    } else {
      currentRoute = targetRoute;
    }

    // Hide Sub Views
    if (viewMemberDashboard) viewMemberDashboard.style.display = 'none';
    if (viewTeamDashboard) viewTeamDashboard.style.display = 'none';
    if (viewOfficeDashboard) viewOfficeDashboard.style.display = 'none';
    if (tabGeneralContent) tabGeneralContent.style.display = 'none';

    if (currentRoute === '/dashboard') {
      if (viewMemberDashboard) viewMemberDashboard.style.display = 'block';
      if (viewTitle) viewTitle.innerText = 'My Personal Operating Dashboard';
      if (viewSubtitle) viewSubtitle.innerText = 'Personal performance, rank progress, tasks, and learning milestones';
      renderMemberDashboard();
    } else if (currentRoute === '/team') {
      if (viewTeamDashboard) viewTeamDashboard.style.display = 'block';
      if (viewTitle) viewTitle.innerText = 'My Team (Genealogy Subtree)';
      if (viewSubtitle) viewSubtitle.innerText = 'Authorized downline members, team PV aggregates, and health signals';
      renderUplineTeamDashboard();
    } else if (currentRoute === '/office-dashboard') {
      if (viewOfficeDashboard) viewOfficeDashboard.style.display = 'block';
      if (viewTitle) viewTitle.innerText = 'Office Management Dashboard';
      if (viewSubtitle) viewSubtitle.innerText = 'Office member roster, attendance tracking, dues arrears, and carriage queue';
      renderOfficeDashboard();
    } else {
      if (tabGeneralContent) tabGeneralContent.style.display = 'block';
      renderGeneralTab(currentRoute.replace('/', ''));
    }

    updateSidebarNavigation();
    updateDashboardSwitcher();
  }

  /* RENDER 1: MEMBER PERSONAL DASHBOARD (/dashboard) */
  function renderMemberDashboard() {
    const member = store.getCurrentUser();
    if (!member) return;
    const qpv = store.calculateQPVBaseline(member.id);

    const personalPVs = store.pvSubmissions.filter(p => p.memberId === member.id && p.status === 'approved');
    const myApprovedPV = personalPVs.reduce((sum, p) => sum + Number(p.pvAmount), 0);

    const myEarnings = store.earningsLedger.filter(e => e.memberId === member.id);
    const myNetEarnings = myEarnings.reduce((sum, e) => sum + Number(e.net), 0);

    const elemName = document.getElementById('member-dash-name');
    const elemRank = document.getElementById('member-dash-rank');
    const elemPv = document.getElementById('member-dash-pv');
    const elemQpv = document.getElementById('member-dash-qpv');
    const elemEarnings = document.getElementById('member-dash-earnings');

    if (elemName) elemName.innerText = member.name;
    if (elemRank) elemRank.innerText = formatRank(member.rank);
    if (elemPv) elemPv.innerText = `${myApprovedPV} PV`;
    if (elemQpv) elemQpv.innerText = `${qpv.totalPV} QPV`;
    if (elemEarnings) elemEarnings.innerText = `₦${myNetEarnings.toLocaleString()}`;
  }

  /* RENDER 2: UPLINE / ANCESTOR TEAM VIEW (/team) */
  function renderUplineTeamDashboard() {
    const container = document.getElementById('team-view-container');
    if (!container) return;

    const member = store.getCurrentUser();
    const descendantIds = store.getDescendantIds(member.id);
    const descendants = store.members.filter(m => descendantIds.includes(m.id));

    if (descendants.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:3rem; color:var(--text-muted);">
          <i class="fas fa-users-slash" style="font-size:2rem; margin-bottom:0.75rem; display:block; color:var(--accent-primary);"></i>
          <h4>No Authorized Downline Members Found</h4>
          <p style="font-size:0.85rem;">You do not currently have downline recruits in your genealogy subtree.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="metrics-row">
        <div class="metric-box">
          <div class="metric-title"><span>Downline Team Count</span><i class="fas fa-users"></i></div>
          <div class="metric-number">${descendants.length}</div>
          <div class="metric-sub">Direct & Indirect Recruits</div>
        </div>
        <div class="metric-box">
          <div class="metric-title"><span>Subtree Aggregate QPV</span><i class="fas fa-chart-bar"></i></div>
          <div class="metric-number" style="color:var(--status-green)">${store.calculateQPVBaseline(member.id).totalPV} QPV</div>
          <div class="metric-sub">Period: 2026-08</div>
        </div>
      </div>

      <div class="card-panel">
        <div class="panel-head"><h3><i class="fas fa-sitemap"></i> Subtree Members Roster</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Sponsor</th>
                <th>Rank</th>
                <th>Office</th>
                <th>QPV Progress</th>
              </tr>
            </thead>
            <tbody>
              ${descendants.map(desc => {
                const sponsor = store.members.find(m => m.id === desc.sponsorId) || { name: 'Direct' };
                const descQPV = store.calculateQPVBaseline(desc.id);
                return `
                  <tr>
                    <td>
                      <div class="member-info-cell">
                        <div class="avatar">${desc.name.split(' ').map(n=>n[0]).join('')}</div>
                        <div><h5>${escapeHTML(desc.name)}</h5><p>${desc.code}</p></div>
                      </div>
                    </td>
                    <td>${escapeHTML(sponsor.name)}</td>
                    <td><span class="badge-rank">${formatRank(desc.rank)}</span></td>
                    <td>${desc.officeId}</td>
                    <td><strong>${descQPV.totalPV} QPV</strong> (Eligible: ${formatRank(descQPV.eligibleRankFlag)})</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* RENDER 3: TEAM LEADER OFFICE DASHBOARD (/office-dashboard) */
  function renderOfficeDashboard() {
    const container = document.getElementById('office-view-container');
    if (!container) return;

    const leader = store.getCurrentUser();
    const office = store.offices.find(o => o.teamLeaderId === leader.id) || store.offices[0];
    const officeMembers = store.members.filter(m => m.officeId === office.id);

    const today = new Date().toISOString().split('T')[0];
    const officeAttendanceToday = store.attendanceLogs.filter(l => l.officeId === office.id && l.date === today);

    container.innerHTML = `
      <div class="metrics-row">
        <div class="metric-box">
          <div class="metric-title"><span>Office Members</span><i class="fas fa-building"></i></div>
          <div class="metric-number">${officeMembers.length}</div>
          <div class="metric-sub">${escapeHTML(office.name)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-title"><span>Present Today</span><i class="fas fa-check-circle" style="color:var(--status-green)"></i></div>
          <div class="metric-number" style="color:var(--status-green)">${officeAttendanceToday.length}</div>
          <div class="metric-sub">Geofenced Radius: ${office.radiusMeters}m</div>
        </div>
      </div>

      <div class="card-panel">
        <div class="panel-head">
          <h3><i class="fas fa-id-badge"></i> Office Roster (${escapeHTML(office.name)})</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Rank</th>
                <th>Email</th>
                <th>System Status</th>
              </tr>
            </thead>
            <tbody>
              ${officeMembers.map(m => `
                <tr>
                  <td>
                    <div class="member-info-cell">
                      <div class="avatar">${m.name.split(' ').map(n=>n[0]).join('')}</div>
                      <div><h5>${escapeHTML(m.name)}</h5><p>${m.code}</p></div>
                    </div>
                  </td>
                  <td>${m.role}</td>
                  <td>
                    <select class="leader-rank-select" data-member-id="${m.id}" style="background:var(--bg-input); color:#fff; border:1px solid var(--border-color); padding:0.35rem 0.5rem; border-radius:4px; font-size:0.8rem;">
                      <option value="newbie" ${m.rank === 'newbie' ? 'selected' : ''}>Newbie</option>
                      <option value="manager" ${m.rank === 'manager' ? 'selected' : ''}>Manager</option>
                      <option value="senior_manager" ${m.rank === 'senior_manager' ? 'selected' : ''}>Senior Manager</option>
                      <option value="executive_manager" ${m.rank === 'executive_manager' ? 'selected' : ''}>Executive Manager</option>
                      <option value="director" ${m.rank === 'director' ? 'selected' : ''}>Director</option>
                      <option value="sapphire_director" ${m.rank === 'sapphire_director' ? 'selected' : ''}>Sapphire Director</option>
                      <option value="ruby_director" ${m.rank === 'ruby_director' ? 'selected' : ''}>Ruby Director</option>
                      <option value="emerald_director" ${m.rank === 'emerald_director' ? 'selected' : ''}>Emerald Director</option>
                      <option value="diamond_director" ${m.rank === 'diamond_director' ? 'selected' : ''}>Diamond Director</option>
                      <option value="president_team" ${m.rank === 'president_team' ? 'selected' : ''}>President's Team</option>
                    </select>
                  </td>
                  <td>${escapeHTML(m.email)}</td>
                  <td><span class="badge badge-green">Active Member</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Attach event listeners for leader rank updates
    container.querySelectorAll('.leader-rank-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const memberId = e.target.getAttribute('data-member-id');
        const newRank = e.target.value;
        const res = await store.updateMemberRank(memberId, newRank);
        if (res.success) {
          showToast(res.message);
        } else {
          alert('Failed to update rank: ' + res.message);
        }
      });
    });
  }

  /* RENDER GENERAL TAB VIEWS */
  function renderGeneralTab(tabName) {
    document.querySelectorAll('.general-tab-pane').forEach(p => p.style.display = 'none');
    const activePane = document.getElementById(`pane-${tabName}`);
    if (activePane) activePane.style.display = 'block';

    if (viewTitle) {
      const titleMap = {
        'leaderboard': 'Live Earnings Leaderboard',
        'training': 'Training & Member Progression Management',
        'network': 'World Team Director Multi-Office Network',
        'office-settings': 'Office Settings & Custom Tenant Branding',
        'genealogy': 'Genealogy & Team Tree Inspector',
        'attendance': 'GPS & QR Attendance Audit Log',
        'pv': 'NeoLife PV Submissions & Carriage State Machine',
        'freelance': 'Freelance Earnings & 10/20/70 Allocation Ledger',
        'dues': 'Office Dues Ledger',
        'health': 'Leadership Health & Risk Intelligence',
        'chat': 'Hierarchical Communication Channel',
        'notice': 'Official Notice Board & Community Forum'
      };
      viewTitle.innerText = titleMap[tabName] || 'GODSPEED HQ';
    }

    if (viewSubtitle) {
      const subtitleMap = {
        'leaderboard': 'Real-time earnings rankings computed from verified ledger entries across offices',
        'training': 'Curriculum stages, module completion, tutor assignments, and session attendance',
        'network': 'Cross-office oversight, network-wide attendance, and earnings rollup for Directors',
        'office-settings': 'Manage office identity, web address slug, logo, colors, and 30-day trial status',
        'attendance': 'Cryptographically verified GPS geofence and QR code attendance logs',
        'pv': 'NeoLife order verification, PV point validation, and physical carriage receipts',
        'freelance': '10/20/70 freelance revenue split and automatic office dues calculation',
        'dues': 'Track membership and operational dues status and payment history',
        'health': 'Automated attendance and activity health scoring to flag at-risk members',
        'chat': 'Direct communication across upline and office teams',
        'notice': 'Official bulletins and community announcements'
      };
      viewSubtitle.innerText = subtitleMap[tabName] || '';
    }

    if (tabName === 'leaderboard') renderLiveLeaderboard();
    else if (tabName === 'training') renderTrainingPane();
    else if (tabName === 'network') renderDirectorNetworkPane();
    else if (tabName === 'office-settings') renderOfficeSettingsPane();
    else if (tabName === 'attendance') renderAttendancePane();
    else if (tabName === 'pv') renderPVPane();
    else if (tabName === 'freelance') renderFreelancePane();
    else if (tabName === 'dues') renderDuesPane();
    else if (tabName === 'health') renderHealthPane();
    else if (tabName === 'notice') renderNoticeBoardPane();
    else if (tabName === 'genealogy') renderGenealogyPane();
    else if (tabName === 'chat') renderChatPane();
  }

  function renderAttendancePane() {
    const tbody = document.getElementById('attendance-logs-body');
    if (!tbody) return;
    if (store.attendanceLogs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No attendance records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = store.attendanceLogs.map(log => {
      const member = store.members.find(m => m.id === log.memberId) || { name: log.memberId, code: '' };
      const office = store.offices.find(o => o.id === log.officeId) || { name: log.officeId || 'GODSPEED HQ Ikeja' };
      const statusBadge = log.status === 'success' 
        ? '<span class="badge badge-green">Verified</span>' 
        : '<span class="badge badge-red">Flagged</span>';

      return `
        <tr>
          <td>
            <div class="member-info-cell">
              <div class="avatar">${member.name.split(' ').map(n=>n[0]).join('')}</div>
              <div><h5>${escapeHTML(member.name)}</h5><p>${member.code}</p></div>
            </div>
          </td>
          <td>${escapeHTML(office.name)}</td>
          <td>${log.date || ''} ${log.time || ''}</td>
          <td>${statusBadge}</td>
          <td>${log.distanceMeters || 12.4}m radius</td>
          <td>
            <span class="badge badge-blue"><i class="fas fa-qrcode"></i> QR</span>
            <span class="badge badge-green"><i class="fas fa-user-check"></i> Face</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPVPane() {
    const tbody = document.getElementById('pv-submissions-body');
    if (!tbody) return;
    if (store.pvSubmissions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No PV submissions recorded.</td></tr>`;
      return;
    }

    const statusMap = {
      'pv_submitted': '<span class="badge badge-blue">PV Submitted</span>',
      'ready_for_pickup': '<span class="badge badge-purple">Ready for Pickup</span>',
      'carriage_uploaded': '<span class="badge badge-amber">Carriage Uploaded</span>',
      'under_review': '<span class="badge badge-amber">Under Review</span>',
      'approved': '<span class="badge badge-green">Approved</span>',
      'declined': '<span class="badge badge-red">Declined</span>'
    };

    tbody.innerHTML = store.pvSubmissions.map(pv => {
      const member = store.members.find(m => m.id === pv.memberId) || { name: pv.memberId };
      return `
        <tr>
          <td><strong>${pv.orderRef || pv.id}</strong></td>
          <td>${escapeHTML(member.name)}</td>
          <td>${pv.period}</td>
          <td><strong>${pv.pvAmount} PV</strong></td>
          <td>${statusMap[pv.status] || pv.status}</td>
          <td>${pv.expectedPickup || 'Pending'}</td>
          <td>
            <select class="pv-status-select" data-pv-id="${pv.id}" style="background:var(--bg-input); color:#fff; border:1px solid var(--border-color); padding:0.25rem 0.4rem; border-radius:4px; font-size:0.75rem;">
              <option value="pv_submitted" ${pv.status === 'pv_submitted' ? 'selected' : ''}>Submitted</option>
              <option value="ready_for_pickup" ${pv.status === 'ready_for_pickup' ? 'selected' : ''}>Ready for Pickup</option>
              <option value="under_review" ${pv.status === 'under_review' ? 'selected' : ''}>Under Review</option>
              <option value="approved" ${pv.status === 'approved' ? 'selected' : ''}>Approve</option>
              <option value="declined" ${pv.status === 'declined' ? 'selected' : ''}>Decline</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.pv-status-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const pvId = e.target.getAttribute('data-pv-id');
        const newStat = e.target.value;
        const res = await store.updatePVStatus(pvId, newStat);
        if (res.success) {
          showToast(`PV Submission state updated to ${newStat.toUpperCase()}`);
        } else {
          alert('Failed to update PV status: ' + res.message);
        }
        renderPVPane();
      });
    });
  }

  function renderFreelancePane() {
    const tbody = document.getElementById('earnings-ledger-body');
    if (!tbody) return;
    if (store.earningsLedger.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No freelance earnings logged.</td></tr>`;
      return;
    }

    tbody.innerHTML = store.earningsLedger.map(e => {
      const member = store.members.find(m => m.id === e.memberId) || { name: e.memberId };
      return `
        <tr>
          <td>${e.date}</td>
          <td>${escapeHTML(member.name)}</td>
          <td><strong>${escapeHTML(e.source)}</strong></td>
          <td style="color:var(--accent-secondary); font-weight:700;">₦${Number(e.net).toLocaleString()}</td>
          <td>
            <span class="badge badge-purple">10% Office: ₦${Number(e.officeDue10).toLocaleString()}</span>
            <span class="badge badge-blue">20% Savings: ₦${Number(e.personal20).toLocaleString()}</span>
            <span class="badge badge-green">70% Fund: ₦${Number(e.business70).toLocaleString()}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderDuesPane() {
    const tbody = document.getElementById('dues-table-body');
    if (!tbody) return;
    if (store.officeDues.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No office dues recorded.</td></tr>`;
      return;
    }

    const statusBadgeMap = {
      'paid': '<span class="badge badge-green">Paid</span>',
      'partially_paid': '<span class="badge badge-amber">Partial</span>',
      'pending': '<span class="badge badge-blue">Pending</span>',
      'overdue': '<span class="badge badge-red">Overdue</span>'
    };

    tbody.innerHTML = store.officeDues.map(d => {
      const member = store.members.find(m => m.id === d.memberId) || { name: d.memberId };
      return `
        <tr>
          <td>${escapeHTML(member.name)}</td>
          <td>${escapeHTML(d.period)}</td>
          <td>₦${Number(d.amount).toLocaleString()}</td>
          <td>₦${Number(d.paidAmount || 0).toLocaleString()}</td>
          <td>${statusBadgeMap[d.status] || d.status}</td>
          <td>${d.dueDate}</td>
        </tr>
      `;
    }).join('');
  }

  function renderHealthPane() {
    const tbody = document.getElementById('health-scores-body');
    if (!tbody) return;

    tbody.innerHTML = store.healthScores.map(h => {
      const member = store.members.find(m => m.id === h.memberId) || { name: h.memberId };
      const statusBadge = h.healthStatus === 'green'
        ? '<span class="badge badge-green"><i class="fas fa-heartbeat"></i> GREEN (Healthy)</span>'
        : h.healthStatus === 'amber'
        ? '<span class="badge badge-amber"><i class="fas fa-exclamation-circle"></i> AMBER (At-Risk)</span>'
        : '<span class="badge badge-red"><i class="fas fa-skull"></i> RED (Critical)</span>';

      const signals = (h.signals || []).map(s => `<span class="badge badge-blue">${escapeHTML(s)}</span>`).join(' ');

      return `
        <tr>
          <td>${escapeHTML(member.name)}</td>
          <td>${statusBadge}</td>
          <td><strong>${h.attendanceRate}%</strong></td>
          <td>${h.mtdPV} PV</td>
          <td>${signals || 'None'}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="alert('Intervention protocol triggered for ${escapeHTML(member.name)}')">Intervene</button></td>
        </tr>
      `;
    }).join('');
  }

  function renderNoticeBoardPane() {
    const container = document.getElementById('notice-board-container');
    if (!container) return;

    const perms = store.getUserPermissions();
    const isLeaderOrAdmin = perms.isSuperAdmin || perms.isTeamLeader;

    let createNoticeHtml = '';
    if (isLeaderOrAdmin) {
      createNoticeHtml = `
        <div class="card-panel" style="margin-bottom:1.5rem; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color);">
          <h4 style="color:#fff; margin-bottom:0.75rem;"><i class="fas fa-bullhorn" style="color:var(--accent-primary)"></i> Publish Official Announcement</h4>
          <form id="form-publish-notice">
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
              <input type="text" id="notice-title" placeholder="Notice Title" required style="padding:0.6rem; background:var(--bg-input); border:1px solid var(--border-color); border-radius:4px; color:#fff; font-size:0.85rem;">
              <select id="notice-category" style="padding:0.6rem; background:var(--bg-input); border:1px solid var(--border-color); border-radius:4px; color:#fff; font-size:0.85rem;">
                <option value="Official Announcement">Official Announcement</option>
                <option value="Finance">Finance</option>
                <option value="Training">Training</option>
                <option value="Operations">Operations</option>
              </select>
            </div>
            <textarea id="notice-content" placeholder="Write announcement details..." required rows="2" style="width:100%; padding:0.6rem; background:var(--bg-input); border:1px solid var(--border-color); border-radius:4px; color:#fff; font-size:0.85rem; margin-bottom:0.75rem;"></textarea>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-paper-plane"></i> Broadcast Notice</button>
            </div>
          </form>
        </div>
      `;
    }

    container.innerHTML = `
      ${createNoticeHtml}
      ${store.noticeBoard.map(n => `
        <div class="card-panel" style="margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <span class="badge badge-blue">${escapeHTML(n.category)}</span>
            <span style="font-size:0.8rem; color:var(--text-muted);">${n.date} • By ${escapeHTML(n.author || 'SuperAdmin')}</span>
          </div>
          <h4 style="color:#fff; margin-bottom:0.5rem;">${escapeHTML(n.title)}</h4>
          <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.5;">${escapeHTML(n.content)}</p>
        </div>
      `).join('')}
    `;

    const noticeForm = document.getElementById('form-publish-notice');
    if (noticeForm) {
      noticeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('notice-title').value;
        const category = document.getElementById('notice-category').value;
        const content = document.getElementById('notice-content').value;

        const res = await store.createNoticeBoardItem(title, content, category);
        if (res.success) {
          showToast('Notice published successfully!');
          renderNoticeBoardPane();
        } else {
          alert('Failed to publish notice: ' + res.message);
        }
      });
    }
  }

  function renderGenealogyPane() {
    const container = document.getElementById('genealogy-tree-container');
    if (!container) return;
    const member = store.getCurrentUser();
    if (!member) return;

    function buildTree(m) {
      const descendants = store.members.filter(d => d.sponsorId === m.id || d.sponsor_id === m.id);
      const qpv = store.calculateQPVBaseline(m.id);
      return `
        <div style="margin-left: 1rem; border-left: 2px dashed var(--border-color); padding-left: 1rem; margin-bottom: 0.75rem;">
          <div style="background: var(--bg-card-hover); border: 1px solid var(--border-color); padding: 0.65rem 1rem; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 0.75rem;">
            <div class="avatar">${m.name.split(' ').map(n=>n[0]).join('')}</div>
            <div>
              <strong>${escapeHTML(m.name)}</strong> <span class="badge-rank">${formatRank(m.rank)}</span>
              <div style="font-size:0.75rem; color:var(--text-muted);">${m.code} • QPV: ${qpv.totalPV}</div>
            </div>
          </div>
          ${descendants.map(child => buildTree(child)).join('')}
        </div>
      `;
    }

    container.innerHTML = buildTree(member);
  }

  function renderChatPane() {
    const pane = document.getElementById('pane-chat');
    if (!pane) return;
    const user = store.getCurrentUser() || { name: 'Member' };
    const perms = store.getUserPermissions();
    const isLeaderOrAdmin = perms.isSuperAdmin || perms.isTeamLeader;

    const visibleMessages = store.chatMessages.filter(m => !m.isSoftDeleted && !m.is_soft_deleted);

    pane.innerHTML = `
      <div class="card-panel">
        <div class="panel-head">
          <h3><i class="fas fa-comments" style="color:var(--accent-primary)"></i> Hierarchical Communication Center (PRD §34.2)</h3>
          <span class="badge badge-green">End-to-End Authenticated Role Channel</span>
        </div>
        <div id="chat-messages-wrap" style="height:320px; overflow-y:auto; background:rgba(0,0,0,0.25); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); margin-bottom:1rem;">
          <div style="margin-bottom:0.75rem; background:rgba(255,255,255,0.03); padding:0.65rem 0.85rem; border-radius:6px;">
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--accent-primary); margin-bottom:0.25rem;">
              <strong>System Notice</strong>
              <span>Always Active</span>
            </div>
            <p style="font-size:0.85rem; color:#eee; margin:0;">Welcome to GODSPEED HQ Channel. Messages are routed via Supabase RLS according to your office and sponsorship hierarchy.</p>
          </div>
          ${visibleMessages.map(msg => `
            <div style="margin-bottom:0.75rem; background:rgba(255,255,255,0.03); padding:0.65rem 0.85rem; border-radius:6px; position:relative;">
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--accent-secondary); margin-bottom:0.25rem;">
                <strong>${escapeHTML(msg.senderName || 'Member')}</strong>
                <span>
                  ${msg.time || 'Just now'}
                  ${isLeaderOrAdmin ? `<button class="btn-moderate-chat" data-msg-id="${msg.id}" title="Moderate Message" style="background:none; border:none; color:var(--status-red); cursor:pointer; margin-left:0.5rem; font-size:0.75rem;"><i class="fas fa-trash-alt"></i></button>` : ''}
                </span>
              </div>
              <p style="font-size:0.85rem; color:#eee; margin:0;">${escapeHTML(msg.content)}</p>
            </div>
          `).join('')}
        </div>
        <form id="form-send-chat" style="display:flex; gap:0.75rem;">
          <input type="text" id="chat-input" placeholder="Type a message to your office & upline channel..." required style="flex:1; padding:0.65rem; background:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-sm); color:#fff; font-size:0.875rem;">
          <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Send</button>
        </form>
      </div>
    `;

    // Auto-scroll chat to bottom
    const wrap = document.getElementById('chat-messages-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;

    // Chat Send Handler
    const chatForm = document.getElementById('form-send-chat');
    if (chatForm) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        if (input && input.value.trim()) {
          const content = input.value.trim();
          input.value = '';
          const res = await store.sendMessage(content);
          if (res.success) {
            renderChatPane();
          } else {
            alert('Failed to send message: ' + res.message);
          }
        }
      });
    }

  /* RENDER SAAS 1: LIVE EARNINGS LEADERBOARD (PRD & SaaS Spec §2) */
  function renderLiveLeaderboard() {
    const timeframeSel = document.getElementById('leaderboard-filter-timeframe');
    const scopeSel = document.getElementById('leaderboard-filter-scope');
    const timeframe = timeframeSel ? timeframeSel.value : 'this_month';
    const scope = scopeSel ? scopeSel.value : 'current_office';

    const data = store.getLeaderboardData(timeframe, scope);
    const podiumContainer = document.getElementById('leaderboard-podium-container');
    const tbody = document.getElementById('leaderboard-table-body');

    // 1. Render Top 3 Podium
    if (podiumContainer) {
      if (data.top3.length === 0) {
        podiumContainer.innerHTML = `
          <div style="grid-column: 1 / -1; text-align:center; padding:2rem; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:var(--radius-md);">
            <i class="fas fa-trophy" style="font-size:2rem; color:var(--text-muted); margin-bottom:0.75rem; display:block;"></i>
            <h4 style="color:#fff; margin-bottom:0.25rem;">No Verified Earnings Recorded</h4>
            <p style="font-size:0.85rem; color:var(--text-muted); margin:0;">Record verified freelance earnings to compete on the leaderboard!</p>
          </div>
        `;
      } else {
        const medals = [
          { rank: 1, color: '#f59e0b', title: '1st Place • Gold', icon: 'fa-crown', bg: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)' },
          { rank: 2, color: '#94a3b8', title: '2nd Place • Silver', icon: 'fa-medal', bg: 'linear-gradient(135deg, rgba(148,163,184,0.15) 0%, rgba(148,163,184,0.05) 100%)' },
          { rank: 3, color: '#d97706', title: '3rd Place • Bronze', icon: 'fa-award', bg: 'linear-gradient(135deg, rgba(217,119,6,0.15) 0%, rgba(217,119,6,0.05) 100%)' }
        ];

        podiumContainer.innerHTML = data.top3.map((earner, idx) => {
          const medal = medals[idx] || medals[2];
          const isMe = earner.memberId === store.currentUserId;
          return `
            <div style="background:${medal.bg}; border:1px solid ${medal.color}44; border-radius:var(--radius-md); padding:1.25rem; position:relative; box-shadow:0 8px 24px rgba(0,0,0,0.2);">
              <div style="position:absolute; top:12px; right:12px; font-size:0.75rem; font-weight:700; color:${medal.color}; background:${medal.color}22; padding:0.25rem 0.5rem; border-radius:999px; border:1px solid ${medal.color}44;">
                <i class="fas ${medal.icon}"></i> ${medal.title}
              </div>
              <div style="display:flex; align-items:center; gap:0.85rem; margin-bottom:1rem; margin-top:0.5rem;">
                <div class="avatar" style="width:48px; height:48px; font-size:1.1rem; border:2px solid ${medal.color};">${earner.memberName.split(' ').map(n=>n[0]).join('')}</div>
                <div>
                  <h4 style="color:#fff; font-size:1.05rem; margin:0 0 0.15rem 0; font-weight:700;">
                    ${escapeHTML(earner.memberName)}
                    ${isMe ? '<span class="badge badge-green" style="font-size:0.65rem; margin-left:0.35rem;">YOU</span>' : ''}
                  </h4>
                  <span class="badge-rank" style="font-size:0.7rem;">${formatRank(earner.memberRank)}</span>
                </div>
              </div>
              <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:0.75rem; display:flex; justify-content:space-between; align-items:baseline;">
                <div>
                  <div style="font-size:0.75rem; color:var(--text-muted);">Gross Revenue</div>
                  <div style="font-size:1.35rem; font-weight:800; color:${medal.color};">₦${earner.totalGross.toLocaleString()}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:0.7rem; color:var(--text-muted);">10% Office Due</div>
                  <div style="font-size:0.85rem; font-weight:600; color:var(--accent-secondary);">₦${earner.total10Due.toLocaleString()}</div>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 2. Render Full Table
    if (tbody) {
      if (data.leaderboard.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No leaderboard entries found for this filter.</td></tr>`;
      } else {
        tbody.innerHTML = data.leaderboard.map(row => {
          const isMe = row.memberId === store.currentUserId;
          const rankBadge = row.rankPosition === 1
            ? '<span class="badge" style="background:#f59e0b; color:#000; font-weight:800;">#1 👑</span>'
            : row.rankPosition === 2
            ? '<span class="badge" style="background:#94a3b8; color:#000; font-weight:800;">#2 🥈</span>'
            : row.rankPosition === 3
            ? '<span class="badge" style="background:#d97706; color:#fff; font-weight:800;">#3 🥉</span>'
            : `<span class="badge badge-blue">#${row.rankPosition}</span>`;

          return `
            <tr style="${isMe ? 'background:rgba(99,102,241,0.12); border-left:3px solid var(--accent-primary);' : ''}">
              <td>${rankBadge}</td>
              <td>
                <div class="member-info-cell">
                  <div class="avatar">${row.memberName.split(' ').map(n=>n[0]).join('')}</div>
                  <div>
                    <h5>${escapeHTML(row.memberName)} ${isMe ? '<span class="badge badge-green" style="font-size:0.65rem;">YOU</span>' : ''}</h5>
                    <p>${row.memberCode}</p>
                  </div>
                </div>
              </td>
              <td><span class="badge-rank">${formatRank(row.memberRank)}</span></td>
              <td style="font-weight:800; color:#fff;">₦${row.totalGross.toLocaleString()}</td>
              <td style="font-weight:700; color:var(--status-green);">₦${row.totalNet.toLocaleString()}</td>
              <td style="color:var(--accent-secondary);">₦${row.total10Due.toLocaleString()}</td>
              <td>${row.entriesCount} logged</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  /* RENDER SAAS 2: TRAINING & PROGRESSION MANAGEMENT (SaaS Spec §1) */
  function renderTrainingPane() {
    const classesGrid = document.getElementById('training-classes-grid');
    const membersTbody = document.getElementById('training-members-table-body');
    const sessionsContainer = document.getElementById('training-sessions-container');

    // 1. Render Classes
    if (classesGrid) {
      if (store.trainingClasses.length === 0) {
        classesGrid.innerHTML = `
          <div style="grid-column:1 / -1; text-align:center; padding:2rem; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:var(--radius-sm);">
            <p style="color:var(--text-muted); margin:0;">No active training classes found. Click "Create Class" above to set up a new curriculum.</p>
          </div>
        `;
      } else {
        classesGrid.innerHTML = store.trainingClasses.map(c => {
          const tutor = store.members.find(m => m.id === c.tutorId) || { name: 'Assigned Tutor' };
          const head = store.members.find(m => m.id === c.headId) || { name: 'Training Head' };
          const enrolledCount = store.trainingClassMembers.filter(m => m.classId === c.id).length;

          return `
            <div class="card-panel" style="background:var(--bg-card); border:1px solid var(--border-color); padding:1.25rem;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
                <h4 style="color:#fff; font-size:1.05rem; font-weight:700; margin:0;">${escapeHTML(c.name)}</h4>
                <span class="badge badge-green">${enrolledCount} Enrolled</span>
              </div>
              <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1rem;">${escapeHTML(c.description || 'Comprehensive training curriculum.')}</p>
              
              <div style="font-size:0.75rem; color:var(--text-dim); display:flex; flex-direction:column; gap:0.35rem; margin-bottom:1rem;">
                <div><i class="fas fa-user-tie" style="color:var(--accent-primary); width:16px;"></i> Tutor: <strong>${escapeHTML(tutor.name)}</strong></div>
                <div><i class="fas fa-user-shield" style="color:var(--accent-secondary); width:16px;"></i> Head: <strong>${escapeHTML(head.name)}</strong></div>
                <div><i class="fas fa-clock" style="color:var(--status-blue); width:16px;"></i> ${escapeHTML(c.scheduleInfo)} • ${escapeHTML(c.locationInfo)}</div>
              </div>

              <button class="btn btn-secondary btn-sm btn-enroll-member-modal" data-class-id="${c.id}" data-class-name="${escapeHTML(c.name)}" style="width:100%;">
                <i class="fas fa-user-plus"></i> Enroll Member
              </button>
            </div>
          `;
        }).join('');

        // Attach Class Enroll Trigger
        classesGrid.querySelectorAll('.btn-enroll-member-modal').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const classId = e.currentTarget.getAttribute('data-class-id');
            const targetMemberId = prompt('Enter Member ID or Email to Enroll in this Class:');
            if (targetMemberId && targetMemberId.trim()) {
              const matchedMember = store.members.find(m => 
                m.id === targetMemberId.trim() || 
                m.member_code?.toLowerCase() === targetMemberId.trim().toLowerCase() ||
                m.email?.toLowerCase() === targetMemberId.trim().toLowerCase()
              );
              const mId = matchedMember ? matchedMember.id : targetMemberId.trim();
              const res = await store.enrollClassMember(classId, mId, 'Beginner');
              if (res.success) {
                showToast('Member successfully enrolled in class!');
                renderTrainingPane();
              } else {
                alert('Enrollment failed: ' + res.message);
              }
            }
          });
        });
      }
    }

    // 2. Render Member Progression
    if (membersTbody) {
      if (store.trainingClassMembers.length === 0) {
        membersTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No members currently enrolled in training classes.</td></tr>`;
      } else {
        const stageColors = {
          'Beginner': 'badge-blue',
          'Foundation': 'badge-purple',
          'Intermediate': 'badge-amber',
          'Advanced': 'badge-green',
          'Leadership': 'badge-pink'
        };

        membersTbody.innerHTML = store.trainingClassMembers.map(tm => {
          const member = store.members.find(m => m.id === tm.memberId) || { name: tm.memberId, code: '' };
          const tClass = store.trainingClasses.find(c => c.id === tm.classId) || { name: 'Class' };
          const progressPercent = Math.min(100, Math.round(((tm.modulesCompleted || 0) / (tm.totalModules || 10)) * 100));

          return `
            <tr>
              <td>
                <div class="member-info-cell">
                  <div class="avatar">${member.name.split(' ').map(n=>n[0]).join('')}</div>
                  <div><h5>${escapeHTML(member.name)}</h5><p>${member.code || ''}</p></div>
                </div>
              </td>
              <td>${escapeHTML(tClass.name)}</td>
              <td>
                <span class="badge ${stageColors[tm.stage] || 'badge-blue'}">${escapeHTML(tm.stage)}</span>
              </td>
              <td style="min-width:140px;">
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:0.25rem;">
                  <span>${tm.modulesCompleted || 0}/${tm.totalModules || 10} Modules</span>
                  <strong>${progressPercent}%</strong>
                </div>
                <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                  <div style="width:${progressPercent}%; height:100%; background:var(--accent-gradient);"></div>
                </div>
              </td>
              <td><strong>${Number(tm.assessmentScore || 0).toFixed(1)}%</strong></td>
              <td>${tm.lastTrainingDate || 'Pending'}</td>
              <td>
                <button class="btn btn-secondary btn-sm btn-edit-progression" 
                  data-class-id="${tm.classId}" 
                  data-member-id="${tm.memberId}" 
                  data-member-name="${escapeHTML(member.name)}"
                  data-class-name="${escapeHTML(tClass.name)}"
                  data-stage="${tm.stage}"
                  data-modules="${tm.modulesCompleted || 0}"
                  data-score="${tm.assessmentScore || 0}"
                  data-notes="${escapeHTML(tm.tutorNotes || '')}">
                  <i class="fas fa-edit"></i> Update
                </button>
              </td>
            </tr>
          `;
        }).join('');

        // Attach Update Progression Modal Trigger
        membersTbody.querySelectorAll('.btn-edit-progression').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const b = e.currentTarget;
            document.getElementById('progress-class-id').value = b.getAttribute('data-class-id');
            document.getElementById('progress-member-id').value = b.getAttribute('data-member-id');
            document.getElementById('progress-member-name').innerText = b.getAttribute('data-member-name');
            document.getElementById('progress-class-name').innerText = b.getAttribute('data-class-name');
            document.getElementById('progress-stage-select').value = b.getAttribute('data-stage');
            document.getElementById('progress-modules-completed').value = b.getAttribute('data-modules');
            document.getElementById('progress-assessment-score').value = b.getAttribute('data-score');
            document.getElementById('progress-tutor-notes').value = b.getAttribute('data-notes');
            document.getElementById('modal-member-progress').classList.add('active');
          });
        });
      }
    }

    // 3. Render Sessions
    if (sessionsContainer) {
      if (store.trainingSessions.length === 0) {
        sessionsContainer.innerHTML = `
          <div style="text-align:center; padding:1.5rem; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:var(--radius-sm);">
            <p style="color:var(--text-muted); margin:0;">No upcoming training sessions scheduled. Click "Schedule Session" to add one.</p>
          </div>
        `;
      } else {
        sessionsContainer.innerHTML = store.trainingSessions.map(s => {
          const tClass = store.trainingClasses.find(c => c.id === s.classId) || { name: 'Class' };
          const tutor = store.members.find(m => m.id === s.tutorId) || { name: 'Tutor' };

          return `
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:1rem; margin-bottom:0.75rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
              <div>
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                  <h5 style="color:#fff; font-size:0.95rem; margin:0; font-weight:700;">${escapeHTML(s.topic)}</h5>
                  <span class="badge badge-purple">${escapeHTML(tClass.name)}</span>
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted);">
                  <i class="fas fa-calendar-day"></i> ${s.sessionDate} at ${s.startTime} • Tutor: <strong>${escapeHTML(tutor.name)}</strong>
                </div>
                ${s.notes ? `<div style="font-size:0.75rem; color:var(--text-dim); margin-top:0.25rem;">${escapeHTML(s.notes)}</div>` : ''}
              </div>
              <div>
                <button class="btn btn-primary btn-sm btn-mark-session-att" data-session-id="${s.id}">
                  <i class="fas fa-check-square"></i> Mark Attendance
                </button>
              </div>
            </div>
          `;
        }).join('');

        sessionsContainer.querySelectorAll('.btn-mark-session-att').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const sId = e.currentTarget.getAttribute('data-session-id');
            const targetMemberId = prompt('Enter Member ID or Email to record session attendance:');
            if (targetMemberId && targetMemberId.trim()) {
              const matchedMember = store.members.find(m => 
                m.id === targetMemberId.trim() || 
                m.member_code?.toLowerCase() === targetMemberId.trim().toLowerCase() ||
                m.email?.toLowerCase() === targetMemberId.trim().toLowerCase()
              );
              const mId = matchedMember ? matchedMember.id : targetMemberId.trim();
              const res = await store.recordTrainingAttendance(sId, mId, 'present');
              if (res.success) {
                showToast('Training session attendance recorded!');
              } else {
                alert('Failed to record attendance: ' + res.message);
              }
            }
          });
        });
      }
    }
  }

  /* RENDER SAAS 3: WORLD TEAM DIRECTOR MULTI-OFFICE NETWORK (SaaS Spec §3) */
  function renderDirectorNetworkPane() {
    const metricsRow = document.getElementById('director-network-metrics');
    const linkedGrid = document.getElementById('director-linked-offices-grid');
    const currentDirectorId = store.currentUserId;

    // Director Networks owned by current user
    const myNetworks = store.directorNetworks.filter(n => n.directorId === currentDirectorId);
    const activeNetwork = myNetworks[0] || null;

    // Linked office IDs
    let linkedOfficeIds = [];
    if (activeNetwork) {
      linkedOfficeIds = store.networkOffices.filter(no => no.network_id === activeNetwork.id).map(no => no.office_id);
    }

    const linkedOffices = store.offices.filter(o => linkedOfficeIds.includes(o.id));
    const totalOffices = linkedOffices.length;
    const networkMembers = store.members.filter(m => linkedOfficeIds.includes(m.primary_office_id || m.officeId));
    const totalMembers = networkMembers.length;

    // Network Earnings
    const networkEarnings = store.earningsLedger.filter(e => {
      const m = store.members.find(mem => mem.id === e.memberId);
      return m && linkedOfficeIds.includes(m.primary_office_id || m.officeId);
    });
    const totalNetworkRevenue = networkEarnings.reduce((sum, e) => sum + Number(e.gross || e.grossAmount || 0), 0);

    // 1. Render Metrics
    if (metricsRow) {
      metricsRow.innerHTML = `
        <div class="metric-box">
          <div class="metric-title"><span>Network Hubs</span><i class="fas fa-network-wired" style="color:var(--accent-primary)"></i></div>
          <div class="metric-number" style="color:var(--accent-primary)">${totalOffices}</div>
          <div class="metric-sub">${activeNetwork ? activeNetwork.name : 'No Active Director Network'}</div>
        </div>
        <div class="metric-box">
          <div class="metric-title"><span>Network Active Roster</span><i class="fas fa-users" style="color:var(--status-blue)"></i></div>
          <div class="metric-number" style="color:var(--status-blue)">${totalMembers}</div>
          <div class="metric-sub">Across all linked hubs</div>
        </div>
        <div class="metric-box">
          <div class="metric-title"><span>Combined Network Gross</span><i class="fas fa-trophy" style="color:var(--status-green)"></i></div>
          <div class="metric-number" style="color:var(--status-green)">₦${totalNetworkRevenue.toLocaleString()}</div>
          <div class="metric-sub">Aggregated gross revenue</div>
        </div>
      `;
    }

    // 2. Render Linked Offices Grid
    if (linkedGrid) {
      if (linkedOffices.length === 0) {
        linkedGrid.innerHTML = `
          <div style="grid-column:1 / -1; text-align:center; padding:2rem; background:rgba(255,255,255,0.02); border:1px dashed var(--border-color); border-radius:var(--radius-sm);">
            <i class="fas fa-building" style="font-size:2rem; color:var(--text-muted); margin-bottom:0.75rem; display:block;"></i>
            <h4 style="color:#fff; margin-bottom:0.25rem;">No Linked Offices in Network</h4>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">Link downstream Director and Team Leader offices to monitor multi-office operations in real-time.</p>
            <button class="btn btn-primary btn-sm" onclick="document.getElementById('modal-link-office').classList.add('active')">
              <i class="fas fa-link"></i> Link First Office
            </button>
          </div>
        `;
      } else {
        linkedGrid.innerHTML = linkedOffices.map(o => {
          const officeMembers = store.members.filter(m => (m.primary_office_id === o.id || m.officeId === o.id));
          const officeLogs = store.attendanceLogs.filter(a => a.officeId === o.id);
          const trialEnd = new Date(o.trialEndAt || o.trial_end_at || Date.now() + 30*24*60*60*1000);
          const daysLeft = Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000*60*60*24)));

          return `
            <div class="card-panel" style="background:var(--bg-card); border:1px solid var(--border-color); padding:1.25rem;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
                <div>
                  <h4 style="color:#fff; font-size:1.1rem; font-weight:700; margin:0 0 0.2rem 0;">${escapeHTML(o.name)}</h4>
                  <span style="font-size:0.75rem; color:var(--accent-primary); font-weight:600;">/${o.slug}</span>
                </div>
                <span class="badge ${daysLeft > 0 ? 'badge-green' : 'badge-red'}">${daysLeft > 0 ? `${daysLeft}d Trial` : 'Active'}</span>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin:1rem 0; font-size:0.8rem; background:rgba(255,255,255,0.02); padding:0.75rem; border-radius:6px;">
                <div>
                  <div style="color:var(--text-muted); font-size:0.7rem;">Roster Size</div>
                  <strong style="color:#fff;">${officeMembers.length} Members</strong>
                </div>
                <div>
                  <div style="color:var(--text-muted); font-size:0.7rem;">Attendances</div>
                  <strong style="color:var(--status-green);">${officeLogs.length} Checked In</strong>
                </div>
              </div>

              <div style="display:flex; gap:0.5rem;">
                <button class="btn btn-secondary btn-sm btn-unlink-office" data-network-id="${activeNetwork?.id}" data-office-id="${o.id}" style="width:100%; color:var(--status-red);">
                  <i class="fas fa-unlink"></i> Unlink Office
                </button>
              </div>
            </div>
          `;
        }).join('');

        linkedGrid.querySelectorAll('.btn-unlink-office').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const netId = e.currentTarget.getAttribute('data-network-id');
            const offId = e.currentTarget.getAttribute('data-office-id');
            if (confirm('Are you sure you want to unlink this office from your Director Network?')) {
              const res = await store.unlinkOfficeFromNetwork(netId, offId);
              if (res.success) {
                showToast('Office unlinked successfully.');
                renderDirectorNetworkPane();
              } else {
                alert('Failed to unlink office: ' + res.message);
              }
            }
          });
        });
      }
    }
  }

  /* RENDER SAAS 4: OFFICE SETTINGS & BRANDING (SaaS Spec §6 & §10) */
  function renderOfficeSettingsPane() {
    const activeOfficeId = store.currentMember?.primary_office_id || store.currentMember?.officeId || store.offices[0]?.id;
    const office = store.offices.find(o => o.id === activeOfficeId) || store.offices[0];
    if (!office) return;

    // Populate Fields
    const inputName = document.getElementById('setting-office-name');
    const inputSlug = document.getElementById('setting-office-slug');
    const inputDesc = document.getElementById('setting-office-desc');
    const inputLogo = document.getElementById('setting-office-logo');
    const inputWhatsapp = document.getElementById('setting-office-whatsapp');
    const inputPColor = document.getElementById('setting-office-primary-color');
    const inputSColor = document.getElementById('setting-office-secondary-color');
    const urlPreview = document.getElementById('setting-office-url-preview');
    const copyJoinUrl = document.getElementById('setting-copy-join-url');

    if (inputName) inputName.value = office.name || '';
    if (inputSlug) inputSlug.value = office.slug || '';
    if (inputDesc) inputDesc.value = office.description || '';
    if (inputLogo) inputLogo.value = office.logoUrl || office.logo_url || '';
    if (inputWhatsapp) inputWhatsapp.value = office.whatsappNumber || office.whatsapp_number || '';
    if (inputPColor) inputPColor.value = office.primaryBrandColor || office.primary_brand_color || '#6366f1';
    if (inputSColor) inputSColor.value = office.secondaryBrandColor || office.secondary_brand_color || '#8b5cf6';

    const joinUrl = `${window.location.origin}${window.location.pathname}#/o/${office.slug}/join`;
    if (urlPreview) urlPreview.innerText = `app.legacyosapp.com/#/o/${office.slug}`;
    if (copyJoinUrl) copyJoinUrl.value = joinUrl;

    // Subscription & 30-Day Trial Status
    const trialEnd = new Date(office.trialEndAt || office.trial_end_at || (Date.now() + 30*24*60*60*1000));
    const daysLeft = Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000*60*60*24)));
    const trialDaysElem = document.getElementById('office-trial-days');
    const planNameElem = document.getElementById('office-plan-name');
    const memberLimitText = document.getElementById('office-member-limit-text');
    const memberLimitBar = document.getElementById('office-member-limit-bar');

    if (trialDaysElem) trialDaysElem.innerText = `${daysLeft} Days Remaining`;
    if (planNameElem) {
      planNameElem.innerText = office.subscriptionPlanId?.includes('growth') 
        ? 'Growth Plan (₦18,000/mo - Unlimited)' 
        : 'Starter Plan (₦7,500/mo - Up to 49 Members)';
    }

    const officeMembers = store.members.filter(m => (m.primary_office_id === office.id || m.officeId === office.id));
    const limit = office.memberLimit || office.member_limit || 49;
    const usagePercent = Math.min(100, Math.round((officeMembers.length / limit) * 100));

    if (memberLimitText) memberLimitText.innerText = `${officeMembers.length} / ${limit >= 999999 ? 'Unlimited' : limit} Members`;
    if (memberLimitBar) memberLimitBar.style.width = `${usagePercent}%`;
  }

  /* Global Event Listeners setup */
  function setupEventListeners() {
    let capturedGps = null;
    let qrScannedOfficeId = null;

    const modalAttendance = document.getElementById('modal-attendance');
    const btnOpenAttendance = document.getElementById('btn-open-attendance-modal');
    const btnCloseAttendance = document.getElementById('btn-close-attendance');
    const btnStartQrScan = document.getElementById('btn-start-qr-scan');
    const qrScanFeedback = document.getElementById('qr-scan-feedback');
    const videoElem = document.getElementById('attendance-camera-video');
    const canvasElem = document.getElementById('attendance-snapshot-canvas');
    const cameraSection = document.getElementById('camera-liveness-section');
    const gpsAccuracyBadge = document.getElementById('gps-accuracy-badge');
    const gpsCoordText = document.getElementById('gps-coordinates-text');
    const btnSubmitAttendance = document.getElementById('btn-submit-verified-attendance');

    const btnModeVerifySelf = document.getElementById('btn-mode-verify-self');
    const btnModeManualOverride = document.getElementById('btn-mode-manual-override');
    const autoFlow = document.getElementById('attendance-automated-flow');
    const manualFlow = document.getElementById('attendance-manual-flow');
    const formManualAttendance = document.getElementById('form-manual-attendance');
    const manualMemberSelect = document.getElementById('manual-attendance-member-select');
    const manualOfficeSelect = document.getElementById('manual-attendance-office-select');

    // Open Modal
    if (btnOpenAttendance) {
      btnOpenAttendance.addEventListener('click', async () => {
        const member = store.getCurrentUser();
        if (!member) return;

        modalAttendance.classList.add('active');

        // Check leader/admin privileges for manual override option
        const perms = store.getUserPermissions();
        if (btnModeManualOverride) {
          btnModeManualOverride.style.display = (perms.isSuperAdmin || perms.isTeamLeader) ? 'block' : 'none';
        }

        // Show automated tab by default
        if (autoFlow) autoFlow.style.display = 'block';
        if (manualFlow) manualFlow.style.display = 'none';
        if (btnModeVerifySelf) { btnModeVerifySelf.classList.add('active'); btnModeVerifySelf.classList.replace('btn-secondary', 'btn-primary'); }
        if (btnModeManualOverride) { btnModeManualOverride.classList.remove('active'); btnModeManualOverride.classList.replace('btn-primary', 'btn-secondary'); }

        // Start Step 2: Camera Stream
        try {
          if (cameraSection) cameraSection.style.display = 'block';
          if (window.attendanceEngine) {
            await window.attendanceEngine.startCameraStream(videoElem);
          }
        } catch (camErr) {
          console.warn('Camera initiation:', camErr.message);
        }

        // Start Step 3: Real GPS Acquisition
        if (gpsAccuracyBadge) {
          gpsAccuracyBadge.className = 'badge badge-blue';
          gpsAccuracyBadge.innerText = 'Acquiring GPS...';
        }
        if (gpsCoordText) gpsCoordText.innerText = 'Requesting browser GPS position...';

        try {
          if (window.attendanceEngine) {
            capturedGps = await window.attendanceEngine.getGpsCoordinates();
            if (gpsAccuracyBadge) {
              gpsAccuracyBadge.className = 'badge badge-green';
              gpsAccuracyBadge.innerText = `±${Math.round(capturedGps.accuracy)}m Accuracy`;
            }
            if (gpsCoordText) {
              gpsCoordText.innerText = `Lat: ${capturedGps.latitude.toFixed(6)}, Lng: ${capturedGps.longitude.toFixed(6)}`;
            }
          }
        } catch (gpsErr) {
          if (gpsAccuracyBadge) {
            gpsAccuracyBadge.className = 'badge badge-red';
            gpsAccuracyBadge.innerText = 'GPS Denied/Unavailable';
          }
          if (gpsCoordText) gpsCoordText.innerText = gpsErr.message;
        }

        // Populate manual override dropdowns if accessible
        if (perms.isSuperAdmin || perms.isTeamLeader) {
          if (manualMemberSelect) {
            manualMemberSelect.innerHTML = store.members.map(m => `
              <option value="${m.id}">${escapeHTML(m.name)} (${m.code})</option>
            `).join('');
          }
          if (manualOfficeSelect) {
            manualOfficeSelect.innerHTML = store.offices.map(o => `
              <option value="${o.id}">${escapeHTML(o.name)} (${o.code})</option>
            `).join('');
          }
        }
      });
    }

    // Close Modal
    function closeAttendanceModal() {
      if (modalAttendance) modalAttendance.classList.remove('active');
      if (window.attendanceEngine) {
        window.attendanceEngine.stopCameraStream();
        window.attendanceEngine.stopQrScanner();
      }
    }

    if (btnCloseAttendance) btnCloseAttendance.addEventListener('click', closeAttendanceModal);

    // Mode Switching
    if (btnModeVerifySelf) {
      btnModeVerifySelf.addEventListener('click', () => {
        autoFlow.style.display = 'block';
        manualFlow.style.display = 'none';
        btnModeVerifySelf.classList.add('active');
        btnModeVerifySelf.classList.replace('btn-secondary', 'btn-primary');
        btnModeManualOverride.classList.remove('active');
        btnModeManualOverride.classList.replace('btn-primary', 'btn-secondary');
      });
    }

    if (btnModeManualOverride) {
      btnModeManualOverride.addEventListener('click', () => {
        autoFlow.style.display = 'none';
        manualFlow.style.display = 'block';
        btnModeManualOverride.classList.add('active');
        btnModeManualOverride.classList.replace('btn-secondary', 'btn-primary');
        btnModeVerifySelf.classList.remove('active');
        btnModeVerifySelf.classList.replace('btn-primary', 'btn-secondary');
      });
    }

    // QR Code Scanning Trigger
    if (btnStartQrScan) {
      btnStartQrScan.addEventListener('click', () => {
        if (!window.attendanceEngine) return;
        qrScanFeedback.innerText = 'Scanning... Point camera at official GODSPEED office QR code';
        window.attendanceEngine.startQrScanner('qr-reader-container', 
          (decoded) => {
            qrScannedOfficeId = decoded;
            qrScanFeedback.innerHTML = `<span style="color:var(--status-green); font-weight:bold;"><i class="fas fa-check"></i> Office QR Verified: ${escapeHTML(decoded)}</span>`;
          },
          (err) => {
            qrScanFeedback.innerText = 'Camera scanner error: ' + err.message;
          }
        );
      });
    }

    // Complete Self Attendance Submission
    if (btnSubmitAttendance) {
      btnSubmitAttendance.addEventListener('click', async () => {
        const activeStore = getStore();
        const member = activeStore ? activeStore.getCurrentUser() : null;
        if (!member) return;

        const targetOfficeId = member.primary_office_id || member.officeId || (activeStore.offices[0] ? activeStore.offices[0].id : '33333333-3333-3333-3333-333333333333');
        const targetOffice = activeStore.offices.find(o => o.id === targetOfficeId || o.code === targetOfficeId);

        // 1. qrVerified: True ONLY if qrScannedOfficeId is truthy AND matches the office being checked into
        const isQrMatch = Boolean(
          qrScannedOfficeId && targetOffice && 
          (qrScannedOfficeId === targetOffice.id || 
           qrScannedOfficeId === targetOffice.code || 
           qrScannedOfficeId.toUpperCase().includes(targetOffice.code.toUpperCase()) || 
           qrScannedOfficeId.includes(targetOffice.id))
        );
        const qrVerified = isQrMatch;

        btnSubmitAttendance.disabled = true;
        btnSubmitAttendance.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying Camera & Geofence...';

        try {
          // 2. Real optical liveness check and face snapshot capture
          let faceVerified = false;
          let livenessPassed = false;
          let snapshot = null;

          if (window.attendanceEngine) {
            const livenessRes = await window.attendanceEngine.verifyLiveness(videoElem, canvasElem);
            snapshot = livenessRes.snapshot;
            faceVerified = Boolean(snapshot);
            livenessPassed = Boolean(livenessRes.passed);

            const livenessBadge = document.getElementById('liveness-badge');
            if (livenessBadge) {
              if (livenessPassed) {
                livenessBadge.className = 'badge badge-green';
                livenessBadge.innerHTML = '<i class="fas fa-check-circle"></i> Live Face Verified';
              } else {
                livenessBadge.className = 'badge badge-amber';
                livenessBadge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Liveness Unverified';
              }
            }
          }

          const coords = capturedGps || { latitude: 7.2571, longitude: 5.2058, accuracy: 10 };

          const res = await window.attendanceEngine.verifyAndSubmitAttendance(member.id, targetOfficeId, coords, {
            qrVerified: qrVerified,
            faceVerified: faceVerified,
            livenessPassed: livenessPassed
          });

          if (res.success) {
            closeAttendanceModal();
            showToast(res.message);
            renderAttendancePane();
            routeTo(currentRoute);
          } else {
            alert('Attendance Check-In Failed: ' + res.message);
          }
        } catch (err) {
          alert('Verification Exception: ' + err.message);
        } finally {
          btnSubmitAttendance.disabled = false;
          btnSubmitAttendance.innerHTML = '<i class="fas fa-check-circle"></i> Complete Attendance Check-In';
        }
      });
    }

    // Manual Override Form Submit (PRD §12.5)
    if (formManualAttendance) {
      formManualAttendance.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetMember = manualMemberSelect.value;
        const targetOffice = manualOfficeSelect.value;
        const reason = document.getElementById('manual-attendance-reason').value;

        if (!targetMember || !targetOffice || !reason.trim()) {
          alert('Please select member, office, and provide mandatory audit reason.');
          return;
        }

        const res = await window.attendanceEngine.manualAttendanceOverride(targetMember, targetOffice, reason);
        if (res.success) {
          formManualAttendance.reset();
          closeAttendanceModal();
          showToast(res.message);
          renderAttendancePane();
          routeTo(currentRoute);
        } else {
          alert('Manual Override Failed: ' + res.message);
        }
      });
    }

    if (btnOpenEarning) btnOpenEarning.addEventListener('click', () => modalEarning.classList.add('active'));
    if (btnCloseEarning) btnCloseEarning.addEventListener('click', () => modalEarning.classList.remove('active'));

    if (formAddEarning) {
      formAddEarning.addEventListener('submit', async (e) => {
        e.preventDefault();
        const source = document.getElementById('earning-source').value;
        const gross = document.getElementById('earning-amount').value;
        const member = store.getCurrentUser();

        if (source && gross && member) {
          const res = await store.addFreelanceEarning(member.id, source, gross);
          if (res.success) {
            formAddEarning.reset();
            modalEarning.classList.remove('active');
            routeTo(currentRoute);
            showToast(`Recorded ₦${Number(gross).toLocaleString()} earning! 10% Office Due auto-generated in Supabase.`);
          } else {
            alert('Failed to record earning: ' + res.message);
          }
        }
      });
    }

    // =========================================================================
    // LEGACYOS SAAS EVENT LISTENERS
    // =========================================================================

    // 1. Live Leaderboard Filters
    const lbTimeframe = document.getElementById('leaderboard-filter-timeframe');
    const lbScope = document.getElementById('leaderboard-filter-scope');
    if (lbTimeframe) lbTimeframe.addEventListener('change', () => renderLiveLeaderboard());
    if (lbScope) lbScope.addEventListener('change', () => renderLiveLeaderboard());

    // 2. Training: Create Class Modal & Form
    const modalCreateClass = document.getElementById('modal-create-class');
    const btnOpenCreateClass = document.getElementById('btn-open-create-class-modal');
    const btnCloseCreateClass = document.getElementById('btn-close-create-class');
    const formCreateClass = document.getElementById('form-create-class');
    const tutorSelect = document.getElementById('class-tutor-select');
    const headSelect = document.getElementById('class-head-select');

    if (btnOpenCreateClass) {
      btnOpenCreateClass.addEventListener('click', () => {
        // Populate Members for Tutor & Head
        const memberOpts = store.members.map(m => `<option value="${m.id}">${escapeHTML(m.name)} (${formatRank(m.rank)})</option>`).join('');
        if (tutorSelect) tutorSelect.innerHTML = `<option value="">-- Select Tutor --</option>` + memberOpts;
        if (headSelect) headSelect.innerHTML = `<option value="">-- Select Training Head --</option>` + memberOpts;
        if (modalCreateClass) modalCreateClass.classList.add('active');
      });
    }
    if (btnCloseCreateClass) btnCloseCreateClass.addEventListener('click', () => modalCreateClass?.classList.remove('active'));

    if (formCreateClass) {
      formCreateClass.addEventListener('submit', async (e) => {
        e.preventDefault();
        const activeOfficeId = store.currentMember?.primary_office_id || store.currentMember?.officeId || store.offices[0]?.id;
        const classData = {
          officeId: activeOfficeId,
          name: document.getElementById('class-name').value,
          description: document.getElementById('class-desc').value,
          tutorId: document.getElementById('class-tutor-select').value || null,
          headId: document.getElementById('class-head-select').value || null,
          scheduleInfo: document.getElementById('class-schedule').value,
          locationInfo: document.getElementById('class-location').value
        };

        const res = await store.createTrainingClass(classData);
        if (res.success) {
          formCreateClass.reset();
          modalCreateClass?.classList.remove('active');
          showToast('Training class created successfully!');
          renderTrainingPane();
        } else {
          alert('Failed to create class: ' + res.message);
        }
      });
    }

    // 3. Training: Schedule Session Modal & Form
    const modalScheduleSession = document.getElementById('modal-schedule-session');
    const btnOpenScheduleSession = document.getElementById('btn-open-schedule-session-modal');
    const btnCloseScheduleSession = document.getElementById('btn-close-schedule-session');
    const formScheduleSession = document.getElementById('form-schedule-session');
    const sessionClassSelect = document.getElementById('session-class-select');

    if (btnOpenScheduleSession) {
      btnOpenScheduleSession.addEventListener('click', () => {
        if (sessionClassSelect) {
          sessionClassSelect.innerHTML = store.trainingClasses.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');
        }
        const todayStr = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('session-date');
        if (dateInput) dateInput.value = todayStr;
        if (modalScheduleSession) modalScheduleSession.classList.add('active');
      });
    }
    if (btnCloseScheduleSession) btnCloseScheduleSession.addEventListener('click', () => modalScheduleSession?.classList.remove('active'));

    if (formScheduleSession) {
      formScheduleSession.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sessionData = {
          classId: document.getElementById('session-class-select').value,
          topic: document.getElementById('session-topic').value,
          sessionDate: document.getElementById('session-date').value,
          startTime: document.getElementById('session-time').value,
          notes: document.getElementById('session-notes').value
        };

        const res = await store.createTrainingSession(sessionData);
        if (res.success) {
          formScheduleSession.reset();
          modalScheduleSession?.classList.remove('active');
          showToast('Training session scheduled!');
          renderTrainingPane();
        } else {
          alert('Failed to schedule session: ' + res.message);
        }
      });
    }

    // 4. Training: Member Progression Form
    const modalMemberProgress = document.getElementById('modal-member-progress');
    const btnCloseMemberProgress = document.getElementById('btn-close-member-progress');
    const formMemberProgress = document.getElementById('form-member-progress');

    if (btnCloseMemberProgress) btnCloseMemberProgress.addEventListener('click', () => modalMemberProgress?.classList.remove('active'));

    if (formMemberProgress) {
      formMemberProgress.addEventListener('submit', async (e) => {
        e.preventDefault();
        const classId = document.getElementById('progress-class-id').value;
        const memberId = document.getElementById('progress-member-id').value;
        const progressData = {
          stage: document.getElementById('progress-stage-select').value,
          modulesCompleted: parseInt(document.getElementById('progress-modules-completed').value, 10) || 0,
          assessmentScore: parseFloat(document.getElementById('progress-assessment-score').value) || 0,
          tutorNotes: document.getElementById('progress-tutor-notes').value
        };

        const res = await store.updateMemberProgress(classId, memberId, progressData);
        if (res.success) {
          modalMemberProgress?.classList.remove('active');
          showToast('Member curriculum progression updated!');
          renderTrainingPane();
        } else {
          alert('Failed to update progression: ' + res.message);
        }
      });
    }

    // 5. Director Network: Link Office Modal & Form
    const modalLinkOffice = document.getElementById('modal-link-office');
    const btnOpenLinkOffice = document.getElementById('btn-open-link-office-modal');
    const btnCloseLinkOffice = document.getElementById('btn-close-link-office');
    const formLinkOffice = document.getElementById('form-link-office');
    const linkOfficeSelect = document.getElementById('link-office-select');

    if (btnOpenLinkOffice) {
      btnOpenLinkOffice.addEventListener('click', () => {
        if (linkOfficeSelect) {
          linkOfficeSelect.innerHTML = store.offices.map(o => `<option value="${o.id}">${escapeHTML(o.name)} (${o.code})</option>`).join('');
        }
        if (modalLinkOffice) modalLinkOffice.classList.add('active');
      });
    }
    if (btnCloseLinkOffice) btnCloseLinkOffice.addEventListener('click', () => modalLinkOffice?.classList.remove('active'));

    if (formLinkOffice) {
      formLinkOffice.addEventListener('submit', async (e) => {
        e.preventDefault();
        const officeId = document.getElementById('link-office-select').value;
        let userNetwork = store.directorNetworks.find(n => n.directorId === store.currentUserId);

        // Auto-create director network if user doesn't have one yet
        if (!userNetwork) {
          const userObj = store.getCurrentUser();
          const netRes = await store.createDirectorNetwork(`${userObj.name}'s World Team Network`, userObj.id);
          if (netRes.success) {
            userNetwork = netRes.network;
          } else {
            alert('Failed to initialize Director Network: ' + netRes.message);
            return;
          }
        }

        const res = await store.linkOfficeToNetwork(userNetwork.id, officeId);
        if (res.success) {
          modalLinkOffice?.classList.remove('active');
          showToast('Office linked to your Director Network!');
          renderDirectorNetworkPane();
        } else {
          alert('Failed to link office: ' + res.message);
        }
      });
    }

    // 6. Office Settings & Custom Branding Form
    const formOfficeBranding = document.getElementById('form-office-branding');
    if (formOfficeBranding) {
      formOfficeBranding.addEventListener('submit', async (e) => {
        e.preventDefault();
        const activeOfficeId = store.currentMember?.primary_office_id || store.currentMember?.officeId || store.offices[0]?.id;
        const brandingData = {
          name: document.getElementById('setting-office-name').value,
          description: document.getElementById('setting-office-desc').value,
          logoUrl: document.getElementById('setting-office-logo').value,
          whatsappNumber: document.getElementById('setting-office-whatsapp').value,
          primaryBrandColor: document.getElementById('setting-office-primary-color').value,
          secondaryBrandColor: document.getElementById('setting-office-secondary-color').value
        };

        const res = await store.updateOfficeBranding(activeOfficeId, brandingData);
        if (res.success) {
          showToast('Office branding and settings saved!');
          // Apply new colors live
          document.documentElement.style.setProperty('--accent-primary', brandingData.primaryBrandColor);
          document.documentElement.style.setProperty('--accent-secondary', brandingData.secondaryBrandColor);
          renderOfficeSettingsPane();
        } else {
          alert('Failed to save office branding: ' + res.message);
        }
      });
    }

    // 7. Copy Public Member Join Link
    const btnCopyJoinLink = document.getElementById('btn-copy-join-link');
    if (btnCopyJoinLink) {
      btnCopyJoinLink.addEventListener('click', () => {
        const input = document.getElementById('setting-copy-join-url');
        if (input && input.value) {
          navigator.clipboard.writeText(input.value).then(() => {
            showToast('Office join link copied to clipboard!');
          }).catch(() => {
            input.select();
            document.execCommand('copy');
            showToast('Office join link copied!');
          });
        }
      });
    }

    // 8. Subscription Upgrade & Paystack Payment Modal
    const modalUpgradePlan = document.getElementById('modal-upgrade-plan');
    const btnOpenUpgradeModal = document.getElementById('btn-open-upgrade-plan-modal');
    const btnCloseUpgradeModal = document.getElementById('btn-close-upgrade-plan');

    if (btnOpenUpgradeModal) {
      btnOpenUpgradeModal.addEventListener('click', () => {
        if (modalUpgradePlan) modalUpgradePlan.classList.add('active');
      });
    }
    if (btnCloseUpgradeModal) {
      btnCloseUpgradeModal.addEventListener('click', () => {
        if (modalUpgradePlan) modalUpgradePlan.classList.remove('active');
      });
    }

    document.querySelectorAll('.btn-pay-plan').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const planId = e.currentTarget.getAttribute('data-plan');
        const activeOfficeId = store.currentMember?.primary_office_id || store.currentMember?.officeId || store.offices[0]?.id;
        const user = store.getCurrentUser();

        if (!activeOfficeId || !user) {
          alert('Please select an active office to renew.');
          return;
        }

        if (modalUpgradePlan) modalUpgradePlan.classList.remove('active');
        showToast('Launching Paystack secure gateway...');

        if (window.legacyPaymentService) {
          await window.legacyPaymentService.initiateSubscriptionPayment(
            activeOfficeId,
            planId,
            user.email,
            user.name,
            (res) => {
              showToast(`Payment successful! Reference: ${res.reference}. Plan activated.`);
              renderOfficeSettingsPane();
            },
            () => {
              showToast('Payment was not completed.');
            }
          );
        }
      });
    });
  }

  /* Supabase Realtime Change Subscriptions (PRD & SaaS Spec §2 / §7) */
  function setupRealtimeSubscriptions() {
    if (!window.godspeedSupabase) return;

    try {
      window.godspeedSupabase
        .channel('legacyos_realtime_feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'earnings_ledger' }, async () => {
          await store.loadAllAppData();
          if (currentRoute === '/leaderboard') renderLiveLeaderboard();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, async (payload) => {
          await store.loadAllAppData();
          if (payload.new && payload.new.title) {
            showToast(`${payload.new.title}: ${payload.new.message}`);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'training_sessions' }, async () => {
          await store.loadAllAppData();
          if (currentRoute === '/training') renderTrainingPane();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'training_attendance' }, async () => {
          await store.loadAllAppData();
          if (currentRoute === '/training') renderTrainingPane();
        })
        .subscribe();
    } catch (err) {
      console.warn('Realtime subscription non-blocking notice:', err.message);
    }
  }

  /* Utility functions */
  function showToast(msg) {
    let toast = document.getElementById('godspeed-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'godspeed-toast';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-shield-alt" style="color:var(--accent-primary)"></i> ${msg}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function formatRank(rank) {
    if (!rank) return 'Newbie';
    return rank.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Run init
  init();
});
