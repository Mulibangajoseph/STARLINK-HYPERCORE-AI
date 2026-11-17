// Paste your Firebase WEB app config here (Firebase console > Project settings > Your apps > Web app).
// These values are safe to publish: they identify your project, they do not grant access.
// Access is controlled by firestore.rules and storage.rules. NEVER paste service-account or admin keys here.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};

export const configured = !!firebaseConfig.apiKey && !/^YOUR_/.test(firebaseConfig.apiKey);
