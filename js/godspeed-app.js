/**
 * GODSPEED HQ - Main Application UI & Permission Router Controller (PRD v1.1 Architecture)
 */

document.addEventListener('DOMContentLoaded', () => {
  const store = window.godspeedStore;

  // Active Route State (Default: server-determined post-login route)
  let currentRoute = '/dashboard';

  // DOM Handles
  const viewTitle = document.getElementById('view-title-heading');
  const viewSubtitle = document.getElementById('view-title-sub');
  const userIdentitySelect = document.getElementById('user-identity-select');
  const dashboardSwitcherSelect = document.getElementById('dashboard-switcher-select');

  // Sidebar Nav Sections
  const navListMember = document.getElementById('nav-list-member');
  const navSectionTeam = document.getElementById('nav-section-team');
  const navSectionLeader = document.getElementById('nav-section-leader');
  const navSectionAdmin = document.getElementById('nav-section-admin');

  // Views
  const viewMemberDashboard = document.getElementById('view-member-dashboard');
  const viewTeamDashboard = document.getElementById('view-team-dashboard');
  const viewOfficeDashboard = document.getElementById('view-office-dashboard');
  const viewAdminDashboard = document.getElementById('view-admin-dashboard');

  const tabGeneralContent = document.getElementById('view-general-tab');

  // Modals & Triggers
  const modalAttendance = document.getElementById('modal-attendance');
  const btnOpenAttendance = document.getElementById('btn-open-attendance-modal');
  const btnCloseAttendance = document.getElementById('btn-close-attendance');
  const btnSimulateScan = document.getElementById('btn-simulate-attendance-scan');

  const modalEarning = document.getElementById('modal-earning');
  const btnOpenEarning = document.getElementById('btn-open-earning-modal');
  const btnCloseEarning = document.getElementById('btn-close-earning');
  const formAddEarning = document.getElementById('form-add-earning');

  /* App Initialization */
  function init() {
    setupUserIdentitySwitcher();
    setupDashboardSwitcher();
    setupNavigationListeners();
    setupEventListeners();

    // Authenticate & Route to default server route post-login
    const perms = store.getUserPermissions();
    routeTo(perms.defaultRoute);
  }

  /* User Identity Switcher (Simulating Login as Different Users) */
  function setupUserIdentitySwitcher() {
    if (!userIdentitySelect) return;
    userIdentitySelect.value = store.currentUserId;

    userIdentitySelect.addEventListener('change', (e) => {
      const newUserId = e.target.value;
      store.setCurrentUser(newUserId);

      const perms = store.getUserPermissions(newUserId);
      showToast(`Logged in as: ${perms.member.name} (${perms.role.toUpperCase()})`);

      updateSidebarNavigation();
      updateDashboardSwitcher();
      
      // Auto-route to user's authorized post-login route
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

    // Update User Profile Card in Sidebar
    const userAvatar = document.getElementById('sidebar-user-avatar');
    const userName = document.getElementById('sidebar-user-name');
    const userRole = document.getElementById('sidebar-user-role');

    if (userAvatar) userAvatar.innerText = perms.member.name.split(' ').map(n=>n[0]).join('');
    if (userName) userName.innerText = perms.member.name;
    if (userRole) userRole.innerText = `${perms.role.toUpperCase()} • ${formatRank(perms.member.rank)}`;

    // Show/Hide Navigation Sections Based on Effective Server Permissions
    if (navSectionTeam) navSectionTeam.style.display = perms.canAccessTeam ? 'block' : 'none';
    if (navSectionLeader) navSectionLeader.style.display = perms.canAccessOffice ? 'block' : 'none';
    if (navSectionAdmin) navSectionAdmin.style.display = perms.canAccessAdmin ? 'block' : 'none';

    // Highlight Active Link
    document.querySelectorAll('.nav-link').forEach(link => {
      const linkRoute = link.getAttribute('data-route') || link.getAttribute('data-tab');
      if (linkRoute === currentRoute || link.getAttribute('data-tab') === currentRoute.replace('/', '')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  /* Navigation Click Listeners */
  function setupNavigationListeners() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetRoute = link.getAttribute('data-route') || link.getAttribute('data-tab');
        routeTo(targetRoute.startsWith('/') ? targetRoute : `/${targetRoute}`);
      });
    });
  }

  /* Permission Boundary Router with Server-Validated Access Control */
  function routeTo(targetRoute) {
    const perms = store.getUserPermissions();

    // Validate Security Access Boundary
    if (!store.canAccessRoute(store.currentUserId, targetRoute)) {
      showToast(`Security Boundary Blocked: Access to ${targetRoute} requires higher permissions.`);
      currentRoute = perms.defaultRoute;
    } else {
      currentRoute = targetRoute;
    }

    // Hide all view containers
    if (viewMemberDashboard) viewMemberDashboard.style.display = 'none';
    if (viewTeamDashboard) viewTeamDashboard.style.display = 'none';
    if (viewOfficeDashboard) viewOfficeDashboard.style.display = 'none';
    if (viewAdminDashboard) viewAdminDashboard.style.display = 'none';
    if (tabGeneralContent) tabGeneralContent.style.display = 'none';

    // Route to Target View
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
    } else if (currentRoute === '/admin/dashboard') {
      if (viewAdminDashboard) viewAdminDashboard.style.display = 'block';
      if (viewTitle) viewTitle.innerText = 'Master Organization Dashboard';
      if (viewSubtitle) viewSubtitle.innerText = 'Organization-wide KPIs, rank distribution, multi-office metrics, and audit logs';
      renderSuperAdminDashboard();
    } else {
      // General Content Views (Attendance, PV, Freelance, Health, Dues, Chat, Notice)
      if (tabGeneralContent) tabGeneralContent.style.display = 'block';
      renderGeneralTab(currentRoute.replace('/', ''));
    }

    updateSidebarNavigation();
    updateDashboardSwitcher();
  }

  /* RENDER 1: MEMBER PERSONAL DASHBOARD (/dashboard) */
  function renderMemberDashboard() {
    const member = store.getCurrentUser();
    const qpv = store.calculateQPVBaseline(member.id);

    // Personal PV & Submissions
    const personalPVs = store.pvSubmissions.filter(p => p.memberId === member.id && p.status === 'approved');
    const myApprovedPV = personalPVs.reduce((sum, p) => sum + Number(p.pvAmount), 0);

    // Personal Earnings & 10/20/70 Breakdown
    const myEarnings = store.earningsLedger.filter(e => e.memberId === member.id);
    const myNetEarnings = myEarnings.reduce((sum, e) => sum + Number(e.net), 0);
    const myPersonalSavings = myEarnings.reduce((sum, e) => sum + Number(e.personal20), 0);

    // DOM Updates for Member Dashboard
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

  /* RENDER 4: SUPER ADMIN MASTER DASHBOARD (/admin/dashboard) */
  function renderSuperAdminDashboard() {
    const container = document.getElementById('admin-view-container');
    if (!container) return;

    const totalMembers = store.members.length;
    const totalOffices = store.offices.length;
    const totalApprovedPV = store.pvSubmissions.filter(p => p.status === 'approved').reduce((sum, p) => sum + Number(p.pvAmount), 0);

    container.innerHTML = `
      <div class="metrics-row">
        <div class="metric-box">
          <div class="metric-title"><span>Total Organization Members</span><i class="fas fa-globe"></i></div>
          <div class="metric-number">${totalMembers}</div>
          <div class="metric-sub">GODSPEED Team Global</div>
        </div>
        <div class="metric-box">
          <div class="metric-title"><span>Active Offices</span><i class="fas fa-building"></i></div>
          <div class="metric-number" style="color:var(--status-blue)">${totalOffices}</div>
          <div class="metric-sub">Ikeja HQ & Abuja Hub</div>
        </div>
        <div class="metric-box">
          <div class="metric-title"><span>Org Approved PPV</span><i class="fas fa-box"></i></div>
          <div class="metric-number" style="color:var(--accent-secondary)">${totalApprovedPV.toLocaleString()} PV</div>
          <div class="metric-sub">Period: 2026-08</div>
        </div>
      </div>

      <div class="card-panel">
        <div class="panel-head"><h3><i class="fas fa-shield-alt"></i> Office Performance Comparison</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Office Code</th>
                <th>Office Name</th>
                <th>Team Leader</th>
                <th>Geofence Radius</th>
                <th>Active Members</th>
              </tr>
            </thead>
            <tbody>
              ${store.offices.map(o => {
                const leader = store.members.find(m => m.id === o.teamLeaderId) || { name: 'Unassigned' };
                const count = store.members.filter(m => m.officeId === o.id).length;
                return `
                  <tr>
                    <td><strong>${o.code}</strong></td>
                    <td>${escapeHTML(o.name)}</td>
                    <td>${escapeHTML(leader.name)}</td>
                    <td>${o.radiusMeters} meters</td>
                    <td><span class="badge badge-blue">${count} members</span></td>
                  </tr>
                `;
              }).join('')}
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

        if (source && gross) {
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
