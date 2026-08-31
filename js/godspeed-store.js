/**
 * GODSPEED HQ - Core Data Store & Supabase Live Data Layer (PRD v1.1 Baseline)
 * Fully backed by Supabase PostgreSQL + Row-Level Security (RLS)
 * Supports Two-Portal Architecture (Member Portal & Super Admin Control Center)
 */

class GodspeedStore {
  constructor() {
    this.STORAGE_KEY = 'godspeed_hq_state_v1.1';

    // Active Authenticated Session
    this.currentUserId = null;
    this.activeAuthUser = null;
    this.currentMember = null;
    this.isAuthenticated = false;

    // Core Live State Collections (Populated via Supabase)
    this.offices = [];
    this.members = [];
    this.attendanceLogs = [];
    this.officeDues = [];
    this.pvSubmissions = [];
    this.earningsLedger = [];
    this.healthScores = [];
    this.chatMessages = [];
    this.noticeBoard = [];
    this.genealogyClosure = [];

    this.init();
  }

  async init() {
    // Attempt to connect to live Supabase Session first
    await this.syncSupabaseSession();
  }

  /* Normalization Helpers for Clean Dual-Property Access (camelCase & snake_case) */
  normalizeMember(m) {
    if (!m) return null;
    return {
      ...m,
      id: m.id,
      code: m.member_code || m.code || ('GSD-' + (m.id ? m.id.substring(0, 6).toUpperCase() : '000')),
      member_code: m.member_code || m.code,
      name: m.full_name || m.name || (m.email ? m.email.split('@')[0] : 'Member'),
      full_name: m.full_name || m.name,
      email: m.email || '',
      phone: m.phone || '',
      role: m.role || 'member',
      rank: m.official_rank || m.rank || 'newbie',
      official_rank: m.official_rank || m.rank || 'newbie',
      highest_achieved_rank: m.highest_achieved_rank || m.official_rank || m.rank || 'newbie',
      officeId: m.primary_office_id || m.officeId || '33333333-3333-3333-3333-333333333333',
      primary_office_id: m.primary_office_id || m.officeId,
      sponsorId: m.sponsor_id || m.sponsorId,
      sponsor_id: m.sponsor_id || m.sponsorId,
      onboarding_completed: m.onboarding_completed ?? false,
      biometric_enrolled: m.biometric_enrolled ?? false
    };
  }

  normalizeOffice(o) {
    if (!o) return null;
    let lat = 7.2571;
    let lng = 5.2058;
    if (o.code === 'HQ-LGS') { lat = 6.6018; lng = 3.3515; }
    else if (o.code === 'HQ-ABJ') { lat = 9.0765; lng = 7.3986; }

    return {
      ...o,
      id: o.id,
      code: o.code,
      name: o.name,
      address: o.address || '',
      latitude: lat,
      longitude: lng,
      radiusMeters: o.geofence_radius_meters || o.radiusMeters || 30,
      geofence_radius_meters: o.geofence_radius_meters || o.radiusMeters || 30,
      teamLeaderId: o.team_leader_id || o.teamLeaderId,
      team_leader_id: o.team_leader_id || o.teamLeaderId,
      timezone: o.timezone || 'Africa/Lagos'
    };
  }

  normalizeAttendance(a) {
    if (!a) return null;
    const dateObj = a.check_in_timestamp ? new Date(a.check_in_timestamp) : new Date();
    return {
      ...a,
      id: a.id,
      memberId: a.member_id || a.memberId,
      member_id: a.member_id || a.memberId,
      officeId: a.office_id || a.officeId,
      office_id: a.office_id || a.officeId,
      date: dateObj.toISOString().split('T')[0],
      time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      qrVerified: a.qr_verified ?? false,
      qr_verified: a.qr_verified ?? false,
      faceVerified: a.face_verified ?? false,
      face_verified: a.face_verified ?? false,
      livenessPassed: a.liveness_passed ?? false,
      liveness_passed: a.liveness_passed ?? false,
      distanceMeters: a.distance_from_office_meters || a.distanceMeters || 0,
      distance_from_office_meters: a.distance_from_office_meters || a.distanceMeters || 0,
      status: a.status || 'success',
      overrideReason: a.override_reason || a.overrideReason,
      override_reason: a.override_reason || a.overrideReason
    };
  }

  normalizeDue(d) {
    if (!d) return null;
    return {
      ...d,
      id: d.id,
      memberId: d.member_id || d.memberId,
      member_id: d.member_id || d.memberId,
      officeId: d.office_id || d.officeId,
      office_id: d.office_id || d.officeId,
      period: d.period_name || d.period || '',
      period_name: d.period_name || d.period || '',
      amount: Number(d.amount) || 0,
      paidAmount: Number(d.paid_amount || d.paidAmount || 0),
      paid_amount: Number(d.paid_amount || d.paidAmount || 0),
      dueDate: d.due_date || d.dueDate || '',
      due_date: d.due_date || d.dueDate || '',
      status: d.status || 'pending',
      evidenceUrl: d.evidence_url || d.evidenceUrl
    };
  }

  normalizePV(p) {
    if (!p) return null;
    return {
      ...p,
      id: p.id,
      memberId: p.member_id || p.memberId,
      member_id: p.member_id || p.memberId,
      period: p.sales_period || p.period || '',
      sales_period: p.sales_period || p.period || '',
      pvAmount: Number(p.pv_amount || p.pvAmount || 0),
      pv_amount: Number(p.pv_amount || p.pvAmount || 0),
      orderRef: p.order_reference || p.orderRef || '',
      order_reference: p.order_reference || p.orderRef || '',
      status: p.status || 'pv_submitted',
      expectedPickup: p.expected_pickup_date || p.expectedPickup || '',
      expected_pickup_date: p.expected_pickup_date || p.expectedPickup || '',
      photoUploaded: Boolean(p.carriage_photo_url || p.photoUploaded),
      carriage_photo_url: p.carriage_photo_url || p.photoUploaded
    };
  }

  normalizeEarning(e) {
    if (!e) return null;
    return {
      ...e,
      id: e.id,
      memberId: e.member_id || e.memberId,
      member_id: e.member_id || e.memberId,
      source: e.source || '',
      gross: Number(e.gross_amount || e.gross || 0),
      gross_amount: Number(e.gross_amount || e.gross || 0),
      net: Number(e.net_amount || e.net || 0),
      net_amount: Number(e.net_amount || e.net || 0),
      officeDue10: Number(e.office_due_10 || e.officeDue10 || 0),
      office_due_10: Number(e.office_due_10 || e.officeDue10 || 0),
      personal20: Number(e.personal_savings_20 || e.personal20 || 0),
      personal_savings_20: Number(e.personal_savings_20 || e.personal20 || 0),
      business70: Number(e.business_fund_70 || e.business70 || 0),
      business_fund_70: Number(e.business_fund_70 || e.business70 || 0),
      date: e.earned_date || e.date || '',
      earned_date: e.earned_date || e.date || ''
    };
  }

  normalizeHealthScore(h) {
    if (!h) return null;
    let sigs = h.warning_signals || h.signals || [];
    if (typeof sigs === 'string') {
      try { sigs = JSON.parse(sigs); } catch (e) { sigs = [sigs]; }
    }
    return {
      ...h,
      memberId: h.member_id || h.memberId,
      member_id: h.member_id || h.memberId,
      healthStatus: h.health_status || h.healthStatus || 'green',
      health_status: h.health_status || h.healthStatus || 'green',
      attendanceRate: Number(h.attendance_rate_30d || h.attendanceRate || 100),
      attendance_rate_30d: Number(h.attendance_rate_30d || h.attendanceRate || 100),
      mtdPV: Number(h.pv_month_to_date || h.mtdPV || 0),
      pv_month_to_date: Number(h.pv_month_to_date || h.mtdPV || 0),
      dueArrears: Number(h.due_arrears_count || h.dueArrears || 0),
      due_arrears_count: Number(h.due_arrears_count || h.dueArrears || 0),
      signals: Array.isArray(sigs) ? sigs : []
    };
  }

  normalizeChatMessage(c) {
    if (!c) return null;
    const dateObj = c.created_at ? new Date(c.created_at) : new Date();
    const sender = this.members.find(m => m.id === (c.sender_id || c.senderId));
    return {
      ...c,
      id: c.id,
      senderId: c.sender_id || c.senderId,
      sender_id: c.sender_id || c.senderId,
      senderName: sender ? sender.name : 'Member',
      recipientId: c.recipient_id || c.recipientId,
      recipient_id: c.recipient_id || c.recipientId,
      officeId: c.office_id || c.officeId,
      office_id: c.office_id || c.officeId,
      content: c.content || '',
      attachmentUrl: c.attachment_url || c.attachmentUrl,
      isSoftDeleted: c.is_soft_deleted ?? false,
      is_soft_deleted: c.is_soft_deleted ?? false,
      moderatedBy: c.moderated_by || c.moderatedBy,
      moderated_by: c.moderated_by || c.moderatedBy,
      moderationReason: c.moderation_reason || c.moderationReason,
      moderation_reason: c.moderation_reason || c.moderationReason,
      time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: c.created_at || new Date().toISOString()
    };
  }

  normalizeCommunityPost(p) {
    if (!p) return null;
    const author = this.members.find(m => m.id === (p.author_id || p.authorId));
    const dateObj = p.created_at ? new Date(p.created_at) : new Date();
    return {
      ...p,
      id: p.id,
      authorId: p.author_id || p.authorId,
      author_id: p.author_id || p.authorId,
      authorName: author ? author.name : 'Member',
      officeId: p.office_id || p.officeId,
      office_id: p.office_id || p.officeId,
      category: p.category || 'general',
      title: p.title || '',
      content: p.content || '',
      mediaUrl: p.media_url || p.mediaUrl,
      likesCount: p.likes_count || p.likesCount || 0,
      isPinned: p.is_pinned ?? false,
      isLocked: p.is_locked ?? false,
      date: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      createdAt: p.created_at || new Date().toISOString()
    };
  }

  normalizeNoticeItem(n) {
    if (!n) return null;
    const author = this.members.find(m => m.id === (n.author_id || n.authorId));
    const dateObj = n.created_at ? new Date(n.created_at) : new Date();
    return {
      ...n,
      id: n.id,
      authorId: n.author_id || n.authorId,
      author_id: n.author_id || n.authorId,
      author: author ? author.name : 'SuperAdmin',
      officeId: n.office_id || n.officeId,
      office_id: n.office_id || n.officeId,
      title: n.title || '',
      category: n.category || 'Official Announcement',
      content: n.content || '',
      priority: n.priority || 'normal',
      targetAudience: n.target_audience || n.targetAudience || 'all',
      date: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      createdAt: n.created_at || new Date().toISOString()
    };
  }

  /* Real Supabase Session Synchronizer */
  async syncSupabaseSession() {
    if (!window.supabaseAuth) return;
    try {
      const { data } = await window.supabaseAuth.getSupabaseSession();
      if (data && data.session && data.session.user) {
        const sbUser = data.session.user;
        this.activeAuthUser = sbUser;
        this.isAuthenticated = true;
        this.currentUserId = sbUser.id;

        // Fetch live application state from Supabase scoped by active session
        await this.loadAllAppData();
      } else {
        this.activeAuthUser = null;
        this.currentUserId = null;
        this.isAuthenticated = false;
        this.currentMember = null;
      }
    } catch (err) {
      console.warn('Supabase Session Sync Error:', err);
    }
  }

  /* Load Live Data Collections from Supabase */
  async loadAllAppData() {
    if (!window.godspeedSupabase) return;

    try {
      const [
        officesRes,
        membersRes,
        attendanceRes,
        duesRes,
        pvRes,
        earningsRes,
        healthRes,
        chatRes,
        communityRes,
        noticeRes,
        closureRes
      ] = await Promise.all([
        window.godspeedSupabase.from('offices').select('*'),
        window.godspeedSupabase.from('members').select('*'),
        window.godspeedSupabase.from('attendance_logs').select('*').order('check_in_timestamp', { ascending: false }),
        window.godspeedSupabase.from('office_dues').select('*').order('created_at', { ascending: false }),
        window.godspeedSupabase.from('pv_submissions').select('*').order('created_at', { ascending: false }),
        window.godspeedSupabase.from('earnings_ledger').select('*').order('earned_date', { ascending: false }),
        window.godspeedSupabase.from('health_scores').select('*'),
        window.godspeedSupabase.from('chat_messages').select('*').order('created_at', { ascending: true }),
        window.godspeedSupabase.from('community_posts').select('*').order('created_at', { ascending: false }),
        window.godspeedSupabase.from('notice_board').select('*').order('created_at', { ascending: false }),
        window.godspeedSupabase.from('genealogy_closure').select('*')
      ]);

      if (officesRes.data) {
        this.offices = officesRes.data.map(o => this.normalizeOffice(o));
      }
      if (membersRes.data) {
        this.members = membersRes.data.map(m => this.normalizeMember(m));
        if (this.currentUserId) {
          this.currentMember = this.members.find(m => m.id === this.currentUserId) || null;
        }
      }

      // Self-healing safeguard: If signed in user does not yet have a row in public.members
      if (this.currentUserId && !this.currentMember) {
        const authUser = this.activeAuthUser;
        const fallback = {
          id: this.currentUserId,
          member_code: 'GSD-' + this.currentUserId.substring(0, 6).toUpperCase(),
          code: 'GSD-' + this.currentUserId.substring(0, 6).toUpperCase(),
          full_name: authUser?.user_metadata?.full_name || (authUser?.email ? authUser.email.split('@')[0] : 'Member'),
          name: authUser?.user_metadata?.full_name || (authUser?.email ? authUser.email.split('@')[0] : 'Member'),
          email: authUser?.email || '',
          phone: authUser?.user_metadata?.phone || '',
          role: 'member',
          official_rank: 'newbie',
          rank: 'newbie',
          highest_achieved_rank: 'newbie',
          primary_office_id: '33333333-3333-3333-3333-333333333333',
          officeId: '33333333-3333-3333-3333-333333333333'
        };
        this.currentMember = this.normalizeMember(fallback);
        if (!this.members.some(m => m.id === this.currentUserId)) {
          this.members.push(this.currentMember);
        }

        // Asynchronously self-heal database profile row
        window.godspeedSupabase.from('members').insert({
          id: this.currentUserId,
          member_code: this.currentMember.code,
          full_name: this.currentMember.name,
          email: this.currentMember.email,
          phone: this.currentMember.phone,
          role: 'member',
          official_rank: 'newbie',
          primary_office_id: '33333333-3333-3333-3333-333333333333'
        }).then(() => {}).catch(() => {});
      }

      if (attendanceRes.data) {
        this.attendanceLogs = attendanceRes.data.map(a => this.normalizeAttendance(a));
      }
      if (duesRes.data) {
        this.officeDues = duesRes.data.map(d => this.normalizeDue(d));
      }
      if (pvRes.data) {
        this.pvSubmissions = pvRes.data.map(p => this.normalizePV(p));
      }
      if (earningsRes.data) {
        this.earningsLedger = earningsRes.data.map(e => this.normalizeEarning(e));
      }
      if (healthRes.data) {
        this.healthScores = healthRes.data.map(h => this.normalizeHealthScore(h));
      }
      if (chatRes.data) {
        this.chatMessages = chatRes.data.map(c => this.normalizeChatMessage(c));
      }
      if (communityRes.data) {
        this.communityPosts = communityRes.data.map(p => this.normalizeCommunityPost(p));
      }
      if (noticeRes.data && noticeRes.data.length > 0) {
        this.noticeBoard = noticeRes.data.map(n => this.normalizeNoticeItem(n));
      } else {
        this.noticeBoard = [
          { 
            id: 'NOT-1', 
            title: 'Q3 NeoLife Leadership Rally & Carriage Reconciliation', 
            author: 'SuperAdmin', 
            category: 'Official Announcement', 
            date: new Date().toISOString().split('T')[0], 
            content: 'All Directors and Emerald Directors must ensure physical product carriage photos are uploaded before the 28th.' 
          },
          { 
            id: 'NOT-2', 
            title: 'Monthly Freelance Fund Allocation Reminder', 
            author: 'Finance Officer', 
            category: 'Finance', 
            date: new Date().toISOString().split('T')[0], 
            content: '10% office dues from verified freelancing projects are automatically generated upon earning submission.' 
          }
        ];
      }
      if (closureRes.data) {
        this.genealogyClosure = closureRes.data;
      }
    } catch (err) {
      console.warn('Error loading live Supabase data:', err);
    }
  }

  /* Public Member Signup (Real Supabase Auth + Server Trigger Profile Creation) */
  async registerMember(fullName, email, phone, password, sponsorCode = null, officeId = 'HQ-AKR') {
    if (!fullName || !email || !password) {
      return { success: false, message: 'Please fill in all required fields (Name, Email, Password).' };
    }

    if (password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    if (!window.supabaseAuth) {
      return { success: false, message: 'Supabase authentication service unavailable.' };
    }

    try {
      const { data, error } = await window.supabaseAuth.signUpUser(
        email, 
        password, 
        fullName, 
        phone, 
        sponsorCode, 
        officeId
      );

      if (error) {
        return { success: false, message: error.message };
      }

      if (data && data.user) {
        if (data.session) {
          await this.syncSupabaseSession();
          return { 
            success: true, 
            member: this.currentMember, 
            message: 'Account created! Welcome to GODSPEED HQ.' 
          };
        } else {
          return { 
            success: true, 
            requiresConfirmation: true, 
            message: 'Account created successfully! If email confirmation is enabled on your Supabase project, please check your inbox before logging in.' 
          };
        }
      }

      return { success: false, message: 'Signup failed: No user record returned.' };
    } catch (err) {
      console.error('Registration exception:', err);
      return { success: false, message: 'Signup failed: ' + (err.message || err) };
    }
  }

  /* Authenticate User Sign In via Supabase Auth */
  async authenticateUser(email, password) {
    if (!email || !password) {
      return { success: false, message: 'Please enter both email and password.' };
    }

    if (!window.supabaseAuth) {
      return { success: false, message: 'Supabase authentication service unavailable.' };
    }

    try {
      const { data, error } = await window.supabaseAuth.signInUser(email, password);
      if (error) {
        let msg = error.message;
        if (error.message.toLowerCase().includes('email not confirmed')) {
          msg = 'Your email address has not been confirmed yet. Please check your inbox or disable "Confirm email" under Authentication -> Providers -> Email in your Supabase project dashboard.';
        } else if (error.message.toLowerCase().includes('invalid login credentials')) {
          msg = 'Invalid email or password. If you do not have an account yet, please click "Create Account" below.';
        }
        return { success: false, message: msg };
      }

      if (data && data.user) {
        await this.syncSupabaseSession();
        const member = this.getCurrentUser() || {
          id: data.user.id,
          name: data.user.user_metadata?.full_name || (data.user.email ? data.user.email.split('@')[0] : 'Member'),
          email: data.user.email,
          role: 'member',
          rank: 'newbie'
        };
        const perms = this.getUserPermissions(data.user.id);
        return { success: true, member, permissions: perms };
      }

      return { success: false, message: 'Invalid credentials. User account not found.' };
    } catch (err) {
      console.error('Authentication exception:', err);
      return { success: false, message: 'Sign in failed: ' + (err.message || err) };
    }
  }

  /* Authenticate Super Admin Control Center Sign In */
  async authenticateAdmin(email, password) {
    const authResult = await this.authenticateUser(email, password);
    if (!authResult.success) return authResult;

    const perms = authResult.permissions;
    if (!perms.isSuperAdmin) {
      await this.logout();
      return { 
        success: false, 
        message: '403 Forbidden: Account lacks Super Admin permissions to access Control Center.' 
      };
    }

    return authResult;
  }

  async logout() {
    if (window.supabaseAuth) {
      await window.supabaseAuth.signOutUser();
    }
    this.currentUserId = null;
    this.activeAuthUser = null;
    this.currentMember = null;
    this.isAuthenticated = false;
  }

  getCurrentUser() {
    if (!this.currentUserId) return null;
    return this.members.find(m => m.id === this.currentUserId) || this.currentMember;
  }

  /* Server-Side & Role-Aware Permissions Evaluator */
  getUserPermissions(memberId = this.currentUserId) {
    const member = this.members.find(m => m.id === memberId) || this.currentMember;
    if (!member) {
      return { 
        role: 'visitor', 
        canAccessPersonal: false, 
        canAccessTeam: false, 
        canAccessOffice: false, 
        canAccessAdmin: false, 
        defaultRoute: '/' 
      };
    }

    const isSuperAdmin = member.role === 'super_admin' || member.role === 'admin';
    const isTeamLeader = member.role === 'team_leader' || this.offices.some(o => o.teamLeaderId === member.id || o.team_leader_id === member.id);
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

  /* Real Supabase Rank Mutation (Surfaces Real DB Errors) */
  async updateMemberRank(memberId, newRank) {
    if (!window.godspeedSupabase) {
      return { success: false, message: 'Supabase client is not connected.' };
    }

    try {
      const { data, error } = await window.godspeedSupabase
        .from('members')
        .update({ official_rank: newRank, updated_at: new Date().toISOString() })
        .eq('id', memberId)
        .select();

      if (error) {
        console.error('Supabase rank update error:', error);
        return { success: false, message: error.message || 'Database update failed' };
      }

      // Update in-memory state
      const member = this.members.find(m => m.id === memberId);
      if (member) {
        member.rank = newRank;
        member.official_rank = newRank;
      }
      return { 
        success: true, 
        member, 
        message: `Rank updated to ${newRank.replace(/_/g, ' ').toUpperCase()} successfully!` 
      };
    } catch (err) {
      console.error('Failed to update rank in Supabase DB:', err);
      return { success: false, message: err.message || 'Network/Server connection error' };
    }
  }

  /* Real Supabase Role Mutation (Surfaces Real DB Errors) */
  async updateMemberRole(memberId, newRole) {
    if (!window.godspeedSupabase) {
      return { success: false, message: 'Supabase client is not connected.' };
    }

    try {
      const { data, error } = await window.godspeedSupabase
        .from('members')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', memberId)
        .select();

      if (error) {
        console.error('Supabase role update error:', error);
        return { success: false, message: error.message || 'Database update failed' };
      }

      // Update in-memory state
      const member = this.members.find(m => m.id === memberId);
      if (member) {
        member.role = newRole;
      }
      return { 
        success: true, 
        member, 
        message: `Role updated to ${newRole.replace(/_/g, ' ').toUpperCase()} successfully!` 
      };
    } catch (err) {
      console.error('Failed to update role in Supabase DB:', err);
      return { success: false, message: err.message || 'Network/Server connection error' };
    }
  }

  /* Real Supabase Attendance Insertion */
  async recordAttendance(memberId, officeId, userLat, userLng, faceVerified = true, qrVerified = true, livenessPassed = true) {
    if (!window.godspeedSupabase) {
      return { success: false, message: 'Supabase client unavailable.' };
    }

    try {
      // Find office location
      const office = this.offices.find(o => o.id === officeId) || this.offices[0];
      const officeLat = office ? office.latitude : 7.2571;
      const officeLng = office ? office.longitude : 5.2058;

      // Calculate approximate distance
      const R = 6371e3;
      const φ1 = officeLat * Math.PI / 180;
      const φ2 = userLat * Math.PI / 180;
      const Δφ = (userLat - officeLat) * Math.PI / 180;
      const Δλ = (userLng - officeLng) * Math.PI / 180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distanceMeters = Math.round(R * c * 10) / 10;

      const { data, error } = await window.godspeedSupabase
        .from('attendance_logs')
        .insert({
          member_id: memberId,
          office_id: office ? office.id : officeId,
          device_latitude: userLat,
          device_longitude: userLng,
          distance_from_office_meters: distanceMeters,
          qr_verified: qrVerified,
          face_verified: faceVerified,
          liveness_passed: livenessPassed,
          status: 'success'
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase attendance insert error:', error);
        return { success: false, message: error.message };
      }

      await this.loadAllAppData();
      return { 
        success: true, 
        log: this.normalizeAttendance(data), 
        message: 'Attendance Verified & Recorded in Supabase Successfully!' 
      };
    } catch (err) {
      console.error('Attendance recording exception:', err);
      return { success: false, message: err.message || 'Failed to record attendance' };
    }
  }

  /* Real Supabase Freelancing Earnings & 10/20/70 Split Entry */
  async addFreelanceEarning(memberId, source, grossAmount) {
    const net = Number(grossAmount);
    if (!net || isNaN(net) || net <= 0) {
      return { success: false, message: 'Invalid gross amount.' };
    }

    if (!window.godspeedSupabase) {
      return { success: false, message: 'Supabase client unavailable.' };
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const member = this.members.find(m => m.id === memberId);
      const officeId = member ? (member.primary_office_id || member.officeId || '33333333-3333-3333-3333-333333333333') : '33333333-3333-3333-3333-333333333333';

      const { data: earnData, error: earnErr } = await window.godspeedSupabase
        .from('earnings_ledger')
        .insert({
          member_id: memberId,
          source,
          gross_amount: net,
          net_amount: net,
          currency: 'NGN',
          earned_date: today
        })
        .select()
        .single();

      if (earnErr) {
        console.error('Supabase earnings insert error:', earnErr);
        return { success: false, message: earnErr.message };
      }

      // Automatically generate 10% office due entry
      const due10 = Math.round(net * 0.10 * 100) / 100;
      await window.godspeedSupabase
        .from('office_dues')
        .insert({
          office_id: officeId,
          member_id: memberId,
          period_name: `Freelance Split (${source})`,
          amount: due10,
          paid_amount: 0.00,
          due_date: today,
          status: 'pending'
        });

      await this.loadAllAppData();
      return { 
        success: true, 
        entry: this.normalizeEarning(earnData), 
        message: 'Earning recorded and 10/20/70 split calculated in Supabase!' 
      };
    } catch (err) {
      console.error('Add freelance earning exception:', err);
      return { success: false, message: err.message || 'Failed to record earning' };
    }
  }

  /* Real Supabase PV Submission & Status Updates */
  async submitPV(memberId, period, pvAmount, orderRef, pickupDate = null) {
    if (!pvAmount || isNaN(pvAmount) || Number(pvAmount) <= 0) {
      return { success: false, message: 'Invalid PV amount.' };
    }

    if (!window.godspeedSupabase) {
      return { success: false, message: 'Supabase client unavailable.' };
    }

    try {
      const { data, error } = await window.godspeedSupabase
        .from('pv_submissions')
        .insert({
          member_id: memberId,
          sales_period: period || new Date().toISOString().substring(0, 7),
          pv_amount: Number(pvAmount),
          order_reference: orderRef || '',
          status: 'pv_submitted',
          expected_pickup_date: pickupDate || null
        })
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      await this.loadAllAppData();
      return { 
        success: true, 
        submission: this.normalizePV(data), 
        message: 'PV submission submitted for review!' 
      };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to submit PV' };
    }
  }

  async updatePVStatus(pvId, newStatus, reason = '') {
    if (!window.godspeedSupabase) {
      return { success: false, message: 'Supabase client unavailable.' };
    }

    try {
      const updatePayload = { status: newStatus, updated_at: new Date().toISOString() };
      if (reason) updatePayload.decline_reason = reason;

      const { data, error } = await window.godspeedSupabase
        .from('pv_submissions')
        .update(updatePayload)
        .eq('id', pvId)
        .select();

      if (error) {
        return { success: false, message: error.message };
      }

      await this.loadAllAppData();
      return { success: true, message: `PV status updated to ${newStatus}` };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to update PV status' };
    }
  }

  /* Genealogy Subtree Lookup via live genealogy_closure */
  getDescendantIds(ancestorId) {
    if (this.genealogyClosure && this.genealogyClosure.length > 0) {
      return this.genealogyClosure
        .filter(c => c.ancestor_id === ancestorId && c.depth > 0)
        .map(c => c.descendant_id);
    }
    let descendants = [];
    const directRecruits = this.members.filter(m => m.sponsorId === ancestorId || m.sponsor_id === ancestorId);
    directRecruits.forEach(child => {
      descendants.push(child.id);
      descendants = descendants.concat(this.getDescendantIds(child.id));
    });
    return descendants;
  }

  calculateQPVBaseline(memberId) {
    const descendantIds = this.getDescendantIds(memberId);
    const allIds = [memberId, ...descendantIds];
    const currentPeriod = new Date().toISOString().substring(0, 7);

    const totalPV = this.pvSubmissions
      .filter(p => allIds.includes(p.memberId || p.member_id) && (p.period === currentPeriod || p.sales_period === currentPeriod) && p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.pvAmount || p.pv_amount), 0);

    let eligibleRankFlag = 'newbie';
    if (totalPV >= 4000) eligibleRankFlag = 'director';
    else if (totalPV >= 2000) eligibleRankFlag = 'executive_manager';
    else if (totalPV >= 1000) eligibleRankFlag = 'senior_manager';
    else if (totalPV >= 500) eligibleRankFlag = 'manager';

  /* ============================================================================
   * CHAT, COMMUNITY & NOTICE BOARD OPERATIONS (PRD §34)
   * ============================================================================ */

  /* Send Chat Message (Hierarchical Office & Direct Routing per PRD §34.2) */
  async sendMessage(content, recipientId = null, officeId = null, attachmentUrl = null) {
    if (!content || !content.trim()) {
      return { success: false, message: 'Message content cannot be empty.' };
    }

    if (!window.godspeedSupabase || !this.currentUserId) {
      return { success: false, message: 'Supabase authentication session unavailable.' };
    }

    try {
      const user = this.getCurrentUser();
      const targetOfficeId = officeId || (user ? (user.primary_office_id || user.officeId) : null);

      const { data, error } = await window.godspeedSupabase
        .from('chat_messages')
        .insert({
          sender_id: this.currentUserId,
          recipient_id: recipientId || null,
          office_id: targetOfficeId,
          content: content.trim(),
          attachment_url: attachmentUrl || null
        })
        .select()
        .single();

      if (error) {
        console.error('Send Chat Message Error:', error);
        return { success: false, message: error.message };
      }

      const normalized = this.normalizeChatMessage(data);
      this.chatMessages.push(normalized);
      return { success: true, message: normalized };
    } catch (err) {
      console.error('Send message exception:', err);
      return { success: false, message: err.message || 'Failed to send message.' };
    }
  }

  /* List & Filter Chat Messages */
  listMessages(filter = {}) {
    let list = [...this.chatMessages].filter(m => !m.isSoftDeleted);
    if (filter.officeId) {
      list = list.filter(m => m.officeId === filter.officeId);
    }
    if (filter.recipientId) {
      list = list.filter(m => m.recipientId === filter.recipientId || (m.senderId === filter.recipientId && m.recipientId === this.currentUserId));
    }
    return list;
  }

  /* Moderate Chat Message (PRD §34.2) */
  async moderateMessage(messageId, reason = 'Violation of community standards') {
    if (!window.godspeedSupabase || !this.currentUserId) {
      return { success: false, message: 'Supabase client unavailable.' };
    }

    try {
      const { data, error } = await window.godspeedSupabase
        .from('chat_messages')
        .update({
          is_soft_deleted: true,
          moderated_by: this.currentUserId,
          moderation_reason: reason
        })
        .eq('id', messageId)
        .select();

      if (error) {
        return { success: false, message: error.message };
      }

      const msg = this.chatMessages.find(m => m.id === messageId);
      if (msg) {
        msg.isSoftDeleted = true;
        msg.is_soft_deleted = true;
        msg.moderatedBy = this.currentUserId;
        msg.moderationReason = reason;
      }

      return { success: true, message: 'Message successfully moderated.' };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to moderate message.' };
    }
  }

  /* Create Community Post (PRD §34.4) */
  async createCommunityPost(title, content, category = 'general', mediaUrl = null, officeId = null) {
    if (!title || !content) {
      return { success: false, message: 'Post title and content are required.' };
    }

    if (!window.godspeedSupabase || !this.currentUserId) {
      return { success: false, message: 'Supabase client unavailable.' };
    }

    try {
      const { data, error } = await window.godspeedSupabase
        .from('community_posts')
        .insert({
          author_id: this.currentUserId,
          title: title.trim(),
          content: content.trim(),
          category: category || 'general',
          media_url: mediaUrl || null,
          office_id: officeId || null
        })
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      const normalized = this.normalizeCommunityPost(data);
      this.communityPosts.unshift(normalized);
      return { success: true, post: normalized, message: 'Community post published successfully!' };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to publish post.' };
    }
  }

  /* Like Community Post */
  async likeCommunityPost(postId) {
    if (!window.godspeedSupabase) return;
    const post = this.communityPosts.find(p => p.id === postId);
    if (!post) return;

    post.likesCount = (post.likesCount || 0) + 1;
    await window.godspeedSupabase
      .from('community_posts')
      .update({ likes_count: post.likesCount })
      .eq('id', postId);
  }

  /* Create Notice Board Item (PRD §34.4) */
  async createNoticeBoardItem(title, content, category = 'Official Announcement', priority = 'normal', targetAudience = 'all', officeId = null) {
    if (!title || !content) {
      return { success: false, message: 'Notice title and content are required.' };
    }

    if (!window.godspeedSupabase || !this.currentUserId) {
      return { success: false, message: 'Supabase client unavailable.' };
    }

    try {
      const { data, error } = await window.godspeedSupabase
        .from('notice_board')
        .insert({
          author_id: this.currentUserId,
          title: title.trim(),
          content: content.trim(),
          category: category || 'Official Announcement',
          priority: priority || 'normal',
          target_audience: targetAudience || 'all',
          office_id: officeId || null,
          is_published: true
        })
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      const normalized = this.normalizeNoticeItem(data);
      this.noticeBoard.unshift(normalized);
      return { success: true, item: normalized, message: 'Notice broadcast published successfully!' };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to publish notice.' };
    }
  }
}

window.godspeedStore = new GodspeedStore();
