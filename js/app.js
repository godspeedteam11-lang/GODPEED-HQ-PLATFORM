/**
 * Smart Attendance Portal - Main UI & Event Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const store = window.attendanceStore;
  
  // Date State
  let currentDate = new Date().toISOString().split('T')[0];

  // DOM Elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabViews = document.querySelectorAll('.tab-view');
  const dateInput = document.getElementById('current-date-picker');
  const dateBadge = document.getElementById('header-date-display');
  
  // Metrics elements
  const metricTotal = document.getElementById('metric-total');
  const metricPresent = document.getElementById('metric-present');
  const metricAbsent = document.getElementById('metric-absent');
  const metricLate = document.getElementById('metric-late');
  const metricRate = document.getElementById('metric-rate');

  // Containers
  const todayAttendanceTable = document.getElementById('today-attendance-body');
  const logsTableBody = document.getElementById('logs-table-body');
  const membersTableBody = document.getElementById('members-table-body');
  const departmentChartContainer = document.getElementById('department-chart-container');

  // Filter elements
  const searchInputToday = document.getElementById('search-today');
  const filterDeptToday = document.getElementById('filter-dept-today');
  
  const searchInputLogs = document.getElementById('search-logs');
  const filterStatusLogs = document.getElementById('filter-status-logs');
  const logDatePicker = document.getElementById('log-date-picker');

  const searchInputMembers = document.getElementById('search-members');

  // Modal elements
  const addMemberModal = document.getElementById('add-member-modal');
  const btnOpenAddMember = document.getElementById('btn-open-add-member');
  const btnCloseAddMember = document.getElementById('btn-close-add-member');
  const btnCancelAddMember = document.getElementById('btn-cancel-add-member');
  const formAddMember = document.getElementById('form-add-member');

  // Action Buttons
  const btnMarkAllPresent = document.getElementById('btn-mark-all-present');
  const btnExportCsv = document.getElementById('btn-export-csv');

  // Initialize App
  function initApp() {
    if (dateInput) dateInput.value = currentDate;
    if (logDatePicker) logDatePicker.value = currentDate;
    updateDateDisplay();
    
    setupNavigation();
    setupEventListeners();
    renderAll();
  }

  function updateDateDisplay() {
    const formatted = new Date(currentDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    if (dateBadge) dateBadge.innerHTML = `<i class="far fa-calendar-alt"></i> ${formatted}`;
  }

  /* Navigation Controller */
  function setupNavigation() {
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = item.getAttribute('data-tab');

        navItems.forEach(nav => nav.classList.remove('active'));
        tabViews.forEach(view => view.classList.remove('active'));

        item.classList.add('active');
        const activeView = document.getElementById(`tab-${targetTab}`);
        if (activeView) activeView.classList.add('active');

        // Update page title dynamically
        const pageTitle = document.getElementById('page-heading');
        if (pageTitle) {
          pageTitle.innerText = item.querySelector('span').innerText;
        }

        renderAll();
      });
    });
  }

  /* Main Render Pipeline */
  function renderAll() {
    renderMetrics();
    renderTodayAttendanceTable();
    renderLogsTable();
    renderMembersTable();
    renderDepartmentAnalytics();
  }

  /* Metrics Render */
  function renderMetrics() {
    const metrics = store.getMetricsForDate(currentDate);

    if (metricTotal) metricTotal.innerText = metrics.total;
    if (metricPresent) metricPresent.innerText = metrics.present;
    if (metricAbsent) metricAbsent.innerText = metrics.absent;
    if (metricLate) metricLate.innerText = metrics.late;
    if (metricRate) metricRate.innerText = `${metrics.rate}%`;
  }

  /* Render Today's Interactive Attendance Table */
  function renderTodayAttendanceTable() {
    const tableBodies = [
      document.getElementById('today-attendance-body'),
      document.getElementById('today-attendance-body-dup')
    ].filter(Boolean);

    if (tableBodies.length === 0) return;

    const members = store.getMembers();
    const logs = store.getLogsByDate(currentDate);

    const searchTerm = (searchInputToday?.value || '').toLowerCase();
    const deptFilter = filterDeptToday?.value || 'all';

    const filteredMembers = members.filter(member => {
      const matchesSearch = member.name.toLowerCase().includes(searchTerm) || member.id.toLowerCase().includes(searchTerm);
      const matchesDept = deptFilter === 'all' || member.department === deptFilter;
      return matchesSearch && matchesDept;
    });

    let contentHtml = '';

    if (filteredMembers.length === 0) {
      contentHtml = `
        <tr>
          <td colspan="4" style="text-align:center; padding: 2rem; color: var(--text-muted);">
            <i class="fas fa-search" style="font-size: 1.5rem; margin-bottom: 0.5rem; display:block;"></i>
            No members match the current filter.
          </td>
        </tr>`;
    } else {
      contentHtml = filteredMembers.map(member => {
        const log = logs.find(l => l.memberId === member.id) || { status: 'unrecorded', checkIn: '--', checkOut: '--' };
        const initials = member.name.split(' ').map(n => n[0]).join('');

        return `
          <tr>
            <td>
              <div class="member-cell">
                <div class="avatar-sm">${initials}</div>
                <div class="member-details">
                  <h5>${escapeHTML(member.name)}</h5>
                  <span>${member.id} • ${escapeHTML(member.role)}</span>
                </div>
              </div>
            </td>
            <td><span class="badge-status ${log.status}">${log.status}</span></td>
            <td>${log.checkIn}</td>
            <td>
              <div class="action-buttons" data-member-id="${member.id}">
                <button class="btn-mark ${log.status === 'present' ? 'active-present' : ''}" data-status="present">Present</button>
                <button class="btn-mark ${log.status === 'absent' ? 'active-absent' : ''}" data-status="absent">Absent</button>
                <button class="btn-mark ${log.status === 'late' ? 'active-late' : ''}" data-status="late">Late</button>
                <button class="btn-mark ${log.status === 'excused' ? 'active-excused' : ''}" data-status="excused">Excused</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    tableBodies.forEach(tbody => {
      tbody.innerHTML = contentHtml;
      // Attach click listeners to mark status
      tbody.querySelectorAll('.btn-mark').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const actionGroup = e.target.closest('.action-buttons');
          const memberId = actionGroup.getAttribute('data-member-id');
          const status = e.target.getAttribute('data-status');

          store.markAttendance(memberId, status, currentDate);
          renderAll();
          showToast(`Updated status to ${status.toUpperCase()}`);
        });
      });
    });
  }

  /* Render Full Logs Table */
  function renderLogsTable() {
    if (!logsTableBody) return;

    const selectedDate = logDatePicker ? logDatePicker.value : currentDate;
    const members = store.getMembers();
    const logs = store.getLogsByDate(selectedDate);

    const searchTerm = (searchInputLogs?.value || '').toLowerCase();
    const statusFilter = filterStatusLogs?.value || 'all';

    const rowsHtml = members.filter(member => {
      const log = logs.find(l => l.memberId === member.id) || { status: 'unrecorded' };
      const matchesSearch = member.name.toLowerCase().includes(searchTerm) || member.id.toLowerCase().includes(searchTerm);
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).map(member => {
      const log = logs.find(l => l.memberId === member.id) || { status: 'unrecorded', checkIn: '--', checkOut: '--', note: 'None' };
      return `
        <tr>
          <td><strong>${member.id}</strong></td>
          <td>${escapeHTML(member.name)}</td>
          <td>${escapeHTML(member.department)}</td>
          <td><span class="badge-status ${log.status}">${log.status}</span></td>
          <td>${log.checkIn}</td>
          <td>${log.checkOut}</td>
          <td><span style="color: var(--text-muted); font-size: 0.825rem;">${escapeHTML(log.note || '-')}</span></td>
        </tr>
      `;
    }).join('');

    logsTableBody.innerHTML = rowsHtml || `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No records found for ${selectedDate}</td></tr>`;
  }

  /* Render Members Management Table */
  function renderMembersTable() {
    if (!membersTableBody) return;

    const members = store.getMembers();
    const searchTerm = (searchInputMembers?.value || '').toLowerCase();

    const filtered = members.filter(m => 
      m.name.toLowerCase().includes(searchTerm) || 
      m.email.toLowerCase().includes(searchTerm) ||
      m.department.toLowerCase().includes(searchTerm)
    );

    membersTableBody.innerHTML = filtered.map(member => {
      const initials = member.name.split(' ').map(n => n[0]).join('');
      return `
        <tr>
          <td>
            <div class="member-cell">
              <div class="avatar-sm">${initials}</div>
              <div class="member-details">
                <h5>${escapeHTML(member.name)}</h5>
                <span>${member.id}</span>
              </div>
            </div>
          </td>
          <td>${escapeHTML(member.role)}</td>
          <td><span class="btn-mark" style="pointer-events:none;">${escapeHTML(member.department)}</span></td>
          <td>${escapeHTML(member.email)}</td>
          <td>
            <span style="color: var(--status-present); font-size: 0.8rem; font-weight:600;"><i class="fas fa-check-circle"></i> Active</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* Render Department Analytics Progress Bars */
  function renderDepartmentAnalytics() {
    if (!departmentChartContainer) return;

    const members = store.getMembers();
    const logs = store.getLogsByDate(currentDate);

    // Group by department
    const deptStats = {};
    members.forEach(m => {
      if (!deptStats[m.department]) {
        deptStats[m.department] = { total: 0, present: 0 };
      }
      deptStats[m.department].total++;
      
      const log = logs.find(l => l.memberId === m.id);
      if (log && (log.status === 'present' || log.status === 'late')) {
        deptStats[m.department].present++;
      }
    });

    const html = Object.keys(deptStats).map(dept => {
      const stat = deptStats[dept];
      const pct = stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0;
      return `
        <div class="bar-group">
          <div class="bar-info">
            <span><strong>${escapeHTML(dept)}</strong> (${stat.present}/${stat.total} Present)</span>
            <span>${pct}%</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill" style="width: ${pct}%; background: var(--accent-gradient);"></div>
          </div>
        </div>
      `;
    }).join('');

    departmentChartContainer.innerHTML = html;
  }

  /* Setup Global Listeners */
  function setupEventListeners() {
    // Date change listener
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        currentDate = e.target.value;
        updateDateDisplay();
        renderAll();
      });
    }

    if (logDatePicker) {
      logDatePicker.addEventListener('change', () => renderLogsTable());
    }

    // Filter Listeners
    if (searchInputToday) searchInputToday.addEventListener('input', renderTodayAttendanceTable);
    if (filterDeptToday) filterDeptToday.addEventListener('change', renderTodayAttendanceTable);

    if (searchInputLogs) searchInputLogs.addEventListener('input', renderLogsTable);
    if (filterStatusLogs) filterStatusLogs.addEventListener('change', renderLogsTable);

    if (searchInputMembers) searchInputMembers.addEventListener('input', renderMembersTable);

    // Quick Actions
    if (btnMarkAllPresent) {
      btnMarkAllPresent.addEventListener('click', () => {
        store.markAllPresent(currentDate);
        renderAll();
        showToast('All members marked PRESENT for today');
      });
    }

    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => {
        store.exportCSV(currentDate);
        showToast('CSV Attendance Report downloaded');
      });
    }

    // Add Member Modal Listeners
    if (btnOpenAddMember) {
      btnOpenAddMember.addEventListener('click', () => {
        addMemberModal.classList.add('active');
      });
    }

    const closeModalHandler = () => addMemberModal.classList.remove('active');
    if (btnCloseAddMember) btnCloseAddMember.addEventListener('click', closeModalHandler);
    if (btnCancelAddMember) btnCancelAddMember.addEventListener('click', closeModalHandler);

    if (formAddMember) {
      formAddMember.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('member-name').value;
        const role = document.getElementById('member-role').value;
        const dept = document.getElementById('member-dept').value;
        const email = document.getElementById('member-email').value;

        if (name && role && dept && email) {
          store.addMember(name, role, dept, email);
          formAddMember.reset();
          closeModalHandler();
          renderAll();
          showToast(`Added ${name} to members directory`);
        }
      });
    }
  }

  /* Utility functions */
  function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-notification';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-check-circle" style="color:var(--status-present)"></i> ${message}`;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Run init
  initApp();
});
