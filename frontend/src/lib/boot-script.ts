/**
 * Inline script for <head>: applies the saved theme and language before the
 * first paint, so there is no flash of the wrong theme. It lives in a plain
 * module (not "use client") so the server layout receives the actual text.
 */
import { STORAGE_KEYS } from "@/lib/storage";

const theme = `try{var t=localStorage.getItem("${STORAGE_KEYS.theme}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;
const locale = `try{var l=localStorage.getItem("${STORAGE_KEYS.locale}");if(l==="en"||l==="so")document.documentElement.lang=l}catch(e){}`;

export const BOOT_SCRIPT = `(function(){${theme};${locale}})();`;
