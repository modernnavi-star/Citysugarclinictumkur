const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const email = process.argv[2]?.trim().toLowerCase();
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

if (!email || !projectId) {
  console.error('Usage: FIREBASE_PROJECT_ID=<project-id> node scripts/promote-admin.js <admin-email>');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId,
});

async function promoteAdmin() {
  const auth = getAuth();
  const db = getFirestore();
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims || {}) };
  delete claims.doctor;
  claims.admin = true;

  await auth.setCustomUserClaims(user.uid, claims);
  await db.collection('profiles').doc(user.uid).set({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || 'Clinic administrator',
    role: 'admin',
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('Admin role assigned. The administrator must sign out and back in to refresh their role.');
}

promoteAdmin().catch((error) => {
  console.error(`Could not promote admin: ${error.code || error.message}`);
  process.exitCode = 1;
});
