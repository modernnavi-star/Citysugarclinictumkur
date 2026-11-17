import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-functions.js';
import { firebaseConfig } from './firebase-config.js';

const $ = (id) => document.getElementById(id);
let auth;
let db;
let functions;
let activeUser = null;

function setStatus(message, kind = 'info') {
  const status = $('portalStatus');
  status.textContent = message;
  status.dataset.kind = kind;
}

function setAuthView(view) {
  const signingUp = view === 'signup';
  $('signInForm').hidden = signingUp;
  $('signUpForm').hidden = !signingUp;
  $('authHint').textContent = signingUp
    ? 'Create a citizen account using your email. Doctor accounts are issued by the clinic administrator.'
    : 'Sign in with the email address and password for your clinic account.';
  document.querySelectorAll('[data-auth-view]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.authView === view));
  });
  setStatus('');
}

document.querySelectorAll('[data-auth-view]').forEach((button) => {
  button.addEventListener('click', () => setAuthView(button.dataset.authView));
});

function updateDateMinimum() {
  const dateInput = $('appointmentDate');
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  dateInput.min = localDate.toISOString().slice(0, 10);
}

updateDateMinimum();
$('appointmentDate').addEventListener('input', (event) => {
  const value = event.currentTarget.value;
  const isSunday = value && new Date(`${value}T12:00:00`).getDay() === 0;
  event.currentTarget.setCustomValidity(isSunday ? 'The clinic is closed on Sundays. Please choose another date.' : '');
});

const requiredConfig = ['apiKey', 'authDomain', 'projectId', 'appId'];
const configIsReady = requiredConfig.every((key) => {
  const value = firebaseConfig[key];
  return typeof value === 'string' && value.length > 0 && !value.startsWith('REPLACE_');
});

if (!configIsReady) {
  $('setupNotice').hidden = false;
  document.querySelectorAll('#authPanel button:not([data-auth-view]), #dashboardPanel button[type="submit"]').forEach((button) => {
    button.disabled = true;
  });
} else {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, 'asia-south1');
    startPortal();
  } catch {
    $('setupNotice').hidden = false;
    setStatus('The portal could not connect to Firebase. Please contact the clinic administrator.', 'error');
  }
}

function errorMessage(error) {
  const code = error?.code || '';
  if (code === 'auth/email-already-in-use') return 'An account already exists for this email. Try signing in or resetting your password.';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'The email or password did not match.';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/weak-password') return 'Choose a stronger password (at least 8 characters).';
  if (code === 'auth/email-not-verified') return 'Verify your email before submitting an appointment request.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a while and try again.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
  if (code === 'password/mismatch') return 'The passwords do not match.';
  if (code === 'input/invalid-phone') return 'Enter a valid phone number.';
  if (code === 'input/sunday') return 'The clinic is closed on Sundays. Please choose another date.';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'This account is not allowed to perform that action.';
  if (code === 'functions/permission-denied') return 'Only a verified clinic administrator can invite doctors.';
  if (code === 'functions/already-exists') return 'An account already exists for that doctor email.';
  if (code === 'functions/unauthenticated') return 'Please sign in as an administrator and try again.';
  if (code === 'functions/failed-precondition') return 'The invitation service is not ready. Please contact the administrator.';
  return 'Something went wrong. Please try again or contact the clinic.';
}

async function withBusy(button, task) {
  if (!button) return;
  button.disabled = true;
  try {
    await task();
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  } finally {
    button.disabled = false;
  }
}

function startPortal() {
  $('signInForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    withBusy(button, async () => {
      const email = $('signInEmail').value.trim().toLowerCase();
      await signInWithEmailAndPassword(auth, email, $('signInPassword').value);
      $('signInForm').reset();
      setStatus('Signed in successfully.', 'success');
    });
  });

  $('signUpForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    withBusy(button, async () => {
      const displayName = $('signUpName').value.trim();
      const email = $('signUpEmail').value.trim().toLowerCase();
      const phone = $('signUpPhone').value.trim();
      const password = $('signUpPassword').value;
      if (password !== $('confirmPassword').value) {
        throw { code: 'password/mismatch' };
      }
      if (!/^[0-9+() .-]{7,20}$/.test(phone)) {
        throw { code: 'input/invalid-phone' };
      }

      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName });
      try {
        await setDoc(doc(db, 'profiles', credential.user.uid), {
          uid: credential.user.uid,
          email: credential.user.email,
          displayName,
          phone,
          role: 'citizen',
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        // Avoid leaving an account without its required citizen profile if setup fails.
        const { deleteUser } = await import('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js');
        await deleteUser(credential.user).catch(() => {});
        throw error;
      }
      await sendEmailVerification(credential.user);
      form.reset();
      setStatus('Account created. Check your email to verify it before requesting an appointment.', 'success');
    });
  });

  $('resetPassword').addEventListener('click', () => {
    const email = $('signInEmail').value.trim().toLowerCase();
    if (!email) {
      setStatus('Enter your email address first, then choose Forgot password.', 'error');
      $('signInEmail').focus();
      return;
    }
    withBusy($('resetPassword'), async () => {
      await sendPasswordResetEmail(auth, email);
      setStatus('If an account exists for that email, a password reset message will be sent.', 'success');
    });
  });

  $('signOutButton').addEventListener('click', () => {
    withBusy($('signOutButton'), async () => {
      await signOut(auth);
      setStatus('You are signed out.', 'success');
    });
  });

  $('resendVerification').addEventListener('click', () => {
    withBusy($('resendVerification'), async () => {
      if (!activeUser) return;
      await sendEmailVerification(activeUser);
      setStatus('Verification email sent. Check your inbox and spam folder.', 'success');
    });
  });

  $('refreshVerification').addEventListener('click', () => {
    withBusy($('refreshVerification'), async () => {
      if (!activeUser) return;
      await activeUser.reload();
      await activeUser.getIdToken(true);
      activeUser = auth.currentUser;
      await renderAccount(activeUser);
      if (activeUser?.emailVerified) setStatus('Email verified. Your portal access is updated.', 'success');
    });
  });

  $('appointmentForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    withBusy(button, async () => {
      if (!activeUser || !activeUser.emailVerified) {
        throw { code: 'auth/email-not-verified' };
      }
      const preferredDate = $('appointmentDate').value;
      const preferredTime = $('appointmentTime').value;
      const phone = $('appointmentPhone').value.trim();
      const preferredDay = preferredDate ? new Date(`${preferredDate}T12:00:00`).getDay() : -1;
      if (preferredDay === 0) {
        throw { code: 'input/sunday' };
      }
      if (!/^[0-9+() .-]{7,20}$/.test(phone)) {
        throw { code: 'input/invalid-phone' };
      }

      await addDoc(collection(db, 'appointments'), {
        citizenUid: activeUser.uid,
        citizenName: (activeUser.displayName || '').trim(),
        citizenEmail: activeUser.email,
        phone,
        preferredDate,
        preferredTime,
        status: 'requested',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      form.reset();
      updateDateMinimum();
      $('appointmentPhone').value = phone;
      setStatus('Your appointment request was sent to the clinic.', 'success');
      await loadAppointments(false);
    });
  });

  $('inviteDoctorForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    withBusy(button, async () => {
      const email = $('doctorEmail').value.trim().toLowerCase();
      const displayName = $('doctorName').value.trim();
      const inviteDoctor = httpsCallable(functions, 'inviteDoctor');
      const result = await inviteDoctor({ email, displayName });
      const inviteLink = result.data?.inviteLink;
      if (typeof inviteLink !== 'string' || !inviteLink.startsWith('https://')) {
        throw { code: 'functions/failed-precondition' };
      }
      $('inviteMessage').textContent = `Invitation created for ${result.data.email}. Send this password setup link privately.`;
      $('inviteLink').href = inviteLink;
      $('inviteResult').hidden = false;
      form.reset();
      setStatus('Doctor account created. Copy the setup link and send it privately.', 'success');
    });
  });

  $('copyInviteLink').addEventListener('click', () => {
    const link = $('inviteLink').href;
    withBusy($('copyInviteLink'), async () => {
      await navigator.clipboard.writeText(link);
      setStatus('Invitation link copied. Send it only to the invited doctor.', 'success');
    });
  });

  onAuthStateChanged(auth, async (user) => {
    activeUser = user;
    $('portalStatus').textContent = '';
    if (!user) {
      $('authPanel').hidden = false;
      $('dashboardPanel').hidden = true;
      $('verificationNotice').hidden = true;
      $('citizenPanel').hidden = true;
      $('staffPanel').hidden = true;
      $('adminPanel').hidden = true;
      return;
    }
    try {
      await renderAccount(user);
    } catch (error) {
      setStatus(errorMessage(error), 'error');
    }
  });
}

async function renderAccount(user) {
  if (!user) return;
  $('authPanel').hidden = true;
  $('dashboardPanel').hidden = false;
  $('userIdentity').textContent = `${user.displayName || user.email} · ${user.email}`;

  const tokenResult = await user.getIdTokenResult();
  const isAdmin = tokenResult.claims.admin === true;
  const isDoctor = tokenResult.claims.doctor === true;
  const isStaff = (isAdmin || isDoctor) && user.emailVerified && tokenResult.claims.email_verified === true;
  const isCitizen = !isAdmin && !isDoctor;

  $('verificationNotice').hidden = user.emailVerified;
  $('citizenPanel').hidden = !isCitizen;
  $('staffPanel').hidden = !isStaff;
  $('adminPanel').hidden = !isAdmin || !isStaff;

  try {
    const profileSnapshot = await getDoc(doc(db, 'profiles', user.uid));
    if (profileSnapshot.exists()) {
      const profile = profileSnapshot.data();
      if (isCitizen && profile.phone) $('appointmentPhone').value = profile.phone;
    }
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  }

  if (isCitizen) await loadAppointments(false);
  if (isStaff) await loadAppointments(true);
}

async function loadAppointments(forStaff) {
  const user = auth?.currentUser;
  if (!user) return;
  const container = $(forStaff ? 'staffAppointments' : 'ownAppointments');
  container.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'appointment-empty';
  loading.textContent = 'Loading appointment requests…';
  container.append(loading);

  try {
    const appointments = collection(db, 'appointments');
    const appointmentQuery = forStaff
      ? query(appointments, orderBy('createdAt', 'desc'), limit(50))
      : query(appointments, where('citizenUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(25));
    const snapshot = await getDocs(appointmentQuery);
    container.replaceChildren();
    if (snapshot.empty) {
      const empty = document.createElement('p');
      empty.className = 'appointment-empty';
      empty.textContent = forStaff ? 'There are no appointment requests yet.' : 'You have not sent an appointment request yet.';
      container.append(empty);
      return;
    }
    snapshot.forEach((appointment) => container.append(createAppointmentCard(appointment.id, appointment.data(), forStaff)));
  } catch (error) {
    container.replaceChildren();
    const failure = document.createElement('p');
    failure.className = 'appointment-empty';
    failure.textContent = 'Could not load appointments. Please try again later.';
    container.append(failure);
    setStatus(errorMessage(error), 'error');
  }
}

function createAppointmentCard(id, appointment, forStaff) {
  const card = document.createElement('article');
  card.className = 'appointment-item';
  const heading = document.createElement('strong');
  heading.textContent = `${appointment.preferredDate} · ${appointment.preferredTime}`;
  const statusLine = document.createElement('div');
  statusLine.className = 'appointment-meta';
  const pill = document.createElement('span');
  pill.className = 'status-pill';
  pill.textContent = appointment.status || 'requested';
  statusLine.append(pill);
  card.append(heading, statusLine);

  if (forStaff) {
    const contact = document.createElement('p');
    contact.textContent = `${appointment.citizenName} · ${appointment.citizenEmail} · ${appointment.phone}`;
    card.append(contact);
    const actions = document.createElement('div');
    actions.className = 'appointment-actions';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Appointment status');
    ['requested', 'confirmed', 'completed', 'cancelled'].forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status[0].toUpperCase() + status.slice(1);
      option.selected = status === appointment.status;
      select.append(option);
    });
    const updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.className = 'btn secondary';
    updateButton.textContent = 'Update status';
    updateButton.addEventListener('click', () => {
      withBusy(updateButton, async () => {
        await updateDoc(doc(db, 'appointments', id), {
          status: select.value,
          updatedAt: serverTimestamp(),
        });
        setStatus('Appointment status updated.', 'success');
        await loadAppointments(true);
      });
    });
    actions.append(select, updateButton);
    card.append(actions);
  } else if (appointment.status === 'requested') {
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'portal-link';
    cancelButton.textContent = 'Cancel request';
    cancelButton.addEventListener('click', () => {
      withBusy(cancelButton, async () => {
        await updateDoc(doc(db, 'appointments', id), {
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        });
        setStatus('Appointment request cancelled.', 'success');
        await loadAppointments(false);
      });
    });
    card.append(cancelButton);
  }

  return card;
}
