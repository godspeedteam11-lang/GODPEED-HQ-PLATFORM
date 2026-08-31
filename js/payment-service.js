/**
 * LegacyOS - Production Payment Service (Paystack Integration & Subscription Billing)
 * Security Enforced: Handles secure public key initialization, client transaction creation,
 * and server-side RPC webhook verification.
 */

class PaymentService {
  constructor() {
    this.PAYSTACK_PUBLIC_KEY = window.LEGACYOS_PAYSTACK_PUBLIC_KEY || 'pk_live_legacyos_placeholder';
    this.PLANS = {
      starter_monthly: {
        id: 'starter_monthly',
        name: 'Starter Plan (Monthly)',
        amount: 7500,
        amountKobo: 750000,
        billingCycle: 'monthly',
        memberLimit: 49,
        description: 'Up to 49 office members'
      },
      growth_monthly: {
        id: 'growth_monthly',
        name: 'Growth Plan (Monthly)',
        amount: 18000,
        amountKobo: 1800000,
        billingCycle: 'monthly',
        memberLimit: 999999,
        description: 'Unlimited office members'
      },
      starter_annual: {
        id: 'starter_annual',
        name: 'Starter Plan (Annual)',
        amount: 75000,
        amountKobo: 7500000,
        billingCycle: 'annual',
        memberLimit: 49,
        description: 'Up to 49 office members (2 months free)'
      },
      growth_annual: {
        id: 'growth_annual',
        name: 'Growth Plan (Annual)',
        amount: 180000,
        amountKobo: 18000000,
        billingCycle: 'annual',
        memberLimit: 999999,
        description: 'Unlimited office members (2 months free)'
      }
    };
  }

  getPlan(planId) {
    return this.PLANS[planId] || this.PLANS.starter_monthly;
  }

  /* Initialize and open Paystack popup for subscription payment */
  async initiateSubscriptionPayment(officeId, planId, userEmail, userName, onSuccess, onCancel) {
    const plan = this.getPlan(planId);
    const reference = 'LEG-TX-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

    if (!window.godspeedSupabase) {
      alert('Payment Error: Database connection is offline.');
      return { success: false, message: 'Database offline' };
    }

    try {
      // 1. Record pending transaction in Supabase
      const { error: txErr } = await window.godspeedSupabase
        .from('payment_transactions')
        .insert({
          office_id: officeId,
          payer_id: window.godspeedStore?.currentUserId || null,
          provider: 'paystack',
          reference: reference,
          amount: plan.amount,
          currency: 'NGN',
          plan_id: plan.id,
          status: 'pending'
        });

      if (txErr) {
        console.warn('Payment transaction record warning:', txErr.message);
      }

      // 2. Check if Paystack library is available
      if (typeof PaystackPop === 'undefined') {
        // Dynamically load Paystack script if missing
        await this.loadPaystackScript();
      }

      if (typeof PaystackPop !== 'undefined') {
        const handler = PaystackPop.setup({
          key: this.PAYSTACK_PUBLIC_KEY,
          email: userEmail,
          amount: plan.amountKobo,
          currency: 'NGN',
          ref: reference,
          metadata: {
            custom_fields: [
              { display_name: 'Office ID', variable_name: 'office_id', value: officeId },
              { display_name: 'Plan ID', variable_name: 'plan_id', value: plan.id },
              { display_name: 'Payer Name', variable_name: 'payer_name', value: userName }
            ]
          },
          callback: async (response) => {
            // Verify payment server-side via RPC
            const { data: verifyData, error: verifyErr } = await window.godspeedSupabase.rpc('handle_paystack_webhook', {
              p_reference: response.reference,
              p_event: 'charge.success',
              p_payload: response
            });

            if (verifyErr) {
              console.error('Server verification error:', verifyErr);
              alert('Payment received! Status update is processing.');
            } else {
              await window.godspeedStore?.loadAllAppData();
            }

            if (onSuccess) onSuccess(response);
          },
          onClose: () => {
            if (onCancel) onCancel();
          }
        });

        handler.openIframe();
        return { success: true, reference };
      } else {
        alert('Paystack Gateway is unavailable. Please check your internet connection and try again.');
        if (onCancel) onCancel();
        return { success: false, message: 'Paystack library could not be loaded' };
      }
    } catch (err) {
      console.error('Payment initiation exception:', err);
      alert('Failed to launch Paystack gateway: ' + err.message);
      return { success: false, message: err.message };
    }
  }

  loadPaystackScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Paystack Inline JS'));
      document.head.appendChild(script);
    });
  }
}

window.PaymentService = PaymentService;
if (!window.legacyPaymentService) {
  window.legacyPaymentService = new PaymentService();
}
