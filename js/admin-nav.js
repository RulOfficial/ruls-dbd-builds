import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { auth, isAuthorized } from "./firebase.js";

const nav = document.querySelector(".topnav");

function showManagementLink() {
  if (!nav || nav.querySelector('a[href="gestion.html"]')) return;
  const link = document.createElement("a");
  link.href = "gestion.html";
  link.textContent = "Management";
  nav.appendChild(link);
}

onAuthStateChanged(auth, async (user) => {
  if (user && await isAuthorized(user.uid)) showManagementLink();
});
