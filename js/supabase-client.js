/**
 * GODSPEED HQ - Supabase Cloud Client Integration
 */

const SUPABASE_URL = 'https://asxnnxbzqxadhwwizpzl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzeG5ueGJ6cXhhZGh3d2l6cHpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MzAwMDcsImV4cCI6MjEwMzQwNjAwN30.4xykBLvnvoteXAOH9isjVYqh9py6EMuBiQv2Rtu0TW4';

// Initialize Supabase Client
window.godspeedSupabase = null;

if (typeof supabase !== 'undefined') {
  window.godspeedSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('GODSPEED HQ: Supabase Cloud Client initialized successfully for endpoint:', SUPABASE_URL);
} else {
  console.warn('GODSPEED HQ: Supabase JS library loading...');
}
