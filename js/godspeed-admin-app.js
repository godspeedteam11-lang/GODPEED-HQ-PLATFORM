/**
 * GODSPEED HQ - PORTAL 2: Super Admin Control Center Controller (PRD v1.1 Architecture)
 */

document.addEventListener('DOMContentLoaded', () => {
  const store = window.godspeedStore;

  // DOM Views
  const viewAdminLogin = document.getElementById('view-admin-login');
  const viewAdminDenied = document.getElementById('view-admin-denied');
  const viewAdminPortal = document.getElementById('view-admin-portal');

  // Form & Logout
  const formAdminLogin = document.getElementById('form-admin-login');
  const adminMasterContainer = document.getElementById('admin-master-view-container');

  /* Application Initialization */
  function init() {
    setupAdminLogin();
    setupAdminNavigation();

    // Check existing auth state for Admin Portal
    if (store.isAuthenticated && store.currentUserId) {
      const perms = store.getUserPermissions();
      if (perms.isSuperAdmin) {
        showAdminPortal();
      } else {
        showAccessDenied();
      }
    } else {
      showAdminLogin();
    }
  }

  /* Show Admin Login Screen */
  function showAdminLogin() {
    if (viewAdminPortal) viewAdminPortal.style.display = 'none';
    if (viewAdminDenied) viewAdminDenied.style.display = 'none';
    if (viewAdminLogin) viewAdminLogin.style.display = 'flex';
  }

  /* Show 403 Access Denied Screen */
  function showAccessDenied() {
    if (viewAdminPortal) viewAdminPortal.style.display = 'none';
    if (viewAdminLogin) viewAdminLogin.style.display = 'none';
    if (viewAdminDenied) viewAdminDenied.style.display = 'block';
  }

  /* Show Admin Portal Workspace */
  function showAdminPortal() {
    if (viewAdminLogin) viewAdminLogin.style.display = 'none';
    if (viewAdminDenied) viewAdminDenied.style.display = 'none';
    if (viewAdminPortal) viewAdminPortal.style.display = 'flex';

    renderAdminMasterDashboard();
  }

  /* Setup Admin Login Submit */
  function setupAdminLogin() {
    if (formAdminLogin) {
      formAdminLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;

        const authRes = await store.authenticateAdmin(email, password);
        if (authRes.success) {
          showToast(`Authenticated Control Center as ${authRes.member.name}`);
          showAdminPortal();
        } else {
          showAccessDenied();
        }
      });
    }

    // Admin Logout Handler
    document.querySelectorAll('.btn-admin-logout').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await store.logout();
        showToast('Control Center Session Terminated.');
        showAdminLogin();
      });
    });
  }

  /* Admin Sidebar Navigation */
  function setupAdminNavigation() {
    document.querySelectorAll('[data-admin-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('[data-admin-tab]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const tab = link.getAttribute('data-admin-tab');
        if (tab === 'dashboard') renderAdminMasterDashboard();
        else if (tab === 'members') renderAdminMembersDirectory();
        else if (tab === 'offices') renderAdminOfficesManagement();
        else if (tab === 'genealogy') renderAdminGenealogyTree();
        else if (tab === 'audit') renderAdminAuditLogs();
      });
    });
  }

  /* RENDER MASTER ADMIN DASHBOARD */
  function renderAdminMasterDashboard() {
    if (!adminMasterContainer) return;

    const totalMembers = store.members.length;
    const totalOffices = store.offices.length;
    const totalApprovedPV = store.pvSubmissions.filter(p => p.status === 'approved').reduce((sum, p) => sum + Number(p.pvAmount), 0);
    const totalDuesCollected = store.officeDues.filter(d => d.status === 'paid').reduce((sum, d) => sum + Number(d.paidAmount), 0);

    adminMasterContainer.innerHTML = `
      <div class="metrics-row">
        <div class="metric-box">
          <div class="metric-title"><span>Total Organization Members</span><i class="fas fa-globe" style="color:var(--accent-primary)"></i></div>
          <div class="metric-number">${totalMembers}</div>
          <div class="metric-sub">GODSPEED Team Global Roster</div>
        </div>
        <div class="metric-box">
          <div class="metric-title"><span>Active Offices</span><i class="fas fa-building" style="color:var(--status-blue)"></i></div>
          <div class="metric-number" style="color:var(--status-blue)">${totalOffices}</div>
          <div class="metric-sub">Ikeja HQ & Abuja Hub</div>
        </div>
        <div class="metric-box">
          <div class="metric-title"><span>Org Approved PPV</span><i class="fas fa-box" style="color:var(--accent-secondary)"></i></div>
          <div class="metric-number" style="color:var(--accent-secondary)">${totalApprovedPV.toLocaleString()} PV</div>
          <div class="metric-sub">Current Period: 2026-08</div>
        </div>
        <div class="metric-box">
          <div class="metric-title"><span>Verified Dues Collected</span><i class="fas fa-receipt" style="color:var(--status-green)"></i></div>
          <div class="metric-number" style="color:var(--status-green)">₦${totalDuesCollected.toLocaleString()}</div>
          <div class="metric-sub">10% Freelance Dues Ledger</div>
        </div>
      </div>

      <div class="card-panel">
        <div class="panel-head">
          <h3><i class="fas fa-sitemap" style="color:var(--accent-primary)"></i> Multi-Office Performance Comparison</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Office Code</th>
                <th>Office Name</th>
                <th>Team Leader</th>
                <th>GPS Geofence Radius</th>
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

  /* RENDER ADMIN MEMBERS DIRECTORY */
  /* RENDER ADMIN MEMBERS DIRECTORY & RANK MANAGEMENT */
  function renderAdminMembersDirectory() {
    if (!adminMasterContainer) return;

    const ranksList = [
      { id: 'newbie', label: 'Newbie' },
      { id: 'manager', label: 'Manager' },
      { id: 'senior_manager', label: 'Senior Manager' },
      { id: 'executive_manager', label: 'Executive Manager' },
      { id: 'director', label: 'Director' },
      { id: 'sapphire_director', label: 'Sapphire Director' },
      { id: 'ruby_director', label: 'Ruby Director' },
      { id: 'emerald_director', label: 'Emerald Director' },
      { id: 'diamond_director', label: 'Diamond Director' },
      { id: 'president_team', label: "President's Team" }
    ];

    const rolesList = [
      { id: 'member', label: 'Member' },
      { id: 'team_leader', label: 'Team Leader' },
      { id: 'trainer', label: 'Trainer' },
      { id: 'finance_officer', label: 'Finance Officer' },
      { id: 'admin', label: 'Admin' },
      { id: 'super_admin', label: 'Super Admin' }
    ];

    adminMasterContainer.innerHTML = `
      <div class="card-panel">
        <div class="panel-head">
          <h3><i class="fas fa-users-cog"></i> Global Members Directory & Live Rank Management</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Official Rank (Live Edit)</th>
                <th>Office</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              ${store.members.map(m => `
                <tr>
                  <td>
                    <div class="member-info-cell">
                      <div class="avatar">${m.name.split(' ').map(n=>n[0]).join('')}</div>
                      <div><h5>${escapeHTML(m.name)}</h5><p>${m.code}</p></div>
                    </div>
                  </td>
                  <td>
                    <select class="admin-role-select" data-member-id="${m.id}" style="background:var(--bg-input); color:#fff; border:1px solid var(--border-color); padding:0.35rem 0.5rem; border-radius:4px; font-size:0.8rem;">
                      ${rolesList.map(r => `<option value="${r.id}" ${m.role === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}
                    </select>
                  </td>
                  <td>
                    <select class="admin-rank-select" data-member-id="${m.id}" style="background:var(--bg-input); color:#fff; border:1px solid var(--border-color); padding:0.35rem 0.5rem; border-radius:4px; font-size:0.8rem;">
                      ${ranksList.map(rk => `<option value="${rk.id}" ${m.rank === rk.id ? 'selected' : ''}>${rk.label}</option>`).join('')}
                    </select>
                  </td>
                  <td>${m.officeId || 'OFF-AKR'}</td>
                  <td>${escapeHTML(m.email)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Attach Rank & Role change event listeners
    adminMasterContainer.querySelectorAll('.admin-rank-select').forEach(select => {
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

    adminMasterContainer.querySelectorAll('.admin-role-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const memberId = e.target.getAttribute('data-member-id');
        const newRole = e.target.value;
        const res = await store.updateMemberRole(memberId, newRole);
        if (res.success) {
          showToast(res.message);
        } else {
          alert('Failed to update role: ' + res.message);
        }
      });
    });
  }

  /* RENDER ADMIN OFFICES MANAGEMENT */
  function renderAdminOfficesManagement() {
    if (!adminMasterContainer) return;

    adminMasterContainer.innerHTML = `
      <div class="card-panel">
        <div class="panel-head">
          <h3><i class="fas fa-building"></i> Offices & GPS Geofence Configuration</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Code</th>
                <th>Office Name</th>
                <th>Coordinates (Lat / Lng)</th>
                <th>Geofence Radius</th>
              </tr>
            </thead>
            <tbody>
              ${store.offices.map(o => `
                <tr>
                  <td>${o.id}</td>
                  <td><strong>${o.code}</strong></td>
                  <td>${escapeHTML(o.name)}</td>
                  <td>${o.latitude}° N, ${o.longitude}° E</td>
                  <td>${o.radiusMeters}m radius</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* RENDER ADMIN GENEALOGY TREE */
  function renderAdminGenealogyTree() {
    if (!adminMasterContainer) return;

    const rootMembers = store.members.filter(m => m.sponsorId === null);

    function buildTreeHtml(member) {
      const descendants = store.members.filter(m => m.sponsorId === member.id);
      const qpv = store.calculateQPVBaseline(member.id);

      return `
        <div style="margin-left: 1.25rem; border-left: 2px dashed var(--border-color); padding-left: 1rem; margin-bottom: 0.85rem;">
          <div style="background: var(--bg-card-hover); border: 1px solid var(--border-color); padding: 0.75rem 1rem; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 0.85rem;">
            <div class="avatar">${member.name.split(' ').map(n=>n[0]).join('')}</div>
            <div>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <strong>${escapeHTML(member.name)}</strong>
                <span class="badge-rank">${formatRank(member.rank)}</span>
              </div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">
                ${member.code} • Role: ${member.role} • <strong>QPV: ${qpv.totalPV}</strong>
              </div>
            </div>
          </div>
          ${descendants.map(child => buildTreeHtml(child)).join('')}
        </div>
      `;
    }

    adminMasterContainer.innerHTML = `
      <div class="card-panel">
        <div class="panel-head">
          <h3><i class="fas fa-sitemap"></i> Complete Organization Genealogy Closure Tree</h3>
        </div>
        ${rootMembers.map(root => buildTreeHtml(root)).join('')}
      </div>
    `;
  }

  /* RENDER ADMIN AUDIT LOGS */
  function renderAdminAuditLogs() {
    if (!adminMasterContainer) return;

    adminMasterContainer.innerHTML = `
      <div class="card-panel">
        <div class="panel-head">
          <h3><i class="fas fa-history"></i> System & Security Audit Trail</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Security Clearance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${new Date().toLocaleString()}</td>
                <td>MEM-001 (Chief SuperAdmin)</td>
                <td>Control Center Login</td>
                <td>admin.html</td>
                <td><span class="badge badge-green">Passed</span></td>
              </tr>
              <tr>
                <td>${new Date().toLocaleString()}</td>
                <td>MEM-004 (Alex Johnson)</td>
                <td>Recorded GPS Attendance</td>
                <td>OFF-101 (Geofence: 12.4m)</td>
                <td><span class="badge badge-blue">Verified</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
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
    toast.innerHTML = `<i class="fas fa-shield-alt" style="color:var(--status-red)"></i> ${msg}`;
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
