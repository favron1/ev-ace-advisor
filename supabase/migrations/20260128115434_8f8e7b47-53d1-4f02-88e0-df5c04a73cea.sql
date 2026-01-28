-- Add phone_number column to profiles table for SMS alerts
ALTER TABLE profiles 
ADD COLUMN phone_number text DEFAULT NULL;

COMMENT ON COLUMN profiles.phone_number IS 
  'User phone number in E.164 format for SMS alerts';