const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 3 });

const auth = getAuth();
const db = getFirestore();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.inviteDoctor = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in with the clinic administrator account.');
  }

  if (request.auth.token.admin !== true || request.auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Only a verified clinic administrator can invite doctors.');
  }

  const email = typeof request.data?.email === 'string'
    ? request.data.email.trim().toLowerCase()
    : '';
  const displayName = typeof request.data?.displayName === 'string'
    ? request.data.displayName.trim()
    : '';

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new HttpsError('invalid-argument', 'Enter a valid doctor email address.');
  }
  if (displayName.length < 2 || displayName.length > 80) {
    throw new HttpsError('invalid-argument', 'Doctor name must be between 2 and 80 characters.');
  }

  let doctor;
  try {
    doctor = await auth.createUser({
      email,
      displayName,
      emailVerified: false,
      disabled: false,
    });

    await auth.setCustomUserClaims(doctor.uid, { doctor: true });
    await db.collection('profiles').doc(doctor.uid).set({
      uid: doctor.uid,
      email,
      displayName,
      role: 'doctor',
      createdAt: FieldValue.serverTimestamp(),
    });

    // The administrator shares this password-setup link privately with the invited doctor.
    const inviteLink = await auth.generatePasswordResetLink(email);
    return { email, displayName, inviteLink };
  } catch (error) {
    if (doctor) {
      await db.collection('profiles').doc(doctor.uid).delete().catch(() => {});
      await auth.deleteUser(doctor.uid).catch(() => {});
    }

    if (error?.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'An account already exists for that email.');
    }
    if (error instanceof HttpsError) {
      throw error;
    }

    // Do not return internal details or log personally identifying information.
    throw new HttpsError('internal', 'Could not create the doctor invitation. Please try again.');
  }
});
