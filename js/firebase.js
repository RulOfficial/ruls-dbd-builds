import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { initializeFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

export const app = initializeApp({
  apiKey: "AIzaSyCY6Rx1W8OhF4dghn4CwIAJn50bOiTVNdg",
  authDomain: "ruls-dbd-builds.firebaseapp.com",
  projectId: "ruls-dbd-builds",
  storageBucket: "ruls-dbd-builds.firebasestorage.app",
  messagingSenderId: "5191879031",
  appId: "1:5191879031:web:f57c9441f4b22066403972"
});

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false
});

export const ADMINS = "admins";
export const USERS = "users";

export const KILLER_BUILDS = "killer-builds";
export const SURVIVOR_BUILDS = "survivor-builds";
export const SURVIVOR_GROUPS = "survivor-groups";

export const KILLER_PENDING = "killer-pending";
export const SURVIVOR_PENDING = "survivor-pending";
export const SURVIVOR_GROUPS_PENDING = "survivor-groups-pending";

export let authCheckError = "";

export async function isAuthorized(uid) {
  authCheckError = "";
  if (!uid) {
    authCheckError = "sin-uid";
    return false;
  }
  try {
    const snap = await getDoc(doc(db, ADMINS, uid));
    if (!snap.exists()) authCheckError = "no-existe";
    return snap.exists();
  } catch (e) {
    authCheckError = e.code || "error";
    return false;
  }
}

export function authErrorText(code) {
  switch (code) {
    case "auth/invalid-email":
      return "El correo electrónico no es válido.";
    case "auth/user-disabled":
      return "Esta cuenta ha sido deshabilitada.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Correo o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos fallidos. Inténtalo más tarde.";
    case "auth/popup-closed-by-user":
      return "Cerraste la ventana de inicio de sesión.";
    case "auth/account-exists-with-different-credential":
      return "Ya existe una cuenta con este correo usando otro método de acceso.";
    default:
      return "Ha ocurrido un error al iniciar sesión. Inténtalo de nuevo.";
  }
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
