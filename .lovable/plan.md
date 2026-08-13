# Plan - Fix Schema Cache and Column Naming for Payment Sync

The user is experiencing a 400 Bad Request error when polling for payment status because the `asaas_id` column is reported as non-existent by the database, despite previous migrations attempting to use it. This indicates a potential mismatch between the actual database schema and the schema cache used by PostgREST/Supabase, or a missing column.

## Proposed Changes

### 1. Database Schema Fix
- Create a new migration `2098_ensure_payment_columns.sql` to:
    - Explicitly check for the existence of `asaas_id` in `booking_payments`.
    - If it doesn't exist, create it (or rename if a legacy name exists).
    - If it exists, ensure it has the correct type (`TEXT`).
    - **CRITICAL**: Run `NOTIFY pgrst, 'reload schema';` to force PostgREST to refresh its cache. This is the most likely reason for "column does not exist" errors when the column is actually there.

### 2. Edge Function Robustness
- Update `booking-create-payment` Edge Function:
    - Improve the `INSERT` into `booking_payments` to be more defensive.
    - Log the exact schema being used if possible.

### 3. Frontend Polling Improvements
- Update `BookingPaymentDialog.tsx`:
    - Add a fallback mechanism in the polling logic. If fetching from `booking_payments` fails with a 400 (cache/schema error), rely solely on the `bookings` table status which seems more stable.

## Technical Details
- The error `Could not find the 'asaas_id' column of 'booking_payments' in the schema cache` is a classic PostgREST cache issue.
- The SQL `NOTIFY pgrst, 'reload schema';` will be added to the migration.

## User Review Required
> [!IMPORTANT]
> I will need to apply a new migration (2098) to force the database to refresh its cache. Please confirm if you want me to proceed with this structural fix.
