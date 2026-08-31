/**
 * GODSPEED HQ - Real Supabase Cloud Auth Integration Wrapper
 * Configured with Production Security Flags & Real Supabase API
 */

window.GODSPEED_CONFIG = {
  SUPABASE_URL: 'https://asxnnxbzqxadhwwizpzl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzeG5ueGJ6cXhhZGh3d2l6cHpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MzAwMDcsImV4cCI6MjEwMzQwNjAwN30.4xykBLvnvoteXAOH9isjVYqh9py6EMuBiQv2Rtu0TW4',
  
  // Production Security Flag: Set to false to disable local demo fallback, test credential pre-fills, and identity switcher
  ENABLE_DEMO_MODE: false
};

// Initialize Supabase Client
window.godspeedSupabase = null;

if (typeof supabase !== 'undefined') {
  window.godspeedSupabase = supabase.createClient(
    window.GODSPEED_CONFIG.SUPABASE_URL, 
    window.GODSPEED_CONFIG.SUPABASE_ANON_KEY
  );
  console.log('GODSPEED HQ: Connected to Supabase Cloud API:', window.GODSPEED_CONFIG.SUPABASE_URL);
} else {
  console.warn('GODSPEED HQ: Supabase JS library not loaded.');
}

// Real Supabase Auth Helpers with Timeout Protection
window.supabaseAuth = {
  async signUpUser(email, password, fullName, phone, sponsor, office) {
    if (!window.godspeedSupabase) {
      console.error('Supabase client is not initialized');
      return { error: { message: 'Supabase client library not loaded. Check internet connection.' } };
    }

    try {
      console.log('Sending signUp request for:', email);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network request timed out after 12s. Please check your network connection.')), 12000)
      );

      const signUpPromise = window.godspeedSupabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone,
            sponsor: sponsor || '',
            office: office || 'HQ-AKR'
          }
        }
      });

      return await Promise.race([signUpPromise, timeoutPromise]);
    } catch (err) {
      console.error('signUpUser error:', err);
      return { error: { message: err.message || 'Signup request failed' } };
    }
  },

  async signInUser(email, password) {
    if (!window.godspeedSupabase) {
      return { error: { message: 'Supabase client library not loaded. Check internet connection.' } };
    }

    try {
      console.log('Sending signIn request for:', email);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network request timed out after 12s. Please check your network connection.')), 12000)
      );

      const signInPromise = window.godspeedSupabase.auth.signInWithPassword({
        email,
        password
      });

      return await Promise.race([signInPromise, timeoutPromise]);
    } catch (err) {
      console.error('signInUser error:', err);
      return { error: { message: err.message || 'Sign in request failed' } };
    }
  },

  async signOutUser() {
    if (!window.godspeedSupabase) return { error: null };
    try {
      return await window.godspeedSupabase.auth.signOut();
    } catch (err) {
      return { error: err };
    }
  },

  async getSupabaseSession() {
    if (!window.godspeedSupabase) return { data: { session: null } };
    try {
      return await window.godspeedSupabase.auth.getSession();
    } catch (err) {
      return { data: { session: null }, error: err };
    }
  },

  onAuthChange(callback) {
    if (!window.godspeedSupabase) return;
    try {
      window.godspeedSupabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
      });
    } catch (err) {
      console.warn('onAuthChange error:', err);
    }
  }
};
