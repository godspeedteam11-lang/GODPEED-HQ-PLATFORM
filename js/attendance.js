/**
 * Attendance System - Data & State Management Core
 */

class AttendanceStore {
  constructor() {
    this.STORAGE_KEY_MEMBERS = 'attendance_members_v1';
    this.STORAGE_KEY_LOGS = 'attendance_logs_v1';
    
    this.members = [];
    this.logs = [];
    
    this.init();
  }

  init() {
    const savedMembers = localStorage.getItem(this.STORAGE_KEY_MEMBERS);
    const savedLogs = localStorage.getItem(this.STORAGE_KEY_LOGS);

    if (savedMembers && savedLogs) {
      this.members = JSON.parse(savedMembers);
      this.logs = JSON.parse(savedLogs);
    } else {
      // Seed default initial mock data for immediate interactivity
      this.seedInitialData();
    }
  }

  seedInitialData() {
    const today = new Date().toISOString().split('T')[0];

    this.members = [
      { id: 'MEM-101', name: 'Alex Johnson', role: 'Software Engineer', department: 'Engineering', email: 'alex.j@company.com' },
      { id: 'MEM-102', name: 'Sarah Miller', role: 'Product Manager', department: 'Product', email: 'sarah.m@company.com' },
      { id: 'MEM-103', name: 'David Chen', role: 'UI/UX Designer', department: 'Design', email: 'david.c@company.com' },
      { id: 'MEM-104', name: 'Emily Davis', role: 'QA Lead', department: 'Engineering', email: 'emily.d@company.com' },
      { id: 'MEM-105', name: 'Michael Brown', role: 'DevOps Specialist', department: 'Engineering', email: 'michael.b@company.com' },
      { id: 'MEM-106', name: 'Jessica Taylor', role: 'HR Manager', department: 'Human Resources', email: 'jessica.t@company.com' },
      { id: 'MEM-107', name: 'James Wilson', role: 'Marketing Lead', department: 'Marketing', email: 'james.w@company.com' },
      { id: 'MEM-108', name: 'Sophia Martinez', role: 'Data Analyst', department: 'Analytics', email: 'sophia.m@company.com' }
    ];

    // Seed Today's Attendance Logs
    this.logs = [
      { id: 'LOG-1', memberId: 'MEM-101', date: today, status: 'present', checkIn: '08:55 AM', checkOut: '05:30 PM', note: 'Punctual' },
      { id: 'LOG-2', memberId: 'MEM-102', date: today, status: 'present', checkIn: '09:02 AM', checkOut: '05:45 PM', note: '' },
      { id: 'LOG-3', memberId: 'MEM-103', date: today, status: 'late', checkIn: '09:35 AM', checkOut: '06:00 PM', note: 'Traffic delay' },
      { id: 'LOG-4', memberId: 'MEM-104', date: today, status: 'present', checkIn: '08:45 AM', checkOut: '05:15 PM', note: '' },
      { id: 'LOG-5', memberId: 'MEM-105', date: today, status: 'absent', checkIn: '--', checkOut: '--', note: 'Sick leave' },
      { id: 'LOG-6', memberId: 'MEM-106', date: today, status: 'present', checkIn: '08:50 AM', checkOut: '05:00 PM', note: '' },
      { id: 'LOG-7', memberId: 'MEM-107', date: today, status: 'excused', checkIn: '--', checkOut: '--', note: 'Conference attendance' },
      { id: 'LOG-8', memberId: 'MEM-108', date: today, status: 'present', checkIn: '09:00 AM', checkOut: '05:30 PM', note: '' }
    ];

    this.save();
  }

  save() {
    localStorage.setItem(this.STORAGE_KEY_MEMBERS, JSON.stringify(this.members));
    localStorage.setItem(this.STORAGE_KEY_LOGS, JSON.stringify(this.logs));
  }

  getMembers() {
    return this.members;
  }

  getLogsByDate(dateString) {
    return this.logs.filter(log => log.date === dateString);
  }

  markAttendance(memberId, status, dateString = new Date().toISOString().split('T')[0], note = '') {
    const existingLog = this.logs.find(log => log.memberId === memberId && log.date === dateString);
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (existingLog) {
      existingLog.status = status;
      if (status === 'present' || status === 'late') {
        if (existingLog.checkIn === '--') existingLog.checkIn = timeNow;
      } else {
        existingLog.checkIn = '--';
        existingLog.checkOut = '--';
      }
      if (note) existingLog.note = note;
    } else {
      const newLog = {
        id: 'LOG-' + Date.now(),
        memberId,
        date: dateString,
        status,
        checkIn: (status === 'present' || status === 'late') ? timeNow : '--',
        checkOut: '--',
        note
      };
      this.logs.push(newLog);
    }
    this.save();
  }

  markAllPresent(dateString) {
    const todayLogs = this.getLogsByDate(dateString);
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    this.members.forEach(member => {
      const existing = todayLogs.find(l => l.memberId === member.id);
      if (existing) {
        existing.status = 'present';
        if (existing.checkIn === '--') existing.checkIn = timeNow;
      } else {
        this.logs.push({
          id: 'LOG-' + Date.now() + Math.random().toString(36).substr(2, 4),
          memberId: member.id,
          date: dateString,
          status: 'present',
          checkIn: timeNow,
          checkOut: '--',
          note: ''
        });
      }
    });
    this.save();
  }

  addMember(name, role, department, email) {
    const newMember = {
      id: 'MEM-' + (100 + this.members.length + 1),
      name,
      role,
      department,
      email
    };
    this.members.push(newMember);

    // Also create default 'present' entry for today
    const today = new Date().toISOString().split('T')[0];
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.logs.push({
      id: 'LOG-' + Date.now(),
      memberId: newMember.id,
      date: today,
      status: 'present',
      checkIn: timeNow,
      checkOut: '--',
      note: 'New Member'
    });

    this.save();
    return newMember;
  }

  getMetricsForDate(dateString) {
    const totalMembers = this.members.length;
    const logsForDate = this.getLogsByDate(dateString);

    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    logsForDate.forEach(log => {
      if (log.status === 'present') present++;
      else if (log.status === 'absent') absent++;
      else if (log.status === 'late') late++;
      else if (log.status === 'excused') excused++;
    });

    const unrecorded = Math.max(0, totalMembers - (present + absent + late + excused));
    const rate = totalMembers > 0 ? Math.round(((present + late) / totalMembers) * 100) : 0;

    return {
      total: totalMembers,
      present,
      absent: absent + unrecorded,
      late,
      excused,
      rate
    };
  }

  exportCSV(dateString) {
    const logsForDate = this.getLogsByDate(dateString);
    let csvContent = "data:text/csv;charset=utf-8,Member ID,Name,Department,Date,Status,Check In,Check Out,Notes\n";

    this.members.forEach(member => {
      const log = logsForDate.find(l => l.memberId === member.id) || { status: 'unrecorded', checkIn: '--', checkOut: '--', note: '' };
      csvContent += `"${member.id}","${member.name}","${member.department}","${dateString}","${log.status}","${log.checkIn}","${log.checkOut}","${log.note}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_report_${dateString}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Global store instance
window.attendanceStore = new AttendanceStore();
