import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, ADMINS, isAuthorized, authCheckError, authErrorText } from "./firebase.js";

const PAGES = ["gestion.html", "builder.html"];
const KNOWN_ERRORS = ["no-existe", "permission-denied", "sin-uid"];
const params = new URLSearchParams(location.search);
const next = PAGES.includes(params.get("next")) ? params.get("next") : "gestion.html";

const msg = document.getElementById("loginMsg");
const buttons = [document.getElementById("googleBtn")];

function errorText(code, uid) {
  const path = `${ADMINS}/${uid || "tu UID"}`;
  if (code === "no-existe") return `Tu cuenta no está autorizada. Para darle acceso hay que crear en Firestore el documento ${path}.`;
  if (code === "permission-denied") return `Firestore no deja leer ${path}. Revisa la regla de la colección ${ADMINS}.`;
  if (code === "sin-uid") return "No se pudo leer tu cuenta.";
  return "No se pudo comprobar si tu cuenta está autorizada.";
}

if (params.get("error") === "no-autorizado") {
  const code = params.get("motivo");
  msg.textContent = errorText(KNOWN_ERRORS.includes(code) ? code : "");
}

function createProvider() {
  const p = new GoogleAuthProvider();
  p.addScope("email");
  p.addScope("profile");
  p.setCustomParameters({ prompt: "select_account" });
  return p;
}

async function checkUser(user) {
  if (next === "builder.html") {
    window.location.replace(`./${next}`);
    return;
  }
  const uid = user.uid;
  if (await isAuthorized(uid)) {
    window.location.replace(`./${next}`);
    return;
  }
  const code = authCheckError;
  await signOut(auth);
  msg.textContent = errorText(code, uid);
  buttons.forEach((b) => (b.disabled = false));
}

async function handleAuth() {
  buttons.forEach((b) => (b.disabled = true));
  msg.textContent = "";
  try {
    const result = await signInWithPopup(auth, createProvider());
    await checkUser(result.user);
  } catch (e) {
    buttons.forEach((b) => (b.disabled = false));
    if (e.code === "auth/popup-blocked") {
      msg.textContent = "El navegador ha bloqueado la ventana de inicio de sesión. Permite las ventanas emergentes para esta web.";
    } else if (e.code === "auth/popup-closed-by-user") {
      msg.textContent = "Has cerrado la ventana antes de terminar.";
    } else {
      msg.textContent = e.code === "auth/account-exists-with-different-credential" ? "Ese correo ya entró antes con otro proveedor. Usa el mismo botón." : authErrorText(e.code);
    }
  }
}

const stopListening = onAuthStateChanged(auth, (user) => {
  stopListening();
  if (user) checkUser(user);
});

document.getElementById("googleBtn")?.addEventListener("click", () => handleAuth());
