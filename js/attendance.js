/**
 * GODSPEED HQ - Attendance Verification Engine (PRD §12 Compliance)
 * Real sequence: QR Code Scan -> Biometric/Liveness Camera -> High-Accuracy GPS -> Server Geofence RPC -> Attendance Log
 */

class AttendanceVerificationEngine {
  constructor() {
    this.html5QrCode = null;
    this.videoStream = null;
    this.currentCoordinates = null;
    this.isScanning = false;
  }

  /* 1. Real QR Code Scanner (html5-qrcode integration) */
  async startQrScanner(elementId, onSuccess, onError) {
    if (typeof Html5Qrcode === 'undefined') {
      console.warn('Html5Qrcode library not loaded.');
      if (onError) onError(new Error('QR scanning library not available.'));
      return;
    }

    try {
      this.html5QrCode = new Html5Qrcode(elementId);
      this.isScanning = true;
      await this.html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 }
        },
        (decodedText, decodedResult) => {
          this.stopQrScanner();
          if (onSuccess) onSuccess(decodedText, decodedResult);
        },
        (errorMessage) => {
          // Ignored per-frame scan attempts
        }
      );
    } catch (err) {
      console.error('QR Scanner Start Error:', err);
      this.isScanning = false;
      if (onError) onError(err);
    }
  }

  async stopQrScanner() {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
        this.html5QrCode.clear();
      } catch (e) {
        console.warn('QR Scanner Stop Notice:', e);
      }
      this.isScanning = false;
    }
  }

  /* 2. Real Camera Stream for Facial Liveness & Snapshot Capture */
  async startCameraStream(videoElement) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access is not supported by your browser.');
    }

    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      if (videoElement) {
        videoElement.srcObject = this.videoStream;
        await videoElement.play();
      }
      return true;
    } catch (err) {
      console.error('Camera Stream Access Error:', err);
      throw new Error(err.name === 'NotAllowedError' ? 'Camera permission was denied. Please allow camera access.' : err.message);
    }
  }

  stopCameraStream() {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
  }

  captureSnapshot(videoElement, canvasElement) {
    if (!videoElement || !canvasElement) return null;
    const context = canvasElement.getContext('2d');
    canvasElement.width = videoElement.videoWidth || 320;
    canvasElement.height = videoElement.videoHeight || 240;
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    return canvasElement.toDataURL('image/jpeg', 0.8);
  }

  /* Real Frame-Difference Facial Motion / Liveness Check */
  async verifyLiveness(videoElement, canvasElement) {
    if (!videoElement || !canvasElement || !this.videoStream) {
      return { passed: false, snapshot: null, reason: 'Camera stream unavailable' };
    }

    try {
      const ctx = canvasElement.getContext('2d');
      const w = 160;
      const h = 120;
      canvasElement.width = w;
      canvasElement.height = h;

      // Frame 1
      ctx.drawImage(videoElement, 0, 0, w, h);
      const frame1 = ctx.getImageData(0, 0, w, h);

      // Wait 350ms to capture natural micro-motion/blinking
      await new Promise(resolve => setTimeout(resolve, 350));

      // Frame 2
      ctx.drawImage(videoElement, 0, 0, w, h);
      const frame2 = ctx.getImageData(0, 0, w, h);
      const snapshot = canvasElement.toDataURL('image/jpeg', 0.8);

      // Optical difference algorithm
      let diff = 0;
      let totalLum = 0;
      const totalPixels = w * h;
      for (let i = 0; i < frame1.data.length; i += 4) {
        const lum1 = 0.299 * frame1.data[i] + 0.587 * frame1.data[i+1] + 0.114 * frame1.data[i+2];
        const lum2 = 0.299 * frame2.data[i] + 0.587 * frame2.data[i+1] + 0.114 * frame2.data[i+2];
        diff += Math.abs(lum1 - lum2);
        totalLum += lum2;
      }

      const avgDiff = diff / totalPixels;
      const avgLum = totalLum / totalPixels;

      // Live human presence requires detectable micro-motion (avgDiff > 0.8) and non-dark exposure (avgLum > 15)
      const passed = avgDiff > 0.8 && avgLum > 15;
      return {
        passed,
        snapshot,
        motionDelta: avgDiff,
        luminosity: avgLum
      };
    } catch (err) {
      console.warn('Liveness verification exception:', err);
      const snap = this.captureSnapshot(videoElement, canvasElement);
      return { passed: false, snapshot: snap, reason: err.message };
    }
  }

  /* 3. Real High-Accuracy GPS Geolocation */
  async getGpsCoordinates() {
    if (!navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentCoordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          resolve(this.currentCoordinates);
        },
        (error) => {
          let msg = 'Failed to acquire GPS location.';
          if (error.code === error.PERMISSION_DENIED) msg = 'Location permission was denied. Please enable GPS location services.';
          else if (error.code === error.POSITION_UNAVAILABLE) msg = 'Location information is unavailable.';
          else if (error.code === error.TIMEOUT) msg = 'Location acquisition timed out.';
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }

  /* 4. Server-Side Geofence Validation (RPC) & Attendance Log Submission */
  async verifyAndSubmitAttendance(memberId, officeId, coordinates, options = {}) {
    if (!window.godspeedSupabase) {
      return { success: false, message: 'Supabase client is not connected.' };
    }

    const { qrVerified = false, faceVerified = false, livenessPassed = false } = options;

    try {
      // Step A: Call Server-Side validate_geofence RPC
      const { data: isInsideGeofence, error: geoError } = await window.godspeedSupabase.rpc('validate_geofence', {
        p_office_id: officeId,
        p_lat: coordinates.latitude,
        p_lng: coordinates.longitude
      });

      if (geoError) {
        console.warn('Geofence RPC error, checking office coordinates locally:', geoError);
      }

      // Step B: Calculate distance
      const store = window.godspeedStore;
      const office = store.offices.find(o => o.id === officeId) || store.offices[0];
      const officeLat = office ? office.latitude : 7.2571;
      const officeLng = office ? office.longitude : 5.2058;

      const R = 6371e3;
      const φ1 = officeLat * Math.PI / 180;
      const φ2 = coordinates.latitude * Math.PI / 180;
      const Δφ = (coordinates.latitude - officeLat) * Math.PI / 180;
      const Δλ = (coordinates.longitude - officeLng) * Math.PI / 180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distanceMeters = Math.round(R * c * 10) / 10;
      const allowedRadius = office ? (office.radiusMeters || 30) : 30;

      const isCompliant = (isInsideGeofence === true) || (distanceMeters <= allowedRadius);
      const status = isCompliant ? 'success' : 'flagged';

      // Step C: Insert into attendance_logs (Server trigger trg_check_attendance_duplicate enforces 24h rule)
      const { data, error } = await window.godspeedSupabase
        .from('attendance_logs')
        .insert({
          member_id: memberId,
          office_id: officeId,
          device_latitude: coordinates.latitude,
          device_longitude: coordinates.longitude,
          distance_from_office_meters: distanceMeters,
          qr_verified: qrVerified,
          face_verified: faceVerified,
          liveness_passed: livenessPassed,
          status: status
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase Attendance Insert Error:', error);
        return { success: false, message: error.message };
      }

      await store.loadAllAppData();
      return {
        success: true,
        log: store.normalizeAttendance(data),
        distanceMeters,
        status,
        message: status === 'success'
          ? `Attendance verified and recorded! (${distanceMeters}m from office)`
          : `Attendance logged with warning: Location is ${distanceMeters}m from office (geofence radius: ${allowedRadius}m).`
      };
    } catch (err) {
      console.error('Attendance Submission Exception:', err);
      return { success: false, message: err.message || 'Failed to submit attendance.' };
    }
  }

  /* 5. Audited Manual Attendance Override (PRD §12.5) */
  async manualAttendanceOverride(memberId, officeId, reason) {
    if (!window.godspeedSupabase) {
      return { success: false, message: 'Supabase client is not connected.' };
    }

    if (!reason || !reason.trim()) {
      return { success: false, message: 'Audit reason is required for manual attendance override.' };
    }

    const store = window.godspeedStore;
    const actorId = store.currentUserId;
    const office = store.offices.find(o => o.id === officeId) || store.offices[0];

    try {
      const { data, error } = await window.godspeedSupabase
        .from('attendance_logs')
        .insert({
          member_id: memberId,
          office_id: officeId,
          device_latitude: office ? office.latitude : 7.2571,
          device_longitude: office ? office.longitude : 5.2058,
          distance_from_office_meters: 0.0,
          qr_verified: false,
          face_verified: false,
          liveness_passed: false,
          status: 'manual_override',
          override_reason: reason.trim(),
          override_by: actorId
        })
        .select()
        .single();

      if (error) {
        return { success: false, message: error.message };
      }

      await store.loadAllAppData();
      return {
        success: true,
        log: store.normalizeAttendance(data),
        message: 'Audited manual attendance override successfully recorded.'
      };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to record manual override.' };
    }
  }
}

window.attendanceEngine = new AttendanceVerificationEngine();
