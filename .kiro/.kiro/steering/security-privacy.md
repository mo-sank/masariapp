---
inclusion: always
---
# Security and Privacy Rules (users are teens)
 
## Age and consent
- Minimum age 13. The age gate (birth month + year) runs before Auth0 login. Under 13: block, store nothing, show a friendly message, set a device-local flag.
- create_profile re-validates age server-side from month + year and stores ONLY birth_year and age_band. Never store the full date of birth.
- Users must accept the current Terms and Privacy Policy versions (stored in consents).
- Legal review of the privacy policy and teen-consent approach is required before public launch.
 
## Data minimization
- Collect: email (via Auth0), generated username, birth year, age band, timezone, app activity. Nothing else.
- NO real names, photos, free-text profile fields, location, contacts, or chat.
- Usernames are generated adjective-animal-number handles chosen from word lists; users cannot type free text.
- Free text exists only in trade rationale (<= 280 chars) and reflection notes (<= 280 chars) and feedback. It is private to the user, never shown to others in the MVP.
- No advertising, no third-party analytics, no data sale, no tracking SDKs.
 
## Access control
- RLS enabled on every public table. Default deny. Users can only SELECT their own rows.
- Clients cannot INSERT/UPDATE/DELETE directly on any table. All writes go through SECURITY DEFINER RPCs that derive the user from the JWT and ignore any user id sent by the client.
- Every SECURITY DEFINER function sets search_path = public, validates inputs, and is granted EXECUTE to authenticated only.
- The anon role has no table access.
- Service-role key and provider/Auth0 management secrets live only in Edge Function secrets.
 
## Auth0 rules
- Email verification required. Short-lived access tokens, refresh tokens with rotation.
- The role = "authenticated" claim is added by an Auth0 Action. Verify it by decoding the token the app actually sends.
- Account deletion removes the user from Auth0 (Management API) and deletes all their rows in Supabase (cascade from profiles).
 
## Logging
- Sentry: sendDefaultPii = false; strip emails, tokens, and user ids from breadcrumbs.
- Never log tokens, emails, or rationale text.
 
## Content and compliance
- Show "Paper money, educational only, not financial advice" wherever prices or trades appear. Quotes are labeled delayed.
- Never recommend specific securities. The instrument universe excludes penny stocks, meme stocks, leveraged/inverse products, and crypto-related products. Team decides on tobacco, cannabis, and gambling names.
- App Store / Google Play: in-app account deletion, privacy policy URL, accurate age-rating and data-safety answers. Offering Google login requires also offering Sign in with Apple on iOS (verify current guidelines).
