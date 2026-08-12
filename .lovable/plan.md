# Plan: Fix PIX Payment Status Sync

Diagnosed that the front-end is stuck at "pending" even after payment. This indicates the `asaas-webhook` is failing to update the `bookings` table or the polling logic is not seeing the update.

## Steps

1. **Improve Webhook Robustness**: Update `asaas-webhook` to log the exact `bookingId` resolution path and ensure it updates both `bookings` and `booking_payments` tables by `asaas_id` if `booking_id` lookup fails.
2. **Optimize Polling**: Update `BookingPaymentDialog.tsx` to poll not only the `bookings` table but also the `booking_payments` table as a fallback to ensure we catch the payment confirmation.
3. **Database Migration**: Add a trigger to auto-update `bookings.payment_status` whenever `booking_payments.status` changes to 'paid', providing a server-side "safety net".

## Technical Details

- **Webhook**: Use `asaasPaymentId` to find `booking_id` in `booking_payments` if `externalReference` is missing or invalid.
- **Polling**: Use `supabase.from('booking_payments').select('status').eq('asaas_id', payment.id)` in the dialog.
- **Database**: `CREATE OR REPLACE FUNCTION sync_booking_payment_status()`... `CREATE TRIGGER trg_sync_booking_payment_status AFTER UPDATE ON booking_payments`.

## User-facing changes

- PIX payments will now automatically confirm and redirect much more reliably.
