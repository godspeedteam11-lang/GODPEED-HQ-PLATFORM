/**
 * GODSPEED HQ - Main Application UI Controller (PRD v1.1 Baseline)
 */

document.addEventListener('DOMContentLoaded', () => {
  const store = window.godspeedStore;

  // DOM Handles
  const roleSelect = document.getElementById('global-role-select');
  const navLinks = document.querySelectorAll('.nav-link');
  const tabContents = document.querySelectorAll('.tab-content');
  const viewTitle = document.getElementById('view-title-heading');
  const viewSubtitle = document.getElementById('view-title-sub');

  // Containers
  const genealogyContainer = document.getElementById('genealogy-tree-container');
  const attendanceLogsBody = document.getElementById('attendance-logs-body');
  const pvSubmissionsBody = document.getElementById('pv-submissions-body');
  const earningsLedgerBody = document.getElementById('earnings-ledger-body');
  const healthScoresBody = document.getElementById('health-scores-body');
  const duesTableBody = document.getElementById('dues-table-body');
  const noticeBoardContainer = document.getElementById('notice-board-container');

  // Modals & Triggers
  const modalAttendance = document.getElementById('modal-attendance');
  const btnOpenAttendance = document.getElementById('btn-open-attendance-modal');
  const btnCloseAttendance = document.getElementById('btn-close-attendance');
  const btnSimulateScan = document.getElementById('btn-simulate-attendance-scan');

  const modalEarning = document.getElementById('modal-earning');
  const btnOpenEarning = document.getElementById('btn-open-earning-modal');
  const btnCloseEarning = document.getElementById('btn-close-earning');
  const formAddEarning = document.getElementById('form-add-earning');

  /* Application Initialization */
  function init() {
    setupNavigation();
    setupRoleSwitcher();
    setupEventListeners();
    renderAllViews();
  }

  /* Role Switcher Controller */
  function setupRoleSwitcher() {
    if (!roleSelect) return;
    roleSelect.value = store.currentRole;

    roleSelect.addEventListener('change', (e) => {
      store.currentRole = e.target.value;
      const roleText = roleSelect.options[roleSelect.selectedIndex].text;
      showToast(`Switched active context to: ${roleText}`);
      renderAllViews();
    });
  }

  /* Navigation Controller */
  function setupNavigation() {
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = link.getAttribute('data-tab');

        navLinks.forEach(l => l.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        link.classList.add('active');
        const activeTab = document.getElementById(`tab-${tab}`);
        if (activeTab) activeTab.classList.add('active');

        if (viewTitle) viewTitle.innerText = link.querySelector('span').innerText;
        renderAllViews();
      });
    });
  }

  /* Main Render Pipeline */
  function renderAllViews() {
    renderDashboardMetrics();
    renderGenealogyTree();
    renderAttendanceLogs();
    renderPVSubmissions();
    renderEarningsLedger();
    renderHealthScores();
    renderDuesTable();
    renderNoticeBoard();
  }

  /* Dashboard Metrics Render */
  function renderDashboardMetrics() {
    const totalMembers = store.members.length;
    const todayLogs = store.attendanceLogs.filter(l => l.date === new Date().toISOString().split('T')[0]);
    const presentCount = todayLogs.length;
    const rate = Math.round((presentCount / totalMembers) * 100);

    const elemMembers = document.getElementById('dash-total-members');
    const elemPresent = document.getElementById('dash-present-today');
    const elemRate = document.getElementById('dash-attendance-rate');
    const elemPv = document.getElementById('dash-total-pv');

    if (elemMembers) elemMembers.innerText = totalMembers;
    if (elemPresent) elemPresent.innerText = presentCount;
    if (elemRate) elemRate.innerText = `${rate}%`;

    const totalApprovedPV = store.pvSubmissions
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.pvAmount), 0);
    if (elemPv) elemPv.innerText = totalApprovedPV.toLocaleString() + ' PV';
  }

  /* Interactive Genealogy Hierarchy Tree Render */
  function renderGenealogyTree() {
    if (!genealogyContainer) return;

    // Filter based on role permissions
    let rootMembers = [];
    if (store.currentRole === 'super_admin') {
      rootMembers = store.members.filter(m => m.sponsorId === null);
    } else {
      rootMembers = store.members.filter(m => m.id === 'MEM-002'); // Team Leader context
    }

    function buildTreeHtml(member) {
      const descendants = store.members.filter(m => m.sponsorId === member.id);
      const qpv = store.calculateQPVBaseline(member.id);

      return `
        <div style="margin-left: 1.25rem; border-left: 2px dashed var(--border-color); padding-left: 1rem; margin-bottom: 0.85rem;">
          <div style="background: var(--bg-card-hover); border: 1px solid var(--border-color); padding: 0.75rem 1rem; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 0.85rem;">
            <div class="avatar">${member.name.split(' ').map(n => n[0]).join('')}</div>
            <div>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <strong>${escapeHTML(member.name)}</strong>
                <span class="badge-rank">${formatRank(member.rank)}</span>
              </div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.15rem;">
                ${member.code} • Office: ${member.officeId} • <strong>QPV: ${qpv.totalPV}</strong> (Eligible: ${formatRank(qpv.eligibleRankFlag)})
              </div>
            </div>
          </div>
          ${descendants.map(child => buildTreeHtml(child)).join('')}
        </div>
      `;
    }

    genealogyContainer.innerHTML = rootMembers.map(root => buildTreeHtml(root)).join('');
  }

  /* Attendance Logs Render */
  function renderAttendanceLogs() {
    if (!attendanceLogsBody) return;

    attendanceLogsBody.innerHTML = store.attendanceLogs.map(log => {
      const member = store.members.find(m => m.id === log.memberId) || { name: log.memberId, code: '' };
      const office = store.offices.find(o => o.id === log.officeId) || { name: log.officeId };

      return `
        <tr>
          <td>
            <div class="member-info-cell">
              <div class="avatar">${member.name.split(' ').map(n=>n[0]).join('')}</div>
              <div>
                <h5>${escapeHTML(member.name)}</h5>
                <p>${member.code}</p>
              </div>
            </div>
          </td>
          <td>${escapeHTML(office.name)}</td>
          <td>${log.date} ${log.time}</td>
          <td>
            <span class="badge badge-green"><i class="fas fa-check-circle"></i> Verified</span>
          </td>
          <td>${log.distanceMeters} meters</td>
          <td>
            <span class="badge badge-blue">QR + Face + GPS</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* NeoLife PV Submissions & Carriage Render */
  function renderPVSubmissions() {
    if (!pvSubmissionsBody) return;

    pvSubmissionsBody.innerHTML = store.pvSubmissions.map(pv => {
      const member = store.members.find(m => m.id === pv.memberId) || { name: pv.memberId };
      const statusBadgeClass = pv.status === 'approved' ? 'badge-green' : (pv.status === 'declined' ? 'badge-red' : 'badge-amber');

      return `
        <tr>
          <td><strong>${pv.orderRef}</strong></td>
          <td>${escapeHTML(member.name)}</td>
          <td>${pv.period}</td>
          <td><strong>${pv.pvAmount} PV</strong></td>
          <td><span class="badge ${statusBadgeClass}">${pv.status.replace('_', ' ').toUpperCase()}</span></td>
          <td>${pv.expectedPickup}</td>
          <td>
            ${pv.status !== 'approved' ? `
              <button class="btn btn-primary btn-sm btn-approve-pv" data-id="${pv.id}">Approve Carriage</button>
            ` : '<span style="color:var(--status-green); font-size:0.8rem; font-weight:700;"><i class="fas fa-check-double"></i> Verified</span>'}
          </td>
        </tr>
      `;
    }).join('');

    // Attach approve click handlers
    document.querySelectorAll('.btn-approve-pv').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        store.updatePVStatus(id, 'approved');
        renderAllViews();
        showToast('Carriage approved! Verified PPV credited.');
      });
    });
  }

  /* Freelancing Ledger & 10/20/70 Allocation Render */
  function renderEarningsLedger() {
    if (!earningsLedgerBody) return;

    earningsLedgerBody.innerHTML = store.earningsLedger.map(entry => {
      const member = store.members.find(m => m.id === entry.memberId) || { name: entry.memberId };

      return `
        <tr>
          <td>${entry.date}</td>
          <td>${escapeHTML(member.name)}</td>
          <td>${escapeHTML(entry.source)}</td>
          <td><strong>₦${entry.net.toLocaleString()}</strong></td>
          <td>
            <div style="font-size:0.775rem;">
              <span style="color:#3b82f6">10% Office: ₦${entry.officeDue10.toLocaleString()}</span> | 
              <span style="color:#10b981">20% Savings: ₦${entry.personal20.toLocaleString()}</span> | 
              <span style="color:#8b5cf6">70% Reinvest: ₦${entry.business70.toLocaleString()}</span>
            </div>
            <div class="split-bar-container">
              <div class="split-part part-due"></div>
              <div class="split-part part-personal"></div>
              <div class="split-part part-business"></div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* Member Health Intelligence & Risk Signal Render */
  function renderHealthScores() {
    if (!healthScoresBody) return;

    healthScoresBody.innerHTML = store.healthScores.map(score => {
      const member = store.members.find(m => m.id === score.memberId) || { name: score.memberId, role: '' };
      const statusClass = score.healthStatus === 'green' ? 'badge-green' : (score.healthStatus === 'red' ? 'badge-red' : 'badge-amber');

      return `
        <tr>
          <td>
            <div class="member-info-cell">
              <div class="avatar">${member.name.split(' ').map(n=>n[0]).join('')}</div>
              <div>
                <h5>${escapeHTML(member.name)}</h5>
                <p>${member.role}</p>
              </div>
            </div>
          </td>
          <td><span class="badge ${statusClass}">${score.healthStatus.toUpperCase()}</span></td>
          <td><strong>${score.attendanceRate}%</strong></td>
          <td>${score.mtdPV} PV</td>
          <td>${score.signals.map(s => `<span class="btn-mark" style="font-size:0.7rem; margin-right:0.25rem;">${s}</span>`).join('')}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="alert('Intervention Form logged for ${escapeHTML(member.name)}')">
              <i class="fas fa-notes-medical"></i> Intervene
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* Office Dues Table Render */
  function renderDuesTable() {
    if (!duesTableBody) return;

    duesTableBody.innerHTML = store.officeDues.map(due => {
      const member = store.members.find(m => m.id === due.memberId) || { name: due.memberId };
      const statusClass = due.status === 'paid' ? 'badge-green' : (due.status === 'overdue' ? 'badge-red' : 'badge-amber');

      return `
        <tr>
          <td>${escapeHTML(member.name)}</td>
          <td>${escapeHTML(due.period)}</td>
          <td>₦${due.amount.toLocaleString()}</td>
          <td>₦${due.paidAmount.toLocaleString()}</td>
          <td><span class="badge ${statusClass}">${due.status.toUpperCase()}</span></td>
          <td>${due.dueDate}</td>
        </tr>
      `;
    }).join('');
  }

  /* Notice Board Render */
  function renderNoticeBoard() {
    if (!noticeBoardContainer) return;

    noticeBoardContainer.innerHTML = store.noticeBoard.map(not => `
      <div class="card-panel" style="margin-bottom:1rem;">
        <div class="panel-head" style="margin-bottom:0.5rem;">
          <h4 style="font-size:1rem; font-weight:700; color:var(--text-main);">${escapeHTML(not.title)}</h4>
          <span class="badge badge-blue">${escapeHTML(not.category)}</span>
        </div>
        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">${escapeHTML(not.content)}</p>
        <div style="margin-top:0.75rem; font-size:0.75rem; color:var(--text-dim); display:flex; justify-content:space-between;">
          <span>Published by: <strong>${escapeHTML(not.author)}</strong></span>
          <span>Date: ${not.date}</span>
        </div>
      </div>
    `).join('');
  }

  /* Event Listeners setup */
  function setupEventListeners() {
    // Attendance modal triggers
    if (btnOpenAttendance) {
      btnOpenAttendance.addEventListener('click', () => modalAttendance.classList.add('active'));
    }
    if (btnCloseAttendance) {
      btnCloseAttendance.addEventListener('click', () => modalAttendance.classList.remove('active'));
    }

    if (btnSimulateScan) {
      btnSimulateScan.addEventListener('click', () => {
        const memberId = 'MEM-004'; // Alex Johnson
        const officeId = 'OFF-101'; // Ikeja HQ (Lat: 6.6018, Lng: 3.3515)

        // Simulate GPS coordinates inside geofence (approx 10m away)
        const userLat = 6.60185;
        const userLng = 3.35152;

        const res = store.recordAttendance(memberId, officeId, userLat, userLng, true);
        if (res.success) {
          modalAttendance.classList.remove('active');
          renderAllViews();
          showToast(res.message);
        } else {
          alert(res.message);
        }
      });
    }

    // Freelance earning modal triggers
    if (btnOpenEarning) {
      btnOpenEarning.addEventListener('click', () => modalEarning.classList.add('active'));
    }
    if (btnCloseEarning) {
      btnCloseEarning.addEventListener('click', () => modalEarning.classList.remove('active'));
    }

    if (formAddEarning) {
      formAddEarning.addEventListener('submit', (e) => {
        e.preventDefault();
        const source = document.getElementById('earning-source').value;
        const gross = document.getElementById('earning-amount').value;

        if (source && gross) {
          store.addFreelanceEarning('MEM-004', source, gross);
          formAddEarning.reset();
          modalEarning.classList.remove('active');
          renderAllViews();
          showToast(`Recorded ₦${Number(gross).toLocaleString()} earning! 10% Office Due auto-generated.`);
        }
      });
    }
  }

  /* Helper functions */
  function showToast(msg) {
    let toast = document.getElementById('godspeed-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'godspeed-toast';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-check-circle" style="color:var(--status-green)"></i> ${msg}`;
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

  // Run initial state setup
  init();
});
