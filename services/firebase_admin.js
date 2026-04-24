const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let initialized = false;

const initFirebaseAdmin = () => {
  if (initialized || admin.apps.length) {
    initialized = true;
    return;
  }

  const keyPath = process.env.FIREBASE_ADMIN_KEY;
  if (!keyPath) {
    return;
  }

  const resolvedPath = path.resolve(keyPath);
  if (!fs.existsSync(resolvedPath)) {
    return;
  }

  const serviceAccount = require(resolvedPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
};

const getMessaging = () => {
  initFirebaseAdmin();
  if (!initialized) {
    return null;
  }
  return admin.messaging();
};

module.exports = { getMessaging };
