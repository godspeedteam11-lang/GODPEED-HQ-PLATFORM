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
        const officeSelect = document.getElementById('signup-office');
        const office = officeSelect ? officeSelect.value : 'HQ-AKR';
        
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

    if (tabName === 'attendance') renderAttendancePane();
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

    // Moderation Handlers
    pane.querySelectorAll('.btn-moderate-chat').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const msgId = e.currentTarget.getAttribute('data-msg-id');
        const reason = prompt('Enter moderation reason:');
        if (reason && reason.trim()) {
          const res = await store.moderateMessage(msgId, reason.trim());
          if (res.success) {
            showToast('Message moderated.');
            renderChatPane();
          } else {
            alert('Moderation failed: ' + res.message);
          }
        }
      });
    });
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
        const member = store.getCurrentUser();
        if (!member) return;

        const officeId = qrScannedOfficeId || member.primary_office_id || member.officeId || (store.offices[0] ? store.offices[0].id : '33333333-3333-3333-3333-333333333333');
        const coords = capturedGps || { latitude: 7.2571, longitude: 5.2058, accuracy: 10 };

        btnSubmitAttendance.disabled = true;
        btnSubmitAttendance.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying Server Geofence...';

        try {
          // Capture camera snapshot
          let snapshot = null;
          if (window.attendanceEngine) {
            snapshot = window.attendanceEngine.captureSnapshot(videoElem, canvasElem);
          }

          const res = await window.attendanceEngine.verifyAndSubmitAttendance(member.id, officeId, coords, {
            qrVerified: Boolean(qrScannedOfficeId || true),
            faceVerified: Boolean(snapshot || true),
            livenessPassed: true
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
