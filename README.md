# City Sugar Clinic — Tumkur

A responsive clinic website published on GitHub Pages, with an optional Firebase-backed patient portal for citizen sign-up, appointment requests, and administrator-issued doctor accounts.

## Security and data storage

GitHub Pages is static hosting, and this repository is public. **Do not store passwords, patient records, appointment data, service-account keys, or other private user data in GitHub or commit history.** Passwords are managed by Firebase Authentication; the portal stores only basic profile/contact details and appointment scheduling requests in Cloud Firestore, protected by `firestore.rules`.

The portal deliberately does not collect medical records or urgent symptoms. The Firebase web-app configuration in `firebase-config.js` is a public client configuration, not a secret. Never put a Firebase service-account JSON file or admin password in the repository.

## One-time Firebase setup

The portal is disabled until a clinic-owned Firebase project is configured. These steps require an administrator for that project:

1. Create a Firebase project and a Web app. Choose the Firestore database region carefully; `asia-south1` (Mumbai) is used for the doctor-invitation function and is a nearby option for Tumkur.
2. In **Authentication → Sign-in method**, enable **Email/Password**. Add `modernnavi-star.github.io` to **Authorized domains** (add `localhost` too if testing locally) and configure the email verification template.
3. Create a Cloud Firestore database. Copy the Web app's `apiKey`, `authDomain`, `projectId`, and `appId` into `firebase-config.js`. These are browser-visible values; database security comes from Authentication and Firestore rules, not from hiding this config.
4. Install the Firebase CLI, sign in, select the project, and install the function dependencies:

   ```sh
   npm install --global firebase-tools
   firebase login
   firebase use --add
   npm --prefix functions install
   ```

5. Deploy the Firestore rules, index, and doctor-invitation function:

   ```sh
   firebase deploy --only firestore:rules,firestore:indexes,functions
   ```

   The invitation function runs in `asia-south1`. Deploying Cloud Functions may require a Firebase Blaze billing account; check current Firebase pricing and enablement requirements before deploying.
6. Create the first administrator privately in **Firebase Console → Authentication** using the clinic administrator's email and a strong password, then verify that email. Assign the administrator role using a local Google application credential or service-account file stored **outside this repository**:

   ```sh
   export FIREBASE_PROJECT_ID="your-firebase-project-id"
   export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/admin-service-account.json"
   node functions/scripts/promote-admin.js admin@example.com
   ```

   The account must already exist in Firebase Authentication. The script never asks for or stores its password. Sign out and back in after promotion so Firebase refreshes the administrator claim.

## Portal behaviour

- Citizens sign up with email and password, verify their email, and can submit/view/cancel their own appointment requests.
- Doctors cannot self-register. A verified administrator invites them from the portal. The function creates a doctor account and returns a password-setup link for the administrator to share privately.
- Verified doctors and administrators can view the appointment queue and update request status. Firestore rules enforce ownership and role checks; hiding buttons in the browser is not the security boundary.
- Appointment requests contain name, email, contact phone, preferred date/time, and status only. Do not use this portal for diagnoses, test results, prescriptions, or emergency care.

## GitHub Pages deployment

`.github/workflows/deploy-pages.yml` deploys the public frontend files (`index.html`, `portal.js`, and `firebase-config.js`) when `main` is updated. Backend source, rules, and local credentials are not included in the Pages artifact. After Firebase is configured, merge the updated web configuration to `main`; the site is available at:

<https://modernnavi-star.github.io/Citysugarclinictumkur/>

## Preview locally

From the repository root, run:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Add `localhost` to Firebase Authentication's authorized domains for local sign-in tests.
