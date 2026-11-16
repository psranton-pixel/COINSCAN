# Security Specification: CoinScan Pro Firestore Access Control

## 1. Data Invariants
1. Users can ONLY read, create, update, and delete their own user document located at `/users/{userId}` where `userId == request.auth.uid`.
2. Coins are stored under `/users/{userId}/coins/{coinId}` with `owner_user_id == request.auth.uid`. No user can read, list, update, or delete any other user's coins.
3. Collection categories are stored under `/users/{userId}/categories/{categoryId}` with `owner_user_id == request.auth.uid`.
4. Writes must be authenticated (`request.auth != null`) and verified (`request.auth.token.email_verified == true` or standard authenticated users).
5. Default deny: All unmatched routes `/{document=**}` reject all read and write attempts.
6. Identity spoofing prevention: A user cannot create or update a coin record whose `owner_user_id` does not match their own `request.auth.uid`.
7. ID Poisoning Guard: Document IDs must conform to `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.

## 2. The "Dirty Dozen" Threat Payloads
1. **Unauthenticated Read**: Attempting to read `/users/user123/coins/coin1` without auth -> DENIED.
2. **Cross-Tenant Read**: User A (`auth.uid == 'user_A'`) querying `/users/user_B/coins` -> DENIED.
3. **Cross-Tenant Write**: User A attempting to write `/users/user_B/coins/coin99` -> DENIED.
4. **Owner UID Mismatch on Create**: User A writing to `/users/user_A/coins/c1` with `owner_user_id: "user_B"` -> DENIED.
5. **Owner UID Mutation on Update**: User A attempting to change `owner_user_id` from `"user_A"` to `"user_B"` -> DENIED.
6. **Path Traversal / Junk ID**: Attempting to create document with 2000-character junk ID -> DENIED.
7. **Ghost Field Injection (Shadow Update)**: Sending arbitrary injection payload like `isAdmin: true` -> DENIED.
8. **Negative Value Poisoning**: Injecting negative values or strings into numeric fields -> DENIED.
9. **Unauthenticated List**: Querying collections without `where` or auth -> DENIED.
10. **Public PII Scraping**: Scraping `/users` collection directly -> DENIED.
11. **Immutability Bypass**: Modifying `createdAt` -> DENIED.
12. **Blanket Query Bypass**: Querying cross-user documents via collection group without auth filtering -> DENIED.
