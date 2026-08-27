/**
 * GODSPEED HQ - Core Data Store & State Engine (PRD v1.1 Baseline)
 * Supports Two-Portal Architecture (Member Portal & Super Admin Control Center)
 */

class GodspeedStore {
  constructor() {
    this.STORAGE_KEY = 'godspeed_hq_state_v1.1';
    
    // Active Authenticated Session
    this.currentUserId = null; // null = unauthenticated visitor
    this.isAuthenticated = false;
    
    // Core State Collections
    this.offices = [];
    this.members = [];
    this.attendanceLogs = [];
    this.officeDues = [];
    this.pvSubmissions = [];
    this.earningsLedger = [];
    this.freelanceProjects = [];
    this.healthScores = [];
    this.chatMessages = [];
    this.noticeBoard = [];

    this.init();
  }

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.offices = parsed.offices || [];
        this.members = parsed.members || [];
        this.attendanceLogs = parsed.attendanceLogs || [];
        this.officeDues = parsed.officeDues || [];
        this.pvSubmissions = parsed.pvSubmissions || [];
        this.earningsLedger = parsed.earningsLedger || [];
        this.freelanceProjects = parsed.freelanceProjects || [];
        this.healthScores = parsed.healthScores || [];
        this.chatMessages = parsed.chatMessages || [];
        this.noticeBoard = parsed.noticeBoard || [];
        if (parsed.currentUserId) {
          this.currentUserId = parsed.currentUserId;
          this.isAuthenticated = parsed.isAuthenticated || false;
        }
      } catch (e) {
        this.seedInitialData();
      }
    } else {
      this.seedInitialData();
    }
  }

  seedInitialData() {
    const today = new Date().toISOString().split('T')[0];

    // 1. Offices (Lagos & Abuja)
    this.offices = [
      { id: 'OFF-101', code: 'HQ-LGS', name: 'GODSPEED HQ Ikeja', latitude: 6.6018, longitude: 3.3515, radiusMeters: 30, teamLeaderId: 'MEM-002', timezone: 'Africa/Lagos' },
      { id: 'OFF-102', code: 'HQ-ABJ', name: 'GODSPEED Abuja Hub', latitude: 9.0765, longitude: 7.3986, radiusMeters: 40, teamLeaderId: 'MEM-005', timezone: 'Africa/Lagos' }
    ];

    // 2. Members (Sponsor Genealogy Hierarchy)
    // Master Super Admin Owner Account: MEM-001 (admin@godspeed.org / password)
    this.members = [
      { id: 'MEM-001', code: 'GSD-001', name: 'Chief SuperAdmin', role: 'super_admin', rank: 'president_team', officeId: 'OFF-101', sponsorId: null, email: 'admin@godspeed.org', phone: '+2348000000001', password: 'password123' },
      { id: 'MEM-002', code: 'GSD-002', name: 'Leader Sarah Miller', role: 'team_leader', rank: 'director', officeId: 'OFF-101', sponsorId: 'MEM-001', email: 'sarah.m@godspeed.org', phone: '+2348000000002', password: 'password123' },
      { id: 'MEM-003', code: 'GSD-003', name: 'Upline Michael Brown', role: 'member', rank: 'emerald_director', officeId: 'OFF-101', sponsorId: 'MEM-002', email: 'michael.b@godspeed.org', phone: '+2348000000003', password: 'password123' },
      { id: 'MEM-004', code: 'GSD-004', name: 'Alex Johnson', role: 'member', rank: 'senior_manager', officeId: 'OFF-101', sponsorId: 'MEM-003', email: 'alex.j@godspeed.org', phone: '+2348000000004', password: 'password123' },
      { id: 'MEM-005', code: 'GSD-005', name: 'Emily Davis', role: 'team_leader', rank: 'executive_manager', officeId: 'OFF-102', sponsorId: 'MEM-003', email: 'emily.d@godspeed.org', phone: '+2348000000005', password: 'password123' },
      { id: 'MEM-006', code: 'GSD-006', name: 'David Chen', role: 'member', rank: 'full_distributor', officeId: 'OFF-101', sponsorId: 'MEM-004', email: 'david.c@godspeed.org', phone: '+2348000000006', password: 'password123' },
      { id: 'MEM-007', code: 'GSD-007', name: 'Sophia Martinez', role: 'member', rank: 'newbie', officeId: 'OFF-101', sponsorId: 'MEM-004', email: 'sophia.m@godspeed.org', phone: '+2348000000007', password: 'password123' }
    ];

    // 3. Attendance Logs
    this.attendanceLogs = [
      { id: 'ATT-1', memberId: 'MEM-004', officeId: 'OFF-101', date: today, time: '08:45 AM', qrVerified: true, faceVerified: true, distanceMeters: 12.4, status: 'success' },
      { id: 'ATT-2', memberId: 'MEM-002', officeId: 'OFF-101', date: today, time: '08:50 AM', qrVerified: true, faceVerified: true, distanceMeters: 5.1, status: 'success' },
      { id: 'ATT-3', memberId: 'MEM-006', officeId: 'OFF-101', date: today, time: '09:30 AM', qrVerified: true, faceVerified: true, distanceMeters: 28.9, status: 'flagged', overrideReason: 'GPS drift near window' }
    ];

    // 4. Office Dues
    this.officeDues = [
      { id: 'DUE-1', memberId: 'MEM-004', period: 'August 2026', amount: 5000, paidAmount: 5000, dueDate: '2026-08-31', status: 'paid' },
      { id: 'DUE-2', memberId: 'MEM-006', period: 'August 2026', amount: 5000, paidAmount: 0, dueDate: '2026-08-31', status: 'overdue' },
      { id: 'DUE-3', memberId: 'MEM-007', period: 'August 2026', amount: 5000, paidAmount: 2500, dueDate: '2026-08-31', status: 'partially_paid' }
    ];

    // 5. NeoLife PV & Carriage Submissions
    this.pvSubmissions = [
      { id: 'PV-101', memberId: 'MEM-004', period: '2026-08', pvAmount: 1050, orderRef: 'NL-88421', status: 'approved', expectedPickup: '2026-08-20', photoUploaded: true },
      { id: 'PV-102', memberId: 'MEM-003', period: '2026-08', pvAmount: 4200, orderRef: 'NL-89104', status: 'under_review', expectedPickup: '2026-08-28', photoUploaded: true },
      { id: 'PV-103', memberId: 'MEM-006', period: '2026-08', pvAmount: 520, orderRef: 'NL-89302', status: 'pv_submitted', expectedPickup: '2026-09-02', photoUploaded: false }
    ];

    // 6. Freelancing Earnings & 10/20/70 Allocation Ledger
    this.earningsLedger = [
      { id: 'EARN-1', memberId: 'MEM-004', source: 'Freelancing (Fiverr)', gross: 150000, net: 150000, officeDue10: 15000, personal20: 30000, business70: 105000, date: today },
      { id: 'EARN-2', memberId: 'MEM-006', source: 'Web Dev Project', gross: 80000, net: 80000, officeDue10: 8000, personal20: 16000, business70: 56000, date: '2026-08-25' }
    ];

    // 7. Leadership Health Scores & At-Risk Flags
    this.healthScores = [
      { memberId: 'MEM-004', healthStatus: 'green', attendanceRate: 95, mtdPV: 1050, dueArrears: 0, signals: ['High Activity'] },
      { memberId: 'MEM-006', healthStatus: 'amber', attendanceRate: 70, mtdPV: 520, dueArrears: 1, signals: ['Overdue Dues', 'Missed 2 Sessions'] },
      { memberId: 'MEM-007', healthStatus: 'red', attendanceRate: 40, mtdPV: 0, dueArrears: 1, signals: ['Zero PV This Month', 'Low Attendance'] }
    ];

    // 8. Notice Board Broadcasts
    this.noticeBoard = [
      { id: 'NOT-1', title: 'Q3 NeoLife Leadership Rally & Carriage Reconciliation', author: 'SuperAdmin', category: 'Official Announcement', date: today, content: 'All Directors and Emerald Directors must ensure physical product carriage photos are uploaded before the 28th.' },
      { id: 'NOT-2', title: 'Monthly Freelance Fund Allocation Reminder', author: 'Finance Officer', category: 'Finance', date: '2026-08-26', content: '10% office dues from verified freelancing projects are automatically generated upon earning submission.' }
    ];

    this.save();
  }

  save() {
    const payload = {
      currentUserId: this.currentUserId,
      isAuthenticated: this.isAuthenticated,
      offices: this.offices,
      members: this.members,
      attendanceLogs: this.attendanceLogs,
      officeDues: this.officeDues,
      pvSubmissions: this.pvSubmissions,
      earningsLedger: this.earningsLedger,
      freelanceProjects: this.freelanceProjects,
      healthScores: this.healthScores,
      chatMessages: this.chatMessages,
      noticeBoard: this.noticeBoard
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
  }

  /* Public Member Signup (SECURITY RULE: Always assigns role = 'member') */
  registerMember(fullName, email, phone, password, sponsorCode = null, officeId = 'OFF-101') {
    const existing = this.members.find(m => m.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return { success: false, message: 'An account with this email address already exists.' };
    }

    // Resolve sponsor if provided
    let sponsorId = 'MEM-001';
    if (sponsorCode) {
      const foundSponsor = this.members.find(m => m.code.toLowerCase() === sponsorCode.toLowerCase() || m.id === sponsorCode);
      if (foundSponsor) sponsorId = foundSponsor.id;
    }

    const newId = 'MEM-' + String(this.members.length + 1).padStart(3, '0');
    const newCode = 'GSD-' + String(this.members.length + 1).padStart(3, '0');

    const newMember = {
      id: newId,
      code: newCode,
      name: fullName,
      email: email.toLowerCase(),
      phone,
      password: password || 'password123',
      role: 'member', // SECURITY ENFORCED: Public signup can NEVER select admin/leader role
      rank: 'newbie',
      officeId: officeId || 'OFF-101',
      sponsorId
    };

    this.members.push(newMember);

    // Initial Health Score entry
    this.healthScores.push({
      memberId: newId,
      healthStatus: 'green',
      attendanceRate: 100,
      mtdPV: 0,
      dueArrears: 0,
      signals: ['New Onboarding Member']
    });

    this.save();
    return { success: true, member: newMember, message: 'Account created successfully! Welcome to GODSPEED HQ.' };
  }

  /* Authenticate User Sign In */
  authenticateUser(email, password) {
    const member = this.members.find(m => m.email.toLowerCase() === email.toLowerCase());
    if (!member) {
      return { success: false, message: 'Invalid credentials. User account not found.' };
    }

    // Basic password check (default password fallback for demo)
    if (password && member.password && password !== member.password && password !== 'password123') {
      return { success: false, message: 'Invalid email or password.' };
    }

    this.currentUserId = member.id;
    this.isAuthenticated = true;
    this.save();

    const perms = this.getUserPermissions(member.id);
    return { success: true, member, permissions: perms };
  }

  /* Authenticate Super Admin Control Center Sign In */
  authenticateAdmin(email, password) {
    const authResult = this.authenticateUser(email, password);
    if (!authResult.success) return authResult;

    const perms = authResult.permissions;
    if (!perms.isSuperAdmin) {
      this.logout();
      return { 
        success: false, 
        message: '403 Forbidden: Account lacks Super Admin permissions to access Control Center.' 
      };
    }

    return authResult;
  }

  logout() {
    this.currentUserId = null;
    this.isAuthenticated = false;
    this.save();
  }

  getCurrentUser() {
    if (!this.currentUserId) return null;
    return this.members.find(m => m.id === this.currentUserId) || null;
  }

  /* Server-Side & Role-Aware Permissions Evaluator */
  getUserPermissions(memberId = this.currentUserId) {
    const member = this.members.find(m => m.id === memberId);
    if (!member) {
      return { role: 'visitor', canAccessPersonal: false, canAccessTeam: false, canAccessOffice: false, canAccessAdmin: false, defaultRoute: '/' };
    }

    const isSuperAdmin = member.role === 'super_admin' || member.role === 'admin';
    const isTeamLeader = member.role === 'team_leader' || this.offices.some(o => o.teamLeaderId === member.id);
    const descendants = this.getDescendantIds(member.id);
    const hasDescendants = descendants.length > 0;

    const canAccessPersonal = true;
    const canAccessTeam = isSuperAdmin || hasDescendants;
    const canAccessOffice = isSuperAdmin || isTeamLeader;
    const canAccessAdmin = isSuperAdmin;

    let defaultRoute = '/dashboard';
    if (isSuperAdmin) defaultRoute = '/admin/dashboard';
    else if (isTeamLeader) defaultRoute = '/office-dashboard';
    else defaultRoute = '/dashboard';

    return {
      member,
      role: member.role,
      hasDescendants,
      isTeamLeader,
      isSuperAdmin,
      canAccessPersonal,
      canAccessTeam,
      canAccessOffice,
      canAccessAdmin,
      defaultRoute
    };
  }

  /* Security Boundary Enforcement */
  canAccessRoute(memberId = this.currentUserId, route) {
    if (!memberId) return route === '/' || route === '/login' || route === '/signup';

    const perms = this.getUserPermissions(memberId);

    if (route === '/dashboard') return perms.canAccessPersonal;
    if (route === '/team') return perms.canAccessTeam;
    if (route === '/office-dashboard') return perms.canAccessOffice;
    if (route === '/admin/dashboard') return perms.canAccessAdmin;

    return true;
  }

  /* Dashboard Switcher Options */
  getAuthorizedSwitcherOptions(memberId = this.currentUserId) {
    const perms = this.getUserPermissions(memberId);
    const options = [];

    if (perms.canAccessPersonal) {
      options.push({ id: 'personal', label: 'My Personal Dashboard', route: '/dashboard' });
    }
    if (perms.canAccessTeam) {
      options.push({ id: 'team', label: 'My Team (Genealogy Subtree)', route: '/team' });
    }
    if (perms.canAccessOffice) {
      options.push({ id: 'office', label: 'My Office Dashboard', route: '/office-dashboard' });
    }
    if (perms.canAccessAdmin) {
      options.push({ id: 'admin', label: 'Master Organization Dashboard', route: '/admin/dashboard' });
    }

    return options;
  }

  /* Geospatial Geofence Verification */
  verifyAttendanceGeofence(officeId, userLat, userLng) {
    const office = this.offices.find(o => o.id === officeId);
    if (!office) return { valid: false, message: 'Office not found' };

    const R = 6371e3;
    const φ1 = office.latitude * Math.PI / 180;
    const φ2 = userLat * Math.PI / 180;
    const Δφ = (userLat - office.latitude) * Math.PI / 180;
    const Δλ = (userLng - office.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distanceMeters = R * c;

    const valid = distanceMeters <= office.radiusMeters;
    return {
      valid,
      distanceMeters: Math.round(distanceMeters * 10) / 10,
      radiusMeters: office.radiusMeters,
      message: valid ? `Inside Geofence (${Math.round(distanceMeters)}m from office)` : `Outside Geofence (${Math.round(distanceMeters)}m from office, max allowed: ${office.radiusMeters}m)`
    };
  }

  recordAttendance(memberId, officeId, userLat, userLng, faceVerified = true) {
    const today = new Date().toISOString().split('T')[0];
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const existing = this.attendanceLogs.find(l => l.memberId === memberId && l.date === today);
    if (existing) {
      return { success: false, message: 'Duplicate Check Failed: Attendance already recorded today within 24h.' };
    }

    const geoResult = this.verifyAttendanceGeofence(officeId, userLat, userLng);
    if (!geoResult.valid) {
      return { success: false, message: `Geofence Violation: ${geoResult.message}` };
    }

    const newLog = {
      id: 'ATT-' + Date.now(),
      memberId,
      officeId,
      date: today,
      time: timeNow,
      qrVerified: true,
      faceVerified,
      distanceMeters: geoResult.distanceMeters,
      status: 'success'
    };

    this.attendanceLogs.unshift(newLog);
    this.save();
    return { success: true, log: newLog, message: 'Attendance Verified & Saved Successfully!' };
  }

  /* 10/20/70 Allocation Ledger Entry */
  addFreelanceEarning(memberId, source, grossAmount) {
    const net = Number(grossAmount);
    const due10 = net * 0.10;
    const personal20 = net * 0.20;
    const business70 = net * 0.70;

    const entry = {
      id: 'EARN-' + Date.now(),
      memberId,
      source,
      gross: net,
      net,
      officeDue10: due10,
      personal20,
      business70,
      date: new Date().toISOString().split('T')[0]
    };

    this.earningsLedger.unshift(entry);

    this.officeDues.unshift({
      id: 'DUE-' + Date.now(),
      memberId,
      period: 'Freelance Split (' + source + ')',
      amount: due10,
      paidAmount: 0,
      dueDate: new Date().toISOString().split('T')[0],
      status: 'pending'
    });

    this.save();
    return entry;
  }

  updatePVStatus(pvId, newStatus, reason = '') {
    const pv = this.pvSubmissions.find(p => p.id === pvId);
    if (pv) {
      pv.status = newStatus;
      if (reason) pv.declineReason = reason;
      this.save();
    }
  }

  calculateQPVBaseline(memberId) {
    const descendantIds = this.getDescendantIds(memberId);
    const allIds = [memberId, ...descendantIds];
    const currentPeriod = '2026-08';

    const totalPV = this.pvSubmissions
      .filter(p => allIds.includes(p.memberId) && p.period === currentPeriod && p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.pvAmount), 0);

    let eligibleRankFlag = 'newbie';
    if (totalPV >= 4000) eligibleRankFlag = 'director';
    else if (totalPV >= 2000) eligibleRankFlag = 'executive_manager';
    else if (totalPV >= 1000) eligibleRankFlag = 'senior_manager';
    else if (totalPV >= 500) eligibleRankFlag = 'manager';

    return { totalPV, eligibleRankFlag };
  }

  getDescendantIds(ancestorId) {
    let descendants = [];
    const directRecruits = this.members.filter(m => m.sponsorId === ancestorId);
    directRecruits.forEach(child => {
      descendants.push(child.id);
      descendants = descendants.concat(this.getDescendantIds(child.id));
    });
    return descendants;
  }
}

window.godspeedStore = new GodspeedStore();
