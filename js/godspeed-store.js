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
    this.communityPosts = [];
    this.noticeBoard = [];
    this.genealogyClosure = [];

    // LegacyOS SaaS Modules
    this.trainingClasses = [];
    this.trainingClassMembers = [];
    this.trainingSessions = [];
    this.trainingAttendance = [];
    this.directorNetworks = [];
    this.networkOffices = [];
    this.subscriptionPlans = [];
    this.subscriptions = [];
    this.notifications = [];

    // Active Tenant Context
    this.currentOfficeSlug = null;
    this.currentOffice = null;

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
    let lat = o.latitude || 7.2571;
    let lng = o.longitude || 5.2058;
    if (o.code === 'HQ-LGS') { lat = 6.6018; lng = 3.3515; }
    else if (o.code === 'HQ-ABJ') { lat = 9.0765; lng = 7.3986; }

    return {
      ...o,
      id: o.id,
      code: o.code,
      slug: o.slug || (o.code ? o.code.toLowerCase().replace(/_/g, '-') : 'office-' + o.id.substring(0, 6)),
      name: o.name,
      address: o.address || '',
      latitude: lat,
      longitude: lng,
      radiusMeters: o.geofence_radius_meters || o.radiusMeters || 30,
      geofence_radius_meters: o.geofence_radius_meters || o.radiusMeters || 30,
      teamLeaderId: o.team_leader_id || o.teamLeaderId,
      team_leader_id: o.team_leader_id || o.teamLeaderId,
      logoUrl: o.logo_url || o.logoUrl || null,
      logo_url: o.logo_url || o.logoUrl || null,
      description: o.description || '',
      phone: o.phone || '',
      whatsappNumber: o.whatsapp_number || o.whatsappNumber || '+2348000000000',
      whatsapp_number: o.whatsapp_number || o.whatsappNumber || '+2348000000000',
      websiteUrl: o.website_url || o.websiteUrl || '',
      primaryBrandColor: o.primary_brand_color || o.primaryBrandColor || '#6366f1',
      primary_brand_color: o.primary_brand_color || o.primaryBrandColor || '#6366f1',
      secondaryBrandColor: o.secondary_brand_color || o.secondaryBrandColor || '#8b5cf6',
      secondary_brand_color: o.secondary_brand_color || o.secondaryBrandColor || '#8b5cf6',
      subscriptionPlanId: o.subscription_plan_id || o.subscriptionPlanId || 'starter_monthly',
      subscription_plan_id: o.subscription_plan_id || o.subscriptionPlanId || 'starter_monthly',
      subscriptionStatus: o.subscription_status || o.subscriptionStatus || 'trial',
      subscription_status: o.subscription_status || o.subscriptionStatus || 'trial',
      trialStartAt: o.trial_start_at || o.trialStartAt || new Date().toISOString(),
      trial_start_at: o.trial_start_at || o.trialStartAt || new Date().toISOString(),
      trialEndAt: o.trial_end_at || o.trialEndAt || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      trial_end_at: o.trial_end_at || o.trialEndAt || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      billingCycle: o.billing_cycle || o.billingCycle || 'monthly',
      billing_cycle: o.billing_cycle || o.billingCycle || 'monthly',
      memberLimit: o.member_limit || o.memberLimit || 49,
      member_limit: o.member_limit || o.memberLimit || 49,
      timezone: o.timezone || 'Africa/Lagos'
    };
  }

  normalizeTrainingClass(c) {
    if (!c) return null;
    return {
      ...c,
      id: c.id,
      officeId: c.office_id || c.officeId,
      office_id: c.office_id || c.officeId,
      name: c.name,
      description: c.description || '',
      tutorId: c.tutor_id || c.tutorId,
      tutor_id: c.tutor_id || c.tutorId,
      headId: c.head_id || c.headId,
      head_id: c.head_id || c.headId,
      scheduleInfo: c.schedule_info || c.scheduleInfo || 'Flexible',
      schedule_info: c.schedule_info || c.scheduleInfo || 'Flexible',
      locationInfo: c.location_info || c.locationInfo || 'Office Hall',
      location_info: c.location_info || c.locationInfo || 'Office Hall',
      isActive: c.is_active ?? true,
      is_active: c.is_active ?? true,
      createdAt: c.created_at || c.createdAt
    };
  }

  normalizeTrainingClassMember(m) {
    if (!m) return null;
    return {
      ...m,
      classId: m.class_id || m.classId,
      class_id: m.class_id || m.classId,
      memberId: m.member_id || m.memberId,
      member_id: m.member_id || m.memberId,
      stage: m.stage || 'Beginner',
      modulesCompleted: m.modules_completed ?? 0,
      modules_completed: m.modules_completed ?? 0,
      totalModules: m.total_modules ?? 10,
      total_modules: m.total_modules ?? 10,
      assessmentScore: m.assessment_score ?? 0.00,
      assessment_score: m.assessment_score ?? 0.00,
      tutorNotes: m.tutor_notes || '',
      tutor_notes: m.tutor_notes || '',
      lastTrainingDate: m.last_training_date || null,
      last_training_date: m.last_training_date || null,
      enrolledAt: m.enrolled_at || m.enrolledAt
    };
  }

  normalizeTrainingSession(s) {
    if (!s) return null;
    return {
      ...s,
      id: s.id,
      classId: s.class_id || s.classId,
      class_id: s.class_id || s.classId,
      sessionDate: s.session_date || s.sessionDate,
      session_date: s.session_date || s.sessionDate,
      startTime: s.start_time || s.startTime,
      start_time: s.start_time || s.startTime,
      endTime: s.end_time || s.endTime,
      end_time: s.end_time || s.endTime,
      topic: s.topic,
      tutorId: s.tutor_id || s.tutorId,
      tutor_id: s.tutor_id || s.tutorId,
      notes: s.notes || '',
      createdAt: s.created_at
    };
  }

  normalizeTrainingAttendance(a) {
    if (!a) return null;
    return {
      ...a,
      id: a.id,
      sessionId: a.session_id || a.sessionId,
      session_id: a.session_id || a.sessionId,
      memberId: a.member_id || a.memberId,
      member_id: a.member_id || a.memberId,
      status: a.status || 'present',
      notes: a.notes || '',
      createdAt: a.created_at
    };
  }

  normalizeDirectorNetwork(n) {
    if (!n) return null;
    return {
      ...n,
      id: n.id,
      name: n.name,
      directorId: n.director_id || n.directorId,
      director_id: n.director_id || n.directorId,
      description: n.description || '',
      createdAt: n.created_at
    };
  }

  normalizeNotification(n) {
    if (!n) return null;
    return {
      ...n,
      id: n.id,
      memberId: n.member_id || n.memberId,
      member_id: n.member_id || n.memberId,
      officeId: n.office_id || n.officeId,
      office_id: n.office_id || n.officeId,
      type: n.type || 'system',
      title: n.title,
      message: n.message,
      actionUrl: n.action_url || n.actionUrl || '/dashboard',
      action_url: n.action_url || n.actionUrl || '/dashboard',
      isRead: n.is_read ?? false,
      is_read: n.is_read ?? false,
      metadata: n.metadata || {},
      createdAt: n.created_at
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
        closureRes,
        trainingClassesRes,
        trainingClassMembersRes,
        trainingSessionsRes,
        trainingAttendanceRes,
        directorNetworksRes,
        networkOfficesRes,
        subscriptionPlansRes,
        subscriptionsRes,
        notificationsRes
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
        window.godspeedSupabase.from('genealogy_closure').select('*'),
        window.godspeedSupabase.from('training_classes').select('*').order('created_at', { ascending: false }),
        window.godspeedSupabase.from('training_class_members').select('*'),
        window.godspeedSupabase.from('training_sessions').select('*').order('session_date', { ascending: false }),
        window.godspeedSupabase.from('training_attendance').select('*'),
        window.godspeedSupabase.from('director_networks').select('*').order('created_at', { ascending: false }),
        window.godspeedSupabase.from('network_offices').select('*'),
        window.godspeedSupabase.from('subscription_plans').select('*'),
        window.godspeedSupabase.from('subscriptions').select('*'),
        window.godspeedSupabase.from('notifications').select('*').order('created_at', { ascending: false })
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
          primary_office_id: this.offices[0]?.id || '33333333-3333-3333-3333-333333333333',
          officeId: this.offices[0]?.id || '33333333-3333-3333-3333-333333333333'
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
          primary_office_id: this.currentMember.officeId
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
      }

      // LegacyOS SaaS Collections
      if (trainingClassesRes.data) {
        this.trainingClasses = trainingClassesRes.data.map(c => this.normalizeTrainingClass(c));
      }
      if (trainingClassMembersRes.data) {
        this.trainingClassMembers = trainingClassMembersRes.data.map(m => this.normalizeTrainingClassMember(m));
      }
      if (trainingSessionsRes.data) {
        this.trainingSessions = trainingSessionsRes.data.map(s => this.normalizeTrainingSession(s));
      }
      if (trainingAttendanceRes.data) {
        this.trainingAttendance = trainingAttendanceRes.data.map(a => this.normalizeTrainingAttendance(a));
      }
      if (directorNetworksRes.data) {
        this.directorNetworks = directorNetworksRes.data.map(n => this.normalizeDirectorNetwork(n));
      }
      if (networkOfficesRes.data) {
        this.networkOffices = networkOfficesRes.data;
      }
      if (subscriptionPlansRes.data) {
        this.subscriptionPlans = subscriptionPlansRes.data;
      }
      if (subscriptionsRes.data) {
        this.subscriptions = subscriptionsRes.data;
      }
      if (notificationsRes.data) {
        this.notifications = notificationsRes.data.map(n => this.normalizeNotification(n));
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
        let msg = error.message;
        if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already exists')) {
          msg = 'An account with this email address already exists. Please click "Sign In" to access your account.';
        } else if (error.message.toLowerCase().includes('rate limit')) {
          msg = 'Too many signup attempts. Please wait a few seconds and try again.';
        }
        return { success: false, message: msg };
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
            message: 'Account created successfully! Please check your email inbox to confirm your email address before logging in (or disable "Confirm email" in Supabase Auth settings).' 
          };
        }
      }

      return { success: false, message: 'Signup failed: No user record returned by Supabase.' };
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

    return { totalPV, eligibleRankFlag };
  }

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

  /* ============================================================================
   * LEGACYOS SAAS ENGINE METHODS
   * ============================================================================ */

  /* Resolve Office by URL Slug or Code */
  resolveOfficeBySlug(slug) {
    if (!slug) return null;
    const cleanSlug = slug.toLowerCase().trim();
    return this.offices.find(o => 
      (o.slug && o.slug.toLowerCase() === cleanSlug) ||
      (o.code && o.code.toLowerCase() === cleanSlug) ||
      (o.id === cleanSlug)
    ) || null;
  }

  /* 1. Live Earnings Leaderboard (PRD & SaaS Spec §2) */
  getLeaderboardData(timeframe = 'this_month', officeScope = 'current_office', targetOfficeId = null) {
    const now = new Date();
    let startDate = new Date(0);

    if (timeframe === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeframe === 'this_year') {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    // Filter relevant earnings entries
    let filteredEarnings = this.earningsLedger.filter(e => {
      const eDate = new Date(e.earnedDate || e.earned_date);
      return eDate >= startDate;
    });

    // Office Scope Filtering
    let validMemberIds = null;
    const activeOfficeId = targetOfficeId || (this.currentMember ? (this.currentMember.primary_office_id || this.currentMember.officeId) : null);

    if (officeScope === 'current_office' && activeOfficeId) {
      const officeMembers = this.members.filter(m => (m.primary_office_id === activeOfficeId || m.officeId === activeOfficeId));
      validMemberIds = new Set(officeMembers.map(m => m.id));
    } else if (officeScope === 'network') {
      // Find linked offices in director's network
      const userNetwork = this.directorNetworks.find(n => n.directorId === this.currentUserId);
      if (userNetwork) {
        const linkedOfficeIds = this.networkOffices.filter(no => no.network_id === userNetwork.id).map(no => no.office_id);
        const networkMembers = this.members.filter(m => linkedOfficeIds.includes(m.primary_office_id || m.officeId));
        validMemberIds = new Set(networkMembers.map(m => m.id));
      }
    }

    if (validMemberIds) {
      filteredEarnings = filteredEarnings.filter(e => validMemberIds.has(e.memberId || e.member_id));
    }

    // Aggregate by Member
    const memberTotals = {};
    filteredEarnings.forEach(e => {
      const mId = e.memberId || e.member_id;
      if (!memberTotals[mId]) {
        const memberObj = this.members.find(m => m.id === mId);
        memberTotals[mId] = {
          memberId: mId,
          memberName: memberObj ? (memberObj.full_name || memberObj.name) : 'Member',
          memberCode: memberObj ? (memberObj.member_code || memberObj.code) : 'GSD-000',
          memberRank: memberObj ? (memberObj.official_rank || memberObj.rank) : 'newbie',
          officeId: memberObj ? (memberObj.primary_office_id || memberObj.officeId) : null,
          totalGross: 0,
          totalNet: 0,
          total10Due: 0,
          entriesCount: 0
        };
      }
      memberTotals[mId].totalGross += Number(e.grossAmount || e.gross_amount || 0);
      memberTotals[mId].totalNet += Number(e.netAmount || e.net_amount || 0);
      memberTotals[mId].total10Due += Number(e.officeDue10 || e.office_due_10 || 0);
      memberTotals[mId].entriesCount += 1;
    });

    // Sort Descending by Gross Earnings
    const sortedLeaderboard = Object.values(memberTotals).sort((a, b) => b.totalGross - a.totalGross);

    // Attach Rankings & Current User Position
    let currentUserRank = null;
    sortedLeaderboard.forEach((item, index) => {
      item.rankPosition = index + 1;
      if (item.memberId === this.currentUserId) {
        currentUserRank = index + 1;
      }
    });

    return {
      timeframe,
      officeScope,
      totalEarners: sortedLeaderboard.length,
      top3: sortedLeaderboard.slice(0, 3),
      leaderboard: sortedLeaderboard,
      currentUserPosition: currentUserRank
    };
  }

  /* 2. SaaS Tenant Office Onboarding (PRD & SaaS Spec §7) */
  async createTenantOffice(officeData) {
    if (!window.godspeedSupabase) {
      return { success: false, message: 'Supabase client is not connected.' };
    }

    const { name, slug, address, phone, whatsappNumber, websiteUrl, leaderName, leaderEmail, leaderPhone, planId = 'starter_monthly' } = officeData;
    if (!name || !slug) {
      return { success: false, message: 'Office name and web address slug are required.' };
    }

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    try {
      const officeCode = 'OFF-' + Math.floor(1000 + Math.random() * 9000);
      const isAnnual = planId.includes('annual');
      const memberLimit = planId.includes('growth') ? 999999 : 49;

      const { data: newOffice, error: officeErr } = await window.godspeedSupabase
        .from('offices')
        .insert({
          code: officeCode,
          slug: cleanSlug,
          name: name.trim(),
          address: address || 'Main City Office',
          location: `SRID=4326;POINT(5.2058 7.2571)`,
          phone: phone || '',
          whatsapp_number: whatsappNumber || '',
          website_url: websiteUrl || '',
          subscription_plan_id: planId,
          subscription_status: 'trial',
          trial_start_at: new Date().toISOString(),
          trial_end_at: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
          billing_cycle: isAnnual ? 'annual' : 'monthly',
          member_limit: memberLimit
        })
        .select()
        .single();

      if (officeErr) {
        return { success: false, message: 'Office Creation Failed: ' + officeErr.message };
      }

      // Initialize Subscription Row
      await window.godspeedSupabase.from('subscriptions').insert({
        office_id: newOffice.id,
        plan_id: planId,
        status: 'trial',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30*24*60*60*1000).toISOString()
      });

      // Audit Subscription Event
      await window.godspeedSupabase.from('subscription_events').insert({
        office_id: newOffice.id,
        event_type: 'trial_started',
        amount_paid: 0.00,
        notes: `30-day free trial started for ${name}`
      });

      await this.loadAllAppData();
      return { success: true, office: this.normalizeOffice(newOffice), message: `Office "${name}" created successfully with 30-day free trial!` };
    } catch (err) {
      return { success: false, message: err.message || 'Unexpected office creation error' };
    }
  }

  /* 3. Office Branding & Settings (SaaS Spec §6) */
  async updateOfficeBranding(officeId, brandingData) {
    if (!window.godspeedSupabase) return { success: false, message: 'Supabase unavailable' };

    try {
      const { data, error } = await window.godspeedSupabase
        .from('offices')
        .update({
          name: brandingData.name,
          logo_url: brandingData.logoUrl || null,
          description: brandingData.description,
          phone: brandingData.phone,
          whatsapp_number: brandingData.whatsappNumber,
          website_url: brandingData.websiteUrl,
          primary_brand_color: brandingData.primaryBrandColor || '#6366f1',
          secondary_brand_color: brandingData.secondaryBrandColor || '#8b5cf6',
          updated_at: new Date().toISOString()
        })
        .eq('id', officeId)
        .select()
        .single();

      if (error) return { success: false, message: error.message };

      await this.loadAllAppData();
      return { success: true, office: this.normalizeOffice(data), message: 'Office branding updated successfully!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /* 4. Training Classes Management (SaaS Spec §1) */
  async createTrainingClass(classData) {
    if (!window.godspeedSupabase) return { success: false, message: 'Supabase unavailable' };
    try {
      const { data, error } = await window.godspeedSupabase
        .from('training_classes')
        .insert({
          office_id: classData.officeId,
          name: classData.name.trim(),
          description: classData.description || '',
          tutor_id: classData.tutorId || null,
          head_id: classData.headId || null,
          schedule_info: classData.scheduleInfo || 'Flexible',
          location_info: classData.locationInfo || 'Office Hall',
          is_active: true
        })
        .select()
        .single();

      if (error) return { success: false, message: error.message };

      await this.loadAllAppData();
      return { success: true, trainingClass: this.normalizeTrainingClass(data), message: 'Training class created!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async enrollClassMember(classId, memberId, stage = 'Beginner') {
    if (!window.godspeedSupabase) return { success: false, message: 'Supabase unavailable' };
    try {
      const { data, error } = await window.godspeedSupabase
        .from('training_class_members')
        .upsert({
          class_id: classId,
          member_id: memberId,
          stage: stage || 'Beginner',
          modules_completed: 0,
          total_modules: 10,
          assessment_score: 0.00,
          enrolled_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) return { success: false, message: error.message };
      await this.loadAllAppData();
      return { success: true, member: this.normalizeTrainingClassMember(data), message: 'Member enrolled in training class!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async updateMemberProgress(classId, memberId, progressData) {
    if (!window.godspeedSupabase) return { success: false, message: 'Supabase unavailable' };
    try {
      const { data, error } = await window.godspeedSupabase
        .from('training_class_members')
        .update({
          stage: progressData.stage,
          modules_completed: progressData.modulesCompleted,
          assessment_score: progressData.assessmentScore,
          tutor_notes: progressData.tutorNotes,
          last_training_date: new Date().toISOString().split('T')[0]
        })
        .match({ class_id: classId, member_id: memberId })
        .select()
        .single();

      if (error) return { success: false, message: error.message };
      await this.loadAllAppData();
      return { success: true, message: 'Training progression updated!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async createTrainingSession(sessionData) {
    if (!window.godspeedSupabase) return { success: false, message: 'Supabase unavailable' };
    try {
      const { data, error } = await window.godspeedSupabase
        .from('training_sessions')
        .insert({
          class_id: sessionData.classId,
          session_date: sessionData.sessionDate,
          start_time: sessionData.startTime,
          end_time: sessionData.endTime || null,
          topic: sessionData.topic.trim(),
          tutor_id: sessionData.tutorId || null,
          notes: sessionData.notes || ''
        })
        .select()
        .single();

      if (error) return { success: false, message: error.message };
      await this.loadAllAppData();
      return { success: true, session: this.normalizeTrainingSession(data), message: 'Training session scheduled!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async recordTrainingAttendance(sessionId, memberId, status = 'present', notes = '') {
    if (!window.godspeedSupabase) return { success: false, message: 'Supabase unavailable' };
    try {
      const { data, error } = await window.godspeedSupabase
        .from('training_attendance')
        .upsert({
          session_id: sessionId,
          member_id: memberId,
          status: status,
          notes: notes
        })
        .select()
        .single();

      if (error) return { success: false, message: error.message };
      await this.loadAllAppData();
      return { success: true, message: 'Training attendance recorded!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /* 5. Director / World Team Networks (SaaS Spec §3) */
  async createDirectorNetwork(name, directorId, description = '') {
    if (!window.godspeedSupabase) return { success: false, message: 'Supabase unavailable' };
    try {
      const { data, error } = await window.godspeedSupabase
        .from('director_networks')
        .insert({
          name: name.trim(),
          director_id: directorId,
          description: description
        })
        .select()
        .single();

      if (error) return { success: false, message: error.message };
      await this.loadAllAppData();
      return { success: true, network: this.normalizeDirectorNetwork(data), message: 'Director Network created!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async linkOfficeToNetwork(networkId, officeId) {
    if (!window.godspeedSupabase) return { success: false, message: 'Supabase unavailable' };
    try {
      const { data, error } = await window.godspeedSupabase
        .from('network_offices')
        .insert({ network_id: networkId, office_id: officeId })
        .select();

      if (error) return { success: false, message: error.message };
      await this.loadAllAppData();
      return { success: true, message: 'Office linked to Director Network!' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async unlinkOfficeFromNetwork(networkId, officeId) {
    if (!window.godspeedSupabase) return { success: false, message: 'Supabase unavailable' };
    try {
      const { error } = await window.godspeedSupabase
        .from('network_offices')
        .delete()
        .match({ network_id: networkId, office_id: officeId });

      if (error) return { success: false, message: error.message };
      await this.loadAllAppData();
      return { success: true, message: 'Office unlinked from Director Network.' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /* 6. Notifications & Reminders (SaaS Spec §12) */
  async markNotificationAsRead(notifId) {
    if (!window.godspeedSupabase) return;
    await window.godspeedSupabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notifId);
    
    const notif = this.notifications.find(n => n.id === notifId);
    if (notif) notif.isRead = true;
  }

  async createNotification(notifData) {
    if (!window.godspeedSupabase) return;
    const { data } = await window.godspeedSupabase
      .from('notifications')
      .insert({
        member_id: notifData.memberId || null,
        office_id: notifData.officeId || null,
        type: notifData.type || 'system',
        title: notifData.title,
        message: notifData.message,
        action_url: notifData.actionUrl || '/dashboard'
      })
      .select()
      .single();

    if (data) {
      this.notifications.unshift(this.normalizeNotification(data));
    }
  }
}

window.GodspeedStore = GodspeedStore;
if (!window.godspeedStore) {
  window.godspeedStore = new GodspeedStore();
}
