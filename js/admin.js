import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, isAuthorized, authCheckError } from "./firebase.js";

const page = location.pathname.split("/").pop() || "gestion.html";
const loginUrl = (extra = "") => `./login.html?next=${encodeURIComponent(page)}${extra}`;

export function requireAdmin() {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, async (user) => {
      stop();
      if (!user) {
        window.location.replace(loginUrl());
        return;
      }
      const uid = user.uid;
      if (!(await isAuthorized(uid))) {
        console.error(`[ERROR] UID no autorizado en admins/${uid}`);
        await signOut(auth);
        window.location.replace(loginUrl(`&error=no-autorizado&motivo=${encodeURIComponent(authCheckError)}`));
        return;
      }
      const emailEl = document.getElementById("userEmail");
      if (emailEl) emailEl.textContent = user.displayName || user.email || uid;
      const loadingEl = document.getElementById("loading");
      if (loadingEl) loadingEl.hidden = true;
      const editorView = document.getElementById("editorView");
      if (editorView) editorView.hidden = false;
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
          await signOut(auth);
          window.location.replace("./login.html");
        });
      }
      resolve(uid);
    });
  });
}
