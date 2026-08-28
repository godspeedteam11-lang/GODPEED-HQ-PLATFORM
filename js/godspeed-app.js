/**
 * GODSPEED HQ - PORTAL 1: Public & Member Portal Controller (PRD v1.1 Architecture)
 */

document.addEventListener('DOMContentLoaded', () => {
  const store = window.godspeedStore;

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

  /* Application Initialization */
  async function init() {
    setupPublicAuthEvents();
    setupNavigationListeners();
    setupEventListeners();
    setupUserIdentitySwitcher();
    setupDashboardSwitcher();
    setupSupabaseAuthListener();

    // Check existing auth session state
    if (store.isAuthenticated && store.currentUserId) {
      const perms = store.getUserPermissions();
      routeTo(perms.defaultRoute);
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
            routeTo(perms.defaultRoute);
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
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
          alert('Please enter your email address and password.');
          return;
        }

        const authRes = await store.authenticateUser(email, password);
        if (authRes.success) {
          showToast(`Welcome back, ${authRes.member.name}!`);
          routeTo(authRes.permissions.defaultRoute);
        } else {
          alert('Sign In Failed: ' + authRes.message);
        }
      });
    }

    // Public Sign Up Form Submit (SECURITY ENFORCED: Role is ALWAYS 'member')
    if (formPublicSignup) {
      formPublicSignup.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = formPublicSignup.querySelector('button[type="submit"]');
        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '<i class="fas fa-check-circle"></i> Create Member Account';
        
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const phone = document.getElementById('signup-phone').value.trim();
        const password = document.getElementById('signup-password').value;
        const sponsor = document.getElementById('signup-sponsor').value.trim();
        const office = 'OFF-AKR'; // Strictly locked to official GODSPEED HQ Akure
        
        if (!name || !email || !password) {
          alert('Please fill in all required fields (Name, Email, Password).');
          return;
        }

        if (password.length < 6) {
          alert('Password must be at least 6 characters long.');
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
          }

          const regRes = await store.registerMember(name, email, phone, password, sponsor, office);
          
          if (regRes.success) {
            formPublicSignup.reset();
            if (regRes.requiresConfirmation) {
              alert(regRes.message);
              routeTo('/login');
            } else {
              showToast(`Account created! Welcome to GODSPEED HQ, ${name}.`);
              routeTo('/dashboard');
            }
          } else {
            alert('Create Account Failed: ' + regRes.message);
          }
        } catch (err) {
          console.error('Sign up error:', err);
          alert('An unexpected error occurred during account creation: ' + (err.message || err));
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
          }
        }
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
    // Unauthenticated Public Routes
    if (!store.isAuthenticated) {
      if (targetRoute !== '/' && targetRoute !== '/login' && targetRoute !== '/signup') {
        targetRoute = '/';
      }

      if (viewMemberPortal) viewMemberPortal.style.display = 'none';
      if (viewPublicLanding) viewPublicLanding.style.display = targetRoute === '/' ? 'flex' : 'none';
      if (viewPublicLogin) viewPublicLogin.style.display = targetRoute === '/login' ? 'flex' : 'none';
      if (viewPublicSignup) viewPublicSignup.style.display = targetRoute === '/signup' ? 'flex' : 'none';

      currentRoute = targetRoute;
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
                  <td><span class="badge-rank">${formatRank(m.rank)}</span></td>
                  <td>${escapeHTML(m.email)}</td>
                  <td><span class="badge badge-green">Active Member</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* RENDER GENERAL TAB VIEWS */
  function renderGeneralTab(tabName) {
    document.querySelectorAll('.general-tab-pane').forEach(p => p.style.display = 'none');
    const activePane = document.getElementById(`pane-${tabName}`);
    if (activePane) activePane.style.display = 'block';

    if (viewTitle) {
      const titleMap = {
        'genealogy': 'Genealogy & Team Tree',
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
  }

  /* Global Event Listeners setup */
  function setupEventListeners() {
    if (btnOpenAttendance) btnOpenAttendance.addEventListener('click', () => modalAttendance.classList.add('active'));
    if (btnCloseAttendance) btnCloseAttendance.addEventListener('click', () => modalAttendance.classList.remove('active'));

    if (btnSimulateScan) {
      btnSimulateScan.addEventListener('click', () => {
        const member = store.getCurrentUser();
        if (!member) return;
        const res = store.recordAttendance(member.id, member.officeId || 'OFF-101', 6.60185, 3.35152, true);
        if (res.success) {
          modalAttendance.classList.remove('active');
          routeTo(currentRoute);
          showToast(res.message);
        } else {
          alert(res.message);
        }
      });
    }

    if (btnOpenEarning) btnOpenEarning.addEventListener('click', () => modalEarning.classList.add('active'));
    if (btnCloseEarning) btnCloseEarning.addEventListener('click', () => modalEarning.classList.remove('active'));

    if (formAddEarning) {
      formAddEarning.addEventListener('submit', (e) => {
        e.preventDefault();
        const source = document.getElementById('earning-source').value;
        const gross = document.getElementById('earning-amount').value;
        const member = store.getCurrentUser();

        if (source && gross && member) {
          store.addFreelanceEarning(member.id, source, gross);
          formAddEarning.reset();
          modalEarning.classList.remove('active');
          routeTo(currentRoute);
          showToast(`Recorded ₦${Number(gross).toLocaleString()} earning! 10% Office Due auto-generated.`);
        }
      });
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
